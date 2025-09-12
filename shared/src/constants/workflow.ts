import type { WorkflowStage } from '../types/workflow/index.js';

// Additional workflow stage metadata (WORKFLOW_STAGES constant is already exported from types)
export const WORKFLOW_STAGE_INFO = {
  'project_init': {
    name: '项目立项',
    description: '定义项目基本信息和创作目标',
    order: 1
  },
  'center_miracle': {
    name: '中心奇迹',
    description: '设计核心诡计机制',
    order: 2
  },
  'chekhov_list': {
    name: '道具清单',
    description: '列出关键道具及其使用时机',
    order: 3
  },
  'structure_build': {
    name: '结构搭建',
    description: '构建故事整体框架',
    order: 4
  },
  'clue_matrix': {
    name: '线索矩阵',
    description: '设计线索网络和逻辑关系',
    order: 5
  },
  'misdirection_design': {
    name: '误导设计',
    description: '构造合理的误导元素',
    order: 6
  },
  'scene_cards': {
    name: '场景卡片',
    description: '详细设计各个场景',
    order: 7
  },
  'recap_chapter': {
    name: '回顾章节',
    description: '回顾并调整整体逻辑',
    order: 8
  },
  'pressure_test': {
    name: '压力测试',
    description: '验证逻辑完整性',
    order: 9
  },
  'language_polish': {
    name: '语言打磨',
    description: '优化文本表达',
    order: 10
  },
  'publish_postmortem': {
    name: '发布总结',
    description: '发布后分析和总结',
    order: 11
  }
} as const;
