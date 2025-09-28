import { useCallback, useMemo, useRef, useState } from 'react';
import type { TtsSynthesisRequest, TtsSynthesisResponse, TtsVoicesResponse } from '../../../shared/types';
import { requestStorySpeech, fetchTtsVoices } from '../utils/api';

export type TtsStatus = 'idle' | 'loading' | 'ready' | 'error';

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

  return useMemo(() => ({
    status,
    audioMeta,
    error,
    synthesize,
    getCachedResult,
    listVoices,
    lastRequestKey,
  }), [audioMeta, error, getCachedResult, lastRequestKey, listVoices, status, synthesize]);
}

export default useStoryTts;
