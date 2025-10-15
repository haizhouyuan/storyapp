#!/usr/bin/env node
/**
 * Stage2: 侦探故事正文写作脚本
 *
 * 示例：
 *   DEEPSEEK_API_KEY=xxx scripts/dev/nodehere node scripts/detective-stage2-writing.mjs --outline tmp/outline.json --output tmp/draft.json
 */

import fs from 'fs';
import { config, callDeepseek, extractJson, printStageHeader, readJsonFile, writeJsonFile } from './detective-utils.mjs';

const args = process.argv.slice(2);
const outlineIndex = args.findIndex((arg) => arg === '--outline');
const outputIndex = args.findIndex((arg) => arg === '--output');
const topicIndex = args.findIndex((arg) => arg === '--topic');

if (outlineIndex === -1 || !args[outlineIndex + 1]) {
  console.error('请通过 --outline 指定 Stage1 生成的大纲 JSON 文件路径');
  process.exit(1);
}

const outlinePath = args[outlineIndex + 1];
const outputPath = outputIndex !== -1 ? args[outputIndex + 1] : null;
const topic = topicIndex !== -1 ? args[topicIndex + 1] : null;

if (!fs.existsSync(outlinePath)) {
  console.error(`指定的大纲文件不存在: ${outlinePath}`);
  process.exit(1);
}

const outline = readJsonFile(outlinePath, 'Stage1 大纲');

async function runStage2Writing(outlineJson, topicInput) {
  printStageHeader('Stage2 正文写作（Chat）');
  if (topicInput) {
    console.log('[Stage2] 输入主题:', topicInput);
  }
  console.log('[Stage2] 大纲摘要:', {
    centralTrick: outlineJson?.centralTrick?.summary,
    acts: outlineJson?.acts?.length,
    clueCount: outlineJson?.clueMatrix?.length,
  });

  const timelineSummary = Array.isArray(outlineJson?.timeline)
    ? outlineJson.timeline
        .map((item) => {
          if (!item || typeof item !== 'object') {
            return null;
          }
          const time = typeof item.time === 'string' ? item.time : '未知时间';
          const event = typeof item.event === 'string' ? item.event : '事件描述缺失';
          const participants = Array.isArray(item.participants) ? item.participants.join('、') : '';
          return `- ${time}: ${event}${participants ? `（涉及：${participants}）` : ''}`;
        })
        .filter(Boolean)
        .join('\n')
    : '（无时间线信息）';

  const allowedCluesSummary = Array.isArray(outlineJson?.clueMatrix)
    ? outlineJson.clueMatrix
        .map((item, index) => {
          if (!item || typeof item !== 'object') {
            return null;
          }
          const clueName = typeof item.clue === 'string' ? item.clue : `线索${index + 1}`;
          const realMeaning = typeof item.realMeaning === 'string' ? item.realMeaning : '';
          return realMeaning ? `${clueName}（真实含义：${realMeaning}）` : clueName;
        })
        .filter(Boolean)
        .join('\n- ')
    : '（未提供线索列表）';

  const systemPrompt = [
    '你是一名推理小说作者，根据大纲写作约 4500-5500 字的长篇故事。',
    '保持中文叙述，视角以第三人称为主，可穿插侦探视角。',
    '务必遵守公平线索原则：所有关键证据必须在结局前出现且被读者清楚感知。',
    '严控时间线，确保诡计准备与谋杀发生顺序自洽，并在文本中通过具体时间或事件提示。',
  ].join(' ');

  const userPrompt = `
以下是侦探故事的大纲（JSON）：
${JSON.stringify(outlineJson, null, 2)}

时间线提示（必须严格遵守，且在叙事中以括号时间标注）：
${timelineSummary}

可使用的关键信息（请勿在正文中创造未列出的决定性证据）：
- ${allowedCluesSummary}

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
3. 凶手的准备动作必须在谋杀发生前的章节中详细呈现，含时间线提示（例如具体时刻或相对时间）。
4. 任何在结局揭示的证据（如特殊零件、笔迹比对）应在前文至少出现一次暗示或观察。
5. 不要引入大纲未提及的决定性证据；仅使用上述“可使用的关键信息”列表中的线索，如需补充设定必须在Chapter 1或Chapter 2 先行埋设并用 [CLUE: ...] 标记。
6. 重复提及线索时保持地点与细节一致，避免前后矛盾；关键事件（尖叫、谋杀、钟声响起等）请在句中以“（真实时间 XX:XX）”“（钟表显示 XX:XX）”标注，明确时间差。
7. Chapter 1 中至少暗示一次书房钥匙管理或备用钥匙存在的可能性，为后续线索做铺垫。
8. 引用时间点时以 outline.timeline 为基准，不额外创造新的关键时间，必要时解释为何出现偏差。
9. 角色提及具体时间时需说明参考来源（例如查看腕表、挂钟、怀表等）。
10. Chapter 1 中通过细节或对话暗示管家财务压力或被克扣的动机，为后续揭示做铺垫。
11. 语言保持紧凑的推理小说风格，兼顾氛围与细节。
仅返回 JSON。`.trim();

  const { content, usage } = await callDeepseek({
    model: config.writingModel,
    temperature: config.temperatureWriting,
    maxTokens: config.maxTokens,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  });

  let storyDraft;
  try {
    storyDraft = extractJson(content);
  } catch (error) {
    console.error('⚠️ Stage2 输出解析失败，原始内容：\n', content);
    throw error;
  }

  console.log('[Stage2] 解析成功，章节统计:');
  console.dir(
    {
      overallWordCount: storyDraft.overallWordCount,
      chapterCount: storyDraft.chapters?.length,
      chapterTitles: storyDraft.chapters?.map((c) => c.title),
    },
    { depth: null },
  );
  console.log('[Stage2] Token 用量:', usage);

  if (outputPath) {
    writeJsonFile(outputPath, storyDraft, 'Stage2 正文草稿');
  }

  return storyDraft;
}

runStage2Writing(outline, topic)
  .then((draft) => {
    console.log('\n[Stage2] 完整 JSON 输出:\n');
    console.log(JSON.stringify(draft, null, 2));
  })
  .catch((error) => {
    console.error('\n[Stage2] 执行失败:', error);
    process.exit(1);
  });
