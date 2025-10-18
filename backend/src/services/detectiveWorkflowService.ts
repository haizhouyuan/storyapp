
import { ObjectId } from 'mongodb';
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
} from '../agents/detective';
import { runStage4Validation } from '../agents/detective/validators';
import { enforceCluePolicy } from '../agents/detective/clueEnforcer';
import { harmonizeOutlineWithDraft } from '../agents/detective/outlineSync';
import { DETECTIVE_MECHANISM_PRESETS } from '@storyapp/shared';
import type { PromptBuildOptions } from '../agents/detective/promptBuilder';

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

async function runStageWithUpdate(
  document: DetectiveWorkflowDocument,
  stageId: StageId,
  runner: () => Promise<StageRunnerOutput>,
): Promise<DetectiveWorkflowDocument> {
  const startTime = new Date();
  let updatedDoc = updateWorkflowDocument(document, {
    stageStates: updateStageState(document.stageStates, stageId, {
      status: 'running',
      startedAt: startTime.toISOString(),
      finishedAt: undefined,
      errorMessage: undefined,
    }),
  });
  await persistWorkflow(updatedDoc);

  try {
    const outputs = await runner();
    const finishedAt = new Date();
    updatedDoc = updateWorkflowDocument(updatedDoc, {
      ...outputs,
      stageStates: updateStageState(updatedDoc.stageStates, stageId, {
        status: 'completed',
        finishedAt: finishedAt.toISOString(),
      }),
    });
    await persistWorkflow(updatedDoc);
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

  // Stage 1
  workingDoc = await runStageWithUpdate(workingDoc, 'stage1_planning', async () => ({
    outline: await runStage1Planning(workingDoc.topic, plannerPrompt),
  }));

  // Stage 2
  workingDoc = await runStageWithUpdate(workingDoc, 'stage2_writing', async () => {
    const outline = workingDoc.outline as DetectiveOutline;
    if (!outline) {
      throw new Error('缺少 Stage1 输出，无法执行 Stage2');
    }
    const storyDraftStage2 = await runStage2Writing(outline, plannerPrompt);
    const harmonizedStage2 = harmonizeOutlineWithDraft(outline, storyDraftStage2, {
      ensureMechanismKeywords: true,
      mechanismKeywords: mechanismPreset.keywords,
    });
    const enforced = enforceCluePolicy(harmonizedStage2.outline, storyDraftStage2, {
      ch1MinClues: 3,
      minExposures: 2,
      ensureFinalRecovery: true,
      adjustOutlineExpectedChapters: true,
      maxRedHerringRatio: 0.3,
      maxRedHerringPerChapter: 2,
    });
    const harmonizedFinal = harmonizeOutlineWithDraft(enforced.outline || harmonizedStage2.outline, enforced.draft, {
      ensureMechanismKeywords: true,
      mechanismKeywords: mechanismPreset.keywords,
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
  workingDoc = await runStageWithUpdate(workingDoc, 'stage3_review', async () => {
    const outline = workingDoc.outline as DetectiveOutline;
    const storyDraft = workingDoc.storyDraft as DetectiveStoryDraft;
    if (!outline || !storyDraft) {
      throw new Error('缺少 Stage1/Stage2 输出，无法执行 Stage3');
    }
    const review = await runStage3Review(outline, storyDraft, plannerPrompt);
    return { review };
  });

  // Stage 4
  workingDoc = await runStageWithUpdate(workingDoc, 'stage4_validation', async () => {
    const outline = workingDoc.outline as DetectiveOutline;
    let storyDraft = workingDoc.storyDraft as DetectiveStoryDraft;
    let outlineForValidation = outline;
    if (!outline || !storyDraft) {
      throw new Error('缺少 Stage1/Stage2 输出，无法执行 Stage4');
    }
    const enableAutoFix = process.env.DETECTIVE_AUTO_FIX !== '0';
    if (enableAutoFix) {
      try {
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
      } catch (e) {
        logger.warn({ err: e }, 'AutoFix 执行失败，继续进行校验');
      }
    }
    const harmonized = harmonizeOutlineWithDraft(outlineForValidation, storyDraft, {
      ensureMechanismKeywords: true,
      mechanismKeywords: mechanismPreset.keywords,
    });
    outlineForValidation = harmonized.outline;
    workingDoc = updateWorkflowDocument(workingDoc, {
      outline: outlineForValidation,
      storyDraft,
    });
    const validation = runStage4Validation(outlineForValidation, storyDraft, {
      outlineId: workingDoc._id?.toHexString(),
      storyId: workingDoc._id?.toHexString(),
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

  document = await executeWorkflowPipeline(document, { revisionType: 'initial' });
  return workflowDocumentToRecord(document);
}

export async function listWorkflows(options: { page?: number; limit?: number }): Promise<ListWorkflowsResponse> {
  const page = Math.max(1, options.page ?? 1);
  const limit = Math.min(50, Math.max(1, options.limit ?? 10));
  const skip = (page - 1) * limit;

  const db = getDatabase();
  const collection = db.collection<DetectiveWorkflowDocument>(COLLECTIONS.STORY_WORKFLOWS);

  const [items, total] = await Promise.all([
    collection.find({}).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray(),
    collection.countDocuments({}),
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

  workingDoc = await executeWorkflowPipeline(workingDoc, { revisionType: 'retry' });
  return workflowDocumentToRecord(workingDoc);
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
