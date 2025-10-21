import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  PointsPageShell,
  PointsSection,
} from '../components/points';
import Button from '../components/Button';
import LoadingSpinner from '../components/LoadingSpinner';
import { createWorkflow } from '../utils/detectiveApi';
import { resolveWorkflowId } from '../hooks/useDetectiveWorkflow';
import {
  SparklesIcon,
  LightBulbIcon,
  BookOpenIcon,
  WrenchScrewdriverIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';

const TOPIC_SUGGESTIONS = [
  '雾岚古堡的第八声',
  '午夜列车的失踪乘客',
  '图书馆的镜面迷宫',
  '雨夜小镇的隐藏钟声',
  '钢琴教室里的无声奏鸣',
];

const PROCESS_STEPS = [
  'Step 1 · 规划蓝图',
  'Step 2 · 逐章写作',
  'Step 3 · 逻辑审阅',
  'Step 4 · 公平性校验',
];

const encouragements = [
  '正在唤醒侦探机关，请稍候…',
  '地下档案室正在检索线索…',
  '校对时序线，确保公平推理…',
  '打磨故事节奏，让小读者易于理解…',
];

export default function ReaderHomePage() {
  const navigate = useNavigate();
  const [topic, setTopic] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [statusHint, setStatusHint] = useState('');

  const disabled = isGenerating || topic.trim().length === 0;

  const stepHints = useMemo(() => PROCESS_STEPS.join(' → '), []);

  const handleGenerate = async () => {
    if (!topic.trim()) {
      toast.error('请输入故事主题');
      return;
    }
    setIsGenerating(true);
    setStatusHint(encouragements[Math.floor(Math.random() * encouragements.length)]);
    try {
      const response: any = await createWorkflow(topic.trim());
      const workflowId = resolveWorkflowId(response);
      if (!workflowId) {
        throw new Error('未能获取故事 ID');
      }
      toast.success('生成任务已启动，创作进度抽屉会实时更新');
      navigate(`/story/${workflowId}`, {
        state: { workflow: response, openTimeline: true },
      });
    } catch (error: any) {
      const msg = error?.message || '生成故事失败，请稍后再试';
      toast.error(msg);
    } finally {
      setIsGenerating(false);
      setStatusHint('');
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    if (isGenerating) return;
    setTopic(suggestion);
  };

  const gotoBuilder = () => {
    navigate('/builder');
  };

  const gotoHistory = () => {
    navigate('/history');
  };

  return (
    <PointsPageShell
      backgroundVariant="hero"
      maxWidth="2xl"
      topBar={(
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpenIcon className="h-5 w-5 text-points-primary" />
            <span className="font-semibold text-points-text">侦探故事工作室 · 阅读版</span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="small"
              onClick={gotoHistory}
            >
              <ClockIcon className="mr-1 h-4 w-4" />
              历史故事
            </Button>
            <Button
              variant="ghost"
              size="small"
              onClick={gotoBuilder}
              data-testid="advanced-mode-button"
            >
              <WrenchScrewdriverIcon className="mr-1 h-4 w-4" />
              高级模式
            </Button>
          </div>
        </div>
      )}
    >
      <header className="my-6 text-center">
        <h1
          className="bg-gradient-to-r from-points-primary via-points-secondary to-points-accent bg-clip-text text-4xl font-black text-transparent md:text-5xl"
          data-testid="hero-title"
        >
          一键生成你的原创侦探谜案
        </h1>
        <p className="mt-3 text-points-text-muted md:text-lg" data-testid="hero-subtitle">
          输入主题 → AI 自动完成蓝图、写作、校验，让孩子阅读一部推理完整的故事。
        </p>
      </header>

      <PointsSection
        title="故事主题"
        layout="card"
        className="mb-6"
      >
        <div className="space-y-4">
          <div className="relative">
            <input
              type="text"
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
              placeholder="例如：海边灯塔的消失钟声"
              maxLength={120}
              disabled={isGenerating}
              data-testid="topic-input"
              className="w-full rounded-2xl border-2 border-points-border bg-white px-5 py-4 text-lg shadow-soft transition focus:border-points-primary focus:outline-none disabled:cursor-not-allowed disabled:bg-points-surface"
            />
            <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-points-text-muted">
              {topic.length}/120
            </span>
          </div>

          <div>
            <p className="mb-2 text-sm text-points-text-muted">灵感提示：</p>
            <div className="flex flex-wrap gap-2">
              {TOPIC_SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  disabled={isGenerating}
                  onClick={() => handleSuggestionClick(suggestion)}
                  className="rounded-full border border-points-border bg-white px-4 py-2 text-sm transition hover:border-points-primary hover:shadow-soft disabled:opacity-60"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        </div>
      </PointsSection>

      <PointsSection layout="card" className="mb-6 text-center">
        <div className="space-y-4">
          <p className="text-points-text-muted">
            {stepHints}
          </p>
          <Button
            variant="primary"
            size="large"
            disabled={disabled}
            onClick={handleGenerate}
            data-testid="start-story-button"
            className="min-w-[260px] !py-5 text-xl font-semibold shadow-soft disabled:opacity-60"
          >
            {isGenerating ? (
              <span className="flex items-center justify-center gap-3">
                <LoadingSpinner size="small" />
                {statusHint || '正在生成故事…'}
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <SparklesIcon className="h-6 w-6" />
                开始生成故事
              </span>
            )}
          </Button>
          <p className="text-xs text-points-text-muted">
            {isGenerating ? '故事生成需数十秒，请保持页面打开。' : '生成完成后会自动跳转至故事阅读页。'}
          </p>
        </div>
      </PointsSection>

      <PointsSection title="AI 如何写作" layout="card">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl bg-gradient-to-br from-points-bg to-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-points-primary">
              <LightBulbIcon className="h-5 w-5" />
              <span className="font-semibold">蓝图 + 校验</span>
            </div>
            <p className="mt-2 text-sm text-points-text-muted">
              模型先生成案件蓝图，再逐章写作，并经过逻辑审阅与公平性校验，确保线索可回收、时间轴一致。
            </p>
          </div>
          <div className="rounded-2xl bg-gradient-to-br from-points-bg to-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-points-primary">
              <SparklesIcon className="h-5 w-5" />
              <span className="font-semibold">儿童向语气</span>
            </div>
            <p className="mt-2 text-sm text-points-text-muted">
              文本针对中高年级阅读水平处理，控制句长与词频，适合亲子共读或小读者自读。
            </p>
          </div>
        </div>
      </PointsSection>
    </PointsPageShell>
  );
}
