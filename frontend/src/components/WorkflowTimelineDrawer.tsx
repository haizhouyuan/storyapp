import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type {
  WorkflowEvent,
  WorkflowStageStatus,
  WorkflowStageCommandStatus,
  WorkflowStageExecution,
  WorkflowStageState,
  DetectiveWorkflowRecord,
  ClueDiagnostics,
  ClueAnchor,
  RevisionPlanSummary,
  Stage5GateSnapshot,
  DraftAnchorsSummary,
} from '@storyapp/shared';
import { ArrowDownTrayIcon, SpeakerWaveIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import Button from './Button';
import { useWorkflowStream } from '../hooks/useWorkflowStream';
import { fetchLatestTtsTask, type TtsTaskRecord } from '../utils/api';

const stageLabels: Record<string, string> = {
  stage1_planning: '阶段一 · 蓝图规划',
  stage2_writing: '阶段二 · 逐章写作',
  stage3_review: '阶段三 · 审阅调优',
  stage4_revision: '阶段四 · 修订整合',
  stage5_validation: '阶段五 · 公平校验',
};

const statusColors: Record<WorkflowStageStatus | 'idle', string> = {
  idle: 'bg-slate-200 text-slate-600',
  pending: 'bg-slate-200 text-slate-600',
  running: 'bg-blue-100 text-blue-600',
  completed: 'bg-emerald-100 text-emerald-600',
  failed: 'bg-rose-100 text-rose-600',
};

const commandStatusColors: Record<WorkflowStageCommandStatus, string> = {
  pending: 'bg-slate-100 text-slate-500',
  running: 'bg-blue-100 text-blue-600',
  success: 'bg-emerald-100 text-emerald-600',
  error: 'bg-rose-100 text-rose-600',
};

const commandStatusLabels: Record<WorkflowStageCommandStatus, string> = {
  pending: '待开始',
  running: '执行中',
  success: '已完成',
  error: '失败',
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
  const visibleEvents = events.filter((event) => {
    const meta = (event.meta ?? {}) as Record<string, any>;
    return !meta.detailType;
  });

  if (!visibleEvents.length) {
    return <p className="text-xs text-slate-500">暂无事件</p>;
  }

  const hasAction = (event: WorkflowEvent): boolean => {
    const meta = event.meta ?? {};
    if (typeof meta.chapterIndex === 'number') return true;
    if (typeof meta.scrollToChapter === 'number') return true;
    if (typeof meta.action === 'string') return true;
    return false;
  };
  const renderMessage = (message: WorkflowEvent['message']) => {
    if (typeof message === 'string') return message;
    if (message === null || message === undefined) return '（无详细说明）';
    if (typeof message === 'object') {
      try {
        return JSON.stringify(message);
      } catch {
        return '[object]';
      }
    }
    return String(message);
  };

  return (
    <ul className="space-y-2">
      <AnimatePresence initial={false}>
        {visibleEvents.map((event) => {
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
              <p className="mt-1 leading-5 text-slate-600">{renderMessage(event.message)}</p>
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
  workflow?: DetectiveWorkflowRecord | null;
  stageStates?: WorkflowStageState[];
  workflowStatus?: WorkflowStageStatus;
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
  workflow,
  stageStates,
  workflowStatus,
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

  const { events, stageStatus, ttsEvents, infoEvents, overallStatus, isConnected, error, refresh, stageActivity } =
    useWorkflowStream(workflowId);

  const stageStateMap = useMemo(() => {
    if (!stageStates || stageStates.length === 0) return null;
    const map = new Map<string, WorkflowStageState>();
    stageStates.forEach((state) => {
      map.set(state.stage, state);
    });
    return map;
  }, [stageStates]);

  const clueDiagnostics: ClueDiagnostics | undefined = workflow?.meta?.clueDiagnostics as ClueDiagnostics | undefined;
  const anchorsSummary: DraftAnchorsSummary | undefined = workflow?.meta?.anchorsSummary as DraftAnchorsSummary | undefined;
  const revisionPlan: RevisionPlanSummary | undefined = useMemo(() => {
    if (workflow?.storyDraft?.revisionPlan) {
      return workflow.storyDraft.revisionPlan as RevisionPlanSummary;
    }
    return workflow?.meta?.stageResults?.stage4?.plan as RevisionPlanSummary | undefined;
  }, [workflow]);
  const stage5Snapshot: Stage5GateSnapshot | undefined = workflow?.meta?.stageResults?.stage5 as Stage5GateSnapshot | undefined;

  const continuityNotes: string[] = Array.isArray(workflow?.storyDraft?.continuityNotes)
    ? (workflow!.storyDraft!.continuityNotes as string[])
    : [];
  const autoContinuityNotes = continuityNotes.filter((note) => note.includes('自动补写'));
  const manualContinuityNotes = continuityNotes.filter((note) => !note.includes('自动补写'));

  const formatAnchorPreview = (anchors?: ClueAnchor[]) => {
    if (!anchors || anchors.length === 0) return null;
    const preview = anchors
      .slice(0, 2)
      .map((anchor) => `第${anchor.chapter}章·段落${anchor.paragraph}`)
      .join('，');
    return `（已定位：${preview}${anchors.length > 2 ? '…' : ''}）`;
  };

  const renderStageInsight = useCallback(
    (stageId: string): React.ReactNode => {
      switch (stageId) {
        case 'stage1_planning': {
          if (!clueDiagnostics) return null;
          const { unsupportedInferences, orphanClues } = clueDiagnostics;
          return (
            <div className="rounded-lg border border-slate-100 bg-slate-50/80 p-3 text-[11px] text-slate-600">
              <p className="font-medium text-slate-700">线索公平性</p>
              <p className="mt-1">
                缺少支撑推论：
                <span className={unsupportedInferences.length ? 'text-rose-600 font-semibold' : 'text-emerald-600'}>
                  {unsupportedInferences.length}
                </span>
                ，孤立线索：
                <span className={orphanClues.length ? 'text-amber-600 font-semibold' : 'text-emerald-600'}>
                  {orphanClues.length}
                </span>
              </p>
              {unsupportedInferences.length > 0 && (
                <div className="mt-2 space-y-1">
                  <p className="text-rose-600">需补写支撑的推论：</p>
                  <ul className="space-y-2">
                    {unsupportedInferences.slice(0, 3).map((issue) => (
                      <li key={issue.id} className="leading-5">
                        <p>
                          <span className="font-medium">{issue.id}</span> · {issue.text || '（无描述）'}{' '}
                          {formatAnchorPreview(issue.anchors)}
                        </p>
                        {issue.missingSupports && issue.missingSupports.length > 0 && (
                          <p className="text-slate-500">
                            缺少支撑：{issue.missingSupports.slice(0, 4).join('、')}
                            {issue.missingSupports.length > 4 ? '…' : ''}
                          </p>
                        )}
                      </li>
                    ))}
                    {unsupportedInferences.length > 3 && (
                      <li className="text-rose-500">…… 还有 {unsupportedInferences.length - 3} 条待处理</li>
                    )}
                  </ul>
                </div>
              )}
              {orphanClues.length > 0 && (
                <div className="mt-2 space-y-1">
                  <p className="text-amber-600">未被消费的线索：</p>
                  <ul className="space-y-2">
                    {orphanClues.slice(0, 3).map((issue) => (
                      <li key={issue.id} className="leading-5">
                        <p>
                          <span className="font-medium">{issue.id}</span> · {issue.text || '（无描述）'}{' '}
                          {formatAnchorPreview(issue.anchors)}
                        </p>
                        {issue.consumers && issue.consumers.length > 0 && (
                          <p className="text-slate-500">
                            尚未引用：{issue.consumers.slice(0, 4).join('、')}
                            {issue.consumers.length > 4 ? '…' : ''}
                          </p>
                        )}
                      </li>
                    ))}
                    {orphanClues.length > 3 && (
                      <li className="text-amber-600">…… 还有 {orphanClues.length - 3} 条待回收</li>
                    )}
                  </ul>
                </div>
              )}
              {!unsupportedInferences.length && !orphanClues.length && (
                <p className="mt-2 text-emerald-600">当前线索图已通过公平性自检。</p>
              )}
            </div>
          );
        }
        case 'stage2_writing': {
          if (!anchorsSummary) return null;
          const { unresolvedClues, unresolvedInferences, mappedClues, mappedInferences } = anchorsSummary;
          return (
            <div className="rounded-lg border border-slate-100 bg-white/70 p-3 text-[11px] text-slate-600">
              <p className="font-medium text-slate-700">锚点同步情况</p>
              <p className="mt-1">
                已定位线索 {mappedClues} 条，推论 {mappedInferences} 条。
                {unresolvedClues.length || unresolvedInferences.length ? ' 待补锚点：' : ' 已全部落地。'}
              </p>
              {(unresolvedClues.length > 0 || unresolvedInferences.length > 0) && (
                <ul className="mt-2 space-y-1">
                  {unresolvedClues.slice(0, 3).map((id) => (
                    <li key={id} className="text-amber-600">线索未落地：{id}</li>
                  ))}
                  {unresolvedClues.length > 3 && (
                    <li className="text-amber-600">…… 还有 {unresolvedClues.length - 3} 条线索待补</li>
                  )}
                  {unresolvedInferences.slice(0, 3).map((id) => (
                    <li key={id} className="text-rose-600">推论未落地：{id}</li>
                  ))}
                  {unresolvedInferences.length > 3 && (
                    <li className="text-rose-600">…… 还有 {unresolvedInferences.length - 3} 条推论待补</li>
                  )}
                </ul>
              )}
            </div>
          );
        }
        case 'stage4_revision': {
          if (!revisionPlan) return null;
          const { mustFix, warnings, suggestions } = revisionPlan;
          return (
            <div className="rounded-lg border border-purple-100 bg-purple-50/60 p-3 text-[11px] text-purple-700">
              <p className="font-medium text-purple-800">修订计划</p>
              <p className="mt-1">
                Must Fix：<span className={mustFix.length ? 'font-semibold text-rose-600' : 'text-emerald-700'}>{mustFix.length}</span>
                ，警告：<span className={warnings.length ? 'font-semibold text-amber-600' : 'text-emerald-700'}>{warnings.length}</span>
              </p>
              {mustFix.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {mustFix.slice(0, 3).map((item) => (
                    <li key={item.id} className="leading-5 text-rose-700">
                      <span className="font-medium">{item.id}</span> · {item.detail}
                    </li>
                  ))}
                  {mustFix.length > 3 && (
                    <li className="text-rose-600">…… 还有 {mustFix.length - 3} 条必修项</li>
                  )}
                </ul>
              )}
              {warnings.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {warnings.slice(0, 2).map((item) => (
                    <li key={item.id} className="leading-5 text-amber-700">
                      <span className="font-medium">{item.id}</span> · {item.detail}
                    </li>
                  ))}
                  {warnings.length > 2 && (
                    <li className="text-amber-600">…… 还有 {warnings.length - 2} 条警告待核对</li>
                  )}
                </ul>
              )}
              {suggestions.length > 0 && mustFix.length === 0 && warnings.length === 0 && (
                <p className="mt-2 text-purple-600">建议：{suggestions[0]}</p>
              )}
              {autoContinuityNotes.length > 0 && (
                <div className="mt-2 border-t border-purple-100 pt-2 text-emerald-700">
                  <p className="font-medium">系统已自动补写</p>
                  <ul className="mt-1 space-y-1">
                    {autoContinuityNotes.slice(0, 3).map((note, index) => (
                      <li key={`auto-${index}`} className="leading-5">
                        {note}
                      </li>
                    ))}
                    {autoContinuityNotes.length > 3 && (
                      <li>…… 还有 {autoContinuityNotes.length - 3} 项自动修复</li>
                    )}
                  </ul>
                </div>
              )}
              {manualContinuityNotes.length > 0 && (
                <div className="mt-2 border-t border-purple-100 pt-2 text-slate-600">
                  <p className="font-medium text-purple-800">连贯性提醒</p>
                  <ul className="mt-1 space-y-1">
                    {manualContinuityNotes.slice(0, 3).map((note, index) => (
                      <li key={`manual-${index}`} className="leading-5">
                        {note}
                      </li>
                    ))}
                    {manualContinuityNotes.length > 3 && (
                      <li>…… 还有 {manualContinuityNotes.length - 3} 条待人工确认</li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          );
        }
        case 'stage5_validation': {
          const gates = stage5Snapshot?.gates ?? [];
          if (gates.length === 0 && !clueDiagnostics) return null;
          return (
            <div className="rounded-lg border border-emerald-100 bg-emerald-50/70 p-3 text-[11px] text-emerald-700">
              <p className="font-medium text-emerald-800">终局 Gate 结果</p>
              {gates.length > 0 ? (
                <ul className="mt-1 space-y-1">
                  {gates.map((gate) => {
                    const verdict = gate.verdict;
                    const color = verdict === 'pass' ? 'text-emerald-700' : verdict === 'warn' ? 'text-amber-700' : 'text-rose-700';
                    return (
                      <li key={gate.name} className={`leading-5 ${color}`}>
                        <span className="font-semibold">{gate.name}</span> · {verdict.toUpperCase()}
                        {gate.reason ? `：${gate.reason}` : ''}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="mt-1">暂无 Gate 记录。</p>
              )}
              {clueDiagnostics && (clueDiagnostics.unsupportedInferences.length > 0 || clueDiagnostics.orphanClues.length > 0) && (
                <p className="mt-2 text-rose-700">
                  仍需处理推论 {clueDiagnostics.unsupportedInferences.length} 条、孤立线索 {clueDiagnostics.orphanClues.length} 条。
                </p>
              )}
            </div>
          );
        }
        default:
          return null;
      }
    },
    [anchorsSummary, clueDiagnostics, revisionPlan, stage5Snapshot, autoContinuityNotes, manualContinuityNotes],
  );

  const statusPriority = useCallback((status: WorkflowStageStatus | 'idle' | undefined) => {
    switch (status) {
      case 'failed':
        return 4;
      case 'completed':
        return 3;
      case 'running':
        return 2;
      case 'pending':
        return 1;
      case 'idle':
        return 0;
      default:
        return 0;
    }
  }, []);

  const mergedStageStatus = useMemo<Record<string, WorkflowEvent>>(() => {
    if (!stageStateMap) {
      return stageStatus;
    }
    const merged: Record<string, WorkflowEvent> = { ...stageStatus };
    const nowIso = new Date().toISOString();
    stageStateMap.forEach((state, stageId) => {
      const existing = merged[stageId];
      const existingPriority = statusPriority(existing?.status as WorkflowStageStatus | undefined);
      const statePriority = statusPriority(state.status);
      if (!existing || statePriority >= existingPriority) {
        const timestamp = state.finishedAt ?? state.startedAt ?? nowIso;
        merged[stageId] = {
          workflowId: workflowId ?? '',
          category: 'stage',
          stageId,
          status: state.status,
          message: stageLabels[stageId] ? `${stageLabels[stageId]} ${state.status === 'completed' ? '完成' : state.status === 'failed' ? '失败' : '状态更新'}` : '状态更新',
          eventId: `state-sync-${stageId}`,
          timestamp,
          meta: {
            detailType: 'state-sync',
            stageStatus: state.status,
          },
        };
      }
    });
    return merged;
  }, [stageStatus, stageStateMap, statusPriority, workflowId]);

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

  const derivedOverallStatus = useMemo<WorkflowStageStatus | 'idle'>(() => {
    const fallback = (() => {
      if (!stageStates || stageStates.length === 0) return undefined;
      if (stageStates.some((state) => state.status === 'failed')) return 'failed';
      if (stageStates.every((state) => state.status === 'completed')) return 'completed';
      if (stageStates.some((state) => state.status === 'running')) return 'running';
      if (stageStates.some((state) => state.status === 'pending')) return 'pending';
      return 'idle';
    })();

    if (workflowStatus && (!fallback || statusPriority(workflowStatus) > statusPriority(fallback))) {
      return workflowStatus;
    }

    if (fallback) {
      if (overallStatus === 'idle' || (overallStatus === 'pending' && statusPriority(fallback) > statusPriority(overallStatus))) {
        return fallback;
      }
      if (overallStatus === 'running' && statusPriority(fallback) > statusPriority(overallStatus)) {
        return fallback;
      }
    }
    return overallStatus;
  }, [overallStatus, stageStates, workflowStatus, statusPriority]);

  const overallBadge = statusColors[derivedOverallStatus];

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

  const lastOverallStatusRef = useRef<WorkflowStageStatus | 'idle' | null>(null);

  useEffect(() => {
    if (overallStatus === 'completed' && lastOverallStatusRef.current !== 'completed') {
      onManualRefresh?.();
    }
    lastOverallStatusRef.current = overallStatus;
  }, [overallStatus, onManualRefresh]);

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
                  const stageEventStatus = mergedStageStatus[stageId]?.status;
                  const fallbackStageState = stageStateMap?.get(stageId);
                  const badgeStatus: WorkflowStageStatus =
                    stageEventStatus === 'running' ||
                    stageEventStatus === 'completed' ||
                    stageEventStatus === 'failed'
                      ? stageEventStatus
                      : (fallbackStageState?.status ?? 'pending');
                  const stageEvents = groupedStageEvents[stageId] ?? [];
                  const latestStageMeta =
                    stageEvents.length > 0 ? stageEvents[stageEvents.length - 1].meta ?? {} : {};
                  const durationMs =
                    typeof latestStageMeta.durationMs === 'number' ? latestStageMeta.durationMs : undefined;
                  const activity = stageActivity[stageId] as WorkflowStageExecution | undefined;
                  const commands = activity?.commands ?? [];
                  const currentCommand = activity?.currentCommandId
                    ? commands.find((cmd) => cmd.id === activity.currentCommandId)
                    : undefined;
                  const recentLogs = activity?.logs ? activity.logs.slice(-5) : [];
                  const artifacts = activity?.artifacts ?? [];
                  const insights = renderStageInsight(stageId);
                  const hasDetails =
                    Boolean(currentCommand) || commands.length > 0 || recentLogs.length > 0 || artifacts.length > 0;

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
                      {insights && (
                        <div className="mt-4 text-xs text-slate-600 space-y-3">
                          {insights}
                        </div>
                      )}
                      {hasDetails && (
                        <div className="mt-4 space-y-4 text-xs text-slate-600">
                          {currentCommand && (
                            <div className="rounded-lg border border-blue-100 bg-blue-50/50 px-3 py-2">
                              <p className="text-[11px] font-medium text-blue-700">当前执行</p>
                              <p className="mt-1 font-semibold text-slate-800">{currentCommand.label}</p>
                              {currentCommand.command && (
                                <p className="mt-1 text-[11px] text-slate-500 break-words">{currentCommand.command}</p>
                              )}
                              <div className="mt-2 flex items-center gap-2 text-[11px]">
                                <span
                                  className={`rounded-full px-2 py-0.5 ${commandStatusColors[currentCommand.status]}`}
                                >
                                  {commandStatusLabels[currentCommand.status]}
                                </span>
                                {currentCommand.startedAt && (
                                  <span className="text-slate-400">
                                    开始于 {formatTime(currentCommand.startedAt)}
                                  </span>
                                )}
                              </div>
                            </div>
                          )}
                          {commands.length > 0 && (
                            <div>
                              <p className="text-[11px] font-medium text-slate-500">执行记录</p>
                              <ul className="mt-2 space-y-2">
                                {commands
                                  .slice()
                                  .reverse()
                                  .map((command) => (
                                    <li
                                      key={command.id}
                                      className="rounded-lg border border-slate-100 bg-slate-50/70 px-3 py-2 shadow-sm"
                                    >
                                      <div className="flex items-start justify-between gap-2">
                                        <span className="text-sm font-semibold text-slate-800">{command.label}</span>
                                        <span
                                          className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide ${commandStatusColors[command.status]}`}
                                        >
                                          {commandStatusLabels[command.status]}
                                        </span>
                                      </div>
                                      {command.command && (
                                        <p className="mt-1 text-[11px] text-slate-500 break-words">{command.command}</p>
                                      )}
                                      {command.resultSummary && (
                                        <p className="mt-1 text-[11px] text-slate-500">{command.resultSummary}</p>
                                      )}
                                      {command.errorMessage && (
                                        <p className="mt-1 text-[11px] text-rose-600">{command.errorMessage}</p>
                                      )}
                                      <div className="mt-1 flex flex-wrap gap-2 text-[10px] text-slate-400">
                                        {command.startedAt && <span>开始 {formatTime(command.startedAt)}</span>}
                                        {command.finishedAt && <span>结束 {formatTime(command.finishedAt)}</span>}
                                      </div>
                                    </li>
                                  ))}
                              </ul>
                            </div>
                          )}
                          {recentLogs.length > 0 && (
                            <div>
                              <p className="text-[11px] font-medium text-slate-500">实时日志</p>
                              <ul className="mt-2 max-h-44 space-y-1 overflow-y-auto rounded-lg border border-slate-100 bg-white/80 px-3 py-2">
                                {recentLogs.map((log) => {
                                  const level = log.level ?? 'info';
                                  const levelColor =
                                    level === 'error'
                                      ? 'text-rose-600'
                                      : level === 'warn'
                                        ? 'text-amber-600'
                                        : level === 'debug'
                                          ? 'text-slate-400'
                                          : 'text-slate-600';
                                  return (
                                    <li key={log.id} className={`text-[11px] leading-5 ${levelColor}`}>
                                      <span className="mr-2 text-[10px] text-slate-400">{formatTime(log.timestamp)}</span>
                                      {log.message}
                                    </li>
                                  );
                                })}
                              </ul>
                            </div>
                          )}
                          {artifacts.length > 0 && (
                            <div>
                              <p className="text-[11px] font-medium text-slate-500">阶段产物</p>
                              <ul className="mt-2 space-y-2">
                                {artifacts.map((artifact) => (
                                  <li
                                    key={artifact.id}
                                    className="rounded-lg border border-emerald-100 bg-emerald-50/50 px-3 py-2 text-[11px] text-emerald-700"
                                  >
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="font-semibold text-emerald-800">{artifact.label}</span>
                                      <span className="rounded px-2 py-0.5 text-[10px] uppercase text-emerald-600">
                                        {artifact.type}
                                      </span>
                                    </div>
                                    {artifact.preview && (
                                      <pre className="mt-1 max-h-32 whitespace-pre-wrap text-[10px] text-emerald-700/80 overflow-hidden">
                                        {artifact.preview}
                                      </pre>
                                    )}
                                    {artifact.url && (
                                      <a
                                        href={artifact.url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="mt-2 inline-block text-[11px] text-emerald-700 underline"
                                      >
                                        查看详情
                                      </a>
                                    )}
                                    <div className="mt-1 text-[10px] text-emerald-400">
                                      {formatTime(artifact.createdAt)}
                                    </div>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}
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
