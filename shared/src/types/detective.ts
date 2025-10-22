// Detective Workflow Shared Types
// 侦探故事工作流 - 共享类型定义

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

export interface DetectiveStoryDraft {
  chapters: DetectiveChapter[];
  overallWordCount?: number;
  narrativeStyle?: string;
  continuityNotes?: string[];
  revisionNotes?: string[];
}

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
