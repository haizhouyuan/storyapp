import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { createHash } from 'crypto';
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
  private readonly audioOutputDir: string;
  private readonly audioBaseUrl: string;
  private readonly audioDownloadTimeoutMs: number;

  constructor(provider: TtsProvider, options: Partial<TtsManagerOptions> = {}) {
    this.provider = provider;
    this.cacheTtlMs = options.cacheTtlMs ?? 5 * 60 * 1000;
    this.cacheDriver = options.cacheDriver ?? new InMemoryTtsCache();
    this.metrics = options.metrics;
    const configuredOutputDir = options.audioOutputDir || process.env.TTS_AUDIO_OUTPUT_DIR;
    this.audioOutputDir = path.resolve(process.cwd(), configuredOutputDir || 'storage/tts');
    this.audioBaseUrl = this.normalizeBaseUrl(options.audioBaseUrl || process.env.TTS_AUDIO_BASE_URL || 'http://localhost:5001/static/tts');
    this.audioDownloadTimeoutMs = options.audioDownloadTimeoutMs ?? parseInt(process.env.TTS_AUDIO_DOWNLOAD_TIMEOUT_MS || '20000', 10);

    try {
      fs.mkdirSync(this.audioOutputDir, { recursive: true });
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      logError(EventType.TTS_ERROR, '创建 TTS 音频输出目录失败', err, {
        directory: this.audioOutputDir,
      }, undefined);
      throw new Error(`无法创建 TTS 音频输出目录: ${err?.message || err}`);
    }
  }

  private normalizeBaseUrl(baseUrl: string): string {
    return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
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
      const persistedResult = await this.persistSynthesisResult(cacheKey, safeParams, result, sessionId);

      recordCacheMetrics(this.metrics, this.provider.id, false, duration);

      logInfo(EventType.TTS_PROVIDER_RESPONSE, 'TTS Provider 返回结果', {
        provider: this.provider.id,
        requestId: persistedResult.requestId,
        duration,
        cached: false,
        expiresAt: persistedResult.expiresAt,
        audioUrl: persistedResult.audioUrl,
        checksum: persistedResult.checksum,
      }, {
        startTime: start,
        endTime: start + duration,
        duration
      }, sessionId);

      await this.cacheDriver.set({ key: cacheKey, result: persistedResult }, this.cacheTtlMs);

      return {
        ...persistedResult,
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

  private async persistSynthesisResult(
    cacheKey: string,
    params: TtsSynthesisParams,
    result: TtsSynthesisResult,
    sessionId?: string
  ): Promise<TtsSynthesisResult> {
    const format = params.format || result.format || 'mp3';
    const extension = format === 'pcm' ? 'pcm' : 'mp3';
    const fileName = `${cacheKey}.${extension}`;
    const filePath = path.join(this.audioOutputDir, fileName);

    let audioBuffer: Buffer;
    let wroteFile = false;

    if (await this.fileExists(filePath)) {
      audioBuffer = await fs.promises.readFile(filePath);
    } else {
      audioBuffer = await this.resolveAudioBuffer(result.audioUrl);
      await fs.promises.writeFile(filePath, audioBuffer);
      wroteFile = true;
      logInfo(EventType.TTS_PROVIDER_RESPONSE, 'TTS 音频已写入磁盘', {
        provider: this.provider.id,
        requestId: result.requestId,
        filePath,
        fileSize: audioBuffer.length,
      }, undefined, sessionId);
    }

    const checksum = createHash('sha256').update(audioBuffer).digest('hex');
    const cacheExpiry = Date.now() + this.cacheTtlMs;
    const expiresAt = Math.min(result.expiresAt || cacheExpiry, cacheExpiry);

    if (!wroteFile) {
      logInfo(EventType.TTS_PROVIDER_RESPONSE, '复用已有 TTS 音频文件', {
        provider: this.provider.id,
        requestId: result.requestId,
        filePath,
      }, undefined, sessionId);
    }

    return {
      ...result,
      audioUrl: this.buildAudioUrl(fileName),
      expiresAt,
      checksum,
    };
  }

  private async fileExists(targetPath: string): Promise<boolean> {
    try {
      await fs.promises.access(targetPath, fs.constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  private async resolveAudioBuffer(audioUrl: string): Promise<Buffer> {
    if (this.shouldBlockTestHttpDownload(audioUrl)) {
      throw new Error(
        'TEST_HTTP_BLOCK: 测试环境禁止下载 http(s) 音频，请 mock axios 或设置 TTS_TEST_ALLOW_HTTP_DOWNLOAD=1 明确允许'
      );
    }

    if (audioUrl.startsWith('data:')) {
      return this.decodeDataUrl(audioUrl);
    }

    if (/^https?:\/\//i.test(audioUrl)) {
      try {
        const response = await axios.get<ArrayBuffer>(audioUrl, {
          responseType: 'arraybuffer',
          timeout: this.audioDownloadTimeoutMs,
        });
        return Buffer.from(response.data);
      } catch (error: any) {
        const message = error?.message || '未知错误';
        throw new Error(`下载音频内容失败: ${message}`);
      }
    }

    if (audioUrl.startsWith('file://')) {
      const filePath = audioUrl.replace('file://', '');
      return fs.promises.readFile(filePath);
    }

    throw new Error('不支持的音频来源，无法下载音频内容');
  }

  private decodeDataUrl(dataUrl: string): Buffer {
    const match = dataUrl.match(/^data:audio\/[^;]+;base64,(.+)$/);
    if (!match || !match[1]) {
      throw new Error('无效的音频数据 URL');
    }
    return Buffer.from(match[1], 'base64');
  }

  private buildAudioUrl(fileName: string): string {
    return `${this.audioBaseUrl}/${fileName}`;
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
