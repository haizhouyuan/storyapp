// Detective Workflow Shared Types
// 侦探故事工作流 - 共享类型定义

import type { StoryTtsSegment } from './story';

export type ValidationRuleStatus = 'pass' | 'warn' | 'fail';

export interface DetectiveCharacter {
  name: string;
  role: 'detective' | 'suspect' | 'victim' | 'witness' | string;
  motive?: string;
  secrets?: string[];
  motiveKeywords?: string[];
  motiveScenes?: string[];
}

export interface DetectiveActBeat {
  beat: number;
  summary: string;
  cluesRevealed?: string[];
  redHerring?: string;
}

export interface DetectiveAct {
  act: number;
  focus: string;
  beats: DetectiveActBeat[];
}

export interface DetectiveClue {
  clue: string;
  surfaceMeaning?: string;
  realMeaning?: string;
  appearsAtAct?: number;
  mustForeshadow?: boolean;
  explicitForeshadowChapters?: string[];
  isRedHerring?: boolean;
}

export interface DetectiveTimelineEvent {
  time: string; // e.g. "Day1 19:40"
  event: string;
  participants?: string[];
}

export interface DetectiveChapterAnchor {
  chapter: string; // "Chapter 1"
  dayCode?: string; // "Day1"
  time?: string; // "10:00"
  label?: string;
  summary?: string;
}

export interface DetectiveOutline {
  centralTrick?: {
    summary?: string;
    mechanism?: string;
    fairnessNotes?: string[];
  };
  caseSetup?: {
    victim?: string;
    crimeScene?: string;
    initialMystery?: string;
  };
  characters?: DetectiveCharacter[];
  acts?: DetectiveAct[];
  clueMatrix?: DetectiveClue[];
  timeline?: DetectiveTimelineEvent[];
  chapterAnchors?: DetectiveChapterAnchor[];
  themes?: string[];
  logicChecklist?: string[];
}

export interface DetectiveChapter {
  title: string;
  summary: string;
  wordCount?: number;
  content: string;
  cluesEmbedded?: string[];
  redHerringsEmbedded?: string[];
}

export type DetectiveRevisionNoteCategory = 'model' | 'system' | 'validation' | 'manual';

export interface DetectiveRevisionNote {
  message: string;
  category: DetectiveRevisionNoteCategory;
  stage?: string;
  source?: string;
  relatedRuleId?: string;
  chapter?: string;
  createdAt?: string;
  id?: string;
}

export interface DetectiveStoryAudioAsset {
  storyId: string;
  workflowId?: string;
  generatedAt: string;
  status: 'ready' | 'error';
  totalDuration?: number;
  segments: StoryTtsSegment[];
  voiceId?: string;
  speed?: number;
  provider?: string;
  sessionId?: string;
  metadata?: Record<string, unknown>;
}

export interface MotivePatchCandidate {
  suspect: string;
  keyword: string;
  chapterIndex: number;
  suggestedSentence: string;
  status: 'pending' | 'applied';
}

export interface DetectiveStoryDraft {
  chapters: DetectiveChapter[];
  overallWordCount?: number;
  narrativeStyle?: string;
  continuityNotes?: string[];
  revisionNotes?: DetectiveRevisionNote[];
  ttsAssets?: DetectiveStoryAudioAsset[];
  motivePatchCandidates?: MotivePatchCandidate[];
}

export interface MysteryContractClause {
  id: string;
  title: string;
  description: string;
  category?: 'fair_play' | 'narrative' | 'pov' | 'spoiler_control' | string;
}

export interface MysteryContract {
  id: string;
  title: string;
  detectiveCode?: string;
  summary: string;
  clauses: MysteryContractClause[];
  observables?: string[];
  enforcementNotes?: string[];
  references?: string[];
  version?: string;
}

export interface MysteryPatternTrick {
  id: string;
  label: string;
  description: string;
  requiredObservables?: string[];
  verificationHints?: string[];
}

export interface MysteryPatternProfile {
  id: string;
  label: string;
  synopsis: string;
  trickSet: MysteryPatternTrick[];
  structuralBeats?: string[];
  constraints?: string[];
  detectorHints?: string[];
  compatibleMechanisms?: string[];
  version?: string;
}

export type ClueType = 'true' | 'red_herring' | 'character';

export interface ClueAnchor {
  chapter: number;
  paragraph: number;
  startOffset: number;
  endOffset: number;
}

export interface ClueNode {
  id: string;
  kind: 'clue' | 'fact' | 'inference' | 'denouement';
  text: string;
  chapterHint?: number;
  visibleBeforeDenouement: boolean;
  mmo?: Array<'means' | 'motive' | 'opportunity'>;
  type?: ClueType;
  sourceRef?: string;
  anchors?: ClueAnchor[];
  anchorStatus?: 'pending' | 'resolved' | 'stale';
}

export interface ClueEdge {
  from: string;
  to: string;
  rationale?: string;
}

export interface ClueGraph {
  nodes: ClueNode[];
  edges: ClueEdge[];
}

export interface FairPlayReport {
  unsupportedInferences: string[];
  orphanClues: string[];
  economyScore: number;
}

export interface BetaReaderInsight {
  topSuspect: string;
  confidence: number;
  evidence: string[];
  summary: string;
  competingSuspects?: string[];
  openQuestions?: string[];
}

export interface HypothesisCandidate {
  suspect: string;
  confidence: number;
  evidence: string[];
  rationale?: string;
}

export interface HypothesisEvaluation {
  candidates: HypothesisCandidate[];
  notes?: string[];
  recommendation?: string;
}

export interface DenouementScript {
  recapBullets: string[];
  eliminationOrder: Array<{ suspect: string; reason: string }>;
  finalContradiction: string;
  lastPush: 'experiment' | 'psychology' | 'mechanism';
}

export interface StylePack {
  id: string;
  role: 'detective' | 'sidekick' | 'inspector' | 'suspect' | 'narrator';
  lexicon: string[];
  fillers: string[];
  punctuation: string[];
  banPairs?: Array<[string, string]>;
}

export interface StyleAdjustmentReport {
  notes: string[];
  adjustments: number;
}

export type GateVerdict = 'pass' | 'warn' | 'block';

export interface GateLog {
  name: string;
  verdict: GateVerdict;
  reason?: string;
  metrics?: Record<string, number | string>;
  nextAction?: 'none' | 'auto_patch' | 'notify';
  durationMs?: number;
  tokens?: {
    input?: number;
    output?: number;
  };
  timestamp?: string;
}

export type WorkflowStageCode = 'S0' | 'S1' | 'S2' | 'S3' | 'S4' | 'S5';

export interface StageLog {
  stage: WorkflowStageCode;
  stageId?: string;
  promptVersion?: string;
  gates: GateLog[];
  durationMs?: number;
  modelCalls?: number;
  notes?: string[];
  meta?: Record<string, unknown>;
  timestamp?: string;
}

export interface WorkflowTelemetry {
  stages: StageLog[];
  promptVersions?: Record<string, string>;
}

export interface Stage3AnalysisSnapshot {
  betaReader?: BetaReaderInsight;
  hypotheses?: HypothesisEvaluation;
}

export interface LightHypothesisSnapshot {
  chapterIndex: number;
  rank: Array<{ name: string; score: number; evidenceIds: string[] }>;
  generatedAt: string;
}

export interface ClueGraphSnapshot {
  generatedAt: string;
  graph: ClueGraph;
  report: FairPlayReport;
  version?: string;
}

export interface DraftAnchorsSummary {
  chapterCount: number;
  mappedClues: number;
  unresolvedClues: string[];
  mappedFacts: number;
  mappedInferences: number;
  unresolvedInferences: string[];
  updatedAt: string;
}

export type DetectiveWorkflowMeta = {
  mechanismPreset?: unknown;
  clueGraphSnapshot?: ClueGraphSnapshot;
  telemetry?: WorkflowTelemetry;
  promptVersions?: Record<string, string>;
  stageResults?: {
    stage3?: Stage3AnalysisSnapshot;
  };
  mysteryContract?: MysteryContract;
  mysteryPattern?: MysteryPatternProfile;
  anchorsSummary?: DraftAnchorsSummary;
  lightHypotheses?: LightHypothesisSnapshot[];
} & Record<string, unknown>;

export interface ValidationRuleDetail {
  message: string;
  meta?: Record<string, unknown>;
}

export interface ValidationRuleResult {
  ruleId: string;
  status: ValidationRuleStatus;
  details?: ValidationRuleDetail[];
}

export interface ValidationReport {
  generatedAt: string;
  outlineId?: string;
  storyId?: string;
  results: ValidationRuleResult[];
  summary?: {
    pass: number;
    warn: number;
    fail: number;
  };
  metrics?: Record<string, number>;
}

export type WorkflowStageStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface WorkflowStageState {
  stage: string;
  status: WorkflowStageStatus;
  startedAt?: string;
  finishedAt?: string;
  errorMessage?: string;
}

export type WorkflowStageCommandStatus = 'pending' | 'running' | 'success' | 'error';

export interface WorkflowStageCommand {
  id: string;
  label: string;
  command?: string;
  status: WorkflowStageCommandStatus;
  startedAt?: string;
  finishedAt?: string;
  resultSummary?: string;
  errorMessage?: string;
  meta?: Record<string, unknown>;
}

export type WorkflowStageLogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface WorkflowStageLogEntry {
  id: string;
  timestamp: string;
  level: WorkflowStageLogLevel;
  message: string;
  commandId?: string;
  meta?: Record<string, unknown>;
}

export type WorkflowStageArtifactType = 'text' | 'json' | 'audio' | 'file' | 'image';

export interface WorkflowStageArtifact {
  id: string;
  label: string;
  type: WorkflowStageArtifactType;
  createdAt: string;
  commandId?: string;
  url?: string;
  preview?: string;
  meta?: Record<string, unknown>;
}

export interface WorkflowStageExecution {
  workflowId: string;
  stageId: string;
  label: string;
  status: WorkflowStageStatus;
  startedAt?: string;
  finishedAt?: string;
  currentCommandId?: string;
  commands: WorkflowStageCommand[];
  logs: WorkflowStageLogEntry[];
  artifacts: WorkflowStageArtifact[];
  updatedAt: string;
}

export interface WorkflowStageExecutionSummary {
  stages: WorkflowStageExecution[];
  generatedAt: string;
}

export type WorkflowRevisionType = 'initial' | 'retry' | 'rollback';

export interface WorkflowRevisionMeta {
  note?: string;
  userId?: string;
}

export interface WorkflowRevisionSnapshot {
  outline?: DetectiveOutline;
  storyDraft?: DetectiveStoryDraft;
  review?: Record<string, unknown>;
  validation?: ValidationReport;
  stageStates?: WorkflowStageState[];
}

export interface WorkflowRevision extends WorkflowRevisionSnapshot {
  revisionId: string;
  type: WorkflowRevisionType;
  createdAt: string;
  createdBy?: string;
  meta?: WorkflowRevisionMeta;
}

export interface DetectiveWorkflowRecord {
  _id?: string;
  topic: string;
  locale?: string;
  outline?: DetectiveOutline;
  storyDraft?: DetectiveStoryDraft;
  review?: Record<string, unknown>;
  validation?: ValidationReport;
  stageStates: WorkflowStageState[];
  status: WorkflowStageStatus;
  createdAt: string;
  updatedAt: string;
  currentRevisionId?: string;
  history?: WorkflowRevision[];
  terminatedAt?: string;
  terminationReason?: string;
  meta?: Record<string, unknown>;
}

export interface CreateWorkflowRequest {
  topic: string;
  locale?: string;
  options?: Record<string, unknown>;
}

export interface CreateWorkflowResponse {
  workflowId: string;
  status: WorkflowStageStatus;
  outline?: DetectiveOutline;
  storyDraft?: DetectiveStoryDraft;
  review?: Record<string, unknown>;
  validation?: ValidationReport;
  history?: WorkflowRevision[];
}

export interface GetWorkflowResponse {
  workflow?: DetectiveWorkflowRecord;
}

export interface WorkflowListItem {
  _id: string;
  topic: string;
  status: WorkflowStageStatus;
  createdAt: string;
  updatedAt: string;
  latestRevisionType?: WorkflowRevisionType;
  latestRevisionAt?: string;
}

export interface ListWorkflowsResponse {
  items: WorkflowListItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export interface RetryWorkflowResponse extends CreateWorkflowResponse {}

export interface RollbackWorkflowRequest {
  revisionId: string;
  note?: string;
}

export interface TerminateWorkflowRequest {
  reason?: string;
}

export type WorkflowEventCategory = 'stage' | 'info' | 'tts';

export interface WorkflowEvent {
  eventId: string;
  workflowId: string;
  category: WorkflowEventCategory;
  stageId?: string;
  status?: WorkflowStageStatus | 'success' | 'error';
  message: string;
  timestamp: string;
  meta?: Record<string, unknown>;
}
