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

export interface TtsSynthesisRequest {
  text: string;
  voiceId?: string;
  speed?: number;
  pitch?: number;
  format?: 'mp3' | 'pcm';
  sessionId?: string;
  metadata?: Record<string, unknown>;
}

export interface TtsSynthesisResponse {
  success: boolean;
  audioUrl?: string;
  provider?: string;
  requestId?: string;
  expiresIn?: number;
  format?: 'mp3' | 'pcm';
  cached?: boolean;
  warnings?: string[];
  error?: string;
  code?: string;
}

export interface TtsVoiceOption {
  id: string;
  name: string;
  language: string;
  gender?: 'male' | 'female' | 'child';
  description?: string;
}

export interface TtsVoicesResponse {
  provider: string;
  voices: TtsVoiceOption[];
  speedRange: [number, number];
  pitchRange: [number, number];
  formats: Array<'mp3' | 'pcm'>;
  defaultVoice: string;
  metadata?: Record<string, unknown>;
}

export interface StoryTtsSegment {
  segmentIndex: number;
  audioUrl?: string;
  duration: number;
  startOffset: number;
  endOffset: number;
  chapterTitle?: string;
  cached?: boolean;
  error?: string;
}

export interface StoryTtsBatchResponse {
  success: boolean;
  status?: 'ready';
  storyId: string;
  totalSegments: number;
  successCount: number;
  totalDuration: number;
  segments: StoryTtsSegment[];
  error?: string;
}

export interface StoryTtsBatchStatusResponse {
  success: boolean;
  status: 'pending' | 'ready' | 'error';
  storyId: string;
  totalSegments: number;
  successCount: number;
  totalDuration: number;
  segments: StoryTtsSegment[];
  error?: string;
  nextPollInMs?: number;
}
