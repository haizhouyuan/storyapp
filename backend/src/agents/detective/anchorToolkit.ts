import type {
  ClueAnchor,
  ClueGraph,
  ClueNode,
  DetectiveStoryDraft,
  DraftAnchorsSummary,
} from '@storyapp/shared';

export interface AnchorMappingResult {
  graph: ClueGraph;
  summary: DraftAnchorsSummary;
}

function cloneNode(node: ClueNode): ClueNode {
  return {
    ...node,
    anchors: node.anchors ? node.anchors.map((anchor) => ({ ...anchor })) : undefined,
  };
}

function buildParagraphIndex(content: string): Array<{ index: number; start: number; end: number; text: string }> {
  const paragraphs: Array<{ index: number; start: number; end: number; text: string }> = [];
  if (!content) return paragraphs;
  const regex = /\n{2,}/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let paragraphIndex = 0;
  while ((match = regex.exec(content)) !== null) {
    const start = lastIndex;
    const end = match.index;
    const text = content.slice(start, end);
    if (text.trim().length > 0) {
      paragraphs.push({ index: paragraphIndex, start, end, text });
      paragraphIndex += 1;
    }
    lastIndex = match.index + match[0].length;
  }
  const tail = content.slice(lastIndex);
  if (tail.trim().length > 0) {
    paragraphs.push({ index: paragraphIndex, start: lastIndex, end: content.length, text: tail });
  }
  return paragraphs;
}

function findAnchorsInChapter(clueText: string, chapterContent: string, chapterIndex: number): ClueAnchor[] {
  if (!clueText || !chapterContent) return [];
  const normalizedNeedle = clueText.trim().toLowerCase();
  if (!normalizedNeedle) return [];
  const normalizedHaystack = chapterContent.toLowerCase();
  const paragraphs = buildParagraphIndex(chapterContent);
  const anchors: ClueAnchor[] = [];
  let searchIndex = normalizedHaystack.indexOf(normalizedNeedle);
  while (searchIndex >= 0) {
    const matchEnd = searchIndex + normalizedNeedle.length;
    const paragraph = paragraphs.find((item) => searchIndex >= item.start && matchEnd <= item.end);
    const paragraphIndex = paragraph ? paragraph.index : 0;
    const paragraphStart = paragraph ? paragraph.start : 0;
    anchors.push({
      chapter: chapterIndex + 1,
      paragraph: paragraphIndex + 1,
      startOffset: searchIndex - paragraphStart,
      endOffset: matchEnd - paragraphStart,
    });
    searchIndex = normalizedHaystack.indexOf(normalizedNeedle, matchEnd);
  }
  return anchors;
}

export function mapAnchorsToDraft(
  graph: ClueGraph | undefined,
  draft: DetectiveStoryDraft | undefined,
): AnchorMappingResult | null {
  if (!graph || !Array.isArray(graph.nodes) || !draft || !Array.isArray(draft.chapters)) {
    return null;
  }

  const chapters = draft.chapters;
  const updatedNodes: ClueNode[] = graph.nodes.map((node) => cloneNode(node));
  let mappedClues = 0;
  let mappedFacts = 0;
  let mappedInferences = 0;
  const unresolvedClues: string[] = [];
  const unresolvedInferences: string[] = [];

  updatedNodes.forEach((node) => {
    if (node.kind !== 'clue' && node.kind !== 'fact' && node.kind !== 'inference') {
      return;
    }
    const anchors: ClueAnchor[] = [];
    chapters.forEach((chapter, chapterIndex) => {
      const chapterAnchors = findAnchorsInChapter(node.text || '', chapter.content || '', chapterIndex);
      anchors.push(...chapterAnchors);
    });
    if (anchors.length > 0) {
      node.anchors = anchors;
      node.anchorStatus = 'resolved';
      switch (node.kind) {
        case 'clue':
          mappedClues += 1;
          break;
        case 'fact':
          mappedFacts += 1;
          break;
        case 'inference':
          mappedInferences += 1;
          break;
        default:
          break;
      }
    } else {
      node.anchors = [];
      node.anchorStatus = node.anchorStatus === 'resolved' ? 'stale' : 'pending';
      if (node.kind === 'clue') {
        unresolvedClues.push(node.id);
      } else if (node.kind === 'inference') {
        unresolvedInferences.push(node.id);
      }
    }
  });

  const summary: DraftAnchorsSummary = {
    chapterCount: chapters.length,
    mappedClues,
    mappedFacts,
    mappedInferences,
    unresolvedClues,
    unresolvedInferences,
    updatedAt: new Date().toISOString(),
  };

  return {
    graph: {
      nodes: updatedNodes,
      edges: graph.edges.map((edge) => ({ ...edge })),
    },
    summary,
  };
}
