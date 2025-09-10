// 后端专用类型定义

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
  turnIndex?: number;
  maxChoices?: number;
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
  maxChoices: number;
}

// 错误类型
export interface ApiError {
  message: string;
  code?: string;
  status: number;
}
