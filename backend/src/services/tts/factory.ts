import path from 'path';
import { InMemoryTtsCache } from './cache';
import { TtsManager } from './ttsManager';
import type { TtsManagerOptions, TtsProvider } from './types';
import { MockTtsProvider } from './providers/mockTtsProvider';
import { AlicloudTtsProvider } from './providers/alicloudTtsProvider';
import { IflytekTtsProvider } from './providers/iflytekTtsProvider';
import { ttsMetrics } from '../../config/metrics';

const DEFAULT_TTL_MS = parseInt(process.env.TTS_CACHE_TTL || '300', 10) * 1000;

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

  const providerId = (process.env.TTS_PROVIDER || 'mock').toLowerCase();
  const providerFactory = providers[providerId] || providers.mock;
  const provider = providerFactory();

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
