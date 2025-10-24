import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  WorkflowEvent,
  WorkflowStageStatus,
  WorkflowStageExecution,
  WorkflowStageCommand,
  WorkflowStageArtifact,
  WorkflowStageLogEntry,
  WorkflowStageExecutionSummary,
} from '@storyapp/shared';
import toast from 'react-hot-toast';
import { useSseLogger } from './useSseLogger';

const STAGE_ORDER = [
  'stage1_planning',
  'stage2_writing',
  'stage3_review',
  'stage4_revision',
  'stage5_validation',
];

const API_BASE = (process.env.REACT_APP_API_URL || '').replace(/\/$/, '');
const buildApiUrl = (path: string): string => {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  if (!API_BASE) {
    return `/api${normalized}`;
  }
  return `${API_BASE}${normalized}`;
};

type StageStatusMap = Record<string, WorkflowEvent>;
type StageActivityMap = Record<string, WorkflowStageExecution>;

interface UseWorkflowStreamResult {
  events: WorkflowEvent[];
  stageStatus: StageStatusMap;
  ttsEvents: WorkflowEvent[];
  infoEvents: WorkflowEvent[];
  overallStatus: WorkflowStageStatus | 'idle';
  isConnected: boolean;
  error?: string;
  refresh: () => void;
  stageActivity: StageActivityMap;
}

const dedupeEvents = (existing: WorkflowEvent[], incoming: WorkflowEvent): WorkflowEvent[] => {
  if (existing.some((event) => event.eventId === incoming.eventId)) {
    return existing;
  }
  return [...existing, incoming].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
};

export function useWorkflowStream(workflowId?: string | null): UseWorkflowStreamResult {
  const [events, setEvents] = useState<WorkflowEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [stageActivity, setStageActivity] = useState<StageActivityMap>({});
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [reconnectVersion, setReconnectVersion] = useState(0);
  const hadInitialConnectionRef = useRef(false);
  const connectionInterruptedRef = useRef(false);
  const failureRefreshRef = useRef(false);
  const [eventSource, setEventSource] = useState<EventSource | null>(null);
  
  // 🔧 统一 SSE 日志管理
  useSseLogger(eventSource, { 
    enabled: process.env.NODE_ENV === 'development',
    prefix: `SSE-${workflowId?.slice(0, 8) || 'unknown'}`
  });

  const applyStageDetailEvent = useCallback((event: WorkflowEvent) => {
    if (event.category !== 'stage' || !event.stageId) return;
    const meta = (event.meta ?? {}) as Record<string, any>;
    const detailType = meta.detailType as string | undefined;
    const detail = meta.detail;
    if (!detailType) return;
    setStageActivity((prev) => {
      const stageId = event.stageId!;
      const existing = prev[stageId];
      const nextStage: WorkflowStageExecution = existing
        ? { ...existing }
        : {
            workflowId: event.workflowId,
            stageId,
            label: stageId,
            status: 'pending',
            commands: [],
            logs: [],
            artifacts: [],
            updatedAt: event.timestamp,
          };
      let changed = false;
      if (!nextStage.workflowId) {
        nextStage.workflowId = event.workflowId;
      }
      switch (detailType) {
        case 'status': {
          const status = (detail?.status as WorkflowStageStatus) ?? nextStage.status;
          if (status !== nextStage.status) {
            nextStage.status = status;
            if (status === 'running' && !nextStage.startedAt) {
              nextStage.startedAt = event.timestamp;
            }
            if ((status === 'completed' || status === 'failed') && !nextStage.finishedAt) {
              nextStage.finishedAt = event.timestamp;
            }
            changed = true;
          }
          break;
        }
        case 'start':
        case 'complete':
        case 'error': {
          const command = detail?.command as WorkflowStageCommand | undefined;
          if (!command?.id) {
            break;
          }
          const commands = nextStage.commands.slice();
          const index = commands.findIndex((item) => item.id === command.id);
          if (index >= 0) {
            const prevCommand = commands[index];
            const merged = { ...prevCommand, ...command };
            commands[index] = merged;
          } else {
            commands.push(command);
          }
          nextStage.commands = commands;
          if (detailType === 'start') {
            nextStage.currentCommandId = command.id;
          } else if (nextStage.currentCommandId === command.id) {
            nextStage.currentCommandId = undefined;
          }
          changed = true;
          break;
        }
        case 'log': {
          const log = detail?.log as WorkflowStageLogEntry | undefined;
          if (!log?.id) break;
          if (!nextStage.logs.some((entry) => entry.id === log.id)) {
            nextStage.logs = [...nextStage.logs, log].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
            changed = true;
          }
          break;
        }
        case 'artifact': {
          const artifact = detail?.artifact as WorkflowStageArtifact | undefined;
          if (!artifact?.id) break;
          if (!nextStage.artifacts.some((item) => item.id === artifact.id)) {
            nextStage.artifacts = [...nextStage.artifacts, artifact];
            changed = true;
          }
          break;
        }
        default:
          break;
      }
      if (!changed) {
        return prev;
      }
      nextStage.updatedAt = event.timestamp;
      return {
        ...prev,
        [stageId]: nextStage,
      };
    });
  }, []);

  const applyStageSummary = useCallback((summary: WorkflowStageExecutionSummary | undefined) => {
    if (!summary || !Array.isArray(summary.stages)) {
      setStageActivity({});
      return;
    }
    const map: StageActivityMap = {};
    summary.stages.forEach((stage) => {
      map[stage.stageId] = {
        ...stage,
        commands: stage.commands ?? [],
        logs: stage.logs ?? [],
        artifacts: stage.artifacts ?? [],
      };
    });
    setStageActivity(map);
  }, []);

  const fetchStageActivity = useCallback(
    async (signal?: AbortSignal) => {
      if (!workflowId) {
        return;
      }
      try {
        const response = await fetch(buildApiUrl(`/story-workflows/${workflowId}/stage-activity`), {
          signal,
        });
        if (!response.ok) {
          return;
        }
        const data = await response.json();
        applyStageSummary(data?.data as WorkflowStageExecutionSummary | undefined);
      } catch (err: any) {
        if (signal?.aborted) return;
        console.warn('获取阶段活动失败', err);
      }
    },
    [workflowId, applyStageSummary],
  );

  const refresh = useCallback(() => {
    setError(undefined);
    setIsConnected(false);
    setReconnectVersion((version) => version + 1);
  }, []);

  useEffect(() => {
    if (!workflowId) {
      setEvents([]);
      setIsConnected(false);
       setError(undefined);
       hadInitialConnectionRef.current = false;
       connectionInterruptedRef.current = false;
      setStageActivity({});
      return;
    }

    let aborted = false;
    const controller = new AbortController();

    async function loadHistory() {
      try {
        const response = await fetch(buildApiUrl(`/story-workflows/${workflowId}/events`), {
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`加载工作流事件失败：${response.statusText}`);
        }
        const data = await response.json();
        if (!aborted) {
          const history: WorkflowEvent[] = Array.isArray(data?.data) ? data.data : [];
          setEvents(history.sort((a, b) => a.timestamp.localeCompare(b.timestamp)));
        }
      } catch (err: any) {
        if (!aborted) {
          setError(err?.message || '获取工作流事件失败');
          toast.error(err?.message || '获取工作流事件失败', { id: 'workflow-stream-history' });
        }
      }
    }

    loadHistory();
    fetchStageActivity(controller.signal);

    const es = new EventSource(buildApiUrl(`/story-workflows/${workflowId}/stream`));
    setEventSource(es); // 🔧 设置 EventSource 以便 useSseLogger 监控
    
    es.onopen = () => {
      setIsConnected(true);
      setError(undefined);
      if (connectionInterruptedRef.current) {
        toast.success('事件流已重新连接', { id: 'workflow-stream-status' });
        connectionInterruptedRef.current = false;
      }
      hadInitialConnectionRef.current = true;
    };
    es.onmessage = (event) => {
      try {
        const parsed: WorkflowEvent = JSON.parse(event.data);
        setEvents((prev) => dedupeEvents(prev, parsed));
        applyStageDetailEvent(parsed);
      } catch (err: any) {
        setError(err?.message || '解析工作流事件失败');
        toast.error(err?.message || '解析工作流事件失败', { id: 'workflow-stream-parse' });
      }
    };
    es.onerror = () => {
      setIsConnected(false);
      if (!connectionInterruptedRef.current) {
        setError('事件流连接断开，稍后将自动重连');
      }
      if (hadInitialConnectionRef.current && !connectionInterruptedRef.current) {
        toast.error('事件流连接断开，稍后将自动重连', { id: 'workflow-stream-status' });
      }
      connectionInterruptedRef.current = true;
      es.close();
      setEventSource(null); // 🔧 清理 EventSource 状态
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      reconnectTimeoutRef.current = setTimeout(() => {
        if (!aborted) {
          refresh();
        }
      }, 2000);
    };

    return () => {
      aborted = true;
      controller.abort();
      es.close();
      setEventSource(null); // 🔧 清理 EventSource 状态
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };
  }, [workflowId, refresh, reconnectVersion, applyStageDetailEvent, applyStageSummary, fetchStageActivity]);

  useEffect(() => {
    if (!workflowId) {
      failureRefreshRef.current = false;
      return;
    }
    const hasFailedStage = STAGE_ORDER.some((stageId) => stageStatus[stageId]?.status === 'failed');
    if (hasFailedStage) {
      if (!failureRefreshRef.current) {
        failureRefreshRef.current = true;
        fetchStageActivity();
      }
    } else {
      failureRefreshRef.current = false;
    }
  }, [workflowId, stageStatus, fetchStageActivity]);

  const stageStatus = useMemo<StageStatusMap>(() => {
    const map: StageStatusMap = {};
    for (const event of events) {
      if (event.category !== 'stage' || !event.stageId) continue;
      map[event.stageId] = event;
    }
    return map;
  }, [events]);

  const ttsEvents = useMemo(() => events.filter((event) => event.category === 'tts'), [events]);
  const infoEvents = useMemo(() => events.filter((event) => event.category === 'info'), [events]);

  const overallStatus: WorkflowStageStatus | 'idle' = useMemo(() => {
    if (!events.length) return 'idle';
    const orderedStatus = STAGE_ORDER.map((stageId) => stageStatus[stageId]?.status);
    if (orderedStatus.every((status) => status === 'completed')) {
      return 'completed';
    }
    if (orderedStatus.some((status) => status === 'failed')) {
      return 'failed';
    }
    if (orderedStatus.some((status) => status === 'running')) {
      return 'running';
    }
    return 'pending';
  }, [events.length, stageStatus]);

  return {
    events,
    stageStatus,
    ttsEvents,
    infoEvents,
    overallStatus,
    isConnected,
    error,
    refresh,
    stageActivity,
  };
}
