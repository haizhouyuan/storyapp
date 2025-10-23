
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
  DetectiveRevisionNote,
  DetectiveStoryAudioAsset,
  DetectiveWorkflowMeta,
  WorkflowTelemetry,
  StageLog,
  GateLog,
  WorkflowStageCode,
  Stage3AnalysisSnapshot,
  FairPlayReport,
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
  runStage4Revision,
  buildClueGraphFromOutline,
  scoreFairPlay,
  CLUE_GRAPH_VERSION,
  normalizeRevisionNote,
  normalizeRevisionNotes,
  mergeRevisionNotes,
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

const PROMPT_VERSION_STAGE1 = 'stage1.contract.v1';
const PROMPT_VERSION_KEY_STAGE1 = 'stage1_outline';
const PROMPT_VERSION_STAGE3 = 'stage3.review.v1';
const PROMPT_VERSION_KEY_STAGE3 = 'stage3_review';
const PROMPT_VERSION_STAGE5 = 'stage5.validation.v1';
const PROMPT_VERSION_KEY_STAGE5 = 'stage5_validation';

const STAGE_DEFINITIONS = [
  { id: 'stage1_planning', label: 'Stage1 Planning' },
  { id: 'stage2_writing', label: 'Stage2 Writing' },
  { id: 'stage3_review', label: 'Stage3 Review' },
  { id: 'stage4_revision', label: 'Stage4 Revision' },
  { id: 'stage5_validation', label: 'Stage5 Validation' },
] as const;

type StageId = typeof STAGE_DEFINITIONS[number]['id'];

const STAGE_CODE_LOOKUP: Record<StageId, WorkflowStageCode> = {
  stage1_planning: 'S1',
  stage2_writing: 'S2',
  stage3_review: 'S3',
  stage4_revision: 'S4',
  stage5_validation: 'S5',
};

const STAGE_ORDER_LOOKUP: Record<StageId, number> = STAGE_DEFINITIONS.reduce(
  (acc, stage, index) => {
    acc[stage.id] = index;
    return acc;
  },
  {} as Record<StageId, number>,
);

const TIME_PATTERN = /\b(\d{1,2}:\d{2})\b/;
const DAY_PATTERN = /Day\s*\d+/i;

const CHAPTER_TIME_RULE_ID = 'chapter-time-tags';
const TIMELINE_TEXT_RULE_ID = 'timeline-from-text';
const MOTIVE_RULE_ID = 'motive-foreshadowing';

function parseChapterIndex(label?: string | null): number | null {
  if (!label) return null;
  const match = String(label).match(/(\d+)/);
  if (!match) return null;
  const index = Number.parseInt(match[1], 10) - 1;
  if (!Number.isFinite(index) || index < 0) return null;
  return index;
}

function extractRuleId(detail?: string, issueId?: string): string | undefined {
  if (typeof issueId === 'string' && issueId.startsWith('validation-')) {
    return issueId.replace(/^validation-/, '');
  }
  if (typeof detail !== 'string') {
    return undefined;
  }
  const match = detail.match(/\[([^\]]+)\]/);
  return match ? match[1] : undefined;
}

function mapStageCode(stageId: StageId): WorkflowStageCode {
  return STAGE_CODE_LOOKUP[stageId] ?? 'S0';
}

function computeStageDurationMs(states: WorkflowStageState[], stageId: StageId): number | undefined {
  const state = states.find((item) => item.stage === stageId);
  if (!state?.startedAt || !state?.finishedAt) return undefined;
  const start = Date.parse(state.startedAt);
  const end = Date.parse(state.finishedAt);
  if (Number.isNaN(start) || Number.isNaN(end)) return undefined;
  return Math.max(end - start, 0);
}

function stageOrder(stageId?: string, stageCode?: WorkflowStageCode): number {
  if (stageId && (STAGE_ORDER_LOOKUP as Record<string, number>)[stageId as StageId] !== undefined) {
    return (STAGE_ORDER_LOOKUP as Record<string, number>)[stageId as StageId];
  }
  if (stageCode) {
    const sequence: WorkflowStageCode[] = ['S0', 'S1', 'S2', 'S3', 'S4', 'S5'];
    const idx = sequence.indexOf(stageCode);
    if (idx >= 0) {
      return idx;
    }
  }
  return Number.MAX_SAFE_INTEGER;
}

function upsertPromptVersion(
  meta: DetectiveWorkflowMeta | undefined,
  key: string,
  value: string,
): DetectiveWorkflowMeta {
  const nextPromptVersions = { ...(meta?.promptVersions ?? {}), [key]: value };
  const existingStages = Array.isArray(meta?.telemetry?.stages)
    ? [...(meta?.telemetry?.stages as StageLog[])]
    : [];
  const telemetryBase: WorkflowTelemetry = {
    stages: existingStages,
    promptVersions: {
      ...(meta?.telemetry?.promptVersions ?? {}),
      [key]: value,
    },
  };
  return {
    ...(meta ?? {}),
    promptVersions: nextPromptVersions,
    telemetry: telemetryBase,
  };
}

function upsertStageLog(meta: DetectiveWorkflowMeta | undefined, log: StageLog): DetectiveWorkflowMeta {
  const timestamp = log.timestamp ?? new Date().toISOString();
  const telemetry = meta?.telemetry;
  const existingStages = Array.isArray(telemetry?.stages)
    ? [...(telemetry?.stages as StageLog[])]
    : [];
  const filtered = existingStages.filter((entry) => entry.stageId !== log.stageId);
  const enriched: StageLog = {
    ...log,
    timestamp,
    gates: log.gates ?? [],
  };
  const ordered = [...filtered, enriched].sort(
    (a, b) => stageOrder(a.stageId, a.stage) - stageOrder(b.stageId, b.stage),
  );
  return {
    ...(meta ?? {}),
    telemetry: {
      stages: ordered,
      promptVersions: meta?.telemetry?.promptVersions,
    },
  };
}

function setStage3Analysis(
  meta: DetectiveWorkflowMeta | undefined,
  analysis: Stage3AnalysisSnapshot | undefined,
): DetectiveWorkflowMeta {
  const stageResults = {
    ...(meta?.stageResults ?? {}),
    stage3: analysis,
  };
  return {
    ...(meta ?? {}),
    stageResults,
  };
}

export function computeHypothesisGate(analysis?: Stage3AnalysisSnapshot | null): GateLog {
  if (!analysis?.hypotheses?.candidates?.length) {
    return {
      name: 'hypothesis.uniqueness',
      verdict: 'warn',
      reason: '缺少有效的竞争假设',
      metrics: {
        candidateCount: 0,
      },
    };
  }
  const sorted = [...analysis.hypotheses.candidates].sort((a, b) => b.confidence - a.confidence);
  const primary = sorted[0];
  const runnerUp = sorted[1];
  const gap = runnerUp ? Math.abs(primary.confidence - runnerUp.confidence) : primary.confidence;
  const verdict: GateLog['verdict'] = runnerUp && gap < 0.2 ? 'warn' : 'pass';
  const reason = verdict === 'warn'
    ? `多解竞争度高：${primary.suspect} vs ${runnerUp?.suspect}`
    : undefined;
  return {
    name: 'hypothesis.uniqueness',
    verdict,
    reason,
    metrics: {
      candidateCount: sorted.length,
      primaryConfidence: Number(primary.confidence.toFixed(3)),
      runnerUpConfidence: runnerUp ? Number(runnerUp.confidence.toFixed(3)) : 0,
      confidenceGap: Number(gap.toFixed(3)),
    },
  };
}

export function computeFairPlayGate(report: FairPlayReport): GateLog {
  const verdict: GateLog['verdict'] = report.unsupportedInferences.length > 0 ? 'block' : 'pass';
  const reason = verdict === 'block'
    ? `仍有 ${report.unsupportedInferences.length} 条推论缺乏显式线索支撑`
    : undefined;
  return {
    name: 'fairPlay.final',
    verdict,
    reason,
    metrics: {
      unsupported: report.unsupportedInferences.length,
      orphan: report.orphanClues.length,
      economyScore: report.economyScore,
    },
  };
}

export function computeComplexityGate(analysis?: Stage3AnalysisSnapshot | null): GateLog {
  const candidates = analysis?.hypotheses?.candidates ?? [];
  if (!candidates.length) {
    return {
      name: 'complexity.uniqueness',
      verdict: 'warn',
      reason: '缺少假说评估结果',
      metrics: {
        competitors: 0,
        inevitability: 0,
      },
    };
  }
  const sorted = [...candidates].sort((a, b) => b.confidence - a.confidence);
  const primary = sorted[0];
  const runnerUp = sorted[1];
  const competitors = sorted.filter((item) => item.confidence >= 0.3).length;
  const inevitability = Number((primary.confidence - (runnerUp?.confidence ?? 0)).toFixed(3));
  const verdict: GateLog['verdict'] = competitors >= 2 && inevitability >= 0.4 ? 'pass' : 'warn';
  const reason = verdict === 'warn'
    ? '竞争嫌疑不足或最终矛盾力度不足'
    : undefined;
  return {
    name: 'complexity.uniqueness',
    verdict,
    reason,
    metrics: {
      competitors,
      primaryConfidence: Number(primary.confidence.toFixed(3)),
      runnerUpConfidence: runnerUp ? Number(runnerUp.confidence.toFixed(3)) : 0,
      inevitability,
    },
  };
}

function ensureChapterAnchorsCompliance(outline: DetectiveOutline, draft: DetectiveStoryDraft): string[] {
  const chapters = draft?.chapters ?? [];
  if (chapters.length === 0) return [];
  const anchors = Array.isArray(outline?.chapterAnchors) ? outline.chapterAnchors : [];
  const anchorMap = new Map<number, typeof anchors[number]>();
  anchors.forEach((anchor) => {
    const index = parseChapterIndex(anchor?.chapter);
    if (index !== null) {
      anchorMap.set(index, anchor);
    }
  });
  const errors: string[] = [];
  chapters.forEach((chapter, index) => {
    const text = `${chapter.summary || ''}\n${chapter.content || ''}`;
    const anchor = anchorMap.get(index);
    if (anchor) {
      if (anchor.dayCode && !text.includes(anchor.dayCode)) {
        errors.push(`[${CHAPTER_TIME_RULE_ID}] Chapter ${index + 1} 缺少 ${anchor.dayCode} 提示`);
      }
      if (anchor.time && !text.includes(anchor.time)) {
        errors.push(`[${CHAPTER_TIME_RULE_ID}] Chapter ${index + 1} 缺少 ${anchor.time} 时间标注`);
      }
    }
    if (!DAY_PATTERN.test(text) || !TIME_PATTERN.test(text)) {
      errors.push(`[${TIMELINE_TEXT_RULE_ID}] Chapter ${index + 1} 未检测到 DayX HH:MM 自然语言时间提示`);
    }
  });
  return Array.from(new Set(errors));
}

function ensureMotiveCompliance(outline: DetectiveOutline, draft: DetectiveStoryDraft): string[] {
  const chapters = draft?.chapters ?? [];
  if (chapters.length === 0) return [];
  const earlyText = chapters
    .slice(0, Math.min(2, chapters.length))
    .map((chapter) => `${chapter.summary || ''}\n${chapter.content || ''}`)
    .join('\n');
  const suspects = (outline?.characters ?? []).filter(
    (character) => typeof character?.role === 'string' && /suspect/i.test(character.role ?? ''),
  );
  const errors: string[] = [];
  suspects.forEach((suspect) => {
    const keywords = Array.isArray(suspect.motiveKeywords)
      ? suspect.motiveKeywords.filter((kw): kw is string => Boolean(kw && kw.trim()))
      : [];
    if (keywords.length === 0) return;
    const missing = keywords.filter((keyword) => !earlyText.includes(keyword));
    if (missing.length > 0) {
      errors.push(`[${MOTIVE_RULE_ID}] 嫌疑人 ${suspect.name || '未知'} 的动机关键词缺失：${missing.join('、')}`);
    }
  });
  return errors;
}

function assertPostRevisionCompliance(outline: DetectiveOutline, draft: DetectiveStoryDraft): void {
  const errors = [
    ...ensureChapterAnchorsCompliance(outline, draft),
    ...ensureMotiveCompliance(outline, draft),
  ];
  if (errors.length > 0) {
    throw new Error(errors.join('；'));
  }
}

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

function resolveMechanismPreset(meta?: DetectiveWorkflowMeta): DetectiveMechanismPreset {
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

export async function cleanupStaleWorkflows(options?: { maxAgeMinutes?: number; stages?: StageId[] }) {
  const maxAgeMinutes = Math.max(1, options?.maxAgeMinutes ?? 10);
  const stages = (options?.stages && options.stages.length > 0
    ? options.stages
    : STAGE_DEFINITIONS.map((stage) => stage.id)) as StageId[];
  const thresholdDate = new Date(Date.now() - maxAgeMinutes * 60 * 1000);
  const thresholdIso = thresholdDate.toISOString();

  const db = getDatabase();
  const collection = db.collection<DetectiveWorkflowDocument>(COLLECTIONS.STORY_WORKFLOWS);

  const filter = {
    status: 'running' as WorkflowStageStatus,
    stageStates: {
      $elemMatch: {
        stage: { $in: stages },
        status: 'running',
        startedAt: { $lt: thresholdIso },
      },
    },
  };

  const staleDocuments = await collection
    .find(filter, {
      projection: {
        stageStates: 1,
        topic: 1,
        createdAt: 1,
        updatedAt: 1,
      },
    })
    .toArray();

  const cleaned: Array<{
    workflowId: string;
    staleStage: string | null;
    startedAt?: string;
    topic?: string;
  }> = [];

  for (const doc of staleDocuments) {
    if (!doc._id) continue;
    const staleStage = doc.stageStates?.find(
      (state) =>
        stages.includes(state.stage as StageId) &&
        state.status === 'running' &&
        state.startedAt &&
        state.startedAt < thresholdIso,
    );

    await markWorkflowFailed(doc._id, new Error('workflow_stale_timeout'));

    const workflowId = doc._id.toHexString();
    createInfoEvent(workflowId, '检测到生成阶段长时间无响应，已标记为失败', {
      staleStage: staleStage?.stage ?? null,
      startedAt: staleStage?.startedAt,
      maxAgeMinutes,
      cleanupAt: new Date().toISOString(),
    });

    cleaned.push({
      workflowId,
      staleStage: staleStage?.stage ?? null,
      startedAt: staleStage?.startedAt,
      topic: doc.topic,
    });
  }

  return {
    cleanedCount: cleaned.length,
    cleaned,
    maxAgeMinutes,
    threshold: thresholdIso,
  };
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

  let errorOccurred = false;
  let hasResult = false;
  
  try {
    const outputs = await runner(telemetry);
    hasResult = true;
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
    errorOccurred = true;
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
  } finally {
    // 🔧 确保无论成功失败都有日志记录
    const finishedAt = new Date();
    const duration = finishedAt.getTime() - startTime.getTime();
    
    logger.info({
      workflowId: workflowIdString,
      stageId,
      stageLabel,
      status: errorOccurred ? 'failed' : 'completed',
      duration,
      hasResult,
    }, '📊 Stage execution finished (finally block)');
    
    // 🔧 检测潜在的静默失败
    if (!errorOccurred && !hasResult) {
      logger.warn({
        workflowId: workflowIdString,
        stageId,
        stageLabel,
      }, '⚠️ Stage finished but no result and no error - possible silent failure');
    }
  }
}

async function executeWorkflowPipeline(
  document: DetectiveWorkflowDocument,
  options: WorkflowExecutionOptions,
): Promise<DetectiveWorkflowDocument> {
  const mechanismPreset = resolveMechanismPreset(document.meta);
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

  if (workingDoc.outline) {
    try {
      const clueGraph = buildClueGraphFromOutline(workingDoc.outline as DetectiveOutline);
      const fairPlayReport = scoreFairPlay(clueGraph);
      const generatedAt = new Date().toISOString();

      let nextMeta: DetectiveWorkflowMeta = {
        ...(workingDoc.meta ?? {}),
        clueGraphSnapshot: {
          generatedAt,
          graph: clueGraph,
          report: fairPlayReport,
          version: CLUE_GRAPH_VERSION,
        },
      };

      nextMeta = upsertPromptVersion(nextMeta, PROMPT_VERSION_KEY_STAGE1, PROMPT_VERSION_STAGE1);

      let modelCalls: number | undefined;
      if (workingDoc._id) {
        try {
          const summary = getStageExecutionSummary(workingDoc._id.toHexString());
          const stageExecution = summary.stages.find((stage) => stage.stageId === 'stage1_planning');
          if (stageExecution) {
            modelCalls = stageExecution.commands.filter((cmd) => cmd.command === 'POST /chat/completions').length;
          }
        } catch (summaryError: any) {
          logger.warn({ err: summaryError }, 'Stage1: 无法获取执行摘要，模型调用统计缺失');
        }
      }

      const gateVerdict: GateLog['verdict'] = fairPlayReport.unsupportedInferences.length > 0 ? 'warn' : 'pass';
      const gateReason = fairPlayReport.unsupportedInferences.length > 0
        ? `存在 ${fairPlayReport.unsupportedInferences.length} 个推论缺少显式支撑`
        : undefined;
      const gateLog: GateLog = {
        name: 'fairPlay.initial',
        verdict: gateVerdict,
        reason: gateReason,
        metrics: {
          unsupported: fairPlayReport.unsupportedInferences.length,
          orphan: fairPlayReport.orphanClues.length,
          economyScore: fairPlayReport.economyScore,
        },
        timestamp: generatedAt,
      };

      const durationMs = computeStageDurationMs(workingDoc.stageStates, 'stage1_planning');
      const stageLog: StageLog = {
        stage: mapStageCode('stage1_planning'),
        stageId: 'stage1_planning',
        promptVersion: PROMPT_VERSION_STAGE1,
        gates: [gateLog],
        durationMs,
        modelCalls,
        timestamp: generatedAt,
      };

      nextMeta = upsertStageLog(nextMeta, stageLog);

      workingDoc = updateWorkflowDocument(workingDoc, { meta: nextMeta });
      await persistWorkflow(workingDoc);
      if (workingDoc._id) {
        createInfoEvent(workingDoc._id.toHexString(), '已生成线索公平性快照', {
          nodes: clueGraph.nodes.length,
          edges: clueGraph.edges.length,
          unsupportedInferences: fairPlayReport.unsupportedInferences.length,
          orphanClues: fairPlayReport.orphanClues.length,
          economyScore: fairPlayReport.economyScore,
          gateVerdict,
        });
      }
    } catch (clueGraphSnapshotError: any) {
      logger.warn(
        { err: clueGraphSnapshotError },
        'Stage1 线索图快照生成失败（跳过并继续后续流程）',
      );
    }
  }

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

  if (workingDoc.review) {
    try {
      const reviewObj = workingDoc.review as Record<string, unknown>;
      const analysis: Stage3AnalysisSnapshot = {
        betaReader: reviewObj?.betaReader as any,
        hypotheses: reviewObj?.hypotheses as any,
      };
      let nextMeta = setStage3Analysis(workingDoc.meta, analysis);
      nextMeta = upsertPromptVersion(nextMeta, PROMPT_VERSION_KEY_STAGE3, PROMPT_VERSION_STAGE3);
      let modelCalls: number | undefined;
      if (workingDoc._id) {
        try {
          const summary = getStageExecutionSummary(workingDoc._id.toHexString());
          const stageExecution = summary.stages.find((stage) => stage.stageId === 'stage3_review');
          if (stageExecution) {
            modelCalls = stageExecution.commands.filter((cmd) => cmd.command === 'POST /chat/completions').length;
          }
        } catch (err) {
          logger.warn({ err }, 'Stage3: 无法获取执行摘要');
        }
      }
      const gates: GateLog[] = [computeHypothesisGate(analysis)];
      const durationMs = computeStageDurationMs(workingDoc.stageStates, 'stage3_review');
      const stageLog: StageLog = {
        stage: mapStageCode('stage3_review'),
        stageId: 'stage3_review',
        promptVersion: PROMPT_VERSION_STAGE3,
        gates,
        durationMs,
        modelCalls,
        timestamp: new Date().toISOString(),
      };
      nextMeta = upsertStageLog(nextMeta, stageLog);
      workingDoc = updateWorkflowDocument(workingDoc, { meta: nextMeta });
      await persistWorkflow(workingDoc);
    } catch (analysisError) {
      logger.warn({ err: analysisError }, 'Stage3 分析结果入库失败');
    }
  }

  // Stage 4
  workingDoc = await runStageWithUpdate(workingDoc, 'stage4_revision', async (telemetry) => {
    const outline = workingDoc.outline as DetectiveOutline;
    let storyDraft = workingDoc.storyDraft as DetectiveStoryDraft;
    const review = workingDoc.review as Record<string, unknown> | undefined;
    if (!outline || !storyDraft) {
      throw new Error('缺少 Stage1/Stage2 输出，无法执行 Stage4');
    }
    let preValidation: ValidationReport | undefined;
    try {
      const preValidationCommand = telemetry?.beginCommand?.({
        label: '修订前预校验',
        command: 'runStage4Validation',
        meta: { phase: 'pre-revision' },
      });
      preValidation = runStage4Validation(outline, storyDraft, {
        outlineId: workingDoc._id?.toHexString(),
        storyId: workingDoc._id?.toHexString(),
      });
      if (preValidationCommand) {
        telemetry?.completeCommand?.(preValidationCommand, {
          resultSummary: '预校验完成',
        });
      }
    } catch (error) {
      telemetry?.log?.('warn', '预校验失败，继续执行修订', {
        meta: { error: (error as Error)?.message },
      });
    }
    const revision = await runStage4Revision(outline, storyDraft, review, preValidation, plannerPrompt, telemetry);
    if (!revision.skipped) {
      storyDraft = revision.draft;
    }
    const enforceCommand = telemetry?.beginCommand?.({
      label: '修订后线索公平性增强',
      command: 'enforceCluePolicy',
      meta: {
        revisionApplied: !revision.skipped,
      },
    });
    const enforced = enforceCluePolicy(outline, storyDraft, {
      ch1MinClues: 3,
      minExposures: 2,
      ensureFinalRecovery: true,
      adjustOutlineExpectedChapters: true,
      maxRedHerringRatio: 0.3,
      maxRedHerringPerChapter: 2,
    });
    if (enforceCommand) {
      telemetry?.completeCommand?.(enforceCommand, {
        resultSummary: '线索公平性增强完成',
      });
    }
    const harmonizeCommand = telemetry?.beginCommand?.({
      label: '修订后同步大纲',
      command: 'harmonizeOutlineWithDraft',
      meta: { stage: 'revision' },
    });
    const harmonized = harmonizeOutlineWithDraft(enforced.outline || outline, enforced.draft, {
      ensureMechanismKeywords: true,
      mechanismKeywords: mechanismPreset.keywords,
    });
    if (harmonizeCommand) {
      telemetry?.completeCommand?.(harmonizeCommand, {
        resultSummary: '已同步大纲与修订稿',
      });
    }
    const revisionTimestamp = new Date().toISOString();
    const baseRevisionNotes = normalizeRevisionNotes(revision.draft.revisionNotes, {
      category: 'model',
      stage: 'stage4_revision',
      source: 'model-output',
      createdAt: revisionTimestamp,
    });
    const mustFixNotes = revision.plan.mustFix
      .map((item) =>
        normalizeRevisionNote(
          {
            message: `已处理：${item.detail}`,
            category: 'validation',
            relatedRuleId: extractRuleId(item?.detail, item?.id),
            chapter: typeof item?.chapterRef === 'string' ? item.chapterRef : undefined,
            source: 'validation-must-fix',
            stage: 'stage4_revision',
            createdAt: revisionTimestamp,
          },
          {
            category: 'validation',
            stage: 'stage4_revision',
            source: 'validation-must-fix',
            createdAt: revisionTimestamp,
          },
        ),
      )
      .filter((note): note is DetectiveRevisionNote => Boolean(note));
    const warningNotes = revision.plan.warnings
      .map((item) =>
        normalizeRevisionNote(
          {
            message: `已核对：${item.detail}`,
            category: 'validation',
            relatedRuleId: extractRuleId(item?.detail, item?.id),
            chapter: typeof item?.chapterRef === 'string' ? item.chapterRef : undefined,
            source: 'validation-warning',
            stage: 'stage4_revision',
            createdAt: revisionTimestamp,
          },
          {
            category: 'validation',
            stage: 'stage4_revision',
            source: 'validation-warning',
            createdAt: revisionTimestamp,
          },
        ),
      )
      .filter((note): note is DetectiveRevisionNote => Boolean(note));
    const continuityRevisionNotes = normalizeRevisionNotes(enforced.draft.continuityNotes, {
      category: 'system',
      stage: 'stage4_revision',
      source: 'continuity-post-enforce',
      createdAt: revisionTimestamp,
    });
    const revisionNotes = mergeRevisionNotes([baseRevisionNotes, mustFixNotes, warningNotes, continuityRevisionNotes]);
    const continuityNoteCandidates = [
      ...(enforced.draft.continuityNotes ?? []),
      ...revision.plan.mustFix.map((item) => `修订已覆盖：${item.detail}`),
      ...revision.plan.warnings.map((item) => `修订确认：${item.detail}`),
    ];
    const continuityNotes = Array.from(
      new Set(continuityNoteCandidates.filter((note) => note && note.trim().length > 0)),
    );
    telemetry?.registerArtifact?.({
      label: '阶段四修订计划',
      type: 'json',
      preview: JSON.stringify(
        {
          skipped: revision.skipped,
          mustFix: revision.plan.mustFix.length,
          warnings: revision.plan.warnings.length,
          revisionNotes,
        },
        null,
        2,
      ),
    });
    const mergedDraft: DetectiveStoryDraft = {
      ...enforced.draft,
      continuityNotes,
      revisionNotes,
      ttsAssets: enforced.draft.ttsAssets ?? storyDraft.ttsAssets,
    };
    try {
      assertPostRevisionCompliance(harmonized.outline || outline, mergedDraft);
    } catch (complianceError: any) {
      telemetry?.log?.('error', '章节时间/动机检查未通过', {
        meta: { error: complianceError?.message },
      });
      throw complianceError;
    }
    return { storyDraft: mergedDraft, outline: harmonized.outline };
  });

  // Stage 5
  workingDoc = await runStageWithUpdate(workingDoc, 'stage5_validation', async (telemetry) => {
    const outline = workingDoc.outline as DetectiveOutline;
    let storyDraft = workingDoc.storyDraft as DetectiveStoryDraft;
    let outlineForValidation = outline;
    if (!outline || !storyDraft) {
      throw new Error('缺少 Stage1/Stage2 输出，无法执行 Stage5');
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
    const clueGraph = buildClueGraphFromOutline(outlineForValidation);
    const fairPlayReport = scoreFairPlay(clueGraph);
    const stage3Analysis = (workingDoc.meta as DetectiveWorkflowMeta | undefined)?.stageResults?.stage3;
    const fairGate = computeFairPlayGate(fairPlayReport);
    const complexityGate = computeComplexityGate(stage3Analysis);
    const validationWithMetrics: ValidationReport = {
      ...validation,
      metrics: {
        ...(validation.metrics ?? {}),
        fairPlayEconomy: fairPlayReport.economyScore,
        unsupportedInferences: fairPlayReport.unsupportedInferences.length,
        inevitabilityIndex: (complexityGate.metrics?.inevitability as number | undefined) ?? 0,
        competitorCount: (complexityGate.metrics?.competitors as number | undefined) ?? 0,
      },
    };

    let nextMeta = upsertPromptVersion(workingDoc.meta, PROMPT_VERSION_KEY_STAGE5, PROMPT_VERSION_STAGE5);
    const gates: GateLog[] = [fairGate, complexityGate];
    const durationMs = computeStageDurationMs(workingDoc.stageStates, 'stage5_validation');
    const stageLog: StageLog = {
      stage: mapStageCode('stage5_validation'),
      stageId: 'stage5_validation',
      promptVersion: PROMPT_VERSION_STAGE5,
      gates,
      durationMs,
      modelCalls: 0,
      timestamp: new Date().toISOString(),
    };
    nextMeta = upsertStageLog(nextMeta, stageLog);
    workingDoc = updateWorkflowDocument(workingDoc, { meta: nextMeta });
    await persistWorkflow(workingDoc);

    if (fairGate.verdict === 'block') {
      throw new Error(fairGate.reason ?? 'Fair-Play Gate 未通过，请补充线索支撑');
    }

    return { validation: validationWithMetrics, outline: outlineForValidation, storyDraft };
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

const MAX_TTS_ASSETS = Number.parseInt(process.env.WORKFLOW_MAX_TTS_ASSETS || '5', 10);

export async function saveWorkflowTtsAsset(
  workflowId: string,
  asset: DetectiveStoryAudioAsset,
): Promise<void> {
  if (!workflowId || !ObjectId.isValid(workflowId)) {
    throw new Error('Invalid workflow id');
  }

  const db = getDatabase();
  const collection = db.collection<DetectiveWorkflowDocument>(COLLECTIONS.STORY_WORKFLOWS);
  const objectId = new ObjectId(workflowId);
  const document = await collection.findOne(
    { _id: objectId },
    { projection: { storyDraft: 1 } },
  );

  if (!document) {
    throw new Error('Workflow not found');
  }

  const generatedAt = asset.generatedAt ?? new Date().toISOString();
  const normalizedAsset: DetectiveStoryAudioAsset = {
    ...asset,
    generatedAt,
    workflowId: asset.workflowId ?? workflowId,
    status: asset.status ?? 'ready',
    segments: Array.isArray(asset.segments) ? asset.segments : [],
  };

  const existingAssets = Array.isArray(document.storyDraft?.ttsAssets)
    ? document.storyDraft!.ttsAssets
    : [];

  const deduped = existingAssets.filter((item) => item?.storyId !== normalizedAsset.storyId);
  deduped.unshift(normalizedAsset);
  const maxAssets = Number.isFinite(MAX_TTS_ASSETS) && MAX_TTS_ASSETS > 0 ? MAX_TTS_ASSETS : 5;
  const nextAssets = deduped.slice(0, maxAssets);

  await collection.updateOne(
    { _id: objectId },
    {
      $set: {
        'storyDraft.ttsAssets': nextAssets,
        updatedAt: new Date(),
      },
    },
  );
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
