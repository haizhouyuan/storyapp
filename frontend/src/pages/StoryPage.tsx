import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { HomeIcon, SpeakerWaveIcon, SparklesIcon, Cog6ToothIcon, PauseIcon } from '@heroicons/react/24/outline';
import { toast } from 'react-hot-toast';

import Button from '../components/Button';
import LoadingSpinner from '../components/LoadingSpinner';
import { generateStory } from '../utils/api';
import { getRandomEncouragement } from '../utils/helpers';
import { PointsBadge, PointsPageShell, PointsProgress, PointsSection } from '../components/points';
import type { StorySession } from '../../../shared/types';
import { useAudioPreferences } from '../context/AudioPreferencesContext';
import useStoryAudio from '../hooks/useStoryAudio';
import useStoryTts from '../hooks/useStoryTts';
import AudioSettingsModal from '../components/AudioSettingsModal';

interface StoryPageProps {
  storySession: StorySession | null;
  onUpdateSession: (session: StorySession) => void;
}

export default function StoryPage({ storySession, onUpdateSession }: StoryPageProps) {
  const [currentSegment, setCurrentSegment] = useState('');
  const [currentChoices, setCurrentChoices] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const navigate = useNavigate();
  const { preferences } = useAudioPreferences();
  const sessionId = useMemo(
    () => storySession?.sessionId || `${storySession?.topic || 'story'}-${storySession?.startTime || Date.now()}`,
    [storySession?.sessionId, storySession?.startTime, storySession?.topic]
  );

  const tts = useStoryTts({
    sessionId,
    defaultVoiceId: preferences.voiceId,
    defaultSpeed: preferences.speechSpeed,
    defaultPitch: preferences.speechPitch,
  });

  const audioPlayer = useStoryAudio({
    onEnded: () => {
      if (preferences.autoPlay) {
        toast('本段朗读完成啦', { icon: '🎵', duration: 1500 });
      }
    },
  });
  const lastSynthKeyRef = useRef<string | null>(null);
  const {
    status: audioStatus,
    error: audioPlayerError,
    isOffline: audioOffline,
    setSource: setAudioSource,
    setPlaybackRate,
    setVolume,
    pause: pauseAudio,
  } = audioPlayer;

  const interactionCount = useMemo(
    () => (storySession ? storySession.path.filter((item) => Boolean(item.choice)).length : 0),
    [storySession],
  );

  const isAudioLoading = isSynthesizing || tts.status === 'loading' || audioStatus === 'loading';
  const isAudioPlaying = audioStatus === 'playing';
  const audioButtonDisabled = isAudioLoading || audioOffline || !currentSegment || !hasStarted;

  const buildTtsRequest = useCallback(() => {
    if (!currentSegment) return null;
    return {
      text: currentSegment,
      voiceId: preferences.voiceId,
      speed: preferences.speechSpeed,
      pitch: preferences.speechPitch,
      sessionId,
    };
  }, [currentSegment, preferences.speechPitch, preferences.speechSpeed, preferences.voiceId, sessionId]);

  const triggerSynthesis = useCallback(async (autoPlayPreferred: boolean) => {
    const payload = buildTtsRequest();
    if (!payload) {
      toast.error('暂无可朗读的内容');
      return;
    }

    const shouldAutoPlay = autoPlayPreferred && !preferences.mute;

    setIsSynthesizing(true);
    setAudioError(null);

    try {
      const response = await tts.synthesize(payload);
      if (!response.audioUrl) {
        throw new Error('语音合成服务未返回音频地址');
      }

      await setAudioSource(response.audioUrl, shouldAutoPlay);
      setPlaybackRate(preferences.speechSpeed);
      setVolume(preferences.mute ? 0 : 1);
      if (preferences.mute) {
        pauseAudio();
      }

      lastSynthKeyRef.current = tts.lastRequestKey || JSON.stringify(payload);
    } catch (err: any) {
      const message = err?.message || '语音播放失败，请稍后再试';
      setAudioError(message);
      toast.error(message);
    } finally {
      setIsSynthesizing(false);
    }
  }, [buildTtsRequest, pauseAudio, preferences.mute, preferences.speechSpeed, setAudioSource, setPlaybackRate, setVolume, tts]);


  const generateFirstSegment = useCallback(async () => {
    if (!storySession) return;

    setIsLoading(true);
    try {
      const response = await generateStory({
        topic: storySession.topic,
        turnIndex: 0,
        maxChoices: storySession.maxChoices,
        forceEnding: false,
      });

      setCurrentSegment(response.storySegment);
      setCurrentChoices(response.choices);
      setHasStarted(true);

      const updatedSession: StorySession = {
        ...storySession,
        path: [
          {
            segment: response.storySegment,
            timestamp: Date.now(),
          },
        ],
      };
      onUpdateSession(updatedSession);

      if (response.isEnding) {
        setTimeout(() => {
          const completedSession = { ...updatedSession, isComplete: true };
          onUpdateSession(completedSession);
          navigate('/end');
        }, 2000);
      }
    } catch (error: any) {
      console.error('生成故事失败:', error);
      toast.error(error.message || '故事生成失败，请返回重试');
    } finally {
      setIsLoading(false);
    }
  }, [storySession, navigate, onUpdateSession]);

  useEffect(() => {
    if (!storySession) {
      navigate('/');
      return;
    }

    if (storySession.isComplete) {
      navigate('/end');
      return;
    }

    if (storySession.path.length === 0) {
      generateFirstSegment();
    } else {
      const lastPath = storySession.path[storySession.path.length - 1];
      setCurrentSegment(lastPath.segment);
      setHasStarted(true);
    }
  }, [storySession, generateFirstSegment, navigate]);

  useEffect(() => {
    if (!hasStarted) return;
    const payload = buildTtsRequest();
    if (!payload) return;
    const key = JSON.stringify(payload);
    if (!preferences.autoPlay || preferences.mute) {
      return;
    }
    if (lastSynthKeyRef.current === key) {
      return;
    }
    lastSynthKeyRef.current = key;
    triggerSynthesis(true).catch((error) => {
      console.error('自动朗读失败', error);
    });
  }, [buildTtsRequest, hasStarted, preferences.autoPlay, preferences.mute, triggerSynthesis]);

  useEffect(() => {
    setVolume(preferences.mute ? 0 : 1);
    setPlaybackRate(preferences.speechSpeed);
  }, [preferences.mute, preferences.speechSpeed, setPlaybackRate, setVolume]);

  const handleChoice = async (choice: string) => {
    if (!storySession || isLoading) return;

    const previousChoices = currentChoices;
    setIsLoading(true);
    setCurrentChoices([]);

    try {
      const currentStory = storySession.path.map((item) => item.segment).join('\n\n');
      const choicesMade = storySession.path.filter((item) => item.choice).length;
      const nextTurnIndex = choicesMade;
      const willForceEnd = nextTurnIndex + 1 >= storySession.maxChoices;

      const response = await generateStory({
        topic: storySession.topic,
        currentStory,
        selectedChoice: choice,
        turnIndex: nextTurnIndex,
        maxChoices: storySession.maxChoices,
        forceEnding: willForceEnd,
      });

      setCurrentSegment(response.storySegment);

      const updatedPath = [
        ...storySession.path.slice(0, -1),
        {
          ...storySession.path[storySession.path.length - 1],
          choice,
        },
        {
          segment: response.storySegment,
          timestamp: Date.now(),
        },
      ];

      if (response.isEnding) {
        const updatedSession: StorySession = {
          ...storySession,
          path: updatedPath,
          isComplete: true,
        };

        onUpdateSession(updatedSession);

        setTimeout(() => {
          navigate('/end');
        }, 2500);

        toast.success('故事完成了！', { icon: '🎉' });
      } else {
        setCurrentChoices(response.choices);

        const updatedSession: StorySession = {
          ...storySession,
          path: updatedPath,
        };

        onUpdateSession(updatedSession);
        toast.success(getRandomEncouragement(), { duration: 2000, icon: '⭐' });
      }
    } catch (error: any) {
      console.error('生成故事片段失败:', error);
      toast.error(error.message || '故事继续失败，请重试');
      setCurrentChoices(previousChoices);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoHome = () => {
    navigate('/');
  };

  const handlePlayAudio = useCallback(async () => {
    if (isSynthesizing) return;
    if (audioOffline) {
      toast.error('当前网络不可用，暂时无法播放语音');
      return;
    }
    await triggerSynthesis(true);
  }, [audioOffline, isSynthesizing, triggerSynthesis]);

  if (!storySession) {
    return null;
  }

  return (
    <PointsPageShell
      backgroundVariant="hud"
      maxWidth="2xl"
      topBar={
        <>
          <div className="flex items-center gap-2 text-sm text-points-text-muted">
            <SparklesIcon className="h-5 w-5 text-points-primary" />
            <span>互动故事 · 实时生成</span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={() => setIsSettingsOpen(true)}
              variant="ghost"
              size="small"
              icon={<Cog6ToothIcon className="h-5 w-5" />}
              className="shadow-none"
            >
              语音设置
            </Button>
            <Button
              onClick={handleGoHome}
              variant="ghost"
              size="small"
              icon={<HomeIcon className="h-5 w-5" />}
              className="shadow-none"
              testId="home-button"
            >
              返回首页
            </Button>
          </div>
        </>
      }
      header={
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-3">
            <PointsBadge variant="neutral">当前主题</PointsBadge>
            <div>
              <h1 className="text-3xl font-semibold text-points-text-strong">{storySession.topic}</h1>
              <p className="mt-2 text-base text-points-text-muted">
                跟随孩子的选择一步步生成故事，陪伴 TA 完成今晚的冒险旅程。
              </p>
            </div>
          </div>
          <div className="w-full max-w-xs space-y-3 sm:w-auto">
            <PointsProgress
              value={interactionCount}
              max={storySession.maxChoices}
              label="互动进度"
              icon={<SparklesIcon className="h-5 w-5" />}
            />
            <div className="text-xs text-points-text-muted">
              已完成 {interactionCount} / {storySession.maxChoices} 次互动
            </div>
          </div>
        </div>
      }
    >
      {isLoading && !hasStarted && (
        <div className="flex justify-center">
          <LoadingSpinner message="正在为你创作精彩的故事..." size="large" />
        </div>
      )}

      {hasStarted && (
        <PointsSection layout="card" className="relative overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentSegment}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ type: 'spring', stiffness: 120, damping: 18 }}
              className="space-y-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="text-sm font-medium uppercase tracking-wide text-points-text-muted">
                  最新章节
                </div>
                <button
                  type="button"
                  onClick={isAudioPlaying ? pauseAudio : handlePlayAudio}
                  className={`points-focus flex h-11 w-11 items-center justify-center rounded-full transition hover:scale-105 ${audioButtonDisabled ? 'cursor-not-allowed bg-gray-300 text-gray-500' : 'bg-points-secondary text-white shadow-points-soft'}`}
                  title={audioOffline ? '当前离线，无法播放' : isAudioPlaying ? '暂停朗读' : '播放朗读'}
                  aria-pressed={isAudioPlaying}
                  aria-busy={isAudioLoading}
                  disabled={audioButtonDisabled}
                >
                  {isAudioLoading ? (
                    <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/60 border-t-transparent" aria-hidden="true" />
                  ) : isAudioPlaying ? (
                    <PauseIcon className="h-5 w-5" />
                  ) : (
                    <SpeakerWaveIcon className="h-5 w-5" />
                  )}
                  <span className="sr-only">{isAudioPlaying ? '暂停朗读' : '播放朗读'}</span>
                </button>
              </div>

              {preferences.showTranscript ? (
                <div className="rounded-points-lg border border-points-border/50 bg-white/95 p-6 text-base leading-relaxed text-points-text shadow-inner whitespace-pre-wrap">
                  {currentSegment}
                </div>
              ) : (
                <div className="rounded-points-lg border border-dashed border-points-border/50 bg-white/70 p-6 text-sm text-points-text-muted">
                  字幕已隐藏，可在「语音播放设置」中重新开启。
                </div>
              )}
              {(audioError || audioPlayerError || audioOffline) && (
                <div className="text-xs text-red-500">
                  {audioOffline
                    ? '当前网络不可用，语音播放已暂停。'
                    : audioError || audioPlayerError}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </PointsSection>
      )}

      {hasStarted && currentChoices.length > 0 && !isLoading && (
        <PointsSection
          layout="card"
          title="接下来会发生什么呢？"
          description="根据孩子感兴趣的方向，选择一个选项继续冒险。"
        >
          <div className="grid gap-4">
            {currentChoices.map((choice, index) => (
              <motion.div
                key={`${choice}-${index}`}
                initial={{ opacity: 0, x: index % 2 === 0 ? -30 : 30 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.15 + index * 0.05, type: 'spring', stiffness: 200, damping: 20 }}
              >
                <Button
                  onClick={() => handleChoice(choice)}
                  variant={index === 0 ? 'primary' : index === 1 ? 'secondary' : 'accent'}
                  size="large"
                  className="w-full justify-start gap-4 text-left"
                  testId={`choice-button-${index}`}
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/30 text-lg font-semibold text-points-text-strong">
                    {index + 1}
                  </span>
                  <span className="text-base text-points-text-strong">{choice}</span>
                </Button>
              </motion.div>
            ))}
          </div>
        </PointsSection>
      )}

      {isLoading && hasStarted && (
        <div className="flex justify-center">
          <LoadingSpinner message="故事正在继续..." size="medium" />
        </div>
      )}

      <div className="rounded-points-lg border border-dashed border-points-border/50 bg-white/80 px-5 py-4 text-sm text-points-text-muted">
        温馨提示：可随时返回首页重新输入主题；平台会保存本次互动的进度，确保孩子的每次选择都被记录下来。
      </div>

      <AudioSettingsModal open={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
    </PointsPageShell>
  );
}
