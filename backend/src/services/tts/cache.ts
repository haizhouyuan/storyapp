import crypto from 'crypto';
import type { TtsCacheDriver, TtsCacheEntry, TtsMetrics, TtsSynthesisParams } from './types';

export class InMemoryTtsCache implements TtsCacheDriver {
  private store = new Map<string, { entry: TtsCacheEntry; expiresAt: number }>();

  async get(key: string): Promise<TtsCacheEntry | null> {
    const item = this.store.get(key);
    if (!item) {
      return null;
    }

    if (item.expiresAt <= Date.now()) {
      this.store.delete(key);
      return null;
    }

    return item.entry;
  }

  async set(entry: TtsCacheEntry, ttlMs: number): Promise<void> {
    this.store.set(entry.key, {
      entry,
      expiresAt: Date.now() + ttlMs
    });
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async cleanup(now: number = Date.now()): Promise<void> {
    for (const [key, value] of this.store.entries()) {
      if (value.expiresAt <= now) {
        this.store.delete(key);
      }
    }
  }
}

export const getCacheKey = (params: TtsSynthesisParams): string => {
  const hash = crypto.createHash('sha256');
  hash.update(params.text);
  hash.update('|voice:' + (params.voiceId || 'default'));
  hash.update('|speed:' + (typeof params.speed === 'number' ? params.speed.toFixed(2) : '1'));
  hash.update('|pitch:' + (typeof params.pitch === 'number' ? params.pitch.toFixed(2) : '1'));
  hash.update('|format:' + (params.format || 'mp3'));
  return hash.digest('hex');
};

export const recordCacheMetrics = (
  metrics: TtsMetrics | undefined,
  providerId: string,
  cached: boolean,
  durationMs?: number
) => {
  if (!metrics) return;
  metrics.incrementRequests(providerId, cached);
  if (typeof durationMs === 'number') {
    metrics.observeLatency(providerId, durationMs);
  }
};
