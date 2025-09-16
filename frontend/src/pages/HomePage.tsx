import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  BookOpenIcon,
  CommandLineIcon,
  RocketLaunchIcon,
  SparklesIcon,
  Squares2X2Icon,
  QueueListIcon,
  ChartBarIcon,
} from '@heroicons/react/24/outline';
import { toast } from 'react-hot-toast';

import Button from '../components/Button';
import {
  PointsBadge,
  PointsCard,
  PointsCardAccent,
  PointsProgress,
  PointsTabs,
  PointsTabItem,
} from '../components/points';
import { validateStoryTopic } from '../utils/helpers';
import type { StorySession, StoryTreeSession } from '../../../shared/types';

interface HomePageProps {
  onStartStory: (session: StorySession) => void;
  onStartStoryTree?: (session: StoryTreeSession) => void;
}

type StoryMode = 'progressive' | 'tree';

type FeatureCard = {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  accent: PointsCardAccent;
  badge?: React.ReactNode;
};

const modeTabs: PointsTabItem[] = [
  {
    id: 'progressive',
    label: '探索模式',
    icon: <SparklesIcon className="h-5 w-5" />,
    description: 'AI 将逐段讲述故事，并在每个转折处给出 3 个选择，由孩子亲自决定冒险方向。',
  },
  {
    id: 'tree',
    label: '故事树模式',
    icon: <Squares2X2Icon className="h-5 w-5" />,
    description: '生成全局故事树，一次预览所有分支。适合和家长一起制定探索路线。',
  },
];

const featureCards: FeatureCard[] = [
  {
    title: '沉浸式叙事',
    subtitle: '故事段落实时渲染，配合动态氛围，让孩子仿佛置身奇幻世界。',
    icon: <CommandLineIcon className="h-6 w-6 text-points-primary" />,
    accent: 'primary',
    badge: <PointsBadge variant="neutral">动态</PointsBadge>,
  },
  {
    title: '进度激励',
    subtitle: '完成章节自动触发庆祝动画，形成 Points 风格的连胜体验。',
    icon: <RocketLaunchIcon className="h-6 w-6 text-points-accent" />,
    accent: 'accent',
    badge: <PointsBadge variant="neutral">Streak</PointsBadge>,
  },
  {
    title: '家长视角',
    subtitle: '同步生成阅读时长与主题偏好，便于家长回顾孩子的创作旅程。',
    icon: <ChartBarIcon className="h-6 w-6 text-points-magenta" />,
    accent: 'magenta',
    badge: <PointsBadge variant="neutral">Beta</PointsBadge>,
  },
];

export default function HomePage({ onStartStory }: HomePageProps) {
  const [topic, setTopic] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [storyMode, setStoryMode] = useState<StoryMode>('progressive');
  const navigate = useNavigate();

  const progressMock = useMemo(
    () => ({ curiosity: 78, creativity: 64, exploration: 52 }),
    [],
  );

  const handleStartStory = async () => {
    const validation = validateStoryTopic(topic);
    if (!validation.isValid) {
      toast.error(validation.error!);
      return;
    }

    setIsLoading(true);

    try {
      if (storyMode === 'tree') {
        navigate('/story-tree', { state: { topic: topic.trim() } });
      } else {
        const maxChoices = Math.floor(Math.random() * 6) + 5;
        const session: StorySession = {
          topic: topic.trim(),
          path: [],
          isComplete: false,
          startTime: Date.now(),
          maxChoices,
        };

        onStartStory(session);
        navigate('/story');
      }
    } catch (error) {
      console.error('开始故事失败:', error);
      toast.error('故事启动失败，请稍后再试');
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && !isLoading) {
      handleStartStory();
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[rgb(var(--points-hud-bg))] pb-16 pt-12">
      <div className="pointer-events-none absolute inset-0">
        <motion.div
          initial={{ opacity: 0, scale: 0.8, rotate: 0 }}
          animate={{ opacity: 1, scale: 1, rotate: 8 }}
          transition={{ duration: 1.2, ease: 'easeOut' }}
          className="absolute -top-40 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-points-primary/25 blur-3xl"
        />
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 0.6, y: 0 }}
          transition={{ duration: 1.6 }}
          className="absolute bottom-0 left-0 right-0 h-72 bg-gradient-to-t from-points-accent/20 to-transparent"
        />
      </div>

      <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-8 px-5 sm:px-8">
        <div className="flex items-center justify-between gap-4">
          <PointsBadge variant="accent" icon={<SparklesIcon className="h-4 w-4" />}>
            AI 故事游乐场
          </PointsBadge>
          <Button
            variant="ghost"
            size="small"
            icon={<BookOpenIcon className="h-5 w-5" />}
            onClick={() => navigate('/my-stories')}
            className="shadow-none"
            testId="my-stories-button"
          >
            我的故事
          </Button>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.8fr_1fr]">
          <PointsCard variant="surface" className="relative overflow-hidden">
            <div className="mb-6 flex flex-col gap-3 text-left">
              <h1 className="text-3xl font-semibold text-points-text-strong sm:text-4xl">
                打开孩子的故事连胜模式
              </h1>
              <p className="text-base text-points-text-muted sm:text-lg">
                输入一个主题，AI 即刻生成 Points 风格的分支冒险。通过积分、勋章与 streak 激励，让每一次阅读都像升级打怪一样好玩。
              </p>
            </div>

            <PointsTabs
              items={modeTabs}
              activeId={storyMode}
              onChange={(id) => setStoryMode(id as StoryMode)}
              align="start"
            />

            <div className="mt-6 space-y-4">
              <label className="block text-sm font-semibold text-points-text-muted" htmlFor="story-topic">
                故事主题
              </label>
              <div className="flex flex-col gap-3 sm:flex-row">
                <input
                  id="story-topic"
                  value={topic}
                  onChange={(event) => setTopic(event.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="例如：勇敢的小宇航员在月球上发现了……"
                  className="w-full rounded-points-md border border-points-border bg-white/95 px-5 py-3 text-base text-points-text shadow-points-soft/40 transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-points-primary/40"
                  data-testid="topic-input"
                  maxLength={100}
                />
                <Button
                  onClick={handleStartStory}
                  loading={isLoading}
                  disabled={isLoading}
                  icon={<RocketLaunchIcon className="h-5 w-5" />}
                  className="w-full sm:w-auto"
                  testId="start-story-button"
                >
                  开始冒险
                </Button>
              </div>
              <p className="text-sm text-points-text-muted">
                系统会根据主题自动生成 5~10 个互动节点，完成后可分享给家长或保存到「我的故事」。
              </p>
            </div>

            <div className="mt-6 grid gap-5 sm:grid-cols-3">
              <PointsProgress
                value={progressMock.curiosity}
                label="好奇指数"
                icon={<SparklesIcon className="h-5 w-5" />}
              />
              <PointsProgress
                value={progressMock.creativity}
                label="创造力"
                icon={<QueueListIcon className="h-5 w-5" />}
              />
              <PointsProgress
                value={progressMock.exploration}
                label="探索度"
                icon={<RocketLaunchIcon className="h-5 w-5" />}
              />
            </div>
          </PointsCard>

          <div className="flex flex-col gap-4">
            {featureCards.map((feature) => (
              <PointsCard
                key={feature.title}
                variant="default"
                accent={feature.accent}
                className="shadow-points-soft"
                badge={feature.badge}
                icon={feature.icon}
                title={feature.title}
                subtitle={feature.subtitle}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
