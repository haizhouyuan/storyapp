import { createLogger } from '../../config/logger';
import type {
  DetectiveCharacter,
  DetectiveOutline,
  DetectiveStoryDraft,
  StylePack,
  StyleAdjustmentReport,
} from '@storyapp/shared';

const logger = createLogger('detective:style');

type StylePackWithAliases = StylePack & {
  aliases: RegExp[];
};

const STYLE_PACK_LIBRARY: Record<string, StylePackWithAliases> = {
  detective: {
    id: 'style.detective',
    role: 'detective',
    lexicon: ['推断', '观察', '细节', '证据'],
    fillers: ['请注意', '不妨看看'],
    punctuation: ['——', '……'],
    banPairs: [
      ['突然', '突然'],
      ['竟然', '居然'],
    ],
    aliases: [/侦探/i, /福尔摩斯/i],
  },
  sidekick: {
    id: 'style.sidekick',
    role: 'sidekick',
    lexicon: ['我想着', '我注意到', '这让我想起'],
    fillers: ['哎呀', '说真的'],
    punctuation: ['……', '——'],
    banPairs: [
      ['骤然', '立即'],
      ['瞬间', '立刻'],
    ],
    aliases: [/助手/i, /搭档/i, /华生/i, /黑斯廷斯/i],
  },
  inspector: {
    id: 'style.inspector',
    role: 'inspector',
    lexicon: ['例行', '巡察', '调查', '警署'],
    fillers: ['按照规矩', '根据程序'],
    punctuation: ['——'],
    aliases: [/警官/i, /探长/i, /警长/i],
  },
  suspect: {
    id: 'style.suspect',
    role: 'suspect',
    lexicon: ['我冤枉', '我真的没做', '你得相信我'],
    fillers: ['我发誓', '求你相信'],
    punctuation: ['……'],
    aliases: [/嫌疑/i],
  },
  narrator: {
    id: 'style.narrator',
    role: 'narrator',
    lexicon: ['只见', '在一旁', '我按下笔记'],
    fillers: ['说来奇怪', '回想起来'],
    punctuation: ['——', '……'],
    aliases: [/记录/i, /旁观/i],
  },
};

const SPEECH_VERBS =
  '(?:说道|说着|问道|问|答道|暗暗道|提醒|低声道|低声说|苦笑着说|叹道|继续道|解释道|对[\\u4e00-\\u9fa5A-Za-z]{1,8}说|对众人说|喃喃道|应道|笑道|冷冷道|沉声道|缓声道|轻声道)?';

const SPEECH_PATTERN = new RegExp(
  `(?<leading>(?:^|[\\n。！？!?])\\s*)(?<speaker>[\\u4e00-\\u9fa5A-Za-z·]{1,8})(?<verb>${SPEECH_VERBS})[:：]\\s*“(?<dialogue>[^”]+)”`,
  'gu',
);

const INNER_MONOLOGUE_PATTERN =
  /(侦探[^\n。！？]*?(?:心里|心中|内心|暗自|暗地里|心底)[^\n。！？]*[。！？])/g;

const DEFAULT_FOCAL_INTRO_TEMPLATE = (focal: string) =>
  `旁观者${focal}在一旁记录着案件的进展，他/她只能从侦探的神情揣测其想法。`;

function computeTextWordCount(text: string | undefined): number {
  if (!text) return 0;
  return text.replace(/\s+/g, '').length;
}

const TEMPLATE_WINDOW_DEFAULT = 4;
const TEMPLATE_SIMILARITY_THRESHOLD = 0.85;

const TEMPLATE_VARIANTS: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /语气一沉/g, replacement: '语气逐渐低下' },
  { pattern: /忽然想起/g, replacement: '恍然忆起' },
  { pattern: /目光一凝/g, replacement: '目光霎时聚焦' },
  { pattern: /心里一紧/g, replacement: '心弦倏紧' },
  { pattern: /不自觉地紧握/g, replacement: '不觉间攥紧' },
  { pattern: /仿佛有预感/g, replacement: '隐约生出预感' },
];

const CLICHE_REPLACEMENTS: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /语气一沉/g, replacement: '语调低缓下来' },
  { pattern: /呼吸一窒/g, replacement: '呼吸猛地顿住又缓缓吐出' },
  { pattern: /心里咯噔/g, replacement: '心弦骤然一紧' },
  { pattern: /忽然意识到/g, replacement: '这才意识到' },
  { pattern: /一瞬间/g, replacement: '霎时间' },
  { pattern: /汗水顺着额头滑落/g, replacement: '额角沁出细密汗珠' },
];

function detectPackIdForRole(role: string | undefined): keyof typeof STYLE_PACK_LIBRARY {
  if (!role) return 'narrator';
  const normalized = role.toLowerCase();
  if (normalized.includes('detective') || normalized.includes('侦探')) return 'detective';
  if (normalized.includes('assistant') || normalized.includes('搭档') || normalized.includes('助手') || normalized.includes('witness')) {
    return 'sidekick';
  }
  if (normalized.includes('inspector') || normalized.includes('police') || normalized.includes('警')) {
    return 'inspector';
  }
  if (normalized.includes('suspect') || normalized.includes('嫌疑')) {
    return 'suspect';
  }
  return 'narrator';
}

function sanitizeSpeakerName(raw: string): string {
  return raw.replace(/[“”"\\s]/g, '').slice(0, 8);
}

function buildStyleAssignments(outline: DetectiveOutline): Map<string, StylePackWithAliases> {
  const assignments = new Map<string, StylePackWithAliases>();
  const characters = Array.isArray(outline?.characters) ? outline.characters : [];
  characters
    .filter((character): character is DetectiveCharacter => Boolean(character && character.name))
    .forEach((character) => {
      const packId = detectPackIdForRole(character.role);
      const pack = STYLE_PACK_LIBRARY[packId];
      if (!pack) return;
      assignments.set(character.name.trim(), pack);
    });
  return assignments;
}

function findPackForSpeaker(
  speaker: string,
  assignments: Map<string, StylePackWithAliases>,
): StylePackWithAliases | undefined {
  const normalized = sanitizeSpeakerName(speaker);
  for (const [name, pack] of assignments.entries()) {
    if (normalized.includes(name) || name.includes(normalized)) {
      return pack;
    }
  }
  for (const pack of Object.values(STYLE_PACK_LIBRARY)) {
    if (pack.aliases.some((pattern) => pattern.test(normalized))) {
      return pack;
    }
  }
  return undefined;
}

function applyStylePackToChapter(
  chapterContent: string,
  assignments: Map<string, StylePackWithAliases>,
): { content: string; adjustments: number } {
  let adjustments = 0;
  const updatedContent = chapterContent.replace(
    SPEECH_PATTERN,
    (match, leading: string, speaker: string, verb: string, dialogue: string) => {
      const pack = findPackForSpeaker(speaker, assignments);
      if (!pack) {
        return match;
      }
      let updatedDialogue = dialogue;

      if (!pack.fillers.some((filler) => updatedDialogue.includes(filler))) {
        updatedDialogue = `${pack.fillers[0]}，${updatedDialogue}`;
        adjustments += 1;
      }

      if (pack.lexicon.length > 0 && !pack.lexicon.some((lex) => updatedDialogue.includes(lex))) {
        updatedDialogue = `${updatedDialogue}，${pack.lexicon[0]}`;
        adjustments += 1;
      }

      const normalizedVerb = verb ? verb.replace(/:/g, '：') : '';
      const rebuilt = `${leading}${speaker}${normalizedVerb}：“${updatedDialogue}”`;
      if (rebuilt !== match) {
        return rebuilt;
      }
      return match;
    },
  );
  return { content: updatedContent, adjustments };
}

function dedupeBlankLines(text: string): string {
  return text.replace(/\n{3,}/g, '\n\n');
}

function determineFocalCharacter(outline: DetectiveOutline): string | null {
  const characters = Array.isArray(outline?.characters) ? outline.characters : [];
  const preferredRoles = ['sidekick', 'witness', 'assistant', '搭档', '助手', '目击', '记者'];
  for (const character of characters) {
    if (!character?.name) continue;
    const role = character.role?.toLowerCase() ?? '';
    if (preferredRoles.some((token) => role.includes(token))) {
      return character.name.trim();
    }
  }
  const detective = characters.find((character) => character?.role?.toLowerCase().includes('detective'));
  if (detective?.name) {
    return detective.name.trim();
  }
  if (characters.length > 0 && characters[0]?.name) {
    return characters[0].name.trim();
  }
  return null;
}

export function enforceFocalization(
  outline: DetectiveOutline,
  draft: DetectiveStoryDraft,
): { draft: DetectiveStoryDraft; notes: string[] } {
  const focal = determineFocalCharacter(outline);
  if (!focal || !draft?.chapters?.length) {
    return { draft, notes: [] };
  }

  const introCue = DEFAULT_FOCAL_INTRO_TEMPLATE(focal);
  let adjustments = 0;

  const chapters = draft.chapters.map((chapter) => {
    if (!chapter || typeof chapter.content !== 'string') {
      return chapter;
    }
    let content = chapter.content;

    if (!content.includes(`旁观者${focal}`) && !content.includes(focal)) {
      content = `${introCue}\n${content}`;
      adjustments += 1;
    }

    content = content.replace(INNER_MONOLOGUE_PATTERN, () => {
      adjustments += 1;
      return `${focal}只看见侦探神色间的细微波动，却听不见他心底的推断。`;
    });

    content = dedupeBlankLines(content);

    return {
      ...chapter,
      content,
      wordCount: computeTextWordCount(content),
    };
  });

  const updatedDraft: DetectiveStoryDraft = {
    ...draft,
    chapters,
    overallWordCount: chapters.reduce((total, chapter) => total + computeTextWordCount(chapter.content), 0),
  };

  const notes =
    adjustments > 0 ? [`Watson化视角：以 ${focal} 的观察视角重写 ${adjustments} 处内心独白`] : [];
  return { draft: updatedDraft, notes };
}

export function applyStylePackToDraft(
  outline: DetectiveOutline,
  draft: DetectiveStoryDraft,
): { draft: DetectiveStoryDraft; notes: string[] } {
  if (!draft?.chapters?.length) {
    return { draft, notes: [] };
  }
  const assignments = buildStyleAssignments(outline);
  if (assignments.size === 0) {
    return { draft, notes: [] };
  }

  let totalAdjustments = 0;
  const chapters = draft.chapters.map((chapter) => {
    if (!chapter?.content) return chapter;
    const { content, adjustments } = applyStylePackToChapter(chapter.content, assignments);
    if (adjustments > 0) {
      totalAdjustments += adjustments;
    }
    const cleaned = dedupeBlankLines(content);
    return {
      ...chapter,
      content: cleaned,
      wordCount: computeTextWordCount(cleaned),
    };
  });

  const updatedDraft: DetectiveStoryDraft = {
    ...draft,
    chapters,
    overallWordCount: chapters.reduce((total, chapter) => total + computeTextWordCount(chapter.content), 0),
  };

  const notes =
    totalAdjustments > 0
      ? [`StylePack：根据角色声腔微调对白 ${totalAdjustments} 处`]
      : [];
  return { draft: updatedDraft, notes };
}

export function recalcOverallWordCount(draft: DetectiveStoryDraft): DetectiveStoryDraft {
  if (!draft?.chapters?.length) return draft;
  return {
    ...draft,
    overallWordCount: draft.chapters.reduce(
      (total, chapter) => total + computeTextWordCount(chapter?.content),
      0,
    ),
  };
}

function buildTemplateSignature(paragraph: string): string {
  return paragraph
    .replace(/[“”"'\s]/g, '')
    .replace(/[，、。；；:：！!?？…—\-]+/g, ',')
    .replace(/[0-9０-９]/g, '#')
    .toLowerCase();
}

function bigramSet(text: string): Set<string> {
  const set = new Set<string>();
  for (let i = 0; i < text.length - 1; i += 1) {
    const gram = text.slice(i, i + 2);
    if (gram.trim().length === 0) continue;
    set.add(gram);
  }
  return set;
}

function computeSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const setA = bigramSet(a);
  const setB = bigramSet(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersect = 0;
  setA.forEach((gram) => {
    if (setB.has(gram)) intersect += 1;
  });
  const union = setA.size + setB.size - intersect;
  return union === 0 ? 0 : intersect / union;
}

function rewriteParagraph(paragraph: string, index: number): string {
  let rewritten = paragraph;
  let replaced = false;
  for (const variant of TEMPLATE_VARIANTS) {
    if (variant.pattern.test(rewritten)) {
      rewritten = rewritten.replace(variant.pattern, variant.replacement);
      replaced = true;
    }
  }
  if (replaced) {
    return rewritten;
  }
  const clauses = paragraph.split(/，/).map((item) => item.trim()).filter(Boolean);
  if (clauses.length > 2) {
    const first = clauses.shift();
    const rebuilt = [...clauses, first].join('，');
    return rebuilt;
  }
  return index % 2 === 0 ? `换而言之，${paragraph}` : `从旁看来，${paragraph}`;
}

export function throttleTemplates(
  draft: DetectiveStoryDraft,
  options?: { window?: number; threshold?: number },
): { draft: DetectiveStoryDraft; notes: string[] } {
  if (!draft?.chapters?.length) {
    return { draft, notes: [] };
  }
  const windowSize = options?.window ?? TEMPLATE_WINDOW_DEFAULT;
  const threshold = options?.threshold ?? TEMPLATE_SIMILARITY_THRESHOLD;
  let adjustments = 0;

  const chapters = draft.chapters.map((chapter) => {
    if (!chapter?.content) return chapter;
    const paragraphs = chapter.content.split(/\n+/);
    const signatures: string[] = [];
    const updatedParas = paragraphs.map((para, idx) => {
      const signature = buildTemplateSignature(para);
      const recent = signatures.slice(-windowSize);
      const similar = recent.find((sig) => computeSimilarity(sig, signature) >= threshold);
      if (similar) {
        const rewritten = rewriteParagraph(para, idx);
        adjustments += rewritten === para ? 0 : 1;
        signatures.push(buildTemplateSignature(rewritten));
        return rewritten;
      }
      signatures.push(signature);
      return para;
    });
    const content = dedupeBlankLines(updatedParas.join('\n'));
    return {
      ...chapter,
      content,
      wordCount: computeTextWordCount(content),
    };
  });

  const updatedDraft: DetectiveStoryDraft = {
    ...draft,
    chapters,
    overallWordCount: chapters.reduce((total, chapter) => total + computeTextWordCount(chapter.content), 0),
  };

  const notes = adjustments > 0 ? [`句式节流：改写重复模板 ${adjustments} 处`] : [];
  return { draft: updatedDraft, notes };
}

export function applyClicheGuard(draft: DetectiveStoryDraft): { draft: DetectiveStoryDraft; notes: string[] } {
  if (!draft?.chapters?.length) {
    return { draft, notes: [] };
  }

  let adjustments = 0;
  const chapters = draft.chapters.map((chapter) => {
    if (!chapter?.content) return chapter;
    let content = chapter.content;
    for (const item of CLICHE_REPLACEMENTS) {
      if (item.pattern.test(content)) {
        content = content.replace(item.pattern, item.replacement);
        adjustments += 1;
      }
    }
    content = dedupeBlankLines(content);
    return {
      ...chapter,
      content,
      wordCount: computeTextWordCount(content),
    };
  });

  const updatedDraft: DetectiveStoryDraft = {
    ...draft,
    chapters,
    overallWordCount: chapters.reduce((total, chapter) => total + computeTextWordCount(chapter.content), 0),
  };

  const notes = adjustments > 0 ? [`陈词滥调限流：替换高频套话 ${adjustments} 处`] : [];
  return { draft: updatedDraft, notes };
}
