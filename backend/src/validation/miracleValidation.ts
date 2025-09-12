import type { UpdateMiracleRequest } from '@storyapp/shared';

export function validateMiracle(input: UpdateMiracleRequest) {
  const errors: string[] = [];
  if (!input?.logline?.trim()) errors.push('缺少 logline');
  if (!Array.isArray(input.chain) || input.chain.length === 0) errors.push('缺少奇迹链');
  return { isValid: errors.length === 0, errors };
}