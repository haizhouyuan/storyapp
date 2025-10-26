import fs from 'fs';
import path from 'path';
import { resolvePromptProfile, PromptProfileName, PromptProfile } from './promptProfiles';
import type { DetectiveOutline } from '@storyapp/shared';

export interface PromptBuildOptions {
  profile?: PromptProfileName;
  seed?: number | string;
  vars?: Record<string, unknown>;
}

function readTemplate(file: string): string | null {
  const p1 = path.resolve(process.cwd(), 'backend/prompts/templates', file);
  const p2 = path.resolve(process.cwd(), 'prompts/templates', file);
  if (fs.existsSync(p1)) return fs.readFileSync(p1, 'utf8');
  if (fs.existsSync(p2)) return fs.readFileSync(p2, 'utf8');
  return null;
}

function get(obj: any, key: string): any {
  return key.split('.').reduce((acc, k) => (acc && acc[k] !== undefined ? acc[k] : undefined), obj);
}

function render(template: string, context: Record<string, any>): string {
  return template.replace(/\{\{\s*([\w\.]+)\s*\}\}/g, (_m, key) => {
    const val = get(context, key);
    return val === undefined || val === null ? '' : String(val);
  });
}

export function buildPlannerPrompt(topic: string, options?: PromptBuildOptions): { system: string; user: string; profile: PromptProfile } {
  const profile = resolvePromptProfile(options?.profile);
  const systemTpl = readTemplate('planner.system.hbs');
  const system = systemTpl || '你是剧情规划器。仅输出严格 JSON。禁止解释。';

  const vars = (options?.vars || {}) as Record<string, unknown>;
  let deviceKeywords: string[] = [];
  const deviceRealismHint = typeof vars.deviceRealismHint === 'string' ? String(vars.deviceRealismHint).trim() : undefined;
  const rawDevice = vars.deviceKeywords ?? vars.deviceVariant;
  if (Array.isArray(rawDevice)) {
    deviceKeywords = rawDevice.map((item) => String(item).trim()).filter(Boolean);
  } else if (typeof rawDevice === 'string' && rawDevice.trim()) {
    deviceKeywords = rawDevice.split(/[,，\/\s]+/).map((x) => x.trim()).filter(Boolean);
  } else if (Array.isArray(profile.planner.enforceDeviceKeywords) && profile.planner.enforceDeviceKeywords.length > 0) {
    deviceKeywords = profile.planner.enforceDeviceKeywords;
  }

  const readingLevel = typeof vars.readingLevel === 'string' ? vars.readingLevel : undefined;
  const storyLength = typeof vars.storyLength === 'string' ? vars.storyLength : undefined;
  const wordsPerScene = get(vars, 'targets.wordsPerScene');
  const contractSnippetRaw = typeof vars.mysteryContractSnippet === 'string'
    ? String(vars.mysteryContractSnippet).trim()
    : undefined;
  const contractPrelude = contractSnippetRaw
    ? [
        '【创作契约与诡计模式（遵循福尔摩斯/波洛范式）】',
        contractSnippetRaw,
        '',
      ]
    : [];

  const blueprintSkeleton = [
    '{',
    '  "title": "...",',
    '  "actsCount": 3,',
    '  "centralTrick": { "summary": "...", "mechanism": "...", "fairnessNotes": ["..."] },',
    '  "caseSetup": { "victim": "...", "crimeScene": "...", "initialMystery": "..." },',
    '  "characters": [ { "id": "c1", "name": "...", "role": "detective|suspect|victim|witness", "motive": "...", "personality": "...", "arc": "...", "arcBeats": [ { "chapter": "Chapter 2", "description": "..." } ], "secrets": ["..."], "redHerring": false } ],',
    '  "locations": [ { "id": "L1", "name": "...", "kind": "..." } ],',
    '  "secondaryMysteries": [ { "id": "M1", "question": "...", "foreshadowing": ["..."], "resolution": "...", "payoffChapter": "Chapter 3" } ],',
    '  "falseSolution": "Chapter 3 侦探误指嫌疑人A，后在结局澄清其无罪。",',
    '  "twists": [ "嫌疑人A的证词被推翻是真相突破口", { "summary": "密室是伪装，真正案发地点在地下室", "chapter": "Chapter 4" } ],',
    '  "acts": [ { "act": 1, "focus": "...", "beats": [ { "scene_id": "S1", "summary": "...", "cluesRevealed": ["..."], "redHerring": "...", "misleadPoint": false } ] } ],',
    '  "chapterAnchors": [ { "chapter": "Chapter 1", "dayCode": "Day1", "time": "10:00", "label": "...", "summary": "..." } ],',
    '  "chapterBlueprints": [ { "chapter": "Chapter 1", "wordTarget": 1600, "conflictGoal": "...", "backgroundNeeded": ["..."], "emotionalBeat": "..." } ],',
    '  "emotionalBeats": [ { "chapter": "Chapter 2", "focus": "侦探陷入怀疑", "delivery": "内心独白", "keywords": ["怀疑", "焦虑"] } ],',
    '  "misdirectionMoments": [ { "chapter": "Chapter 2", "setup": "...", "surfaceInterpretation": "...", "revealHint": "...", "suspect": "...", "intensity": "medium" } ],',
    '  "clueMatrix": [ { "clue": "...", "surfaceMeaning": "...", "realMeaning": "...", "appearsAtAct": 1, "mustForeshadow": true, "explicitForeshadowChapters": ["Chapter 1","Chapter 3"], "isRedHerring": false } ],',
    '  "timeline": [ { "time": "Day1 20:00", "event": "...", "participants": ["..."] } ],',
    '  "solution": { "culprit": "...", "motiveCore": "...", "keyReveals": ["..."], "fairnessChecklist": ["..."] },',
    '  "fairnessNotes": ["..."],',
    '  "logicChecklist": ["..."],',
    '  "themes": ["...", "..."]',
    '}',
  ].join('\n');

  const instructionLines: string[] = [
    ...contractPrelude,
    `主题：${topic}`,
    '仅返回 StoryBlueprint JSON（禁止额外说明、注释或代码块）。',
    '必须包含字段：centralTrick、caseSetup、characters（≥6）、locations、actsCount、acts、secondaryMysteries、falseSolution、twists、chapterAnchors、chapterBlueprints、emotionalBeats、misdirectionMoments、clueMatrix、timeline（使用 "DayX HH:MM"）、solution、fairnessNotes、logicChecklist、themes。',
    '根级字段只能包含：title、actsCount、centralTrick、caseSetup、characters、locations、secondaryMysteries、falseSolution、twists、acts、chapterAnchors、chapterBlueprints、emotionalBeats、misdirectionMoments、clueMatrix、timeline、solution、fairnessNotes、logicChecklist、themes。禁止添加其他根级键。',
    '所有键名必须使用双引号包裹（例如 "locations": [...]），严禁出现 locations: [...]、acts: [...] 等未加引号的写法；所有字符串也必须使用双引号。',
    '即使某些字段暂时没有实体（如 fairnessNotes、logicChecklist、themes），也必须输出对应键并赋值为空数组 []，不得省略或保留空白。',
    'solution 字段必须完整给出 culptit、motiveCore、keyReveals、fairnessChecklist，并在其后紧跟 fairnessNotes、logicChecklist、themes 三个数组字段，顺序不可更改。',
    '字段格式示例：centralTrick 要含 summary、mechanism、fairnessNotes；acts 是包含 act、focus、beats 的数组，其中 beats 需提供 scene_id、summary、cluesRevealed、redHerring、misleadPoint；clueMatrix 要含 clue、surfaceMeaning、realMeaning、appearsAtAct、mustForeshadow、explicitForeshadowChapters（可写 "Chapter 1"~"Chapter 6"）、isRedHerring。',
    'timeline 必须为数组，每项包含 time（如 "Day1 20:00"）、event、participants（字符串数组，可写涉事角色或 "Chapter N"）。',
    '严格遵循以下 StoryBlueprint 骨架（字段不可缺失、不可改名、不可额外扩展）：',
    blueprintSkeleton,
    '禁止输出 "structure"、"chapters"、"scenes" 等非模板字段；章节节点必须放在 acts[].beats[] 中，并使用唯一 scene_id。',
    '所有角色姓名需为 2-3 个中文汉字，可自行翻译外文名，禁止出现英文或连字符。',
    '禁止输出除最终 JSON 以外的任何文字、提示或解释；不要包含 ```json、首先、说明 等前缀或后缀。',
  ];

  if (deviceKeywords.length > 0) {
    instructionLines.push(`中心奇迹请围绕以下关键词设计变体，但允许合理扩展：${deviceKeywords.join('、')}`);
  } else {
    instructionLines.push('中心奇迹请设计一套可行的机关或诡计，可选择机械、电磁、光影、心理等不同思路，避免重复使用单一套路（如潮汐/风道）。');
  }
  if (deviceRealismHint) {
    instructionLines.push(`机关现实提示：${deviceRealismHint}`);
  }
  instructionLines.push('centralTrick.summary 与 centralTrick.mechanism 必须写成完整句子，严禁留空或使用“待定”等占位描述。');

  const rawActsCountInput = get(vars, 'actsCount');
  let actsCount: number | undefined;
  if (typeof rawActsCountInput === 'number' && Number.isFinite(rawActsCountInput)) {
    actsCount = rawActsCountInput;
  } else if (typeof rawActsCountInput === 'string' && rawActsCountInput.trim()) {
    const parsed = Number(rawActsCountInput.trim());
    if (Number.isFinite(parsed)) {
      actsCount = parsed;
    }
  }
  if (typeof actsCount === 'number') {
    actsCount = Math.max(3, Math.floor(actsCount));
  }
  const normalizedStoryLength = typeof storyLength === 'string' ? storyLength.toLowerCase() : '';
  if (actsCount === undefined) {
    if (normalizedStoryLength.includes('长') || normalizedStoryLength.includes('long')) {
      actsCount = 4;
    } else if (normalizedStoryLength.includes('短') || normalizedStoryLength.includes('micro')) {
      actsCount = 3;
    }
  }
  if (!actsCount) {
    actsCount = 3;
  }
  instructionLines.push(`本故事采用 ${actsCount} 幕结构，每幕≥2个 beats，actsCount 字段请写为 ${actsCount}。`);

  instructionLines.push('characters[].personality、arc 字数≤60，arcBeats 至少包含 1 个节点并说明章节。');
  instructionLines.push('falseSolution 字数≤120，用 2-3 句描述错误推理与澄清节点。');
  instructionLines.push('twists 至少 1 项，单项≤80 字，可混合字符串或对象；确保至少一个反转位于中后段。');
  instructionLines.push('secondaryMysteries 至少 1 条，question 与 resolution 均≤80 字，并提供 payoffChapter。');
  instructionLines.push('acts[].beats[].summary ≤120 字；clueMatrix 的 clue/surfaceMeaning/realMeaning 均≤80 字。');

  if (profile.planner.requireCh1Foreshadow) {
    instructionLines.push('Chapter 1 必须显式铺垫至少 2 条关键线索，并在 clueMatrix.explicitForeshadowChapters 中标注。');
  } else {
    instructionLines.push('确保每条关键线索在揭晓前至少出现一次，clueMatrix.explicitForeshadowChapters 准确标注铺垫章节。');
  }

  instructionLines.push('fairnessNotes 请列出读者可提前得知的证据提示，并说明公平性。');

  if (profile.planner.includeMechanismMilestones) {
    instructionLines.push('时间线需使用 "DayX HH:MM" 格式，列出机关触发点、关键调查事件与相关环境变化。');
  } else {
    instructionLines.push('时间线需使用 "DayX HH:MM" 格式，覆盖案发全过程的关键节点。');
  }

  if (readingLevel) {
    instructionLines.push(`阅读级别：${readingLevel}，保持适龄用语。`);
  }
  if (storyLength) {
    instructionLines.push(`故事篇幅偏好：${storyLength}。`);
  }
  if (Number.isFinite(Number(wordsPerScene))) {
    instructionLines.push(`每章目标字数：约 ${wordsPerScene}±15%。`);
  }
  if (options?.seed !== undefined) {
    instructionLines.push(`随机性种子：${options.seed}`);
  }

  const userTpl = readTemplate('planner.user.hbs');
  let user: string;
  if (userTpl) {
    const ctx = {
      topic,
      profile,
      seed: options?.seed,
      deviceKeywords: deviceKeywords.join('、'),
      readingLevel,
      storyLength,
      wordsPerScene,
      ...(options?.vars || {}),
      instructions: instructionLines.join('\n'),
    };
    user = render(userTpl, ctx);
  } else {
    user = instructionLines.join('\n');
  }

  return { system, user, profile };
}

export function buildPlannerAdvisorPrompt(
  outline: DetectiveOutline,
  options?: PromptBuildOptions,
): { system: string; user: string; profile: PromptProfile } {
  const profile = resolvePromptProfile(options?.profile);
  const systemTpl = readTemplate('planner.advisor.system.hbs');
  const userTpl = readTemplate('planner.advisor.user.hbs');
  const system =
    systemTpl ||
    '你是一名推理小说剧情顾问。阅读现有蓝图，识别复杂度不足或误导缺失的问题，并以 JSON 形式给出改进建议。禁止输出解释性文字。';

  const diagnosticsLimit = Number(get(options?.vars || {}, 'advisor.maxDiagnostics')) || 5;
  const advisorVars = ((options?.vars || {}) as Record<string, unknown>).advisor as Record<string, unknown> | undefined;
  const deficits = Array.isArray(advisorVars?.deficits)
    ? advisorVars!.deficits!.filter(
        (item): item is string => typeof item === 'string' && item.trim().length > 0,
      )
    : [];
  const metrics = advisorVars?.metrics && typeof advisorVars.metrics === 'object' ? advisorVars.metrics : undefined;
  const ctx = {
    outline: JSON.stringify(outline, null, 2),
    diagnosticsLimit,
    profile,
    deficits,
    metrics: metrics ? JSON.stringify(metrics, null, 2) : undefined,
  };
  const user =
    userTpl ||
    [
      '请阅读以下 StoryBlueprint JSON，并返回严格的建议 JSON：',
      '{{outline}}',
      '',
      deficits && deficits.length > 0
        ? `待重点优化的问题：${deficits.map((item) => item.trim()).join('；')}。`
        : '若识别到复杂度或误导不足之处，请在 diagnostics 中列出。',
      metrics ? `（参考指标）\n${metrics}` : '',
      '',
      '输出格式：',
      '{',
      '  "diagnostics": ["问题描述（≤60字）"],',
      '  "patch": {',
      '    "actsCount": 4,',
      '    "falseSolution": "...",',
      '    "twists": ["...", { "summary": "...", "chapter": "Chapter 3" }],',
      '    "secondaryMysteries": [ { "id": "M2", "question": "...", "resolution": "...", "payoffChapter": "Chapter 4" } ],',
      '    "misdirectionMoments": [ { "chapter": "Chapter 2", "setup": "...", "surfaceInterpretation": "...", "revealHint": "...", "suspect": "..." } ]',
      '  },',
      '  "notes": ["补充说明（可选，≤60字）"]',
      '}',
      '',
      `约束：diagnostics 最多 ${diagnosticsLimit} 条；patch 字段仅可包含 actsCount、falseSolution、twists、secondaryMysteries、misdirectionMoments、emotionalBeats、logicChecklist、fairnessNotes 的补充或替换；如无建议请返回空数组/对象。不得重复原蓝图文本，避免超过 120 字的长段。`,
      '仅返回 JSON，禁止包含 ```json 等标记。',
    ]
      .join('\n')
      .replace('{{outline}}', ctx.outline);

  if (userTpl) {
    return { system, user: render(userTpl, { ...ctx }), profile };
  }

  return { system, user, profile };
}

export function buildWriterPrompt(outline: any, options?: PromptBuildOptions): { system: string; user: string; profile: PromptProfile } {
  const profile = resolvePromptProfile(options?.profile);
  const systemTpl = readTemplate('writer.system.hbs');
  const userTpl = readTemplate('writer.user.hbs');
  const system = systemTpl || '你是儿童向长篇小说写作引擎。只输出指定 JSON 字段。';
  // 支持从 vars 里读取目标字数（多种命名兼容）
  const vars = (options?.vars || {}) as Record<string, unknown>;
  const pick = (o: any, keys: string[]): any => {
    for (const k of keys) {
      const v = get(o, k);
      if (v !== undefined && v !== null && v !== '') return v;
    }
    return undefined;
  };
  const wordsTargetRaw = pick(vars, ['targets.wordsPerScene', 'targetWords', 'words']);
  const wordsTarget = typeof wordsTargetRaw === 'string' ? parseInt(wordsTargetRaw as string, 10) : (wordsTargetRaw as number | undefined);
  const wordsLineFooter = wordsTarget && Number.isFinite(wordsTarget) && wordsTarget > 0
    ? `字数提示：每章目标约 ${wordsTarget}±15%，如需节奏变化请在章节摘要标明原因。`
    : '';
  const wordsTargetText = wordsTarget && Number.isFinite(wordsTarget) && wordsTarget > 0
    ? `${wordsTarget}±15%`
    : '约1200字';
  const dialoguesRaw = pick(vars, ['writer.dialoguesMin', 'dialoguesMin']);
  const relationsRaw = pick(vars, ['writer.sensoryHooks', 'sensoryHooks']);
  const anchorsRaw = pick(vars, ['writer.themeAnchors', 'themeAnchors']);
  const dialoguesTarget = Number.isFinite(Number(dialoguesRaw)) ? Number(dialoguesRaw) : (profile.writer.dialoguesMin ?? 4);
  const sensoryTarget = Number.isFinite(Number(relationsRaw)) ? Number(relationsRaw) : (profile.writer.sensoryHooks ?? 2);
  let themeAnchors: string[] = [];
  if (Array.isArray(anchorsRaw)) {
    themeAnchors = anchorsRaw.map((v) => String(v).trim()).filter(Boolean);
  } else if (typeof anchorsRaw === 'string') {
    themeAnchors = anchorsRaw.split(',').map((v) => v.trim()).filter(Boolean);
  } else if (Array.isArray(profile.writer.themeAnchors)) {
    themeAnchors = profile.writer.themeAnchors;
  }
  const themeAnchorsLine = themeAnchors.length
    ? `重复呼应主题锚点（每章≥1次）：${themeAnchors.join(' / ')}。`
    : '';
  const mechanismHintRaw = pick(vars, ['mechanismRealismHint', 'deviceRealismHint']);
  const mechanismRealismLine = mechanismHintRaw ? `现实说明提示：${mechanismHintRaw}` : '';

  const userBase = userTpl || [
    '请根据以下 StoryBlueprint 输出结构化的章节草稿，仅返回 JSON：',
    '{ "chapters": [ { "title": "...", "summary": "...", "content": "...", "words": 1200, "cluesEmbedded": [], "redHerringsEmbedded": [] } ] }',
    '',
    '大纲：\n{{outline}}',
    '',
    '写作要求：',
    `1) 章节顺序与大纲 acts/beats 对齐，生成 3~4 章完整故事，每章字数目标：${wordsTarget ? `${wordsTarget}±15%` : '约1200字'}，字段包含 title/summary/content/wordCount/cluesEmbedded/redHerringsEmbedded。`,
    '2) 必须以自然语句铺垫线索，禁止使用 [CLUE] 或其他符号标记；正文中应让读者通过场景、对白或物证得知线索名称。',
    `3) Chapter 1 在剧情中自然呈现至少 {{profile.writer.chapter1CluesMinCount}} 条关键线索；必要时安排证人对白或细节描写。`,
    `4) 每章不少于 {{dialoguesTarget}} 轮对话（使用中文引号“”且每轮不超过 26 字），并融入 ≥{{sensoryTarget}} 条声光味触等感官描写。`,
    `5) 若蓝图提供机关关键词，请在情节中给出可观察迹象，并在结局解释机关如何运作；误导线索数量不得超过真实线索的 {{profile.writer.maxRedHerringRatio}} 倍。`,
    `6) 第三章需包含对峙与复盘，逐条回收关键线索，揭示凶手动机与机关原理；故事以清晰的善后场景收尾。`,
    '7) 句长目标：≤{{profile.writer.sentenceTarget}}，遇长句请拆分；保持少儿友好语气与中等阅读难度。',
    '8) 每章结尾需留下未解的疑问或悬念（非终章必须以问句或悬念语结尾），引导读者继续推理。',
    '9) 当 fairnessNotes 或 secondaryMysteries 指出可提示读者的线索时，请在对应场景加入简短旁白或侦探内心提醒（如“你也许察觉到……”），保持自然表达。',
    '{{themeAnchorsLine}}',
    '{{wordsLine}}',
    '仅返回 JSON。'
  ].join('\n');
  const ctx = {
    outline: JSON.stringify(outline, null, 2),
    profile,
    seed: options?.seed,
    wordsLine: wordsLineFooter,
    wordsTargetText,
    dialoguesTarget,
    sensoryTarget,
    mechanismRealismLine,
    themeAnchorsLine,
    ...(vars),
  };
  const renderedBase = render(userBase, ctx);
  if (userTpl) {
    const user = render(userTpl, { ...ctx, instructions: renderedBase });
    return { system, user, profile };
  }
  return { system, user: renderedBase, profile };
}

export function buildEditorPrompt(options?: PromptBuildOptions): { system: string; user: string; profile: PromptProfile } {
  const profile = resolvePromptProfile(options?.profile);
  const systemTpl = readTemplate('editor.system.hbs');
  const userTpl = readTemplate('editor.user.hbs');
  const system = systemTpl || '你是分级编辑器。保持剧情不变，控制句长、词频，删除不当用词。只返回同结构 JSON。';
  // 读取目标字数（可选），用于扩写/压缩策略
  const vars = (options?.vars || {}) as Record<string, unknown>;
  const pick = (o: any, keys: string[]): any => {
    for (const k of keys) {
      const seg = k.split('.');
      let cur: any = o; let ok = true;
      for (const kk of seg) { if (cur && kk in cur) cur = (cur as any)[kk]; else { ok=false; break; } }
      if (ok && cur !== undefined && cur !== null && cur !== '') return cur;
    }
    return undefined;
  };
  const wordsTargetRaw = pick(vars, ['targets.wordsPerScene', 'targetWords', 'words']);
  const wordsTarget = typeof wordsTargetRaw === 'string' ? parseInt(wordsTargetRaw as string, 10) : (wordsTargetRaw as number | undefined);
  const minPct = 0.85, maxPct = 1.15;
  const lengthLine = wordsTarget && Number.isFinite(wordsTarget) && wordsTarget > 0
    ? `若当前字数 < ${Math.round(wordsTarget*minPct)} 则扩写至约 ${wordsTarget}±15%；若 > ${Math.round(wordsTarget*maxPct)} 则压缩至约 ${wordsTarget}±15%。`
    : '';
  const dialoguesRaw = pick(vars, ['writer.dialoguesMin', 'dialoguesMin']);
  const sensoryRaw = pick(vars, ['writer.sensoryHooks', 'sensoryHooks']);
  const anchorsRaw = pick(vars, ['writer.themeAnchors', 'themeAnchors']);
  const dialoguesTarget = Number.isFinite(Number(dialoguesRaw)) ? Number(dialoguesRaw) : (profile.writer.dialoguesMin ?? 4);
  const sensoryTarget = Number.isFinite(Number(sensoryRaw)) ? Number(sensoryRaw) : (profile.writer.sensoryHooks ?? 2);
  let themeAnchors: string[] = [];
  if (Array.isArray(anchorsRaw)) {
    themeAnchors = anchorsRaw.map((v) => String(v).trim()).filter(Boolean);
  } else if (typeof anchorsRaw === 'string') {
    themeAnchors = anchorsRaw.split(',').map((v) => v.trim()).filter(Boolean);
  } else if (Array.isArray(profile.writer.themeAnchors)) {
    themeAnchors = profile.writer.themeAnchors;
  }

  const userBase = userTpl || [
    '阅读级别 middle_grade；去除可能引发噩梦的描写（血腥/细节化暴力）。',
    '规范标点：{{profile.editor.normalizePunctuation}}',
    '保持剧情不变，优先：拆长句、精炼冗词、替换不当词。',
    `若对白不足（<{{dialoguesTarget}} 轮），请优先把说明句转换为问答形式，确保信息量不变。`,
    `补足感官细节：至少保留或补写 {{sensoryTarget}} 条声光味触描写。`,
    themeAnchors.length ? `确保主题锚点（${themeAnchors.join(' / ')}）在本章仍有呼应，必要时补写1-2句。` : '',
    '{{lengthLine}}',
    '输入：章节 JSON（包含 scene_id,title,words,text）。',
    '输出：同结构 JSON（仅修订 text）。',
    '仅返回 JSON。'
] .join('\n');
  const ctx = { profile, lengthLine, dialoguesTarget, sensoryTarget, ...(vars) };
  const user = (function(){
    // simple mustache-like rendering
    const renderStr = (tpl: string, context: Record<string, any>) => tpl.replace(/\{\{\s*([\w\.]+)\s*\}\}/g, (_m, key) => {
      const parts = key.split('.');
      let cur: any = context;
      for (const k of parts) { if (cur && k in cur) cur = cur[k]; else { cur=''; break; } }
      return String(cur ?? '');
    });
    return renderStr(userBase, ctx);
  })();
  return { system, user, profile };
}
