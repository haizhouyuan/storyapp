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

function buildClueNodes(clues: DetectiveClue[] | undefined): { nodes: ClueNode[]; textIndex: Map<string, string[]> } {
  if (!Array.isArray(clues) || clues.length === 0) {
    return { nodes: [], textIndex: new Map() };
  }
  const textIndex = new Map<string, string[]>();
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
    textIndex.set(id, candidateTexts);
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

function buildFactNodes(timeline: DetectiveTimelineEvent[] | undefined): { nodes: ClueNode[]; textIndex: Map<string, string[]> } {
  if (!Array.isArray(timeline) || timeline.length === 0) {
    return { nodes: [], textIndex: new Map() };
  }
  const textIndex = new Map<string, string[]>();
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
    textIndex.set(id, candidateTexts);
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

function collectSupportingSources(
  candidates: Map<string, string[]>,
  targetText: string,
): string[] {
  const normalizedTarget = normalizeForMatch(targetText);
  if (!normalizedTarget) return [];
  const supported: string[] = [];
  candidates.forEach((texts, id) => {
    const matched = texts.some((text) => {
      const normalized = normalizeForMatch(text);
      if (!normalized) return false;
      return normalizedTarget.includes(normalized) || normalized.includes(normalizedTarget);
    });
    if (matched) {
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
