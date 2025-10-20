import path from 'path';
import { InMemoryTtsCache } from './cache';
import { TtsManager } from './ttsManager';
import type { TtsManagerOptions, TtsProvider } from './types';
import { MockTtsProvider } from './providers/mockTtsProvider';
import { AlicloudTtsProvider } from './providers/alicloudTtsProvider';
import { IflytekTtsProvider } from './providers/iflytekTtsProvider';
import { ttsMetrics, ttsProviderUp } from '../../config/metrics';
import { createLogger } from '../../config/logger';

const DEFAULT_TTL_MS = parseInt(process.env.TTS_CACHE_TTL || '300', 10) * 1000;
const factoryLogger = createLogger('services:ttsFactory');

const providers: Record<string, () => TtsProvider> = {
  mock: () => new MockTtsProvider(),
  alicloud: () => new AlicloudTtsProvider(),
  iflytek: () => new IflytekTtsProvider(),
};

let manager: TtsManager | null = null;

export const createTtsManager = (): TtsManager => {
  if (manager) {
    return manager;
  }

  const hasIflytekCredentials = Boolean(
    process.env.IFLYTEK_TTS_APP_ID
    && process.env.IFLYTEK_TTS_API_KEY
    && process.env.IFLYTEK_TTS_API_SECRET
  );

  const providerPreference = (process.env.TTS_PROVIDER || (hasIflytekCredentials ? 'iflytek' : 'mock')).toLowerCase();

  let selectedProviderId = providerPreference;
  if (providerPreference === 'iflytek' && !hasIflytekCredentials) {
    factoryLogger.warn({
      appIdConfigured: Boolean(process.env.IFLYTEK_TTS_APP_ID),
      apiKeyConfigured: Boolean(process.env.IFLYTEK_TTS_API_KEY),
      apiSecretConfigured: Boolean(process.env.IFLYTEK_TTS_API_SECRET),
    }, 'IFLYTEK 凭证缺失，自动回退到 Mock TTS');
    selectedProviderId = 'mock';
  } else if (!providers[providerPreference]) {
    factoryLogger.warn({ providerPreference }, '未知的 TTS provider，自动回退到 Mock TTS');
    selectedProviderId = 'mock';
  }

  let providerFactory = providers[selectedProviderId] || providers.mock;
  let provider: TtsProvider;

  try {
    provider = providerFactory();
  } catch (error: any) {
    factoryLogger.error({ err: error, provider: selectedProviderId }, '初始化 TTS provider 失败，自动回退到 Mock TTS');
    providerFactory = providers.mock;
    provider = providerFactory();
    selectedProviderId = 'mock';
  }

  if (selectedProviderId !== 'iflytek') {
    ttsProviderUp.set({ provider: 'iflytek' }, 0);
  }

  ttsProviderUp.set({ provider: selectedProviderId }, 1);
  factoryLogger.info({
    provider: selectedProviderId,
    hasIflytekCredentials,
  }, 'TTS manager 初始化完成');

  const options: Partial<TtsManagerOptions> = {
    cacheDriver: new InMemoryTtsCache(),
    cacheTtlMs: DEFAULT_TTL_MS,
    metrics: ttsMetrics,
  };

  if (process.env.TTS_AUDIO_OUTPUT_DIR) {
    options.audioOutputDir = path.resolve(process.cwd(), process.env.TTS_AUDIO_OUTPUT_DIR);
  }

  if (process.env.TTS_AUDIO_BASE_URL) {
    options.audioBaseUrl = process.env.TTS_AUDIO_BASE_URL;
  }

  if (process.env.TTS_AUDIO_DOWNLOAD_TIMEOUT_MS) {
    const parsed = parseInt(process.env.TTS_AUDIO_DOWNLOAD_TIMEOUT_MS, 10);
    if (!Number.isNaN(parsed)) {
      options.audioDownloadTimeoutMs = parsed;
    }
  }

  manager = new TtsManager(provider, options);
  return manager;
};
