// Additional validation configurations for the story workflow system
// Note: DEFAULT_VALIDATION_RULES is already exported from workflow types

// Validation severity levels
export const VALIDATION_SEVERITIES = ['error', 'warning', 'info'] as const;

// Validation categories
export const VALIDATION_CATEGORIES = {
  'fairness': {
    name: '公平性',
    description: '确保线索和推理的公平性',
    color: '#e74c3c'
  },
  'structure': {
    name: '结构完整性',
    description: '验证故事结构的合理性',
    color: '#3498db'
  },
  'consistency': {
    name: '一致性',
    description: '检查逻辑和设定的一致性',
    color: '#f39c12'
  },
  'misdirection': {
    name: '误导设计',
    description: '评估误导元素的有效性',
    color: '#9b59b6'
  },
  'immersion': {
    name: '沉浸感',
    description: '检查感官描述和沉浸体验',
    color: '#27ae60'
  }
} as const;