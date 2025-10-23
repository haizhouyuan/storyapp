import { randomUUID } from 'crypto';
import type { Response } from 'express';
import type { WorkflowEvent, WorkflowStageStatus } from '@storyapp/shared';
import { createLogger } from '../config/logger';

const logger = createLogger('services:workflowEventBus');

type Client = {
  res: Response;
  connected: boolean;
  failedWrites: number;
};

const clients = new Map<string, Set<Client>>();
const history = new Map<string, WorkflowEvent[]>();

const MAX_HISTORY = parseInt(process.env.WORKFLOW_EVENT_HISTORY_LIMIT || '200', 10);
const MAX_FAILED_WRITES = 3; // 连续失败3次后断开连接

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

const sendEvent = (client: Client, event: WorkflowEvent): boolean => {
  if (!client.connected) {
    return false;
  }

  try {
    const success = client.res.write(`data: ${JSON.stringify(event)}\n\n`);
    if (!success) {
      logger.warn('SSE写入缓冲区已满，等待 drain');
      client.res.once('drain', () => {
        logger.debug('SSE写入缓冲区已恢复');
        client.failedWrites = 0;
      });
    } else {
      client.failedWrites = 0;
    }
    return true;
  } catch (error: any) {
    client.failedWrites++;
    logger.error({ err: error, failedWrites: client.failedWrites }, 'SSE写入失败');
    
    if (client.failedWrites >= MAX_FAILED_WRITES) {
      client.connected = false;
    }
    return false;
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
  if (!targetClients || targetClients.size === 0) {
    logger.debug({ 
      workflowId: event.workflowId, 
      eventType: event.category 
    }, '📤 No clients to send event');
    return;
  }

  logger.info({ 
    workflowId: event.workflowId, 
    eventType: event.category,
    eventId: event.eventId,
    clientCount: targetClients.size 
  }, '📤 Publishing event to clients');

  let successCount = 0;
  const deadClients: Client[] = [];

  for (const client of targetClients) {
    const success = sendEvent(client, event);
    if (success) {
      successCount++;
      logger.debug({ workflowId: event.workflowId }, '✅ Event sent successfully');
    } else if (!client.connected) {
      deadClients.push(client);
      logger.warn({ workflowId: event.workflowId }, '💀 Client dead, marking for cleanup');
    }
  }

  // 🔧 清理僵尸连接
  if (deadClients.length > 0) {
    for (const client of deadClients) {
      try {
        client.res.end(); // 主动关闭响应
      } catch (err) {
        logger.error({ err }, 'Failed to close dead client');
      }
      targetClients.delete(client);
    }
    
    logger.info({ 
      workflowId: event.workflowId, 
      removed: deadClients.length, 
      remaining: targetClients.size 
    }, '🧹 Cleaned up dead clients');
    
    // 如果所有客户端都死了，清理整个工作流
    if (targetClients.size === 0) {
      clients.delete(event.workflowId);
      logger.info({ workflowId: event.workflowId }, '🧹 All clients dead, removed workflow from map');
    }
  }

  logger.info({ 
    workflowId: event.workflowId, 
    eventType: event.category,
    successCount, 
    total: targetClients.size + deadClients.length,
    deadCount: deadClients.length
  }, '📤 Event publishing completed');
};

export const registerWorkflowStream = (workflowId: string, res: Response) => {
  const client: Client = { 
    res, 
    connected: true,
    failedWrites: 0
  };
  
  if (!clients.has(workflowId)) {
    clients.set(workflowId, new Set());
  }
  const clientSet = clients.get(workflowId)!;
  clientSet.add(client);

  logger.info({ workflowId, totalClients: clientSet.size }, 'SSE客户端已注册');

  // 发送历史事件
  const events = getHistory(workflowId);
  logger.debug({ workflowId, historyCount: events.length }, '发送历史事件');
  
  for (const event of events) {
    if (!sendEvent(client, event)) {
      logger.warn({ workflowId }, '发送历史事件失败，停止发送');
      break;
    }
  }

  // Heartbeat keeps connection alive through proxies
  const heartbeat = setInterval(() => {
    if (!client.connected) {
      logger.warn({ workflowId }, '客户端已断开，停止心跳');
      clearInterval(heartbeat);
      return;
    }

    try {
      const success = client.res.write(':heartbeat\n\n');
      if (!success) {
        logger.warn({ workflowId }, 'SSE心跳写入缓冲区已满，等待 drain');
        client.res.once('drain', () => {
          client.failedWrites = 0;
          logger.debug({ workflowId }, 'SSE心跳写入缓冲区已恢复');
        });
      } else {
        client.failedWrites = 0;
      }
    } catch (error: any) {
      logger.error({ err: error, workflowId }, 'SSE心跳写入异常');
      client.connected = false;
      clearInterval(heartbeat);
    }
  }, Number(process.env.WORKFLOW_STREAM_HEARTBEAT_MS || 10000));

  return () => {
    clearInterval(heartbeat);
    client.connected = false;
    
    const set = clients.get(workflowId);
    if (!set) {
      logger.warn({ workflowId }, 'workflowId对应的客户端集合不存在');
      return;
    }
    
    set.delete(client);
    logger.info({ workflowId, remainingClients: set.size }, 'SSE客户端已移除');
    
    if (set.size === 0) {
      clients.delete(workflowId);
      logger.info({ workflowId }, '所有SSE客户端已断开，清理资源');
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
