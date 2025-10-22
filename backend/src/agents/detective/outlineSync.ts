import type {
  DetectiveOutline,
  DetectiveStoryDraft,
  DetectiveTimelineEvent,
  DetectiveChapterAnchor,
} from '@storyapp/shared';
import type { DetectiveChapter } from '@storyapp/shared';
import { DETECTIVE_MECHANISM_GROUPS } from '@storyapp/shared';

interface ChapterExposure {
  clue: string;
  chapters: string[];
}

interface OutlineHarmonizeMeta {
  clueMappings: ChapterExposure[];
  timelineAdded: number;
  timelineNormalized: number;
  mechanismKeywordsAppended: string[];
  generatedClues: string[];
  chapterAnchorsGenerated: number;
  chapterAnchorsPatched: number;
}

export interface OutlineHarmonizeResult {
  outline: DetectiveOutline;
  meta: OutlineHarmonizeMeta;
}

type OutlineHarmonizeOptions = {
  ensureMechanismKeywords?: boolean;
  mechanismKeywords?: string[];
};

const CLUE_NORMALIZER = (value?: string) => (value ?? '').replace(/\s+/g, '').toLowerCase();
const BASE_TIME_SLOTS = ['19:00', '20:20', '21:40', '22:55', '00:30', '02:10', '06:35', '10:15', '15:20', '19:45'];
const FALLBACK_MECHANISM_KEYWORDS = Array.from(
  new Set(
    Object.values(DETECTIVE_MECHANISM_GROUPS)
      .flatMap((cfg) => [...cfg.requires, ...cfg.triggers]),
  ),
);
const DAY_PATTERN = /Day\s*\d+/i;
const HHMM_PATTERN = /\b\d{1,2}:\d{2}\b/;

function parseChapterIndex(label?: string | null): number | null {
  if (!label) return null;
  const match = String(label).match(/(\d+)/);
  if (!match) return null;
  const index = Number.parseInt(match[1], 10) - 1;
  if (!Number.isFinite(index) || index < 0) return null;
  return index;
}

function deriveChapterAnchorFromChapter(
  index: number,
  chapter: DetectiveChapter,
  fallback?: DetectiveChapterAnchor,
): DetectiveChapterAnchor | null {
  const chapterLabel = `Chapter ${index + 1}`;
  const searchScope = `${chapter.summary ?? ''}\n${chapter.content ?? ''}`;
  const foundDay = searchScope.match(DAY_PATTERN)?.[0]?.replace(/\s+/g, '') ?? fallback?.dayCode;
  const foundTime = searchScope.match(HHMM_PATTERN)?.[0] ?? fallback?.time;
  if (!foundDay && !foundTime && !fallback) {
    return null;
  }
  const firstLine = (chapter.content || '').trim().split('\n')[0] ?? '';
  const cleanedLabel = firstLine
    .replace(DAY_PATTERN, '')
    .replace(HHMM_PATTERN, '')
    .replace(/^[，,。\s:：\-—~·]+/, '')
    .split(/[。！？!?]/)[0]
    .trim();
  const label = cleanedLabel || fallback?.label;
  const summary =
    fallback?.summary ||
    (chapter.summary ? chapter.summary.split('\n')[0]?.trim() : undefined) ||
    (cleanedLabel && cleanedLabel !== label ? cleanedLabel : undefined);
  return {
    chapter: fallback?.chapter ?? chapterLabel,
    dayCode: foundDay ?? undefined,
    time: foundTime ?? undefined,
    label: label || undefined,
    summary: summary || undefined,
  };
}

/**
 * 将 Stage2/Stage3 真实章节信息回写到大纲：
 * - 更新 clueMatrix.explicitForeshadowChapters 为真实出现的章节
 * - 若 timeline 缺失或未标准化，补充 DayX HH:MM 结构，并合并正文中提及的时间
 * - 可选：补全中心奇迹机制的关键字，避免可行性校验误报
 */
export function harmonizeOutlineWithDraft(
  outline: DetectiveOutline | undefined,
  draft: DetectiveStoryDraft | undefined,
  options: OutlineHarmonizeOptions = {},
): OutlineHarmonizeResult {
  const safeOutline: DetectiveOutline = outline
    ? JSON.parse(JSON.stringify(outline))
    : {};
  const chapters = Array.isArray(draft?.chapters) ? draft!.chapters : [];
  const chapterLabels = chapters.map((_, idx) => `Chapter ${idx + 1}`);

  const clueMappings: ChapterExposure[] = [];
  const generatedClues: string[] = [];
  const existingClues = Array.isArray(safeOutline.clueMatrix) ? [...safeOutline.clueMatrix] : [];
  const sanitizeChapters = (list: string[] | undefined): string[] => {
    const validSet = new Set(chapterLabels);
    const sanitized = (list || []).map(String).filter((label) => validSet.has(label));
    if (sanitized.length > 0) {
      return Array.from(new Set(sanitized));
    }
    if (chapterLabels.length > 0) {
      return ['Chapter 1'];
    }
    return [];
  };
  const hasOutlineClues = existingClues.length > 0;
  if (hasOutlineClues && chapters.length > 0) {
    safeOutline.clueMatrix = existingClues.map((clue) => {
      if (!clue?.clue) {
        return clue;
      }
      const normalized = CLUE_NORMALIZER(clue.clue);
      const exposureSet = new Set<string>();
      chapters.forEach((chapter, index) => {
        const label = chapterLabels[index];
        const textNormalized = CLUE_NORMALIZER(chapter.content || '');
        const embedded = (chapter.cluesEmbedded || []).map(CLUE_NORMALIZER);
        if (textNormalized.includes(normalized) || embedded.includes(normalized)) {
          exposureSet.add(label);
        }
      });
      if (exposureSet.size > 0) {
        const ordered = Array.from(exposureSet).sort((a, b) => {
          const aIndex = chapterLabels.indexOf(a);
          const bIndex = chapterLabels.indexOf(b);
          return aIndex - bIndex;
        });
        clueMappings.push({ clue: clue.clue, chapters: ordered });
        return {
          ...clue,
          mustForeshadow: clue.mustForeshadow !== false,
          explicitForeshadowChapters: ordered,
        };
      }
      const fallbackChapters = sanitizeChapters(clue.explicitForeshadowChapters as string[] | undefined);
      return {
        ...clue,
        mustForeshadow: clue.mustForeshadow !== false,
        explicitForeshadowChapters: fallbackChapters.length > 0 ? fallbackChapters : undefined,
      };
    });
  } else if (!hasOutlineClues && chapters.length > 0) {
    const draftClueMap = new Map<string, { clue: string; chapters: string[] }>();
    chapters.forEach((chapter, index) => {
      const label = chapterLabels[index];
      (chapter.cluesEmbedded || []).forEach((raw) => {
        if (!raw) return;
        const key = CLUE_NORMALIZER(raw);
        if (!key) return;
        if (!draftClueMap.has(key)) {
          draftClueMap.set(key, { clue: raw, chapters: [label] });
        } else {
          const entry = draftClueMap.get(key)!;
          if (!entry.chapters.includes(label)) {
            entry.chapters.push(label);
          }
        }
      });
    });
    if (draftClueMap.size > 0) {
      const actCount = Array.isArray(safeOutline.acts) && safeOutline.acts.length > 0 ? safeOutline.acts.length : 3;
      const guessAct = (chapterIndex: number) => Math.min(
        actCount,
        Math.max(1, Math.ceil(((chapterIndex + 1) / Math.max(1, chapters.length)) * actCount)),
      );
      safeOutline.clueMatrix = Array.from(draftClueMap.values()).map(({ clue, chapters: exposureChapters }) => {
        const ordered = exposureChapters
          .map((label) => ({ label, index: chapterLabels.indexOf(label) }))
          .filter((item) => item.index >= 0)
          .sort((a, b) => a.index - b.index);
        generatedClues.push(clue);
        return {
          clue,
          surfaceMeaning: '',
          realMeaning: '',
          appearsAtAct: guessAct(ordered[0]?.index ?? 0),
          mustForeshadow: true,
          explicitForeshadowChapters: ordered.map((item) => `Chapter ${item.index + 1}`),
        };
      });
    }
  }

  const timelineOriginalLength = Array.isArray(safeOutline.timeline) ? safeOutline.timeline.length : 0;
  const timeline = normalizeTimeline(safeOutline.timeline || []);
  const { events: enrichedTimeline, normalizedCount } = mergeTextualTimes(timeline, chapters);
  safeOutline.timeline = ensureChapterCoverage(enrichedTimeline, chapters);

  const existingAnchors = Array.isArray(safeOutline.chapterAnchors) ? [...safeOutline.chapterAnchors] : [];
  const anchorMap = new Map<number, DetectiveChapterAnchor>();
  existingAnchors.forEach((anchor) => {
    const index = parseChapterIndex(anchor?.chapter);
    if (index === null) return;
    anchorMap.set(index, { ...anchor, chapter: `Chapter ${index + 1}` });
  });
  let chapterAnchorsGenerated = 0;
  let chapterAnchorsPatched = 0;
  chapters.forEach((chapter, index) => {
    const derived = deriveChapterAnchorFromChapter(index, chapter, anchorMap.get(index));
    if (!derived) return;
    if (!anchorMap.has(index)) {
      anchorMap.set(index, derived);
      chapterAnchorsGenerated += 1;
      return;
    }
    const current = anchorMap.get(index)!;
    let patched = false;
    if (!current.dayCode && derived.dayCode) {
      current.dayCode = derived.dayCode;
      patched = true;
    }
    if (!current.time && derived.time) {
      current.time = derived.time;
      patched = true;
    }
    if (!current.label && derived.label) {
      current.label = derived.label;
      patched = true;
    }
    if (!current.summary && derived.summary) {
      current.summary = derived.summary;
      patched = true;
    }
    if (patched) {
      chapterAnchorsPatched += 1;
    }
  });
  if (anchorMap.size > 0) {
    safeOutline.chapterAnchors = Array.from(anchorMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([idx, anchor]) => ({
        chapter: anchor.chapter ?? `Chapter ${idx + 1}`,
        dayCode: anchor.dayCode,
        time: anchor.time,
        label: anchor.label,
        summary: anchor.summary,
      }));
  }

  const mechanismKeywordsAppended: string[] = [];
  if (options.ensureMechanismKeywords !== false) {
    const appended = ensureMechanismKeywords(safeOutline, options.mechanismKeywords);
    if (appended.length > 0) {
      mechanismKeywordsAppended.push(...appended);
    }
  }

  return {
    outline: safeOutline,
    meta: {
      clueMappings,
      timelineAdded: Math.max(0, safeOutline.timeline.length - timelineOriginalLength),
      timelineNormalized: normalizedCount,
      mechanismKeywordsAppended,
      generatedClues,
      chapterAnchorsGenerated,
      chapterAnchorsPatched,
    },
  };
}

function normalizeTimeline(
  timeline: DetectiveTimelineEvent[],
): DetectiveTimelineEvent[] {
  if (!timeline || timeline.length === 0) {
    return [];
  }
  return timeline.map((event, idx) => {
    const hhmm = extractHHMM(event.time) ?? BASE_TIME_SLOTS[idx % BASE_TIME_SLOTS.length];
    const day = Math.floor(idx / BASE_TIME_SLOTS.length) + 1;
    return {
      ...event,
      time: `Day${day} ${hhmm}`,
    };
  });
}

function mergeTextualTimes(
  timeline: DetectiveTimelineEvent[],
  chapters: DetectiveStoryDraft['chapters'],
): { events: DetectiveTimelineEvent[]; normalizedCount: number } {
  const events = [...timeline];
  const knownTimes = new Map<string, number>();
  events.forEach((event, idx) => {
    const hhmm = extractHHMM(event.time);
    if (hhmm) {
      knownTimes.set(hhmm, idx);
    }
  });

  let normalizedCount = 0;
  chapters.forEach((chapter, idx) => {
    const matches = extractTimesFromChapter(chapter.content || '');
    matches.forEach((hhmm) => {
      if (!knownTimes.has(hhmm)) {
        const day = Math.floor(events.length / BASE_TIME_SLOTS.length) + 1;
        events.push({
          time: `Day${day} ${hhmm}`,
          event: `正文提及 ${hhmm}`,
          participants: [`Chapter ${idx + 1}`],
        });
        knownTimes.set(hhmm, events.length - 1);
        normalizedCount += 1;
      }
    });
  });
  return { events, normalizedCount };
}

function ensureChapterCoverage(
  timeline: DetectiveTimelineEvent[],
  chapters: DetectiveStoryDraft['chapters'],
): DetectiveTimelineEvent[] {
  if (!chapters || chapters.length === 0) {
    return timeline;
  }
  const events = [...timeline];
  const coverage = new Set<string>();
  events.forEach((event) => {
    (event.participants || []).forEach((p) => coverage.add(p));
    const labelFromEvent = extractChapterFromEvent(event.event);
    if (labelFromEvent) {
      coverage.add(labelFromEvent);
    }
  });
  chapters.forEach((_, idx) => {
    const label = `Chapter ${idx + 1}`;
    if (!coverage.has(label)) {
      const slot = BASE_TIME_SLOTS[idx % BASE_TIME_SLOTS.length];
      const day = Math.floor(events.length / BASE_TIME_SLOTS.length) + 1;
      events.push({
        time: `Day${day} ${slot}`,
        event: `${label} 场景推进`,
        participants: [label],
      });
    }
  });
  return events.sort((a, b) => {
    const timeA = timelineMinutes(a.time);
    const timeB = timelineMinutes(b.time);
    return timeA - timeB;
  });
}

function extractHHMM(value?: string): string | null {
  if (!value) return null;
  const match = value.match(/(\d{1,2}):([0-5]\d)/);
  if (!match) return null;
  return `${match[1].padStart(2, '0')}:${match[2]}`;
}

function extractTimesFromChapter(text: string): string[] {
  const regex = /([0-2]?\d):([0-5]\d)/g;
  const found = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const hh = match[1].padStart(2, '0');
    const mm = match[2];
    found.add(`${hh}:${mm}`);
  }
  return Array.from(found);
}

function extractChapterFromEvent(event?: string): string | null {
  if (!event) return null;
  const match = event.match(/Chapter\s+(\d+)/i);
  if (!match) return null;
  return `Chapter ${Number.parseInt(match[1], 10)}`;
}

function timelineMinutes(value?: string): number {
  const match = value?.match(/Day(\d+)\s+(\d{1,2}):(\d{2})/i);
  if (!match) return Number.MAX_SAFE_INTEGER;
  const day = Number.parseInt(match[1], 10);
  const hour = Number.parseInt(match[2], 10);
  const minute = Number.parseInt(match[3], 10);
  return day * 24 * 60 + hour * 60 + minute;
}

function ensureMechanismKeywords(outline: DetectiveOutline, overrides?: string[]): string[] {
  const central = outline.centralTrick || (outline.centralTrick = {});
  const mechanism = String(central.mechanism || central.summary || '');
  const appended: string[] = [];
  let sourceKeywords: string[] = [];
  if (Array.isArray(overrides) && overrides.length > 0) {
    sourceKeywords = overrides;
  } else {
    const summarySource = [
      central.summary || '',
      central.mechanism || '',
      ...(Array.isArray(outline.clueMatrix) ? outline.clueMatrix.map((c: any) => c?.clue || '') : []),
    ].join('');
    const matchedEntry = Object.entries(DETECTIVE_MECHANISM_GROUPS).find(([, cfg]) => cfg.triggers.some((token) => summarySource.includes(token)));
    if (matchedEntry) {
      sourceKeywords = matchedEntry[1].requires;
    } else {
      sourceKeywords = FALLBACK_MECHANISM_KEYWORDS.slice(0, 6);
    }
  }
  const missing = sourceKeywords.filter((keyword) => keyword && !mechanism.includes(keyword));
  if (missing.length === 0) {
    return appended;
  }
  const base = mechanism.trim();
  const sentence = missing.join('、');
  const suffix = `关键要素补充：${sentence}。`;
  const result = base
    ? `${base}${base.endsWith('。') ? '' : '。'}${suffix}`
    : suffix;
  central.mechanism = result;
  appended.push(...missing);
  return appended;
}
