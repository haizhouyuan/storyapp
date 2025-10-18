/**
 * 文本分段服务 - 将长文本智能分割为适合 TTS 合成的小段
 * 用于支持长篇故事朗读，避免单次 API 调用超限
 */

export interface TextSegment {
  index: number;
  text: string;
  startOffset: number;
  endOffset: number;
  chapterTitle?: string;
  estimatedDuration: number; // 预估时长（秒）
}

interface Chapter {
  title: string;
  text: string;
}

export class StoryTextSegmenter {
  private maxSegmentLength: number;

  constructor(maxSegmentLength = 1000) {
    this.maxSegmentLength = maxSegmentLength;
  }

  /**
   * 智能分段：优先按章节分，超长章节再按段落分
   */
  segmentStory(fullText: string, chapterMarkers?: string[]): TextSegment[] {
    const segments: TextSegment[] = [];
    let currentOffset = 0;

    // 步骤 1: 按章节标记分割
    const chapters = this.splitByChapters(fullText, chapterMarkers);

    chapters.forEach((chapter) => {
      if (chapter.text.length <= this.maxSegmentLength) {
        // 章节短，直接作为一段
        segments.push({
          index: segments.length,
          text: chapter.text,
          startOffset: currentOffset,
          endOffset: currentOffset + chapter.text.length,
          chapterTitle: chapter.title,
          estimatedDuration: this.estimateDuration(chapter.text),
        });
        currentOffset += chapter.text.length;
      } else {
        // 章节长，按段落拆分
        const paragraphs = this.splitByParagraphs(chapter.text);
        let buffer = '';

        paragraphs.forEach((para) => {
          if (buffer.length + para.length > this.maxSegmentLength && buffer) {
            // 缓冲区满了，保存为一段
            segments.push({
              index: segments.length,
              text: buffer,
              startOffset: currentOffset,
              endOffset: currentOffset + buffer.length,
              chapterTitle: chapter.title,
              estimatedDuration: this.estimateDuration(buffer),
            });
            currentOffset += buffer.length;
            buffer = para;
          } else {
            buffer += para;
          }
        });

        // 保存最后的缓冲区
        if (buffer) {
          segments.push({
            index: segments.length,
            text: buffer,
            startOffset: currentOffset,
            endOffset: currentOffset + buffer.length,
            chapterTitle: chapter.title,
            estimatedDuration: this.estimateDuration(buffer),
          });
          currentOffset += buffer.length;
        }
      }
    });

    return segments;
  }

  /**
   * 按章节标记分割文本
   */
  private splitByChapters(text: string, markers?: string[]): Chapter[] {
    // 检测章节标记：## 第X章 或 Chapter X
    const chapterRegex = /^##\s*第?\s*[0-9一二三四五六七八九十百]+\s*章\s*(.*)$/gm;
    const chapters: Chapter[] = [];
    let lastIndex = 0;
    let match;

    const matches: { index: number; title: string }[] = [];
    while ((match = chapterRegex.exec(text)) !== null) {
      matches.push({
        index: match.index,
        title: match[1]?.trim() || `章节 ${matches.length + 1}`,
      });
    }

    if (matches.length === 0) {
      // 没有章节标记，整篇作为一个章节
      return [{ title: '全文', text: text.trim() }];
    }

    // 按章节分割
    for (let i = 0; i < matches.length; i++) {
      const currentMatch = matches[i];
      const nextMatch = matches[i + 1];

      const chapterText = nextMatch
        ? text.slice(currentMatch.index, nextMatch.index).trim()
        : text.slice(currentMatch.index).trim();

      chapters.push({
        title: currentMatch.title,
        text: chapterText,
      });
    }

    return chapters;
  }

  /**
   * 按段落分割文本
   */
  private splitByParagraphs(text: string): string[] {
    // 按段落分割（中文按句号、问号、感叹号、换行）
    const paragraphs = text.split(/[。！？\n]+/).filter(Boolean);

    return paragraphs.map((p) => {
      const trimmed = p.trim();
      // 恢复句末标点
      if (trimmed && !/[。！？]$/.test(trimmed)) {
        return trimmed + '。';
      }
      return trimmed;
    });
  }

  /**
   * 预估朗读时长
   * 中文朗读速度约 300 字/分钟（5 字/秒）
   */
  private estimateDuration(text: string): number {
    const CHARS_PER_SECOND = 5;
    return Math.ceil(text.length / CHARS_PER_SECOND);
  }
}
