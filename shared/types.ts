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

// 错误类型
export interface ApiError {
  message: string;
  code?: string;
  status: number;
}
