import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { WorkflowEvent, WorkflowStageStatus } from '@storyapp/shared';
import toast from 'react-hot-toast';

const STAGE_ORDER = ['stage1_planning', 'stage2_writing', 'stage3_review', 'stage4_validation'];

type StageStatusMap = Record<string, WorkflowEvent>;

interface UseWorkflowStreamResult {
  events: WorkflowEvent[];
  stageStatus: StageStatusMap;
  ttsEvents: WorkflowEvent[];
  infoEvents: WorkflowEvent[];
  overallStatus: WorkflowStageStatus | 'idle';
  isConnected: boolean;
  error?: string;
  refresh: () => void;
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
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [reconnectVersion, setReconnectVersion] = useState(0);
  const hadInitialConnectionRef = useRef(false);
  const connectionInterruptedRef = useRef(false);

  const refresh = useCallback(() => {
    setError(undefined);
    setIsConnected(false);
    connectionInterruptedRef.current = false;
    setReconnectVersion((version) => version + 1);
  }, []);

  useEffect(() => {
    if (!workflowId) {
      setEvents([]);
      setIsConnected(false);
       setError(undefined);
       hadInitialConnectionRef.current = false;
       connectionInterruptedRef.current = false;
      return;
    }

    let aborted = false;
    const controller = new AbortController();

    async function loadHistory() {
      try {
        const response = await fetch(`/api/story-workflows/${workflowId}/events`, { signal: controller.signal });
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
          toast.error(err?.message || '获取工作流事件失败');
        }
      }
    }

    loadHistory();

    const eventSource = new EventSource(`/api/story-workflows/${workflowId}/stream`);
    eventSource.onopen = () => {
      setIsConnected(true);
      setError(undefined);
      if (connectionInterruptedRef.current) {
        toast.success('事件流已重新连接');
        connectionInterruptedRef.current = false;
      }
      hadInitialConnectionRef.current = true;
    };
    eventSource.onmessage = (event) => {
      try {
        const parsed: WorkflowEvent = JSON.parse(event.data);
        setEvents((prev) => dedupeEvents(prev, parsed));
      } catch (err: any) {
        setError(err?.message || '解析工作流事件失败');
        toast.error(err?.message || '解析工作流事件失败');
      }
    };
    eventSource.onerror = () => {
      setIsConnected(false);
      setError('事件流连接断开，稍后将自动重连');
      if (hadInitialConnectionRef.current) {
        toast.error('事件流连接断开，稍后将自动重连');
      }
      connectionInterruptedRef.current = true;
      eventSource.close();
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
      eventSource.close();
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };
  }, [workflowId, refresh, reconnectVersion]);

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
  };
}
