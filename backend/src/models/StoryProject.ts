import { ObjectId } from 'mongodb';
import type { StoryProject, StoryBlueprint } from '@storyapp/shared';

export interface StoryProjectDocument {
  _id?: ObjectId;
  projectId: string; // uuid/ulid
  title: string;
  locale?: string;
  protagonist?: { name: string; age?: number };
  constraints?: StoryProject['constraints'];
  blueprint_id?: string; // latest blueprintId
  draft_id?: string;
  status?: StoryProject['status'];
  createdAt: Date;
  updatedAt: Date;
}

export interface StoryBlueprintDocument {
  _id?: ObjectId;
  blueprintId: string; // uuid/ulid
  projectId: string;   // uuid/ulid
  outline?: any;       // DetectiveOutline (当前阶段直接存放)
  blueprint?: StoryBlueprint; // 预留：未来映射到统一Blueprint
  createdAt: Date;
  updatedAt: Date;
}

export function projectDocToRecord(doc: StoryProjectDocument): StoryProject {
  return {
    project_id: doc.projectId,
    title: doc.title,
    locale: doc.locale,
    protagonist: doc.protagonist,
    constraints: doc.constraints,
    blueprint_id: doc.blueprint_id,
    draft_id: doc.draft_id,
    status: doc.status ?? 'INIT',
  };
}
