import { randomUUID } from 'crypto';
import type {
  WorkflowStageArtifact,
  WorkflowStageCommand,
  WorkflowStageExecution,
  WorkflowStageExecutionSummary,
  WorkflowStageLogEntry,
  WorkflowStageStatus,
} from '@storyapp/shared';
import { publishWorkflowEvent } from './workflowEventBus';

type StageActivityState = WorkflowStageExecution & {
  updatedAtMs: number;
};

type CommandUpdate =
  | { type: 'start'; command: WorkflowStageCommand }
  | { type: 'complete'; command: WorkflowStageCommand }
  | { type: 'error'; command: WorkflowStageCommand };

type DetailUpdate =
  | CommandUpdate
  | { type: 'log'; log: WorkflowStageLogEntry }
  | { type: 'artifact'; artifact: WorkflowStageArtifact }
  | { type: 'status'; status: WorkflowStageStatus };

const STAGE_ACTIVITY_TTL_MS = Number.parseInt(
  process.env.WORKFLOW_STAGE_ACTIVITY_TTL_MS || `${6 * 60 * 60 * 1000}`,
  10,
);

const stageStore = new Map<string, Map<string, StageActivityState>>();

const nowIso = () => new Date().toISOString();

const cleanupExpired = () => {
  if (stageStore.size === 0) return;
  const now = Date.now();
  for (const [workflowId, stages] of stageStore.entries()) {
    for (const [stageId, state] of stages.entries()) {
      if (now - state.updatedAtMs > STAGE_ACTIVITY_TTL_MS) {
        stages.delete(stageId);
      }
    }
    if (stages.size === 0) {
      stageStore.delete(workflowId);
    }
  }
};

const ensureStage = (workflowId: string, stageId: string, label: string): StageActivityState => {
  cleanupExpired();
  if (!stageStore.has(workflowId)) {
    stageStore.set(workflowId, new Map());
  }
  const stages = stageStore.get(workflowId)!;
  const existing = stages.get(stageId);
  if (existing) return existing;
  const initial: StageActivityState = {
    workflowId,
    stageId,
    label,
    status: 'pending',
    commands: [],
    logs: [],
    artifacts: [],
    updatedAt: nowIso(),
    updatedAtMs: Date.now(),
  };
  stages.set(stageId, initial);
  return initial;
};

const updateStage = (
  workflowId: string,
  stageId: string,
  updater: (state: StageActivityState) => void,
) => {
  const stage = ensureStage(workflowId, stageId, stageId);
  updater(stage);
  stage.updatedAtMs = Date.now();
  stage.updatedAt = nowIso();
  const stages = stageStore.get(workflowId);
  if (stages) {
    stages.set(stageId, stage);
  }
};

const emitDetailEvent = (
  workflowId: string,
  stageId: string,
  detail: DetailUpdate,
  message: string,
) => {
  publishWorkflowEvent({
    workflowId,
    category: 'stage',
    stageId,
    status: 'running',
    message,
    meta: {
      detailType: detail.type,
      detail,
    },
  });
};

export const beginStageExecution = (
  workflowId: string,
  stageId: string,
  label: string,
  startedAt?: string,
) => {
  updateStage(workflowId, stageId, (state) => {
    state.label = label;
    state.status = 'running';
    state.startedAt = startedAt ?? nowIso();
  });
  emitDetailEvent(workflowId, stageId, { type: 'status', status: 'running' }, `${label} 开始执行`);
};

export const finalizeStageExecution = (
  workflowId: string,
  stageId: string,
  status: WorkflowStageStatus,
  finishedAt?: string,
  errorMessage?: string,
) => {
  updateStage(workflowId, stageId, (state) => {
    state.status = status;
    state.finishedAt = finishedAt ?? nowIso();
    if (status === 'failed') {
      state.currentCommandId = undefined;
      if (state.commands.length) {
        const last = state.commands[state.commands.length - 1];
        if (last.status === 'running') {
          last.status = 'error';
          last.finishedAt = state.finishedAt;
          last.errorMessage = errorMessage ?? last.errorMessage;
        }
      }
    } else if (status === 'completed') {
      state.currentCommandId = undefined;
    }
  });
  emitDetailEvent(
    workflowId,
    stageId,
    { type: 'status', status },
    status === 'completed' ? `${stageId} 完成` : `${stageId} 状态更新为 ${status}`,
  );
};

export interface BeginCommandInput {
  workflowId: string;
  stageId: string;
  label: string;
  command?: string;
  meta?: Record<string, unknown>;
}

export const beginCommand = (input: BeginCommandInput): string => {
  const commandId = randomUUID();
  const command: WorkflowStageCommand = {
    id: commandId,
    label: input.label,
    command: input.command,
    status: 'running',
    startedAt: nowIso(),
    meta: input.meta,
  };
  updateStage(input.workflowId, input.stageId, (state) => {
    state.commands = [...state.commands, command];
    state.currentCommandId = commandId;
  });
  emitDetailEvent(
    input.workflowId,
    input.stageId,
    { type: 'start', command },
    `开始执行：${input.label}`,
  );
  return commandId;
};

export interface CompleteCommandInput {
  workflowId: string;
  stageId: string;
  commandId: string;
  resultSummary?: string;
  meta?: Record<string, unknown>;
}

export const completeCommand = (input: CompleteCommandInput) => {
  updateStage(input.workflowId, input.stageId, (state) => {
    const target = state.commands.find((cmd) => cmd.id === input.commandId);
    if (!target) return;
    target.status = 'success';
    target.finishedAt = nowIso();
    if (input.resultSummary) {
      target.resultSummary = input.resultSummary;
    }
    if (input.meta) {
      target.meta = { ...(target.meta || {}), ...input.meta };
    }
    if (state.currentCommandId === input.commandId) {
      state.currentCommandId = undefined;
    }
  });
  const state = stageStore.get(input.workflowId)?.get(input.stageId);
  if (!state) return;
  const command = state.commands.find((cmd) => cmd.id === input.commandId);
  if (!command) return;
  emitDetailEvent(
    input.workflowId,
    input.stageId,
    { type: 'complete', command },
    `完成：${command.label}`,
  );
};

export interface FailCommandInput {
  workflowId: string;
  stageId: string;
  commandId: string;
  errorMessage: string;
  meta?: Record<string, unknown>;
}

export const failCommand = (input: FailCommandInput) => {
  updateStage(input.workflowId, input.stageId, (state) => {
    const target = state.commands.find((cmd) => cmd.id === input.commandId);
    if (!target) return;
    target.status = 'error';
    target.finishedAt = nowIso();
    target.errorMessage = input.errorMessage;
    if (input.meta) {
      target.meta = { ...(target.meta || {}), ...input.meta };
    }
    if (state.currentCommandId === input.commandId) {
      state.currentCommandId = undefined;
    }
  });
  const state = stageStore.get(input.workflowId)?.get(input.stageId);
  if (!state) return;
  const command = state.commands.find((cmd) => cmd.id === input.commandId);
  if (!command) return;
  emitDetailEvent(
    input.workflowId,
    input.stageId,
    { type: 'error', command },
    `失败：${command.label}`,
  );
};

export interface AppendLogInput {
  workflowId: string;
  stageId: string;
  level: WorkflowStageLogEntry['level'];
  message: string;
  commandId?: string;
  meta?: Record<string, unknown>;
}

export const appendLog = (input: AppendLogInput) => {
  const logEntry: WorkflowStageLogEntry = {
    id: randomUUID(),
    timestamp: nowIso(),
    level: input.level,
    message: input.message,
    commandId: input.commandId,
    meta: input.meta,
  };
  updateStage(input.workflowId, input.stageId, (state) => {
    state.logs = [...state.logs, logEntry];
  });
  emitDetailEvent(
    input.workflowId,
    input.stageId,
    { type: 'log', log: logEntry },
    `日志：${input.message}`,
  );
};

export interface RegisterArtifactInput {
  workflowId: string;
  stageId: string;
  label: string;
  type: WorkflowStageArtifact['type'];
  commandId?: string;
  url?: string;
  preview?: string;
  meta?: Record<string, unknown>;
}

export const registerArtifact = (input: RegisterArtifactInput) => {
  const artifact: WorkflowStageArtifact = {
    id: randomUUID(),
    label: input.label,
    type: input.type,
    createdAt: nowIso(),
    commandId: input.commandId,
    url: input.url,
    preview: input.preview,
    meta: input.meta,
  };
  updateStage(input.workflowId, input.stageId, (state) => {
    state.artifacts = [...state.artifacts, artifact];
  });
  emitDetailEvent(
    input.workflowId,
    input.stageId,
    { type: 'artifact', artifact },
    `产物：${input.label}`,
  );
};

export const getStageExecutionSummary = (workflowId: string): WorkflowStageExecutionSummary => {
  cleanupExpired();
  const stages = stageStore.get(workflowId);
  const list = stages ? Array.from(stages.values()) : [];
  return {
    stages: list.map((stage) => ({
      workflowId: stage.workflowId,
      stageId: stage.stageId,
      label: stage.label,
      status: stage.status,
      startedAt: stage.startedAt,
      finishedAt: stage.finishedAt,
      currentCommandId: stage.currentCommandId,
      commands: stage.commands,
      logs: stage.logs,
      artifacts: stage.artifacts,
      updatedAt: stage.updatedAt,
    })),
    generatedAt: nowIso(),
  };
};
