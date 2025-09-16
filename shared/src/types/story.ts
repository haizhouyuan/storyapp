// StoryApp - Shared Types for Children's Interactive Stories
// 儿童互动故事应用 - 共享类型定义

export interface Story {
  _id?: string;
  title: string;
  content: string; // JSON string containing storySegment and choices
  created_at: Date;
  updated_at?: Date;
  sessionId?: string;
  metadata?: StoryMetadata;
}

export interface StoryMetadata {
  theme?: string;
  ageGroup?: string;
  sessionId?: string;
  topic?: string;
  maxChoices?: number;
  difficulty?: 'easy' | 'medium' | 'hard';
  tags?: string[];
}

export interface StoryContent {
  storySegment: string;
  choices: string[];
  isEnding?: boolean;
  metadata?: StoryMetadata;
}

export interface StoryChoice {
  id: string;
  text: string;
  nextSegmentId?: string;
  isEnding?: boolean;
}

export interface StorySession {
  sessionId: string;
  userId?: string;
  currentStoryId?: string;
  history: StoryChoice[];
  createdAt: Date;
  lastAccessedAt: Date;
}

export interface GenerateStoryRequest {
  topic: string;
  maxChoices?: number;
  sessionId?: string;
  previousChoice?: string;
  context?: string;
  ageGroup?: string;
}

export interface GenerateStoryResponse {
  success: boolean;
  storySegment?: string;
  choices?: string[];
  isEnding?: boolean;
  error?: string;
  sessionId?: string;
}

export interface SaveStoryRequest {
  title: string;
  content: string;
  metadata?: StoryMetadata;
}

export interface SaveStoryResponse {
  success: boolean;
  storyId?: string;
  error?: string;
}

export interface GetStoriesResponse {
  success: boolean;
  stories?: Story[];
  error?: string;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}