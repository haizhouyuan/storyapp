import type { DetectiveOutline } from '@storyapp/shared';

export interface OutlineComplexityMetrics {
  actsCount: number;
  totalBeats: number;
  chapterCount: number;
  clueCount: number;
  mustForeshadowCount: number;
  redHerringCount: number;
  suspectCount: number;
  secondaryMysteryCount: number;
  twistCount: number;
  misdirectionCount: number;
  clueDensity: number | null;
}

export interface OutlineComplexityThresholds {
  clueCount: number;
  clueDensity: number;
  mustForeshadowCount: number;
  suspectCount: number;
  secondaryMysteryCount: number;
  twistCount: number;
  misdirectionCount: number;
}

export interface OutlineComplexityAssessment {
  metrics: OutlineComplexityMetrics;
  thresholds: OutlineComplexityThresholds;
  lacking: string[];
  status: 'pass' | 'retry' | 'manual-review';
}

export const DEFAULT_COMPLEXITY_THRESHOLDS: OutlineComplexityThresholds = {
  clueCount: 4,
  clueDensity: 1,
  mustForeshadowCount: 2,
  suspectCount: 3,
  secondaryMysteryCount: 1,
  twistCount: 1,
  misdirectionCount: 1,
};

function getActsCount(outline: DetectiveOutline): number {
  if (typeof outline.actsCount === 'number' && outline.actsCount >= 3) {
    return Math.floor(outline.actsCount);
  }
  if (Array.isArray(outline.acts) && outline.acts.length >= 3) {
    return outline.acts.length;
  }
  return 3;
}

function getChapterCount(outline: DetectiveOutline): number {
  if (Array.isArray(outline.chapterBlueprints) && outline.chapterBlueprints.length > 0) {
    return outline.chapterBlueprints.length;
  }
  const acts = Array.isArray(outline.acts) ? outline.acts : [];
  if (acts.length > 0) {
    let beats = 0;
    acts.forEach((act) => {
      if (Array.isArray(act?.beats)) {
        beats += act.beats.length;
      }
    });
    if (beats > 0) {
      return beats;
    }
  }
  return 3;
}

function getTotalBeats(outline: DetectiveOutline): number {
  const acts = Array.isArray(outline.acts) ? outline.acts : [];
  return acts.reduce((acc, act) => {
    if (Array.isArray(act?.beats)) {
      return acc + act.beats.length;
    }
    return acc;
  }, 0);
}

function getClueCount(outline: DetectiveOutline): { total: number; mustForeshadow: number; redHerring: number } {
  const clues = Array.isArray(outline.clueMatrix) ? outline.clueMatrix : [];
  let must = 0;
  let red = 0;
  clues.forEach((clue) => {
    if (clue?.mustForeshadow) {
      must += 1;
    }
    if ((clue as any)?.isRedHerring) {
      red += 1;
    }
  });
  return {
    total: clues.length,
    mustForeshadow: must,
    redHerring: red,
  };
}

function getSuspectCount(outline: DetectiveOutline): number {
  const characters = Array.isArray(outline.characters) ? outline.characters : [];
  return characters.filter((character) => {
    const role = (character?.role || '').toLowerCase();
    return role.includes('suspect') || role.includes('嫌疑');
  }).length;
}

function getMisdirectionCount(outline: DetectiveOutline): number {
  const moments = Array.isArray(outline.misdirectionMoments) ? outline.misdirectionMoments : [];
  return moments.length;
}

function getSecondaryMysteryCount(outline: DetectiveOutline): number {
  return Array.isArray(outline.secondaryMysteries) ? outline.secondaryMysteries.length : 0;
}

function getTwistCount(outline: DetectiveOutline): number {
  if (!Array.isArray(outline.twists)) return 0;
  return outline.twists.length;
}

export function calculateOutlineComplexityMetrics(outline: DetectiveOutline): OutlineComplexityMetrics {
  const actsCount = getActsCount(outline);
  const chapterCount = getChapterCount(outline);
  const totalBeats = getTotalBeats(outline);
  const clueStats = getClueCount(outline);
  const clueDensity =
    chapterCount > 0 && clueStats.total > 0 ? Number((clueStats.total / chapterCount).toFixed(3)) : clueStats.total > 0 ? Number(clueStats.total.toFixed(3)) : null;

  return {
    actsCount,
    totalBeats,
    chapterCount,
    clueCount: clueStats.total,
    mustForeshadowCount: clueStats.mustForeshadow,
    redHerringCount: clueStats.redHerring,
    suspectCount: getSuspectCount(outline),
    secondaryMysteryCount: getSecondaryMysteryCount(outline),
    twistCount: getTwistCount(outline),
    misdirectionCount: getMisdirectionCount(outline),
    clueDensity,
  };
}

export function assessOutlineComplexity(
  outline: DetectiveOutline,
  thresholds: Partial<OutlineComplexityThresholds> = {},
): OutlineComplexityAssessment {
  const effectiveThresholds: OutlineComplexityThresholds = {
    ...DEFAULT_COMPLEXITY_THRESHOLDS,
    ...thresholds,
  };
  const metrics = calculateOutlineComplexityMetrics(outline);
  const lacking: string[] = [];

  if (metrics.clueCount < effectiveThresholds.clueCount) {
    lacking.push(`线索数量不足（${metrics.clueCount}/${effectiveThresholds.clueCount}）`);
  }
  if (metrics.mustForeshadowCount < effectiveThresholds.mustForeshadowCount) {
    lacking.push(`必铺垫线索不足（${metrics.mustForeshadowCount}/${effectiveThresholds.mustForeshadowCount}）`);
  }
  if (metrics.clueDensity !== null && metrics.clueDensity < effectiveThresholds.clueDensity) {
    lacking.push(`线索密度偏低（${metrics.clueDensity}/${effectiveThresholds.clueDensity}）`);
  }
  if (metrics.suspectCount < effectiveThresholds.suspectCount) {
    lacking.push(`嫌疑人数量不足（${metrics.suspectCount}/${effectiveThresholds.suspectCount}）`);
  }
  if (metrics.secondaryMysteryCount < effectiveThresholds.secondaryMysteryCount) {
    lacking.push('缺少足够的次要谜题');
  }
  if (metrics.twistCount < effectiveThresholds.twistCount) {
    lacking.push('重大反转数量不足');
  }
  if (metrics.misdirectionCount < effectiveThresholds.misdirectionCount) {
    lacking.push('误导节点数量不足');
  }

  const status: OutlineComplexityAssessment['status'] =
    lacking.length === 0 ? 'pass' : lacking.length <= 3 ? 'retry' : 'manual-review';

  return {
    metrics,
    thresholds: effectiveThresholds,
    lacking,
    status,
  };
}
