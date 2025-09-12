import type { CreateProjectRequest } from '../types/workflow';

export function validateCreateProject(input: CreateProjectRequest) {
  const errors: string[] = [];
  if (!input?.title?.trim()) errors.push('缺少项目标题');
  if (!Array.isArray(input.genreTags) || input.genreTags.length === 0) errors.push('至少选择一个类型标签');
  if (!Number.isFinite(input.targetWords) || input.targetWords <= 0) errors.push('目标字数不合法');
  return { isValid: errors.length === 0, errors };
}