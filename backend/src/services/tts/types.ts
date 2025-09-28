import type { LogLevel } from '../../utils/logger';

export type TtsAudioFormat = 'mp3' | 'pcm';

export interface TtsSynthesisRequest {
  text: string;
  voiceId?: string;
  speed?: number;
  pitch?: number;
  format?: TtsAudioFormat;
  sessionId?: string;
  metadata?: Record<string, unknown>;
}

export type TtsSynthesisParams = TtsSynthesisRequest & {
  format?: TtsAudioFormat;
};

export interface TtsSynthesisResult {
  requestId: string;
  provider: string;
  audioUrl: string;
  expiresAt: number;
  format: TtsAudioFormat;
  durationMs?: number;
  checksum?: string;
  warnings?: string[];
  cached?: boolean;
}

export interface TtsProviderMetadata {
  name: string;
  version?: string;
  latency?: number;
  lastSyncedAt?: number;
}

export interface TtsProviderCapabilities {
  voices: Array<{
    id: string;
    name: string;
    language: string;
    gender?: 'male' | 'female' | 'child';
    description?: string;
  }>;
  speedRange: [number, number];
  pitchRange: [number, number];
  formats: TtsAudioFormat[];
  defaultVoice: string;
}

export interface TtsProviderConfig {
  cacheTtl: number;
  cacheDirectory?: string;
  audioBaseUrl?: string;
}

export interface TtsProviderContext {
  sessionId?: string;
  logLevel?: LogLevel;
}

export interface TtsProvider {
  readonly id: string;
  readonly metadata: TtsProviderMetadata;
  readonly capabilities: TtsProviderCapabilities;
  synthesize(params: TtsSynthesisParams, context?: TtsProviderContext): Promise<TtsSynthesisResult>;
  warmup?(): Promise<void>;
  shutdown?(): Promise<void>;
}

export interface TtsCacheEntry {
  key: string;
  result: TtsSynthesisResult;
}

export interface TtsCacheDriver {
  get(key: string): Promise<TtsCacheEntry | null>;
  set(entry: TtsCacheEntry, ttlMs: number): Promise<void>;
  delete(key: string): Promise<void>;
  cleanup?(now?: number): Promise<void>;
}

export interface TtsMetrics {
  incrementRequests(providerId: string, cached: boolean): void;
  observeLatency(providerId: string, durationMs: number): void;
  incrementErrors(providerId: string, reason: string): void;
}

export interface TtsManagerOptions {
  cacheTtlMs: number;
  cacheDriver: TtsCacheDriver;
  metrics?: TtsMetrics;
}
