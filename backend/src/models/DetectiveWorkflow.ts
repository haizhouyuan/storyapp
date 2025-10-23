
import { ObjectId } from 'mongodb';
import type {
  DetectiveOutline,
  DetectiveStoryDraft,
  ValidationReport,
  WorkflowStageState,
  DetectiveWorkflowRecord,
  WorkflowRevision,
  WorkflowRevisionType,
  WorkflowRevisionMeta,
  WorkflowStageStatus,
  DetectiveWorkflowMeta,
} from '@storyapp/shared';

export interface DetectiveWorkflowDocument {
  _id?: ObjectId;
  topic: string;
  locale?: string;
  outline?: DetectiveOutline;
  storyDraft?: DetectiveStoryDraft;
  review?: Record<string, unknown>;
  validation?: ValidationReport;
  stageStates: WorkflowStageState[];
  status: WorkflowStageStatus;
  currentRevisionId?: string;
  history: WorkflowRevision[];
  terminatedAt?: Date;
  terminationReason?: string;
  meta?: DetectiveWorkflowMeta;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateWorkflowDocumentParams {
  topic: string;
  locale?: string;
  stageStates?: WorkflowStageState[];
  outline?: DetectiveOutline;
  storyDraft?: DetectiveStoryDraft;
  review?: Record<string, unknown>;
  validation?: ValidationReport;
  meta?: DetectiveWorkflowMeta;
}

export function createWorkflowDocument(params: CreateWorkflowDocumentParams): DetectiveWorkflowDocument {
  const now = new Date();
  const stageStates = params.stageStates ?? [];
  const status = deriveWorkflowStatus(stageStates);
  return {
    topic: params.topic.trim(),
    locale: params.locale,
    outline: params.outline,
    storyDraft: params.storyDraft,
    review: params.review,
    validation: params.validation,
    stageStates,
    status,
    history: [],
    meta: params.meta,
    createdAt: now,
    updatedAt: now,
  };
}

export function updateWorkflowDocument(
  document: DetectiveWorkflowDocument,
  updates: Partial<Omit<DetectiveWorkflowDocument, '_id' | 'createdAt' | 'history'>> & { history?: WorkflowRevision[] },
): DetectiveWorkflowDocument {
  const stageStates = updates.stageStates ?? document.stageStates;
  return {
    ...document,
    ...updates,
    stageStates,
    status: deriveWorkflowStatus(stageStates),
    history: updates.history ?? document.history,
    updatedAt: new Date(),
  };
}

export function workflowDocumentToRecord(doc: DetectiveWorkflowDocument): DetectiveWorkflowRecord {
  return {
    _id: doc._id?.toHexString(),
    topic: doc.topic,
    locale: doc.locale,
    outline: doc.outline,
    storyDraft: doc.storyDraft,
    review: doc.review,
    validation: doc.validation,
    stageStates: doc.stageStates ?? [],
    status: doc.status,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
    currentRevisionId: doc.currentRevisionId,
    history: doc.history,
    terminatedAt: doc.terminatedAt?.toISOString(),
    terminationReason: doc.terminationReason,
    meta: doc.meta,
  };
}

export function validateCreateWorkflowPayload(topic?: string): string[] {
  const errors: string[] = [];
  if (!topic || topic.trim().length === 0) {
    errors.push('topic_required');
  }
  if (topic && topic.trim().length > 120) {
    errors.push('topic_too_long');
  }
  return errors;
}

export function createWorkflowRevision(params: {
  type: WorkflowRevisionType;
  outline?: DetectiveOutline;
  storyDraft?: DetectiveStoryDraft;
  review?: Record<string, unknown>;
  validation?: ValidationReport;
  stageStates?: WorkflowStageState[];
  createdBy?: string;
  meta?: WorkflowRevisionMeta;
}): WorkflowRevision {
  return {
    revisionId: new ObjectId().toHexString(),
    type: params.type,
    createdAt: new Date().toISOString(),
    createdBy: params.createdBy,
    outline: params.outline,
    storyDraft: params.storyDraft,
    review: params.review,
    validation: params.validation,
    stageStates: params.stageStates,
    meta: params.meta,
  };
}

export function appendRevision(document: DetectiveWorkflowDocument, revision: WorkflowRevision): DetectiveWorkflowDocument {
  return {
    ...document,
    history: [...document.history, revision],
    currentRevisionId: revision.revisionId,
    updatedAt: new Date(),
  };
}

export function deriveWorkflowStatus(stageStates: WorkflowStageState[]): WorkflowStageStatus {
  if (!stageStates || stageStates.length === 0) {
    return 'pending';
  }
  if (stageStates.some((state) => state.status === 'failed')) {
    return 'failed';
  }
  if (stageStates.every((state) => state.status === 'completed')) {
    return 'completed';
  }
  if (stageStates.some((state) => state.status === 'running')) {
    return 'running';
  }
  return 'pending';
}
