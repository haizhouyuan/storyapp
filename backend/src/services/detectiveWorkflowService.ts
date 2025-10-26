
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
  BetaReaderInsight,
  HypothesisEvaluation,
  FairPlayReport,
  LightHypothesisSnapshot,
  DraftAnchorsSummary,
  MotivePatchCandidate,
  ClueDiagnostics,
  ClueIssueDetail,
  ClueGraph,
  RevisionPlanSummary,
  RevisionPlanIssueSummary,
  Stage4RevisionSnapshot,
  Stage5GateSnapshot,
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
  buildMysteryFoundation,
  mapAnchorsToDraft,
  evaluateLightHypothesesSeries,
  type StageTelemetry,
  ensureEndingResolution,
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

const PROMPT_VERSION_STAGE0 = 'stage0.contract.v1';
const PROMPT_VERSION_KEY_STAGE0 = 'stage0_contract';
const PROMPT_VERSION_STAGE1 = 'stage1.contract.v1';
const PROMPT_VERSION_KEY_STAGE1 = 'stage1_outline';
const PROMPT_VERSION_STAGE2 = 'stage2.writing.v1';
const PROMPT_VERSION_KEY_STAGE2 = 'stage2_writing';
const PROMPT_VERSION_STAGE3 = 'stage3.review.v1';
const PROMPT_VERSION_KEY_STAGE3 = 'stage3_review';
const PROMPT_VERSION_STAGE4 = 'stage4.revision.v1';
const PROMPT_VERSION_KEY_STAGE4 = 'stage4_revision';
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

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function extractBetaReaderInsight(source: unknown): BetaReaderInsight | undefined {
  if (!isRecord(source)) return undefined;
  const candidates = [
    source.betaReader,
    isRecord(source.analysis) ? source.analysis.betaReader : undefined,
    isRecord(source.review) ? source.review.betaReader : undefined,
  ];
  for (const candidate of candidates) {
    if (
      isRecord(candidate) &&
      typeof candidate.topSuspect === 'string' &&
      typeof candidate.confidence === 'number'
    ) {
      return candidate as BetaReaderInsight;
    }
  }
  return undefined;
}

function extractHypothesisEvaluation(source: unknown): HypothesisEvaluation | undefined {
  if (!isRecord(source)) return undefined;
  const candidates = [
    source.hypotheses,
    isRecord(source.analysis) ? source.analysis.hypotheses : undefined,
    isRecord(source.review) ? source.review.hypotheses : undefined,
  ];
  for (const candidate of candidates) {
    if (isRecord(candidate) && Array.isArray(candidate.candidates)) {
      return candidate as HypothesisEvaluation;
    }
  }
  return undefined;
}

function buildHypothesesFromLightSnapshots(
  snapshots: LightHypothesisSnapshot[] | undefined,
): HypothesisEvaluation | undefined {
  if (!Array.isArray(snapshots) || snapshots.length === 0) return undefined;
  const latest = snapshots[snapshots.length - 1];
  if (!latest || !Array.isArray(latest.rank) || latest.rank.length === 0) return undefined;
  const candidates = latest.rank
    .filter((entry) => entry && typeof entry.name === 'string')
    .map((entry) => ({
      suspect: entry.name,
      confidence: Math.max(
        0,
        Math.min(1, typeof entry.score === 'number' ? entry.score : Number(entry.score) || 0),
      ),
      evidence: Array.isArray(entry.evidenceIds)
        ? entry.evidenceIds.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        : [],
    }));
  if (!candidates.length) return undefined;
  return {
    candidates,
    notes: [`由逐章轻量假说缓存推断（截至第 ${latest.chapterIndex + 1} 章）`],
  };
}

function buildBetaReaderFromLightSnapshots(
  snapshots: LightHypothesisSnapshot[] | undefined,
): BetaReaderInsight | undefined {
  if (!Array.isArray(snapshots) || snapshots.length === 0) return undefined;
  const latest = snapshots[snapshots.length - 1];
  if (!latest || !Array.isArray(latest.rank) || latest.rank.length === 0) return undefined;
  const top = latest.rank[0];
  if (!top || typeof top.name !== 'string') return undefined;
  const evidence = Array.isArray(top.evidenceIds)
    ? top.evidenceIds.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
  return {
    topSuspect: top.name,
    confidence: Math.max(
      0,
      Math.min(1, typeof top.score === 'number' ? top.score : Number(top.score) || 0),
    ),
    evidence,
    summary: `逐章轻量评估显示 ${top.name} 置信度约为 ${Math.round(
      Math.max(0, Math.min(1, top.score || 0)) * 100,
    )}%`,
    competingSuspects: latest.rank
      .slice(1, 3)
      .map((entry) => entry?.name)
      .filter((name): name is string => Boolean(name && name.trim().length > 0)),
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

function setStage4RevisionSummary(
  meta: DetectiveWorkflowMeta | undefined,
  plan: RevisionPlanSummary | undefined,
): DetectiveWorkflowMeta {
  if (!plan) {
    const stageResults = { ...(meta?.stageResults ?? {}) };
    if (stageResults.stage4) {
      delete stageResults.stage4;
    }
    return {
      ...(meta ?? {}),
      stageResults: Object.keys(stageResults).length > 0 ? stageResults : undefined,
    };
  }
  const stageResults = {
    ...(meta?.stageResults ?? {}),
    stage4: { plan } satisfies Stage4RevisionSnapshot,
  };
  return {
    ...(meta ?? {}),
    stageResults,
  };
}

function setStage5GateSnapshot(
  meta: DetectiveWorkflowMeta | undefined,
  gates: GateLog[],
  generatedAt: string,
  notes?: string[],
): DetectiveWorkflowMeta {
  const stageResults = {
    ...(meta?.stageResults ?? {}),
    stage5: {
      gates,
      generatedAt,
      ...(notes && notes.length > 0 ? { notes } : {}),
    } satisfies Stage5GateSnapshot,
  };
  return {
    ...(meta ?? {}),
    stageResults,
  };
}

function inferIssueKindFromId(id: string): ClueIssueDetail['kind'] {
  if (id.startsWith('c:')) return 'clue';
  if (id.startsWith('f:')) return 'fact';
  if (id.startsWith('i:')) return 'inference';
  return 'inference';
}

function buildClueDiagnosticsSnapshot(graph: ClueGraph, report: FairPlayReport): ClueDiagnostics {
  const nodeMap = new Map(graph.nodes.map((node) => [node.id, node]));
  const incomingMap = new Map<string, string[]>();
  const outgoingMap = new Map<string, string[]>();

  graph.edges.forEach((edge) => {
    if (!incomingMap.has(edge.to)) {
      incomingMap.set(edge.to, []);
    }
    incomingMap.get(edge.to)!.push(edge.from);

    if (!outgoingMap.has(edge.from)) {
      outgoingMap.set(edge.from, []);
    }
    outgoingMap.get(edge.from)!.push(edge.to);
  });

  const toIssueDetail = (id: string): ClueIssueDetail => {
    const node = nodeMap.get(id);
    return {
      id,
      kind: node?.kind ?? inferIssueKindFromId(id),
      text: node?.text ?? '',
      sourceRef: node?.sourceRef,
      chapterHint: node?.chapterHint,
      anchorStatus: node?.anchorStatus,
      anchors: node?.anchors ?? [],
    };
  };

  const unsupportedInferences = report.unsupportedInferences.map((id) => {
    const detail = toIssueDetail(id);
    const supports = incomingMap.get(id) ?? [];
    return {
      ...detail,
      missingSupports: supports,
    };
  });

  const orphanClues = report.orphanClues.map((id) => {
    const detail = toIssueDetail(id);
    const consumers = outgoingMap.get(id) ?? [];
    return {
      ...detail,
      consumers,
    };
  });

  return {
    updatedAt: new Date().toISOString(),
    unsupportedInferences,
    orphanClues,
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

export function computeFairPlayGate(report: FairPlayReport, options?: { autoFixAttempted?: boolean }): GateLog {
  const hasUnsupported = report.unsupportedInferences.length > 0;
  const hasOrphans = report.orphanClues.length > 0;
  const hasIssues = hasUnsupported || hasOrphans;
  const verdict: GateLog['verdict'] = hasIssues ? 'block' : 'pass';
  const reason = hasIssues
    ? `仍有 ${report.unsupportedInferences.length} 条推论缺乏显式线索支撑，孤立线索 ${report.orphanClues.length} 条`
    : undefined;
  const nextAction: GateLog['nextAction'] = hasIssues
    ? options?.autoFixAttempted
      ? 'notify'
      : 'auto_patch'
    : 'none';
  return {
    name: 'fairPlay.final',
    verdict,
    reason,
    metrics: {
      unsupported: report.unsupportedInferences.length,
      orphan: report.orphanClues.length,
      economyScore: report.economyScore,
    },
    nextAction,
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
      nextAction: 'notify',
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
    nextAction: verdict === 'pass' ? 'none' : 'notify',
  };
}

export function computeRevisionGate(plan?: RevisionPlanSummary | null): GateLog {
  const outstanding = plan?.mustFix?.length ?? 0;
  const warningCount = plan?.warnings?.length ?? 0;
  if (!plan) {
    return {
      name: 'revision.mustFix',
      verdict: 'pass',
      metrics: {
        outstanding,
        warnings: warningCount,
      },
      nextAction: 'none',
    };
  }
  const verdict: GateLog['verdict'] = outstanding > 0 ? 'block' : warningCount > 0 ? 'warn' : 'pass';
  const reason =
    verdict === 'block'
      ? `仍有 ${outstanding} 条 must-fix 未处理，请补充修订后再验证`
      : warningCount > 0
        ? `仍有 ${warningCount} 条警告待人工确认`
        : undefined;
  return {
    name: 'revision.mustFix',
    verdict,
    reason,
    metrics: {
      outstanding,
      warnings: warningCount,
    },
    nextAction: verdict === 'pass' ? 'none' : 'notify',
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
  const candidates: MotivePatchCandidate[] = Array.isArray(draft?.motivePatchCandidates)
    ? draft.motivePatchCandidates
    : [];
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
    if (missing.length > 0 && candidates.length > 0) {
      const suspectName = suspect.name || 'suspect';
      const stillMissing = missing.filter((keyword) => {
        const normalized = keyword.trim();
        if (!normalized) return false;
        const candidateHit = candidates.some((candidate) => {
          if (!candidate) return false;
          const candidateKeyword = (candidate.keyword || '').trim();
          if (!candidateKeyword || candidateKeyword !== normalized) {
            return false;
          }
          const candidateSuspect = (candidate.suspect || '').trim() || 'suspect';
          const matchesSuspect =
            candidateSuspect === suspectName ||
            candidateSuspect === 'solution' ||
            candidateSuspect === 'all';
          if (!matchesSuspect) {
            return false;
          }
          if (candidate.status === 'applied') {
            return true;
          }
          const sentence = (candidate.suggestedSentence || '').trim();
          if (!sentence) {
            return false;
          }
          return earlyText.includes(sentence);
        });
        return !candidateHit;
      });
      if (stillMissing.length === 0) {
        return;
      }
      errors.push(`[${MOTIVE_RULE_ID}] 嫌疑人 ${suspect.name || '未知'} 的动机关键词缺失：${stillMissing.join('、')}`);
      return;
    }
    if (missing.length > 0) {
      errors.push(`[${MOTIVE_RULE_ID}] 嫌疑人 ${suspect.name || '未知'} 的动机关键词缺失：${missing.join('、')}`);
    }
  });
  return errors;
}

type PostRevisionComplianceIssue = {
  id: string;
  category: 'anchors' | 'motive';
  detail: string;
};

function collectPostRevisionComplianceIssues(
  outline: DetectiveOutline,
  draft: DetectiveStoryDraft,
): PostRevisionComplianceIssue[] {
  const issues: PostRevisionComplianceIssue[] = [];
  const anchorProblems = ensureChapterAnchorsCompliance(outline, draft);
  anchorProblems.forEach((detail, index) => {
    issues.push({
      id: `post-revision-anchors-${index + 1}`,
      category: 'anchors',
      detail,
    });
  });
  const motiveProblems = ensureMotiveCompliance(outline, draft);
  motiveProblems.forEach((detail, index) => {
    issues.push({
      id: `post-revision-motive-${index + 1}`,
      category: 'motive',
      detail,
    });
  });
  return issues;
}

type StageRunnerOutput = Partial<Pick<DetectiveWorkflowDocument, 'outline' | 'storyDraft' | 'review' | 'validation'>>;

type Stage5LogContext = { gates: GateLog[]; durationMs?: number; notes?: string[] };

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
  const mysteryFoundation = buildMysteryFoundation(mechanismPreset);
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
      mysteryContractSnippet: mysteryFoundation.promptSnippet,
      patternProfile: mysteryFoundation.pattern,
      mysteryContractId: mysteryFoundation.contract.id,
    },
  };

  let stage0Meta: DetectiveWorkflowMeta = {
    ...(document.meta ?? {}),
    mechanismPreset,
    mysteryContract: mysteryFoundation.contract,
    mysteryPattern: mysteryFoundation.pattern,
  };
  stage0Meta = upsertPromptVersion(stage0Meta, PROMPT_VERSION_KEY_STAGE0, PROMPT_VERSION_STAGE0);

  const stage0Timestamp = new Date().toISOString();
  const stage0Log: StageLog = {
    stage: 'S0',
    stageId: 'stage0_contract',
    promptVersion: PROMPT_VERSION_STAGE0,
    gates: [],
    durationMs: 0,
    notes: [
      `合约摘要：${mysteryFoundation.contract.summary}`,
      `诡计模式：${mysteryFoundation.pattern.label}`,
    ],
    meta: {
      contractId: mysteryFoundation.contract.id,
      patternId: mysteryFoundation.pattern.id,
    },
    timestamp: stage0Timestamp,
  };
  stage0Meta = upsertStageLog(stage0Meta, stage0Log);

  let workingDoc: DetectiveWorkflowDocument = {
    ...document,
    meta: stage0Meta,
  };
  workingDoc = updateWorkflowDocument(workingDoc, { meta: stage0Meta });
  if (workingDoc._id) {
    await persistWorkflow(workingDoc);
    createInfoEvent(workingDoc._id.toHexString(), '已建立推理合约与诡计模式', {
      contractId: mysteryFoundation.contract.id,
      patternId: mysteryFoundation.pattern.id,
    });
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
      const diagnostics = buildClueDiagnosticsSnapshot(clueGraph, fairPlayReport);
      const generatedAt = new Date().toISOString();

      let nextMeta: DetectiveWorkflowMeta = {
        ...(workingDoc.meta ?? {}),
        clueGraphSnapshot: {
          generatedAt,
          graph: clueGraph,
          report: fairPlayReport,
          version: CLUE_GRAPH_VERSION,
        },
        clueDiagnostics: diagnostics,
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
      const notes: string[] = [];
      if (fairPlayReport.unsupportedInferences.length > 0) {
        notes.push(`未支撑推论：${fairPlayReport.unsupportedInferences.join(', ')}`);
      }
      if (fairPlayReport.orphanClues.length > 0) {
        notes.push(`孤立线索：${fairPlayReport.orphanClues.join(', ')}`);
      }
      const stageLog: StageLog = {
        stage: mapStageCode('stage1_planning'),
        stageId: 'stage1_planning',
        promptVersion: PROMPT_VERSION_STAGE1,
        gates: [gateLog],
        durationMs,
        modelCalls,
        notes: notes.length > 0 ? notes : undefined,
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

  if (workingDoc.storyDraft) {
    try {
      const storyDraft = workingDoc.storyDraft as DetectiveStoryDraft;
      const outline = workingDoc.outline as DetectiveOutline;
      let nextMeta: DetectiveWorkflowMeta = workingDoc.meta ?? {};
      const existingSnapshot = nextMeta.clueGraphSnapshot;
      const anchorResult = existingSnapshot
        ? mapAnchorsToDraft(existingSnapshot.graph, storyDraft)
        : null;
      if (anchorResult) {
        const refreshedReport = scoreFairPlay(anchorResult.graph);
        const diagnostics = buildClueDiagnosticsSnapshot(anchorResult.graph, refreshedReport);
        const updatedSnapshot = existingSnapshot
          ? {
              ...existingSnapshot,
              graph: anchorResult.graph,
              report: refreshedReport,
            }
          : {
              generatedAt: anchorResult.summary.updatedAt,
              graph: anchorResult.graph,
              report: refreshedReport,
              version: CLUE_GRAPH_VERSION,
            };
        nextMeta = {
          ...nextMeta,
          clueGraphSnapshot: updatedSnapshot,
          anchorsSummary: anchorResult.summary,
          clueDiagnostics: diagnostics,
        };
      }
      let lightSnapshots: LightHypothesisSnapshot[] = [];
      if (outline) {
        lightSnapshots = await evaluateLightHypothesesSeries(outline, storyDraft, {
          chapterLimit: Math.min(Math.max(storyDraft.chapters.length - 1, 0), 3),
          concurrency: 2,
        });
        if (lightSnapshots.length > 0) {
          nextMeta = {
            ...nextMeta,
            lightHypotheses: lightSnapshots,
          };
        }
      }
      nextMeta = upsertPromptVersion(nextMeta, PROMPT_VERSION_KEY_STAGE2, PROMPT_VERSION_STAGE2);

      let modelCalls: number | undefined;
      if (workingDoc._id) {
        try {
          const summary = getStageExecutionSummary(workingDoc._id.toHexString());
          const stageExecution = summary.stages.find((stage) => stage.stageId === 'stage2_writing');
          if (stageExecution) {
            modelCalls = stageExecution.commands.filter((cmd) => cmd.command === 'POST /chat/completions').length;
          }
        } catch (summaryError: any) {
          logger.warn({ err: summaryError }, 'Stage2: 无法获取执行摘要，模型调用统计缺失');
        }
      }

      const durationMs = computeStageDurationMs(workingDoc.stageStates, 'stage2_writing');
      const notes: string[] = [];
      if (anchorResult) {
        const clueSummary = `线索 ${anchorResult.summary.mappedClues}/${anchorResult.summary.mappedClues + anchorResult.summary.unresolvedClues.length}`;
        const inferenceSummary = `推论 ${anchorResult.summary.mappedInferences}/${anchorResult.summary.mappedInferences + anchorResult.summary.unresolvedInferences.length}`;
        notes.push(
          `线索锚点：${clueSummary}，待补 ${anchorResult.summary.unresolvedClues.length}；${inferenceSummary}，待补 ${anchorResult.summary.unresolvedInferences.length}`,
        );
      }
      if (Array.isArray(storyDraft.continuityNotes) && storyDraft.continuityNotes.length > 0) {
        notes.push(`连续性提示 ${storyDraft.continuityNotes.length} 条`);
      }
      if (lightSnapshots.length > 0) {
        const latest = lightSnapshots[lightSnapshots.length - 1];
        const top = latest.rank[0];
        notes.push(`逐章假说：第${latest.chapterIndex + 1}章前最可疑 ${top.name} (score=${top.score.toFixed(2)})`);
      }
      notes.push('已执行 Watson 视角与 StylePack 调整');

      const stageLog: StageLog = {
        stage: mapStageCode('stage2_writing'),
        stageId: 'stage2_writing',
        promptVersion: PROMPT_VERSION_STAGE2,
        gates: [],
        durationMs,
        modelCalls,
        notes,
        timestamp: new Date().toISOString(),
      };

      nextMeta = upsertStageLog(nextMeta, stageLog);
      workingDoc = updateWorkflowDocument(workingDoc, { meta: nextMeta });
      await persistWorkflow(workingDoc);

      if (workingDoc._id) {
        if (anchorResult) {
          createInfoEvent(workingDoc._id.toHexString(), '已回填线索锚点', {
            mapped: anchorResult.summary.mappedClues,
            unresolved: anchorResult.summary.unresolvedClues.length,
          });
        }
        if (lightSnapshots.length > 0) {
          createInfoEvent(workingDoc._id.toHexString(), '已生成逐章轻量假说评估', {
            checkpoints: lightSnapshots.length,
            latestChapter: lightSnapshots[lightSnapshots.length - 1].chapterIndex + 1,
            topSuspect: lightSnapshots[lightSnapshots.length - 1].rank[0]?.name,
          });
        }
      }
    } catch (anchorError) {
      logger.warn({ err: anchorError }, 'Stage2 锚点回填失败');
    }
  }

  let stage3Analysis: Stage3AnalysisSnapshot | undefined;

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
      const previousAnalysis =
        (workingDoc.meta as DetectiveWorkflowMeta | undefined)?.stageResults?.stage3;
      const lightSnapshots = Array.isArray((workingDoc.meta as DetectiveWorkflowMeta | undefined)?.lightHypotheses)
        ? ((workingDoc.meta as DetectiveWorkflowMeta).lightHypotheses as LightHypothesisSnapshot[])
        : undefined;
      const directBetaReader = extractBetaReaderInsight(reviewObj);
      const directHypotheses = extractHypothesisEvaluation(reviewObj);
      const fallbackBeta = directBetaReader ? undefined : buildBetaReaderFromLightSnapshots(lightSnapshots);
      const fallbackHypotheses = directHypotheses ? undefined : buildHypothesesFromLightSnapshots(lightSnapshots);
      const betaReaderSource = directBetaReader
        ? 'review'
        : previousAnalysis?.betaReader
        ? 'previous'
        : fallbackBeta
        ? 'fallback'
        : null;
      const hypothesesSource = directHypotheses
        ? 'review'
        : previousAnalysis?.hypotheses
        ? 'previous'
        : fallbackHypotheses
        ? 'fallback'
        : null;
      const betaReader =
        directBetaReader ?? previousAnalysis?.betaReader ?? fallbackBeta ?? undefined;
      const hypotheses =
        directHypotheses ?? previousAnalysis?.hypotheses ?? fallbackHypotheses ?? undefined;
      const analysis: Stage3AnalysisSnapshot | undefined =
        betaReader || hypotheses
          ? { ...(betaReader ? { betaReader } : {}), ...(hypotheses ? { hypotheses } : {}) }
          : previousAnalysis;
      stage3Analysis = analysis ?? previousAnalysis ?? undefined;
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
      const notes: string[] = [];
      if (betaReader?.topSuspect) {
        notes.push(
          `BetaReader：${betaReader.topSuspect} ${(betaReader.confidence * 100).toFixed(0)}%`,
        );
        if (betaReaderSource === 'fallback') {
          notes.push('BetaReader 结果来源：逐章轻量假说缓存');
        }
      }
      const hypothesisCount = analysis?.hypotheses?.candidates?.length ?? 0;
      if (hypothesisCount > 0) {
        notes.push(`竞争假说 ${hypothesisCount} 个`);
        if (hypothesesSource === 'fallback') {
          notes.push('竞争假说来源：逐章轻量假说缓存');
        }
      }
      const mustFixCount = Array.isArray((reviewObj as any)?.mustFixBeforePublish)
        ? (reviewObj as any).mustFixBeforePublish.length
        : 0;
      if (mustFixCount > 0) {
        notes.push(`Must-fix 提示 ${mustFixCount} 项`);
      }
      const stageLog: StageLog = {
        stage: mapStageCode('stage3_review'),
        stageId: 'stage3_review',
        promptVersion: PROMPT_VERSION_STAGE3,
        gates,
        durationMs,
        modelCalls,
        notes: notes.length > 0 ? notes : undefined,
        timestamp: new Date().toISOString(),
      };
      nextMeta = upsertStageLog(nextMeta, stageLog);
      workingDoc = updateWorkflowDocument(workingDoc, { meta: nextMeta });
      await persistWorkflow(workingDoc);
    } catch (analysisError) {
      logger.warn({ err: analysisError }, 'Stage3 分析结果入库失败');
    }
  }

  let stage4LogContext: { notes: string[]; durationMs?: number; modelCalls?: number } | null = null;
  let stage5LogContext: Stage5LogContext | null = null;

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
    const revision = await runStage4Revision(
      outline,
      storyDraft,
      review,
      preValidation,
      plannerPrompt,
      telemetry,
      (workingDoc.meta as DetectiveWorkflowMeta | undefined)?.anchorsSummary ?? null,
      stage3Analysis ?? null,
    );
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
    const postRevisionIssues = collectPostRevisionComplianceIssues(
      harmonized.outline || outline,
      enforced.draft,
    );
    if (postRevisionIssues.length > 0) {
      const existingIds = new Set(revision.plan.mustFix.map((item) => item.id));
      postRevisionIssues.forEach((issue) => {
        if (existingIds.has(issue.id)) return;
        revision.plan.mustFix.push({
          id: issue.id,
          detail: issue.detail,
          category: issue.category,
        });
      });
      telemetry?.log?.('warn', '修订后检测到章节/动机缺口', {
        meta: {
          issueCount: postRevisionIssues.length,
          categories: Array.from(new Set(postRevisionIssues.map((issue) => issue.category))).join(','),
        },
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
    const planSummary: RevisionPlanSummary = {
      mustFix: revision.plan.mustFix.map((item, index) => ({
        id: item.id ?? `mustfix-${index + 1}`,
        detail: item.detail,
        category: item.category,
        chapterRef: item.chapterRef,
      })),
      warnings: revision.plan.warnings.map((item, index) => ({
        id: item.id ?? `warn-${index + 1}`,
        detail: item.detail,
        category: item.category,
        chapterRef: item.chapterRef,
      })),
      suggestions: [...revision.plan.suggestions],
      generatedAt: revisionTimestamp,
    };
    const mergedDraft: DetectiveStoryDraft = {
      ...enforced.draft,
      continuityNotes,
      revisionNotes,
      revisionPlan: planSummary,
      ttsAssets: enforced.draft.ttsAssets ?? storyDraft.ttsAssets,
    };
    const endingResult = ensureEndingResolution(harmonized.outline || outline, mergedDraft);
    if (endingResult.appended) {
      telemetry?.log?.('info', '自动补写结尾善后段，避免 Stage5 再次告警');
    }
    return { storyDraft: endingResult.draft, outline: harmonized.outline };
  });

  try {
    let nextMeta = upsertPromptVersion(workingDoc.meta, PROMPT_VERSION_KEY_STAGE4, PROMPT_VERSION_STAGE4);
    const revisionPlanSummary = workingDoc.storyDraft?.revisionPlan;
    if (revisionPlanSummary) {
      nextMeta = setStage4RevisionSummary(nextMeta, revisionPlanSummary);
    }
    workingDoc = updateWorkflowDocument(workingDoc, { meta: nextMeta });
    await persistWorkflow(workingDoc);
  } catch (metaError) {
    logger.warn({ err: metaError }, 'Stage4 prompt 版本记录失败');
  }

  try {
    const motiveCandidates: MotivePatchCandidate[] = Array.isArray(workingDoc.storyDraft?.motivePatchCandidates)
      ? workingDoc.storyDraft!.motivePatchCandidates!.map((candidate) => ({ ...candidate }))
      : [];
    const totalCandidates = motiveCandidates.length;
    const appliedCandidates = motiveCandidates.filter((candidate) => candidate?.status === 'applied').length;
    const stageNotes: string[] = [];
    if (totalCandidates > 0) {
      stageNotes.push(`动机伏笔候选：已应用 ${appliedCandidates}/${totalCandidates}`);
    }
    const revisionPlanSummary = workingDoc.storyDraft?.revisionPlan;
    const outstandingMustFix = revisionPlanSummary?.mustFix?.length ?? 0;
    const outstandingWarnings = revisionPlanSummary?.warnings?.length ?? 0;
    if (outstandingMustFix > 0) {
      stageNotes.push(`修订必修项剩余 ${outstandingMustFix} 条`);
    }
    if (outstandingWarnings > 0) {
      stageNotes.push(`修订警告待处理 ${outstandingWarnings} 条`);
    }
    const continuityCount = Array.isArray(workingDoc.storyDraft?.continuityNotes)
      ? workingDoc.storyDraft!.continuityNotes!.length
      : 0;
    if (continuityCount > 0) {
      stageNotes.push(`连续性提示 ${continuityCount} 条`);
    }
    const appendedEnding = Array.isArray(workingDoc.storyDraft?.continuityNotes)
      ? workingDoc.storyDraft!.continuityNotes!.some((note) => typeof note === 'string' && note.includes('结尾善后段'))
      : false;
    if (appendedEnding) {
      stageNotes.push('结尾善后段：系统已自动补写');
    }
    const durationMs = computeStageDurationMs(workingDoc.stageStates, 'stage4_revision');
    let modelCalls: number | undefined;
    if (workingDoc._id) {
      try {
        const summary = getStageExecutionSummary(workingDoc._id.toHexString());
        const stageExecution = summary.stages.find((stage) => stage.stageId === 'stage4_revision');
        if (stageExecution) {
          modelCalls = stageExecution.commands.filter((cmd) => cmd.command === 'POST /chat/completions').length;
        }
      } catch (summaryError: any) {
        logger.warn({ err: summaryError }, 'Stage4: 无法获取执行摘要');
      }
    }
    stage4LogContext = {
      notes: stageNotes,
      durationMs,
      modelCalls,
    };
  } catch (stage4LogError) {
    logger.warn({ err: stage4LogError }, 'Stage4 日志记录失败');
  }

  // Stage 5
  let stage5Error: unknown = null;
  try {
    workingDoc = await runStageWithUpdate(workingDoc, 'stage5_validation', async (telemetry) => {
    const outline = workingDoc.outline as DetectiveOutline;
    let storyDraft = workingDoc.storyDraft as DetectiveStoryDraft;
    let outlineForValidation = outline;
    if (!outline || !storyDraft) {
      throw new Error('缺少 Stage1/Stage2 输出，无法执行 Stage5');
    }
    const workflowIdString = workingDoc._id?.toHexString();
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
    const endingResult = ensureEndingResolution(outlineForValidation, storyDraft);
    if (endingResult.appended) {
      telemetry?.log?.('info', '校验前补写结尾善后段');
    }
    storyDraft = endingResult.draft;
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
    const previousSnapshot =
      (workingDoc.meta as DetectiveWorkflowMeta | undefined)?.clueGraphSnapshot ?? null;
    const previousAnchorsSummary =
      (workingDoc.meta as DetectiveWorkflowMeta | undefined)?.anchorsSummary ?? null;
    let clueGraph = buildClueGraphFromOutline(outlineForValidation);
    let anchorResultFinal = mapAnchorsToDraft(clueGraph, storyDraft);
    if (anchorResultFinal) {
      clueGraph = anchorResultFinal.graph;
    } else if ((!clueGraph.nodes || clueGraph.nodes.length === 0) && previousSnapshot?.graph) {
      clueGraph = previousSnapshot.graph;
    }
    let fairPlayReport = scoreFairPlay(clueGraph);
    let clueDiagnostics = buildClueDiagnosticsSnapshot(clueGraph, fairPlayReport);
    const stage3Analysis = (workingDoc.meta as DetectiveWorkflowMeta | undefined)?.stageResults?.stage3;
    let revisionPlan = storyDraft.revisionPlan;
    if (revisionPlan) {
      const existingMustFix = Array.isArray(revisionPlan.mustFix) ? [...revisionPlan.mustFix] : [];
      const existingIds = new Set(existingMustFix.map((item) => item.id));
      const fairnessIssues: RevisionPlanIssueSummary[] = [];
      clueDiagnostics.unsupportedInferences.forEach((issue) => {
        const issueId = `fair-play-${issue.id}`;
        if (existingIds.has(issueId)) return;
        const supports =
          Array.isArray(issue.missingSupports) && issue.missingSupports.length > 0
            ? Array.from(
                new Set(
                  issue.missingSupports.filter((value): value is string => Boolean(value)),
                ),
              ).join('、')
            : '';
        fairnessIssues.push({
          id: issueId,
          detail: supports
            ? `推论 ${issue.id} 缺少显式支撑，请补写 ${supports} 对应的场景或对白。`
            : `推论 ${issue.id} 缺少显式支撑，请补写对应证据场景。`,
          category: 'fair_play',
        });
      });
      clueDiagnostics.orphanClues.forEach((issue) => {
        const issueId = `fair-play-orphan-${issue.id}`;
        if (existingIds.has(issueId)) return;
        fairnessIssues.push({
          id: issueId,
          detail: `线索 ${issue.id} 尚未被推理消费，请在正文安排其被引用或调整布置位置。`,
          category: 'fair_play',
        });
      });
      if (fairnessIssues.length > 0) {
        revisionPlan = {
          ...revisionPlan,
          mustFix: [...existingMustFix, ...fairnessIssues],
        };
        storyDraft = {
          ...storyDraft,
          revisionPlan,
        };
      }
    }
    if (!anchorResultFinal && previousSnapshot?.graph) {
      fairPlayReport = scoreFairPlay(clueGraph);
      clueDiagnostics = buildClueDiagnosticsSnapshot(clueGraph, fairPlayReport);
    }
    const fairGate = computeFairPlayGate(fairPlayReport, { autoFixAttempted: enableAutoFix });
    const complexityGate = computeComplexityGate(stage3Analysis);
    const revisionGate = computeRevisionGate(revisionPlan);
    const anchorsSummaryFinal =
      anchorResultFinal?.summary ?? previousAnchorsSummary ?? undefined;
    const validationWithMetrics: ValidationReport = {
      ...validation,
      metrics: {
        ...(validation.metrics ?? {}),
        fairPlayEconomy: fairPlayReport.economyScore,
        unsupportedInferences: fairPlayReport.unsupportedInferences.length,
        inevitabilityIndex: (complexityGate.metrics?.inevitability as number | undefined) ?? 0,
        competitorCount: (complexityGate.metrics?.competitors as number | undefined) ?? 0,
        outstandingMustFix: revisionPlan?.mustFix?.length ?? 0,
      },
    };

    const gateTimestamp = new Date().toISOString();
    let nextMeta = upsertPromptVersion(workingDoc.meta, PROMPT_VERSION_KEY_STAGE5, PROMPT_VERSION_STAGE5);
    nextMeta = {
      ...nextMeta,
      clueGraphSnapshot: {
        generatedAt: gateTimestamp,
        graph: clueGraph,
        report: fairPlayReport,
        version: CLUE_GRAPH_VERSION,
      },
      clueDiagnostics,
      ...(anchorsSummaryFinal ? { anchorsSummary: anchorsSummaryFinal } : {}),
    };
    if (storyDraft.revisionPlan) {
      nextMeta = setStage4RevisionSummary(nextMeta, storyDraft.revisionPlan);
    }
    const gates: GateLog[] = [fairGate, complexityGate, revisionGate];
    const stage5Notes: string[] = [];
    if (clueDiagnostics.unsupportedInferences.length > 0) {
      const ids = clueDiagnostics.unsupportedInferences.map((issue) => issue.id).slice(0, 3);
      const suffix = clueDiagnostics.unsupportedInferences.length > ids.length ? '…' : '';
      stage5Notes.push(`未支撑推论 ${clueDiagnostics.unsupportedInferences.length} 条：${ids.join('、')}${suffix}`);
    }
    if (clueDiagnostics.orphanClues.length > 0) {
      const ids = clueDiagnostics.orphanClues.map((issue) => issue.id).slice(0, 3);
      const suffix = clueDiagnostics.orphanClues.length > ids.length ? '…' : '';
      stage5Notes.push(`孤立线索 ${clueDiagnostics.orphanClues.length} 条：${ids.join('、')}${suffix}`);
    }
    const outstandingMustFix = revisionPlan?.mustFix?.length ?? 0;
    if (outstandingMustFix > 0) {
      stage5Notes.push(`修订必修项未清理：${outstandingMustFix} 条`);
    }
    if (workflowIdString) {
      gates
        .filter((gate) => gate.verdict !== 'pass')
        .forEach((gate) => {
          createInfoEvent(workflowIdString, `Gate 告警：${gate.name}`, {
            verdict: gate.verdict,
            reason: gate.reason,
            nextAction: gate.nextAction ?? 'none',
            metrics: gate.metrics,
            notes: stage5Notes,
          });
        });
    }
    const durationMs = computeStageDurationMs(workingDoc.stageStates, 'stage5_validation');
    stage5LogContext = {
      gates,
      durationMs,
      notes: stage5Notes.length > 0 ? stage5Notes : undefined,
    };
    nextMeta = setStage5GateSnapshot(nextMeta, gates, gateTimestamp, stage5Notes);
    workingDoc = updateWorkflowDocument(workingDoc, { meta: nextMeta });
    await persistWorkflow(workingDoc);

    if (revisionGate.verdict === 'block') {
      const message = revisionGate.reason ?? stage5Notes.find((note) => note.includes('修订')) ?? '修订计划仍存在 must-fix 未处理';
      throw new Error(message);
    }
    if (fairGate.verdict === 'block') {
      const message = stage5Notes.find((note) => note.startsWith('未支撑推论')) || stage5Notes.find((note) => note.startsWith('孤立线索')) || fairGate.reason || 'Fair-Play Gate 未通过，请补充线索支撑';
      throw new Error(message);
    }

    return { validation: validationWithMetrics, outline: outlineForValidation, storyDraft };
  });
  } catch (error) {
    stage5Error = error;
    if (workingDoc._id) {
      try {
        const db = getDatabase();
        const freshDoc = await db
          .collection<DetectiveWorkflowDocument>(COLLECTIONS.STORY_WORKFLOWS)
          .findOne({ _id: workingDoc._id });
        if (freshDoc) {
          workingDoc = freshDoc;
        }
      } catch (reloadError) {
        logger.warn({ err: reloadError }, 'Stage5 失败后刷新工作流文档失败');
      }
    }
  }

  try {
    let nextMeta: DetectiveWorkflowMeta = workingDoc.meta ?? {};
    nextMeta = upsertPromptVersion(nextMeta, PROMPT_VERSION_KEY_STAGE5, PROMPT_VERSION_STAGE5);
    if (stage4LogContext !== null) {
      const stageLog: StageLog = {
        stage: mapStageCode('stage4_revision'),
        stageId: 'stage4_revision',
        promptVersion: PROMPT_VERSION_STAGE4,
        gates: [],
        durationMs: stage4LogContext.durationMs,
        modelCalls: stage4LogContext.modelCalls,
        notes: stage4LogContext.notes.length > 0 ? stage4LogContext.notes : undefined,
        timestamp: new Date().toISOString(),
      };
      nextMeta = upsertStageLog(nextMeta, stageLog);
    }
    if (stage5LogContext !== null) {
      const context = stage5LogContext as Stage5LogContext;
      const stage5Gates = context.gates;
      const stage5Duration = context.durationMs;
      const stage5NotesList = context.notes;
      const stageLog: StageLog = {
        stage: mapStageCode('stage5_validation'),
        stageId: 'stage5_validation',
        promptVersion: PROMPT_VERSION_STAGE5,
        gates: stage5Gates,
        durationMs: stage5Duration,
        modelCalls: 0,
        notes: stage5NotesList && stage5NotesList.length > 0 ? stage5NotesList : undefined,
        timestamp: new Date().toISOString(),
      };
      nextMeta = upsertStageLog(nextMeta, stageLog);
    }
    workingDoc = updateWorkflowDocument(workingDoc, { meta: nextMeta });
    await persistWorkflow(workingDoc);
  } catch (stageLogError) {
    logger.warn({ err: stageLogError }, 'Stage4/Stage5 日志记录失败');
  }

  if (stage5Error) {
    throw stage5Error;
  }

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
