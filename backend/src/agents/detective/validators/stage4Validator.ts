import type {
  DetectiveOutline,
  DetectiveStoryDraft,
  DetectiveTimelineEvent,
  ValidationReport,
  ValidationRuleResult,
  ValidationRuleStatus,
  ValidationRuleDetail,
} from '@storyapp/shared';
import { DETECTIVE_MECHANISM_GROUPS } from '@storyapp/shared';
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
  const chapters = storyDraft?.chapters ?? [];
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
  ruleResults.push(validateDialogueDensity(storyDraft));
  ruleResults.push(validateMotiveForeshadowing(outline, storyDraft));
  ruleResults.push(validateChapterTimeTags(outline, storyDraft));
  ruleResults.push(validateFinalReveal(storyDraft));
  ruleResults.push(validateChapterWordTargets(outline, storyDraft));
  ruleResults.push(validateEmotionalBeats(outline, storyDraft));
  ruleResults.push(validateMisdirectionDeployment(outline, storyDraft));
  ruleResults.push(validateEndingResolution(storyDraft));
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
  if (chapters.length) {
    const dialogueStats = chapters.map((chapter, index) => {
      const dialogues = estimateDialogueCount(chapter.content || '');
      const sensory = estimateSensoryCount(chapter.content || '');
      const name = chapter.title || `Chapter ${index + 1}`;
      return { chapter: name, dialogues, sensory };
    });
    const totalDialogues = dialogueStats.reduce((sum, item) => sum + item.dialogues, 0);
    const totalSensory = dialogueStats.reduce((sum, item) => sum + item.sensory, 0);
    metrics.totalDialogues = totalDialogues;
    metrics.totalSensoryCues = totalSensory;
    ruleResults.push({
      ruleId: 'narrative-stats',
      status: 'pass',
      details: dialogueStats.map(({ chapter, dialogues, sensory }) => ({
        message: `章节「${chapter}」对白 ${dialogues} 次，感官描写 ${sensory} 处`,
      })),
    });
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
  const validChapterIds = new Set(chapters.map((_, idx) => `Chapter ${idx + 1}`));
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
    const invalidChapters = expectedChapters.filter((chapterId) => !validChapterIds.has(chapterId));
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
function validateFinalReveal(storyDraft: DetectiveStoryDraft): ValidationRuleResult {
  const chapters = storyDraft?.chapters ?? [];
  if (chapters.length === 0) {
    return {
      ruleId: 'final-reveal',
      status: 'warn',
      details: [{ message: '缺少章节数据，无法验证结局揭示' }],
    };
  }
  const finalChapter = chapters[chapters.length - 1];
  const text = String(finalChapter?.content || '').trim();
  if (!text) {
    return {
      ruleId: 'final-reveal',
      status: 'warn',
      details: [{ message: '结局章节正文为空，建议补充真相揭示段落' }],
    };
  }
  const normalized = text.replace(/\s+/g, '');
  const hasReveal = /(真相|复盘|揭示|总结|破案|嫌疑人|凶手)/.test(normalized);
  if (hasReveal) {
    return {
      ruleId: 'final-reveal',
      status: 'pass',
      details: [{ message: '结局章节包含真相揭示或复盘段落' }],
    };
  }
  return {
    ruleId: 'final-reveal',
    status: 'warn',
    details: [{ message: '结局章节缺少明确的真相揭示或复盘段落' }],
  };
}

function computeChapterWordCount(chapter: any): number {
  if (!chapter) return 0;
  if (typeof chapter.wordCount === 'number' && chapter.wordCount > 0) {
    return chapter.wordCount;
  }
  const content = typeof chapter.content === 'string' ? chapter.content : '';
  return content.replace(/\s+/g, '').length;
}

function validateChapterWordTargets(
  outline: DetectiveOutline,
  storyDraft: DetectiveStoryDraft,
): ValidationRuleResult {
  const blueprints = (outline as any)?.chapterBlueprints;
  if (!Array.isArray(blueprints) || blueprints.length === 0) {
    return {
      ruleId: 'chapter-word-target',
      status: 'pass',
      details: [{ message: '大纲未指定章节篇幅目标' }],
    };
  }
  const chapters = storyDraft?.chapters ?? [];
  if (chapters.length === 0) {
    return {
      ruleId: 'chapter-word-target',
      status: 'warn',
      details: [{ message: '缺少章节内容，无法比对篇幅目标' }],
    };
  }
  const computation: RuleComputation = {
    status: 'pass',
    details: [],
  };
  blueprints.forEach((bp: any) => {
    const idx = parseChapterIndex(bp?.chapter);
    if (idx === null) {
      updateRuleStatus(computation, 'warn', {
        message: `章节篇幅目标引用了无效章节标识：${bp?.chapter ?? '未知'}`,
      });
      return;
    }
    if (idx < 0 || idx >= chapters.length) {
      updateRuleStatus(computation, 'warn', {
        message: `章节篇幅目标指向第 ${idx + 1} 章，但正文缺少该章节`,
      });
      return;
    }
    const target = typeof bp?.wordTarget === 'number' ? bp.wordTarget : 0;
    if (target <= 0) {
      updateRuleStatus(computation, 'warn', {
        message: `章节 ${idx + 1} 未指定有效的 wordTarget`,
      });
      return;
    }
    const actual = computeChapterWordCount(chapters[idx]);
    const minAllowed = target * 0.92;
    const maxAllowed = target * 1.08;
    if (actual === 0) {
      updateRuleStatus(computation, 'fail', {
        message: `章节 ${idx + 1} 未写入正文，目标篇幅 ${target}`,
      });
      return;
    }
    if (actual < minAllowed || actual > maxAllowed) {
      const deviation = ((actual - target) / target) * 100;
      updateRuleStatus(computation, 'warn', {
        message: `章节 ${idx + 1} 篇幅偏离目标（目标 ${target} 字，实际 ${actual} 字，偏差 ${deviation.toFixed(1)}%）`,
        meta: { chapter: idx + 1, target, actual, deviation },
      });
    }
  });
  if (computation.details.length === 0) {
    computation.details.push({ message: '章节篇幅均符合目标区间' });
  }
  return {
    ruleId: 'chapter-word-target',
    status: computation.status,
    details: computation.details,
  };
}

function keywordHit(text: string, keywords: string[]): boolean {
  const normalized = text.replace(/\s+/g, '');
  return keywords.some((keyword) => keyword && normalized.includes(keyword));
}

function validateEmotionalBeats(
  outline: DetectiveOutline,
  storyDraft: DetectiveStoryDraft,
): ValidationRuleResult {
  const beats = (outline as any)?.emotionalBeats;
  if (!Array.isArray(beats) || beats.length === 0) {
    return {
      ruleId: 'emotional-beats',
      status: 'pass',
      details: [{ message: '大纲未声明情绪节拍，跳过检查' }],
    };
  }
  const chapters = storyDraft?.chapters ?? [];
  if (chapters.length === 0) {
    return {
      ruleId: 'emotional-beats',
      status: 'warn',
      details: [{ message: '缺少章节内容，无法验证情绪节拍' }],
    };
  }
  const computation: RuleComputation = {
    status: 'pass',
    details: [],
  };
  beats.forEach((beat: any, idx: number) => {
    const chapterIndex = parseChapterIndex(beat?.chapter);
    if (chapterIndex === null) {
      updateRuleStatus(computation, 'warn', {
        message: `情绪节拍 ${idx + 1} 缺少有效章节标识`,
      });
      return;
    }
    if (chapterIndex < 0 || chapterIndex >= chapters.length) {
      updateRuleStatus(computation, 'warn', {
        message: `情绪节拍指向第 ${chapterIndex + 1} 章，但正文缺少该章节`,
      });
      return;
    }
    const text = `${chapters[chapterIndex]?.summary ?? ''}\n${chapters[chapterIndex]?.content ?? ''}`;
    const keywords = Array.isArray(beat?.keywords)
      ? beat.keywords.filter((kw: unknown): kw is string => typeof kw === 'string' && kw.trim().length > 0)
      : [];
    if (keywords.length === 0) {
      updateRuleStatus(computation, 'warn', {
        message: `情绪节拍 ${beat?.chapter ?? idx + 1} 未提供关键词参考`,
      });
      return;
    }
    if (!keywordHit(text, keywords)) {
      updateRuleStatus(computation, 'warn', {
        message: `情绪节拍 ${beat?.chapter ?? idx + 1} 缺少关键词（${keywords.join('、')}）的情绪描写`,
      });
    }
  });
  if (computation.details.length === 0) {
    computation.details.push({ message: '情绪节拍均已在对应章节体现' });
  }
  return {
    ruleId: 'emotional-beats',
    status: computation.status,
    details: computation.details,
  };
}

function extractKeywords(input: string | undefined): string[] {
  if (!input) return [];
  return input
    .split(/[,，。；;：“”"、\s]/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

function validateMisdirectionDeployment(
  outline: DetectiveOutline,
  storyDraft: DetectiveStoryDraft,
): ValidationRuleResult {
  const moments = (outline as any)?.misdirectionMoments;
  if (!Array.isArray(moments) || moments.length === 0) {
    return {
      ruleId: 'misdirection-deployment',
      status: 'pass',
      details: [{ message: '大纲未声明误导节点，跳过检查' }],
    };
  }
  const chapters = storyDraft?.chapters ?? [];
  if (chapters.length === 0) {
    return {
      ruleId: 'misdirection-deployment',
      status: 'warn',
      details: [{ message: '缺少章节内容，无法验证误导节点' }],
    };
  }
  const computation: RuleComputation = {
    status: 'pass',
    details: [],
  };
  const fullText = chapters.map((ch) => `${ch.summary || ''}\n${ch.content || ''}`).join('\n');
  moments.forEach((moment: any, idx: number) => {
    const chapterIndex = parseChapterIndex(moment?.chapter);
    if (chapterIndex === null) {
      updateRuleStatus(computation, 'warn', {
        message: `误导节点 ${idx + 1} 缺少有效章节标识`,
      });
      return;
    }
    if (chapterIndex < 0 || chapterIndex >= chapters.length) {
      updateRuleStatus(computation, 'warn', {
        message: `误导节点指向第 ${chapterIndex + 1} 章，但正文缺少该章节`,
      });
      return;
    }
    const chapterText = `${chapters[chapterIndex]?.summary ?? ''}\n${chapters[chapterIndex]?.content ?? ''}`;
    const suspect = typeof moment?.suspect === 'string' ? moment.suspect.trim() : '';
    const setupKeywords = extractKeywords(moment?.setup).slice(0, 3);
    const surfaceKeywords = extractKeywords(moment?.surfaceInterpretation).slice(0, 2);
    const revealHint = typeof moment?.revealHint === 'string' ? moment.revealHint.trim() : '';
    const hasSetup = keywordHit(chapterText, [suspect, ...setupKeywords, ...surfaceKeywords].filter(Boolean));
    if (!hasSetup) {
      updateRuleStatus(computation, 'warn', {
        message: `${moment?.chapter ?? `节点${idx + 1}`} 未凸显误导情境或嫌疑人线索`,
      });
    }
    if (revealHint) {
      const laterText = chapters
        .slice(chapterIndex + 1)
        .map((ch) => `${ch.summary || ''}\n${ch.content || ''}`)
        .join('\n');
      if (laterText && !keywordHit(laterText, extractKeywords(revealHint))) {
        updateRuleStatus(computation, 'warn', {
          message: `${moment?.chapter ?? `节点${idx + 1}`} 的误导未在后续章节以“${revealHint}”相关线索澄清`,
        });
      }
    } else if (fullText && !keywordHit(fullText, extractKeywords(moment?.setup))) {
      updateRuleStatus(computation, 'warn', {
        message: `${moment?.chapter ?? `节点${idx + 1}`} 未提供明确的误导文本提示`,
      });
    }
  });
  if (computation.details.length === 0) {
    computation.details.push({ message: '误导节点均出现在指定章节并得到澄清' });
  }
  return {
    ruleId: 'misdirection-deployment',
    status: computation.status,
    details: computation.details,
  };
}

function validateEndingResolution(storyDraft: DetectiveStoryDraft): ValidationRuleResult {
  const chapters = storyDraft?.chapters ?? [];
  if (chapters.length === 0) {
    return {
      ruleId: 'ending-resolution',
      status: 'warn',
      details: [{ message: '缺少章节，无法验证结尾收束' }],
    };
  }
  const finalChapter = chapters[chapters.length - 1];
  const text = String(finalChapter?.content || '').trim();
  if (!text) {
    return {
      ruleId: 'ending-resolution',
      status: 'warn',
      details: [{ message: '结尾章节为空，需补写事件收尾' }],
    };
  }
  const paragraphs = text
    .split(/\n+/)
    .map((para) => para.trim())
    .filter((para) => para);
  if (paragraphs.length === 0) {
    return {
      ruleId: 'ending-resolution',
      status: 'warn',
      details: [{ message: '结尾缺少完整段落，建议补写善后描述' }],
    };
  }
  const closureKeywords = ['后来', '事后', '几天后', '最终', '恢复', '再次', '重新', '平复'];
  const closureParagraph = paragraphs.find((para) => {
    const length = para.replace(/\s+/g, '').length;
    return length >= 120 && keywordHit(para, closureKeywords);
  });
  if (!closureParagraph) {
    return {
      ruleId: 'ending-resolution',
      status: 'warn',
      details: [{ message: '结尾缺少 120 字以上的善后段落或未来走向描述' }],
    };
  }
  return {
    ruleId: 'ending-resolution',
    status: 'pass',
    details: [{ message: '结尾包含善后/未来走向的完整段落' }],
  };
}

function extractMotiveTokens(text?: string): string[] {
  if (!text) return [];
  const pieces = text
    .split(/[，。,.;；：:!?！？\s]/)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length >= 2);
  return Array.from(new Set(pieces));
}
function validateMotiveForeshadowing(
  outline: DetectiveOutline,
  storyDraft: DetectiveStoryDraft,
): ValidationRuleResult {
  const chapters = storyDraft?.chapters ?? [];
  if (chapters.length === 0) {
    return {
      ruleId: 'motive-foreshadowing',
      status: 'pass',
      details: [{ message: '缺少章节，跳过动机铺垫检查' }],
    };
  }
  const solution: any = (outline as any)?.solution ?? {};
  const motiveTexts: string[] = [];
  if (typeof solution.motiveCore === 'string') motiveTexts.push(solution.motiveCore);
  if (Array.isArray(solution.keyReveals)) motiveTexts.push(...(solution.keyReveals as string[]));
  const suspects = (outline?.characters ?? []).filter(
    (character) => typeof character?.role === 'string' && /suspect/i.test(character.role ?? ''),
  );
  const suspectEntries = suspects
    .map((suspect) => {
      const keywords = Array.isArray(suspect.motiveKeywords)
        ? Array.from(new Set(suspect.motiveKeywords.filter((kw): kw is string => Boolean(kw && kw.trim()))))
        : [];
      return {
        name: suspect.name || '嫌疑人',
        keywords,
      };
    })
    .filter((entry) => entry.keywords.length > 0);
  const motiveTokens = Array.from(
    new Set([
      ...extractMotiveTokens(motiveTexts.join(' ')),
      ...suspectEntries.flatMap((entry) => entry.keywords),
    ]),
  );
  if (motiveTokens.length === 0 && suspectEntries.length === 0) {
    return {
      ruleId: 'motive-foreshadowing',
      status: 'pass',
      details: [{ message: '未定义明确动机关键词，跳过检查' }],
    };
  }
  const earlyChapters = chapters.slice(0, Math.max(1, chapters.length - 1));
  const earlyText = earlyChapters
    .map((chapter) => `${chapter.summary || ''}\n${chapter.content || ''}`)
    .join('\n');
  const hits = motiveTokens.filter((token) => token && earlyText.includes(token));
  const missingTokens = motiveTokens.filter((token) => token && !earlyText.includes(token));
  const suspectMissing = suspectEntries
    .map((entry) => {
      const missing = entry.keywords.filter((keyword) => keyword && !earlyText.includes(keyword));
      if (missing.length === 0) return null;
      return `嫌疑人 ${entry.name} 缺少伏笔：${missing.join('、')}`;
    })
    .filter((msg): msg is string => Boolean(msg));
  if (missingTokens.length === 0 && suspectMissing.length === 0) {
    return {
      ruleId: 'motive-foreshadowing',
      status: 'pass',
      details: [{ message: `动机关键词已在前文出现：${hits.slice(0, 5).join('、')}` }],
    };
  }
  return {
    ruleId: 'motive-foreshadowing',
    status: 'warn',
    details: [
      { message: `未在前文发现完整的动机提示，请在前两章补齐：${missingTokens.slice(0, 5).join('、') || '关键关键词'}` },
      ...(suspectMissing.length > 0 ? suspectMissing.map((msg) => ({ message: msg })) : []),
    ],
  };
}
function normalizeTimelineTime(value?: string): string | null {
  if (!value) return null;
  const match = value.match(/(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hour = match[1].padStart(2, '0');
  const minute = match[2];
  return `${hour}:${minute}`;
}
function validateChapterTimeTags(
  outline: DetectiveOutline,
  storyDraft: DetectiveStoryDraft,
): ValidationRuleResult {
  const chapters = storyDraft?.chapters ?? [];
  if (chapters.length === 0) {
    return {
      ruleId: 'chapter-time-tags',
      status: 'pass',
      details: [{ message: '缺少章节数据，跳过时间提示检查' }],
    };
  }
  const timeline = outline?.timeline ?? [];
  const timesByChapter = new Map<number, Set<string>>();
  timeline.forEach((event) => {
    const hhmm = normalizeTimelineTime(event?.time);
    if (!hhmm) return;
    const participants = Array.isArray(event?.participants) ? event.participants : [];
    participants.forEach((participant) => {
      const match = participant?.toString().match(/Chapter\s*(\d+)/i);
      if (!match) return;
      const index = Number.parseInt(match[1], 10) - 1;
      if (Number.isNaN(index) || index < 0) return;
      if (!timesByChapter.has(index)) {
        timesByChapter.set(index, new Set());
      }
      timesByChapter.get(index)!.add(hhmm);
    });
  });
  if (timesByChapter.size === 0) {
    return {
      ruleId: 'chapter-time-tags',
      status: 'pass',
      details: [{ message: '时间线未指向具体章节，跳过检查' }],
    };
  }
  const missing: { chapter: string; times: string[] }[] = [];
  timesByChapter.forEach((times, index) => {
    const chapter = chapters[index];
    if (!chapter) return;
    const combinedText = `${chapter.title || ''}
${chapter.summary || ''}
${chapter.content || ''}`;
    const found = Array.from(times).some((time) => combinedText.includes(time));
    if (!found) {
      missing.push({ chapter: chapter.title || `Chapter ${index + 1}`, times: Array.from(times) });
    }
  });
  if (missing.length === 0) {
    return {
      ruleId: 'chapter-time-tags',
      status: 'pass',
      details: [{ message: '章节时间提示与时间线基本一致' }],
    };
  }
  return {
    ruleId: 'chapter-time-tags',
    status: 'warn',
    details: missing.map((item) => ({
      message: `章节「${item.chapter}」缺少时间提示：${item.times.join('、')}`,
    })),
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
function parseChapterIndex(label?: string | null): number | null {
  if (!label) return null;
  const match = String(label).match(/Chapter\s*(\d+)/i);
  if (!match) return null;
  const idx = Number.parseInt(match[1], 10);
  if (Number.isNaN(idx)) return null;
  return idx - 1;
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
  const targetClues = (outline?.clueMatrix ?? []).filter(
    (clue) => clue?.clue && clue.mustForeshadow !== false,
  );
  if (targetClues.length === 0 || chapters.length === 0) {
    return {
      ruleId: 'fairness-min-exposures',
      status: 'pass',
      details: [{ message: '未声明必须铺垫的线索，跳过曝光次数校验' }],
    };
  }
  const minExposure = 2; // 默认阈值
  const exposure: Record<string, number> = {};
  targetClues.forEach((clue) => {
    exposure[normalizeClueName(clue.clue!)] = 0;
  });
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
  if (lacking.length === 0) {
    return {
      ruleId: 'fairness-min-exposures',
      status: 'pass',
      details: [{ message: `所有必需线索铺垫次数≥${minExposure}` }],
    };
  }
  return {
    ruleId: 'fairness-min-exposures',
    status: 'warn',
    details: [{ message: `以下线索铺垫次数不足：${lacking.join('、')}`, meta: { exposure, minExposure } }],
  };
}
function validateTimelineFromText(
  outline: DetectiveOutline,
  storyDraft: DetectiveStoryDraft,
): ValidationRuleResult {
  const chapters = storyDraft?.chapters ?? [];
  if (chapters.length === 0) return { ruleId: 'timeline-from-text', status: 'warn', details: [{ message: '缺少章节，无法抽取时间' }] };
  const timeRegex = /(^|[^0-9])([0-2]?\d):([0-5]\d)(?=[^0-9]|$)/g;
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
  const mechanismText = (outline?.centralTrick?.mechanism || outline?.centralTrick?.summary || '').toLowerCase();
  const storyText = (storyDraft?.chapters || []).map((c) => c.content || '').join('\n').toLowerCase();
  const keywordGroups = Object.entries(DETECTIVE_MECHANISM_GROUPS).map(([id, cfg]) => ({
    id,
    triggers: cfg.triggers,
    requires: cfg.requires,
  }));
  const includes = (source: string, token: string) => source.includes(token.toLowerCase());
  const collectKeywords = (keywords: readonly string[]) =>
    keywords.filter((keyword) => includes(mechanismText, keyword) || includes(storyText, keyword));
  const scoredGroups = keywordGroups
    .map((group) => {
      const triggerHits = collectKeywords(group.triggers).length;
      const requireHits = collectKeywords(group.requires).length;
      return { group, triggerHits, requireHits };
    })
    .filter((entry) => entry.triggerHits > 0);
  if (scoredGroups.length > 0) {
    scoredGroups.sort((a, b) => {
      if (b.triggerHits !== a.triggerHits) return b.triggerHits - a.triggerHits;
      return b.requireHits - a.requireHits;
    });
    const top = scoredGroups[0];
    const matched = collectKeywords(top.group.requires);
    if (matched.length >= Math.min(2, top.group.requires.length)) {
      return {
        ruleId: 'device-feasibility',
        status: 'pass',
        details: [
          {
            message: '中心奇迹具备基本可行性的文本支撑',
            meta: { scenario: top.group.id, matchedKeywords: matched },
          },
        ],
      };
    }
    const missing = top.group.requires.filter((keyword) => !matched.includes(keyword));
    return {
      ruleId: 'device-feasibility',
      status: 'warn',
      details: [
        {
          message: '中心奇迹缺少关键可行性要素描述，建议补充具体装置或原理',
          meta: { scenario: top.group.id, missing },
        },
      ],
    };
  }
  const genericKeywords = ['装置', '机关', '结构', '设备', '实验', '工程'];
  const genericMatched = collectKeywords(genericKeywords);
  if (genericMatched.length >= 1) {
    return {
      ruleId: 'device-feasibility',
      status: 'pass',
      details: [
        {
          message: '中心奇迹包含基础装置或工程描述',
          meta: { matchedKeywords: genericMatched },
        },
      ],
    };
  }

  return {
    ruleId: 'device-feasibility',
    status: 'warn',
    details: [
      {
        message: '中心奇迹描述偏抽象，建议补充关键装置或科学原理以证明可行性',
        meta: { mechanismSample: outline?.centralTrick?.mechanism },
      },
    ],
  };
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

function estimateDialogueCount(content: string): number {
  if (!content) return 0;
  const matches = content.match(/[「“"']/g);
  if (!matches) return 0;
  // 两个引号对应一轮对白，取整
  return Math.floor(matches.length / 2) || matches.length;
}

function estimateSensoryCount(content: string): number {
  if (!content) return 0;
  const matches = content.match(/声|响|音|风|潮|水|湿|冷|热|光|亮|暗|味|香|腥|咸|触|震|暖|凉|沙/g);
  return matches ? matches.length : 0;
}

function validateDialogueDensity(storyDraft: DetectiveStoryDraft): ValidationRuleResult {
  const chapters = storyDraft?.chapters ?? [];
  if (chapters.length === 0) {
    return {
      ruleId: 'dialogue-density',
      status: 'warn',
      details: [{ message: '缺少章节数据，无法统计对白' }],
    };
  }
  const minDialogues = 4;
  const insufficient: Array<{ chapter: string; dialogues: number }> = [];
  chapters.forEach((chapter, index) => {
    const count = estimateDialogueCount(chapter.content || '');
    if (count < minDialogues) {
      insufficient.push({ chapter: chapter.title || `Chapter ${index + 1}`, dialogues: count });
    }
  });
  if (insufficient.length === 0) {
    return {
      ruleId: 'dialogue-density',
      status: 'pass',
      details: [{ message: `所有章节对白轮次均≥${minDialogues}` }],
    };
  }
  return {
    ruleId: 'dialogue-density',
    status: 'warn',
    details: insufficient.map((item) => ({
      message: `章节「${item.chapter}」对白轮次仅 ${item.dialogues}，建议增加问答互动`,
      meta: item,
    })),
  };
}
export type { Stage4ValidationOptions };
