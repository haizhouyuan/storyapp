import { useCallback, useMemo, useRef, useState } from 'react';
import type {
  StoryTtsBatchResponse,
  StoryTtsBatchStatusResponse,
  StoryTtsSegment,
  TtsSynthesisRequest,
  TtsSynthesisResponse,
  TtsVoicesResponse,
} from '../../../shared/types';
import { requestStorySpeech, fetchTtsVoices } from '../utils/api';

export type TtsStatus = 'idle' | 'loading' | 'ready' | 'error';

// 批量合成接口类型
export interface StoryTtsBatchRequest {
  storyId: string;
  fullText: string;
  chapterMarkers?: string[];
  voiceId?: string;
  speed?: number;
  sessionId?: string;
}

interface UseStoryTtsOptions {
  sessionId?: string;
  defaultVoiceId?: string;
  defaultSpeed?: number;
  defaultPitch?: number;
}

interface CachedTtsResult {
  response: TtsSynthesisResponse;
  expiresAt: number;
}

interface UseStoryTtsResult {
  status: TtsStatus;
  audioMeta?: TtsSynthesisResponse;
  error?: string;
  synthesize: (payload: TtsSynthesisRequest) => Promise<TtsSynthesisResponse>;
  synthesizeStory: (payload: StoryTtsBatchRequest) => Promise<StoryTtsBatchResponse>;
  getCachedResult: (payload: TtsSynthesisRequest) => TtsSynthesisResponse | undefined;
  listVoices: () => Promise<TtsVoicesResponse>;
  lastRequestKey?: string;
}

const toCacheKey = (payload: TtsSynthesisRequest): string => {
  return JSON.stringify({
    text: payload.text,
    voiceId: payload.voiceId,
    speed: payload.speed,
    pitch: payload.pitch,
    format: payload.format,
  });
};

const DEFAULT_STATUS_POLL_INTERVAL_MS = 3000;
const MAX_STATUS_POLL_ATTEMPTS = 200;
const STATUS_POLL_BACKOFF_FACTOR = 1.5;
const STATUS_POLL_MAX_INTERVAL_MS = 15000;
const STATUS_POLL_MIN_INTERVAL_MS = 1000;

const waitFor = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const API_BASE = (process.env.REACT_APP_API_URL || '').replace(/\/$/, '');
const buildApiUrl = (path: string): string => {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  if (!API_BASE) {
    return `/api${normalized}`;
  }
  return `${API_BASE}${normalized}`;
};

export function useStoryTts(options: UseStoryTtsOptions = {}): UseStoryTtsResult {
  const [status, setStatus] = useState<TtsStatus>('idle');
  const [error, setError] = useState<string | undefined>();
  const [audioMeta, setAudioMeta] = useState<TtsSynthesisResponse | undefined>();
  const [lastRequestKey, setLastRequestKey] = useState<string | undefined>();
  const cacheRef = useRef<Map<string, CachedTtsResult>>(new Map());

  const getCachedResult = useCallback((payload: TtsSynthesisRequest) => {
    const key = toCacheKey(payload);
    const cached = cacheRef.current.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.response;
    }
    if (cached) {
      cacheRef.current.delete(key);
    }
    return undefined;
  }, []);

  const synthesize = useCallback(async (payload: TtsSynthesisRequest) => {
    const requestPayload: TtsSynthesisRequest = {
      format: 'mp3',
      speed: options.defaultSpeed,
      pitch: options.defaultPitch,
      voiceId: options.defaultVoiceId,
      sessionId: options.sessionId,
      ...payload,
    };

    const cacheKey = toCacheKey(requestPayload);
    setLastRequestKey(cacheKey);

    const cached = cacheRef.current.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      setAudioMeta({ ...cached.response, cached: true });
      setStatus('ready');
      setError(undefined);
      return { ...cached.response, cached: true };
    }

    try {
      setStatus('loading');
      setError(undefined);
      const response = await requestStorySpeech(requestPayload);

      if (!response.success) {
        throw new Error(response.error || '语音合成失败');
      }

      const expiresIn = response.expiresIn ?? 0;
      const cacheEntry: CachedTtsResult = {
        response,
        expiresAt: Date.now() + expiresIn * 1000,
      };

      cacheRef.current.set(cacheKey, cacheEntry);

      setAudioMeta({ ...response });
      setStatus('ready');
      return response;
    } catch (err: any) {
      setStatus('error');
      const message = err?.message || '语音合成失败';
      setError(message);
      throw err;
    }
  }, [options.defaultPitch, options.defaultSpeed, options.defaultVoiceId, options.sessionId]);

  const listVoices = useCallback(async () => {
    try {
      const response = await fetchTtsVoices();
      return response;
    } catch (err) {
      setError('获取语音列表失败');
      throw err;
    }
  }, []);

  const pollStoryStatus = useCallback(async (
    storyKey: string,
    initialDelay?: number,
  ): Promise<StoryTtsBatchResponse> => {
    let attempt = 0;
    let delayMs = Math.max(initialDelay ?? DEFAULT_STATUS_POLL_INTERVAL_MS, STATUS_POLL_MIN_INTERVAL_MS);

    while (attempt < MAX_STATUS_POLL_ATTEMPTS) {
      if (attempt > 0) {
        await waitFor(delayMs);
      }

      let statusResponse: Response;
      try {
        statusResponse = await fetch(
          buildApiUrl(`/tts/synthesize-story/status/${encodeURIComponent(storyKey)}`),
        );
      } catch (networkError) {
        attempt += 1;
        delayMs = Math.min(delayMs * STATUS_POLL_BACKOFF_FACTOR, STATUS_POLL_MAX_INTERVAL_MS);
        continue;
      }

      if (statusResponse.status === 404) {
        attempt += 1;
        delayMs = Math.min(delayMs * STATUS_POLL_BACKOFF_FACTOR, STATUS_POLL_MAX_INTERVAL_MS);
        continue;
      }

      if (statusResponse.status === 429) {
        let retryAfterMs =
          (Number(statusResponse.headers.get('Retry-After')) || 0) * 1000;
        if (!retryAfterMs) {
          try {
            const retryPayload = await statusResponse.json() as { retryAfter?: number };
            if (typeof retryPayload?.retryAfter === 'number') {
              retryAfterMs = retryPayload.retryAfter * 1000;
            }
          } catch {
            // ignore json parse errors for 429 payload
          }
        }
        if (!retryAfterMs) {
          retryAfterMs = delayMs * STATUS_POLL_BACKOFF_FACTOR;
        }
        delayMs = Math.min(
          Math.max(retryAfterMs, STATUS_POLL_MIN_INTERVAL_MS),
          STATUS_POLL_MAX_INTERVAL_MS,
        );
        attempt += 1;
        continue;
      }

      let rawData: any;
      try {
        rawData = await statusResponse.json();
      } catch (parseError) {
        attempt += 1;
        delayMs = Math.min(delayMs * STATUS_POLL_BACKOFF_FACTOR, STATUS_POLL_MAX_INTERVAL_MS);
        continue;
      }

      if (!statusResponse.ok) {
        const message = typeof rawData?.error === 'string' ? rawData.error : '故事合成失败';
        throw new Error(message);
      }

      const statusData = rawData as StoryTtsBatchStatusResponse;

      if (statusData.status === 'ready') {
        const result: StoryTtsBatchResponse = {
          success: true,
          storyId: statusData.storyId,
          totalSegments: statusData.totalSegments,
          successCount: statusData.successCount,
          totalDuration: statusData.totalDuration,
          segments: (statusData.segments ?? []) as StoryTtsSegment[],
          error: statusData.error,
        };
        setStatus('ready');
        setError(undefined);
        return result;
      }

      if (statusData.status === 'error') {
        throw new Error(statusData.error || '朗读合成失败');
      }

      const suggestedNext = statusData.nextPollInMs ?? delayMs;
      delayMs = Math.min(
        Math.max(suggestedNext, delayMs * STATUS_POLL_BACKOFF_FACTOR),
        STATUS_POLL_MAX_INTERVAL_MS,
      );
      attempt += 1;
    }

    throw new Error('朗读任务处理中，请稍后在页面中刷新状态再试');
  }, [setError, setStatus]);

  const synthesizeStory = useCallback(async (payload: StoryTtsBatchRequest) => {
    try {
      setStatus('loading');
      setError(undefined);

      const response = await fetch(buildApiUrl('/tts/synthesize-story'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...payload,
          sessionId: payload.sessionId || options.sessionId,
          voiceId: payload.voiceId || options.defaultVoiceId,
          speed: payload.speed || options.defaultSpeed,
        }),
      });

      if (response.status === 404) {
        const message = '朗读服务暂未配置，请稍后再试';
        const error = new Error(message);
        (error as any).code = 'TTS_NOT_AVAILABLE';
        throw error;
      }

      let data: StoryTtsBatchStatusResponse | StoryTtsBatchResponse | { success?: boolean; message?: string; error?: string; status?: string };
      try {
        data = await response.json();
      } catch {
        data = {};
      }

      const isPending = response.status === 202 || (data as StoryTtsBatchStatusResponse).status === 'pending';

      if (isPending) {
        const pending = data as StoryTtsBatchStatusResponse;
        const storyKey = pending.storyId || payload.storyId;
        if (!storyKey) {
          throw new Error('朗读任务缺少标识，请稍后重试');
        }
        const pollInterval = pending.nextPollInMs ?? DEFAULT_STATUS_POLL_INTERVAL_MS;
        return await pollStoryStatus(storyKey, pollInterval);
      }

      if (!response.ok) {
        const message =
          (data as any)?.message || (data as any)?.error || '故事合成失败';
        const error = new Error(message);
        (error as any).code = (data as any)?.error;
        throw error;
      }

      const readyData = data as StoryTtsBatchResponse;

      if (!readyData.success) {
        const message = readyData.error || '故事合成失败';
        const error = new Error(message);
        (error as any).code = readyData.error;
        throw error;
      }

      setStatus('ready');
      return readyData;
    } catch (err: any) {
      setStatus('error');
      const message = err?.message || '故事合成失败';
      setError(message);
      throw err;
    }
  }, [options.sessionId, options.defaultVoiceId, options.defaultSpeed, pollStoryStatus]);

  return useMemo(() => ({
    status,
    audioMeta,
    error,
    synthesize,
    synthesizeStory,
    getCachedResult,
    listVoices,
    lastRequestKey,
  }), [audioMeta, error, getCachedResult, lastRequestKey, listVoices, status, synthesize, synthesizeStory]);
}

export default useStoryTts;

export type { StoryTtsBatchResponse };
