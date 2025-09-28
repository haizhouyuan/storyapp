import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import { HomeIcon, SpeakerWaveIcon, Squares2X2Icon, Cog6ToothIcon, PauseIcon } from '@heroicons/react/24/outline';
import { toast } from 'react-hot-toast';

import Button from '../components/Button';
import LoadingSpinner from '../components/LoadingSpinner';
import { generateFullStoryTree } from '../utils/api';
import { getRandomEncouragement } from '../utils/helpers';
import { PointsBadge, PointsPageShell, PointsProgress, PointsSection } from '../components/points';
import type { StoryTree, StoryTreeNode } from '../../../shared/types';
import { useAudioPreferences } from '../context/AudioPreferencesContext';
import useStoryAudio from '../hooks/useStoryAudio';
import useStoryTts from '../hooks/useStoryTts';
import AudioSettingsModal from '../components/AudioSettingsModal';

export default function StoryTreePage() {
  const [storyTree, setStoryTree] = useState<StoryTree | null>(null);
  const [currentNode, setCurrentNode] = useState<StoryTreeNode | null>(null);
  const [currentPath, setCurrentPath] = useState<number[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();
  const topic = location.state?.topic as string | undefined;

  const maxDepth = 3;

  const { preferences } = useAudioPreferences();
  const sessionId = useMemo(() => storyTree?.id || `tree-${topic || 'story'}`, [storyTree?.id, topic]);
  const tts = useStoryTts({
    sessionId,
    defaultVoiceId: preferences.voiceId,
    defaultSpeed: preferences.speechSpeed,
    defaultPitch: preferences.speechPitch,
  });
  const audioPlayer = useStoryAudio();
  const {
    status: audioStatus,
    error: audioPlayerError,
    isOffline: audioOffline,
    setSource: setAudioSource,
    setPlaybackRate,
    setVolume,
    pause: pauseAudio,
  } = audioPlayer;
  const lastSynthKeyRef = useRef<string | null>(null);

  const generateStoryTree = useCallback(async () => {
    if (!topic) return;

    setIsGenerating(true);
    try {
      const response = await generateFullStoryTree({ topic });

      if (response.success && response.storyTree) {
        setStoryTree(response.storyTree);
        setCurrentNode(response.storyTree.root);
        setHasStarted(true);
        toast.success('故事准备完毕！');
      } else {
        throw new Error(response.message || '故事树生成失败');
      }
    } catch (error: any) {
      console.error('生成故事树失败:', error);
      toast.error(error.message || '故事生成失败，请返回重试');
      setTimeout(() => {
        navigate('/');
      }, 3000);
    } finally {
      setIsGenerating(false);
    }
  }, [topic, navigate]);

  useEffect(() => {
    if (!topic) {
      navigate('/');
      return;
    }

    generateStoryTree();
  }, [topic, generateStoryTree, navigate]);

  useEffect(() => {
    setVolume(preferences.mute ? 0 : 1);
    setPlaybackRate(preferences.speechSpeed);
  }, [preferences.mute, preferences.speechSpeed, setPlaybackRate, setVolume]);

  const handleChoice = (choiceIndex: number) => {
    if (!currentNode || !storyTree || currentNode.isEnding) return;

    const newPath = [...currentPath, choiceIndex];
    setCurrentPath(newPath);

    const nextNode = currentNode.children?.[choiceIndex];
    if (nextNode) {
      setCurrentNode(nextNode);

      if (nextNode.isEnding) {
        toast.success('故事完成了！', { icon: '🎉' });
        setTimeout(() => {
          navigate('/end', {
            state: {
              topic,
              storyTree,
              finalPath: newPath,
            },
          });
        }, 2000);
      } else {
        toast.success(getRandomEncouragement(), { duration: 1500, icon: '⭐' });
      }
    }
  };

  const handleGoHome = () => {
    navigate('/');
  };

  const buildTtsRequest = useCallback(() => {
    if (!currentNode) return null;
    return {
      text: currentNode.segment,
      voiceId: preferences.voiceId,
      speed: preferences.speechSpeed,
      pitch: preferences.speechPitch,
      sessionId,
    };
  }, [currentNode, preferences.speechPitch, preferences.speechSpeed, preferences.voiceId, sessionId]);

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

  const isAudioLoading = isSynthesizing || tts.status === 'loading' || audioStatus === 'loading';
  const isAudioPlaying = audioStatus === 'playing';
  const audioButtonDisabled = isAudioLoading || audioOffline || !currentNode;

  const handlePlayAudio = useCallback(async () => {
    if (audioButtonDisabled) return;
    if (audioOffline) {
      toast.error('当前网络不可用，暂时无法播放语音');
      return;
    }
    await triggerSynthesis(true);
  }, [audioButtonDisabled, audioOffline, triggerSynthesis]);

  useEffect(() => {
    if (!currentNode) return;
    if (!preferences.autoPlay || preferences.mute) return;
    const payload = buildTtsRequest();
    if (!payload) return;
    const key = JSON.stringify(payload);
    if (lastSynthKeyRef.current === key) {
      return;
    }
    lastSynthKeyRef.current = key;
    triggerSynthesis(true).catch((error) => {
      console.error('故事树自动朗读失败', error);
    });
  }, [buildTtsRequest, currentNode, preferences.autoPlay, preferences.mute, triggerSynthesis]);

  const progressDescription = useMemo(() => {
    if (currentPath.length === 0) return '准备开始冒险';
    if (currentPath.length === 1) return '第一个选择已完成';
    if (currentPath.length === 2) return '第二个选择已完成';
    if (currentPath.length === 3) return '即将到达结局';
    return '';
  }, [currentPath.length]);

  return (
    <PointsPageShell
      backgroundVariant="hud"
      maxWidth="2xl"
      topBar={
        <>
          <div className="flex items-center gap-2 text-sm text-points-text-muted">
            <Squares2X2Icon className="h-5 w-5 text-points-accent" />
            <span>故事树模式 · 全局规划</span>
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
        topic && (
          <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-3">
              <PointsBadge variant="neutral">故事主题</PointsBadge>
              <div>
                <h1 className="text-3xl font-semibold text-points-text-strong">{topic}</h1>
                <p className="mt-2 text-base text-points-text-muted">
                  一次性生成完整分支，与孩子一起提前预览不同结局，让睡前仪式更有掌控力。
                </p>
              </div>
            </div>
            <div className="w-full max-w-xs space-y-3 sm:w-auto">
              <PointsProgress
                value={currentPath.length}
                max={maxDepth}
                label="探索进度"
              />
              <div className="text-xs text-points-text-muted">
                {progressDescription}
              </div>
            </div>
          </div>
        )
      }
    >
      {isGenerating && (
        <div className="flex flex-col items-center gap-4 rounded-points-lg border border-dashed border-points-border/60 bg-white/90 px-8 py-12 text-center shadow-sm">
          <LoadingSpinner message="正在为你准备完整的故事树..." size="large" />
          <p className="text-sm text-points-text-muted">
            我们会生成 3 轮选择、4 种结局的完整故事线路，请稍候。
          </p>
        </div>
      )}

      {hasStarted && currentNode && (
        <PointsSection layout="card" className="relative overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.div
              key={`${currentPath.join('-')}`}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ type: 'spring', stiffness: 120, damping: 18 }}
              className="space-y-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="text-sm font-medium uppercase tracking-wide text-points-text-muted">
                  当前节点
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
                <div className="rounded-points-lg border border-points-border/50 bg-white/95 p-6 text-base leading-relaxed text-points-text whitespace-pre-wrap shadow-inner">
                  {currentNode.segment}
                </div>
              ) : (
                <div className="rounded-points-lg border border-dashed border-points-border/50 bg-white/70 p-6 text-sm text-points-text-muted">
                  字幕已隐藏，可在「语音设置」中重新开启。
                </div>
              )}

              {(audioError || audioPlayerError || audioOffline) && (
                <div className="text-xs text-red-500">
                  {audioOffline ? '当前网络不可用，语音播放已暂停。' : audioError || audioPlayerError}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </PointsSection>
      )}

      {hasStarted && currentNode && currentNode.choices.length > 0 && !currentNode.isEnding && (
        <PointsSection
          layout="card"
          title="选择一个方向"
          description={`第 ${currentPath.length + 1} 次选择 · 逐步接近故事结局`}
        >
          <div className="grid gap-4">
            {currentNode.choices.map((choice, index) => (
              <motion.div
                key={`${choice}-${index}`}
                initial={{ opacity: 0, x: index % 2 === 0 ? -30 : 30 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.15 + index * 0.05, type: 'spring', stiffness: 200, damping: 20 }}
              >
                <Button
                  onClick={() => handleChoice(index)}
                  variant={index === 0 ? 'primary' : 'secondary'}
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

      {hasStarted && currentNode && currentNode.isEnding && (
        <div className="rounded-points-lg border border-points-border/60 bg-points-surface-elevated/80 px-6 py-5 text-center text-points-text-strong shadow-sm">
          🎉 故事结束啦！这是你的专属结局，希望你喜欢这个故事。
        </div>
      )}

      <div className="rounded-points-lg border border-dashed border-points-border/50 bg-white/80 px-5 py-4 text-sm text-points-text-muted">
        小提示：故事树模式适合家长和孩子一起规划故事路线，可以随时返回上一节点重新选择不同结局。
      </div>

      <AudioSettingsModal open={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
    </PointsPageShell>
  );
}
