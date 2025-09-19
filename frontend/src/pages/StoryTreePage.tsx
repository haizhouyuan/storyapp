import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import { HomeIcon, SpeakerWaveIcon, Squares2X2Icon } from '@heroicons/react/24/outline';
import { toast } from 'react-hot-toast';

import Button from '../components/Button';
import LoadingSpinner from '../components/LoadingSpinner';
import { generateFullStoryTree } from '../utils/api';
import { getRandomEncouragement } from '../utils/helpers';
import { PointsBadge, PointsPageShell, PointsProgress, PointsSection } from '../components/points';
import type { StoryTree, StoryTreeNode } from '../../../shared/types';

export default function StoryTreePage() {
  const [storyTree, setStoryTree] = useState<StoryTree | null>(null);
  const [currentNode, setCurrentNode] = useState<StoryTreeNode | null>(null);
  const [currentPath, setCurrentPath] = useState<number[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();
  const topic = location.state?.topic as string | undefined;

  const maxDepth = 3;

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

  const handlePlayAudio = () => {
    toast('语音播放功能即将上线！', { icon: '🔊' });
  };

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
                  onClick={handlePlayAudio}
                  className="points-focus flex h-11 w-11 items-center justify-center rounded-full bg-points-secondary text-white shadow-points-soft transition hover:scale-105"
                  title="播放语音"
                >
                  <SpeakerWaveIcon className="h-5 w-5" />
                </button>
              </div>

              <div className="rounded-points-lg border border-points-border/50 bg-white/95 p-6 text-base leading-relaxed text-points-text whitespace-pre-wrap shadow-inner">
                {currentNode.segment}
              </div>
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
    </PointsPageShell>
  );
}
