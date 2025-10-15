import {
  deepseekClient,
  DEEPSEEK_CONFIG,
  isDeepseekApiKeyValid,
} from '../../config/deepseek';
import { createLogger } from '../../config/logger';
import type {
  DetectiveOutline,
  DetectiveStoryDraft,
} from '@storyapp/shared';
import {
  buildStage1Prompt,
  buildStage1PromptProfile,
  buildStage2Prompt,
  buildStage2PromptProfile,
  buildStage3Prompt,
  buildStage3PromptProfile,
} from './promptUtils';
import type { PromptBuildOptions } from './promptBuilder';
import { buildWriterPrompt, buildEditorPrompt } from './promptBuilder';
import { validateDetectiveOutline } from '../../utils/schemaValidator';
import { createQuickOutline, synthMockChapter } from './mockUtils';

const logger = createLogger('detective:stages');

const DETECTIVE_CONFIG = {
  planningModel: process.env.DETECTIVE_PLANNING_MODEL || DEEPSEEK_CONFIG.REASONER_MODEL,
  writingModel: process.env.DETECTIVE_WRITING_MODEL || DEEPSEEK_CONFIG.CHAT_MODEL,
  reviewModel: process.env.DETECTIVE_REVIEW_MODEL || DEEPSEEK_CONFIG.REASONER_MODEL,
  maxTokens: Number.parseInt(process.env.DETECTIVE_MAX_TOKENS || '6000', 10),
  planningTemperature: Number.parseFloat(process.env.DETECTIVE_PLANNING_TEMPERATURE || '0.3'),
  writingTemperature: Number.parseFloat(process.env.DETECTIVE_WRITING_TEMPERATURE || '0.6'),
  reviewTemperature: Number.parseFloat(process.env.DETECTIVE_REVIEW_TEMPERATURE || '0.2'),
};

type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

interface DeepseekCallOptions {
  model: string;
  messages: ChatMessage[];
  temperature: number;
  maxTokens: number;
}

interface DeepseekCallResult {
  content: string;
  usage?: any;
}

function ensureApiKey() {
  if (!isDeepseekApiKeyValid()) {
    const error = new Error('DeepSeek API Key 未配置或无效，无法执行工作流');
    (error as any).code = 'DEEPSEEK_CONFIG_ERROR';
    throw error;
  }
}

async function callDeepseek(options: DeepseekCallOptions): Promise<DeepseekCallResult> {
  ensureApiKey();
  try {
    const response = await deepseekClient.post('/chat/completions', {
      model: options.model,
      messages: options.messages,
      max_tokens: options.maxTokens,
      temperature: options.temperature,
      stream: false,
    });

    let content = response?.data?.choices?.[0]?.message?.content;
    if (!content) {
      const rc = response?.data?.choices?.[0]?.message?.reasoning_content;
      if (rc && typeof rc === "string") {
        content = rc;
      }
    }
    if (!content) {
      logger.error({ response: response?.data }, 'DeepSeek 响应缺少内容');
      throw new Error('DeepSeek 响应缺少内容');
    }

    return {
      content,
      usage: response?.data?.usage,
    };
  } catch (error: any) {
    logger.error(
      { err: error, model: options.model },
      'DeepSeek 调用失败',
    );
    throw error;
  }
}

function extractJson(content: string): any {
  const cleaned = String(content || '')
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch (firstError) {
    logger.warn({ preview: cleaned.slice(0, 200) }, '初次 JSON 解析失败，尝试宽松模式');
    const tolerant = cleaned
      .replace(/，\\"/g, '","')
      .replace(/\\"，/g, '","')
      .replace(/\\",\\s*([\\u4e00-\\u9fa5])/g, '","$1');

    const firstBrace = tolerant.indexOf('{');
    const lastBrace = tolerant.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const candidate = tolerant.slice(firstBrace, lastBrace + 1);
      try {
        return JSON.parse(candidate);
      } catch (secondError) {
        logger.error({ secondError, candidate }, 'JSON 二次解析失败');
        throw secondError;
      }
    }

    logger.error({ preview: tolerant.slice(0, 200), firstError }, '无法解析模型输出为 JSON');
    throw new Error('无法解析模型输出为有效 JSON');
  }
}

export async function runStage1Planning(topic: string, promptOpts?: PromptBuildOptions): Promise<DetectiveOutline> {
  logger.info({ topic }, 'Stage1 Planning 开始');
  const prompt = promptOpts ? buildStage1PromptProfile(topic, promptOpts) : buildStage1Prompt(topic);

  const { content, usage } = await callDeepseek({
    model: DETECTIVE_CONFIG.planningModel,
    messages: [
      {
        role: 'system',
        content: '你是一名推理小说结构策划专家，擅长设计本格侦探故事的诡计、线索与时间线。',
      },
      {
        role: 'user',
        content: prompt,
      },
    ],
    maxTokens: DETECTIVE_CONFIG.maxTokens,
    temperature: DETECTIVE_CONFIG.planningTemperature,
  });

  logger.info({ usage }, 'Stage1 Planning 完成');
  const outline = extractJson(content) as DetectiveOutline;
  const strict = process.env.DETECTIVE_STRICT_SCHEMA === '1';
  try {
    const res = validateDetectiveOutline(outline);
    if (!res.valid) {
      const details = (res.errors || []).map((e) => `${e.instancePath || '/'} ${e.message || ''}`).join('; ');
      if (strict) {
        const err = new Error(`蓝图Schema校验失败：${details}`);
        (err as any).code = 'BLUEPRINT_SCHEMA_INVALID';
        throw err;
      } else {
        logger.warn({ errors: res.errors }, '蓝图Schema校验未通过（非严格模式，继续）');
      }
    }
  } catch (e) {
    if (strict) throw e;
    logger.warn({ err: e }, '蓝图Schema校验异常（非严格模式，继续）');
  }
  return outline;
}

export async function runStage2Writing(outline: DetectiveOutline, promptOpts?: PromptBuildOptions): Promise<DetectiveStoryDraft> {
  logger.info('Stage2 Writing 开始');
  const prompt = promptOpts ? buildStage2PromptProfile(outline, promptOpts) : buildStage2Prompt(outline);

  const { content, usage } = await callDeepseek({
    model: DETECTIVE_CONFIG.writingModel,
    messages: [
      {
        role: 'system',
        content: [
          '你是一名推理小说作者，根据大纲写作约 4500-5500 字的长篇故事。',
          '保持中文第三人称叙述，兼顾氛围、逻辑与节奏。',
        ].join(' '),
      },
      { role: 'user', content: prompt },
    ],
    maxTokens: DETECTIVE_CONFIG.maxTokens,
    temperature: DETECTIVE_CONFIG.writingTemperature,
  });

  logger.info({ usage }, 'Stage2 Writing 完成');
  return extractJson(content) as DetectiveStoryDraft;
}

export async function runStage3Review(
  outline: DetectiveOutline,
  storyDraft: DetectiveStoryDraft,
  promptOpts?: PromptBuildOptions,
): Promise<Record<string, unknown>> {
  logger.info('Stage3 Review 开始');
  const prompt = promptOpts ? buildStage3PromptProfile(outline, storyDraft, promptOpts) : buildStage3Prompt(outline, storyDraft);

  const { content, usage } = await callDeepseek({
    model: DETECTIVE_CONFIG.reviewModel,
    messages: [
      {
        role: 'system',
        content: '你是一名推理小说审稿编辑，专门校验线索公平性、时空一致性与动机自洽。',
      },
      { role: 'user', content: prompt },
    ],
    maxTokens: DETECTIVE_CONFIG.maxTokens,
    temperature: DETECTIVE_CONFIG.reviewTemperature,
  });

  logger.info({ usage }, 'Stage3 Review 完成');
  return extractJson(content) as Record<string, unknown>;
}

function readPromptHint(name: string): string | null {
  try {
    const fs = require('fs');
    const path = require('path');
    const guess1 = path.resolve(process.cwd(), 'backend/prompts/' + name);
    const guess2 = path.resolve(process.cwd(), 'prompts/' + name);
    const file = fs.existsSync(guess1) ? guess1 : (fs.existsSync(guess2) ? guess2 : null);
    if (!file) return null;
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

export async function runSceneWriting(outline: DetectiveOutline, sceneId: string, promptOpts?: PromptBuildOptions) {
  logger.info({ sceneId }, 'Scene Writer 开始');
  const ctx = promptOpts ? buildWriterPrompt(outline, promptOpts) : null;
  const external = readPromptHint('writer_prompt.txt');
  const system = ctx?.system || '你是儿童向长篇小说写作引擎。只输出指定 JSON 字段。语言自然、避免过度恐怖、避免紫色辞藻。';
  const baseUser = ctx?.user || (external ? external : [
    '# user',
    '请根据蓝图为指定 scene_id 写章节草稿。',
    '风格：第一人称（蛋蛋），感官细节优先；字数 1500±15%。',
    '必须包含但不剧透：clues 中标记出现在该 scene 的要素。',
    '输出：',
    '{\"scene_id\":\"S3\",\"title\":\"string\",\"words\":1234,\"text\":\"...\"}',
    '仅返回 JSON。'
  ].join('\n'));
  const user = `${baseUser}\n\nscene_id=${sceneId}`;

  const { content, usage } = await callDeepseek({
    model: DETECTIVE_CONFIG.writingModel,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: '蓝图:\n' + JSON.stringify(outline, null, 2) + '\n\nscene_id=' + sceneId + '\n' + user }
    ],
    maxTokens: DETECTIVE_CONFIG.maxTokens,
    temperature: DETECTIVE_CONFIG.writingTemperature,
  });
  logger.info({ usage }, 'Scene Writer 完成');
  const obj = extractJson(content) as any;
  const chapter = {
    title: String(obj.title || ''),
    summary: String(obj.summary || ''),
    wordCount: Number(obj.words || obj.wordCount || 0),
    content: String(obj.text || obj.content || ''),
    cluesEmbedded: Array.isArray(obj.cluesEmbedded) ? obj.cluesEmbedded : [],
    redHerringsEmbedded: Array.isArray(obj.redHerringsEmbedded) ? obj.redHerringsEmbedded : [],
  };
  return { scene_id: String(obj.scene_id || sceneId), chapter };
}

export async function runSceneEditing(chapter: { title: string; content: string; wordCount?: number; summary?: string; }, promptOpts?: PromptBuildOptions): Promise<typeof chapter> {
  logger.info('Scene Editor 开始');
  const useFast = process.env.DETECTIVE_EDIT_FAST === '1' || process.env.DETECTIVE_USE_MOCK === '1' || (promptOpts?.vars as any)?.fastMock === true;
  if (useFast) {
    const content = (chapter.content || '').replace(/，/g, '，').replace(/。/g, '。');
    return { ...chapter, content };
  }
  const ctx = promptOpts ? buildEditorPrompt(promptOpts) : null;
  const external = readPromptHint('editor_prompt.txt');
  const system = ctx?.system || '你是分级编辑器。保持剧情不变，控制句长、词频，删除不当用词。只返回同结构 JSON。';
  const user = ctx?.user || (external ? external : [
    '# user',
    '阅读级别 middle_grade；去除可能引发噩梦的描写（血腥/细节化暴力）。',
    '输入：章节 JSON（包含 scene_id,title,words,text）。',
    '输出：同结构 JSON（仅修订 text）。',
    '仅返回 JSON。'
  ].join('\n'));

  const input = { scene_id: 'SCENE', title: chapter.title, words: chapter.wordCount || 0, text: chapter.content } as any;

  const { content, usage } = await callDeepseek({
    model: DETECTIVE_CONFIG.reviewModel,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user + '\n\n章节:\n' + JSON.stringify(input, null, 2) }
    ],
    maxTokens: DETECTIVE_CONFIG.maxTokens,
    temperature: DETECTIVE_CONFIG.reviewTemperature,
  });
  logger.info({ usage }, 'Scene Editor 完成');
  const obj = extractJson(content) as any;
  return { ...chapter, content: String(obj.text || obj.content || chapter.content) };
}
