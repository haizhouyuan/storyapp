// Story Creation Workflow System - Shared Types & Constants
// 故事创作工作流系统 - 共享类型与常量

// Export all types
export * from './types/workflow/index.js';

// Export specific constants to avoid conflicts
export { WORKFLOW_STAGE_INFO } from './constants/workflow.js';

// Re-export commonly used types for convenience
export type {
  Project,
  Miracle,
  Clue,
  Character,
  Scene,
  WorkflowStage,
  GenreTag,
  ObjectId
} from './types/workflow/index.js';