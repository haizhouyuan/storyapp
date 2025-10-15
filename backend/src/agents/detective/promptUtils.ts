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

时间线提示（必须严格遵守，且在叙事中以括号时间标注）：
${timelineSummary(outline)}

可使用的关键信息（请勿在正文中创造未列出的决定性证据）：
- ${cluesSummary(outline)}

请生成结构化 JSON：
{
  "chapters": [
    {
      "title": "...",
      "summary": "...",
      "wordCount": 1500,
      "content": "分段正文，包含细节与场景描写",
      "cluesEmbedded": ["..."],
      "redHerringsEmbedded": ["..."]
    }
  ],
  "overallWordCount": 0,
  "narrativeStyle": "第三人称 / 温度略冷 / 逻辑精密",
  "continuityNotes": ["..."]
}

请确保：
1. 总字数在 4500-5500 字范围。
2. 每章至少一次显式提及 outline.clueMatrix 中标记需要铺垫的线索（可用 [CLUE: ...] 标记，确保读者能注意到）。
3. 凶手的准备动作必须在谋杀发生前的章节中详细呈现，并标注真实时间。
4. 任何在结局揭示的证据应在前文至少出现一次暗示。
5. 不要引入大纲未提及的决定性证据；如需补充，必须在Chapter 1或Chapter 2 先行铺垫并用 [CLUE: ...] 标记。
6. 重复提及线索时保持地点与细节一致；关键事件请标注“（真实时间 XX:XX）/（钟表显示 XX:XX）”。
7. Chapter 1 建议暗示钥匙管理或备用钥匙存在的可能性。
8. 结局章节必须逐条回收 mustForeshadow 线索，并用大纲一致的名称。
仅返回 JSON。`.trim();
}

export function buildStage2PromptProfile(outline: DetectiveOutline, opts?: PromptBuildOptions): string {
  const ctx = buildWriterPrompt(outline, opts);
  const tail = [
    '',
    '时间线提示：',
    timelineSummary(outline),
    '',
    '关键信息：',
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
