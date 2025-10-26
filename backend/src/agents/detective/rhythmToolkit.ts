import type { DetectiveOutline, DetectiveStoryDraft, DetectiveChapter } from '@storyapp/shared';

export interface NarrativeRhythmMetrics {
  suspenseEndingCoverage: number;
  climaxChapters: string[];
  sensoryPerThousandWords: number;
  averageChapterWords: number;
  figurativeReplacements: number;
}

export interface NarrativeRhythmReport {
  metrics: NarrativeRhythmMetrics;
  suspenseChapters: string[];
  notes: string[];
  draft?: DetectiveStoryDraft;
}

const FIGURATIVE_REPLACEMENTS: Array<[RegExp, string]> = [
  [/心里一紧/g, '心弦倏然绷紧'],
  [/吓得脸色发白/g, '吓得脸色像被霜雪覆上'],
  [/紧张得直冒汗/g, '紧张得额角沁出细汗'],
  [/黑得伸手不见五指/g, '黑得仿佛墨汁倾泻'],
];

const SENSORY_KEYWORDS = ['闻到', '气味', '触摸', '凉意', '暖意', '光线', '声音', '咔嗒', '嘀嗒', '香味'];

function countWords(chapter: DetectiveChapter): number {
  if (typeof chapter.wordCount === 'number' && chapter.wordCount > 0) {
    return chapter.wordCount;
  }
  const text = `${chapter.summary || ''}${chapter.content || ''}`;
  return Math.ceil(text.replace(/\s+/g, '').length);
}

function detectSuspenseEnding(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  return /[？\?…]$/.test(trimmed) || /未.*?解|谁|怎么|为何/.test(trimmed.slice(-12));
}

function countSensoryIndicators(text: string): number {
  return SENSORY_KEYWORDS.reduce((total, keyword) => total + (text.includes(keyword) ? 1 : 0), 0);
}

function applyFigurativeReplacements(chapters: DetectiveChapter[]): { chapters: DetectiveChapter[]; replacements: number } {
  let total = 0;
  const updated = chapters.map((chapter) => {
    let content = chapter.content || '';
    FIGURATIVE_REPLACEMENTS.forEach(([pattern, replacement]) => {
      if (pattern.test(content)) {
        content = content.replace(pattern, () => {
          total += 1;
          return replacement;
        });
      }
    });
    return { ...chapter, content };
  });
  return { chapters: updated, replacements: total };
}

export function analyzeNarrativeRhythm(
  outline: DetectiveOutline,
  draft: DetectiveStoryDraft,
  options?: { applyPolish?: boolean },
): NarrativeRhythmReport {
  const chapters = Array.isArray(draft.chapters) ? draft.chapters.map((chapter) => ({ ...chapter })) : [];
  if (chapters.length === 0) {
    return {
      metrics: {
        suspenseEndingCoverage: 0,
        climaxChapters: [],
        sensoryPerThousandWords: 0,
        averageChapterWords: 0,
        figurativeReplacements: 0,
      },
      suspenseChapters: [],
      notes: ['草稿缺少章节，未进行节奏分析'],
      draft,
    };
  }

  const suspenseFlags: boolean[] = [];
  const wordsPerChapter: number[] = [];
  let sensoryCount = 0;
  let totalWords = 0;

  chapters.forEach((chapter) => {
    const ending = detectSuspenseEnding((chapter.content || '').split('\n').pop() || '');
    suspenseFlags.push(ending);
    const words = countWords(chapter);
    wordsPerChapter.push(words);
    totalWords += words;
    sensoryCount += countSensoryIndicators(`${chapter.summary || ''} ${chapter.content || ''}`);
  });

  const suspenseChapters = chapters
    .map((chapter, idx) => ({ chapter, idx }))
    .filter((entry) => suspenseFlags[entry.idx])
    .map((entry) => entry.chapter.title || `Chapter ${entry.idx + 1}`);

  const averageWords = totalWords / chapters.length;
  const climaxCandidates = chapters
    .map((chapter, idx) => ({
      title: chapter.title || `Chapter ${idx + 1}`,
      words: wordsPerChapter[idx],
      ratio: wordsPerChapter[idx] / (averageWords || 1),
    }))
    .filter((entry) => entry.ratio >= 1.1)
    .map((entry) => entry.title);

  let figurativeReplacements = 0;
  let polishedChapters = chapters;
  if (options?.applyPolish) {
    const result = applyFigurativeReplacements(chapters);
    figurativeReplacements = result.replacements;
    polishedChapters = result.chapters;
  }

  const suspenseEndingCoverage = suspenseFlags.filter(Boolean).length / chapters.length;
  const sensoryDensity = totalWords > 0 ? (sensoryCount / totalWords) * 1000 : 0;

  const notes: string[] = [];
  if (suspenseEndingCoverage < 0.7) {
    notes.push('章节悬念覆盖率低于 70%，可在章节结尾补充疑问或未决描述');
  }
  if (climaxCandidates.length === 0) {
    notes.push('未检测到高于平均 10% 的高潮章节，考虑在关键幕增加篇幅或张力');
  }
  if (sensoryDensity < 5) {
    notes.push('感官描写密度低于 5/千字，建议适度加入嗅觉/触觉描写');
  }

  return {
    metrics: {
      suspenseEndingCoverage: Number(suspenseEndingCoverage.toFixed(2)),
      climaxChapters: climaxCandidates,
      sensoryPerThousandWords: Number(sensoryDensity.toFixed(2)),
      averageChapterWords: Math.round(averageWords),
      figurativeReplacements,
    },
    suspenseChapters,
    notes,
    draft: {
      ...draft,
      chapters: polishedChapters,
    },
  };
}
