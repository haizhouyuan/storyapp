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

function buildHtmlBook(title: string, draft: DetectiveStoryDraft): string {
  const chapters = (draft?.chapters || []).map((ch, idx) => {
    const safeTitle = escapeHtml(ch.title || `Chapter ${idx + 1}`);
    const safeText = escapeHtml(ch.content || '').replace(/\n\s*/g, '<br/>');
    return `\n<section>\n  <h2>${safeTitle}</h2>\n  <article>${safeText}</article>\n</section>`;
  }).join('\n');

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
    chapters,
    '</body>',
    '</html>'
  ].join('\n');
}

function normalizeClueName(value?: string): string {
  return (value ?? '').replace(/\s+/g, '').toLowerCase();
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
}): Promise<{ outputDir: string; files: { html: string; interactive: string }; urls: { html: string; interactive: string } }> {
  const base = params.baseDir || path.resolve(process.cwd(), 'storage/exports');
  const folder = `${params.projectId}-${Date.now()}`;
  const outputDir = path.join(base, folder);
  ensureDir(outputDir);

  const html = buildHtmlBook(params.title, params.draft);
  const interactive = JSON.stringify({ interactive_pack: buildInteractivePack(params.outline, params.draft) }, null, 2);

  const htmlPath = path.join(outputDir, 'book.html');
  const interactivePath = path.join(outputDir, 'interactive.json');
  fs.writeFileSync(htmlPath, html, 'utf8');
  fs.writeFileSync(interactivePath, interactive, 'utf8');

  const htmlUrl = `/static/exports/${folder}/book.html`;
  const interactiveUrl = `/static/exports/${folder}/interactive.json`;

  return {
    outputDir,
    files: { html: htmlPath, interactive: interactivePath },
    urls: { html: htmlUrl, interactive: interactiveUrl },
  };
}
