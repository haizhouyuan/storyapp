import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BookOpenIcon,
  CommandLineIcon,
  RocketLaunchIcon,
  SparklesIcon,
  Squares2X2Icon,
} from '@heroicons/react/24/outline';
import { toast } from 'react-hot-toast';

import Button from '../components/Button';
import {
  PointsBadge,
  PointsCard,
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

const modeTabs: PointsTabItem[] = [
  {
    id: 'progressive',
    label: '探索模式',
    icon: <SparklesIcon className="h-5 w-5" />,
    description: 'AI 会分段讲述故事，在关键节点提供多个选择，由孩子决定下一步。',
  },
  {
    id: 'tree',
    label: '故事树模式',
    icon: <Squares2X2Icon className="h-5 w-5" />,
    description: '一次性生成完整分支图，方便家长提前预览并和孩子一起规划阅读路线。',
  },
];

export default function HomePage({ onStartStory }: HomePageProps) {
  const [topic, setTopic] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [storyMode, setStoryMode] = useState<StoryMode>('progressive');
  const navigate = useNavigate();

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
    <div className="min-h-screen bg-[rgb(var(--points-hud-bg))] pb-16 pt-12">
      <div className="mx-auto w-full max-w-4xl space-y-8 px-5 sm:px-8">
        <div className="flex items-center justify-between text-sm text-points-text-muted">
          <span className="flex items-center gap-2">
            <SparklesIcon className="h-4 w-4 text-points-primary" />
            睡前故事 · 亲子共读
          </span>
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

        <PointsCard variant="surface" className="space-y-8">
          <div className="space-y-3 text-left">
            <PointsBadge variant="neutral" icon={<CommandLineIcon className="h-4 w-4" />}>
              今晚读什么？
            </PointsBadge>
            <h1 className="text-3xl font-semibold text-points-text-strong sm:text-4xl">
              输入一个主题，生成属于孩子的互动故事
            </h1>
            <p className="text-base text-points-text-muted sm:text-lg">
              简单一句话，就能让 AI 打造温柔、可控的冒险旅程。您可以随时切换模式，陪孩子一起探索不同的分支结局。
            </p>
          </div>

          <PointsTabs
            items={modeTabs}
            activeId={storyMode}
            onChange={(id) => setStoryMode(id as StoryMode)}
            align="start"
          />

          <div className="space-y-4">
            <label className="block text-sm font-medium text-points-text-muted" htmlFor="story-topic">
              故事主题
            </label>
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                id="story-topic"
                value={topic}
                onChange={(event) => setTopic(event.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="例如：勇敢的小宇航员在月球上发现了……"
                className="w-full rounded-points-md border border-points-border bg-white px-4 py-3 text-base text-points-text shadow-sm transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-points-primary/20"
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
            <ul className="space-y-2 text-sm text-points-text-muted">
              <li>· 系统会根据主题生成 5~10 个互动节点，过程中可随时保存。</li>
              <li>· 故事完成后可导出文本，与家长或朋友分享。</li>
            </ul>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <PointsCard
              variant="default"
              className="space-y-2 border-points-border/40 bg-white"
              icon={<SparklesIcon className="h-6 w-6 text-points-primary" />}
              title="轻松上手"
              subtitle="无需复杂设置，一句话即可生成故事，并根据孩子选择动态调整。"
            />
            <PointsCard
              variant="default"
              className="space-y-2 border-points-border/40 bg-white"
              icon={<Squares2X2Icon className="h-6 w-6 text-points-accent" />}
              title="多分支探索"
              subtitle="故事树模式一次呈现不同结局，帮助孩子练习决策与想象力。"
            />
            <PointsCard
              variant="default"
              className="space-y-2 border-points-border/40 bg-white"
              icon={<CommandLineIcon className="h-6 w-6 text-points-magenta" />}
              title="家长掌控"
              subtitle="全程保留操作轨迹，可随时回放故事段落，与孩子共同复盘。"
            />
          </div>
        </PointsCard>
      </div>
    </div>
  );
}
