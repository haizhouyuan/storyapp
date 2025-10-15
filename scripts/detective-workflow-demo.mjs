#!/usr/bin/env node
/**
 * 临时脚本：模拟侦探故事工作流（Stage1/2/3）并调用 DeepSeek API。
 * 使用方式：
 *   DEEPSEEK_API_KEY=xxx scripts/dev/nodehere node scripts/detective-workflow-demo.mjs --topic "雾岚古堡的钟声"
 *
 * 脚本依赖 Node 22 内置 fetch，无需额外库。
 */

const DEFAULT_API_URL = process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com';
const API_KEY = process.env.DEEPSEEK_API_KEY;

if (!API_KEY) {
  console.error('缺少 DEEPSEEK_API_KEY，无法调用 DeepSeek API');
  process.exit(1);
}

const args = process.argv.slice(2);
const topicArgIndex = args.findIndex((arg) => arg === '--topic');
const topic =
  (topicArgIndex !== -1 && args[topicArgIndex + 1]) ||
  process.env.MYSTERY_TOPIC ||
  '雾岚古堡的第八声';

const config = {
  apiUrl: DEFAULT_API_URL,
  planningModel: process.env.DETECTIVE_PLANNING_MODEL || 'deepseek-reasoner',
  writingModel: process.env.DETECTIVE_WRITING_MODEL || 'deepseek-chat',
  reviewModel: process.env.DETECTIVE_REVIEW_MODEL || 'deepseek-reasoner',
  maxTokens: Number.parseInt(process.env.DETECTIVE_MAX_TOKENS ?? '3500', 10),
  temperaturePlanning: Number.parseFloat(process.env.DETECTIVE_PLANNING_TEMPERATURE ?? '0.3'),
  temperatureWriting: Number.parseFloat(process.env.DETECTIVE_WRITING_TEMPERATURE ?? '0.6'),
  temperatureReview: Number.parseFloat(process.env.DETECTIVE_REVIEW_TEMPERATURE ?? '0.2'),
};

/**
 * 通用 DeepSeek 请求封装。
 */
async function callDeepseek({ model, temperature, maxTokens, messages }) {
  const response = await fetch(`${config.apiUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
      stream: false,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    const errorMsg =
      data?.error?.message || data?.message || `DeepSeek API 调用失败，状态码 ${response.status}`;
    throw new Error(errorMsg);
  }

  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    console.error('⚠️ DeepSeek 响应缺少 message.content：\n', JSON.stringify(data, null, 2));
    throw new Error('DeepSeek 响应缺少内容');
  }

  return {
    content,
    usage: data?.usage,
  };
}

/**
 * 尝试从模型输出解析 JSON。
 */
function extractJson(content) {
  const cleaned = String(content || '')
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const candidate = cleaned.slice(firstBrace, lastBrace + 1);
      try {
        return JSON.parse(candidate);
      } catch {
        // ignore
      }
    }
  }
  throw new Error('无法解析模型返回的 JSON');
}

function printStageHeader(title) {
  console.log('\n' + '='.repeat(80));
  console.log(`>>> ${title}`);
  console.log('='.repeat(80) + '\n');
}

async function runStage1Planning(topicInput) {
  printStageHeader('Stage1 结构化大纲（Reasoner）');

  const systemPrompt =
    '你是一名推理小说结构策划专家，擅长设计本格侦探故事的诡计、线索与时间线。';

  const userPrompt = `
请根据以下输入生成严格的 JSON：
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
    { "clue": "...", "surfaceMeaning": "...", "realMeaning": "...", "appearsAtAct": 1, "mustForeshadow": true }
  ],
  "timeline": [
    { "time": "Day1 19:30", "event": "...", "participants": ["..."] }
  ],
  "solution": {
    "culprit": "...",
    "motiveCore": "...",
    "keyReveals": ["..."],
    "fairnessChecklist": ["..."]
  },
  "themes": ["...", "..."]
}

要求：
1. 勿输出解释或额外文本，仅返回 JSON。
2. 保证线索与时间线存在交叉引用，保持公平线索原则。
3. 主题：${topicInput}，风格参考黄金时代本格推理。
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
  console.dir(outline, { depth: null });
  console.log('\n🧮 Tokens:', usage);
  return outline;
}

async function runStage2Writing(topicInput, outline) {
  printStageHeader('Stage2 正文写作（Chat）');

  const systemPrompt = [
    '你是一名推理小说作者，根据大纲写作约 4500-5500 字的长篇故事。',
    '保持中文叙述，视角以第三人称为主，可穿插侦探视角。',
    '注意在正文中自然埋设线索，并让关键证据在揭晓前悉数出现。',
  ].join(' ');

  const userPrompt = `
以下是侦探故事的大纲（JSON）：
${JSON.stringify(outline, null, 2)}

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
2. 每章列出本章埋设的线索与误导。
3. 语言保持紧凑的推理小说风格，兼顾氛围与细节。
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
  console.dir(
    {
      overallWordCount: storyDraft.overallWordCount,
      chapterCount: storyDraft.chapters?.length,
      chapterTitles: storyDraft.chapters?.map((c) => c.title),
    },
    { depth: null },
  );
  console.log('\n🧮 Tokens:', usage);
  return storyDraft;
}

async function runStage3Review(outline, draft) {
  printStageHeader('Stage3 审核与修订建议（Reasoner）');

  const systemPrompt =
    '你是一名推理小说审稿编辑，专门校验线索公平性、时空一致性与动机自洽。';

  const userPrompt = `
故事大纲：
${JSON.stringify(outline, null, 2)}

故事正文草稿：
${JSON.stringify(draft, null, 2)}

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
  console.dir(review, { depth: null });
  console.log('\n🧮 Tokens:', usage);
  return review;
}

async function main() {
  console.log('🕵️‍♀️ 侦探故事工作流模拟开始');
  console.log('输入主题:', topic);

  try {
    const outline = await runStage1Planning(topic);
    const draft = await runStage2Writing(topic, outline);
    const review = await runStage3Review(outline, draft);

    printStageHeader('流程总结');
    console.dir(
      {
        topic,
        outlineKeys: Object.keys(outline || {}),
        chapterCount: draft?.chapters?.length,
        approved: review?.approved,
        mustFix: review?.mustFixBeforePublish,
      },
      { depth: null },
    );
  } catch (error) {
    console.error('\n❌ 工作流执行失败:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main();
