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
    return `${label}${meaning}`;
  }).filter(Boolean) as string[];
  return lines.join('\n- ');
}

// 兼容旧实现：直接内联规范
export function buildStage1Prompt(topic: string): string {
  return `
请根据以下输入生成严格的 JSON（请勿包含注释或多余文本）：
{  
  "centralTrick": { "summary": "...", "mechanism": "...", "fairnessNotes": ["..."] },
  "caseSetup": { "victim": "...", "crimeScene": "...", "initialMystery": "..." },
  "characters": [
    { "name": "...", "role": "detective|suspect|victim|witness", "motive": "...", "secrets": ["..."] }
  ],
  "acts": [
    { "act": 1, "focus": "...", "beats": [ { "beat": 1, "summary": "...", "cluesRevealed": ["..."], "redHerring": "..." } ] },
    { "act": 2, "focus": "...", "beats": [ { "beat": 1, "summary": "..." } ] },
    { "act": 3, "focus": "...", "beats": [ { "beat": 1, "summary": "..." } ] }
  ],
  "clueMatrix": [
    { "clue": "...", "surfaceMeaning": "...", "realMeaning": "...", "appearsAtAct": 1, "mustForeshadow": true, "explicitForeshadowChapters": ["Chapter 1", "Chapter 2"] }
  ],
  "timeline": [
    { "time": "Day1 18:30", "event": "...", "participants": ["..."] }
  ],
  "solution": { "culprit": "...", "motiveCore": "...", "keyReveals": ["..."], "fairnessChecklist": ["..."] },
  "logicChecklist": ["所有诡计准备动作在谋杀发生前完成并写明时间", "每条关键线索至少在破案前两章有显式铺垫", "时间线与线索矩阵交叉验证无矛盾"],
  "themes": ["...", "..."]
}

要求：
1. 勿输出解释或额外文本，仅返回 JSON。
2. 明确描述诡计准备动作发生的具体时间（例如在谋杀前多少分钟），并写入 timeline。
3. 每条 clueMatrix 必须注明在哪些章节显式埋设（explicitForeshadowChapters）。
4. 在 fairnessNotes 中指出读者能提前获知的证据与提示。
5. 3 幕结构，每幕≥2 个 beat；角色≥6（含侦探/受害者/嫌疑/证人）。
6. 线索≥4，覆盖时间/物证/证词等不同类型。
9. 主题：${topic}，风格参考黄金时代本格推理。
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

时间线提示（请在正文中自然呈现真实时间点）：
${timelineSummary(outline)}

关键信息（请勿凭空创造决定性证据）：
- ${cluesSummary(outline)}

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
1. 总字数约 4500-5500 字，每章按照大纲顺序展开完整事件弧。
2. 线索必须通过自然描写或对白呈现，禁止使用 [CLUE] 等符号标签；在揭晓前至少两次提及 mustForeshadow 线索。
3. 章节中如出现时间点，请在句子中说明（例如：“真实时间 20:05，灯塔再次响起。”）。
4. 不得引入大纲外的决定性证据，如确需补充，必须在前章铺垫并写入 cluesEmbedded。
5. 结局章节需逐条回收关键线索，解释机关运作与凶手动机，给出善后场景。
6. 对话、感官描写与情绪应符合 middle_grade 阅读级别，避免过度暴力或恐怖细节。
仅返回 JSON。`.trim();
}

export function buildStage2PromptProfile(outline: DetectiveOutline, opts?: PromptBuildOptions): string {
  const ctx = buildWriterPrompt(outline, opts);
  const tail = [
    '',
    '时间线提示：',
    timelineSummary(outline),
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
