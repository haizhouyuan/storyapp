import type {
  DetectiveOutline,
  DetectiveStoryDraft,
  DetectiveTimelineEvent,
  ValidationReport,
  ValidationRuleResult,
  ValidationRuleStatus,
  ValidationRuleDetail,
} from '@storyapp/shared';
const VALID_CHAPTER_IDS = new Set(['Chapter 1', 'Chapter 2', 'Chapter 3']);
interface Stage4ValidationOptions {
  outlineId?: string;
  storyId?: string;
}
interface RuleComputation {
  status: ValidationRuleStatus;
  details: ValidationRuleDetail[];
}
export function runStage4Validation(
  outline: DetectiveOutline,
  storyDraft: DetectiveStoryDraft,
  options: Stage4ValidationOptions = {},
): ValidationReport {
  const ruleResults: ValidationRuleResult[] = [];
  ruleResults.push(validateClueForeshadowing(outline, storyDraft));
  ruleResults.push(validateTimelineConsistency(outline));
  ruleResults.push(validateChekhovRecovery(outline, storyDraft));
  const redHerringResult = validateRedHerringRatio(storyDraft);
  ruleResults.push(redHerringResult);
  // M3 扩展规则
  ruleResults.push(validateFairnessExposureMin(outline, storyDraft));
  ruleResults.push(validateTimelineFromText(outline, storyDraft));
  ruleResults.push(validateDeviceFeasibility(outline, storyDraft));
  const languageResult = validateLanguageAdaptation(storyDraft);
  ruleResults.push(languageResult);
  const summary = ruleResults.reduce(
    (acc, rule) => {
      if (rule.status === 'pass') acc.pass += 1;
      else if (rule.status === 'warn') acc.warn += 1;
      else if (rule.status === 'fail') acc.fail += 1;
      return acc;
    },
    { pass: 0, warn: 0, fail: 0 },
  );
  const metrics: Record<string, number> = {};
  if (redHerringResult?.details?.[0]?.meta && typeof redHerringResult.details[0].meta?.ratio === 'number') {
    metrics.redHerringRatio = redHerringResult.details[0].meta.ratio as number;
  }
  if (languageResult?.details?.[0]?.meta) {
    const m = languageResult.details[0].meta as any;
    if (typeof m.avgSentenceLen === 'number') metrics.avgSentenceLen = m.avgSentenceLen;
    if (typeof m.longSentenceRatio === 'number') metrics.longSentenceRatio = m.longSentenceRatio;
    if (typeof m.bannedWordCount === 'number') metrics.bannedWordCount = m.bannedWordCount;
  }
  return {
    generatedAt: new Date().toISOString(),
    outlineId: options.outlineId,
    storyId: options.storyId,
    results: ruleResults,
    summary,
    metrics: Object.keys(metrics).length ? metrics : undefined,
  };
}
function validateClueForeshadowing(
  outline: DetectiveOutline,
  storyDraft: DetectiveStoryDraft,
): ValidationRuleResult {
  const clues = outline?.clueMatrix ?? [];
  if (clues.length === 0) {
    return {
      ruleId: 'clue-foreshadowing',
      status: 'warn',
      details: [
        {
          message: '大纲未提供任何线索矩阵，建议补充以保证公平性',
        },
      ],
    };
  }
  const chapters = storyDraft?.chapters ?? [];
  const normalizedChapters = chapters.map((chapter) => ({
    title: chapter.title,
    content: chapter.content ?? '',
    cluesEmbedded: (chapter.cluesEmbedded ?? []).map(normalizeClueName),
  }));
  const computation: RuleComputation = {
    status: 'pass',
    details: [],
  };
  clues.forEach((clue) => {
    if (!clue.mustForeshadow) {
      return;
    }
    const normalizedClue = normalizeClueName(clue.clue);
    const expectedChapters = Array.isArray(clue.explicitForeshadowChapters)
      ? clue.explicitForeshadowChapters
      : [];
    const invalidChapters = expectedChapters.filter((chapterId) => !VALID_CHAPTER_IDS.has(chapterId));
    if (invalidChapters.length > 0) {
      updateRuleStatus(computation, 'warn', {
        message: `线索「${clue.clue}」声明了无效章节：${invalidChapters.join(', ')}`,
      });
    }
    const earliestMentionIndex = findEarliestClueMention(normalizedChapters, normalizedClue);
    if (earliestMentionIndex === -1) {
      updateRuleStatus(computation, 'fail', {
        message: `必需铺垫的线索「${clue.clue}」未在正文中出现或标注`,
      });
      return;
    }
    if (expectedChapters.length > 0) {
      const expectedIndexes = expectedChapters
        .map((chapterId) => extractChapterIndex(chapterId))
        .filter((idx): idx is number => idx !== null);
      if (expectedIndexes.length > 0 && !expectedIndexes.includes(earliestMentionIndex)) {
        const expectedLabels = expectedIndexes
          .map((idx) => `Chapter ${idx + 1}`)
          .join('、');
        updateRuleStatus(computation, 'warn', {
          message: `线索「${clue.clue}」实际最早出现在 Chapter ${earliestMentionIndex + 1}，与大纲声明的 ${expectedLabels} 不一致`,
        });
      }
    }
  });
  return {
    ruleId: 'clue-foreshadowing',
    status: computation.status,
    details: computation.details,
  };
}
function validateTimelineConsistency(outline: DetectiveOutline): ValidationRuleResult {
  const timeline = outline?.timeline ?? [];
  if (timeline.length === 0) {
    return {
      ruleId: 'timeline-consistency',
      status: 'warn',
      details: [
        {
          message: '大纲缺少时间线信息，无法验证时间顺序',
        },
      ],
    };
  }
  const computation: RuleComputation = {
    status: 'pass',
    details: [],
  };
  let lastTimestamp: number | null = null;
  timeline.forEach((event, index) => {
    const parsed = parseTimelineEvent(event);
    if (parsed === null) {
      updateRuleStatus(computation, 'warn', {
        message: `无法解析时间线事件 "${event.time}"，请使用 "DayX HH:MM" 格式`,
        meta: { event },
      });
      return;
    }
    if (lastTimestamp !== null && parsed < lastTimestamp) {
      updateRuleStatus(computation, 'fail', {
        message: `时间线事件顺序异常：${timeline[index - 1]?.time} → ${event.time}`,
      });
    }
    lastTimestamp = parsed;
  });
  return {
    ruleId: 'timeline-consistency',
    status: computation.status,
    details: computation.details,
  };
}
function validateChekhovRecovery(
  outline: DetectiveOutline,
  storyDraft: DetectiveStoryDraft,
): ValidationRuleResult {
  const mustForeshadowClues = (outline?.clueMatrix ?? []).filter((clue) => clue?.mustForeshadow);
  const chapters = storyDraft?.chapters ?? [];
  if (mustForeshadowClues.length === 0 || chapters.length === 0) {
    return {
      ruleId: 'chekhov-recovery',
      status: 'warn',
      details: [
        {
          message: '缺少必需铺垫的线索或章节数据，无法验证 Chekhov 回收规则',
        },
      ],
    };
  }
  const finalChapter = chapters[chapters.length - 1];
  const finalCluesNormalized = new Set(
    (finalChapter.cluesEmbedded ?? []).map(normalizeClueName),
  );
  const finalContentNormalized = normalizeClueName(finalChapter.content || '');
  const missing: string[] = [];
  mustForeshadowClues.forEach((clue) => {
    const normalized = normalizeClueName(clue.clue);
    if (!normalized) {
      return;
    }
    const presentInClues = finalCluesNormalized.has(normalized);
    const presentInContent = finalContentNormalized.includes(normalized);
    if (!presentInClues && !presentInContent) {
      missing.push(clue.clue);
    }
  });
  if (missing.length === 0) {
    return {
      ruleId: 'chekhov-recovery',
      status: 'pass',
      details: [
        {
          message: '所有必需线索在结局章节中得到回收',
        },
      ],
    };
  }
  return {
    ruleId: 'chekhov-recovery',
    status: 'warn',
    details: [
      {
        message: `以下线索未在结局章节中显式回收：${missing.join('、')}`,
        meta: { missing },
      },
    ],
  };
}
function validateRedHerringRatio(storyDraft: DetectiveStoryDraft): ValidationRuleResult {
  const chapters = storyDraft?.chapters ?? [];
  if (chapters.length === 0) {
    return {
      ruleId: 'red-herring-ratio',
      status: 'warn',
      details: [
        {
          message: '缺少章节数据，无法计算误导占比',
        },
      ],
    };
  }
  let clueCount = 0;
  let redHerringCount = 0;
  chapters.forEach((chapter) => {
    clueCount += (chapter.cluesEmbedded ?? []).length;
    redHerringCount += (chapter.redHerringsEmbedded ?? []).length;
  });
  const totalSignals = clueCount + redHerringCount;
  if (totalSignals === 0) {
    return {
      ruleId: 'red-herring-ratio',
      status: 'warn',
      details: [
        {
          message: '章节中缺少线索与误导数据，建议补充埋点',
        },
      ],
    };
  }
  const ratio = redHerringCount / totalSignals;
  if (ratio > 0.4) {
    return {
      ruleId: 'red-herring-ratio',
      status: 'fail',
      details: [
        {
          message: `红鲱鱼占比过高（${(ratio * 100).toFixed(1)}%），建议控制在 40% 以下`,
          meta: { clueCount, redHerringCount, ratio },
        },
      ],
    };
  }
  if (ratio > 0.3) {
    return {
      ruleId: 'red-herring-ratio',
      status: 'warn',
      details: [
        {
          message: `红鲱鱼占比接近阈值（${(ratio * 100).toFixed(1)}%），建议进一步收敛`,
          meta: { clueCount, redHerringCount, ratio },
        },
      ],
    };
  }
  return {
    ruleId: 'red-herring-ratio',
    status: 'pass',
    details: [
      {
        message: `红鲱鱼占比 ${(ratio * 100).toFixed(1)}%，符合规则`,
        meta: { clueCount, redHerringCount, ratio },
      },
    ],
  };
}
function findEarliestClueMention(
  chapters: Array<{ title: string; content: string; cluesEmbedded: string[] }>,
  normalizedClue: string,
): number {
  for (let index = 0; index < chapters.length; index += 1) {
    const chapter = chapters[index];
    if (chapter.cluesEmbedded.includes(normalizedClue)) {
      return index;
    }
    if (chapter.content && normalizeClueName(chapter.content).includes(normalizedClue)) {
      return index;
    }
  }
  return -1;
}
function extractChapterIndex(chapterId: string): number | null {
  const match = chapterId.match(/Chapter\s*(\d+)/i);
  if (!match) {
    return null;
  }
  const parsed = Number.parseInt(match[1], 10);
  if (Number.isNaN(parsed)) {
    return null;
  }
  return parsed - 1;
}
function normalizeClueName(value: string | undefined): string {
  return (value ?? '').replace(/\s+/g, '').toLowerCase();
}
function parseTimelineEvent(event: DetectiveTimelineEvent): number | null {
  if (!event?.time) {
    return null;
  }
  const match = event.time.match(/^Day(\d+)\s+(\d{1,2}):(\d{2})$/i);
  if (!match) {
    return null;
  }
  const day = Number.parseInt(match[1], 10);
  const hour = Number.parseInt(match[2], 10);
  const minute = Number.parseInt(match[3], 10);
  if ([day, hour, minute].some(Number.isNaN)) {
    return null;
  }
  return day * 24 * 60 + hour * 60 + minute;
}
function updateRuleStatus(computation: RuleComputation, status: ValidationRuleStatus, detail: ValidationRuleDetail) {
  if (status === 'fail') {
    computation.status = 'fail';
  } else if (status === 'warn' && computation.status !== 'fail') {
    computation.status = 'warn';
  }
  computation.details.push(detail);
}
// --------------------------- M3 扩展规则实现 ---------------------------
function validateFairnessExposureMin(
  outline: DetectiveOutline,
  storyDraft: DetectiveStoryDraft,
): ValidationRuleResult {
  const chapters = storyDraft?.chapters ?? [];
  const clues = outline?.clueMatrix ?? [];
  if (clues.length === 0 || chapters.length === 0) {
    return { ruleId: 'fairness-min-exposures', status: 'warn', details: [{ message: '缺少线索或章节，无法计算最小铺垫次数' }] };
  }
  const minExposure = 2; // 默认阈值
  const exposure: Record<string, number> = {};
  clues.forEach((c) => { if (c?.clue) exposure[normalizeClueName(c.clue)] = 0; });
  chapters.forEach((ch) => {
    const text = normalizeClueName(ch.content || '');
    Object.keys(exposure).forEach((k) => {
      if (text.includes(k)) exposure[k] += 1;
    });
    (ch.cluesEmbedded || []).forEach((name) => {
      const k = normalizeClueName(name);
      if (k in exposure) exposure[k] += 1;
    });
  });
  const lacking = Object.entries(exposure).filter(([, n]) => n < minExposure).map(([k]) => k);
  if (lacking.length === 0) return { ruleId: 'fairness-min-exposures', status: 'pass', details: [{ message: `所有线索铺垫次数≥${minExposure}` }] };
  return { ruleId: 'fairness-min-exposures', status: 'warn', details: [{ message: `以下线索铺垫次数不足：${lacking.join('、')}`, meta: { exposure, minExposure } }] };
}
function validateTimelineFromText(
  outline: DetectiveOutline,
  storyDraft: DetectiveStoryDraft,
): ValidationRuleResult {
  const chapters = storyDraft?.chapters ?? [];
  if (chapters.length === 0) return { ruleId: 'timeline-from-text', status: 'warn', details: [{ message: '缺少章节，无法抽取时间' }] };
  const timeRegex = /(|\D)([0-2]?\d):([0-5]\d)(|\D)/g;
  const found: string[] = [];
  chapters.forEach((ch) => {
    const text = ch.content || '';
    let m: RegExpExecArray | null;
    while ((m = timeRegex.exec(text)) !== null) {
      found.push(`${m[2].padStart(2,'0')}:${m[3]}`);
    }
  });
  if (found.length === 0) return { ruleId: 'timeline-from-text', status: 'warn', details: [{ message: '正文中未发现显式时间标注' }] };
  const outlineTimes = new Set((outline?.timeline || []).map((e) => (e?.time || '').split(' ').pop()));
  const mismatches = found.filter((t) => t && !outlineTimes.has(t));
  if (mismatches.length === 0) return { ruleId: 'timeline-from-text', status: 'pass', details: [{ message: '正文时间点与大纲时间基本一致' }] };
  return { ruleId: 'timeline-from-text', status: 'warn', details: [{ message: `正文出现未在大纲时间线中的时间：${mismatches.slice(0,5).join('、')}…`, meta: { found: found.slice(0,20) } }] };
}
function validateDeviceFeasibility(
  outline: DetectiveOutline,
  storyDraft: DetectiveStoryDraft,
): ValidationRuleResult {
  const mech = (outline?.centralTrick?.mechanism || outline?.centralTrick?.summary || '').toLowerCase();
  const required = ['滑轮','风道','潮', '共振'];
  const missing = required.filter((k) => !mech.includes(k.toLowerCase()));
  const textAll = (storyDraft?.chapters || []).map((c) => c.content || '').join('\n').toLowerCase();
  const presentInText = required.filter((k) => textAll.includes(k.toLowerCase()));
  if (missing.length > 2) {
    return { ruleId: 'device-feasibility', status: 'warn', details: [{ message: '大纲机制描述过于模糊，缺少关键机械要素', meta: { missingRequired: missing } }] };
  }
  if (presentInText.length === 0) {
    return { ruleId: 'device-feasibility', status: 'warn', details: [{ message: '正文未出现关键机械要素的可观察证据', meta: { required } }] };
  }
  return { ruleId: 'device-feasibility', status: 'pass', details: [{ message: '中心奇迹具备基本可行性的文本支撑', meta: { presentInText } }] };
}
function validateLanguageAdaptation(
  storyDraft: DetectiveStoryDraft,
): ValidationRuleResult {
  const textAll = (storyDraft?.chapters || []).map((c) => c.content || '').join('\n');
  if (!textAll) return { ruleId: 'language-adaptation', status: 'warn', details: [{ message: '缺少正文文本，无法计算语言指标' }] };
  const sentences = textAll.split(/[。！？!?.]/).map((s) => s.trim()).filter(Boolean);
  const lens = sentences.map((s) => s.length);
  const avg = lens.reduce((a,b)=>a+b,0) / Math.max(1,lens.length);
  const longRatio = lens.length ? lens.filter((n)=> n>30).length / lens.length : 0;
  const banned = ['血腥','残忍','恐怖至极'];
  const bannedCount = banned.reduce((acc,w)=> acc + ((textAll.match(new RegExp(w,'g'))||[]).length), 0);
  let status: ValidationRuleStatus = 'pass';
  if (avg > 26 || longRatio > 0.3 || bannedCount > 0) status = 'warn';
  if (avg > 32 || longRatio > 0.5 || bannedCount > 1) status = 'fail';
  return { ruleId: 'language-adaptation', status, details: [{ message: '语言适配指标', meta: { avgSentenceLen: +avg.toFixed(2), longSentenceRatio: +longRatio.toFixed(3), bannedWordCount: bannedCount } }] };
}
export type { Stage4ValidationOptions };