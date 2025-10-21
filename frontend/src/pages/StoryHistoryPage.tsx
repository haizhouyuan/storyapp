import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import {
  PointsPageShell,
  PointsSection,
  PointsBadge,
} from '../components/points';
import Button from '../components/Button';
import LoadingSpinner from '../components/LoadingSpinner';
import type { WorkflowListItem, WorkflowStageStatus } from '@storyapp/shared';
import { listWorkflows } from '../utils/detectiveApi';
import {
  ClockIcon,
  ArrowUturnLeftIcon,
  SparklesIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';

const STATUS_COPY: Record<WorkflowStageStatus, { label: string; variant: 'primary' | 'accent' | 'magenta' | 'success' | 'warning' | 'neutral' }> = {
  pending: { label: '排队中', variant: 'neutral' },
  running: { label: '生成中', variant: 'accent' },
  completed: { label: '已完成', variant: 'success' },
  failed: { label: '已失败', variant: 'warning' },
};

type HistoryListResponse = {
  items: WorkflowListItem[];
  pagination: { page: number; pages: number; total: number; limit: number };
};

export default function StoryHistoryPage() {
  const navigate = useNavigate();
  const [records, setRecords] = useState<WorkflowListItem[]>([]);
  const [pagination, setPagination] = useState<HistoryListResponse['pagination'] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const hasMore = useMemo(() => {
    if (!pagination) return false;
    return pagination.page < pagination.pages;
  }, [pagination]);

  useEffect(() => {
    void loadHistory(1, false);
  }, []);

  const loadHistory = async (page: number, append: boolean) => {
    if (append) {
      setIsLoadingMore(true);
    } else {
      setIsLoading(true);
    }
    try {
      const response = (await listWorkflows({
        page,
        limit: 8,
        status: 'completed',
      })) as HistoryListResponse;

      setRecords((prev) => (append ? [...prev, ...response.items] : response.items));
      setPagination(response.pagination);
    } catch (error: any) {
      console.error('加载历史故事失败', error);
      const message = error?.message || '加载历史故事失败，请稍后再试';
      toast.error(message);
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  };

  const handleViewStory = (workflowId: string) => {
    navigate(`/story/${workflowId}`, { state: { openTimeline: true } });
  };

  const formatDateTime = (value: string) => {
    try {
      const date = new Date(value);
      return new Intl.DateTimeFormat('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }).format(date);
    } catch {
      return value;
    }
  };

  return (
    <PointsPageShell
      maxWidth="3xl"
      topBar={(
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-points-primary">
            <SparklesIcon className="h-5 w-5" />
            <span className="text-sm font-semibold">历史故事记录</span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="small"
              onClick={() => navigate('/')}
            >
              <ArrowUturnLeftIcon className="mr-1 h-4 w-4" />
              返回首页
            </Button>
          </div>
        </div>
      )}
    >
      <PointsSection
        title="创作历史"
        layout="card"
        className="space-y-6"
        actions={(
          <Button
            variant="ghost"
            size="small"
            icon={<ArrowPathIcon className="h-4 w-4" />}
            onClick={() => void loadHistory(1, false)}
            disabled={isLoading}
          >
            刷新
          </Button>
        )}
      >
        {isLoading && !records.length ? (
          <div className="flex flex-col items-center justify-center py-16 text-points-text-muted">
            <LoadingSpinner size="medium" />
            <p className="mt-4 text-sm">正在加载历史故事，请稍候…</p>
          </div>
        ) : records.length === 0 ? (
          <div className="rounded-2xl bg-points-bg p-10 text-center text-points-text-muted">
            <p className="text-base font-medium">还没有历史故事</p>
            <p className="mt-2 text-sm">生成的故事会自动保存在这里，方便随时回顾。</p>
            <Button className="mt-6" onClick={() => navigate('/')}>
              去生成第一个故事
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {records.map((item) => {
              const statusMeta = STATUS_COPY[item.status] ?? STATUS_COPY.pending;
              return (
                <div
                  key={item._id}
                  className="flex flex-col justify-between gap-4 rounded-2xl border border-points-border bg-white p-4 transition hover:border-points-primary/60 hover:shadow-soft md:flex-row md:items-center"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <h3 className="text-lg font-semibold text-points-text">{item.topic}</h3>
                      <PointsBadge variant={statusMeta.variant}>{statusMeta.label}</PointsBadge>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-points-text-muted">
                      <span className="inline-flex items-center gap-1">
                        <ClockIcon className="h-4 w-4" />
                        创建：{formatDateTime(item.createdAt)}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <ClockIcon className="h-4 w-4" />
                        更新：{formatDateTime(item.updatedAt)}
                      </span>
                      {item.latestRevisionType && (
                        <span className="inline-flex items-center gap-1">
                          最近修订：{item.latestRevisionType}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      onClick={() => handleViewStory(item._id)}
                    >
                      查看详情
                    </Button>
                  </div>
                </div>
              );
            })}
            {hasMore && (
              <div className="flex justify-center pt-4">
                <Button
                  onClick={() => void loadHistory((pagination?.page ?? 1) + 1, true)}
                  disabled={isLoadingMore}
                  variant="secondary"
                >
                  {isLoadingMore ? (
                    <span className="flex items-center gap-2">
                      <LoadingSpinner size="small" />
                      正在加载…
                    </span>
                  ) : (
                    '加载更多'
                  )}
                </Button>
              </div>
            )}
          </div>
        )}
      </PointsSection>
    </PointsPageShell>
  );
}
