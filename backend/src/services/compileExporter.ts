import fs from 'fs';
import path from 'path';
import type { DetectiveOutline, DetectiveStoryDraft } from '@storyapp/shared';

function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true });
}

function escapeHtml(s: string): string {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function buildHtmlBook(title: string, draft: DetectiveStoryDraft, outline: DetectiveOutline): string {
  const chapterSections = (draft?.chapters || []).map((ch, idx) => {
    const safeTitle = escapeHtml(ch.title || `Chapter ${idx + 1}`);
    const safeText = escapeHtml(ch.content || '').replace(/\n\s*/g, '<br/>');
    return `
<section>
  <h2>${safeTitle}</h2>
  <article>${safeText}</article>
</section>`;
  }).join('\n');
  const epilogue = buildTrickEpilogue(outline);
  const epilogueSection = epilogue
    ? `
<section>
  <h2>侦探独白</h2>
  <article>${escapeHtml(epilogue).replace(/\n\s*/g, '<br/>')}</article>
</section>`
    : '';

  return [
    '<!doctype html>',
    '<html lang="zh-CN">',
    '<head>',
    '  <meta charset="UTF-8" />',
    `  <title>${escapeHtml(title || '侦探故事')}</title>`,
    '  <style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Noto Sans,Helvetica,Arial;max-width:820px;margin:32px auto;padding:0 16px;line-height:1.7} h1{font-size:24px} h2{font-size:18px;margin:18px 0 6px} section{margin:18px 0;padding-bottom:10px;border-bottom:1px dashed #ddd}</style>',
    '</head>',
    '<body>',
    `  <h1>${escapeHtml(title || '侦探故事')}</h1>`,
    chapterSections,
    epilogueSection,
    '</body>',
    '</html>'
  ].join('\n');
}

function normalizeClueName(value?: string): string {
  return (value ?? '').replace(/\s+/g, '').toLowerCase();
}

function cleanChapterContent(text?: string): string {
  return String(text || '')
    .replace(/【\[CLUE:[^\]]+\]】.*$/gm, '')
    .replace(/【\[CLUE:[^\]]+\]】/g, '')
    .replace(/\[CLUE:[^\]]+\]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function buildTrickEpilogue(outline: DetectiveOutline): string | null {
  const summary = (outline?.centralTrick?.summary || '').trim();
  const mechanism = (outline?.centralTrick?.mechanism || '').trim();
  const fairness = Array.isArray(outline?.centralTrick?.fairnessNotes)
    ? (outline.centralTrick.fairnessNotes as unknown[]).map((note) => String(note || '').trim()).filter(Boolean)
    : [];
  const segments: string[] = [];
  if (summary) segments.push(summary);
  if (mechanism) segments.push(mechanism);
  if (fairness.length) segments.push(`公平线索：${fairness.join('；')}`);
  if (segments.length === 0) return null;
  return segments.join(' ').trim();
}

function buildPlainTextBook(title: string, draft: DetectiveStoryDraft, outline: DetectiveOutline): string {
  const header = `# ${title || '侦探故事'}`;
  const chapters = (draft?.chapters || []).map((ch, idx) => {
    const chapterTitle = ch?.title ? String(ch.title) : `Chapter ${idx + 1}`;
    const body = cleanChapterContent(ch?.content);
    return [`## ${chapterTitle}`, body ? body : '（本章暂无正文）'];
  });
  const lines: string[] = [header, ''];
  chapters.forEach((pair) => {
    lines.push(pair[0]);
    lines.push('');
    lines.push(pair[1]);
    lines.push('');
  });
  const epilogue = buildTrickEpilogue(outline);
  if (epilogue) {
    lines.push('## 侦探独白');
    lines.push('');
    lines.push(epilogue);
    lines.push('');
  }
  return lines.join('\n');
}

function buildInteractivePack(outline: DetectiveOutline, draft: DetectiveStoryDraft) {
  const cast_cards = (outline?.characters || []).map((c: any, i: number) => ({ id: String(i + 1), name: c?.name, role: c?.role, bio: c?.motive || '' }));
  const timeline_view = (outline?.timeline || []).map((e: any) => ({ t: e?.time, event: e?.event }));

  const draftChapters = draft?.chapters || [];
  const clues = outline?.clueMatrix || [];
  const clue_matrix = clues.map((c: any) => {
    const id = c?.clue || 'CLUE';
    const norm = normalizeClueName(id);
    const scenes: string[] = [];
    draftChapters.forEach((ch, idx) => {
      const hasEmbed = (ch?.cluesEmbedded || []).some((x) => normalizeClueName(x) === norm);
      const inText = normalizeClueName(ch?.content || '').includes(norm);
      if (hasEmbed || inText) scenes.push(`Chapter ${idx + 1}`);
    });
    return { clue_id: id, scenes, status: scenes.length ? 'shown' : 'unknown' };
  });

  const quiz = [
    { id: 'Q1', question: '第八声的最合理来源？', options: ['超自然','共振','风','机关'], answer: '共振', explain_scene: 'Chapter 3' }
  ];

  return { cast_cards, clue_matrix, timeline_view, quiz };
}

export async function compileToOutputs(params: {
  projectId: string;
  title: string;
  outline: DetectiveOutline;
  draft: DetectiveStoryDraft;
  baseDir?: string; // defaults to storage/exports
}): Promise<{
  outputDir: string;
  files: { html: string; interactive: string; plain: string };
  urls: { html: string; interactive: string; plain: string };
  plainText: string;
}> {
  const base = params.baseDir || path.resolve(process.cwd(), 'storage/exports');
  const folder = `${params.projectId}-${Date.now()}`;
  const outputDir = path.join(base, folder);
  ensureDir(outputDir);

  const html = buildHtmlBook(params.title, params.draft, params.outline);
  const interactive = JSON.stringify({ interactive_pack: buildInteractivePack(params.outline, params.draft) }, null, 2);
  const plainText = buildPlainTextBook(params.title, params.draft, params.outline);

  const htmlPath = path.join(outputDir, 'book.html');
  const interactivePath = path.join(outputDir, 'interactive.json');
  const plainPath = path.join(outputDir, 'story.txt');
  fs.writeFileSync(htmlPath, html, 'utf8');
  fs.writeFileSync(interactivePath, interactive, 'utf8');
  fs.writeFileSync(plainPath, plainText, 'utf8');

  const htmlUrl = `/static/exports/${folder}/book.html`;
  const interactiveUrl = `/static/exports/${folder}/interactive.json`;
  const plainUrl = `/static/exports/${folder}/story.txt`;

  return {
    outputDir,
    files: { html: htmlPath, interactive: interactivePath, plain: plainPath },
    urls: { html: htmlUrl, interactive: interactiveUrl, plain: plainUrl },
    plainText,
  };
}
