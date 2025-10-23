import type {
  DetectiveOutline,
  DetectiveStoryDraft,
  ClueGraph,
  ClueNode,
  DenouementScript,
} from '@storyapp/shared';

function normalize(text: string | undefined | null): string {
  return (text ?? '').trim();
}

function collectTrueClues(graph: ClueGraph): ClueNode[] {
  return graph.nodes.filter(
    (node) => node.kind === 'clue' && (!node.type || node.type === 'true'),
  );
}

function laterChapterText(draft: DetectiveStoryDraft): string {
  if (!Array.isArray(draft?.chapters) || draft.chapters.length === 0) {
    return '';
  }
  const startIndex = Math.floor(draft.chapters.length * 0.66);
  return draft.chapters
    .slice(startIndex)
    .map((chapter) => chapter?.content || '')
    .join('\n');
}

export function assertPlantPayoffCompleteness(
  graph: ClueGraph,
  draft: DetectiveStoryDraft,
): string[] {
  const issues: string[] = [];
  const laterText = laterChapterText(draft);
  if (!laterText) {
    return issues;
  }
  const clues = collectTrueClues(graph);
  clues.forEach((clue) => {
    const clueText = normalize(clue.text);
    if (!clueText) return;
    const matched = laterText.includes(clueText);
    if (!matched) {
      issues.push(`线索「${clueText.slice(0, 24)}」在结局段落未被明确点名，请补写 Payoff。`);
    }
  });
  return issues;
}

function pickPrimaryInference(graph: ClueGraph): string | null {
  const inferenceNodes = graph.nodes.filter((node) => node.kind === 'inference');
  if (inferenceNodes.length === 0) {
    return null;
  }
  const ranked = [...inferenceNodes].sort((a, b) => {
    const aEdges = graph.edges.filter((edge) => edge.from === a.id).length;
    const bEdges = graph.edges.filter((edge) => edge.from === b.id).length;
    return bEdges - aEdges;
  });
  return ranked[0]?.text ?? null;
}

function inferLastPush(outline: DetectiveOutline): DenouementScript['lastPush'] {
  const fairnessNotes: string[] = Array.isArray(outline?.centralTrick?.fairnessNotes)
    ? (outline?.centralTrick?.fairnessNotes as string[])
    : [];
  const mechanism = normalize(outline?.centralTrick?.mechanism).toLowerCase();
  if (fairnessNotes.some((note) => /心理|心态|性格/.test(note)) || mechanism.includes('心理')) {
    return 'psychology';
  }
  if (mechanism.includes('实验') || mechanism.includes('机关') || mechanism.includes('试验')) {
    return 'mechanism';
  }
  return 'experiment';
}

export function planDenouement(
  outline: DetectiveOutline,
  draft: DetectiveStoryDraft,
  graph: ClueGraph,
): DenouementScript {
  const clues = collectTrueClues(graph);
  const recapBullets = clues.slice(0, 6).map((clue) => `• ${normalize(clue.text) || '关键线索待补充'}`);

  const suspects = Array.isArray(outline?.characters)
    ? outline.characters.filter((character) =>
        typeof character?.role === 'string' && /suspect/i.test(character.role),
      )
    : [];

  const eliminationOrder = suspects.map((suspect) => {
    const suspectName = suspect?.name || '未知嫌疑人';
    const supportingClues = clues
      .filter((clue) => normalize(clue.text).includes(suspectName))
      .map((clue) => normalize(clue.text));
    const reason =
      supportingClues.length > 0
        ? supportingClues.slice(0, 2).join('；')
        : '需要补写用于排除的矛盾线索';
    return {
      suspect: suspectName,
      reason,
    };
  });

  const finalContradiction =
    pickPrimaryInference(graph) ||
    normalize(outline?.centralTrick?.summary) ||
    '请明确写出唯一指向真相的矛盾点';

  const lastPush = inferLastPush(outline);

  return {
    recapBullets,
    eliminationOrder,
    finalContradiction,
    lastPush,
  };
}
