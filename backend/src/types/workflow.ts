// Temporary local copy of shared types for CI build compatibility
// This is a simplified version focusing on the interfaces actually used

export type ObjectId = string;

export type WorkflowStage = 
  | 'project_init'          
  | 'center_miracle'        
  | 'chekhov_list'         
  | 'structure_build'      
  | 'clue_matrix'          
  | 'misdirection_design'  
  | 'scene_cards'          
  | 'recap_chapter'        
  | 'pressure_test'        
  | 'language_polish'      
  | 'publish_postmortem';

export type GenreTag = 
  | 'honkaku'      
  | 'gothic'       
  | 'youth'        
  | 'locked_room'  
  | 'alibi'        
  | 'impossible'   
  | 'serial'       
  | 'standalone';

export type MiracleNodeType = 
  | 'natural'        
  | 'device'         
  | 'psychological';

export type UserRole = 
  | 'author'        
  | 'logic_keeper'  
  | 'clue_master'   
  | 'editor'        
  | 'sensitivity_reader';

export interface Project {
  _id?: ObjectId;
  id: string;
  title: string;
  series?: string;
  genreTags: GenreTag[];
  themes: string[];
  targetWords: number;
  dod: string[];
  status: WorkflowStage;
  ownerId: string;
  collaborators: ProjectCollaborator[];
  createdAt: Date;
  updatedAt: Date;
  stageProgress: Record<WorkflowStage, StageProgress>;
  metadata: {
    logline?: string;
    targetAudience: string;
    estimatedTimeline: string;
  };
}

export interface ProjectCollaborator {
  userId: string;
  role: UserRole;
  permissions: string[];
  joinedAt: Date;
}

export interface StageProgress {
  status: 'not_started' | 'in_progress' | 'review' | 'completed';
  startedAt?: Date;
  completedAt?: Date;
  gatesPassed: boolean;
  artifacts: string[];
  notes?: string;
}

export interface Miracle {
  _id?: ObjectId;
  id: string;
  projectId: string;
  logline: string;
  chain: MiracleNode[];
  tolerances: string;
  replicationNote: string;
  weaknesses: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface MiracleNode {
  id: string;
  node: string;
  type: MiracleNodeType;
  description?: string;
  parameters?: Record<string, any>;
  connections: string[];
}

export interface Character {
  _id?: ObjectId;
  id: string;
  projectId: string;
  name: string;
  role: string;
  pov?: boolean;
  motivation: string;
  secrets: string[];
  timeline: CharacterTimelineEvent[];
  relationships: CharacterRelationship[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CharacterTimelineEvent {
  time: string;
  event: string;
  location: string;
  witnesses?: string[];
  evidence?: string[];
}

export interface CharacterRelationship {
  targetId: string;
  type: string;
  strength: number;
}

export interface Clue {
  _id?: ObjectId;
  id: string;
  projectId: string;
  desc: string;
  first: string;
  surface: string;
  truth: string;
  recover: string;
  senses: string[];
  reliability: number;
  importance: number;
  relatedClues: string[];
  supports: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Prop {
  _id?: ObjectId;
  id: string;
  projectId: string;
  name: string;
  description: string;
  chekhov: {
    introduce: string;
    fire: string;
    recover: string;
  };
  properties: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface Scene {
  _id?: ObjectId;
  id: string;
  projectId: string;
  chapterNumber: number;
  sceneNumber: number;
  title: string;
  purpose: string;
  conflict: string;
  cluesRevealed: string[];
  cluesValidated: string[];
  senseElements: {
    sight?: string;
    sound?: string;
    touch?: string;
    smell?: string;
    taste?: string;
  };
  hook: string;
  pacing: number;
  tension: number;
  pov: string;
  wordCount?: number;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface TimelineEvent {
  _id?: ObjectId;
  id: string;
  projectId: string;
  time: string;
  event: string;
  location: string;
  characters: string[];
  evidence: string[];
  visibility: 'public' | 'hidden' | 'deducible';
  causedBy?: string;
  leads: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Misdirection {
  _id?: ObjectId;
  id: string;
  projectId: string;
  type: string;
  description: string;
  targetClue: string;
  falseInterpretation: string;
  counterEvidence: string[];
  strength: number;
  resolved: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateProjectRequest {
  title: string;
  series?: string;
  genreTags: GenreTag[];
  themes: string[];
  targetWords: number;
  targetAudience: string;
  estimatedTimeline: string;
}

export interface UpdateMiracleRequest {
  logline: string;
  chain: Omit<MiracleNode, 'id'>[];
  tolerances: string;
  replicationNote: string;
  weaknesses: string[];
}

export interface GenerateMiracleRequest {
  genreTags: GenreTag[];
  themes: string[];
  constraints?: {
    maxNodes?: number;
    requiredTypes?: MiracleNodeType[];
  };
}

export interface SearchQuery {
  q?: string;
  filters?: Record<string, any>;
  sort?: string;
  order?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export interface ProjectMetrics {
  projectId: string;
  generatedAt: Date;
  fairnessScore: number;
  senseIndexScore: number;
  misdirectionStrength: number;
  chekhovRecoveryRate: number;
  totalClues: number;
  sensoryClues: number;
  totalProps: number;
  recoveredProps: number;
  totalMisdirections: number;
  resolvedMisdirections: number;
  logicConsistency: number;
  readabilityIndex: number;
  structuralIntegrity: number;
  pacingWave: number[];
  tensionCurve: number[];
  informationDensity: number[];
}

export interface Dashboard {
  projectId: string;
  overview: {
    stage: WorkflowStage;
    completion: number;
    health: 'excellent' | 'good' | 'warning' | 'critical';
    lastActivity: Date;
  };
  stageStatus: Record<WorkflowStage, {
    status: 'not_started' | 'in_progress' | 'review' | 'completed';
    completion: number;
    issues: number;
  }>;
  recentActivity: any[];
  upcomingTasks: any[];
  criticalIssues: any[];
}

// Additional API Response Types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  errors?: string[];
}

export interface CreateProjectResponse {
  success: boolean;
  project: Project;
  message: string;
}

export interface GenerateMiracleResponse {
  success: boolean;
  alternatives: Miracle[];
  message: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

// Constants
export const WORKFLOW_STAGES: WorkflowStage[] = [
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
];

// Validation Types
export interface ValidationResult {
  ruleId: string;
  projectId: string;
  passed: boolean;
  violations: ValidationViolation[];
  score?: number;
  runAt: Date;
}

export interface ValidationViolation {
  elementId: string;
  elementType: string;
  description: string;
  severity: 'error' | 'warning' | 'info';
  suggestion?: string;
}

export interface ValidationRule {
  id: string;
  name: string;
  description: string;
  category: string;
  enabled: boolean;
  weight: number;
}

export const DEFAULT_VALIDATION_RULES: ValidationRule[] = [
  {
    id: 'fairness_timeline',
    name: '公平性时序验证',
    description: '验证线索在结论之前合理出现',
    category: 'fairness',
    enabled: true,
    weight: 1.0
  },
  {
    id: 'chekhov_recovery',
    name: '契诃夫道具验证',
    description: '验证道具的引入和使用',
    category: 'structure',
    enabled: true,
    weight: 0.8
  },
  {
    id: 'spatial_consistency',
    name: '空间一致性验证',
    description: '验证场景和空间描述的一致性',
    category: 'consistency',
    enabled: true,
    weight: 0.6
  },
  {
    id: 'misdirection_strength',
    name: '误导强度验证',
    description: '验证误导设计的有效性',
    category: 'misdirection',
    enabled: true,
    weight: 0.7
  },
  {
    id: 'sensory_coverage',
    name: '感官覆盖验证',
    description: '验证感官描述的完整性',
    category: 'immersion',
    enabled: true,
    weight: 0.5
  },
  {
    id: 'miracle_complexity',
    name: '奇迹复杂度验证',
    description: '验证中心奇迹的复杂度适中',
    category: 'structure',
    enabled: true,
    weight: 0.9
  },
  {
    id: 'scene_sensory_elements',
    name: '场景感官元素验证',
    description: '验证场景中的感官元素',
    category: 'immersion',
    enabled: true,
    weight: 0.4
  }
];

export type SenseType = 'sight' | 'sound' | 'touch' | 'smell' | 'taste';
