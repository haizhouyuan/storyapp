// Story Creation Workflow System - TypeScript Types
// 故事创作工作流系统 - 类型定义

import { ObjectId } from 'mongodb';

// ========== 基础类型 ==========

export type WorkflowStage = 
  | 'project_init'          // Stage 0: 立项
  | 'center_miracle'        // Stage 1: 核心奇迹  
  | 'chekhov_list'         // Stage 2: 道具清单
  | 'structure_build'      // Stage 3: 结构搭建
  | 'clue_matrix'          // Stage 4: 线索矩阵
  | 'misdirection_design'  // Stage 5: 误导设计
  | 'scene_cards'          // Stage 6: 场景卡片
  | 'recap_chapter'        // Stage 7: 复盘章
  | 'pressure_test'        // Stage 8: 压力测试
  | 'language_polish'      // Stage 9: 语言打磨
  | 'publish_postmortem';  // Stage 10: 发布复盘

export type GenreTag = 
  | 'honkaku'      // 本格
  | 'gothic'       // 哥特  
  | 'youth'        // 少年视角
  | 'locked_room'  // 密室
  | 'alibi'        // 不在场证明
  | 'impossible'   // 不可能犯罪
  | 'serial'       // 系列作品
  | 'standalone';  // 独立作品

export type SenseType = 
  | 'sight'     // 视觉
  | 'sound'     // 听觉  
  | 'touch'     // 触觉
  | 'smell'     // 嗅觉
  | 'taste'     // 味觉
  | 'intellect';// 推理

export type MiracleNodeType = 
  | 'natural'        // 自然力
  | 'device'         // 人工装置
  | 'psychological'; // 心理学

export type MisdirectionType = 
  | 'naming'    // 命名误导
  | 'spatial'   // 空间误导  
  | 'material'  // 材质误导
  | 'temporal'  // 时间误导
  | 'character';// 人设误导

export type UserRole = 
  | 'author'        // 主笔
  | 'logic_keeper'  // 逻辑官
  | 'clue_master'   // 线索官  
  | 'editor'        // 编辑
  | 'sensitivity_reader'; // 敏感性读者

// ========== 核心实体类型 ==========

export interface Project {
  _id?: ObjectId;
  id: string;
  title: string;
  series?: string;
  genreTags: GenreTag[];
  themes: string[]; // 主题意象，如 ["风", "光", "盐"]
  targetWords: number;
  dod: string[]; // Definition of Done
  status: WorkflowStage;
  ownerId: string;
  collaborators: ProjectCollaborator[];
  createdAt: Date;
  updatedAt: Date;
  
  // 工作流进度
  stageProgress: Record<WorkflowStage, StageProgress>;
  
  // 元数据
  metadata: {
    logline?: string; // 一句话悬念
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
  artifacts: string[]; // 产出物ID列表
  notes?: string;
}

// ========== 中心奇迹 (Center Miracle) ==========

export interface Miracle {
  _id?: ObjectId;
  id: string;
  projectId: string;
  logline: string; // 一句话悬念
  chain: MiracleNode[];
  tolerances: string; // 容差说明
  replicationNote: string; // 复现实验说明
  weaknesses: string[]; // 弱点列表
  createdAt: Date;
  updatedAt: Date;
}

export interface MiracleNode {
  id: string;
  node: string; // 节点名称，如 "涨潮"、"水车"
  type: MiracleNodeType;
  description?: string;
  parameters?: Record<string, any>; // 参数配置
  connections: string[]; // 连接的下游节点ID
}

// ========== 实体管理 ==========

export interface Character {
  _id?: ObjectId;
  id: string;
  projectId: string;
  name: string;
  role: string; // 如 "侦探"、"策划者"、"受害者"
  pov?: boolean; // 是否为视点人物
  motivation: string;
  secrets: string[];
  timeline: CharacterTimelineEvent[];
  relationships: CharacterRelationship[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CharacterTimelineEvent {
  time: string; // HH:MM 格式
  event: string;
  location: string;
  witnesses?: string[];
  evidence?: string[];
}

export interface CharacterRelationship {
  targetId: string;
  type: string; // 如 "怀疑"、"保护"、"欺骗"
  strength: number; // 1-10
}

export interface Prop {
  _id?: ObjectId;
  id: string;
  projectId: string;
  name: string;
  description: string;
  chekhov: {
    introduce: string; // 引入位置
    fire: string;      // 起效位置  
    recover: string;   // 回收位置
  };
  properties: Record<string, any>; // 物理属性
  createdAt: Date;
  updatedAt: Date;
}

export interface Space {
  _id?: ObjectId;
  id: string;
  projectId: string;
  name: string;
  description: string;
  layers: string[]; // 如 ["钟室", "暗道口"]
  connections: SpaceConnection[];
  coordinates?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface SpaceConnection {
  targetId: string;
  type: string; // 如 "门"、"窗"、"暗道"
  travelTime: number; // 分钟
  accessibility: string; // 如 "公开"、"隐藏"、"锁定"
}

// ========== 线索矩阵 ==========

export interface Clue {
  _id?: ObjectId;
  id: string;
  projectId: string;
  desc: string;
  first: string; // 首次出现章节
  surface: string; // 表层含义
  truth: string; // 真相功能
  recover: string; // 回收位置
  senses: SenseType[];
  reliability: number; // 可靠度 1-10
  importance: number; // 重要性 1-10
  relatedClues: string[]; // 关联线索ID
  createdAt: Date;
  updatedAt: Date;
}

// ========== 时间线 ==========

export interface TimelineEvent {
  _id?: ObjectId;
  id: string;
  projectId: string;
  time: string; // HH:MM 格式
  event: string;
  location: string;
  characters: string[]; // 参与角色ID
  evidence: string[]; // 相关证据ID
  visibility: 'public' | 'hidden' | 'deducible'; // 读者可见性
  causedBy?: string; // 触发事件ID
  leads: string[]; // 导致的后续事件ID
  createdAt: Date;
  updatedAt: Date;
}

// ========== 误导设计 ==========

export interface Misdirection {
  _id?: ObjectId;
  id: string;
  projectId: string;
  type: MisdirectionType;
  description: string;
  targetClue: string; // 目标线索ID
  falseInterpretation: string; // 错误解释
  counterEvidence: string[]; // 反证场景
  strength: number; // 误导强度 1-10
  resolved: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ========== 场景卡片 ==========

export interface Scene {
  _id?: ObjectId;
  id: string;
  projectId: string;
  chapterNumber: number;
  sceneNumber: number;
  title: string;
  
  // 场景要素
  purpose: string; // 目的：推进线/塑造/设伏
  conflict: string; // 冲突与阻力
  cluesRevealed: string[]; // 抛出的线索ID
  cluesValidated: string[]; // 验证的线索ID
  
  // 感官要素
  senseElements: {
    sight?: string;
    sound?: string;
    touch?: string;
    smell?: string;
    taste?: string;
  };
  
  // 结构要素
  hook: string; // 出口钩子
  pacing: number; // 节奏评分 1-10
  tension: number; // 紧张度 1-10
  
  // 技术细节
  pov: string; // 视点人物ID
  wordCount?: number;
  notes?: string;
  
  createdAt: Date;
  updatedAt: Date;
}

// ========== 校验和测试 ==========

export interface ValidationRule {
  id: string;
  name: string;
  description: string;
  category: string;
  severity: 'error' | 'warning' | 'info';
  autocheck: boolean;
}

export interface ValidationResult {
  ruleId: string;
  projectId: string;
  passed: boolean;
  score?: number; // 0-100
  violations: ValidationViolation[];
  runAt: Date;
}

export interface ValidationViolation {
  elementId: string;
  elementType: string;
  description: string;
  severity: 'error' | 'warning' | 'info';
  suggestion?: string;
}

export interface PressureTest {
  _id?: ObjectId;
  id: string;
  projectId: string;
  type: 'character_swap' | 'simplified_path' | 'fairness_check';
  description: string;
  status: 'pending' | 'passed' | 'failed';
  score: number; // 0-100
  results: PressureTestResult[];
  createdAt: Date;
  updatedAt: Date;
}

export interface PressureTestResult {
  scenario: string;
  outcome: string;
  issues: string[];
  suggestions: string[];
}

// ========== 仪表盘和指标 ==========

export interface ProjectMetrics {
  projectId: string;
  generatedAt: Date;
  
  // 核心KPI
  fairnessScore: number; // 公平性通过率 0-100
  senseIndexScore: number; // 线索可感指数 0-100  
  misdirectionStrength: number; // 误导强度 0-100
  chekhovRecoveryRate: number; // Chekhov回收率 0-100
  
  // 详细指标
  totalClues: number;
  sensoryClues: number;
  totalProps: number;
  recoveredProps: number;
  totalMisdirections: number;
  resolvedMisdirections: number;
  
  // 质量评估
  logicConsistency: number; // 逻辑一致性 0-100
  readabilityIndex: number; // 可读性指数 0-100
  structuralIntegrity: number; // 结构完整性 0-100
  
  // 节奏分析
  pacingWave: number[]; // 每章节奏评分
  tensionCurve: number[]; // 紧张度曲线
  informationDensity: number[]; // 信息密度分布
}

export interface Dashboard {
  projectId: string;
  overview: {
    stage: WorkflowStage;
    completion: number; // 总体完成度 0-100
    health: 'excellent' | 'good' | 'warning' | 'critical';
    lastActivity: Date;
  };
  
  stageStatus: Record<WorkflowStage, {
    status: 'not_started' | 'in_progress' | 'review' | 'completed';
    completion: number;
    issues: number;
  }>;
  
  recentActivity: ActivityLog[];
  upcomingTasks: Task[];
  criticalIssues: ValidationViolation[];
}

export interface ActivityLog {
  id: string;
  userId: string;
  action: string;
  target: string;
  timestamp: Date;
  details?: Record<string, any>;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  assignee?: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  dueDate?: Date;
  stage: WorkflowStage;
}

// ========== API请求/响应类型 ==========

export interface CreateProjectRequest {
  title: string;
  series?: string;
  genreTags: GenreTag[];
  themes: string[];
  targetWords: number;
  targetAudience: string;
  estimatedTimeline: string;
}

export interface CreateProjectResponse {
  success: boolean;
  project: Project;
  message?: string;
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

export interface GenerateMiracleResponse {
  success: boolean;
  alternatives: {
    logline: string;
    chain: MiracleNode[];
    tolerances: string;
    replicationNote: string;
  }[];
  message?: string;
}

export interface RunValidationRequest {
  projectId: string;
  rules?: string[]; // 特定规则ID，不填则运行所有规则
}

export interface RunValidationResponse {
  success: boolean;
  results: ValidationResult[];
  summary: {
    totalRules: number;
    passed: number;
    warnings: number;
    errors: number;
    score: number;
  };
}

// ========== 工具类型 ==========

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  errors?: string[];
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface SearchQuery {
  q?: string;
  filters?: Record<string, any>;
  sort?: string;
  order?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

// ========== 常量定义 ==========

export const WORKFLOW_STAGES: Record<WorkflowStage, string> = {
  project_init: '立项',
  center_miracle: '核心奇迹',
  chekhov_list: '道具清单',
  structure_build: '结构搭建',
  clue_matrix: '线索矩阵',
  misdirection_design: '误导设计',
  scene_cards: '场景卡片',
  recap_chapter: '复盘章',
  pressure_test: '压力测试',
  language_polish: '语言打磨',
  publish_postmortem: '发布复盘'
};

export const DEFAULT_VALIDATION_RULES: ValidationRule[] = [
  {
    id: 'fairness_timeline',
    name: '公平线索时序',
    description: '所有结论的支持线索必须在揭示前出现',
    category: 'fairness',
    severity: 'error',
    autocheck: true
  },
  {
    id: 'chekhov_recovery',
    name: 'Chekhov回收',
    description: '所有引入的道具必须有相应的起效和回收',
    category: 'structure',
    severity: 'warning',
    autocheck: true
  },
  {
    id: 'spatial_consistency',
    name: '时空一致性',
    description: '角色移动路径必须在时空限制内',
    category: 'logic',
    severity: 'error',
    autocheck: true
  },
  {
    id: 'misdirection_strength',
    name: '误导强度检查',
    description: '误导占比不超过40%且有反证场景',
    category: 'balance',
    severity: 'warning',
    autocheck: true
  },
  {
    id: 'sensory_coverage',
    name: '感官覆盖度',
    description: '五感型线索占总线索60%以上',
    category: 'engagement',
    severity: 'info',
    autocheck: true
  }
];
