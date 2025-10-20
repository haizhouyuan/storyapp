import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { WorkflowEvent, WorkflowStageStatus } from '@storyapp/shared';
import { ArrowDownTrayIcon, SpeakerWaveIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import Button from './Button';
import { useWorkflowStream } from '../hooks/useWorkflowStream';
import { fetchLatestTtsTask, type TtsTaskRecord } from '../utils/api';

const stageLabels: Record<string, string> = {
  stage1_planning: '阶段一 · 蓝图规划',
  stage2_writing: '阶段二 · 逐章写作',
  stage3_review: '阶段三 · 审阅调优',
  stage4_validation: '阶段四 · 公平校验',
};

const statusColors: Record<WorkflowStageStatus | 'idle', string> = {
  idle: 'bg-slate-200 text-slate-600',
  pending: 'bg-slate-200 text-slate-600',
  running: 'bg-blue-100 text-blue-600',
  completed: 'bg-emerald-100 text-emerald-600',
  failed: 'bg-rose-100 text-rose-600',
};

const ttsStatusColors: Record<'success' | 'error' | 'running', string> = {
  success: 'bg-emerald-100 text-emerald-600',
  error: 'bg-rose-100 text-rose-600',
  running: 'bg-blue-100 text-blue-600',
};

const overallMessages: Record<WorkflowStageStatus | 'idle', string> = {
  idle: '待开始',
  pending: '待执行',
  running: '生成中',
  completed: '已完成',
  failed: '已失败',
};

const formatTime = (timestamp: string) => {
  try {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return timestamp;
  }
};

const StageEventList: React.FC<{
  events: WorkflowEvent[];
  onEventAction?: (event: WorkflowEvent) => void;
}> = ({ events, onEventAction }) => {
  if (!events.length) {
    return <p className="text-xs text-slate-500">暂无事件</p>;
  }

  const hasAction = (event: WorkflowEvent): boolean => {
    const meta = event.meta ?? {};
    if (typeof meta.chapterIndex === 'number') return true;
    if (typeof meta.scrollToChapter === 'number') return true;
    if (typeof meta.action === 'string') return true;
    return false;
  };

  return (
    <ul className="space-y-2">
      <AnimatePresence initial={false}>
        {events.map((event) => {
          const actionable = Boolean(onEventAction) && hasAction(event);
          return (
            <motion.li
              key={event.eventId}
              layout="position"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
              className={`rounded-lg border border-slate-100 bg-white/80 p-2 text-xs text-slate-600 shadow-sm transition ${
                actionable
                  ? 'cursor-pointer hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-points-primary/40'
                  : ''
              }`}
              onClick={() => actionable && onEventAction?.(event)}
              onKeyDown={(eventKeyboard) => {
                if (!actionable) return;
                if (eventKeyboard.key === 'Enter' || eventKeyboard.key === ' ') {
                  eventKeyboard.preventDefault();
                  onEventAction?.(event);
                }
              }}
              role={actionable ? 'button' : undefined}
              tabIndex={actionable ? 0 : -1}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-slate-700">{formatTime(event.timestamp)}</span>
                {event.status && (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-500">
                    {event.status}
                  </span>
                )}
              </div>
              <p className="mt-1 leading-5 text-slate-600">{event.message}</p>
            </motion.li>
          );
        })}
      </AnimatePresence>
    </ul>
  );
};

interface WorkflowTimelineDrawerProps {
  workflowId?: string | null;
  storyTitle?: string;
  initialOpen?: boolean;
  onScrollToChapter?: (chapterIndex: number) => void;
  onRequestExport?: () => void;
  onRequestReadFull?: () => void;
  onRetryFailedStage?: () => void;
  onManualRefresh?: () => void;
  onOpenChange?: (open: boolean) => void;
  onTtsEventSuccess?: (event: WorkflowEvent) => void;
  isExporting?: boolean;
  isSynthesizing?: boolean;
  isRetryingStage?: boolean;
  hasFailedStage?: boolean;
  isTtsReady?: boolean;
}

export const WorkflowTimelineDrawer: React.FC<WorkflowTimelineDrawerProps> = ({
  workflowId,
  storyTitle,
  initialOpen = true,
  onScrollToChapter,
  onRequestExport,
  onRequestReadFull,
  onRetryFailedStage,
  onManualRefresh,
  onOpenChange,
  onTtsEventSuccess,
  isExporting = false,
  isSynthesizing = false,
  isRetryingStage = false,
  hasFailedStage = false,
  isTtsReady = false,
}) => {
  const [isOpen, setIsOpen] = useState(initialOpen);
  const [latestTtsTask, setLatestTtsTask] = useState<TtsTaskRecord | null>(null);
  const [latestTtsError, setLatestTtsError] = useState<string | null>(null);
  const [loadingLatestTts, setLoadingLatestTts] = useState(false);

  const { events, stageStatus, ttsEvents, infoEvents, overallStatus, isConnected, error, refresh } =
    useWorkflowStream(workflowId);

  const groupedStageEvents = useMemo<Record<string, WorkflowEvent[]>>(() => {
    const groups: Record<string, WorkflowEvent[]> = {};
    for (const event of events) {
      if (event.category !== 'stage' || !event.stageId) continue;
      if (!groups[event.stageId]) {
        groups[event.stageId] = [];
      }
      groups[event.stageId].push(event);
    }
    return groups;
  }, [events]);

  const overallBadge = statusColors[overallStatus];

  useEffect(() => {
    if (!workflowId) {
      setIsOpen(false);
      return;
    }
    if (initialOpen) {
      setIsOpen(true);
    }
  }, [workflowId, initialOpen]);

  useEffect(() => {
    onOpenChange?.(isOpen);
  }, [isOpen, onOpenChange]);

  const loadLatestTtsTask = useCallback(async () => {
    if (!workflowId) {
      setLatestTtsTask(null);
      setLatestTtsError(null);
      setLoadingLatestTts(false);
      return;
    }
    setLoadingLatestTts(true);
    setLatestTtsError(null);
    try {
      const task = await fetchLatestTtsTask(workflowId);
      setLatestTtsTask(task);
    } catch (err: any) {
      setLatestTtsError(err?.message || '获取最新朗读任务失败');
    } finally {
      setLoadingLatestTts(false);
    }
  }, [workflowId]);

  useEffect(() => {
    loadLatestTtsTask();
  }, [loadLatestTtsTask]);

  useEffect(() => {
    if (!ttsEvents.length) return;
    const latest = ttsEvents[ttsEvents.length - 1];
    if (latest.status === 'success' || latest.status === 'error') {
      loadLatestTtsTask();
    }
    if (latest.status === 'success') {
      onTtsEventSuccess?.(latest);
    }
  }, [ttsEvents, loadLatestTtsTask, onTtsEventSuccess]);

  const handleToggle = useCallback(() => {
    setIsOpen((open) => !open);
  }, []);

  const handleManualRefresh = useCallback(() => {
    refresh();
    onManualRefresh?.();
  }, [refresh, onManualRefresh]);

  const handleEventAction = useCallback(
    (event: WorkflowEvent) => {
      const meta = event.meta ?? {};
      if (typeof meta.chapterIndex === 'number' && onScrollToChapter) {
        onScrollToChapter(meta.chapterIndex);
        return;
      }
      if (typeof meta.scrollToChapter === 'number' && onScrollToChapter) {
        onScrollToChapter(meta.scrollToChapter);
        return;
      }
      if (typeof meta.action === 'string') {
        if (meta.action === 'openExport' && onRequestExport) {
          onRequestExport();
          return;
        }
        if (meta.action === 'synthesize-full' && onRequestReadFull) {
          onRequestReadFull();
          return;
        }
        if (meta.action === 'retry-stage' && onRetryFailedStage) {
          onRetryFailedStage();
          return;
        }
      }
    },
    [onScrollToChapter, onRequestExport, onRequestReadFull, onRetryFailedStage],
  );

  const ttsStatusLabel = useMemo(() => {
    if (!ttsEvents.length && !latestTtsTask) return 'idle';
    const latestEvent = ttsEvents[ttsEvents.length - 1];
    if (latestEvent?.status === 'success' || latestEvent?.status === 'error') {
      return latestEvent.status;
    }
    if (latestTtsTask?.status) {
      return latestTtsTask.status;
    }
    return 'running';
  }, [ttsEvents, latestTtsTask]);

  const ttsStatusBadge =
    ttsStatusLabel === 'success'
      ? ttsStatusColors.success
      : ttsStatusLabel === 'error'
        ? ttsStatusColors.error
        : ttsStatusColors.running;

  const connectionBadge = isConnected
    ? 'bg-emerald-100 text-emerald-600'
    : 'bg-amber-100 text-amber-700';
  const connectionDot = isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500';

  if (!workflowId) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        onClick={handleToggle}
        className={`fixed top-5 right-5 z-50 flex items-center gap-2 rounded-full px-4 py-2 shadow-lg transition md:top-5 md:right-5 ${overallBadge}`}
      >
        <span className="text-sm font-semibold">创作进度</span>
        <span className="rounded-full bg-white/70 px-2 py-0.5 text-xs text-slate-700">
          {overallMessages[overallStatus]}
        </span>
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.aside
            initial={{ x: 360, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 360, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 220, damping: 28 }}
            className="fixed inset-x-0 bottom-0 top-auto z-40 flex h-[78vh] w-full flex-col border-t border-slate-200 bg-white/95 shadow-2xl backdrop-blur md:inset-y-0 md:bottom-0 md:left-auto md:right-0 md:h-full md:max-w-md md:border-l md:border-t-0"
          >
            <div className="flex h-full flex-col">
              <header className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                <div className="space-y-1">
                  <h2 className="text-lg font-semibold text-slate-800">创作进度</h2>
                  <p className="text-xs text-slate-500">{storyTitle || '故事生成流程'}</p>
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${connectionBadge}`}
                    >
                      <span className={`h-2 w-2 rounded-full ${connectionDot}`} />
                      {isConnected ? '连接正常' : '自动重连中'}
                    </span>
                    <Button
                      variant="ghost"
                      size="small"
                      onClick={handleManualRefresh}
                      icon={<ArrowPathIcon className="h-4 w-4" />}
                      className="px-3 py-1 text-xs"
                    >
                      手动刷新
                    </Button>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600 hover:bg-slate-200"
                >
                  关闭
                </button>
              </header>

              <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
                {!isConnected && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                    事件流连接中断，将自动重试。
                  </div>
                )}
                {error && (
                  <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-600">
                    {error}
                  </div>
                )}

                {Object.entries(stageLabels).map(([stageId, label]) => {
                  const stageEventStatus = stageStatus[stageId]?.status;
                  const badgeStatus: WorkflowStageStatus =
                    stageEventStatus === 'running' ||
                    stageEventStatus === 'completed' ||
                    stageEventStatus === 'failed'
                      ? stageEventStatus
                      : 'pending';
                  const stageEvents = groupedStageEvents[stageId] ?? [];
                  const latestStageMeta =
                    stageEvents.length > 0 ? stageEvents[stageEvents.length - 1].meta ?? {} : {};
                  const durationMs =
                    typeof latestStageMeta.durationMs === 'number' ? latestStageMeta.durationMs : undefined;

                  return (
                    <motion.section
                      key={stageId}
                      layout
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{
                        opacity: 1,
                        scale: badgeStatus === 'completed' ? [1, 1.01, 1] : 1,
                      }}
                      transition={{ duration: 0.25 }}
                      className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm"
                    >
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-slate-800">{label}</h3>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide ${statusColors[badgeStatus]}`}
                        >
                          {badgeStatus}
                        </span>
                      </div>
                      {durationMs !== undefined && (
                        <p className="mt-1 text-[11px] text-slate-500">耗时约 {(durationMs / 1000).toFixed(1)} 秒</p>
                      )}
                      <div className="mt-3">
                        <StageEventList events={stageEvents} onEventAction={handleEventAction} />
                      </div>
                    </motion.section>
                  );
                })}

                <section className="rounded-xl border border-blue-100 bg-blue-50/60 p-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-blue-800">语音朗读</h3>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide ${ttsStatusBadge}`}
                    >
                      {ttsStatusLabel}
                    </span>
                  </div>
                  <div className="mt-3 space-y-2">
                    {loadingLatestTts && (
                      <p className="text-xs text-blue-700">正在获取最新朗读任务...</p>
                    )}
                    {latestTtsError && (
                      <p className="text-xs text-rose-600">{latestTtsError}</p>
                    )}
                    {latestTtsTask && (
                      <div className="rounded-lg border border-blue-100 bg-white/80 px-3 py-2 text-[11px] text-blue-700">
                        <p>
                          最近任务：
                          {latestTtsTask.status === 'success'
                            ? '成功'
                            : latestTtsTask.status === 'error'
                              ? '失败'
                              : '进行中'}
                        </p>
                        {latestTtsTask.segmentIndex !== undefined && (
                          <p>片段 #{latestTtsTask.segmentIndex + 1}</p>
                        )}
                        {latestTtsTask.audioUrl && (
                          <a
                            href={latestTtsTask.audioUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-blue-600 underline"
                          >
                            打开音频链接
                          </a>
                        )}
                        {latestTtsTask.error && (
                          <p className="text-rose-500">错误：{latestTtsTask.error}</p>
                        )}
                      </div>
                    )}
                    <StageEventList events={ttsEvents} onEventAction={handleEventAction} />
                  </div>
                </section>

                {infoEvents.length > 0 && (
                  <section className="rounded-xl border border-slate-100 bg-slate-50/70 p-4 shadow-sm">
                    <h3 className="text-sm font-semibold text-slate-700">系统通知</h3>
                    <div className="mt-3">
                      <StageEventList events={infoEvents} onEventAction={handleEventAction} />
                    </div>
                  </section>
                )}
              </div>

              {(onRequestExport || onRequestReadFull || onRetryFailedStage) && (
                <div className="border-t border-slate-200 bg-white/96 px-5 py-4">
                  <div className="flex flex-wrap gap-3">
                    {onRequestExport && (
                      <Button
                        variant="secondary"
                        size="small"
                        onClick={onRequestExport}
                        loading={isExporting}
                        icon={<ArrowDownTrayIcon className="h-4 w-4" />}
                      >
                        {isExporting ? '正在导出…' : '导出故事'}
                      </Button>
                    )}
                    {onRequestReadFull && (
                      <Button
                        variant="primary"
                        size="small"
                        onClick={onRequestReadFull}
                        disabled={isSynthesizing}
                        loading={isSynthesizing}
                        icon={<SpeakerWaveIcon className="h-4 w-4" />}
                      >
                        {isSynthesizing ? '朗读生成中…' : isTtsReady ? '重新朗读整篇' : '朗读整篇'}
                      </Button>
                    )}
                    {onRetryFailedStage && (
                      <Button
                        variant="ghost"
                        size="small"
                        onClick={onRetryFailedStage}
                        disabled={!hasFailedStage}
                        loading={isRetryingStage}
                      >
                        重试失败阶段
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  );
};

export default WorkflowTimelineDrawer;
