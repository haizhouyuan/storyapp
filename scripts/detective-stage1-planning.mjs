#!/usr/bin/env node
/**
 * Stage1: 侦探故事结构化大纲生成脚本
 *
 * 示例：
 *   DEEPSEEK_API_KEY=xxx scripts/dev/nodehere node scripts/detective-stage1-planning.mjs --topic "雾岚古堡的第八声" --output tmp/outline.json
 */

import { config, callDeepseek, extractJson, printStageHeader, writeJsonFile } from './detective-utils.mjs';

const args = process.argv.slice(2);
const topicArgIndex = args.findIndex((arg) => arg === '--topic');
const outputIndex = args.findIndex((arg) => arg === '--output');

if (topicArgIndex === -1 || !args[topicArgIndex + 1]) {
  console.error('请通过 --topic 指定故事主题，例如 --topic "雾岚古堡的第八声"');
  process.exit(1);
}

const topic = args[topicArgIndex + 1];
const outputPath = outputIndex !== -1 ? args[outputIndex + 1] : null;

async function runStage1Planning(topicInput) {
  printStageHeader('Stage1 结构化大纲（Reasoner）');
  console.log('[Stage1] 输入主题:', topicInput);

  const systemPrompt =
    '你是一名推理小说结构策划专家，擅长设计本格侦探故事的诡计、线索与时间线。';

  const userPrompt = `
请根据以下输入生成严格的 JSON（请勿包含注释或多余文本）：
{
  "centralTrick": { "summary": "...", "mechanism": "...", "fairnessNotes": ["..."] },
  "caseSetup": { "victim": "...", "crimeScene": "...", "initialMystery": "..." },
  "characters": [
    { "name": "...", "role": "detective|suspect|victim|witness", "motive": "...", "secrets": ["..."] }
  ],
  "acts": [
    {
      "act": 1,
      "focus": "...",
      "beats": [
        { "beat": 1, "summary": "...", "cluesRevealed": ["..."], "redHerring": "..." }
      ]
    }
  ],
  "clueMatrix": [
    {
      "clue": "...",
      "surfaceMeaning": "...",
      "realMeaning": "...",
      "appearsAtAct": 1,
      "mustForeshadow": true,
      "explicitForeshadowChapters": ["Chapter 1", "Chapter 2"]
    }
  ],
  "timeline": [
    { "time": "Day1 18:30", "event": "凶手预先调整钟表机制", "participants": ["..."] },
    { "time": "Day1 19:30", "event": "...", "participants": ["..."] }
  ],
  "solution": {
    "culprit": "...",
    "motiveCore": "...",
    "keyReveals": ["..."],
    "fairnessChecklist": ["..."]
  },
  "logicChecklist": [
    "所有诡计准备动作在谋杀发生前完成并写明时间",
    "每条关键线索至少在破案前两章有显式铺垫",
    "时间线与线索矩阵交叉验证无矛盾"
  ],
  "themes": ["...", "..."]
}

要求：
1. 勿输出解释或额外文本，仅返回 JSON。
2. 明确描述诡计准备动作发生的具体时间（例如在谋杀前多少分钟），并写入 timeline。
3. 每条 clueMatrix 必须注明在哪些章节显式埋设（explicitForeshadowChapters）。
4. 在 fairnessNotes 中指出读者能提前获知的证据与提示。
5. acts 数组须包含 3 幕结构（act 1/2/3），每幕至少 2 个 beat，覆盖调查、对峙与揭示过程。
6. characters 中至少包含 6 人（侦探、受害者、至少 3 名嫌疑人/证人），并填写 motive 与 secrets。
7. clueMatrix 至少 4 条关键线索，需涵盖时间、物证、人物证词等不同类型。
8. explicitForeshadowChapters 仅允许使用 "Chapter 1"、"Chapter 2"、"Chapter 3" 三个值，以匹配正文三章结构。
9. 主题：${topicInput}，风格参考黄金时代本格推理。
  `.trim();

  const { content, usage } = await callDeepseek({
    model: config.planningModel,
    temperature: config.temperaturePlanning,
    maxTokens: config.maxTokens,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  });

  let outline;
  try {
    outline = extractJson(content);
  } catch (error) {
    console.error('⚠️ Stage1 输出解析失败，原始内容：\n', content);
    throw error;
  }

  console.log('[Stage1] 解析成功，核心字段:');
  console.dir(
    {
      centralTrick: outline.centralTrick,
      charactersCount: outline.characters?.length,
      actsCount: outline.acts?.length,
      clueCount: outline.clueMatrix?.length,
    },
    { depth: null },
  );
  console.log('[Stage1] Token 用量:', usage);

  if (outputPath) {
    writeJsonFile(outputPath, outline, 'Stage1 大纲');
  }

  return outline;
}

runStage1Planning(topic)
  .then((outline) => {
    console.log('\n[Stage1] 完整 JSON 输出:\n');
    console.log(JSON.stringify(outline, null, 2));
  })
  .catch((error) => {
    console.error('\n[Stage1] 执行失败:', error);
    process.exit(1);
  });
