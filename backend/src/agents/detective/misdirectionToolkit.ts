import type { DetectiveOutline, DetectiveStoryDraft } from '@storyapp/shared';
import type { RevisionPlan } from './promptUtils';
import { assessOutlineComplexity } from './complexityToolkit';

interface Stage3AnalysisLite {
  betaReader?: {
    confidence: number;
    competingSuspects?: string[];
  };
}

export interface RedHerringSuggestion {
  chapter: string;
  suspect: string;
  setup: string;
  revealHint: string;
  reason: string;
}

function pickChapter(outline: DetectiveOutline, fallbackIndex: number): string {
  if (Array.isArray(outline.chapterBlueprints) && outline.chapterBlueprints[fallbackIndex]) {
    return outline.chapterBlueprints[fallbackIndex].chapter || `Chapter ${fallbackIndex + 1}`;
  }
  return `Chapter ${fallbackIndex + 1}`;
}

export function generateRedHerringSuggestions(
  outline: DetectiveOutline,
  stage3Analysis: Stage3AnalysisLite | null | undefined,
  draft: DetectiveStoryDraft | null | undefined,
): RedHerringSuggestion[] {
  const suspects = Array.isArray(outline.characters)
    ? outline.characters.filter(
        (character) =>
          character &&
          typeof character.role === 'string' &&
          /suspect/i.test(character.role) &&
          character.name &&
          character.name !== outline.solution?.culprit,
      )
    : [];
  if (!suspects.length) return [];

  const existingMoments = new Set(
    (outline.misdirectionMoments || [])
      .map((moment) => (moment?.suspect || '').trim())
      .filter(Boolean),
  );
  const complexity = assessOutlineComplexity(outline);
  const suggestions: RedHerringSuggestion[] = [];

  suspects.forEach((suspect, index) => {
    if (!suspect?.name) return;
    if (existingMoments.has(suspect.name)) {
      return;
    }
    const chapter = pickChapter(outline, Math.min(index + 1, 2));
    const keyReveal =
      Array.isArray(outline.solution?.keyReveals) && outline.solution?.keyReveals.length
        ? outline.solution?.keyReveals[index % outline.solution!.keyReveals.length]
        : '在最终揭示时通过证据推翻误导';
    const reason =
      complexity.metrics.misdirectionCount < complexity.thresholds.misdirectionCount
        ? '当前误导节点数量不足，需要新增红鲱鱼场景'
        : '为提升竞争嫌疑与误导效果，建议补充额外的红鲱鱼场景';
    suggestions.push({
      chapter,
      suspect: suspect.name,
      setup: `${suspect.name} 在 ${chapter} 被发现有可疑举动（例如与案发物品有关的误导线索）`,
      revealHint: `在后续章节澄清 ${suspect.name} 的行为只是巧合，可引用线索：${keyReveal}`,
      reason,
    });
  });

  if (stage3Analysis?.betaReader && stage3Analysis.betaReader.confidence >= 0.85) {
    suggestions.push({
      chapter: pickChapter(outline, 1),
      suspect: 'Beta Reader 建议',
      setup: '在第二幕安排一次“伪解答”场景，让侦探公开指认为假凶手，并用红鲱鱼线索支撑该判断',
      revealHint: '第三幕开头通过新线索推翻前述推理，强调真正关键证据指向真凶',
      reason: 'Beta Reader 在中途即高置信度锁定真凶，需要强化误导与竞争线索',
    });
  }

  return suggestions;
}

export function appendRedHerringSuggestionsToPlan(plan: RevisionPlan, suggestions: RedHerringSuggestion[]): RevisionPlan {
  if (!suggestions.length) return plan;
  const mergedSuggestions = new Set(plan.suggestions || []);
  suggestions.forEach((suggestion) => {
    mergedSuggestions.add(`建议在 ${suggestion.chapter} 安排针对 ${suggestion.suspect} 的红鲱鱼情节：${suggestion.setup}；并在后续用线索澄清（${suggestion.revealHint}）`);
  });
  return {
    ...plan,
    suggestions: Array.from(mergedSuggestions),
  };
}
