import { randomUUID } from 'crypto';

export type TaskStatus = 'pending' | 'success' | 'error';

export interface TtsTaskRecord {
  id: string;
  cacheKey: string;
  provider: string;
  status: TaskStatus;
  sessionId?: string;
  storyId?: string;
  voiceId?: string;
  segmentIndex?: number;
  textLength?: number;
  metadata?: Record<string, unknown>;
  requestId?: string;
  providerMetadata?: Record<string, unknown>;
  audioUrl?: string;
  durationMs?: number;
  cached?: boolean;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

interface TaskStartParams {
  cacheKey: string;
  provider: string;
  sessionId?: string;
  storyId?: string;
  voiceId?: string;
  segmentIndex?: number;
  textLength?: number;
  metadata?: Record<string, unknown>;
}

interface TaskSuccessParams {
  requestId: string;
  cached: boolean;
  audioUrl: string;
  durationMs?: number;
  providerMetadata?: Record<string, unknown>;
}

const TASK_TTL_MS = Number.parseInt(process.env.TTS_TASK_REGISTRY_TTL_MS || `${60 * 60 * 1000}`, 10);

const registry = new Map<string, TtsTaskRecord>();
const requestIndex = new Map<string, string>();
const providerTaskIndex = new Map<string, string>();
const sidIndex = new Map<string, string>();

const cleanupExpired = (now: number = Date.now()) => {
  for (const [taskId, record] of registry.entries()) {
    if (now - record.updatedAt > TASK_TTL_MS) {
      registry.delete(taskId);
      if (record.requestId) {
        requestIndex.delete(record.requestId);
      }
      const providerTaskId = String(record.providerMetadata?.taskId || '');
      if (providerTaskId) {
        providerTaskIndex.delete(providerTaskId);
      }
      const sid = String(record.providerMetadata?.sid || '');
      if (sid) {
        sidIndex.delete(sid);
      }
    }
  }
};

export const startTask = (params: TaskStartParams): TtsTaskRecord => {
  cleanupExpired();

  const task: TtsTaskRecord = {
    id: randomUUID(),
    cacheKey: params.cacheKey,
    provider: params.provider,
    status: 'pending',
    sessionId: params.sessionId,
    storyId: params.storyId,
    voiceId: params.voiceId,
    segmentIndex: params.segmentIndex,
    textLength: params.textLength,
    metadata: params.metadata,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  registry.set(task.id, task);
  return task;
};

export const completeTask = (taskId: string, params: TaskSuccessParams): TtsTaskRecord | undefined => {
  const record = registry.get(taskId);
  if (!record) return undefined;

  record.status = 'success';
  record.requestId = params.requestId;
  record.audioUrl = params.audioUrl;
  record.durationMs = params.durationMs;
  record.cached = params.cached;
  record.providerMetadata = params.providerMetadata;
  record.updatedAt = Date.now();

  registry.set(taskId, record);

  if (params.requestId) {
    requestIndex.set(params.requestId, taskId);
  }
  const providerTaskId = String(params.providerMetadata?.taskId || '');
  if (providerTaskId) {
    providerTaskIndex.set(providerTaskId, taskId);
  }
  const sid = String(params.providerMetadata?.sid || '');
  if (sid) {
    sidIndex.set(sid, taskId);
  }

  return record;
};

export const failTask = (taskId: string, error: Error | string, providerMetadata?: Record<string, unknown>): TtsTaskRecord | undefined => {
  const record = registry.get(taskId);
  if (!record) return undefined;

  const message = typeof error === 'string' ? error : error.message;
  record.status = 'error';
  record.error = message;
  record.providerMetadata = providerMetadata ?? record.providerMetadata;
  record.updatedAt = Date.now();

  registry.set(taskId, record);

  if (record.requestId) {
    requestIndex.set(record.requestId, taskId);
  }
  const providerTaskId = String(record.providerMetadata?.taskId || '');
  if (providerTaskId) {
    providerTaskIndex.set(providerTaskId, taskId);
  }
  const sid = String(record.providerMetadata?.sid || '');
  if (sid) {
    sidIndex.set(sid, taskId);
  }

  return record;
};

export const getTaskById = (taskId: string): TtsTaskRecord | undefined => {
  cleanupExpired();
  return registry.get(taskId);
};

export const findTask = (identifier: string): TtsTaskRecord | undefined => {
  cleanupExpired();
  if (registry.has(identifier)) {
    return registry.get(identifier);
  }
  const byRequest = requestIndex.get(identifier);
  if (byRequest && registry.has(byRequest)) {
    return registry.get(byRequest);
  }
  const byProvider = providerTaskIndex.get(identifier);
  if (byProvider && registry.has(byProvider)) {
    return registry.get(byProvider);
  }
  const bySid = sidIndex.get(identifier);
  if (bySid && registry.has(bySid)) {
    return registry.get(bySid);
  }
  return undefined;
};

interface ListOptions {
  provider?: string;
  status?: TaskStatus;
  limit?: number;
}

export const listTasks = (options: ListOptions = {}): TtsTaskRecord[] => {
  cleanupExpired();
  const limit = options.limit ?? 20;
  const tasks = Array.from(registry.values())
    .filter((task) => {
      if (options.provider && task.provider !== options.provider) return false;
      if (options.status && task.status !== options.status) return false;
      return true;
    })
    .sort((a, b) => b.updatedAt - a.updatedAt);

  return tasks.slice(0, limit);
};

export const findLatestTaskByStoryId = (storyId: string, provider?: string): TtsTaskRecord | undefined => {
  cleanupExpired();
  const tasks = Array.from(registry.values())
    .filter((task) => {
      if (task.storyId !== storyId) return false;
      if (provider && task.provider !== provider) return false;
      return true;
    })
    .sort((a, b) => b.updatedAt - a.updatedAt);

  return tasks[0];
};

export const getProviderSummary = (provider: string, windowMs: number = 60 * 60 * 1000) => {
  cleanupExpired();
  const now = Date.now();
  const tasks = Array.from(registry.values()).filter(
    (task) => task.provider === provider && now - task.updatedAt <= windowMs,
  );

  const summary = {
    total: tasks.length,
    success: tasks.filter((task) => task.status === 'success').length,
    error: tasks.filter((task) => task.status === 'error').length,
    pending: tasks.filter((task) => task.status === 'pending').length,
    lastError: undefined as (Pick<TtsTaskRecord, 'id' | 'requestId' | 'error' | 'updatedAt'> | undefined),
  };

  const latestError = tasks
    .filter((task) => task.status === 'error')
    .sort((a, b) => b.updatedAt - a.updatedAt)[0];

  if (latestError) {
    summary.lastError = {
      id: latestError.id,
      requestId: latestError.requestId,
      error: latestError.error,
      updatedAt: latestError.updatedAt,
    };
  }

  return summary;
};
