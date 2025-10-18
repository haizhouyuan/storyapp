import type { DetectiveOutline, DetectiveStoryDraft, DetectiveChapter } from '@storyapp/shared';

export interface CluePolicyOptions {
  ch1MinClues?: number; // Chapter 1 至少埋多少 mustForeshadow 线索
  minExposures?: number; // 每条线索至少出现次数（正文或 cluesEmbedded 计数）
  ensureFinalRecovery?: boolean; // 在结局逐条回收
  adjustOutlineExpectedChapters?: boolean; // 调整 outline.clueMatrix.explicitForeshadowChapters 以包含 Chapter 1
  maxRedHerringRatio?: number; // 红鲱鱼占比上限
  maxRedHerringPerChapter?: number; // 单章红鲱鱼最大数量
}

export interface EnforceResult {
  draft: DetectiveStoryDraft;
  outline?: DetectiveOutline;
  changes: Array<{ type: string; clue?: string; chapterIndex?: number; note?: string }>
}

function normalizeClue(value?: string): string {
  return (value || '').replace(/\s+/g, '').toLowerCase();
}

function ensureChapters(draft: DetectiveStoryDraft, target: number): DetectiveStoryDraft {
  const chapters = draft.chapters ? [...draft.chapters] : [];
  const createChapter = (title: string): DetectiveChapter => ({
    title,
    summary: '',
    content: '',
    wordCount: 0,
    cluesEmbedded: [],
    redHerringsEmbedded: [],
  });
  while (chapters.length < target) {
    const idx = chapters.length + 1;
    chapters.push(createChapter(`Chapter ${idx}`));
  }
  return { ...draft, chapters };
}

function countExposures(draft: DetectiveStoryDraft, clueName: string): number {
  const key = normalizeClue(clueName);
  let n = 0;
  for (const ch of draft.chapters || []) {
    const text = normalizeClue(ch.content || '');
    if (text.includes(key)) n += 1;
    const arr = (ch.cluesEmbedded || []).map(normalizeClue);
    if (arr.includes(key)) n += 1;
  }
  return n;
}

function appendClueMention(ch: DetectiveChapter, clue: string, mode: 'mention'|'embed'|'both' = 'both') {
  const additions: string[] = [];
  if (mode === 'mention' || mode === 'both') {
    const hint = `\n侦探暗自记下：${clue}并非巧合。`;
    ch.content = `${(ch.content || '').trimEnd()}\n${hint}`.trim();
    additions.push('mention');
  }
  if (mode === 'embed' || mode === 'both') {
    const set = new Set([...(ch.cluesEmbedded || [])].map(normalizeClue));
    const key = normalizeClue(clue);
    if (!set.has(key)) {
      ch.cluesEmbedded = [...(ch.cluesEmbedded || []), clue];
      additions.push('embed');
    }
  }
  return additions;
}

function ensureFinalRecovery(ch: DetectiveChapter, clue: string) {
  const recoveryLine = `\n侦探在结语中解释：“${clue} 正是揭开谜底的关键。”`;
  const norm = normalizeClue(ch.content || '');
  const key = normalizeClue(clue);
  if (!norm.includes(key)) {
    ch.content = `${(ch.content || '').trimEnd()}\n${recoveryLine}`.trim();
  }
  const set = new Set([...(ch.cluesEmbedded || [])].map(normalizeClue));
  if (!set.has(key)) {
    ch.cluesEmbedded = [...(ch.cluesEmbedded || []), clue];
  }
}

function injectTestimony(
  draft: DetectiveStoryDraft,
  outline: DetectiveOutline,
  changes: EnforceResult['changes'],
  targetChapters = 2,
): DetectiveStoryDraft {
  const chapters = draft.chapters ? [...draft.chapters] : [];
  if (chapters.length === 0) return draft;

  const testimonyNames = ['证人甲', '证人乙', '证人丙'];
  const hasTestimony = (text?: string) => {
    if (!text) return false;
    return /证词|证言|证人|“/.test(text);
  };

  let updated = false;
  const clues = outline?.clueMatrix || [];

  for (let i = 0; i < Math.min(targetChapters, chapters.length); i += 1) {
    const chapter = { ...chapters[i] };
    if (hasTestimony(chapter.content)) {
      chapters[i] = chapter;
      continue;
    }
    const clue = clues[i]?.clue || clues[0]?.clue || '关键线索';
    const witness = testimonyNames[i] || '证人';
    const line = `\n“${witness}：我亲眼看到${clue}出现在案发前后。”侦探立即记录在案。`;
    chapter.content = (chapter.content || '') + line;
    const set = new Set([...(chapter.cluesEmbedded || [])].map(normalizeClue));
    if (!set.has(normalizeClue(clue))) {
      chapter.cluesEmbedded = [...(chapter.cluesEmbedded || []), clue];
    }
    chapters[i] = chapter;
    changes.push({ type: 'testimony_boost', clue, chapterIndex: i });
    updated = true;
  }

  return updated ? { ...draft, chapters } : draft;
}

/**
 * 根据大纲强制线索铺垫与回收：
 * - Chapter 1 至少埋入 ch1MinClues 条 mustForeshadow 线索（[CLUE] + cluesEmbedded）
 * - 每条 mustForeshadow 线索曝光次数至少 minExposures
 * - 结局章节逐条 [CLUE] 回收
 * - 可选：同步调整 outline.explicitForeshadowChapters 以避免“最早出现不在声明章节”的告警
 */
export function enforceCluePolicy(
  outline: DetectiveOutline,
  draft: DetectiveStoryDraft,
  opts: CluePolicyOptions = {},
): EnforceResult {
  const ch1MinClues = Math.max(0, opts.ch1MinClues ?? 2);
  const minExposures = Math.max(1, opts.minExposures ?? 2);
  const ensureRecovery = opts.ensureFinalRecovery !== false; // 默认开启
  const redHerringRatioLimit = typeof opts.maxRedHerringRatio === 'number' ? Math.max(0, Math.min(1, opts.maxRedHerringRatio)) : 0.3;
  const redHerringPerChapterLimit = opts.maxRedHerringPerChapter !== undefined ? Math.max(0, opts.maxRedHerringPerChapter) : undefined;

  let patchedDraft = ensureChapters(draft || { chapters: [] }, 3); // 至少 3 章（开端/中段/结尾）
  const changes: EnforceResult['changes'] = [];

  const must = (outline?.clueMatrix || [])
    .filter((c) => c?.clue && c?.mustForeshadow)
    .map((c) => ({ name: c.clue!, normalized: normalizeClue(c.clue!), item: c }));
  if (must.length === 0) {
    return { draft: patchedDraft, outline, changes };
  }

  // 1) Chapter 1 至少埋入 N 条
  const ch1 = patchedDraft.chapters[0];
  let inserted = 0;
  for (const c of must) {
    if (inserted >= ch1MinClues) break;
    const hasMention = (normalizeClue(ch1.content || '')).includes(c.normalized)
      || (ch1.cluesEmbedded || []).map(normalizeClue).includes(c.normalized);
    if (!hasMention) {
      appendClueMention(ch1, c.name, 'both');
      inserted += 1;
      changes.push({ type: 'ch1_foreshadow', clue: c.name, chapterIndex: 0 });
    }
  }

  // 2) 曝光次数不足的，在 Chapter 2（如有）或 Chapter 1 增补
  const ch2 = patchedDraft.chapters[1] || patchedDraft.chapters[0];
  for (const c of must) {
    let n = countExposures(patchedDraft, c.name);
    while (n < minExposures) {
      appendClueMention(n === 0 ? ch1 : ch2, c.name, 'both');
      n = countExposures(patchedDraft, c.name);
      changes.push({ type: 'exposure_boost', clue: c.name, note: `exposures=${n}` });
      if (n >= minExposures) break;
    }
  }

  // 3) 结局逐条回收
  if (ensureRecovery) {
    const lastIdx = patchedDraft.chapters.length - 1;
    const finalCh = patchedDraft.chapters[lastIdx];
    for (const c of must) {
      ensureFinalRecovery(finalCh, c.name);
      changes.push({ type: 'final_recovery', clue: c.name, chapterIndex: lastIdx });
    }
    const summaryMarker = '侦探总结本案：';
    if (must.length > 0 && !((finalCh.content || '').includes(summaryMarker))) {
      const summaryLines = must.map((c) => {
        const meaning = (c.item?.realMeaning && c.item.realMeaning.trim()) || '揭示真相';
        return `${c.name} → ${meaning}`;
      });
      const summaryParagraph = `\n${summaryMarker}${summaryLines.join('；')}。`;
      finalCh.content = `${(finalCh.content || '').trimEnd()}${summaryParagraph}`.trim();
    }
  }

  // 4) 可选：同步调整 outline 的显式铺垫章节声明，以避免“最早出现不在声明章节”的告警
  let patchedOutline: DetectiveOutline | undefined = outline;
  if (opts.adjustOutlineExpectedChapters) {
    const next = { ...(outline || {}), clueMatrix: [...(outline?.clueMatrix || [])] } as DetectiveOutline;
    next.clueMatrix = (next.clueMatrix || []).map((c) => {
      if (!c?.clue || !c.mustForeshadow) return c;
      const explicitRaw = Array.isArray(c.explicitForeshadowChapters) ? [...c.explicitForeshadowChapters] : [];
      const allowed = new Set(['Chapter 1','Chapter 2','Chapter 3']);
      const explicit = explicitRaw.filter((x) => allowed.has(String(x)));
      if (!explicit.includes('Chapter 1')) explicit.push('Chapter 1');
      return { ...c, explicitForeshadowChapters: explicit };
    });
    patchedOutline = next;
  }

  // 5) 控制红鲱鱼占比/单章数量
  patchedDraft = trimRedHerrings(patchedDraft, redHerringRatioLimit, redHerringPerChapterLimit, changes);
  patchedDraft = injectTestimony(patchedDraft, outline, changes);

  return { draft: patchedDraft, outline: patchedOutline, changes };
}
function computeSignalStats(chapters: DetectiveChapter[]) {
  let clueCount = 0;
  let redCount = 0;
  chapters.forEach((ch) => {
    clueCount += (ch.cluesEmbedded || []).length;
    redCount += (ch.redHerringsEmbedded || []).length;
  });
  const total = clueCount + redCount;
  return {
    clueCount,
    redCount,
    ratio: total === 0 ? 0 : redCount / total,
  };
}

function trimRedHerrings(
  draft: DetectiveStoryDraft,
  ratioLimit: number,
  perChapterLimit: number | undefined,
  changes: EnforceResult['changes'],
): DetectiveStoryDraft {
  const chapters = (draft?.chapters || []).map((ch) => ({
    ...ch,
    redHerringsEmbedded: [...(ch.redHerringsEmbedded || [])],
  }));
  const stats = computeSignalStats(chapters);
  let { ratio } = stats;
  if (ratio <= ratioLimit && !perChapterLimit) {
    return { ...draft, chapters };
  }

  const removeOne = () => {
    let targetIdx = -1;
    let maxCount = 0;
    chapters.forEach((ch, idx) => {
      const count = ch.redHerringsEmbedded?.length || 0;
      if (count > maxCount) {
        maxCount = count;
        targetIdx = idx;
      }
    });
    if (targetIdx === -1 || maxCount === 0) {
      return false;
    }
    const removed = chapters[targetIdx].redHerringsEmbedded!.pop();
    if (removed) {
      changes.push({ type: 'trim_red_herring', clue: removed, chapterIndex: targetIdx });
      return true;
    }
    return false;
  };

  while (ratio > ratioLimit) {
    if (!removeOne()) break;
    ratio = computeSignalStats(chapters).ratio;
  }

  if (perChapterLimit !== undefined && perChapterLimit >= 0) {
    chapters.forEach((ch, idx) => {
      const arr = ch.redHerringsEmbedded || [];
      if (arr.length > perChapterLimit) {
        ch.redHerringsEmbedded = arr.slice(0, perChapterLimit);
        changes.push({ type: 'trim_red_herring_cap', chapterIndex: idx, note: `cap=${perChapterLimit}` });
      }
    });
  }

  return { ...draft, chapters };
}
