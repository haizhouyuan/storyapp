import { createLogger } from '../config/logger';
import { runStage1Planning } from '../agents/detective/stageRunner';
import type { PromptBuildOptions } from '../agents/detective/promptBuilder';
import { validateDetectiveOutline } from '../utils/schemaValidator';

const logger = createLogger('engines:planner_llm');

export interface PlannerOptions extends PromptBuildOptions {
  maxRetries?: number;
  strictSchema?: boolean;
}

export async function planBlueprint(topic: string, options: PlannerOptions = {}) {
  const maxRetries = options.maxRetries ?? 3;
  const strict = options.strictSchema ?? true;

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      const outline = await runStage1Planning(topic, options);
      const res = validateDetectiveOutline(outline);
      if (res.valid) {
        return { ok: true as const, outline };
      }
      const errors = res.errors || [];
      logger.warn({ attempt, errors }, '蓝图Schema校验未通过');
      if (attempt === maxRetries) {
        if (strict) {
          return { ok: false as const, error: 'SCHEMA_INVALID', errors, lastOutline: outline };
        }
        return { ok: true as const, outline, warnings: errors };
      }
    } catch (err: any) {
      logger.error({ attempt, err }, '规划器失败');
      if (attempt === maxRetries) {
        return { ok: false as const, error: err?.code || 'PLANNER_ERROR', reason: String(err?.message || err) };
      }
    }
  }

  return { ok: false as const, error: 'UNKNOWN' };
}
