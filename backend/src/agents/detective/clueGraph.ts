export const CLUE_GRAPH_VERSION = 'clue-graph.v1';

import type {
  DetectiveClue,
  DetectiveOutline,
  DetectiveTimelineEvent,
  ClueEdge,
  ClueGraph,
  ClueNode,
  ClueType,
  FairPlayReport,
} from '@storyapp/shared';

type TextLike = string | null | undefined;
type CandidateIndex = Map<
  string,
  {
    texts: string[];
    tokens: Set<string>;
    normalized: string[];
  }
>;

function computeTokenJaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  a.forEach((token) => {
    if (b.has(token)) {
      intersection += 1;
    }
  });
  const union = a.size + b.size - intersection;
  if (union <= 0) return 0;
  return intersection / union;
}

function longestCommonSubstringLength(a: string, b: string): number {
  if (!a || !b) return 0;
  const matrix: number[][] = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  let longest = 0;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      if (a[i - 1] === b[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1] + 1;
        if (matrix[i][j] > longest) {
          longest = matrix[i][j];
        }
      }
    }
  }
  return longest;
}

function tokenizeForMatch(text: TextLike): Set<string> {
  const tokens = new Set<string>();
  if (!text) return tokens;
  const raw = String(text).toLowerCase();
  const chineseMatches = raw.match(/[\u4e00-\u9fff]{2,6}/g);
  if (chineseMatches) {
    chineseMatches.forEach((match) => tokens.add(match));
  }
  const wordMatches = raw.match(/[a-z][a-z0-9_-]{3,}/g);
  if (wordMatches) {
    wordMatches.forEach((match) => tokens.add(match));
  }
  const pieces = raw
    .split(/[，。,.;；：:!?！？\s/\\|-]+/)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length >= 2);
  pieces.forEach((piece) => {
    if (/^(\d{1,2}:\d{2})$/.test(piece)) {
      tokens.add(piece);
      return;
    }
    if (/[\u4e00-\u9fff]/.test(piece)) {
      if (piece.length <= 10) {
        tokens.add(piece);
      } else {
        const subMatches = piece.match(/[\u4e00-\u9fff]{2,6}/g);
        subMatches?.forEach((match) => tokens.add(match));
      }
    } else if (piece.length >= 3) {
      tokens.add(piece);
    }
  });
  return tokens;
}

function buildCandidate(texts: string[]): { texts: string[]; tokens: Set<string>; normalized: string[] } {
  const normalized = texts.map((text) => normalizeForMatch(text));
  const tokens = tokenizeForMatch(texts.join(' '));
  return { texts, tokens, normalized };
}


function normalizeForMatch(text: TextLike): string {
  if (!text) return '';
  return String(text)
    .trim()
    .toLowerCase()
    .replace(/[\s\r\n\u3000、，。；：,.!?！？]/g, '');
}

function safeText(text: TextLike, fallback: string): string {
  const normalized = typeof text === 'string' ? text.trim() : '';
  return normalized || fallback;
}

function parseChapterIndex(label?: string | null): number | undefined {
  if (!label) return undefined;
  const match = String(label).match(/(\d+)/);
  if (!match) return undefined;
  const index = Number.parseInt(match[1], 10);
  if (!Number.isFinite(index) || index <= 0) return undefined;
  return index;
}

function extractChapterHint(...sources: TextLike[]): number | undefined {
  for (const source of sources) {
    if (!source) continue;
    const normalized = String(source);
    const hint = parseChapterIndex(normalized);
    if (hint !== undefined) {
      return hint;
    }
  }
  return undefined;
}

type ChapterCounterKey = number | 'g';

function nextCounter(counters: Map<ChapterCounterKey, number>, chapterHint?: number): number {
  const key: ChapterCounterKey = chapterHint ?? 'g';
  const current = counters.get(key) ?? 0;
  const next = current + 1;
  counters.set(key, next);
  return next;
}

function createClueId(counter: number, chapterHint?: number): string {
  return chapterHint ? `c:${chapterHint}-${counter}` : `c:g-${counter}`;
}

function createFactId(counter: number, chapterHint?: number): string {
  return chapterHint ? `f:${chapterHint}-${counter}` : `f:g-${counter}`;
}

function createInferenceId(text: string, index: number): string {
  const normalized = normalizeForMatch(text);
  if (!normalized) {
    return `i:${index + 1}`;
  }
  let hash = 0;
  const upperBound = Math.min(normalized.length, 24);
  for (let i = 0; i < upperBound; i += 1) {
    hash = (hash * 31 + normalized.charCodeAt(i)) >>> 0;
  }
  return `i:${hash.toString(36)}`;
}

function buildClueNodes(clues: DetectiveClue[] | undefined): { nodes: ClueNode[]; textIndex: CandidateIndex } {
  if (!Array.isArray(clues) || clues.length === 0) {
    return { nodes: [], textIndex: new Map() };
  }
  const textIndex: CandidateIndex = new Map();
  const counters = new Map<ChapterCounterKey, number>();
  const nodes = clues.map((clue, idx) => {
    const clueType: ClueType = clue.isRedHerring ? 'red_herring' : 'true';
    const chapterHint = Array.isArray(clue.explicitForeshadowChapters)
      ? extractChapterHint(...clue.explicitForeshadowChapters)
      : undefined;
    const counter = nextCounter(counters, chapterHint);
    const id = createClueId(counter, chapterHint);
    const candidateTexts = [
      clue.clue,
      clue.surfaceMeaning,
      clue.realMeaning,
      ...(Array.isArray(clue.explicitForeshadowChapters) ? clue.explicitForeshadowChapters : []),
    ]
      .map((text) => (typeof text === 'string' ? text.trim() : ''))
      .filter((text) => text.length > 0);
    textIndex.set(id, buildCandidate(candidateTexts));
    const node: ClueNode = {
      id,
      kind: 'clue' as const,
      text: safeText(clue.clue, `线索 ${idx + 1}`),
      chapterHint,
      visibleBeforeDenouement: true,
      type: clueType,
      sourceRef: `clueMatrix[${idx}]`,
      anchors: [],
      anchorStatus: 'pending',
    };
    return node;
  });

  return { nodes, textIndex };
}

function buildFactNodes(timeline: DetectiveTimelineEvent[] | undefined): { nodes: ClueNode[]; textIndex: CandidateIndex } {
  if (!Array.isArray(timeline) || timeline.length === 0) {
    return { nodes: [], textIndex: new Map() };
  }
  const textIndex: CandidateIndex = new Map();
  const counters = new Map<ChapterCounterKey, number>();
  const nodes = timeline.map((event, idx) => {
    const chapterHint = extractChapterHint(event.time, event.event);
    const counter = nextCounter(counters, chapterHint);
    const id = createFactId(counter, chapterHint);
    const candidateTexts = [
      event.event,
      event.time,
      ...(Array.isArray(event.participants) ? event.participants : []),
    ]
      .map((text) => (typeof text === 'string' ? text.trim() : ''))
      .filter((text) => text.length > 0);
    textIndex.set(id, buildCandidate(candidateTexts));
    const node: ClueNode = {
      id,
      kind: 'fact' as const,
      text: safeText(event.event, `事实 ${idx + 1}`),
      chapterHint,
      visibleBeforeDenouement: true,
      sourceRef: `timeline[${idx}]`,
      anchors: [],
      anchorStatus: 'pending',
    };
    return node;
  });
  return { nodes, textIndex };
}

function buildInferenceNodes(checklist: string[] | undefined): ClueNode[] {
  if (!Array.isArray(checklist) || checklist.length === 0) {
    return [];
  }
  return checklist
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item, idx) => {
      const node: ClueNode = {
        id: createInferenceId(item, idx),
        kind: 'inference' as const,
        text: item.trim(),
        visibleBeforeDenouement: true,
        sourceRef: `logicChecklist[${idx}]`,
        anchors: [],
        anchorStatus: 'pending',
      };
      return node;
    });
}

function buildDenouementNode(outline: DetectiveOutline): ClueNode[] {
  const summary = safeText(outline.centralTrick?.summary, '');
  const mechanism = safeText(outline.centralTrick?.mechanism, '');
  const basis = summary || mechanism;
  if (!basis) {
    return [];
  }
  return [
    {
      id: 'd:final',
      kind: 'denouement' as const,
      text: basis,
      visibleBeforeDenouement: false,
      sourceRef: 'centralTrick',
      anchors: [],
      anchorStatus: 'pending',
    } satisfies ClueNode,
  ];
}

function linkSupports(
  sourceIds: string[],
  targetId: string,
  edgeSet: Set<string>,
  edges: ClueEdge[],
  rationale: string,
): void {
  sourceIds.forEach((sourceId) => {
    const key = `${sourceId}->${targetId}`;
    if (edgeSet.has(key)) return;
    edgeSet.add(key);
    edges.push({ from: sourceId, to: targetId, rationale });
  });
}

function collectSupportingSources(candidates: CandidateIndex, targetText: string): string[] {
  const normalizedTarget = normalizeForMatch(targetText);
  const targetTokens = tokenizeForMatch(targetText);
  if (!normalizedTarget) return [];
  const supported: string[] = [];
  candidates.forEach(({ texts, tokens, normalized }, id) => {
    const matched = normalized.some((candidate) => {
      if (!candidate) return false;
      if (normalizedTarget.includes(candidate) || candidate.includes(normalizedTarget)) {
        return true;
      }
      const lcs = longestCommonSubstringLength(normalizedTarget, candidate);
      if (!lcs) return false;
      const shorterLength = Math.min(candidate.length, normalizedTarget.length);
      return shorterLength > 0 ? lcs / shorterLength >= 0.45 : false;
    });
    if (matched) {
      supported.push(id);
      return;
    }
    if (tokens.size > 0 && targetTokens.size > 0) {
      const tokenScore = computeTokenJaccard(tokens, targetTokens);
      if (tokenScore >= 0.35) {
        supported.push(id);
        return;
      }
    }
    const fallbackMatched = texts.some((text) => {
      const snippet = text.trim().slice(0, 24);
      if (!snippet) return false;
      const normalizedSnippet = normalizeForMatch(snippet);
      if (!normalizedSnippet) return false;
      if (normalizedTarget.includes(normalizedSnippet)) {
        return true;
      }
      const lcs = longestCommonSubstringLength(normalizedTarget, normalizedSnippet);
      if (!lcs) return false;
      const shorter = Math.min(normalizedSnippet.length, normalizedTarget.length);
      return shorter > 0 ? lcs / shorter >= 0.5 : false;
    });
    if (fallbackMatched) {
      supported.push(id);
    }
  });
  return supported;
}

export function buildClueGraphFromOutline(outline: DetectiveOutline): ClueGraph {
  const { nodes: clueNodes, textIndex: clueTextIndex } = buildClueNodes(outline?.clueMatrix);
  const { nodes: factNodes, textIndex: factTextIndex } = buildFactNodes(outline?.timeline);
  const inferenceNodes = buildInferenceNodes(outline?.logicChecklist);
  const denouementNodes = buildDenouementNode(outline);

  const edges: ClueEdge[] = [];
  const edgeSet = new Set<string>();

  inferenceNodes.forEach((inference) => {
    const clueSupports = collectSupportingSources(clueTextIndex, inference.text);
    const factSupports = collectSupportingSources(factTextIndex, inference.text);
    if (clueSupports.length > 0) {
      linkSupports(clueSupports, inference.id, edgeSet, edges, 'clue-text-match');
    }
    if (factSupports.length > 0) {
      linkSupports(factSupports, inference.id, edgeSet, edges, 'timeline-support');
    }
  });

  if (denouementNodes.length > 0) {
    const denouementId = denouementNodes[0].id;
    inferenceNodes.forEach((inference) => {
      linkSupports([inference.id], denouementId, edgeSet, edges, 'inference-conclusion');
    });
    if (clueNodes.length > 0) {
      linkSupports(
        clueNodes.map((clue) => clue.id),
        denouementId,
        edgeSet,
        edges,
        'clue-denouement',
      );
    }
    if (factNodes.length > 0) {
      linkSupports(
        factNodes.map((fact) => fact.id),
        denouementId,
        edgeSet,
        edges,
        'timeline-denouement',
      );
    }
  }

  return {
    nodes: [...clueNodes, ...factNodes, ...inferenceNodes, ...denouementNodes],
    edges,
  };
}

export function scoreFairPlay(graph: ClueGraph): FairPlayReport {
  const nodeMap = new Map(graph.nodes.map((node) => [node.id, node]));
  const incomingMap = new Map<string, ClueEdge[]>();
  const outgoingMap = new Map<string, ClueEdge[]>();

  graph.edges.forEach((edge) => {
    const listIn = incomingMap.get(edge.to) ?? [];
    listIn.push(edge);
    incomingMap.set(edge.to, listIn);

    const listOut = outgoingMap.get(edge.from) ?? [];
    listOut.push(edge);
    outgoingMap.set(edge.from, listOut);
  });

  const unsupportedInferences = graph.nodes
    .filter((node) => node.kind === 'inference')
    .filter((node) => {
      const incoming = incomingMap.get(node.id) ?? [];
      if (incoming.length === 0) {
        return true;
      }
      return !incoming.some((edge) => {
        const source = nodeMap.get(edge.from);
        return Boolean(source && source.visibleBeforeDenouement && source.kind !== 'denouement');
      });
    })
    .map((node) => node.id);

  const cluesWithEdges = graph.nodes
    .filter((node) => node.kind === 'clue')
    .map((node) => {
      const outgoing = outgoingMap.get(node.id) ?? [];
      return outgoing.length > 0 ? node.id : null;
    })
    .filter((id): id is string => Boolean(id));

  const clueIds = graph.nodes.filter((node) => node.kind === 'clue').map((node) => node.id);
  const orphanClues = clueIds.filter((id) => !cluesWithEdges.includes(id));

  const economyScore =
    clueIds.length > 0 ? Number((cluesWithEdges.length / clueIds.length).toFixed(2)) : 1;

  return {
    unsupportedInferences,
    orphanClues,
    economyScore,
  };
}
