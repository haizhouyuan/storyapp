import { randomUUID } from 'crypto';
import type { Response } from 'express';
import type { WorkflowEvent, WorkflowStageStatus } from '@storyapp/shared';

type Client = {
  res: Response;
};

const clients = new Map<string, Set<Client>>();
const history = new Map<string, WorkflowEvent[]>();

const MAX_HISTORY = parseInt(process.env.WORKFLOW_EVENT_HISTORY_LIMIT || '200', 10);

const getHistory = (workflowId: string): WorkflowEvent[] => {
  return history.get(workflowId) ?? [];
};

const addEventToHistory = (event: WorkflowEvent) => {
  const events = getHistory(event.workflowId);
  events.push(event);
  while (events.length > MAX_HISTORY) {
    events.shift();
  }
  history.set(event.workflowId, events);
};

const sendEvent = (client: Client, event: WorkflowEvent) => {
  try {
    client.res.write(`data: ${JSON.stringify(event)}\n\n`);
  } catch (error) {
    // 如果写入失败，则忽略，由心跳或 close 处理清理
  }
};

type PublishEventInput = Omit<WorkflowEvent, 'eventId' | 'timestamp'> & {
  eventId?: string;
  timestamp?: string;
};

export const publishWorkflowEvent = (input: PublishEventInput) => {
  const event: WorkflowEvent = {
    ...input,
    eventId: input.eventId ?? randomUUID(),
    timestamp: input.timestamp ?? new Date().toISOString(),
  };

  addEventToHistory(event);

  const targetClients = clients.get(event.workflowId);
  if (!targetClients) return;

  for (const client of targetClients) {
    sendEvent(client, event);
  }
};

export const registerWorkflowStream = (workflowId: string, res: Response) => {
  const client: Client = { res };
  if (!clients.has(workflowId)) {
    clients.set(workflowId, new Set());
  }
  clients.get(workflowId)!.add(client);

  // 发送历史事件
  const events = getHistory(workflowId);
  for (const event of events) {
    sendEvent(client, event);
  }

  // Heartbeat keeps connection alive through proxies
  const heartbeat = setInterval(() => {
    try {
      client.res.write(':heartbeat\n\n');
    } catch {
      // ignore write errors; close handler will clean up
    }
  }, Number(process.env.WORKFLOW_STREAM_HEARTBEAT_MS || 25000));

  return () => {
    clearInterval(heartbeat);
    const set = clients.get(workflowId);
    if (!set) return;
    set.delete(client);
    if (set.size === 0) {
      clients.delete(workflowId);
    }
  };
};

export const clearWorkflowEvents = (workflowId: string) => {
  history.delete(workflowId);
};

export const createStageEvent = (workflowId: string, stageId: string, status: WorkflowStageStatus, message: string, meta?: Record<string, unknown>) => {
  publishWorkflowEvent({
    workflowId,
    category: 'stage',
    stageId,
    status,
    message,
    meta,
  });
};

export const createInfoEvent = (workflowId: string, message: string, meta?: Record<string, unknown>) => {
  publishWorkflowEvent({
    workflowId,
    category: 'info',
    message,
    meta,
  });
};

export const createTtsEvent = (
  workflowId: string,
  status: 'success' | 'error',
  message: string,
  meta?: Record<string, unknown>,
) => {
  publishWorkflowEvent({
    workflowId,
    category: 'tts',
    status,
    message,
    meta,
  });
};

export const getWorkflowEventHistory = (workflowId: string): WorkflowEvent[] => {
  return [...getHistory(workflowId)];
};
