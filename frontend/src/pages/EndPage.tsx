import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import { HeartIcon, BookOpenIcon, HomeIcon, SparklesIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import { toast } from 'react-hot-toast';

import Button from '../components/Button';
import { saveStory } from '../utils/api';
import { generateStoryContent, extractStoryTitle } from '../utils/helpers';
import { PointsBadge, PointsPageShell, PointsSection, PointsStatCard } from '../components/points';
import type { StorySession, StoryTree } from '../../../shared/types';

interface EndPageProps {
  storySession: StorySession | null;
  onResetSession: () => void;
}

interface StoryTreeEndState {
  topic: string;
  storyTree: StoryTree;
  finalPath: number[];
}

export default function EndPage({ storySession, onResetSession }: EndPageProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const storyTreeData = location.state as StoryTreeEndState | undefined;

  useEffect(() => {
    const hasValidSession = storySession && storySession.isComplete;
    const hasValidTreeData = storyTreeData && storyTreeData.topic && storyTreeData.storyTree && storyTreeData.finalPath;

    if (!hasValidSession && !hasValidTreeData) {
      navigate('/');
    }
  }, [storySession, storyTreeData, navigate]);

  const handleSaveStory = async () => {
    if (isSaving || isSaved) return;

    setIsSaving(true);
    try {
      let storyContent: string;
      let storyTitle: string;

      if (storySession) {
        storyContent = generateStoryContent(storySession);
        storyTitle = extractStoryTitle(storyContent, storySession.topic);
      } else if (storyTreeData) {
        const fullStoryContent = generateStoryTreeContent(storyTreeData);
        storyContent = JSON.stringify(fullStoryContent);
        storyTitle = extractStoryTitle(fullStoryContent.fullStory, storyTreeData.topic);
      } else {
        throw new Error('没有有效的故事数据');
      }

      const response = await saveStory({ title: storyTitle, content: storyContent });

      if (response.success) {
        setIsSaved(true);
        toast.success('故事已保存到"我的故事"中！', { duration: 4000, icon: '💾' });
      }
    } catch (error: any) {
      console.error('保存故事失败:', error);
      toast.error(error.message || '保存故事失败，请稍后重试');
    } finally {
      setIsSaving(false);
    }
  };

  const generateStoryTreeContent = (treeData: StoryTreeEndState) => {
    const { storyTree, finalPath, topic } = treeData;
    const segments: string[] = [];
    let currentNode = storyTree.root;

    segments.push(currentNode.segment);

    for (let index = 0; index < finalPath.length; index += 1) {
      const choiceIndex = finalPath[index];
      if (currentNode.children && currentNode.children[choiceIndex]) {
        currentNode = currentNode.children[choiceIndex];
        segments.push(currentNode.segment);
      }
    }

    return {
      topic,
      mode: 'story-tree',
      fullStory: segments.join('\n\n'),
      path: finalPath,
      storyTreeId: storyTree.id,
      totalSegments: segments.length,
      created_at: new Date().toISOString(),
    };
  };

  const handleGoHome = () => {
    onResetSession();
    navigate('/');
  };

  const handleViewMyStories = () => {
    onResetSession();
    navigate('/my-stories');
  };

  const handleNewStory = () => {
    onResetSession();
    navigate('/');
  };

  const summary = useMemo(() => {
    if (storySession) {
      const choiceCount = storySession.path.filter((item) => item.choice).length;
      const segmentCount = storySession.path.length;
      const storyDuration = Math.max(1, Math.round((Date.now() - storySession.startTime) / 1000 / 60));
      return { topic: storySession.topic, choiceCount, segmentCount, storyDuration };
    }

    if (storyTreeData) {
      return {
        topic: storyTreeData.topic,
        choiceCount: storyTreeData.finalPath.length,
        segmentCount: storyTreeData.finalPath.length + 1,
        storyDuration: 5,
      };
    }

    return { topic: '', choiceCount: 0, segmentCount: 0, storyDuration: 0 };
  }, [storySession, storyTreeData]);

  if ((!storySession || !storySession.isComplete) && !storyTreeData) {
    return null;
  }

  return (
    <PointsPageShell
      backgroundVariant="hud"
      maxWidth="xl"
      topBar={
        <>
          <div className="flex items-center gap-2 text-sm text-points-text-muted">
            <SparklesIcon className="h-5 w-5 text-points-primary" />
            <span>晚安故事 · 完结总结</span>
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
        <div className="flex flex-col gap-4">
          <PointsBadge variant="neutral">故事完成</PointsBadge>
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold text-points-text-strong">今晚的冒险圆满结束啦！</h1>
            <p className="text-base text-points-text-muted">
              和孩子一起回顾故事亮点，保存珍贵瞬间，并继续下一段奇妙旅程。
            </p>
          </div>
        </div>
      }
    >
      <PointsSection layout="card" className="relative overflow-hidden">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', stiffness: 120, damping: 16 }}
          className="space-y-4"
        >
          <div className="flex items-center gap-3 text-lg font-semibold text-points-text-strong">
            <SparklesIcon className="h-6 w-6 text-points-primary" />
            <span>故事主题：{summary.topic}</span>
          </div>
          <p className="text-base text-points-text-muted">
            孩子完成了一个充满惊喜的冒险。趁热打铁，保存或分享故事，让睡前记忆更长久。
          </p>
        </motion.div>

        <div className="absolute -right-10 -top-10 h-36 w-36 rounded-full bg-points-accent-soft blur-3xl" aria-hidden />
      </PointsSection>

      <PointsSection layout="plain">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <PointsStatCard label="互动次数" value={summary.choiceCount} helperText="孩子亲自做出的选择数量" />
          <PointsStatCard label="故事段落" value={summary.segmentCount} helperText="故事一共经历的章节数" />
          <PointsStatCard label="陪伴时长" value={`${summary.storyDuration} 分钟`} helperText="本次故事陪伴的估算时长" />
        </div>
      </PointsSection>

      <PointsSection
        layout="card"
        title="想怎么处理这个故事？"
        description="保存到故事库、立刻开始新的冒险，或回顾历史故事。"
        actions={
          <div className="flex flex-wrap gap-3">
            {!isSaved && (
              <Button
                onClick={handleSaveStory}
                loading={isSaving}
                disabled={isSaving}
                variant="warning"
                size="large"
                icon={!isSaving && <HeartIcon className="h-6 w-6" />}
                className="min-w-[180px]"
                testId="save-story-button"
              >
                {isSaving ? '正在保存...' : '保存到我的故事'}
              </Button>
            )}

            {isSaved && (
              <Button
                onClick={handleViewMyStories}
                variant="secondary"
                size="large"
                icon={<BookOpenIcon className="h-6 w-6" />}
                className="min-w-[180px]"
                testId="view-stories-button"
              >
                去我的故事查看
              </Button>
            )}

            <Button
              onClick={handleNewStory}
              variant="primary"
              size="large"
              icon={<SparklesIcon className="h-6 w-6" />}
              className="min-w-[170px]"
              testId="new-story-button"
            >
              创作新故事
            </Button>
          </div>
        }
      >
        <div className="rounded-points-lg border border-points-border/40 bg-white/95 p-6 text-base leading-relaxed text-points-text shadow-inner">
          <p className="font-semibold text-points-text-strong">温馨提示</p>
          <p className="mt-2 text-sm text-points-text-muted">
            - 保存故事后，可在“我的故事”中随时查看完整版内容。<br />
            - 若想产生更多分支，可以重新输入主题再生成一次。<br />
            - 若孩子意犹未尽，马上开始新故事吧！
          </p>
        </div>
      </PointsSection>

      <div className="rounded-points-lg border border-dashed border-points-border/50 bg-white/80 px-5 py-4 text-center text-sm text-points-text-muted">
        "每一个故事都是独一无二的冒险，就像你一样特别。晚安，做个好梦 🌙"
      </div>

      <div className="flex justify-center">
        <Button
          onClick={handleGoHome}
          variant="ghost"
          size="medium"
          icon={<ArrowPathIcon className="h-5 w-5" />}
        >
          返回首页继续探索
        </Button>
      </div>
    </PointsPageShell>
  );
}
