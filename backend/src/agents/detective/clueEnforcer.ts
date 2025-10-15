import type { DetectiveOutline, DetectiveStoryDraft, DetectiveChapter } from '@storyapp/shared';

export interface CluePolicyOptions {
  ch1MinClues?: number; // Chapter 1 至少埋多少 mustForeshadow 线索
  minExposures?: number; // 每条线索至少出现次数（正文或 cluesEmbedded 计数）
  ensureFinalRecovery?: boolean; // 在结局逐条回收
  adjustOutlineExpectedChapters?: boolean; // 调整 outline.clueMatrix.explicitForeshadowChapters 以包含 Chapter 1
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
    const hint = `\n【[CLUE: ${clue}]】（轻描淡写的线索露出）`;
    ch.content = (ch.content || '') + hint;
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
  const recoveryLine = `\n【[CLUE: ${clue}] 回收】——在结尾处解释其真实含义与作用。`;
  const norm = normalizeClue(ch.content || '');
  const key = normalizeClue(clue);
  if (!norm.includes(key)) {
    ch.content = (ch.content || '') + recoveryLine;
  }
  const set = new Set([...(ch.cluesEmbedded || [])].map(normalizeClue));
  if (!set.has(key)) {
    ch.cluesEmbedded = [...(ch.cluesEmbedded || []), clue];
  }
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

  return { draft: patchedDraft, outline: patchedOutline, changes };
}
