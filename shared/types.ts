// 前后端共享的TypeScript类型定义

// 故事相关类型
export interface Story {
  id: string;
  title: string;
  content: string;  // JSON字符串，包含完整故事路径
  created_at: string;
}

export interface StorySegment {
  text: string;
  choices: string[];
  isEnding: boolean;
}

// API请求和响应类型
export interface GenerateStoryRequest {
  topic: string;
  currentStory?: string;
  selectedChoice?: string;
  // 已完成的互动次数（已做出的选择次数）。用于引导后端控制节奏
  turnIndex?: number;
  // 本次故事的最大互动次数（5-10之间）
  maxChoices?: number;
  // 当为最后一次互动时，强制生成结局并不再返回choices
  forceEnding?: boolean;
}

export interface GenerateStoryResponse {
  storySegment: string;
  choices: string[];
  isEnding: boolean;
}

export interface SaveStoryRequest {
  title: string;
  content: string;
  created_at?: string;
}

export interface SaveStoryResponse {
  success: boolean;
  storyId: string;
  message: string;
}

export interface GetStoriesResponse {
  stories: Array<{
    id: string;
    title: string;
    created_at: string;
    preview: string;
  }>;
}

export interface GetStoryResponse {
  id: string;
  title: string;
  content: string;
  created_at: string;
}

// 前端状态管理类型
export interface StoryPath {
  segment: string;
  choice?: string;
  timestamp: number;
}

export interface StorySession {
  topic: string;
  path: StoryPath[];
  isComplete: boolean;
  startTime: number;
  // 故事在开始时确定的互动上限（5-10 次）
  maxChoices: number;
}

// 故事树节点类型 - 支持预生成完整故事树
export interface StoryTreeNode {
  id: string;  // 节点唯一标识
  segment: string;  // 故事片段内容(500+字)
  choices: string[];  // 选择选项(最多2个，叶子节点为空)
  children?: StoryTreeNode[];  // 子节点
  isEnding: boolean;  // 是否为结尾节点
  depth: number;  // 节点深度(0-3)
  path: string;  // 路径标识，如 "0-1-0" 表示第一次选0，第二次选1，第三次选0
}

// 完整故事树
export interface StoryTree {
  id: string;  // 故事树ID
  topic: string;  // 故事主题
  root: StoryTreeNode;  // 根节点
  created_at: string;
  totalPaths: number;  // 总路径数(固定为8)
  maxDepth: number;  // 最大深度(固定为3)
}

// 故事树生成请求
export interface GenerateFullStoryRequest {
  topic: string;
}

// 故事树生成响应
export interface GenerateFullStoryResponse {
  success: boolean;
  storyTree: StoryTree;
  message?: string;
}

// 故事树会话状态
export interface StoryTreeSession {
  topic: string;
  storyTree: StoryTree;
  currentPath: number[];  // 当前选择路径，如[0, 1, 0]
  currentNode: StoryTreeNode;  // 当前节点
  isComplete: boolean;
  startTime: number;
}

// 错误类型
export interface ApiError {
  message: string;
  code?: string;
  status: number;
}
