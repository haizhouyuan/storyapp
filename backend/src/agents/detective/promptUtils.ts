import type { DetectiveOutline, DetectiveStoryDraft } from '@storyapp/shared';
import { buildPlannerPrompt, buildWriterPrompt, buildEditorPrompt, PromptBuildOptions } from './promptBuilder';

function timelineSummary(outline: DetectiveOutline): string {
  const tl: any = (outline as any)?.timeline;
  const events = Array.isArray(tl) ? tl : (Array.isArray(tl?.events) ? tl.events : []);
  if (events.length === 0) return '（无时间线信息）';
  const lines = (events as any[]).map((event: any) => {
    if (!event) return null as any;
    const time = event.time ?? '未知时间';
    const description = event.event ?? '事件描述缺失';
    const participants = Array.isArray(event.participants) && event.participants.length > 0
      ? `（涉及：${event.participants.join('、')}）`
      : '';
    return `- ${time}: ${description}${participants}`;
  }).filter(Boolean) as string[];
  return lines.join('\n');
}

function cluesSummary(outline: DetectiveOutline): string {
  const clues = outline?.clueMatrix ?? [];
  if (clues.length === 0) return '（未提供线索列表）';
  const lines = clues.map((clue, index) => {
    if (!clue) return null as any;
    const label = clue.clue || `线索${index + 1}`;
    const meaning = clue.realMeaning ? `（真实含义：${clue.realMeaning}）` : '';
    const mislead = clue.isRedHerring ? '【红鲱鱼】' : '';
    return `${label}${meaning}${mislead}`;
  }).filter(Boolean) as string[];
  return lines.join('\n- ');
}

function suspectsSummary(outline: DetectiveOutline): string {
  const characters = outline?.characters ?? [];
  const suspects = characters.filter((char) => typeof char?.role === 'string' && /suspect/i.test(char.role));
  if (suspects.length === 0) {
    return '（大纲未列出嫌疑人，请在正文中塑造至少两名具有明确动机的嫌疑人）';
  }
  return suspects
    .map((suspect) => {
      const motive = suspect.motive ? `动机：${suspect.motive}` : '动机待补充';
      const motiveKeywords =
        Array.isArray(suspect.motiveKeywords) && suspect.motiveKeywords.length > 0
          ? `动机关键词：${Array.from(new Set(suspect.motiveKeywords)).join('、')}`
          : '动机关键词待补充';
      const motiveScenes =
        Array.isArray(suspect.motiveScenes) && suspect.motiveScenes.length > 0
          ? `重点场景：${Array.from(new Set(suspect.motiveScenes)).join('、')}`
          : '重点场景待确认';
      const secrets =
        Array.isArray(suspect.secrets) && suspect.secrets.length > 0
          ? `秘密：${suspect.secrets.join('、')}`
          : '暂无额外秘密';
      return `- ${suspect.name} — ${motive}；${motiveKeywords}；${motiveScenes}；${secrets}`;
    })
    .join('\n');
}

function mustForeshadowSummary(outline: DetectiveOutline): string {
  const clues = outline?.clueMatrix ?? [];
  const mustForeshadow = clues.filter((clue) => clue?.mustForeshadow);
  if (mustForeshadow.length === 0) {
    return '（无 mustForeshadow 线索；如后续正文引入关键证据，请至少提前两章埋设）';
  }
  return mustForeshadow
    .map((clue) => {
      const chapters = Array.isArray(clue.explicitForeshadowChapters) && clue.explicitForeshadowChapters.length > 0
        ? clue.explicitForeshadowChapters.join('、')
        : '章节待指定';
      return `- ${clue.clue} → 需在 ${chapters} 中埋设，真实含义：${clue.realMeaning ?? '待明确'}`;
    })
    .join('\n');
}

function redHerringSummary(outline: DetectiveOutline): string {
  const actBeats = outline?.acts?.flatMap((act) => act.beats ?? []) ?? [];
  const redHerringsFromBeats = actBeats
    .map((beat) => beat?.redHerring)
    .filter((v): v is string => Boolean(v && v.trim()));
  const clues = outline?.clueMatrix ?? [];
  const clueHerrings = clues.filter((clue) => clue?.isRedHerring).map((clue) => clue.clue);
  const merged = [...new Set([...redHerringsFromBeats, ...clueHerrings])];
  if (merged.length === 0) {
    return '（需至少设计一条红鲱鱼以误导读者对嫌疑人的判断）';
  }
  return merged.map((item, index) => `${index + 1}. ${item}`).join('\n');
}

function chapterGuidance(outline: DetectiveOutline): string {
  const acts = outline?.acts ?? [];
  if (acts.length === 0) {
    return '（未提供幕结构，请在正文中自行按照起承转合安排章节，确保总章数不少于 4）';
  }

  const anchorMap = new Map<number, string>();
  const blueprintMap = new Map<number, {
    wordTarget?: number;
    conflictGoal?: string;
    backgroundNeeded?: string[];
    emotionalBeat?: string;
  }>();
  (outline?.chapterAnchors ?? []).forEach((anchor) => {
    if (!anchor?.chapter) return;
    const match = anchor.chapter.match(/(\d+)/);
    if (!match) return;
    const index = Number.parseInt(match[1], 10) - 1;
    if (!Number.isFinite(index) || index < 0) return;
    const slots = [anchor.dayCode, anchor.time].filter(Boolean).join(' ');
    const label = anchor.label ? ` ${anchor.label}` : '';
    const summary = anchor.summary ? `（${anchor.summary}）` : '';
    anchorMap.set(index, `${slots || '时间待定'}${label}${summary}`);
  });
  const blueprints = (outline as any)?.chapterBlueprints;
  if (Array.isArray(blueprints)) {
    blueprints.forEach((bp: any) => {
      if (!bp?.chapter) return;
      const match = String(bp.chapter).match(/(\d+)/);
      if (!match) return;
      const index = Number.parseInt(match[1], 10) - 1;
      if (!Number.isFinite(index) || index < 0) return;
      const backgrounds = Array.isArray(bp.backgroundNeeded)
        ? bp.backgroundNeeded.filter(
            (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0,
          )
        : undefined;
      blueprintMap.set(index, {
        wordTarget: typeof bp.wordTarget === 'number' ? bp.wordTarget : undefined,
        conflictGoal: typeof bp.conflictGoal === 'string' ? bp.conflictGoal : undefined,
        backgroundNeeded: backgrounds,
        emotionalBeat: typeof bp.emotionalBeat === 'string' ? bp.emotionalBeat : undefined,
      });
    });
  }

  let chapterCursor = 1;
  const lines: string[] = [];
  acts.forEach((act) => {
    const beats = act?.beats ?? [];
    const beatCount = Math.max(1, beats.length);
    const chapterRange =
      beatCount === 1 ? `第 ${chapterCursor} 章` : `第 ${chapterCursor}-${chapterCursor + beatCount - 1} 章`;
    const anchorHints: string[] = [];
    for (let offset = 0; offset < beatCount; offset += 1) {
      const chapterIndex = chapterCursor - 1 + offset;
      if (anchorMap.has(chapterIndex)) {
        anchorHints.push(`Chapter ${chapterIndex + 1}：${anchorMap.get(chapterIndex)}`);
      }
    }
    const anchorLine =
      anchorHints.length > 0
        ? `时间锚点：${anchorHints.join('；')}`
        : '时间锚点：请结合大纲时间线补齐 DayX HH:MM 的自然语言提示';
    const beatDetails = beats
      .map((beat) => {
        const clues = Array.isArray(beat.cluesRevealed) && beat.cluesRevealed.length > 0
          ? `线索：${beat.cluesRevealed.join('、')}`
          : '线索：可视情况揭示';
        const red = beat.redHerring ? `红鲱鱼：${beat.redHerring}` : '';
        return `    - 节拍 ${act.act}.${beat.beat}：${beat.summary}（${clues}${red ? `；${red}` : ''}）`;
      })
      .join('\n');
    const blueprintHints: string[] = [];
    for (let offset = 0; offset < beatCount; offset += 1) {
      const chapterIndex = chapterCursor - 1 + offset;
      if (!blueprintMap.has(chapterIndex)) {
        continue;
      }
      const bp = blueprintMap.get(chapterIndex)!;
      const targetText = bp.wordTarget ? `目标${bp.wordTarget}字` : '目标字数 1600 左右';
      const conflict = bp.conflictGoal ? `冲突：${bp.conflictGoal}` : '';
      const background = bp.backgroundNeeded && bp.backgroundNeeded.length > 0
        ? `背景：${bp.backgroundNeeded.join('、')}`
        : '';
      const emotion = bp.emotionalBeat ? `情绪：${bp.emotionalBeat}` : '';
      const parts = [targetText, conflict, background, emotion].filter(Boolean);
      blueprintHints.push(`Chapter ${chapterIndex + 1} → ${parts.join('；')}`);
    }
    const blueprintLine =
      blueprintHints.length > 0
        ? `    - 篇幅/情绪：${blueprintHints.join('；')}`
        : '    - 篇幅/情绪：如字数不足请扩写氛围与心理。';
    lines.push(
      [
        `${chapterRange} 应覆盖 Act ${act.act}（焦点：${act.focus}）。请保留主要事件顺序：`,
        `    - ${anchorLine}`,
        blueprintLine,
        beatDetails || '    - （该幕缺少详细节拍，请在正文中自行补全矛盾冲突与线索推进）',
      ].join('\n'),
    );
    chapterCursor += beatCount;
  });

  return lines.join('\n');
}

function timelineDayNotes(outline: DetectiveOutline): string {
  const events = outline?.timeline ?? [];
  if (events.length === 0) return '（无时间线提醒，如故事跨越多日请在正文主动注明日序与时间点）';
  const daySet = new Set<string>();
  events.forEach((event) => {
    const match = event?.time?.match(/Day\s*(\d+)/i);
    if (match) {
      daySet.add(`Day${match[1]}`);
    }
  });
  if (daySet.size > 1) {
    return `（时间线覆盖 ${Array.from(daySet).join('、')}，正文中必须明确指出日期切换并解释跨日的行动安排）`;
  }
  return '（时间线集中在同一日，如正文需要跨日情节，请更新时间标注并给出合理过渡）';
}

function chapterAnchorSummary(outline: DetectiveOutline): string {
  const anchors = outline?.chapterAnchors ?? [];
  if (!Array.isArray(anchors) || anchors.length === 0) {
    return '（未提供章节时间锚点，请在写作中自行为每章补齐 DayX HH:MM 信息）';
  }
  return anchors
    .map((anchor) => {
      const chapter = anchor?.chapter ?? 'Chapter ?';
      const slots = [anchor?.dayCode, anchor?.time].filter(Boolean).join(' ');
      const label = anchor?.label ? ` — ${anchor.label}` : '';
      const summary = anchor?.summary ? `（提示：${anchor.summary}）` : '';
      return `- ${chapter} → ${slots || '时间待定'}${label}${summary}`;
    })
    .join('\n');
}

function motiveKeywordChecklist(outline: DetectiveOutline): string {
  const characters = outline?.characters ?? [];
  const suspects = characters.filter((char) => typeof char?.role === 'string' && /suspect/i.test(char.role));
  if (suspects.length === 0) {
    return '（未提供嫌疑人动机关键词，请在写作中补充关键动机提示）';
  }
  const lines = suspects
    .map((suspect) => {
      const keywords = Array.isArray(suspect.motiveKeywords)
        ? Array.from(new Set(suspect.motiveKeywords.filter((kw): kw is string => Boolean(kw && kw.trim()))))
        : [];
      if (keywords.length === 0) {
        return `- ${suspect.name}：无动机关键词，请在前两章补写其动机伏笔。`;
      }
      return `- ${suspect.name}：关键词「${keywords.join('、')}」，需在前两章通过对白或细节埋设。`;
    })
    .filter(Boolean);
  if (lines.length === 0) {
    return '（动机关键词缺失，请在写作中补齐）';
  }
  return lines.join('\n');
}

function atmosphereSummary(outline: DetectiveOutline): string {
  const atmosphere = (outline as any)?.settingAtmosphere ?? {};
  const openingMood = typeof atmosphere.openingMood === 'string' && atmosphere.openingMood.trim()
    ? atmosphere.openingMood.trim()
    : null;
  const weather = typeof atmosphere.weather === 'string' && atmosphere.weather.trim()
    ? atmosphere.weather.trim()
    : null;
  const sensory = Array.isArray(atmosphere.sensoryPalette)
    ? Array.from(
        new Set(
          atmosphere.sensoryPalette.filter(
            (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0,
          ),
        ),
      )
    : [];
  const lines: string[] = [];
  if (openingMood) {
    lines.push(`开篇氛围：${openingMood}`);
  }
  if (weather) {
    lines.push(`天气/环境：${weather}`);
  }
  if (sensory.length > 0) {
    lines.push(`重点感官：${sensory.join('、')}`);
  }
  return lines.length > 0 ? lines.join('\n') : '（未提供氛围提示，请自行塑造环境感官）';
}

function chapterBlueprintSummary(outline: DetectiveOutline): string {
  const blueprints = (outline as any)?.chapterBlueprints;
  if (!Array.isArray(blueprints) || blueprints.length === 0) {
    return '（未提供章节篇幅与冲突目标，请在写作时自行控制在 1500 字左右并补足矛盾/情绪）';
  }
  return blueprints
    .map((bp: any) => {
      const name = bp?.chapter ?? 'Chapter ?';
      const target = typeof bp?.wordTarget === 'number' ? `${bp.wordTarget}字` : '约1600字';
      const conflict = typeof bp?.conflictGoal === 'string' && bp.conflictGoal.trim()
        ? `冲突：${bp.conflictGoal}`
        : '';
      const backgrounds = Array.isArray(bp?.backgroundNeeded)
        ? bp.backgroundNeeded.filter(
            (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0,
          )
        : [];
      const background =
        backgrounds.length > 0
          ? `背景：${backgrounds.join('、')}`
          : '';
      const emotional =
        typeof bp?.emotionalBeat === 'string' && bp.emotionalBeat.trim()
          ? `情绪：${bp.emotionalBeat}`
          : '';
      const parts = [target, conflict, background, emotional].filter(Boolean);
      return `- ${name} → ${parts.join('；')}`;
    })
    .join('\n');
}

function emotionalBeatsSummary(outline: DetectiveOutline): string {
  const beats = (outline as any)?.emotionalBeats;
  if (!Array.isArray(beats) || beats.length === 0) {
    return '（未提供情绪节拍，请在前两章主动描写嫌疑人心理反应和紧张感）';
  }
  return beats
    .map((beat, index) => {
      const chapter = beat?.chapter ?? `情绪点${index + 1}`;
      const focus = beat?.focus ?? '情绪焦点待补充';
      const delivery = beat?.delivery ? `呈现方式：${beat.delivery}` : '';
      const keywords = Array.isArray(beat?.keywords) && beat.keywords.length > 0
        ? `关键词：${beat.keywords.join('、')}`
        : '';
      return `- ${chapter} → ${focus}${delivery ? `；${delivery}` : ''}${keywords ? `；${keywords}` : ''}`;
    })
    .join('\n');
}

function misdirectionMomentsSummary(outline: DetectiveOutline): string {
  const moments = (outline as any)?.misdirectionMoments;
  if (!Array.isArray(moments) || moments.length === 0) {
    return '（未提供误导节点，请保证至少一个嫌疑人出现可疑行为并于结局澄清）';
  }
  return moments
    .map((moment, index) => {
      const chapter = moment?.chapter ?? `Chapter ${index + 1}`;
      const setup = moment?.setup ?? '误导内容待补充';
      const surface = moment?.surfaceInterpretation ? `表面含义：${moment.surfaceInterpretation}` : '';
      const reveal = moment?.revealHint ? `真相铺垫：${moment.revealHint}` : '';
      const suspect = moment?.suspect ? `涉及嫌疑人：${moment.suspect}` : '';
      return `- ${chapter} → ${setup}${surface ? `；${surface}` : ''}${reveal ? `；${reveal}` : ''}${suspect ? `；${suspect}` : ''}`;
    })
    .join('\n');
}

export interface RevisionPlanIssue {
  id: string;
  detail: string;
  chapterRef?: string;
  category?: string;
}

export interface RevisionPlan {
  mustFix: RevisionPlanIssue[];
  warnings: RevisionPlanIssue[];
  suggestions: string[];
}

function formatRevisionItems(items: RevisionPlanIssue[]): string {
  if (!items.length) return '（无）';
  return items
    .map((item, index) => {
      const chapter = item.chapterRef ? `（章节：${item.chapterRef}）` : '';
      const category = item.category ? `【${item.category}】` : '';
      return `${index + 1}. ${category}${item.detail}${chapter}`;
    })
    .join('\n');
}

function detectUniquenessGap(plan: RevisionPlan): boolean {
  return [...plan.mustFix, ...plan.warnings].some((item) => {
    const id = item.id ?? '';
    const detail = item.detail ?? '';
    return /hypothesis|beta-reader/i.test(id) || /多解|误导|竞争嫌疑/.test(detail);
  });
}

// 兼容旧实现：直接内联规范
export function buildStage1Prompt(topic: string): string {
  return `
请根据以下输入生成严格的 JSON（请勿包含注释或多余文本）：
{  
  "centralTrick": { "summary": "...", "mechanism": "...", "fairnessNotes": ["..."] },
  "caseSetup": { "victim": "...", "crimeScene": "...", "initialMystery": "..." },
  "settingAtmosphere": { "openingMood": "...", "sensoryPalette": ["..."], "nightDetails": "...", "weather": "..." },
  "characters": [
    {
      "name": "...",
      "role": "detective|suspect|victim|witness",
      "motive": "...",
      "secrets": ["..."],
      "motiveKeywords": ["..."],
      "motiveScenes": ["Chapter 1 图书馆", "Chapter 2 实验室"]
    }
  ],
      "portrait": "...",
      "chapterIntro": "Chapter 1",
      "psychologicalCue": "...",
      "relationships": ["..."]
    }
  ],
  "acts": [
    { "act": 1, "focus": "...", "beats": [ { "beat": 1, "summary": "...", "cluesRevealed": ["..."], "redHerring": "..." } ] },
    { "act": 2, "focus": "...", "beats": [ { "beat": 1, "summary": "..." } ] },
    { "act": 3, "focus": "...", "beats": [ { "beat": 1, "summary": "..." } ] }
  ],
  "clueMatrix": [
    { "clue": "...", "surfaceMeaning": "...", "realMeaning": "...", "appearsAtAct": 1, "mustForeshadow": true, "explicitForeshadowChapters": ["Chapter 1", "Chapter 2"], "isRedHerring": false }
  ],
  "clueNarrativeHints": {
    "某线索A": { "foreshadow": "通过某角色的细微动作暗示", "recoveryTone": "侦探以平静语气解密" }
  },
  "timeline": [
    { "time": "Day1 18:30", "event": "...", "participants": ["..."] }
  ],
  "chapterAnchors": [
    { "chapter": "Chapter 1", "dayCode": "Day1", "time": "10:00", "label": "...", "summary": "..." }
  ],
  "chapterBlueprints": [
    {
      "chapter": "Chapter 1",
      "wordTarget": 1600,
      "conflictGoal": "...",
      "backgroundNeeded": ["..."],
      "emotionalBeat": "..."
    }
  ],
  "emotionalBeats": [
    { "chapter": "Chapter 1", "focus": "嫌疑人嫉妒开始燃烧", "keywords": ["嫉妒", "紧张"], "delivery": "通过内心独白" }
  ],
  "misdirectionMoments": [
    { "chapter": "Chapter 2", "setup": "...", "surfaceInterpretation": "...", "revealHint": "...", "suspect": "..." }
  ],
  "solution": { "culprit": "...", "motiveCore": "...", "keyReveals": ["..."], "fairnessChecklist": ["..."] },
  "logicChecklist": ["所有诡计准备动作在谋杀发生前完成并写明时间", "每条关键线索至少在破案前两章有显式铺垫", "时间线与线索矩阵交叉验证无矛盾"],
  "themes": ["...", "..."]
}

要求：
1. 勿输出解释或额外文本，仅返回 JSON。
2. 明确描述诡计准备动作发生的具体时间（例如在谋杀前多少分钟），并写入 timeline。
3. 如果故事跨越多日，请在 timeline 中使用 Day1/Day2 等标注，并解释日期切换的因果关系。
4. 生成 chapterAnchors 数组，与章节一一对应，给出 DayX 与 HH:MM、现场标签与一句描述，并在 timeline.participants 中标注对应章节（如 "Chapter 1"）。
5. 在 chapterBlueprints 中为每章给出 wordTarget（1400-1900 之间）与 conflictGoal / backgroundNeeded / emotionalBeat，用于控制篇幅与情绪刻画。
6. 每位嫌疑人必须提供 motiveKeywords（不少于 2 个中文关键词）与 motiveScenes（指明章节或场景），并在 characterBackstories.chapterIntro 中说明首次出现位置。
7. 每条 clueMatrix 必须注明 explicitForeshadowChapters；若为误导性线索请设置 isRedHerring=true，并在 beats.redHerring 中安排对应戏份，同时于 clueNarrativeHints 给出表面/真实呈现方式。
8. 在 fairnessNotes 中指出读者能提前获知的证据与提示，同时说明哪些线索可能被误导性解读；在 emotionalBeats/misdirectionMoments 中指明触发该情绪或误导的章节。
9. 3 幕结构，每幕≥2 个 beat；角色≥6（含侦探/受害者/嫌疑/证人），至少 1 条红鲱鱼贯穿发展并最终澄清。
10. 线索≥4，覆盖时间/物证/证词等不同类型，并保证 mustForeshadow=true 的线索不少于 2 条；timeline 与 chapterAnchors、chapterBlueprints 的时间标签必须自洽。
11. 主题：${topic}，风格参考黄金时代本格推理。
  `.trim();
}

export function buildStage1PromptProfile(topic: string, opts?: PromptBuildOptions): string {
  const { system, user } = buildPlannerPrompt(topic, opts);
  return `${system}\n\n${user}`;
}

export function buildStage2Prompt(outline: DetectiveOutline): string {
  return `
以下是侦探故事的大纲（JSON）：
${JSON.stringify(outline, null, 2)}

章节规划建议：
${chapterGuidance(outline)}

篇幅与冲突目标：
${chapterBlueprintSummary(outline)}

嫌疑人与动机提示：
${suspectsSummary(outline)}

必须提前铺垫的线索：
${mustForeshadowSummary(outline)}

红鲱鱼运用建议：
${redHerringSummary(outline)}

氛围与感官指引：
${atmosphereSummary(outline)}

情绪节拍提醒：
${emotionalBeatsSummary(outline)}

误导节点安排：
${misdirectionMomentsSummary(outline)}

时间线提醒：
${timelineSummary(outline)}
${timelineDayNotes(outline)}

章节时间锚点：
${chapterAnchorSummary(outline)}

动机关键词提示：
${motiveKeywordChecklist(outline)}

请输出结构化 JSON，示例如下：
{
  "chapters": [
    {
      "title": "章节标题",
      "summary": "章节梗概",
      "wordCount": 1200,
      "content": "段落化正文，包含线索与情绪",
      "cluesEmbedded": ["线索名称"],
      "redHerringsEmbedded": ["误导线索名称"]
    }
  ],
  "overallWordCount": 0,
  "narrativeStyle": "第三人称 / 中等节奏 / 合理推理",
  "continuityNotes": ["检查出的连续性提醒"]
}

写作要求：
1. 总字数约 4500-5500 字。章节顺序需遵循“章节规划建议”，确保每一幕的节拍与线索完整呈现。
2. 每章首段必须以自然语言写出对应的 DayX HH:MM 时间提示（参照“章节时间锚点”）；若与大纲时间不同或需新增时间点，请在 continuityNotes 说明原因。
3. 在前两章通过对白或描写埋入每位嫌疑人的动机关键词（见“动机关键词提示”），并保持线索性的语境。
4. 线索必须通过自然描写或对白呈现，禁止使用 [CLUE] 等标签；对 mustForeshadow 线索至少提前两次暗示，并在 cluesEmbedded 中注明。
5. 红鲱鱼需在正文中制造合理误导，但在真相揭露时澄清误导来源，并在 redHerringsEmbedded 中列出实际使用的误导元素。
6. 不得引入大纲外的决定性证据；如必须新增，请在上一章或同章前半段做铺垫，并同步更新 cluesEmbedded。
7. 严格对照“篇幅与冲突目标”，控制每章内容在 wordTarget ±8% 区间；如不足请扩写背景、氛围或心理描写，并记录在 continuityNotes。
8. 依据“氛围与感官指引”在开篇两章体现环境与感官线索，结合“情绪节拍提醒”描写嫌疑人心理波动。
9. “误导节点安排”中的场景必须在指定章节出现，由侦探或角色行为触发，并在后续章节/结局中做自然澄清。
10. 结局章节需通过角色对话或侦探推理复盘关键线索，避免清单式罗列；同时补充至少一段 120 字以上的善后与人物情绪。
11. 若线索/情绪/篇幅存在偏差，请在 continuityNotes 中标记具体章节与处理方式，方便后续修订。
12. 整体使用第三人称客观视角，维持紧张而逻辑精密的氛围，语言保持少儿可读性（middle_grade）。
仅返回 JSON。`.trim();
}

export function buildStage2PromptProfile(outline: DetectiveOutline, opts?: PromptBuildOptions): string {
  const ctx = buildWriterPrompt(outline, opts);
  const tail = [
    '',
    '章节规划建议：',
    chapterGuidance(outline),
    '',
    '篇幅与冲突目标：',
    chapterBlueprintSummary(outline),
    '',
    '嫌疑人与动机提示：',
    suspectsSummary(outline),
    '',
    '必须提前铺垫的线索：',
    mustForeshadowSummary(outline),
    '',
    '红鲱鱼运用建议：',
    redHerringSummary(outline),
    '',
    '氛围与感官指引：',
    atmosphereSummary(outline),
    '',
    '情绪节拍提醒：',
    emotionalBeatsSummary(outline),
    '',
    '误导节点安排：',
    misdirectionMomentsSummary(outline),
    '',
    '时间线提示：',
    timelineSummary(outline),
    timelineDayNotes(outline),
    '',
    '章节时间锚点：',
    chapterAnchorSummary(outline),
    '',
    '动机关键词提示：',
    motiveKeywordChecklist(outline),
    '',
    '关键信息（需在正文中自然呈现）：',
    '- ' + cluesSummary(outline),
  ].join('\n');
  return `${ctx.system}\n\n${ctx.user}\n${tail}`;
}

export function buildStage3Prompt(outline: DetectiveOutline, draftJson: DetectiveStoryDraft): string {
  return `
故事大纲：
${JSON.stringify(outline, null, 2)}

故事正文草稿：
${JSON.stringify(draftJson, null, 2)}

请输出 JSON：
{
  "approved": false,
  "score": { "logic": 0-100, "fairness": 0-100, "pacing": 0-100 },
  "issues": [
    { "category": "logic|fairness|pacing|style", "detail": "...", "chapterRef": "..." }
  ],
  "suggestions": ["..."],
  "mustFixBeforePublish": ["..."],
  "contentWarnings": ["..."]
}

说明：
1. 如果存在关键逻辑漏洞或线索未回收，则 approved = false，并列入 mustFixBeforePublish。
2. 内容警告为可选，但若涉及暴力/血腥等需明确指出。
仅返回 JSON。`.trim();
}

export function buildStage3PromptProfile(outline: DetectiveOutline, draftJson: DetectiveStoryDraft, opts?: PromptBuildOptions): string {
  const ctx = buildEditorPrompt(opts);
  const body = [
    '故事大纲：',
    JSON.stringify(outline, null, 2),
    '',
    '故事正文草稿：',
    JSON.stringify(draftJson, null, 2),
  ].join('\n');
  const tail = [
    '请输出 JSON：',
    '{',
    '  "approved": false,',
    '  "score": { "logic": 0-100, "fairness": 0-100, "pacing": 0-100 },',
    '  "issues": [',
    '    { "category": "logic|fairness|pacing|style", "detail": "...", "chapterRef": "..." }',
    '  ],',
    '  "suggestions": ["..."],',
    '  "mustFixBeforePublish": ["..."],',
    '  "contentWarnings": ["..."]',
    '}',
    '说明：',
    '1. 如存在关键逻辑漏洞或线索未回收，则 approved=false，并列入 mustFixBeforePublish。',
    '2. 仅返回 JSON。',
  ].join('\n');
  return `${ctx.system}\n\n${ctx.user}\n\n${body}\n\n${tail}`;
}

export function buildStage4RevisionPrompt(
  outline: DetectiveOutline,
  draftJson: DetectiveStoryDraft,
  review: Record<string, unknown>,
  plan: RevisionPlan,
): string {
  const mustFixRuleIds = plan.mustFix
    .map((item) => {
      const match = item.detail.match(/\[([^\]]+)\]/);
      return match ? match[1] : null;
    })
    .filter((ruleId): ruleId is string => Boolean(ruleId));
  const requiresTimeline = mustFixRuleIds.some((ruleId) =>
    ['timeline-from-text', 'chapter-time-tags'].includes(ruleId),
  );
  const requiresMotives = mustFixRuleIds.includes('motive-foreshadowing');
  const requiresWordTargets = mustFixRuleIds.includes('chapter-word-target');
  const requiresEmotions = mustFixRuleIds.includes('emotional-beats');
  const requiresMisdirection = mustFixRuleIds.includes('misdirection-deployment');
  const requiresEnding = mustFixRuleIds.includes('ending-resolution');
  const hasUniquenessGap = detectUniquenessGap(plan);
  const pendingMotiveCandidates = Array.isArray(draftJson.motivePatchCandidates)
    ? draftJson.motivePatchCandidates.filter((candidate) => candidate.status === 'pending')
    : [];
  const motiveCandidateText = pendingMotiveCandidates.length
    ? pendingMotiveCandidates
        .map(
          (candidate, idx) =>
            `${idx + 1}. Chapter ${candidate.chapterIndex + 1}｜${candidate.suspect || '嫌疑人'}｜关键词「${
              candidate.keyword
            }」→ ${candidate.suggestedSentence}`,
        )
        .join('\n')
    : '（无）';
  const criticalLines = [
    requiresTimeline
      ? '为所有章节首段补写 DayX HH:MM 的自然语言时间提示，并对照 timeline 更新 continuityNotes 说明理由。'
      : null,
    requiresMotives
      ? '在 Chapter 1-2 通过对白或描写补充嫌疑人动机关键词，使其与 Stage1 提供的 motiveKeywords 对应。'
      : null,
    requiresWordTargets
      ? '依据大纲 wordTarget 扩写或删减章节内容，使篇幅保持在目标 ±8% 区间，并在 revisionNotes 标记调整。'
      : null,
    requiresEmotions
      ? '补写情绪节拍：在指定章节植入 emotionalBeats 中的关键词与心理描写，使读者感知情绪波动。'
      : null,
    requiresMisdirection
      ? '补充误导节点：在对应章节强化误导细节，并确保后续章节通过 revealHint 相关线索澄清。'
      : null,
    requiresEnding
      ? '结尾需新增 ≥120 字的善后段落，交代事件解决后的状态与人物情绪，可参考模板“后来……最终……孩子们……”，保持自然叙写。'
      : null,
    hasUniquenessGap
      ? '补写竞争嫌疑与误导：在正文加入至少一位替代嫌疑人/关键红鲱鱼，确保 Beta Reader 难以在中途锁定真凶。'
      : null,
  ].filter((line): line is string => Boolean(line));
  const criticalGuidance = criticalLines.length
    ? criticalLines.map((line) => `- ${line}`).join('\n')
    : '- 请逐条处理 Must Fix 项，并在 revisionNotes 中说明调整。';
  return `
故事大纲（供参考，请勿违背核心诡计）：
${JSON.stringify(outline, null, 2)}

现有故事草稿：
${JSON.stringify(draftJson, null, 2)}

审稿反馈：
${JSON.stringify(review, null, 2)}

待处理的 Must Fix 列表：
${formatRevisionItems(plan.mustFix)}

需要关注的其他警告与提醒：
${formatRevisionItems(plan.warnings)}

可选优化建议：
${plan.suggestions.length ? plan.suggestions.map((s, idx) => `${idx + 1}. ${s}`).join('\n') : '（无）'}

动机伏笔候选（可基于下述提示改写为自然场景）：
${motiveCandidateText}

重点修复提示：
${criticalGuidance}

修订要求：
1. 必须逐条解决 Must Fix 问题，并优先完成“重点修复提示”中的校验项目；若存在时间线或线索矛盾，请在正文修正并记录 revisionNotes。
2. 优先处理逻辑与公平性相关警告；若发现原始大纲信息不足，可在 continuityNotes 中记录补充设定，但正文必须自洽。
3. 仅在必要章节进行增删改，保持原有结构与篇幅；禁止删除已确认的关键线索。
4. 若需补写时间或动机伏笔，请在章节首段与 Chapter 1-2 中自然融入 DayX HH:MM 与动机关键词，可参考“动机伏笔候选”列表，并同步更新 cluesEmbedded/redHerringsEmbedded 与 continuityNotes。
5. 使用第三人称中文叙述，保持 middle_grade 读者可读性；新增线索或伏笔后需更新相关字段。
6. 输出完整的故事 JSON，字段同 Stage2（chapters、overallWordCount、narrativeStyle、continuityNotes），并额外提供 revisionNotes 描述所做改动。
仅返回 JSON。`.trim();
}

export function buildStage4RevisionPromptProfile(
  outline: DetectiveOutline,
  draftJson: DetectiveStoryDraft,
  review: Record<string, unknown>,
  plan: RevisionPlan,
  opts?: PromptBuildOptions,
): string {
  const ctx = buildWriterPrompt(outline, opts);
  const mustFixRuleIds = plan.mustFix
    .map((item) => {
      const match = item.detail.match(/\[([^\]]+)\]/);
      return match ? match[1] : null;
    })
    .filter((ruleId): ruleId is string => Boolean(ruleId));
  const requiresTimeline = mustFixRuleIds.some((ruleId) =>
    ['timeline-from-text', 'chapter-time-tags'].includes(ruleId),
  );
  const requiresMotives = mustFixRuleIds.includes('motive-foreshadowing');
  const requiresWordTargets = mustFixRuleIds.includes('chapter-word-target');
  const requiresEmotions = mustFixRuleIds.includes('emotional-beats');
  const requiresMisdirection = mustFixRuleIds.includes('misdirection-deployment');
  const requiresEnding = mustFixRuleIds.includes('ending-resolution');
  const uniquenessGapProfile = detectUniquenessGap(plan);
  const pendingMotiveCandidates = Array.isArray(draftJson.motivePatchCandidates)
    ? draftJson.motivePatchCandidates.filter((candidate) => candidate.status === 'pending')
    : [];
  const motiveCandidateText = pendingMotiveCandidates.length
    ? pendingMotiveCandidates
        .map(
          (candidate, idx) =>
            `${idx + 1}. Chapter ${candidate.chapterIndex + 1}｜${candidate.suspect || '嫌疑人'}｜关键词「${
              candidate.keyword
            }」→ ${candidate.suggestedSentence}`,
        )
        .join('\n')
    : '（无）';
  const criticalLines = [
    requiresTimeline
      ? '补齐章节首段的 DayX HH:MM 时间提示，并在 Continuity Notes 记录差异原因。'
      : null,
    requiresMotives
      ? '在前两章通过对白或细节植入嫌疑人的动机关键词，使读者可在结局前两次察觉。'
      : null,
    requiresWordTargets
      ? '对照 wordTarget 调整章节篇幅（±8%），不足时补写场景/心理，超出时精简冗余描述。'
      : null,
    requiresEmotions
      ? '在情绪节拍指定章节补写 emotionalBeats 的关键词与心理活动。'
      : null,
    requiresMisdirection
      ? '强化误导节点并在后续章节用 revealHint 相关情节完成澄清。'
      : null,
    requiresEnding
      ? '为结尾新增 ≥120 字的善后段，交代角色状态与未来安排，可套用“后来……最终……孩子们……”结构并写成完整段落。'
      : null,
    uniquenessGapProfile
      ? '补写竞争嫌疑、误导与替代路径，确保读者在终局前至少面对两名可疑对象。'
      : null,
  ].filter((line): line is string => Boolean(line));
  const criticalGuidance = criticalLines.length
    ? criticalLines.map((line) => `- ${line}`).join('\n')
    : '- 逐条落实 Must Fix 与 Warn 项，完成后在 revisionNotes 标记。';
  const tail = [
    '—— 修订上下文 ——',
    '',
    '待处理的 Must Fix 列表：',
    formatRevisionItems(plan.mustFix),
    '',
    '需要关注的其他警告：',
    formatRevisionItems(plan.warnings),
    '',
    '可选建议：',
    plan.suggestions.length ? plan.suggestions.map((s, idx) => `${idx + 1}. ${s}`).join('\n') : '（无）',
    '',
    '动机伏笔候选（可基于下述提示改写为自然场景）：',
    motiveCandidateText,
    '',
    '重点修复提示：',
    criticalGuidance,
  ].join('\n');
  return [
    ctx.system,
    '',
    ctx.user,
    '',
    '故事大纲：',
    JSON.stringify(outline, null, 2),
    '',
    '当前故事草稿：',
    JSON.stringify(draftJson, null, 2),
    '',
    '审稿反馈：',
    JSON.stringify(review, null, 2),
    '',
    tail,
  ].join('\n');
}
