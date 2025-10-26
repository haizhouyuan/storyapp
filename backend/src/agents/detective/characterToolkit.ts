import type { DetectiveCharacter, DetectiveOutline, DetectiveStoryDraft } from '@storyapp/shared';

interface PersonaTemplate {
  label: string;
  keywords: string[];
  arc: string;
}

const DEFAULT_PERSONALITIES: PersonaTemplate[] = [
  { label: '谨慎细致', keywords: ['谨慎', '细致', '小心翼翼'], arc: '从怀疑到信任他人' },
  { label: '急躁冲动', keywords: ['急躁', '冲动', '容易着急'], arc: '从冲动到冷静' },
  { label: '自信锋利', keywords: ['自信', '锋利', '强势'], arc: '从自信到反思' },
  { label: '胆小多疑', keywords: ['胆小', '犹豫', '多疑'], arc: '从胆怯到勇敢' },
  { label: '温和善良', keywords: ['温和', '善良', '体贴'], arc: '从退让到坚定' },
];

const INTRO_SNIPPETS = [
  '神情之间透着{{trait}}的气息',
  '说话时总带着{{trait}}的味道',
  '举止间显出{{trait}}的一面',
  '眉眼里藏着{{trait}}的神色',
];

function pickPersona(index: number): PersonaTemplate {
  return DEFAULT_PERSONALITIES[index % DEFAULT_PERSONALITIES.length];
}

function ensureArcBeatsForCharacter(character: DetectiveCharacter, arcSummary: string): DetectiveCharacter {
  if (Array.isArray(character.arcBeats) && character.arcBeats.length > 0) {
    return character;
  }
  const beats = [
    { chapter: 'Chapter 1', description: `${character.name}展现出${character.personality || '鲜明性格'}` },
    { chapter: 'Chapter 2', description: `${character.name}的态度因事件出现动摇` },
    { chapter: 'Chapter 3', description: `${character.name}完成${arcSummary || '情绪转折'}` },
  ];
  return { ...character, arcBeats: beats };
}

export function ensureSuspectPersonas(outline: DetectiveOutline): DetectiveOutline {
  const characters = Array.isArray(outline.characters) ? outline.characters : [];
  if (!characters.length) return outline;
  const updated = characters.map((character, idx) => {
    if (!character || typeof character.role !== 'string' || !/suspect/i.test(character.role)) {
      return character;
    }
    const fallbackArc = character.arc && character.arc.trim() ? character.arc.trim() : '从迷惑到做出抉择';
    const persona: PersonaTemplate =
      character.personality && character.personality.trim()
        ? {
            label: character.personality.trim(),
            keywords: Array.isArray(character.traitKeywords) && character.traitKeywords.length
              ? character.traitKeywords
              : [`${character.personality.trim()}`],
            arc: fallbackArc,
          }
        : pickPersona(idx);
    const personality = character.personality && character.personality.trim() ? character.personality : persona.label;
    const traitKeywords = Array.isArray(character.traitKeywords) && character.traitKeywords.length
      ? character.traitKeywords
      : persona.keywords;
    const arc = character.arc && character.arc.trim() ? character.arc : persona.arc;
    const enriched: DetectiveCharacter = {
      ...character,
      personality,
      traitKeywords,
      arc,
    };
    return ensureArcBeatsForCharacter(enriched, arc || persona.arc);
  });
  return { ...outline, characters: updated };
}

function buildIntroSnippet(personality: string): string {
  const tpl = INTRO_SNIPPETS[Math.floor(Math.random() * INTRO_SNIPPETS.length)];
  return tpl.replace('{{trait}}', personality);
}

export function enhanceCharacterIntroductions(
  outline: DetectiveOutline,
  draft: DetectiveStoryDraft,
): { draft: DetectiveStoryDraft; notes: string[] } {
  const characters = Array.isArray(outline.characters) ? outline.characters : [];
  if (!Array.isArray(draft?.chapters) || draft.chapters.length === 0 || characters.length === 0) {
    return { draft, notes: [] };
  }
  const notes: string[] = [];
  const updatedChapters = draft.chapters.map((chapter) => ({ ...chapter }));
  const taken = new Set<string>();

  characters.forEach((character) => {
    if (!character?.name || !character.personality) return;
    const name = character.name.trim();
    if (!name || taken.has(name)) return;

    for (let i = 0; i < updatedChapters.length; i += 1) {
      const chapter = updatedChapters[i];
      const content = chapter.content || '';
      const idx = content.indexOf(name);
      if (idx !== -1) {
        const snippet = buildIntroSnippet(character.personality);
        const injected =
          idx >= 0
            ? `${content.slice(0, idx + name.length)}（${snippet}）${content.slice(idx + name.length)}`
            : content;
        updatedChapters[i] = { ...chapter, content: injected };
        notes.push(`${name} 的首次出场已补充性格描写`);
        taken.add(name);
        break;
      }
    }
  });

  return {
    draft: { ...draft, chapters: updatedChapters },
    notes,
  };
}

export interface ArcBeatGap {
  character: string;
  chapter: string;
  description?: string;
}

export function evaluateArcBeats(outline: DetectiveOutline, draft: DetectiveStoryDraft): ArcBeatGap[] {
  const gaps: ArcBeatGap[] = [];
  if (!Array.isArray(outline.characters) || !Array.isArray(draft?.chapters)) {
    return gaps;
  }

  const chapterMap = new Map<string, string>();
  draft.chapters.forEach((chapter, index) => {
    const key = chapter.title || `Chapter ${index + 1}`;
    chapterMap.set(key, `${chapter.summary || ''}\n${chapter.content || ''}`);
  });

  outline.characters.forEach((character) => {
    if (!character?.name || !Array.isArray(character.arcBeats)) return;
    character.arcBeats.forEach((beat) => {
      const chapterKey = beat?.chapter || '';
      if (!chapterKey) return;
      const chapterText = chapterMap.get(chapterKey);
      if (!chapterText) {
        gaps.push({
          character: character.name,
          chapter: chapterKey,
          description: beat?.description,
        });
        return;
      }
      const keyword = beat?.description || character.personality || character.arc || '';
      if (keyword && chapterText.includes(keyword)) {
        return;
      }
      const fallback = Array.isArray(character.traitKeywords) ? character.traitKeywords.join('|') : '';
      const pattern = keyword || fallback;
      if (!pattern) {
        return;
      }
      const regex = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      if (!regex.test(chapterText)) {
        gaps.push({
          character: character.name,
          chapter: chapterKey,
          description: beat?.description,
        });
      }
    });
  });

  return gaps;
}
