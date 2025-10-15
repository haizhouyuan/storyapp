#!/usr/bin/env node
/**
 * Stage3: 侦探故事审核与修订建议脚本
 *
 * 示例：
 *   DEEPSEEK_API_KEY=xxx scripts/dev/nodehere node scripts/detective-stage3-review.mjs --outline tmp/outline.json --draft tmp/draft.json --output tmp/review.json
 */

import fs from 'fs';
import { config, callDeepseek, extractJson, printStageHeader, readJsonFile, writeJsonFile } from './detective-utils.mjs';

const args = process.argv.slice(2);
const outlineIndex = args.findIndex((arg) => arg === '--outline');
const draftIndex = args.findIndex((arg) => arg === '--draft');
const outputIndex = args.findIndex((arg) => arg === '--output');

if (outlineIndex === -1 || !args[outlineIndex + 1]) {
  console.error('请通过 --outline 指定 Stage1 大纲 JSON 文件路径');
  process.exit(1);
}

if (draftIndex === -1 || !args[draftIndex + 1]) {
  console.error('请通过 --draft 指定 Stage2 正文草稿 JSON 文件路径');
  process.exit(1);
}

const outlinePath = args[outlineIndex + 1];
const draftPath = args[draftIndex + 1];
const outputPath = outputIndex !== -1 ? args[outputIndex + 1] : null;

if (!fs.existsSync(outlinePath)) {
  console.error(`指定的大纲文件不存在: ${outlinePath}`);
  process.exit(1);
}
if (!fs.existsSync(draftPath)) {
  console.error(`指定的草稿文件不存在: ${draftPath}`);
  process.exit(1);
}

const outline = readJsonFile(outlinePath, 'Stage1 大纲');
const draft = readJsonFile(draftPath, 'Stage2 正文草稿');

async function runStage3Review(outlineJson, draftJson) {
  printStageHeader('Stage3 审核与修订建议（Reasoner）');
  console.log('[Stage3] 大纲摘要:', {
    centralTrick: outlineJson?.centralTrick?.summary,
    clueCount: outlineJson?.clueMatrix?.length,
  });
  console.log('[Stage3] 草稿摘要:', {
    overallWordCount: draftJson?.overallWordCount,
    chapterCount: draftJson?.chapters?.length,
  });

  const systemPrompt =
    '你是一名推理小说审稿编辑，专门校验线索公平性、时空一致性与动机自洽。';

  const userPrompt = `
故事大纲：
${JSON.stringify(outlineJson, null, 2)}

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

  const { content, usage } = await callDeepseek({
    model: config.reviewModel,
    temperature: config.temperatureReview,
    maxTokens: config.maxTokens,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  });

  let review;
  try {
    review = extractJson(content);
  } catch (error) {
    console.error('⚠️ Stage3 输出解析失败，原始内容：\n', content);
    throw error;
  }

  console.log('[Stage3] 审核结果概览:');
  console.dir(
    {
      approved: review.approved,
      score: review.score,
      issuesCount: review.issues?.length,
      mustFix: review.mustFixBeforePublish,
      contentWarnings: review.contentWarnings,
    },
    { depth: null },
  );
  console.log('[Stage3] Token 用量:', usage);

  if (outputPath) {
    writeJsonFile(outputPath, review, 'Stage3 审核报告');
  }

  return review;
}

runStage3Review(outline, draft)
  .then((review) => {
    console.log('\n[Stage3] 完整 JSON 输出:\n');
    console.log(JSON.stringify(review, null, 2));
  })
  .catch((error) => {
    console.error('\n[Stage3] 执行失败:', error);
    process.exit(1);
  });
