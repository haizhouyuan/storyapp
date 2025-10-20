import type { DetectiveChapter, DetectiveStoryDraft } from '@storyapp/shared';

export function stripClueTags(text?: string): string {
  return String(text || '')
    .replace(/【?\[CLUE:[^\]]+\]】?.*$/gm, '')
    .replace(/【?\[CLUE:[^\]]+\]】?/g, '')
    .replace(/\[CLUE:[^\]]+\]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function resolveChapterTitle(index: number, chapter?: DetectiveChapter | null): string {
  if (chapter?.title) {
    return String(chapter.title);
  }
  return `章节 ${index + 1}`;
}

export function draftToPlainText(draft?: DetectiveStoryDraft | null): string {
  if (!draft || !Array.isArray(draft.chapters)) {
    return '';
  }
  const lines: string[] = [];
  draft.chapters.forEach((chapter, index) => {
    const title = resolveChapterTitle(index, chapter);
    const body = stripClueTags(chapter?.content);
    lines.push(`第${index + 1}章 ${title}`);
    lines.push(body || '（本章暂无正文）');
    lines.push('');
  });
  return lines.join('\n');
}

export function draftToMarkdown(draft?: DetectiveStoryDraft | null): string {
  if (!draft || !Array.isArray(draft.chapters)) {
    return '';
  }
  const lines: string[] = [];
  draft.chapters.forEach((chapter, index) => {
    const title = resolveChapterTitle(index, chapter);
    lines.push(`## 第${index + 1}章 ${title}`);
    lines.push('');
    const body = stripClueTags(chapter?.content);
    lines.push(body || '');
    lines.push('');
  });
  return lines.join('\n');
}
