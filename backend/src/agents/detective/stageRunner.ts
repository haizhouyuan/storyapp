import {
  deepseekClient,
  DEEPSEEK_CONFIG,
  isDeepseekApiKeyValid,
} from '../../config/deepseek';
import { createLogger } from '../../config/logger';
import type {
  DetectiveOutline,
  DetectiveStoryDraft,
  WorkflowStageArtifactType,
  WorkflowStageLogLevel,
} from '@storyapp/shared';
import {
  buildStage1Prompt,
  buildStage1PromptProfile,
  buildStage2Prompt,
  buildStage2PromptProfile,
  buildStage3Prompt,
  buildStage3PromptProfile,
} from './promptUtils';
import { resolvePromptProfile } from './promptProfiles';
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

export interface StageTelemetry {
  beginCommand?: (input: { label: string; command?: string; meta?: Record<string, unknown> }) => string | undefined;
  completeCommand?: (commandId: string, input?: { resultSummary?: string; meta?: Record<string, unknown> }) => void;
  failCommand?: (
    commandId: string,
    input: { errorMessage: string; meta?: Record<string, unknown> },
  ) => void;
  log?: (
    level: WorkflowStageLogLevel,
    message: string,
    options?: { commandId?: string; meta?: Record<string, unknown> },
  ) => void;
  registerArtifact?: (input: {
    label: string;
    type: WorkflowStageArtifactType;
    commandId?: string;
    url?: string;
    preview?: string;
    meta?: Record<string, unknown>;
  }) => void;
}

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

function calculateSentenceMetrics(text: string) {
  const rawSentences = text.split(/[。！？!?]/).map((s) => s.trim()).filter(Boolean);
  const sentences = rawSentences.length > 0 ? rawSentences : [text.trim()];
  const lengths = sentences.map((s) => s.length);
  const total = lengths.reduce((acc, len) => acc + len, 0);
  const avg = sentences.length ? total / sentences.length : text.length;
  const longRatio = sentences.length ? lengths.filter((len) => len > 26).length / sentences.length : 0;
  return { avg, longRatio, count: sentences.length };
}

function estimateDialogueCountText(text: string): number {
  if (!text) return 0;
  const matches = text.match(/[「“"']/g);
  if (!matches) return 0;
  return Math.floor(matches.length / 2) || matches.length;
}

async function enforceDialoguesInDraft(
  draft: DetectiveStoryDraft,
  target: number,
): Promise<DetectiveStoryDraft> {
  if (!draft?.chapters || draft.chapters.length === 0 || target <= 0) {
    return draft;
  }

  const chapters = [] as DetectiveStoryDraft['chapters'];
  for (const chapter of draft.chapters) {
    const current = estimateDialogueCountText(chapter.content || '');
    if (current >= target) {
      chapters.push(chapter);
      continue;
    }
    try {
      const sys = '你是儿童侦探小说对白润色师。保持剧情、线索与时间信息不变，将叙述改写成侦探与相关人物之间的问答对白，使用中文引号“”。仅返回 {"text":"..."} JSON。';
      const usr = [
        `当前对白轮次 ${current}，目标 ≥${target}。`,
        '请将下文中的关键信息重新组织为问答对白，确保线索、时间及动机一字不漏。',
        '原文如下：',
        chapter.content || '',
      ].join('\n');
      const response = await callDeepseek({
        model: DETECTIVE_CONFIG.reviewModel,
        messages: [
          { role: 'system', content: sys },
          { role: 'user', content: usr },
        ],
        maxTokens: DETECTIVE_CONFIG.maxTokens,
        temperature: DETECTIVE_CONFIG.reviewTemperature,
      });
      const revised = extractJson(response.content) as any;
      const candidate = String(revised.text || revised.content || chapter.content || '');
      const count = estimateDialogueCountText(candidate);
      const finalText = count >= target ? candidate : (chapter.content || '');
      const finalWordCount = finalText ? finalText.replace(/\s+/g, '').length : chapter.wordCount;
      chapters.push({ ...chapter, content: finalText, wordCount: finalWordCount });
    } catch (error) {
      logger.warn({ err: error }, '对白自动增强失败，保留原文本');
      chapters.push(chapter);
    }
  }

  return { ...draft, chapters };
}

function ensureChineseNames(outline: DetectiveOutline): DetectiveOutline {
  const pool = ['林澜', '顾星', '程翊', '苏瑾', '赵岚', '陆沉', '叶霖', '江岚', '闻笙', '唐溯', '白屿', '秦霁', '杭越', '莫黎', '夏禾'];
  const replacements = new Map<string, string>();
  const getReplacement = (name: string) => {
    if (replacements.has(name)) return replacements.get(name)!;
    const next = pool.shift() || `晓${Math.random().toString(36).slice(2, 4)}`;
    replacements.set(name, next);
    return next;
  };

  const chineseNameReg = /^[\u4e00-\u9fa5]{2,4}$/;
  outline.characters = (outline.characters || []).map((character) => {
    if (!character?.name) return character;
    if (chineseNameReg.test(character.name)) return character;
    const newName = getReplacement(character.name);
    return { ...character, name: newName };
  });

  const replaceText = (text?: string | null): string => {
    if (!text) return '';
    let result = text;
    replacements.forEach((newName, oldName) => {
      const pattern = new RegExp(oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
      result = result.replace(pattern, newName);
    });
    return result;
  };

  if (outline.caseSetup) {
    outline.caseSetup = {
      victim: replaceText(outline.caseSetup.victim),
      crimeScene: replaceText(outline.caseSetup.crimeScene),
      initialMystery: replaceText(outline.caseSetup.initialMystery),
    };
  }

  if (outline.centralTrick) {
    outline.centralTrick = {
      summary: replaceText(outline.centralTrick.summary),
      mechanism: replaceText(outline.centralTrick.mechanism),
      fairnessNotes: (outline.centralTrick.fairnessNotes || []).map(replaceText),
    };
  }

  outline.acts = (outline.acts || []).map((act) => ({
    ...act,
    focus: replaceText(act.focus),
    beats: (act.beats || []).map((beat) => ({
      ...beat,
      summary: replaceText(beat.summary),
      cluesRevealed: (beat.cluesRevealed || []).map(replaceText),
      redHerring: replaceText(beat.redHerring),
    })),
  }));

  outline.clueMatrix = (outline.clueMatrix || []).map((clue) => ({
    ...clue,
    surfaceMeaning: replaceText(clue.surfaceMeaning),
    realMeaning: replaceText(clue.realMeaning),
  }));

  outline.logicChecklist = (outline.logicChecklist || []).map(replaceText);

  outline.timeline = (outline.timeline || []).map((event) => {
    const participants = (event.participants || []).map((p) => replacements.get(p) || p);
    return {
      ...event,
      event: replaceText(event.event),
      participants,
    };
  });

  return outline;
}

function heuristicCadenceAdjust(text: string, maxLen: number): string {
  if (!text) return text;
  const segments = text.match(/[^。！？!?]+[。！？!?]?/g) || [text];
  const rebuilt: string[] = [];
  segments.forEach((segment) => {
    const trimmed = segment.trim();
    if (!trimmed) {
      return;
    }
    if (trimmed.length <= maxLen) {
      rebuilt.push(trimmed);
      return;
    }
    const endPunctMatch = trimmed.match(/[。！？!?]$/);
    const endPunct = endPunctMatch ? endPunctMatch[0] : '。';
    const core = endPunctMatch ? trimmed.slice(0, -1) : trimmed;
    const pieces = core.split(/[，、；]/);
    const sentences: string[] = [];
    let buffer = '';
    pieces.forEach((pieceRaw, idx) => {
      const piece = pieceRaw.trim();
      if (!piece) {
        return;
      }
      const candidate = buffer ? `${buffer}，${piece}` : piece;
      if (candidate.length > maxLen && buffer) {
        sentences.push(`${buffer}。`);
        buffer = piece;
      } else {
        buffer = candidate;
      }
      if (idx === pieces.length - 1 && buffer) {
        sentences.push(`${buffer}${endPunct}`);
        buffer = '';
      }
    });
    if (buffer) {
      sentences.push(`${buffer}${endPunct}`);
    }
    rebuilt.push(sentences.join(''));
  });
  return rebuilt.join('');
}

export async function runStage1Planning(
  topic: string,
  promptOpts?: PromptBuildOptions,
  telemetry?: StageTelemetry,
): Promise<DetectiveOutline> {
  logger.info({ topic }, 'Stage1 Planning 开始');
  telemetry?.log?.('info', '阶段一：准备蓝图策划', { meta: { topic } });

  const promptCommand = telemetry?.beginCommand?.({
    label: '构建阶段一提示词',
    command: promptOpts ? 'buildStage1PromptProfile' : 'buildStage1Prompt',
    meta: { hasCustomProfile: Boolean(promptOpts) },
  });
  const prompt = promptOpts ? buildStage1PromptProfile(topic, promptOpts) : buildStage1Prompt(topic);
  if (promptCommand) {
    telemetry?.completeCommand?.(promptCommand, {
      resultSummary: `提示词长度 ${prompt.length} 字符`,
    });
  }

  const strict = process.env.DETECTIVE_STRICT_SCHEMA === '1';
  const RETRIES = 3;
  for (let attempt = 0; attempt < RETRIES; attempt += 1) {
    const callCommand = telemetry?.beginCommand?.({
      label: `调用 DeepSeek 规划模型（尝试 ${attempt + 1}）`,
      command: 'POST /chat/completions',
      meta: {
        model: DETECTIVE_CONFIG.planningModel,
        temperature: DETECTIVE_CONFIG.planningTemperature,
        attempt: attempt + 1,
      },
    });
    try {
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

      logger.info({ usage, attempt }, 'Stage1 Planning 完成 DeepSeek 请求');
      if (callCommand) {
        telemetry?.completeCommand?.(callCommand, {
          resultSummary: `获得响应 ${content.length} 字符`,
          meta: { usage },
        });
      }

      const parseCommand = telemetry?.beginCommand?.({
        label: '解析模型输出为 JSON',
        command: 'extractJson',
        meta: { attempt: attempt + 1 },
      });
      try {
        const outlineRaw = extractJson(content) as DetectiveOutline;
        if (parseCommand) {
          telemetry?.completeCommand?.(parseCommand, {
            resultSummary: '解析成功',
          });
        }

        const normalizeCommand = telemetry?.beginCommand?.({
          label: '统一角色命名为中文',
          command: 'ensureChineseNames',
        });
        const outline = ensureChineseNames(outlineRaw);
        if (normalizeCommand) {
          telemetry?.completeCommand?.(normalizeCommand, {
            resultSummary: `角色 ${outline.characters?.length ?? 0} 人`,
          });
        }

        const validateCommand = telemetry?.beginCommand?.({
          label: '校验蓝图结构',
          command: 'validateDetectiveOutline',
          meta: { strict },
        });
        try {
          const res = validateDetectiveOutline(outline);
          if (!res.valid) {
            const details = (res.errors || [])
              .map((e) => `${e.instancePath || '/'} ${e.message || ''}`)
              .join('; ');
            if (strict) {
              const err = new Error(`蓝图Schema校验失败：${details}`);
              (err as any).code = 'BLUEPRINT_SCHEMA_INVALID';
              if (validateCommand) {
                telemetry?.failCommand?.(validateCommand, {
                  errorMessage: err.message,
                  meta: { details },
                });
              }
              throw err;
            } else {
              logger.warn({ errors: res.errors }, '蓝图Schema校验未通过（非严格模式，继续）');
              telemetry?.log?.('warn', '蓝图 Schema 校验未通过（非严格模式）', {
                commandId: validateCommand,
                meta: { details, errors: res.errors },
              });
            }
          }
          if (validateCommand) {
            telemetry?.completeCommand?.(validateCommand, {
              resultSummary: res.valid ? '校验通过' : '存在警告（非严格模式）',
            });
          }
        } catch (validationError: any) {
          if (validateCommand && strict) {
            telemetry?.failCommand?.(validateCommand, {
              errorMessage: validationError?.message || '校验失败',
              meta: { code: validationError?.code },
            });
          }
          if (strict) {
            throw validationError;
          }
          logger.warn({ err: validationError }, '蓝图Schema校验异常（非严格模式，继续）');
          telemetry?.log?.('warn', '蓝图 Schema 校验发生异常（非严格模式继续）', {
            commandId: validateCommand,
            meta: { error: validationError?.message },
          });
        }

        telemetry?.registerArtifact?.({
          label: '阶段一蓝图草案',
          type: 'json',
          preview: JSON.stringify(
            {
              acts: outline.acts?.length ?? 0,
              characters: outline.characters?.length ?? 0,
              themes: outline.themes ?? [],
            },
            null,
            2,
          ),
          meta: {
            topic,
            strictMode: strict,
          },
        });

        return outline;
      } catch (parseError: any) {
        if (parseCommand) {
          telemetry?.failCommand?.(parseCommand, {
            errorMessage: parseError?.message || '解析失败',
            meta: { preview: content.slice(0, 180) },
          });
        }
        if (attempt === RETRIES - 1) {
          logger.error({ err: parseError }, 'Stage1 Planning JSON 解析失败');
          throw parseError;
        }
        logger.warn({ attempt: attempt + 1, err: parseError }, 'Stage1 Planning 输出解析失败，准备重试');
        telemetry?.log?.('warn', 'Stage1 输出解析失败，准备重试', {
          commandId: parseCommand,
          meta: { attempt: attempt + 1 },
        });
      }
    } catch (deepseekError: any) {
      if (callCommand) {
        telemetry?.failCommand?.(callCommand, {
          errorMessage: deepseekError?.message || 'DeepSeek 调用失败',
          meta: { code: deepseekError?.code },
        });
      }
      if (attempt === RETRIES - 1) {
        throw deepseekError;
      }
      telemetry?.log?.('warn', 'DeepSeek 调用失败，准备重试', {
        commandId: callCommand,
        meta: { attempt: attempt + 1 },
      });
    }
  }

  throw new Error('Stage1 Planning 未能生成有效蓝图');
}

export async function runStage2Writing(
  outline: DetectiveOutline,
  promptOpts?: PromptBuildOptions,
  telemetry?: StageTelemetry,
): Promise<DetectiveStoryDraft> {
  logger.info('Stage2 Writing 开始');
  telemetry?.log?.('info', '阶段二：准备写作草稿', {
    meta: {
      acts: outline.acts?.length ?? 0,
      characters: outline.characters?.length ?? 0,
    },
  });
  const promptCommand = telemetry?.beginCommand?.({
    label: '构建阶段二提示词',
    command: promptOpts ? 'buildStage2PromptProfile' : 'buildStage2Prompt',
    meta: { hasCustomProfile: Boolean(promptOpts) },
  });
  const prompt = promptOpts ? buildStage2PromptProfile(outline, promptOpts) : buildStage2Prompt(outline);
  if (promptCommand) {
    telemetry?.completeCommand?.(promptCommand, {
      resultSummary: `提示词长度 ${prompt.length} 字符`,
    });
  }

  const RETRIES = 3;
  for (let attempt = 0; attempt < RETRIES; attempt += 1) {
    const callCommand = telemetry?.beginCommand?.({
      label: `调用 DeepSeek 写作模型（尝试 ${attempt + 1}）`,
      command: 'POST /chat/completions',
      meta: {
        model: DETECTIVE_CONFIG.writingModel,
        temperature: DETECTIVE_CONFIG.writingTemperature,
        attempt: attempt + 1,
      },
    });
    let content: string | undefined;
    try {
      const response = await callDeepseek({
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
      content = response.content;
      logger.info({ usage: response.usage, attempt }, 'Stage2 Writing 完成 DeepSeek 请求');
      if (callCommand) {
        telemetry?.completeCommand?.(callCommand, {
          resultSummary: `获得响应 ${content.length} 字符`,
          meta: { usage: response.usage },
        });
      }
    } catch (deepseekError: any) {
      if (callCommand) {
        telemetry?.failCommand?.(callCommand, {
          errorMessage: deepseekError?.message || 'DeepSeek 调用失败',
          meta: { code: deepseekError?.code },
        });
      }
      if (attempt === RETRIES - 1) {
        throw deepseekError;
      }
      telemetry?.log?.('warn', 'DeepSeek 写作模型调用失败，准备重试', {
        commandId: callCommand,
        meta: { attempt: attempt + 1 },
      });
      continue;
    }

    try {
      const parseCommand = telemetry?.beginCommand?.({
        label: '解析写作输出',
        command: 'extractJson',
        meta: { attempt: attempt + 1 },
      });
      const storyDraftRaw = extractJson(content!) as DetectiveStoryDraft;
      if (parseCommand) {
        telemetry?.completeCommand?.(parseCommand, {
          resultSummary: `解析成功，章节 ${storyDraftRaw.chapters?.length ?? 0} 章`,
        });
      }

      const vars = (promptOpts?.vars || {}) as any;
      const pick = (o: any, keys: string[]) => {
        for (const k of keys) {
          const seg = k.split('.');
          let cur: any = o;
          let ok = true;
          for (const kk of seg) {
            if (cur && kk in cur) cur = (cur as any)[kk]; else { ok = false; break; }
          }
          if (ok && cur !== undefined && cur !== null && cur !== '') return cur;
        }
        return undefined;
      };
      const profile = resolvePromptProfile(promptOpts?.profile ?? null);
      const dialoguesRaw = pick(vars, ['writer.dialoguesMin', 'dialoguesMin']);
      const dialoguesTarget = Number.isFinite(Number(dialoguesRaw))
        ? Number(dialoguesRaw)
        : (profile.writer.dialoguesMin ?? 4);
      const enforceCommand = telemetry?.beginCommand?.({
        label: '增强对话密度',
        command: 'enforceDialoguesInDraft',
        meta: { dialoguesTarget },
      });
      const storyDraft = await enforceDialoguesInDraft(storyDraftRaw, dialoguesTarget);
      if (enforceCommand) {
        telemetry?.completeCommand?.(enforceCommand, {
          resultSummary: `完成增强，对话目标 ${dialoguesTarget}`,
        });
      }

      telemetry?.registerArtifact?.({
        label: '阶段二写作草稿',
        type: 'json',
        preview: JSON.stringify(
          {
            chapters: storyDraft.chapters.length,
            totalWords: storyDraft.overallWordCount ?? null,
          },
          null,
          2,
        ),
      });

      return storyDraft;
    } catch (err: any) {
      telemetry?.log?.('warn', '写作输出解析失败', {
        meta: { error: err?.message, attempt: attempt + 1 },
      });
      if (attempt === RETRIES - 1) {
        logger.error({ err }, 'Stage2 Writing JSON 解析失败');
        throw err;
      }
      logger.warn({ attempt: attempt + 1, err }, 'Stage2 Writing 输出解析失败，准备重试');
    }
  }
  throw new Error('Stage2 Writing 未能生成有效草稿');
}

export async function runStage3Review(
  outline: DetectiveOutline,
  storyDraft: DetectiveStoryDraft,
  promptOpts?: PromptBuildOptions,
  telemetry?: StageTelemetry,
): Promise<Record<string, unknown>> {
  logger.info('Stage3 Review 开始');
  telemetry?.log?.('info', '阶段三：执行审稿校验', {
    meta: { chapters: storyDraft.chapters.length },
  });
  const promptCommand = telemetry?.beginCommand?.({
    label: '构建阶段三提示词',
    command: promptOpts ? 'buildStage3PromptProfile' : 'buildStage3Prompt',
  });
  const prompt = promptOpts ? buildStage3PromptProfile(outline, storyDraft, promptOpts) : buildStage3Prompt(outline, storyDraft);
  if (promptCommand) {
    telemetry?.completeCommand?.(promptCommand, {
      resultSummary: `提示词长度 ${prompt.length} 字符`,
    });
  }

  const callCommand = telemetry?.beginCommand?.({
    label: '调用 DeepSeek 审稿模型',
    command: 'POST /chat/completions',
    meta: {
      model: DETECTIVE_CONFIG.reviewModel,
      temperature: DETECTIVE_CONFIG.reviewTemperature,
    },
  });

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

  if (callCommand) {
    telemetry?.completeCommand?.(callCommand, {
      resultSummary: `获取审稿结果 ${content.length} 字符`,
      meta: { usage },
    });
  }

  logger.info({ usage }, 'Stage3 Review 完成');
  const review = extractJson(content) as Record<string, unknown>;
  telemetry?.registerArtifact?.({
    label: '阶段三审稿结果',
    type: 'json',
    preview: JSON.stringify(review, null, 2).slice(0, 2000),
  });
  return review;
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

  const pick = (o: any, keys: string[]) => {
    for (const k of keys) {
      const seg = k.split('.');
      let cur: any = o;
      let ok = true;
      for (const kk of seg) {
        if (cur && kk in cur) cur = (cur as any)[kk]; else { ok = false; break; }
      }
      if (ok && cur !== undefined && cur !== null && cur !== '') return cur;
    }
    return undefined;
  };

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
  let editedText = String(obj.text || obj.content || chapter.content);

  // 二段式长度控制：若未达到目标区间，则触发扩写/压缩并合并（最多重试2次）
  try {
    const vars = (promptOpts?.vars || {}) as any;
    const wordsTargetRaw = pick(vars, ['targets.wordsPerScene','targetWords','words']);
    const target = typeof wordsTargetRaw === 'string' ? parseInt(wordsTargetRaw,10) : (wordsTargetRaw as number|undefined);
    if (target && Number.isFinite(target) && target>0) {
      const min = Math.floor(target*0.85);
      const max = Math.ceil(target*1.15);
      let cur = editedText.length;

      const expandOrCompress = async (mode: 'expand'|'compress', baseText: string): Promise<string> => {
        const sys = '你是儿童向长篇小说扩写与压缩引擎。保持剧情不变与安全分级。只返回 {"text":"..."} JSON。';
        const usr = [
          `当前长度: ${baseText.length}，目标: ${target} (区间 ${min}–${max})，模式: ${mode}`,
          '请在不改变事件顺序与信息量真实性的前提下，进行段落级重写：',
          mode==='expand' ? '- 扩写场景描写、动作细节、心理刻画；' : '- 压缩冗余、合并重复表达、拆长句;',
          '输出 JSON: {"text":"合并后的完整章节文本"}',
          '原文如下：\n' + baseText
        ].join('\n');
        const r = await callDeepseek({
          model: DETECTIVE_CONFIG.writingModel,
          messages: [{ role:'system', content: sys }, { role:'user', content: usr }],
          maxTokens: DETECTIVE_CONFIG.maxTokens,
          temperature: DETECTIVE_CONFIG.writingTemperature,
        });
        const o = extractJson(r.content) as any;
        return String(o.text || o.content || baseText);
      };

      let retries = 0;
      while ((cur < min || cur > max) && retries < 2) {
        const mode = cur < min ? 'expand' : 'compress';
        editedText = await expandOrCompress(mode as any, editedText);
        cur = editedText.length;
        retries += 1;
      }
    }
  } catch (e) {
    logger.warn({ err: e instanceof Error ? e.message : String(e) }, '长度控制阶段忽略错误');
  }

  try {
    const cadenceTargets = (() => {
      const vars = (promptOpts?.vars || {}) as any;
      const fallbackAvg = 22;
      const fallbackRatio = 0.25;
      const avgLimit = Number.isFinite(Number(vars?.language?.maxAvgSentenceLen))
        ? Number(vars.language.maxAvgSentenceLen)
        : fallbackAvg;
      const ratioLimit = Number.isFinite(Number(vars?.language?.maxLongSentenceRatio))
        ? Number(vars.language.maxLongSentenceRatio)
        : fallbackRatio;
      const maxRetries = Number.isFinite(Number(vars?.language?.maxCadenceRetries))
        ? Number(vars.language.maxCadenceRetries)
        : 3;
      return { avgLimit, ratioLimit, maxRetries };
    })();
    let metrics = calculateSentenceMetrics(editedText);
    if (metrics.avg > cadenceTargets.avgLimit || metrics.longRatio > cadenceTargets.ratioLimit) {
      let attempts = 0;
      while ((metrics.avg > cadenceTargets.avgLimit || metrics.longRatio > cadenceTargets.ratioLimit) && attempts < cadenceTargets.maxRetries) {
        const sys = '你是儿童向文字节奏优化编辑，擅长拆分长句、平衡语速。请保持剧情不变、语义连贯、年龄适配。仅返回 {"text":"..."} JSON。';
        const usr = [
          `当前平均句长约 ${metrics.avg.toFixed(2)}，阈值 ${cadenceTargets.avgLimit}；长句占比 ${(metrics.longRatio * 100).toFixed(1)}%，阈值 ${(cadenceTargets.ratioLimit * 100).toFixed(1)}%。`,
          '请在不更改信息的前提下，将长句拆分为 1-2 个短句；必要时对标点与语气作轻量调整。',
          '禁止删掉关键线索或角色对白，可对情绪描写进行柔化处理。',
          '输入章节如下：',
          editedText,
        ].join('\n');
        const response = await callDeepseek({
          model: DETECTIVE_CONFIG.reviewModel,
          messages: [
            { role: 'system', content: sys },
            { role: 'user', content: usr },
          ],
          maxTokens: DETECTIVE_CONFIG.maxTokens,
          temperature: DETECTIVE_CONFIG.reviewTemperature,
        });
        const revised = extractJson(response.content) as any;
        const candidate = String(revised.text || revised.content || editedText);
        const candidateMetrics = calculateSentenceMetrics(candidate);
        if (
          candidate &&
          (candidateMetrics.avg < metrics.avg || candidateMetrics.longRatio < metrics.longRatio)
        ) {
          editedText = candidate;
          metrics = candidateMetrics;
        } else {
          const fallbackSys = '你是一名少年读物文字编辑。保持剧情不变，将所有超过 28 字的句子拆成 2-3 个短句，必要时补充连接语。仅返回 {"text":"..."} JSON。';
          const fallbackUsr = [
            `当前句长 ${metrics.avg.toFixed(2)}（阈值 ${cadenceTargets.avgLimit}），长句比例 ${(metrics.longRatio * 100).toFixed(1)}%（阈值 ${(cadenceTargets.ratioLimit * 100).toFixed(1)}%）。`,
            '请优先使用句号和问句结尾，控制每句 ≤ 28 字。',
            editedText,
          ].join('\n');
          const fallbackResp = await callDeepseek({
            model: DETECTIVE_CONFIG.reviewModel,
            messages: [
              { role: 'system', content: fallbackSys },
              { role: 'user', content: fallbackUsr },
            ],
            maxTokens: DETECTIVE_CONFIG.maxTokens,
            temperature: DETECTIVE_CONFIG.reviewTemperature,
          });
          const fallbackJson = extractJson(fallbackResp.content) as any;
          const fallbackCandidate = String(fallbackJson.text || fallbackJson.content || editedText);
          const fallbackMetrics = calculateSentenceMetrics(fallbackCandidate);
          if (
            fallbackCandidate &&
            (fallbackMetrics.avg < metrics.avg || fallbackMetrics.longRatio < metrics.longRatio)
          ) {
            editedText = fallbackCandidate;
            metrics = fallbackMetrics;
          } else {
            break;
          }
        }
        attempts += 1;
      }
      if (metrics.avg > cadenceTargets.avgLimit || metrics.longRatio > cadenceTargets.ratioLimit) {
        const heuristicText = heuristicCadenceAdjust(editedText, Math.max(18, cadenceTargets.avgLimit));
        const heuristicMetrics = calculateSentenceMetrics(heuristicText);
        if (
          heuristicText &&
          (heuristicMetrics.avg < metrics.avg || heuristicMetrics.longRatio < metrics.longRatio)
        ) {
          editedText = heuristicText;
          metrics = heuristicMetrics;
        }
      }
    }
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, '节奏优化阶段忽略错误');
  }

  try {
    const vars = (promptOpts?.vars || {}) as any;
    const dialoguesRaw = pick(vars, ['writer.dialoguesMin', 'dialoguesMin']);
    const dialoguesTarget = Number.isFinite(Number(dialoguesRaw))
      ? Number(dialoguesRaw)
      : (ctx?.profile.writer.dialoguesMin ?? 4);
    const currentDialogues = estimateDialogueCountText(editedText);
    if (dialoguesTarget > 0 && currentDialogues < dialoguesTarget) {
      const sys = '你是儿童侦探故事对白润色师。保持故事情节和线索不变，增加侦探、嫌疑人或证人之间的问答对白，使用中文引号“”。仅返回 {"text":"..."} JSON。';
      const usr = [
        `当前对白轮次 ${currentDialogues}，目标 ≥${dialoguesTarget}。`,
        '请把叙述性句子改写为问答式对白，确保线索和时间信息完整，不新增角色或改变结局。',
        '原文如下：',
        editedText,
      ].join('\n');
      const response = await callDeepseek({
        model: DETECTIVE_CONFIG.reviewModel,
        messages: [
          { role: 'system', content: sys },
          { role: 'user', content: usr },
        ],
        maxTokens: DETECTIVE_CONFIG.maxTokens,
        temperature: DETECTIVE_CONFIG.reviewTemperature,
      });
      const revised = extractJson(response.content) as any;
      const candidate = String(revised.text || revised.content || editedText);
      if (candidate && estimateDialogueCountText(candidate) >= dialoguesTarget) {
        editedText = candidate;
      }
    }
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, '对白补强阶段忽略错误');
  }

  const approxWordCount = editedText ? editedText.replace(/\s+/g, '').length : (chapter.wordCount ?? 0);
  return { ...chapter, content: editedText, wordCount: approxWordCount };
}
