import { z } from 'zod';

// ========== 基础枚举类型 Schemas ==========

export const WorkflowStageSchema = z.enum([
  'project_init',
  'center_miracle',
  'chekhov_list',
  'structure_build',
  'clue_matrix',
  'misdirection_design',
  'scene_cards',
  'recap_chapter',
  'pressure_test',
  'language_polish',
  'publish_postmortem'
]);

export const GenreTagSchema = z.enum([
  'honkaku',
  'gothic',
  'youth',
  'locked_room',
  'alibi',
  'impossible',
  'serial',
  'standalone'
]);

export const SenseTypeSchema = z.enum([
  'sight',
  'sound',
  'touch',
  'smell',
  'taste',
  'intellect'
]);

export const MiracleNodeTypeSchema = z.enum([
  'natural',
  'device',
  'psychological'
]);

export const MisdirectionTypeSchema = z.enum([
  'naming',
  'spatial',
  'material',
  'temporal',
  'character'
]);

export const UserRoleSchema = z.enum([
  'author',
  'logic_keeper',
  'clue_master',
  'editor',
  'sensitivity_reader'
]);

// ========== 核心实体 Schemas ==========

export const ObjectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid ObjectId format').optional();

export const StageProgressSchema = z.object({
  status: z.enum(['not_started', 'in_progress', 'review', 'completed']),
  startedAt: z.date().optional(),
  completedAt: z.date().optional(),
  gatesPassed: z.boolean(),
  artifacts: z.array(z.string()),
  notes: z.string().optional()
});

export const ProjectCollaboratorSchema = z.object({
  userId: z.string(),
  role: UserRoleSchema,
  permissions: z.array(z.string()),
  joinedAt: z.date()
});

export const ProjectSchema = z.object({
  _id: ObjectIdSchema,
  id: z.string(),
  title: z.string().min(1, 'Title is required').max(200, 'Title too long'),
  series: z.string().max(100).optional(),
  genreTags: z.array(GenreTagSchema).min(1, 'At least one genre tag required'),
  themes: z.array(z.string()).max(10, 'Too many themes'),
  targetWords: z.number().int().min(1000, 'Minimum 1000 words').max(500000, 'Maximum 500k words'),
  dod: z.array(z.string()),
  status: WorkflowStageSchema,
  ownerId: z.string(),
  collaborators: z.array(ProjectCollaboratorSchema),
  createdAt: z.date(),
  updatedAt: z.date(),
  stageProgress: z.record(WorkflowStageSchema, StageProgressSchema),
  metadata: z.object({
    logline: z.string().max(500).optional(),
    targetAudience: z.string(),
    estimatedTimeline: z.string()
  })
});

export const MiracleNodeSchema = z.object({
  id: z.string(),
  node: z.string().min(1, 'Node name required'),
  type: MiracleNodeTypeSchema,
  description: z.string().optional(),
  parameters: z.record(z.string(), z.any()).optional(),
  connections: z.array(z.string())
});

export const MiracleSchema = z.object({
  _id: ObjectIdSchema,
  id: z.string(),
  projectId: z.string(),
  logline: z.string().min(10, 'Logline must be at least 10 characters').max(500, 'Logline too long'),
  chain: z.array(MiracleNodeSchema).min(1, 'At least one node required').max(10, 'Too many nodes'),
  tolerances: z.string(),
  replicationNote: z.string().min(20, 'Replication note must be detailed'),
  weaknesses: z.array(z.string()),
  createdAt: z.date(),
  updatedAt: z.date()
});

export const CharacterTimelineEventSchema = z.object({
  time: z.string().regex(/^\d{2}:\d{2}$/, 'Time must be in HH:MM format'),
  event: z.string().min(1, 'Event description required'),
  location: z.string().min(1, 'Location required'),
  witnesses: z.array(z.string()).optional(),
  evidence: z.array(z.string()).optional()
});

export const CharacterRelationshipSchema = z.object({
  targetId: z.string(),
  type: z.string(),
  strength: z.number().int().min(1, 'Minimum strength 1').max(10, 'Maximum strength 10')
});

export const CharacterSchema = z.object({
  _id: ObjectIdSchema,
  id: z.string(),
  projectId: z.string(),
  name: z.string().min(1, 'Character name required').max(100, 'Name too long'),
  role: z.string().min(1, 'Character role required'),
  pov: z.boolean().optional(),
  motivation: z.string().min(10, 'Motivation must be detailed'),
  secrets: z.array(z.string()),
  timeline: z.array(CharacterTimelineEventSchema),
  relationships: z.array(CharacterRelationshipSchema),
  createdAt: z.date(),
  updatedAt: z.date()
});

export const ClueSchema = z.object({
  _id: ObjectIdSchema,
  id: z.string(),
  projectId: z.string(),
  desc: z.string().min(10, 'Clue description must be detailed'),
  first: z.string().min(1, 'First appearance required'),
  surface: z.string().min(1, 'Surface meaning required'),
  truth: z.string().min(1, 'Truth function required'),
  recover: z.string().min(1, 'Recovery location required'),
  senses: z.array(SenseTypeSchema),
  reliability: z.number().int().min(1).max(10),
  importance: z.number().int().min(1).max(10),
  relatedClues: z.array(z.string()),
  supports: z.array(z.string()),
  createdAt: z.date(),
  updatedAt: z.date()
});

// ========== API Request/Response Schemas ==========

export const CreateProjectRequestSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200, 'Title too long'),
  series: z.string().max(100).optional(),
  genreTags: z.array(GenreTagSchema).min(1, 'At least one genre tag required'),
  themes: z.array(z.string()).max(10, 'Too many themes'),
  targetWords: z.number().int().min(1000, 'Minimum 1000 words').max(500000, 'Maximum 500k words'),
  targetAudience: z.string().min(1, 'Target audience required'),
  estimatedTimeline: z.string().min(1, 'Timeline required')
});

export const CreateProjectResponseSchema = z.object({
  success: z.boolean(),
  project: ProjectSchema,
  message: z.string().optional()
});

export const UpdateMiracleRequestSchema = z.object({
  logline: z.string().min(10, 'Logline must be at least 10 characters').max(500, 'Logline too long'),
  chain: z.array(z.object({
    node: z.string().min(1, 'Node name required'),
    type: MiracleNodeTypeSchema,
    description: z.string().optional(),
    parameters: z.record(z.string(), z.any()).optional(),
    connections: z.array(z.string())
  })).min(1, 'At least one node required').max(10, 'Too many nodes'),
  tolerances: z.string().min(1, 'Tolerances required'),
  replicationNote: z.string().min(20, 'Replication note must be detailed'),
  weaknesses: z.array(z.string()).optional()
});

export const GenerateMiracleRequestSchema = z.object({
  genreTags: z.array(GenreTagSchema).min(1, 'At least one genre tag required'),
  themes: z.array(z.string()),
  constraints: z.object({
    maxNodes: z.number().int().min(1).max(10).optional(),
    requiredTypes: z.array(MiracleNodeTypeSchema).optional()
  }).optional()
});

export const GenerateMiracleResponseSchema = z.object({
  success: z.boolean(),
  alternatives: z.array(z.object({
    logline: z.string(),
    chain: z.array(MiracleNodeSchema),
    tolerances: z.string(),
    replicationNote: z.string()
  })),
  message: z.string().optional()
});

export const ValidationResultSchema = z.object({
  ruleId: z.string(),
  projectId: z.string(),
  passed: z.boolean(),
  score: z.number().min(0).max(100).optional(),
  violations: z.array(z.object({
    elementId: z.string(),
    elementType: z.string(),
    description: z.string(),
    severity: z.enum(['error', 'warning', 'info']),
    suggestion: z.string().optional()
  })),
  runAt: z.date()
});

export const RunValidationRequestSchema = z.object({
  projectId: z.string(),
  rules: z.array(z.string()).optional()
});

export const RunValidationResponseSchema = z.object({
  success: z.boolean(),
  results: z.array(ValidationResultSchema),
  summary: z.object({
    totalRules: z.number().int(),
    passed: z.number().int(),
    warnings: z.number().int(),
    errors: z.number().int(),
    score: z.number().min(0).max(100)
  })
});

// ========== Common API Schemas ==========

export const ApiResponseSchema = <T extends z.ZodType>(dataSchema?: T) => z.object({
  success: z.boolean(),
  data: dataSchema ? dataSchema : z.any().optional(),
  message: z.string().optional(),
  errors: z.array(z.string()).optional()
});

export const PaginatedResponseSchema = <T extends z.ZodType>(itemSchema: T) => z.object({
  items: z.array(itemSchema),
  total: z.number().int(),
  page: z.number().int(),
  limit: z.number().int(),
  hasMore: z.boolean()
});

export const SearchQuerySchema = z.object({
  q: z.string().optional(),
  filters: z.record(z.string(), z.any()).optional(),
  sort: z.string().optional(),
  order: z.enum(['asc', 'desc']).optional(),
  page: z.number().int().min(1).optional(),
  limit: z.number().int().min(1).max(100).optional()
});

// Export inferred types for TypeScript compatibility
export type WorkflowStage = z.infer<typeof WorkflowStageSchema>;
export type GenreTag = z.infer<typeof GenreTagSchema>;
export type SenseType = z.infer<typeof SenseTypeSchema>;
export type Project = z.infer<typeof ProjectSchema>;
export type Miracle = z.infer<typeof MiracleSchema>;
export type Character = z.infer<typeof CharacterSchema>;
export type Clue = z.infer<typeof ClueSchema>;
export type CreateProjectRequest = z.infer<typeof CreateProjectRequestSchema>;
export type CreateProjectResponse = z.infer<typeof CreateProjectResponseSchema>;
export type UpdateMiracleRequest = z.infer<typeof UpdateMiracleRequestSchema>;
export type GenerateMiracleRequest = z.infer<typeof GenerateMiracleRequestSchema>;
export type GenerateMiracleResponse = z.infer<typeof GenerateMiracleResponseSchema>;
export type ValidationResult = z.infer<typeof ValidationResultSchema>;
export type RunValidationRequest = z.infer<typeof RunValidationRequestSchema>;
export type RunValidationResponse = z.infer<typeof RunValidationResponseSchema>;
export type SearchQuery = z.infer<typeof SearchQuerySchema>;