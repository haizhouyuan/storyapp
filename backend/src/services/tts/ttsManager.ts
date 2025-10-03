import { InMemoryTtsCache, getCacheKey, recordCacheMetrics } from './cache';
import type {
  TtsManagerOptions,
  TtsProvider,
  TtsProviderContext,
  TtsSynthesisParams,
  TtsSynthesisResult
} from './types';
import { logError, logInfo, LogLevel, EventType } from '../../utils/logger';

export class TtsManager {
  private readonly provider: TtsProvider;
  private readonly cacheTtlMs: number;
  private readonly cacheDriver: TtsManagerOptions['cacheDriver'];
  private readonly metrics?: TtsManagerOptions['metrics'];

  constructor(provider: TtsProvider, options: Partial<TtsManagerOptions> = {}) {
    this.provider = provider;
    this.cacheTtlMs = options.cacheTtlMs ?? 5 * 60 * 1000;
    this.cacheDriver = options.cacheDriver ?? new InMemoryTtsCache();
    this.metrics = options.metrics;
  }

  getProviderId(): string {
    return this.provider.id;
  }

  getCapabilities() {
    return this.provider.capabilities;
  }

  getMetadata() {
    return this.provider.metadata;
  }

  async synthesize(params: TtsSynthesisParams, context?: TtsProviderContext): Promise<TtsSynthesisResult> {
    const safeParams: TtsSynthesisParams = {
      ...params,
      text: params.text.trim(),
      voiceId: params.voiceId || this.provider.capabilities.defaultVoice,
      speed: params.speed ?? 1,
      pitch: params.pitch ?? 1,
      format: params.format || 'mp3'
    };

    if (!safeParams.text) {
      throw new Error('文本内容不能为空');
    }

    const cacheKey = getCacheKey(safeParams);
    const sessionId = context?.sessionId;

    logInfo(EventType.TTS_REQUEST_RECEIVED, '收到 TTS 合成请求', {
      provider: this.provider.id,
      voiceId: safeParams.voiceId,
      textLength: safeParams.text.length,
      speed: safeParams.speed,
      pitch: safeParams.pitch,
      format: safeParams.format,
      cacheKey
    }, undefined, sessionId);

    const cachedEntry = await this.cacheDriver.get(cacheKey);
    if (cachedEntry) {
      logInfo(EventType.TTS_CACHE_HIT, 'TTS 缓存命中', {
        provider: this.provider.id,
        requestId: cachedEntry.result.requestId,
      }, undefined, sessionId);
      recordCacheMetrics(this.metrics, this.provider.id, true);
      return {
        ...cachedEntry.result,
        cached: true,
      };
    }

    const start = Date.now();

    try {
      const result = await this.provider.synthesize(safeParams, {
        sessionId,
        logLevel: context?.logLevel ?? LogLevel.INFO,
      });

      // 测试环境安全阀：防止 Jest 期间触发真实 HTTP 下载。
      if (this.shouldBlockTestHttpDownload(result.audioUrl)) {
        throw new Error(
          'TEST_HTTP_BLOCK: 测试环境禁止下载 http(s) 音频；请 mock axios，或设置 TTS_TEST_ALLOW_HTTP_DOWNLOAD=1 明确允许。'
        );
      }
      const duration = Date.now() - start;

      recordCacheMetrics(this.metrics, this.provider.id, false, duration);

      logInfo(EventType.TTS_PROVIDER_RESPONSE, 'TTS Provider 返回结果', {
        provider: this.provider.id,
        requestId: result.requestId,
        duration,
        cached: false,
        expiresAt: result.expiresAt,
      }, {
        startTime: start,
        endTime: start + duration,
        duration
      }, sessionId);

      await this.cacheDriver.set({ key: cacheKey, result }, this.cacheTtlMs);

      return {
        ...result,
        cached: false,
      };
    } catch (error: any) {
      recordCacheMetrics(this.metrics, this.provider.id, false);
      this.metrics?.incrementErrors(this.provider.id, error?.code || error?.name || 'unknown');
      logError(EventType.TTS_ERROR, 'TTS 合成失败', error, {
        provider: this.provider.id,
        cacheKey,
      }, sessionId);
      throw error;
    }
  }

  private shouldBlockTestHttpDownload(audioUrl: string): boolean {
    if (process.env.NODE_ENV !== 'test') {
      return false;
    }
    if (process.env.TTS_TEST_ALLOW_HTTP_DOWNLOAD === '1') {
      return false;
    }
    return /^https?:\/\//i.test(audioUrl);
  }
}

export default TtsManager;
