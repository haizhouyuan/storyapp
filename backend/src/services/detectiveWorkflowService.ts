
import { ObjectId, Filter } from 'mongodb';
import { getDatabase, COLLECTIONS } from '../config/database';
import { createLogger } from '../config/logger';
import type {
  DetectiveOutline,
  DetectiveStoryDraft,
  ValidationReport,
  DetectiveWorkflowRecord,
  WorkflowStageState,
  WorkflowStageStatus,
  WorkflowRevisionType,
  WorkflowRevision,
  WorkflowListItem,
  ListWorkflowsResponse,
  RollbackWorkflowRequest,
  TerminateWorkflowRequest,
  DetectiveMechanismPreset,
} from '@storyapp/shared';
import {
  createWorkflowDocument,
  updateWorkflowDocument,
  workflowDocumentToRecord,
  validateCreateWorkflowPayload,
  createWorkflowRevision,
  appendRevision,
  deriveWorkflowStatus,
  type DetectiveWorkflowDocument,
} from '../models/DetectiveWorkflow';
import {
  runStage1Planning,
  runStage2Writing,
  runStage3Review,
  type StageTelemetry,
} from '../agents/detective';
import { runStage4Validation } from '../agents/detective/validators';
import { enforceCluePolicy } from '../agents/detective/clueEnforcer';
import { harmonizeOutlineWithDraft } from '../agents/detective/outlineSync';
import { compileToOutputs } from './compileExporter';
import { DETECTIVE_MECHANISM_PRESETS } from '@storyapp/shared';
import type { PromptBuildOptions } from '../agents/detective/promptBuilder';
import { createStageEvent, createInfoEvent } from './workflowEventBus';
import {
  beginStageExecution,
  finalizeStageExecution,
  beginCommand as monitorBeginCommand,
  completeCommand as monitorCompleteCommand,
  failCommand as monitorFailCommand,
  appendLog as monitorAppendLog,
  registerArtifact as monitorRegisterArtifact,
  getStageExecutionSummary,
} from './stageActivityMonitor';

const logger = createLogger('services:detectiveWorkflow');

const STAGE_DEFINITIONS = [
  { id: 'stage1_planning', label: 'Stage1 Planning' },
  { id: 'stage2_writing', label: 'Stage2 Writing' },
  { id: 'stage3_review', label: 'Stage3 Review' },
  { id: 'stage4_validation', label: 'Stage4 Validation' },
] as const;

type StageId = typeof STAGE_DEFINITIONS[number]['id'];

type StageRunnerOutput = Partial<Pick<DetectiveWorkflowDocument, 'outline' | 'storyDraft' | 'review' | 'validation'>>;

type WorkflowExecutionOptions = {
  revisionType: WorkflowRevisionType;
  createdBy?: string;
  meta?: Record<string, unknown>;
};

function buildInitialStageStates(): WorkflowStageState[] {
  return STAGE_DEFINITIONS.map((stage) => ({
    stage: stage.id,
    status: 'pending',
  }));
}

function resolveMechanismPreset(meta?: Record<string, unknown>): DetectiveMechanismPreset {
  const preferredId =
    meta &&
    typeof meta === 'object' &&
    meta !== null &&
    typeof (meta as any).mechanismPreset?.id === 'string'
      ? (meta as any).mechanismPreset.id
      : undefined;
  if (preferredId) {
    const found = DETECTIVE_MECHANISM_PRESETS.find((preset) => preset.id === preferredId);
    if (found) return found;
  }
  const index = Math.floor(Math.random() * DETECTIVE_MECHANISM_PRESETS.length);
  return DETECTIVE_MECHANISM_PRESETS[index];
}

function updateStageState(
  states: WorkflowStageState[],
  stageId: StageId,
  updates: Partial<WorkflowStageState>,
): WorkflowStageState[] {
  return states.map((state) =>
    state.stage === stageId
      ? {
          ...state,
          ...updates,
        }
      : state,
  );
}

function resetStageStates(states: WorkflowStageState[]): WorkflowStageState[] {
  return states.map((state) => ({
    stage: state.stage,
    status: 'pending',
    startedAt: undefined,
    finishedAt: undefined,
    errorMessage: undefined,
  }));
}

async function persistWorkflow(document: DetectiveWorkflowDocument): Promise<void> {
  if (!document._id) {
    throw new Error('Workflow document 缺少 _id，无法持久化');
  }
  const db = getDatabase();
  await db
    .collection<DetectiveWorkflowDocument>(COLLECTIONS.STORY_WORKFLOWS)
    .replaceOne({ _id: document._id }, document, { upsert: false });
}

const getStageLabel = (stageId: StageId): string => {
  return STAGE_DEFINITIONS.find((stage) => stage.id === stageId)?.label ?? stageId;
};

const emitStageEvent = (
  document: DetectiveWorkflowDocument,
  stageId: StageId,
  status: WorkflowStageStatus,
  message: string,
  meta?: Record<string, unknown>,
) => {
  if (!document._id) return;
  createStageEvent(document._id.toHexString(), stageId, status, message, meta);
};

const createStageTelemetry = (
  workflowId: string | undefined,
  stageId: StageId,
  label: string,
): StageTelemetry | undefined => {
  if (!workflowId) return undefined;
  return {
    beginCommand: (input) =>
      monitorBeginCommand({
        workflowId,
        stageId,
        label: input.label,
        command: input.command,
        meta: input.meta,
      }),
    completeCommand: (commandId, input) => {
      if (!commandId) return;
      monitorCompleteCommand({
        workflowId,
        stageId,
        commandId,
        resultSummary: input?.resultSummary,
        meta: input?.meta,
      });
    },
    failCommand: (commandId, input) => {
      if (!commandId) return;
      monitorFailCommand({
        workflowId,
        stageId,
        commandId,
        errorMessage: input.errorMessage,
        meta: input.meta,
      });
    },
    log: (level, message, options) => {
      monitorAppendLog({
        workflowId,
        stageId,
        level,
        message,
        commandId: options?.commandId,
        meta: options?.meta,
      });
    },
    registerArtifact: (input) => {
      monitorRegisterArtifact({
        workflowId,
        stageId,
        label: input.label,
        type: input.type,
        commandId: input.commandId,
        url: input.url,
        preview: input.preview,
        meta: input.meta,
      });
    },
  };
};

const scheduleWorkflowExecution = (
  document: DetectiveWorkflowDocument,
  options: WorkflowExecutionOptions,
) => {
  if (!document._id) return;
  const workflowId = document._id;
  void (async () => {
    try {
      const completedDoc = await executeWorkflowPipeline(document, options);
      createInfoEvent(workflowId.toHexString(), '工作流生成完成', {
        topic: completedDoc.topic,
        revisionType: options.revisionType,
      });
    } catch (error: any) {
      logger.error(
        { err: error, workflowId: workflowId.toHexString() },
        'Workflow execution failed',
      );
      await markWorkflowFailed(workflowId, error);
    }
  })();
};

async function markWorkflowFailed(workflowId: ObjectId, error: any) {
  const db = getDatabase();
  const collection = db.collection<DetectiveWorkflowDocument>(COLLECTIONS.STORY_WORKFLOWS);
  const existing = await collection.findOne(
    { _id: workflowId },
    { projection: { stageStates: 1 } },
  );
  const nowIso = new Date().toISOString();
  const stageStatesSource = existing?.stageStates?.length
    ? existing.stageStates
    : buildInitialStageStates();
  let failureRecorded = false;
  const stageStates = stageStatesSource.map((state) => {
    if (state.status === 'completed') {
      return state;
    }
    if (!failureRecorded) {
      failureRecorded = true;
      return {
        ...state,
        status: 'failed' as WorkflowStageStatus,
        finishedAt: nowIso,
        errorMessage: state.errorMessage ?? (error?.message || 'workflow_failed'),
      };
    }
    return {
      ...state,
      status: 'pending' as WorkflowStageStatus,
      finishedAt: state.finishedAt,
      errorMessage: state.errorMessage,
    };
  });

  await collection.updateOne(
    { _id: workflowId },
    {
      $set: {
        stageStates,
        status: 'failed',
        updatedAt: new Date(),
      },
    },
  );

  createInfoEvent(workflowId.toHexString(), '工作流生成失败', {
    error: error?.message || String(error),
  });
}

async function runStageWithUpdate(
  document: DetectiveWorkflowDocument,
  stageId: StageId,
  runner: (telemetry?: StageTelemetry) => Promise<StageRunnerOutput>,
): Promise<DetectiveWorkflowDocument> {
  const startTime = new Date();
  const workflowIdString = document._id?.toHexString();
  const stageLabel = getStageLabel(stageId);
  let updatedDoc = updateWorkflowDocument(document, {
    stageStates: updateStageState(document.stageStates, stageId, {
      status: 'running',
      startedAt: startTime.toISOString(),
      finishedAt: undefined,
      errorMessage: undefined,
    }),
  });
  await persistWorkflow(updatedDoc);
  emitStageEvent(
    updatedDoc,
    stageId,
    'running',
    `${getStageLabel(stageId)} 开始`,
  );

  if (workflowIdString) {
    beginStageExecution(workflowIdString, stageId, stageLabel, startTime.toISOString());
  }
  const telemetry = createStageTelemetry(workflowIdString, stageId, stageLabel);

  try {
    const outputs = await runner(telemetry);
    const finishedAt = new Date();
    updatedDoc = updateWorkflowDocument(updatedDoc, {
      ...outputs,
      stageStates: updateStageState(updatedDoc.stageStates, stageId, {
        status: 'completed',
        finishedAt: finishedAt.toISOString(),
      }),
    });
    await persistWorkflow(updatedDoc);
    emitStageEvent(
      updatedDoc,
      stageId,
      'completed',
      `${getStageLabel(stageId)} 完成`,
      {
        durationMs: finishedAt.getTime() - startTime.getTime(),
      },
    );
    if (workflowIdString) {
      finalizeStageExecution(workflowIdString, stageId, 'completed', finishedAt.toISOString());
    }
    return updatedDoc;
  } catch (error: any) {
    const finishedAt = new Date();
    updatedDoc = updateWorkflowDocument(updatedDoc, {
      stageStates: updateStageState(updatedDoc.stageStates, stageId, {
        status: 'failed',
        finishedAt: finishedAt.toISOString(),
        errorMessage: error?.message || 'stage_failed',
      }),
    });
    await persistWorkflow(updatedDoc);
    emitStageEvent(
      updatedDoc,
      stageId,
      'failed',
      `${getStageLabel(stageId)} 失败`,
      {
        durationMs: finishedAt.getTime() - startTime.getTime(),
        error: error?.message,
      },
    );
    if (workflowIdString) {
      finalizeStageExecution(
        workflowIdString,
        stageId,
        'failed',
        finishedAt.toISOString(),
        error?.message,
      );
    }
    throw error;
  }
}

async function executeWorkflowPipeline(
  document: DetectiveWorkflowDocument,
  options: WorkflowExecutionOptions,
): Promise<DetectiveWorkflowDocument> {
  const mechanismPreset = resolveMechanismPreset(document.meta as Record<string, unknown> | undefined);
  const planningProfile = (process.env.DETECTIVE_PROMPT_PROFILE as 'strict' | 'balanced' | 'creative') || 'balanced';
  const planningSeed = `${mechanismPreset.id}-${planningProfile}`;
  const plannerPrompt: PromptBuildOptions = {
    profile: planningProfile,
    seed: planningSeed,
    vars: {
      readingLevel: 'middle_grade',
      deviceKeywords: mechanismPreset.keywords,
      deviceRealismHint: mechanismPreset.realismHint,
      targets: { wordsPerScene: 1200 },
      cluePolicy: { ch1MinClues: 3, minExposures: 2 },
    },
  };

  let workingDoc: DetectiveWorkflowDocument = {
    ...document,
    meta: {
      ...(document.meta || {}),
      mechanismPreset,
    },
  };
  if (workingDoc._id) {
    createInfoEvent(workingDoc._id.toHexString(), '已选定创作机制', {
      mechanismPreset: mechanismPreset.id,
      revisionType: options.revisionType,
    });
  }

  // Stage 1
  workingDoc = await runStageWithUpdate(workingDoc, 'stage1_planning', async (telemetry) => ({
    outline: await runStage1Planning(workingDoc.topic, plannerPrompt, telemetry),
  }));

  // Stage 2
  workingDoc = await runStageWithUpdate(workingDoc, 'stage2_writing', async (telemetry) => {
    const outline = workingDoc.outline as DetectiveOutline;
    if (!outline) {
      throw new Error('缺少 Stage1 输出，无法执行 Stage2');
    }
    const storyDraftStage2 = await runStage2Writing(outline, plannerPrompt, telemetry);
    const initialHarmonizeCommand = telemetry?.beginCommand?.({
      label: '同步大纲与写作草稿',
      command: 'harmonizeOutlineWithDraft',
      meta: { phase: 'initial' },
    });
    const harmonizedStage2 = harmonizeOutlineWithDraft(outline, storyDraftStage2, {
      ensureMechanismKeywords: true,
      mechanismKeywords: mechanismPreset.keywords,
    });
    if (initialHarmonizeCommand) {
      telemetry?.completeCommand?.(initialHarmonizeCommand, {
        resultSummary: '完成初步同步',
      });
    }
    const enforceCommand = telemetry?.beginCommand?.({
      label: '执行线索公平性校验',
      command: 'enforceCluePolicy',
      meta: {
        ch1MinClues: 3,
        minExposures: 2,
      },
    });
    const enforced = enforceCluePolicy(harmonizedStage2.outline, storyDraftStage2, {
      ch1MinClues: 3,
      minExposures: 2,
      ensureFinalRecovery: true,
      adjustOutlineExpectedChapters: true,
      maxRedHerringRatio: 0.3,
      maxRedHerringPerChapter: 2,
    });
    if (enforceCommand) {
      telemetry?.completeCommand?.(enforceCommand, {
        resultSummary: '公平性校验完成，已应用修正',
      });
    }
    const harmonizedFinal = harmonizeOutlineWithDraft(enforced.outline || harmonizedStage2.outline, enforced.draft, {
      ensureMechanismKeywords: true,
      mechanismKeywords: mechanismPreset.keywords,
    });
    telemetry?.registerArtifact?.({
      label: '阶段二增强后大纲',
      type: 'json',
      preview: JSON.stringify(
        {
          chapters: harmonizedFinal.outline?.acts?.length ?? 0,
          clueMappings: harmonizedFinal.meta.clueMappings ?? [],
        },
        null,
        2,
      ),
    });
    logger.debug({
      stage: 'stage2_writing',
      clueMappings: harmonizedFinal.meta.clueMappings,
      timelineAdded: harmonizedFinal.meta.timelineAdded,
      timelineNormalized: harmonizedFinal.meta.timelineNormalized,
      mechanismKeywords: harmonizedFinal.meta.mechanismKeywordsAppended,
      generatedClues: harmonizedFinal.meta.generatedClues,
    }, 'Stage2 Harmonize Outline');
    return { storyDraft: enforced.draft, outline: harmonizedFinal.outline };
  });

  // Stage 3
  workingDoc = await runStageWithUpdate(workingDoc, 'stage3_review', async (telemetry) => {
    const outline = workingDoc.outline as DetectiveOutline;
    const storyDraft = workingDoc.storyDraft as DetectiveStoryDraft;
    if (!outline || !storyDraft) {
      throw new Error('缺少 Stage1/Stage2 输出，无法执行 Stage3');
    }
    const review = await runStage3Review(outline, storyDraft, plannerPrompt, telemetry);
    return { review };
  });

  // Stage 4
  workingDoc = await runStageWithUpdate(workingDoc, 'stage4_validation', async (telemetry) => {
    const outline = workingDoc.outline as DetectiveOutline;
    let storyDraft = workingDoc.storyDraft as DetectiveStoryDraft;
    let outlineForValidation = outline;
    if (!outline || !storyDraft) {
      throw new Error('缺少 Stage1/Stage2 输出，无法执行 Stage4');
    }
    const enableAutoFix = process.env.DETECTIVE_AUTO_FIX !== '0';
    if (enableAutoFix) {
      try {
        const autofixCommand = telemetry?.beginCommand?.({
          label: '执行自动线索修复',
          command: 'enforceCluePolicy',
          meta: { mode: 'autofix' },
        });
        const { draft: patchedDraft, outline: patchedOutline } = enforceCluePolicy(outline as any, storyDraft as any, {
          ch1MinClues: 3,
          minExposures: 2,
          ensureFinalRecovery: true,
          adjustOutlineExpectedChapters: true,
          maxRedHerringRatio: 0.3,
          maxRedHerringPerChapter: 2,
        });
        storyDraft = patchedDraft as any;
        outlineForValidation = (patchedOutline as DetectiveOutline) || outlineForValidation;
        if (autofixCommand) {
          telemetry?.completeCommand?.(autofixCommand, {
            resultSummary: '自动修复完成',
          });
        }
      } catch (e) {
        logger.warn({ err: e }, 'AutoFix 执行失败，继续进行校验');
        telemetry?.log?.('warn', '自动修复失败，继续进行校验', {
          meta: { error: (e as Error)?.message },
        });
      }
    }
    const harmonizeCommand = telemetry?.beginCommand?.({
      label: '校验前同步大纲与草稿',
      command: 'harmonizeOutlineWithDraft',
      meta: { stage: 'validation' },
    });
    const harmonized = harmonizeOutlineWithDraft(outlineForValidation, storyDraft, {
      ensureMechanismKeywords: true,
      mechanismKeywords: mechanismPreset.keywords,
    });
    outlineForValidation = harmonized.outline;
    if (harmonizeCommand) {
      telemetry?.completeCommand?.(harmonizeCommand, {
        resultSummary: '同步完成，准备校验',
      });
    }
    workingDoc = updateWorkflowDocument(workingDoc, {
      outline: outlineForValidation,
      storyDraft,
    });
    const validationCommand = telemetry?.beginCommand?.({
      label: '执行阶段四一致性校验',
      command: 'runStage4Validation',
    });
    const validation = runStage4Validation(outlineForValidation, storyDraft, {
      outlineId: workingDoc._id?.toHexString(),
      storyId: workingDoc._id?.toHexString(),
    });
    if (validationCommand) {
      telemetry?.completeCommand?.(validationCommand, {
        resultSummary: '校验完成',
      });
    }
    telemetry?.registerArtifact?.({
      label: '阶段四校验结果',
      type: 'json',
      preview: JSON.stringify(validation, null, 2).slice(0, 2000),
    });
    return { validation, outline: outlineForValidation, storyDraft };
  });

  const revision = createWorkflowRevision({
    type: options.revisionType,
    outline: workingDoc.outline,
    storyDraft: workingDoc.storyDraft,
    review: workingDoc.review,
    validation: workingDoc.validation,
    stageStates: workingDoc.stageStates,
    createdBy: options.createdBy,
    meta: options.meta,
  });

  workingDoc = appendRevision(workingDoc, revision);
  await persistWorkflow(workingDoc);
  return workingDoc;
}

function computeListItem(document: DetectiveWorkflowDocument): WorkflowListItem {
  const latestRevision = document.history[document.history.length - 1];
  return {
    _id: document._id!.toHexString(),
    topic: document.topic,
    status: document.status,
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
    latestRevisionType: latestRevision?.type,
    latestRevisionAt: latestRevision?.createdAt,
  };
}

export function getWorkflowStageActivity(workflowId: string) {
  return getStageExecutionSummary(workflowId);
}

export async function createDetectiveWorkflow(params: { topic: string; locale?: string }): Promise<DetectiveWorkflowRecord> {
  const errors = validateCreateWorkflowPayload(params.topic);
  if (errors.length > 0) {
    const error = new Error('Invalid request');
    (error as any).code = 'VALIDATION_ERROR';
    (error as any).messages = errors;
    throw error;
  }

  const db = getDatabase();
  const collection = db.collection<DetectiveWorkflowDocument>(COLLECTIONS.STORY_WORKFLOWS);

  const initialDocument = createWorkflowDocument({
    topic: params.topic,
    locale: params.locale,
    stageStates: buildInitialStageStates(),
  });

  const insertResult = await collection.insertOne(initialDocument);
  let document: DetectiveWorkflowDocument = {
    ...initialDocument,
    _id: insertResult.insertedId,
  };
  createInfoEvent(insertResult.insertedId.toHexString(), '工作流已创建', {
    topic: params.topic,
    locale: params.locale,
  });

  scheduleWorkflowExecution(document, { revisionType: 'initial' });
  const record = workflowDocumentToRecord(document);
  return { ...record, workflowId: record._id } as DetectiveWorkflowRecord;
}

export async function listWorkflows(options: { page?: number; limit?: number; status?: WorkflowStageStatus }): Promise<ListWorkflowsResponse> {
  const page = Math.max(1, options.page ?? 1);
  const limit = Math.min(50, Math.max(1, options.limit ?? 10));
  const skip = (page - 1) * limit;

  const db = getDatabase();
  const collection = db.collection<DetectiveWorkflowDocument>(COLLECTIONS.STORY_WORKFLOWS);

  const filter: Filter<DetectiveWorkflowDocument> = {};
  if (options.status) {
    filter.status = options.status;
  }

  const [items, total] = await Promise.all([
    collection.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray(),
    collection.countDocuments(filter),
  ]);

  return {
    items: items.map(computeListItem),
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit) || 1,
    },
  };
}

export async function getWorkflowById(workflowId: string): Promise<DetectiveWorkflowRecord | null> {
  if (!ObjectId.isValid(workflowId)) {
    throw new Error('Invalid workflow id');
  }
  const db = getDatabase();
  const document = await db
    .collection<DetectiveWorkflowDocument>(COLLECTIONS.STORY_WORKFLOWS)
    .findOne({ _id: new ObjectId(workflowId) });

  if (!document) {
    return null;
  }

  return workflowDocumentToRecord(document);
}

export async function retryWorkflow(workflowId: string): Promise<DetectiveWorkflowRecord> {
  const db = getDatabase();
  const collection = db.collection<DetectiveWorkflowDocument>(COLLECTIONS.STORY_WORKFLOWS);
  const _id = new ObjectId(workflowId);
  const document = await collection.findOne({ _id });
  if (!document) {
    throw new Error('Workflow not found');
  }

  let workingDoc = updateWorkflowDocument(document, {
    stageStates: resetStageStates(buildInitialStageStates()),
    terminatedAt: undefined,
    terminationReason: undefined,
  });
  await persistWorkflow(workingDoc);
  createInfoEvent(workflowId, '工作流已重置，准备重新生成', {
    topic: workingDoc.topic,
  });

  scheduleWorkflowExecution(workingDoc, { revisionType: 'retry' });
  const record = workflowDocumentToRecord(workingDoc);
  return { ...record, workflowId: record._id } as DetectiveWorkflowRecord;
}


export async function compileWorkflow(workflowId: string) {
  const workflow = await getWorkflowById(workflowId);
  if (!workflow) {
    throw new Error('Workflow not found');
  }
  if (!workflow.storyDraft || !workflow.outline) {
    throw new Error('Workflow missing story draft or outline');
  }
  const outputs = await compileToOutputs({
    projectId: workflowId,
    title: workflow.topic,
    outline: workflow.outline,
    draft: workflow.storyDraft,
  });
  return outputs;
}
export async function terminateWorkflow(workflowId: string, payload: TerminateWorkflowRequest): Promise<DetectiveWorkflowRecord> {
  const db = getDatabase();
  const collection = db.collection<DetectiveWorkflowDocument>(COLLECTIONS.STORY_WORKFLOWS);
  const _id = new ObjectId(workflowId);
  const document = await collection.findOne({ _id });
  if (!document) {
    throw new Error('Workflow not found');
  }

  const stageStates = document.stageStates.map<WorkflowStageState>((state) => ({
    ...state,
    status: state.status === 'completed' ? 'completed' : 'failed',
    finishedAt: state.finishedAt ?? new Date().toISOString(),
    errorMessage: state.status === 'completed' ? state.errorMessage : payload.reason ?? 'terminated',
  }));

  const terminatedDoc = updateWorkflowDocument(document, {
    stageStates,
    terminatedAt: new Date(),
    terminationReason: payload.reason,
  });
  await persistWorkflow(terminatedDoc);
  return workflowDocumentToRecord(terminatedDoc);
}

export async function rollbackWorkflow(workflowId: string, payload: RollbackWorkflowRequest): Promise<DetectiveWorkflowRecord> {
  const db = getDatabase();
  const collection = db.collection<DetectiveWorkflowDocument>(COLLECTIONS.STORY_WORKFLOWS);
  const _id = new ObjectId(workflowId);
  const document = await collection.findOne({ _id });
  if (!document) {
    throw new Error('Workflow not found');
  }

  const targetRevision = document.history.find((rev) => rev.revisionId === payload.revisionId);
  if (!targetRevision) {
    throw new Error('Revision not found');
  }

  let workingDoc = updateWorkflowDocument(document, {
    outline: targetRevision.outline,
    storyDraft: targetRevision.storyDraft,
    review: targetRevision.review,
    validation: targetRevision.validation,
    stageStates: targetRevision.stageStates ?? buildInitialStageStates(),
    terminatedAt: undefined,
    terminationReason: undefined,
  });

  const revision = createWorkflowRevision({
    type: 'rollback',
    outline: workingDoc.outline,
    storyDraft: workingDoc.storyDraft,
    review: workingDoc.review,
    validation: workingDoc.validation,
    stageStates: workingDoc.stageStates,
    meta: payload.note ? { note: payload.note } : undefined,
  });

  workingDoc = appendRevision(workingDoc, revision);
  await persistWorkflow(workingDoc);
  return workflowDocumentToRecord(workingDoc);
}
