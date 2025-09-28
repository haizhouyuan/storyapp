import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export type AudioPlaybackStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'ended' | 'error';

interface UseStoryAudioOptions {
  autoCleanup?: boolean;
  onEnded?: () => void;
}

interface UseStoryAudioResult {
  status: AudioPlaybackStatus;
  progress: number;
  currentTime: number;
  duration: number;
  error?: string;
  isOffline: boolean;
  play: () => Promise<void>;
  pause: () => void;
  stop: () => void;
  toggle: () => Promise<void>;
  setSource: (audioUrl: string, autoPlay?: boolean) => Promise<void>;
  setPlaybackRate: (rate: number) => void;
  setVolume: (volume: number) => void;
}

export function useStoryAudio(options: UseStoryAudioOptions = {}): UseStoryAudioResult {
  const { autoCleanup = false, onEnded } = options;
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [status, setStatus] = useState<AudioPlaybackStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [error, setError] = useState<string | undefined>();
  const [isOffline, setIsOffline] = useState<boolean>(!navigator.onLine);

  const ensureAudio = useCallback(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.preload = 'auto';
      audioRef.current.crossOrigin = 'anonymous';
    }
    return audioRef.current;
  }, []);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    const audio = ensureAudio();

    const handleCanPlay = () => {
      setDuration(audio.duration || 0);
      setStatus((prev) => (prev === 'loading' ? 'paused' : prev));
    };

    const handlePlaying = () => {
      setStatus('playing');
      setError(undefined);
    };

    const handlePause = () => {
      if (!audio.ended) {
        setStatus('paused');
      }
    };

    const handleEnded = () => {
      setStatus('ended');
      onEnded?.();
    };

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      if (audio.duration > 0) {
        setProgress(audio.currentTime / audio.duration);
      }
    };

    const handleError = () => {
      setStatus('error');
      setError('音频播放失败，稍后再试');
    };

    audio.addEventListener('canplay', handleCanPlay);
    audio.addEventListener('playing', handlePlaying);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('error', handleError);

    return () => {
      audio.removeEventListener('canplay', handleCanPlay);
      audio.removeEventListener('playing', handlePlaying);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('error', handleError);
      if (autoCleanup) {
        audio.pause();
        audio.src = '';
        audio.load();
      }
    };
  }, [ensureAudio, autoCleanup, onEnded]);

  const play = useCallback(async () => {
    const audio = ensureAudio();
    try {
      setStatus('loading');
      await audio.play();
    } catch (err: any) {
      setStatus('error');
      setError(err?.message || '浏览器阻止自动播放，请手动点击播放按钮');
      throw err;
    }
  }, [ensureAudio]);

  const pause = useCallback(() => {
    const audio = ensureAudio();
    audio.pause();
  }, [ensureAudio]);

  const stop = useCallback(() => {
    const audio = ensureAudio();
    audio.pause();
    audio.currentTime = 0;
    setStatus('paused');
  }, [ensureAudio]);

  const toggle = useCallback(async () => {
    const audio = ensureAudio();
    if (audio.paused || audio.ended) {
      await play();
    } else {
      pause();
    }
  }, [ensureAudio, pause, play]);

  const setSource = useCallback(async (audioUrl: string, autoPlay: boolean = false) => {
    const audio = ensureAudio();
    if (!audioUrl) {
      setError('缺少音频资源');
      setStatus('error');
      return;
    }
    if (audio.src !== audioUrl) {
      setStatus('loading');
      setError(undefined);
      audio.src = audioUrl;
      try {
        audio.load();
      } catch (err) {
        setStatus('error');
        setError('音频资源加载失败');
        return;
      }
    }
    if (autoPlay) {
      await play();
    }
  }, [ensureAudio, play]);

  const setPlaybackRate = useCallback((rate: number) => {
    const audio = ensureAudio();
    audio.playbackRate = Math.min(Math.max(rate, 0.5), 2);
  }, [ensureAudio]);

  const setVolume = useCallback((volume: number) => {
    const audio = ensureAudio();
    audio.volume = Math.min(Math.max(volume, 0), 1);
  }, [ensureAudio]);

  return useMemo(() => ({
    status,
    progress,
    currentTime,
    duration,
    error,
    isOffline,
    play,
    pause,
    stop,
    toggle,
    setSource,
    setPlaybackRate,
    setVolume,
  }), [currentTime, duration, error, isOffline, pause, play, progress, setPlaybackRate, setSource, setVolume, status, stop, toggle]);
}

export default useStoryAudio;
