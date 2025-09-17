// StoryApp - Shared Constants for Children's Interactive Stories
// 儿童互动故事应用 - 共享常量定义

export const DEFAULT_AGE_GROUPS = {
  TODDLER: '3-5',
  CHILD: '6-8', 
  TWEEN: '9-12',
  TEEN: '13-15'
} as const;

export const STORY_THEMES = {
  ADVENTURE: 'adventure',
  FRIENDSHIP: 'friendship',
  FAMILY: 'family',
  NATURE: 'nature',
  FANTASY: 'fantasy',
  SCIENCE: 'science',
  ANIMALS: 'animals',
  MAGIC: 'magic'
} as const;

export const STORY_DIFFICULTY = {
  EASY: 'easy',
  MEDIUM: 'medium',
  HARD: 'hard'
} as const;

export const DEFAULT_CHOICES_COUNT = 3;
export const MAX_CHOICES_COUNT = 6;
export const MIN_CHOICES_COUNT = 2;

export const API_ENDPOINTS = {
  GENERATE_STORY: '/api/generate-story',
  SAVE_STORY: '/api/save-story',
  GET_STORIES: '/api/get-stories',
  GET_STORY: '/api/get-story',
  HEALTH: '/api/health',
  HEALTHZ: '/healthz',
  TTS: '/api/tts'
} as const;

export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INTERNAL_SERVER_ERROR: 500
} as const;

export const ERROR_MESSAGES = {
  TOPIC_REQUIRED: 'story_topic_required',
  STORY_GENERATION_FAILED: 'story_generation_failed',
  STORY_SAVE_FAILED: 'story_save_failed',
  STORY_NOT_FOUND: 'story_not_found',
  INVALID_REQUEST: 'invalid_request',
  SERVER_ERROR: 'server_error'
} as const;

export const SUCCESS_MESSAGES = {
  STORY_GENERATED: 'story_generated_successfully',
  STORY_SAVED: 'story_saved_successfully'
} as const;