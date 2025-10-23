import {
  deepseekClient,
  DEEPSEEK_CONFIG,
  isDeepseekApiKeyValid,
  DEEPSEEK_TIMEOUTS,
} from '../../config/deepseek';
import { createLogger } from '../../config/logger';
import type {
  DetectiveOutline,
  DetectiveStoryDraft,
  WorkflowStageArtifactType,
  WorkflowStageLogLevel,
  ValidationReport,
  DetectiveRevisionNote,
  DetectiveRevisionNoteCategory,
  BetaReaderInsight,
  HypothesisEvaluation,
} from '@storyapp/shared';
import {
  buildStage1Prompt,
  buildStage1PromptProfile,
  buildStage2Prompt,
  buildStage2PromptProfile,
  buildStage3Prompt,
  buildStage3PromptProfile,
  buildStage4RevisionPrompt,
  buildStage4RevisionPromptProfile,
  RevisionPlan,
  RevisionPlanIssue,
} from './promptUtils';
import { resolvePromptProfile } from './promptProfiles';
import type { PromptBuildOptions } from './promptBuilder';
import { buildWriterPrompt, buildEditorPrompt } from './promptBuilder';
import { validateDetectiveOutline } from '../../utils/schemaValidator';
import { createQuickOutline, synthMockChapter } from './mockUtils';
import { buildClueGraphFromOutline, scoreFairPlay, CLUE_GRAPH_VERSION } from './clueGraph';
import { enforceFocalization, applyStylePackToDraft, throttleTemplates, applyClicheGuard } from './styleToolkit';
import { planDenouement, assertPlantPayoffCompleteness } from './structureToolkit';

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

const CRITICAL_VALIDATION_RULES = new Set([
  'timeline-from-text',
  'chapter-time-tags',
  'motive-foreshadowing',
  'chapter-word-target',
  'emotional-beats',
  'misdirection-deployment',
  'ending-resolution',
]);

const REVISION_NOTE_CATEGORY_VALUES: DetectiveRevisionNoteCategory[] = ['model', 'system', 'validation', 'manual'];

function isRevisionNoteCategory(value: unknown): value is DetectiveRevisionNoteCategory {
  return typeof value === 'string' && REVISION_NOTE_CATEGORY_VALUES.includes(value as DetectiveRevisionNoteCategory);
}

type RevisionNoteInput = string | Partial<DetectiveRevisionNote> | null | undefined;

export function normalizeRevisionNote(
  note: RevisionNoteInput,
  fallback: Partial<DetectiveRevisionNote> = {},
): DetectiveRevisionNote | null {
  if (note === null || note === undefined) {
    return null;
  }
  const base: Partial<DetectiveRevisionNote> = { ...fallback };
  if (typeof note === 'string') {
    base.message = note;
  } else if (typeof note === 'object') {
    const raw = note as Record<string, unknown>;
    if (typeof raw.message === 'string') {
      base.message = raw.message;
    } else if (typeof raw.detail === 'string') {
      base.message = raw.detail;
    } else if (typeof raw.text === 'string') {
      base.message = raw.text;
    }
    if (typeof raw.category === 'string' && isRevisionNoteCategory(raw.category)) {
      base.category = raw.category;
    }
    if (typeof raw.stage === 'string' && raw.stage.trim()) {
      base.stage = raw.stage.trim();
    }
    if (typeof raw.source === 'string' && raw.source.trim()) {
      base.source = raw.source.trim();
    }
    if (typeof raw.relatedRuleId === 'string' && raw.relatedRuleId.trim()) {
      base.relatedRuleId = raw.relatedRuleId.trim();
    } else if (typeof raw.ruleId === 'string' && raw.ruleId.trim()) {
      base.relatedRuleId = raw.ruleId.trim();
    }
    if (typeof raw.chapter === 'string' && raw.chapter.trim()) {
      base.chapter = raw.chapter.trim();
    } else if (typeof raw.chapterRef === 'string' && raw.chapterRef.trim()) {
      base.chapter = raw.chapterRef.trim();
    }
    if (typeof raw.createdAt === 'string' && raw.createdAt.trim()) {
      base.createdAt = raw.createdAt.trim();
    }
    if (typeof raw.id === 'string' && raw.id.trim()) {
      base.id = raw.id.trim();
    }
  } else {
    return null;
  }

  const message = typeof base.message === 'string' ? base.message.trim() : '';
  if (!message) {
    return null;
  }
  const category = base.category && isRevisionNoteCategory(base.category) ? base.category : 'model';

  return {
    message,
    category,
    stage: base.stage,
    source: base.source,
    relatedRuleId: base.relatedRuleId,
    chapter: base.chapter,
    createdAt: base.createdAt,
    id: typeof base.id === 'string' ? base.id : undefined,
  };
}

export function normalizeRevisionNotes(
  notes: unknown,
  fallback: Partial<DetectiveRevisionNote> = {},
): DetectiveRevisionNote[] {
  if (!notes) {
    return [];
  }
  const array = Array.isArray(notes) ? notes : [notes];
  return array
    .map((item) => normalizeRevisionNote(item as RevisionNoteInput, fallback))
    .filter((note): note is DetectiveRevisionNote => Boolean(note));
}

export function mergeRevisionNotes(lists: Array<DetectiveRevisionNote[]>): DetectiveRevisionNote[] {
  const seen = new Set<string>();
  const merged: DetectiveRevisionNote[] = [];
  lists.forEach((list) => {
    list.forEach((note) => {
      if (!note || !note.message) return;
      const key = [
        note.category,
        note.stage ?? '',
        note.source ?? '',
        note.relatedRuleId ?? '',
        note.chapter ?? '',
        note.message,
      ].join('::');
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      merged.push(note);
    });
  });
  return merged;
}

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

export interface Stage4RevisionResult {
  draft: DetectiveStoryDraft;
  plan: RevisionPlan;
  skipped: boolean;
}

type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

interface DeepseekCallOptions {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens: number;
  reasoningTokensOverride?: number;
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
  
  // 根据模型类型选择超时时间
  const timeout = options.model === 'deepseek-reasoner' 
    ? DEEPSEEK_TIMEOUTS.REASONER 
    : DEEPSEEK_TIMEOUTS.CHAT;
  
  const startTime = Date.now();
  const isReasonerModel =
    options.model === DEEPSEEK_CONFIG.REASONER_MODEL ||
    typeof options.model === 'string' && options.model.toLowerCase().includes('reasoner');
  const reasoningMaxTokensEnv = process.env.DEEPSEEK_REASONER_MAX_COT_TOKENS;
  const reasoningMaxTokens =
    options.reasoningTokensOverride ??
    (reasoningMaxTokensEnv ? Number.parseInt(reasoningMaxTokensEnv, 10) : 1024);
  
  try {
    logger.info(
      { model: options.model, timeout: `${timeout}ms` },
      'DeepSeek API 调用开始',
    );
    
    const requestBody: Record<string, any> = {
      model: options.model,
      messages: options.messages,
      max_tokens: options.maxTokens,
      stream: false,
    };
    if (isReasonerModel) {
      requestBody.reasoning = {
        max_tokens: Math.max(1, Math.min(reasoningMaxTokens || 1024, options.maxTokens)),
      };
    } else if (options.temperature !== undefined) {
      requestBody.temperature = options.temperature;
    }

    const response = await deepseekClient.post('/chat/completions', requestBody, {
      timeout, // 单独设置超时
    });

    const duration = Date.now() - startTime;
    
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

    logger.info(
      { model: options.model, duration: `${duration}ms` },
      'DeepSeek API 调用成功',
    );

    return {
      content,
      usage: response?.data?.usage,
    };
  } catch (error: any) {
    const duration = Date.now() - startTime;
    
    // 判断是否超时错误
    const isTimeout = error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED';
    
    logger.error(
      { 
        err: error, 
        model: options.model, 
        duration: `${duration}ms`,
        timeout: `${timeout}ms`,
        isTimeout,
        errorCode: error.code,
      },
      isTimeout ? 'DeepSeek API 调用超时' : 'DeepSeek API 调用失败',
    );
    
    // 抛出更友好的错误信息
    if (isTimeout) {
      throw new Error(`AI模型响应超时（${timeout/1000}秒），请稍后重试`);
    }
    
    throw error;
  }
}

function clampConfidence(value: unknown): number {
  const num = Number(value);
  if (Number.isNaN(num)) return 0;
  return Math.max(0, Math.min(1, num));
}

function suspectsSummary(outline: DetectiveOutline): string {
  const suspects = Array.isArray(outline?.characters)
    ? outline.characters.filter((character) =>
        typeof character?.role === 'string' && /suspect/i.test(character.role),
      )
    : [];
  if (!suspects.length) return '（暂无嫌疑人数据）';
  return suspects
    .map((suspect) => {
      const motive = Array.isArray(suspect?.motiveKeywords) && suspect.motiveKeywords.length
        ? `动机：${suspect.motiveKeywords.join('、')}`
        : suspect?.motive
        ? `动机：${suspect.motive}`
        : '动机待补充';
      const secrets = Array.isArray(suspect?.secrets) && suspect.secrets.length
        ? `秘密：${suspect.secrets.join('、')}`
        : '';
      return `- ${suspect?.name ?? '未知嫌疑人'}｜${motive}${secrets ? `；${secrets}` : ''}`;
    })
    .join('\n');
}

function buildEvidencePack(outline: DetectiveOutline, draft: DetectiveStoryDraft, maxChars = 4200): string {
  const suspectLine = suspectsSummary(outline);
  const chapterTexts = Array.isArray(draft?.chapters)
    ? draft.chapters.map((chapter, index) => `【第${index + 1}章】\n${chapter?.content ?? ''}`)
    : [];
  let combined = chapterTexts.join('\n\n---\n\n');
  if (combined.length > maxChars) {
    const head = combined.slice(0, Math.floor(maxChars * 0.6));
    const tail = combined.slice(-Math.floor(maxChars * 0.35));
    combined = `${head}\n\n……（中间章节略）……\n\n${tail}`;
  }
  return [`嫌疑人一览：`, suspectLine, '', '已公开章节节选：', combined].join('\n');
}

async function betaReaderSolve(
  outline: DetectiveOutline,
  draft: DetectiveStoryDraft,
): Promise<BetaReaderInsight | null> {
  try {
    const evidencePack = buildEvidencePack(outline, draft, 3600);
    const systemPrompt = [
      '你是一名资深推理小说读者（Beta Reader），只根据已公开的章节推测真凶。',
      '请严格遵守公平推理原则，不得引用未提供的隐藏信息。',
      '最终请输出 JSON。',
    ].join('\n');
    const userPrompt = [
      '请阅读以下嫌疑人与文本节选，并按照格式给出当前最可能的真凶：',
      evidencePack,
      '',
      '输出格式：',
      '{',
      '  "topSuspect": "",',
      '  "confidence": 0-1,',
      '  "evidence": [""],',
      '  "summary": "",',
      '  "competingSuspects": [""],',
      '  "openQuestions": ["" ]',
      '}',
    ].join('\n');

    const { content } = await callDeepseek({
      model: DETECTIVE_CONFIG.reviewModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      maxTokens: 1200,
      temperature: 0.2,
    });

    const parsed = extractJson(content) as Partial<BetaReaderInsight>;
    if (!parsed || typeof parsed !== 'object') return null;
    const topSuspect = typeof parsed.topSuspect === 'string' ? parsed.topSuspect.trim() : '';
    if (!topSuspect) return null;
    const confidence = clampConfidence(parsed.confidence);
    const evidence = Array.isArray(parsed.evidence)
      ? parsed.evidence.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : [];
    const summary = typeof parsed.summary === 'string' ? parsed.summary.trim() : '';
    const competingSuspects = Array.isArray(parsed.competingSuspects)
      ? parsed.competingSuspects.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : undefined;
    const openQuestions = Array.isArray(parsed.openQuestions)
      ? parsed.openQuestions.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : undefined;
    return {
      topSuspect,
      confidence,
      evidence,
      summary,
      competingSuspects,
      openQuestions,
    };
  } catch (error) {
    logger.warn({ err: error }, 'betaReaderSolve 执行失败');
    return null;
  }
}

async function enumerateHypotheses(
  outline: DetectiveOutline,
  draft: DetectiveStoryDraft,
): Promise<HypothesisEvaluation | null> {
  try {
    const evidencePack = buildEvidencePack(outline, draft, 4200);
    const suspectsLine = suspectsSummary(outline);
    const systemPrompt = [
      '你是一名推理小说假设评估器，任务是基于已公开文本给出 2-3 套可能解法。',
      '请避免剧透未给出的信息，严格遵守公平原则。',
      '输出 JSON，包含 candidates（数组），每个元素需有 suspect、confidence(0-1)、evidence（数组）及 rationale。',
    ].join('\n');
    const userPrompt = [
      '嫌疑人列表：',
      suspectsLine,
      '',
      '章节节选：',
      evidencePack,
      '',
      '输出示例：',
      '{',
      '  "candidates": [',
      '    { "suspect": "张三", "confidence": 0.6, "evidence": ["线索A"], "rationale": "..." }',
      '  ],',
      '  "notes": ["……"],',
      '  "recommendation": "……"',
      '}',
    ].join('\n');

    const { content } = await callDeepseek({
      model: DETECTIVE_CONFIG.reviewModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      maxTokens: 1500,
      temperature: 0.2,
    });
    const parsed = extractJson(content) as HypothesisEvaluation;
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.candidates)) {
      return null;
    }
    const cleanedCandidates = parsed.candidates
      .filter((candidate) => candidate && typeof candidate === 'object')
      .map((candidate) => ({
        suspect: typeof candidate.suspect === 'string' ? candidate.suspect.trim() : '未知嫌疑人',
        confidence: clampConfidence(candidate.confidence),
        evidence: Array.isArray(candidate.evidence)
          ? candidate.evidence.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
          : [],
        rationale: typeof candidate.rationale === 'string' ? candidate.rationale.trim() : undefined,
      }))
      .filter(Boolean);
    if (!cleanedCandidates.length) {
      return null;
    }
    const notes = Array.isArray(parsed.notes)
      ? parsed.notes.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : undefined;
    const recommendation = typeof parsed.recommendation === 'string' ? parsed.recommendation.trim() : undefined;
    return {
      candidates: cleanedCandidates,
      notes,
      recommendation,
    };
  } catch (error) {
    logger.warn({ err: error }, 'enumerateHypotheses 执行失败');
    return null;
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

function deriveRevisionPlan(
  review: Record<string, unknown> | null | undefined,
  validation?: ValidationReport | null,
): RevisionPlan {
  if (!review || typeof review !== 'object') {
    const basePlan = { mustFix: [], warnings: [], suggestions: [] };
    if (!validation) return basePlan;
    return deriveRevisionPlan({} as any, validation);
  }

  const mustFix: RevisionPlanIssue[] = [];
  const warnings: RevisionPlanIssue[] = [];
  const seen = new Set<string>();

  const pushItem = (target: RevisionPlanIssue[], issue: RevisionPlanIssue) => {
    if (!issue.detail) return;
    const key = `${issue.id}::${issue.category || ''}::${issue.chapterRef || ''}::${issue.detail}`;
    if (seen.has(key)) return;
    seen.add(key);
    target.push(issue);
  };

  const mustFixList = Array.isArray((review as any).mustFixBeforePublish)
    ? ((review as any).mustFixBeforePublish as any[]).filter((item) => typeof item === 'string' && item.trim().length > 0)
    : [];
  mustFixList.forEach((detail, index) => {
    pushItem(mustFix, {
      id: `mustfix-${index + 1}`,
      detail: detail.trim(),
    });
  });

  const issues = Array.isArray((review as any).issues) ? ((review as any).issues as any[]) : [];
  issues.forEach((issueRaw, index) => {
    if (!issueRaw || typeof issueRaw !== 'object') return;
    const detail = typeof issueRaw.detail === 'string' ? issueRaw.detail.trim() : '';
    if (!detail) return;
    const category = typeof issueRaw.category === 'string' ? issueRaw.category : undefined;
    const chapterRef = typeof issueRaw.chapterRef === 'string' ? issueRaw.chapterRef : undefined;
    const id =
      typeof issueRaw.id === 'string' && issueRaw.id.trim().length > 0 ? issueRaw.id.trim() : `issue-${index + 1}`;
    const tokens = [
      typeof issueRaw.severity === 'string' ? issueRaw.severity.toLowerCase() : '',
      typeof issueRaw.priority === 'string' ? issueRaw.priority.toLowerCase() : '',
      typeof issueRaw.level === 'string' ? issueRaw.level.toLowerCase() : '',
    ];
    const categoryLower = (category || '').toLowerCase();
    const isMustFixBySeverity = tokens.some((token) =>
      ['blocker', 'critical', 'must', 'fail'].some((flag) => token.includes(flag)),
    );
    const reviewApproved = typeof (review as any).approved === 'boolean' ? (review as any).approved : true;
    const isMustFixByCategory = !reviewApproved && ['logic', 'fairness'].includes(categoryLower);
    const matchedMustFixDetail = mustFixList.some((item) => item.includes(detail));
    const target = isMustFixBySeverity || isMustFixByCategory || matchedMustFixDetail ? mustFix : warnings;
    pushItem(target, {
      id,
      detail,
      category,
      chapterRef,
    });
  });

  if (validation && Array.isArray(validation.results)) {
    validation.results.forEach((result) => {
      if (!result || typeof result !== 'object') return;
      const ruleId = typeof result.ruleId === 'string' ? result.ruleId : '';
      if (!ruleId) return;
      const detailMessage =
        Array.isArray(result.details) && result.details.length > 0
          ? result.details
              .map((detail) => (detail && typeof detail.message === 'string' ? detail.message.trim() : ''))
              .filter((msg) => msg)
              .join('；')
          : '';
      const issue: RevisionPlanIssue = {
        id: `validation-${ruleId}`,
        detail: detailMessage ? `[${ruleId}] ${detailMessage}` : `[${ruleId}] 根据校验提示补齐缺失信息`,
        category: 'validation',
      };
      if (result.status === 'fail') {
        pushItem(mustFix, issue);
        return;
      }
      if (CRITICAL_VALIDATION_RULES.has(ruleId) && result.status !== 'pass') {
        pushItem(mustFix, issue);
        return;
      }
      if (result.status === 'warn') {
        pushItem(warnings, issue);
      }
    });
  }

  const suggestions =
    Array.isArray((review as any).suggestions) && (review as any).suggestions.length > 0
      ? ((review as any).suggestions as any[])
          .filter((item) => typeof item === 'string' && item.trim().length > 0)
          .map((item: string) => item.trim())
      : [];

  return { mustFix, warnings, suggestions };
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

function collectSolutionMotiveTokens(outline: DetectiveOutline): string[] {
  const solution: any = (outline as any)?.solution;
  if (!solution) return [];
  const texts: string[] = [];
  if (typeof solution.motiveCore === 'string') {
    texts.push(solution.motiveCore);
  }
  if (Array.isArray(solution.keyReveals)) {
    solution.keyReveals.forEach((item: unknown) => {
      if (typeof item === 'string' && item.trim()) {
        texts.push(item.trim());
      }
    });
  }
  const tokens = new Set<string>();
  texts.forEach((text) => {
    const pieces = text
      .split(/[，。,.;；：:!?！？\s]/)
      .map((segment) => segment.trim())
      .filter((segment) => segment.length >= 2 && /[\u4e00-\u9fa5]/.test(segment));
    pieces.forEach((piece) => {
      if (piece.length > 12) {
        const matches = piece.match(/[\u4e00-\u9fa5]{2,6}/g);
        if (matches) {
          matches.forEach((match) => tokens.add(match));
        }
      }
      tokens.add(piece);
    });
  });
  return Array.from(tokens);
}

function ensureSuspectMotiveMetadata(outline: DetectiveOutline): DetectiveOutline {
  const characters = Array.isArray(outline.characters) ? [...outline.characters] : [];
  if (characters.length === 0) {
    return outline;
  }
  const solutionTokens = collectSolutionMotiveTokens(outline).slice(0, 8);
  const updatedCharacters = characters.map((character) => {
    if (!character || typeof character.role !== 'string' || !/suspect/i.test(character.role)) {
      return character;
    }
    const motive = typeof character.motive === 'string' ? character.motive : '';
    const existingKeywords = Array.isArray(character.motiveKeywords)
      ? Array.from(
          new Set(
            character.motiveKeywords
              .filter((kw): kw is string => typeof kw === 'string' && kw.trim().length > 0)
              .map((kw) => kw.trim()),
          ),
        )
      : [];
    const keywordSet = new Set(existingKeywords);
    const pushKeyword = (value?: string) => {
      const normalized = value?.trim();
      if (!normalized || normalized.length < 2) return;
      if (!/[\u4e00-\u9fa5]/.test(normalized)) return;
      keywordSet.add(normalized);
    };
    if (motive) {
      motive
        .split(/[，。,.;；：:!?！？\s]/)
        .map((segment) => segment.trim())
        .filter((segment) => segment.length >= 2)
        .forEach((segment) => {
          if (segment.length > 12) {
            const matches = segment.match(/[\u4e00-\u9fa5]{2,6}/g);
            if (matches) {
              matches.forEach((match) => pushKeyword(match));
              return;
            }
          }
          pushKeyword(segment);
        });
    }
    if (solutionTokens.length > 0) {
      solutionTokens.forEach((token) => pushKeyword(token));
    }
    const keywords = Array.from(keywordSet).slice(0, 6);
    let motiveScenes: string[] | undefined;
    if (Array.isArray(character.motiveScenes) && character.motiveScenes.length > 0) {
      motiveScenes = character.motiveScenes;
    } else {
      motiveScenes = ['Chapter 1', 'Chapter 2'];
    }
    return {
      ...character,
      motiveKeywords: keywords.length > 0 ? keywords : character.motiveKeywords,
      motiveScenes,
    };
  });
  return {
    ...outline,
    characters: updatedCharacters,
  };
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

type ChapterAnchorMeta = {
  index: number;
  dayCode?: string;
  time?: string;
  label?: string;
  summary?: string;
};

type ChapterBlueprintMeta = {
  index: number;
  wordTarget?: number;
  conflictGoal?: string;
  backgroundNeeded?: string[];
  emotionalBeat?: string;
};

type SettingAtmosphereMeta = {
  openingMood?: string;
  sensoryPalette?: string[];
  nightDetails?: string;
  weather?: string;
};

const TIME_PATTERN = /\b(\d{1,2}:\d{2})\b/;
const DAY_PATTERN = /Day\s*(\d+)/i;

function computeWordCount(text: string | undefined): number {
  if (!text) return 0;
  return text.replace(/\s+/g, '').length;
}

function canonicalDayCode(value?: string | null): string | undefined {
  if (!value) return undefined;
  const match = String(value).match(DAY_PATTERN);
  if (!match) return undefined;
  return `Day${match[1]}`;
}

function canonicalHHMM(value?: string | null): string | undefined {
  if (!value) return undefined;
  const match = String(value).match(/(\d{1,2}):([0-5]\d)/);
  if (!match) return undefined;
  const hour = match[1].padStart(2, '0');
  const minute = match[2];
  return `${hour}:${minute}`;
}

function extractChapterIndexFromString(input?: string | null): number | null {
  if (!input) return null;
  const match = String(input).match(/Chapter\s*(\d+)/i);
  if (!match) return null;
  const index = Number.parseInt(match[1], 10) - 1;
  if (!Number.isFinite(index) || index < 0) return null;
  return index;
}

function deriveAnchorsFromTimeline(
  outline: DetectiveOutline,
  chapters: DetectiveStoryDraft['chapters'],
): Map<number, ChapterAnchorMeta> {
  const map = new Map<number, ChapterAnchorMeta>();
  const timeline = Array.isArray(outline?.timeline) ? outline.timeline : [];
  if (!timeline.length || !Array.isArray(chapters) || !chapters.length) {
    return map;
  }
  timeline.forEach((event) => {
    const indices = new Set<number>();
    if (Array.isArray(event?.participants)) {
      event.participants.forEach((participant) => {
        const idx = extractChapterIndexFromString(participant);
        if (idx !== null) {
          indices.add(idx);
        }
      });
    }
    const idxFromEvent = extractChapterIndexFromString(event?.event);
    if (idxFromEvent !== null) {
      indices.add(idxFromEvent);
    }
    if (!indices.size) {
      return;
    }
    const dayCode = canonicalDayCode(event?.time);
    const time = canonicalHHMM(event?.time);
    indices.forEach((index) => {
      if (index < 0 || index >= chapters.length) return;
      const existing = map.get(index) || { index };
      if (dayCode && !existing.dayCode) {
        existing.dayCode = dayCode;
      }
      if (time && !existing.time) {
        existing.time = time;
      }
      if (!existing.label) {
        const title = chapters[index]?.title?.trim();
        if (title && !/^第?\d+章/.test(title)) {
          existing.label = title;
        }
      }
      if (!existing.summary && event?.event) {
        existing.summary = event.event.trim();
      }
      map.set(index, existing);
    });
  });
  return map;
}

function parseChapterIndex(label?: string | null): number | null {
  if (!label) return null;
  const match = String(label).match(/(\d+)/);
  if (!match) return null;
  const index = Number.parseInt(match[1], 10) - 1;
  if (!Number.isFinite(index) || index < 0) return null;
  return index;
}

function collectChapterAnchors(outline: DetectiveOutline): Map<number, ChapterAnchorMeta> {
  const map = new Map<number, ChapterAnchorMeta>();
  const anchors = outline?.chapterAnchors ?? [];
  if (!Array.isArray(anchors)) return map;
  anchors.forEach((anchor) => {
    const index = parseChapterIndex(anchor?.chapter);
    if (index === null) return;
    map.set(index, {
      index,
      dayCode: anchor?.dayCode ?? undefined,
      time: anchor?.time ?? undefined,
      label: anchor?.label ?? undefined,
      summary: anchor?.summary ?? undefined,
    });
  });
  return map;
}

function collectChapterBlueprints(outline: DetectiveOutline): Map<number, ChapterBlueprintMeta> {
  const map = new Map<number, ChapterBlueprintMeta>();
  const blueprints = (outline as any)?.chapterBlueprints;
  if (!Array.isArray(blueprints)) return map;
  blueprints.forEach((bp: any) => {
    const index = parseChapterIndex(bp?.chapter);
    if (index === null) return;
    const backgroundNeeded = Array.isArray(bp?.backgroundNeeded)
      ? bp.backgroundNeeded.filter(
          (item: unknown): item is string => typeof item === 'string' && item.trim().length > 0,
        )
      : undefined;
    map.set(index, {
      index,
      wordTarget: typeof bp?.wordTarget === 'number' ? bp.wordTarget : undefined,
      conflictGoal: typeof bp?.conflictGoal === 'string' ? bp.conflictGoal : undefined,
      backgroundNeeded,
      emotionalBeat: typeof bp?.emotionalBeat === 'string' ? bp.emotionalBeat : undefined,
    });
  });
  return map;
}

function hasAnchorInText(text: string | undefined, anchor: ChapterAnchorMeta): boolean {
  if (!text) return false;
  const normalized = text.replace(/\s+/g, '');
  const dayOk = anchor.dayCode ? normalized.includes(anchor.dayCode.replace(/\s+/g, '')) : true;
  const timeOk = anchor.time ? normalized.includes(anchor.time.replace(/\s+/g, '')) : true;
  return dayOk && timeOk;
}

function buildAnchorSentence(
  anchor: ChapterAnchorMeta,
  atmosphere?: SettingAtmosphereMeta,
  blueprint?: ChapterBlueprintMeta,
): string {
  const segments: string[] = [];
  const timeSegmentParts: string[] = [];
  if (anchor.dayCode) {
    timeSegmentParts.push(anchor.dayCode.replace(/\s+/g, ''));
  }
  if (anchor.time) {
    timeSegmentParts.push(anchor.time);
  }
  if (timeSegmentParts.length > 0) {
    segments.push(timeSegmentParts.join(' '));
  }
  if (anchor.label) {
    segments.push(anchor.label.trim());
  }
  const atmospherePieces: string[] = [];
  if (Array.isArray(atmosphere?.sensoryPalette) && atmosphere.sensoryPalette.length > 0) {
    const sensory = atmosphere.sensoryPalette.find(
      (item) => typeof item === 'string' && item.trim().length > 0,
    );
    if (sensory) {
      atmospherePieces.push(`空气中弥漫着${sensory.trim()}`);
    }
  }
  if (atmosphere?.weather && typeof atmosphere.weather === 'string') {
    atmospherePieces.push(atmosphere.weather.trim());
  }
  if (atmospherePieces.length > 0) {
    segments.push(atmospherePieces.join('，'));
  } else if (atmosphere?.openingMood && typeof atmosphere.openingMood === 'string') {
    segments.push(atmosphere.openingMood.trim());
  }
  if (blueprint?.backgroundNeeded && blueprint.backgroundNeeded.length > 0) {
    const background = blueprint.backgroundNeeded[0];
    segments.push(`相关背景：${background}`);
  } else if (blueprint?.conflictGoal) {
    segments.push(`当前冲突：${blueprint.conflictGoal}`);
  }
  let sentence = segments.filter(Boolean).join('，');
  if (!sentence) {
    sentence = '时间未明';
  }
  if (anchor.summary) {
    const summary = anchor.summary.trim();
    if (summary) {
      sentence = `${sentence}，${summary}`;
    }
  }
  if (!/[。！？!?]$/.test(sentence)) {
    sentence += '。';
  }
  return sentence;
}

function injectAnchorIntoChapter(
  content: string | undefined,
  anchor: ChapterAnchorMeta,
  atmosphere?: SettingAtmosphereMeta,
  blueprint?: ChapterBlueprintMeta,
): { text: string; inserted: boolean } {
  const base = content ?? '';
  if (hasAnchorInText(base, anchor)) {
    return { text: base, inserted: false };
  }
  const sentence = buildAnchorSentence(anchor, atmosphere, blueprint);
  const trimmedStart = base.trimStart();
  if (!trimmedStart) {
    return { text: sentence, inserted: true };
  }
  const lines = trimmedStart.split(/\n/);
  if (lines.length > 0) {
    const firstLine = lines[0];
    if (/Day\s*\d+/i.test(firstLine) && TIME_PATTERN.test(firstLine)) {
      if (firstLine.includes(sentence)) {
        return { text: trimmedStart, inserted: false };
      }
      lines.splice(1, 0, sentence);
      return { text: lines.join('\n'), inserted: true };
    }
  }
  const merged = `${sentence}\n${trimmedStart}`;
  return { text: merged, inserted: true };
}

function insertSentenceAfterIntro(content: string | undefined, sentence: string): string {
  const base = content ?? '';
  const normalizedSentence = ensureSentence(sentence);
  if (!normalizedSentence) {
    return base;
  }
  if (!base.trim()) {
    return normalizedSentence;
  }
  const trimmed = base.trimStart();
  if (trimmed.includes(normalizedSentence)) {
    return base;
  }
  const lines = trimmed.split('\n');
  if (lines.length === 0) {
    return `${normalizedSentence}\n${trimmed}`;
  }
  const firstLine = lines[0];
  const anchorLine = /Day\s*\d+/i.test(firstLine) && TIME_PATTERN.test(firstLine);
  if (anchorLine) {
    lines.splice(1, 0, normalizedSentence);
    return lines.join('\n');
  }
  return `${normalizedSentence}\n${trimmed}`;
}

const META_SENTENCE_PATTERNS: RegExp[] = [
  /[“"']?侦探暗自记下[:：][^。！？!?]*[。！？!?]?/g,
  /[“"']?侦探立即记录在案[^。！？!?]*[。！？!?]?/g,
  /[“"']?证人[甲乙丙丁][：:][^。！？!?]*[。！？!?]?/g,
];

function sanitizeMetaNarration(content: string | undefined): string {
  if (!content) return content ?? '';
  let result = content;
  META_SENTENCE_PATTERNS.forEach((pattern) => {
    result = result.replace(pattern, '');
  });
  result = result
    .replace(/血腥味/g, '金属味')
    .replace(/血腥/g, '金属味')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
  return result;
}

function sanitizeChapters(chapters: DetectiveStoryDraft['chapters']): DetectiveStoryDraft['chapters'] {
  return chapters.map((chapter) => {
    const cleanedContent = sanitizeMetaNarration(chapter.content);
    const cleanedSummary = chapter.summary ? sanitizeMetaNarration(chapter.summary) : chapter.summary;
    return {
      ...chapter,
      summary: cleanedSummary,
      content: cleanedContent,
      wordCount: cleanedContent.replace(/\s+/g, '').length,
    };
  });
}

function ensureAnchorsForDraft(outline: DetectiveOutline, draft: DetectiveStoryDraft) {
  const anchorMap = collectChapterAnchors(outline);
  const timelineAnchors = deriveAnchorsFromTimeline(outline, draft.chapters);
  const blueprintMap = collectChapterBlueprints(outline);
  const atmosphere: SettingAtmosphereMeta | undefined = (outline as any)?.settingAtmosphere || undefined;
  timelineAnchors.forEach((anchor, index) => {
    if (!anchorMap.has(index)) {
      anchorMap.set(index, anchor);
      return;
    }
    const current = anchorMap.get(index)!;
    if (!current.dayCode && anchor.dayCode) {
      current.dayCode = anchor.dayCode;
    }
    if (!current.time && anchor.time) {
      current.time = anchor.time;
    }
    if (!current.label && anchor.label) {
      current.label = anchor.label;
    }
    if (!current.summary && anchor.summary) {
      current.summary = anchor.summary;
    }
  });
  if (anchorMap.size === 0) {
    return { chapters: draft.chapters, notes: [] as string[] };
  }
  const notes: string[] = [];
  const updatedChapters = draft.chapters.map((chapter, index) => {
    if (!anchorMap.has(index)) {
      return chapter;
    }
    const anchor = anchorMap.get(index)!;
    const { text, inserted } = injectAnchorIntoChapter(
      chapter.content,
      anchor,
      atmosphere,
      blueprintMap.get(index),
    );
    if (!inserted) {
      return chapter;
    }
    notes.push(`自动补齐章节时间提示：Chapter ${index + 1} → ${anchor.dayCode ?? ''} ${anchor.time ?? ''}`.trim());
    const updatedSummary = chapter.summary && !hasAnchorInText(chapter.summary, anchor)
      ? `${buildAnchorSentence(anchor, atmosphere, blueprintMap.get(index))}${chapter.summary.startsWith('\n') ? '' : '\n'}${chapter.summary}`
      : chapter.summary;
    return {
      ...chapter,
      summary: updatedSummary,
      content: text,
      wordCount: text.replace(/\s+/g, '').length,
    };
  });
  return { chapters: updatedChapters, notes };
}

function ensureSentence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  return /[。！？!?]$/.test(trimmed) ? trimmed : `${trimmed}。`;
}

function normalizeClauseText(input: string | undefined, fallback: string): string {
  const value = typeof input === 'string' ? input.trim() : '';
  if (!value) return fallback;
  return value.replace(/[，。、；;\s]+$/g, '');
}

function buildSuspectMotiveSentence(options: {
  suspectName: string;
  keyword: string;
  reaction: string;
  cue: string;
  diversionTopic?: string | null;
  variationSeed: number;
}): string {
  const { suspectName, keyword, reaction, cue, diversionTopic, variationSeed } = options;
  const seed = Math.abs(variationSeed);
  const introVariants = [
    `${suspectName}听到“${keyword}”时`,
    `当话题触及“${keyword}”`,
    `只要有人提到“${keyword}”，${suspectName}`,
    `一说到“${keyword}”，${suspectName}`,
  ];
  const intro = introVariants[seed % introVariants.length];
  const reactionClause = normalizeClauseText(reaction, '语气突然一滞');
  const cueClause = normalizeClauseText(cue, `${suspectName}下意识别开视线`);
  const diversionLabel = diversionTopic ? diversionTopic.replace(/[。！？!?]+$/g, '').trim() : '';
  const diversionTemplates = diversionLabel
    ? [
        `，借口转谈${diversionLabel}`,
        `，匆忙把话题引到${diversionLabel}`,
        `，装作若无其事地聊起${diversionLabel}`,
        `，顺势岔开去说${diversionLabel}`,
      ]
    : [''];
  const diversionClause = diversionTemplates[seed % diversionTemplates.length];
  const sentenceTemplates: Array<() => string> = [
    () => `${intro}，先是${reactionClause}，随即${cueClause}${diversionClause}`,
    () => `${intro}，${reactionClause}，${cueClause}${diversionClause}`,
    () => `${intro}的瞬间，${cueClause}，而且${reactionClause}${diversionClause}`,
    () => `${intro}就显得${reactionClause.replace(/^语气/, '语气')}，${cueClause}${diversionClause}`,
  ];
  const rawSentence = sentenceTemplates[(seed >> 1) % sentenceTemplates.length]();
  return ensureSentence(rawSentence.replace(/，{2,}/g, '，'));
}

function buildSolutionForeshadowSentence(options: {
  detectiveName: string;
  token: string;
  variationSeed: number;
}): string {
  const { detectiveName, token, variationSeed } = options;
  const templates: Array<() => string> = [
    () => `${detectiveName}听到“${token}”这个词，眉头一紧，悄悄在笔记本上做了标记`,
    () => `谈话一触及“${token}”，${detectiveName}和助手交换了眼神，示意稍后追问`,
    () => `“${token}”这两个字让${detectiveName}的笔尖顿了一下，他意识到这里可能藏着关键`,
    () => `${detectiveName}表面顺着话题，却把“${token}”记在心底，准备夜里独自核对`,
    () => `${detectiveName}若无其事地笑着，可手指却在桌面轻敲“${token}”的节奏`,
    () => `当人群随口提到“${token}”，${detectiveName}把杯子放缓，暗暗记起要回去翻案卷`,
  ];
  return ensureSentence(templates[variationSeed % templates.length]());
}

function ensureMotivesForDraft(
  outline: DetectiveOutline,
  draft: DetectiveStoryDraft,
): { chapters: DetectiveStoryDraft['chapters']; notes: string[] } {
  const characters = outline?.characters ?? [];
  const suspects = characters.filter((char) => typeof char?.role === 'string' && /suspect/i.test(char.role));
  if (suspects.length === 0) {
    return { chapters: draft.chapters, notes: [] };
  }
  const blueprintMap = collectChapterBlueprints(outline);
  const emotionalBeats = Array.isArray((outline as any)?.emotionalBeats)
    ? (outline as any).emotionalBeats
    : [];
  const backstories = Array.isArray((outline as any)?.characterBackstories)
    ? (outline as any).characterBackstories
    : [];
  const chapters = [...draft.chapters];
  const detectiveName = (() => {
    const detective = characters.find((char) => typeof char?.role === 'string' && /detective/i.test(char.role));
    if (detective?.name && /[\u4e00-\u9fa5]/.test(detective.name)) {
      return detective.name;
    }
    return '李明';
  })();
  const combinedEarlyText = chapters
    .slice(0, Math.min(2, chapters.length))
    .map((chapter) => `${chapter.summary || ''}\n${chapter.content || ''}`)
    .join('\n');
  const notes: string[] = [];

  suspects.forEach((suspect) => {
    const keywords = Array.isArray(suspect.motiveKeywords)
      ? Array.from(new Set(suspect.motiveKeywords.filter((kw): kw is string => Boolean(kw && kw.trim()))))
      : [];
    if (keywords.length === 0) {
      return;
    }
    const missingKeyword = keywords.find((keyword) => !combinedEarlyText.includes(keyword));
    if (!missingKeyword) {
      return;
    }
    let targetIndex = 0;
    if (Array.isArray(suspect.motiveScenes)) {
      const preferred = suspect.motiveScenes
        .map((scene) => parseChapterIndex(scene))
        .find((idx) => idx !== null && idx < chapters.length);
      if (preferred !== undefined && preferred !== null) {
        targetIndex = Math.max(0, preferred);
      }
    }
    if (targetIndex >= chapters.length) {
      targetIndex = chapters.length - 1;
    }
    const blueprint = blueprintMap.get(targetIndex);
    const emotionalCue = emotionalBeats.find((beat: any) => {
      const beatIndex = parseChapterIndex(beat?.chapter);
      return beatIndex !== null && beatIndex === targetIndex;
    });
    const backstory = backstories.find((story: any) => story?.name === suspect.name);
    const cueText =
      typeof emotionalCue?.focus === 'string' && emotionalCue.focus.trim()
        ? emotionalCue.focus.trim()
        : (typeof backstory?.psychologicalCue === 'string' && backstory.psychologicalCue.trim()
          ? backstory.psychologicalCue.trim()
          : '脸色明显发紧');
    const diversionTopic =
      blueprint?.backgroundNeeded && blueprint.backgroundNeeded.length > 0
        ? blueprint.backgroundNeeded[0]
        : undefined;
    const emotionDelivery =
      typeof emotionalCue?.delivery === 'string' && emotionalCue.delivery.trim()
        ? emotionalCue.delivery.trim()
        : '语气一沉';
    const sentence = buildSuspectMotiveSentence({
      suspectName: suspect.name || '嫌疑人',
      keyword: missingKeyword,
      reaction: normalizeClauseText(emotionDelivery, '语气明显一滞'),
      cue: normalizeClauseText(cueText, `${suspect.name ?? '他'}的视线躲闪`),
      diversionTopic,
      variationSeed: notes.length + targetIndex,
    });
    const chapter = chapters[targetIndex];
    const newContent = insertSentenceAfterIntro(chapter.content, sentence);
    chapters[targetIndex] = {
      ...chapter,
      content: newContent,
      wordCount: newContent.replace(/\s+/g, '').length,
    };
    notes.push(`自动补写动机伏笔：${suspect.name}（关键词：${missingKeyword}） → Chapter ${targetIndex + 1}`);
  });

  const solutionTokens = collectSolutionMotiveTokens(outline);
  const limitedSolutionTokens = solutionTokens.slice(0, Math.min(solutionTokens.length, 4));
  const earlyWindow = Math.min(2, chapters.length) || 1;
  limitedSolutionTokens.forEach((token, idx) => {
    const normalized = token?.trim();
    if (!normalized || normalized.length < 2) return;
    if (/[\u4e00-\u9fa5]/.test(normalized) === false) return;
    const earlySlice = chapters
      .slice(0, Math.min(2, chapters.length))
      .map((chapter) => `${chapter.summary || ''}\n${chapter.content || ''}`)
      .join('\n');
    if (earlySlice.includes(normalized)) {
      return;
    }
    const targetIndex = earlyWindow === 1 ? 0 : idx % earlyWindow;
    const chapter = chapters[targetIndex];
    if (!chapter) return;
    const sentence = buildSolutionForeshadowSentence({
      detectiveName,
      token: normalized,
      variationSeed: idx,
    });
    const newContent = insertSentenceAfterIntro(chapter.content, sentence);
    chapters[targetIndex] = {
      ...chapter,
      content: newContent,
      wordCount: newContent.replace(/\s+/g, '').length,
    };
    notes.push(`自动补写动机伏笔：线索提示“${normalized}” → Chapter ${targetIndex + 1}`);
  });

  return { chapters, notes };
}

function applyAnchorsAndMotives(outline: DetectiveOutline, draft: DetectiveStoryDraft) {
  const anchorResult = ensureAnchorsForDraft(outline, draft);
  const motiveResult = ensureMotivesForDraft(outline, { ...draft, chapters: anchorResult.chapters });
  const continuityNotes = [...anchorResult.notes, ...motiveResult.notes];
  const sanitized = sanitizeChapters(motiveResult.chapters);
  const mergedDraft: DetectiveStoryDraft = {
    ...draft,
    chapters: sanitized,
    ttsAssets: draft.ttsAssets,
  };
  return {
    draft: mergedDraft,
    continuityNotes,
  };
}

function buildExpansionParagraph(
  index: number,
  blueprint?: ChapterBlueprintMeta,
  atmosphere?: SettingAtmosphereMeta,
): string {
  const sentences: string[] = [];
  const sensoryList = Array.isArray(atmosphere?.sensoryPalette)
    ? atmosphere!.sensoryPalette.filter(
        (item): item is string => typeof item === 'string' && item.trim().length > 0,
      )
    : [];
  const sensory = sensoryList.length > 0 ? sensoryList[index % sensoryList.length] : null;
  if (sensory) {
    sentences.push(`空气里弥漫着${sensory.trim()}，连仪器运转的细微声响都更加清晰`);
  } else if (typeof atmosphere?.openingMood === 'string' && atmosphere.openingMood.trim()) {
    sentences.push(atmosphere.openingMood.trim());
  }
  const backgrounds = Array.isArray(blueprint?.backgroundNeeded)
    ? (blueprint.backgroundNeeded as string[])
    : [];
  if (backgrounds.length > 0) {
    sentences.push(`众人顺势提到${backgrounds[0]}，让整个事件的来龙去脉更完整`);
  }
  if (typeof blueprint?.conflictGoal === 'string' && blueprint.conflictGoal.trim()) {
    sentences.push(`${blueprint.conflictGoal}的压力让现场的对峙愈发紧绷`);
  }
  if (typeof blueprint?.emotionalBeat === 'string' && blueprint.emotionalBeat.trim()) {
    sentences.push(`这种氛围让情绪朝着“${blueprint.emotionalBeat}”的方向急速攀升`);
  }
  const paragraph = sentences.join('，').replace(/[，。]*$/, '');
  return `${paragraph}。`;
}

function enforceChapterWordTargets(
  outline: DetectiveOutline,
  draft: DetectiveStoryDraft,
): { draft: DetectiveStoryDraft; notes: string[] } {
  const blueprintMap = collectChapterBlueprints(outline);
  if (blueprintMap.size === 0) {
    return { draft, notes: [] };
  }
  const atmosphere: SettingAtmosphereMeta | undefined = (outline as any)?.settingAtmosphere || undefined;
  const notes: string[] = [];
  const chapters = draft.chapters.map((chapter, index) => {
    const blueprint = blueprintMap.get(index);
    if (!blueprint) {
      return chapter;
    }
    const target = blueprint.wordTarget && blueprint.wordTarget > 0 ? blueprint.wordTarget : 1600;
    const minAllowed = Math.floor(target * 0.92);
    const maxAllowed = Math.ceil(target * 1.08);
    const actual = computeWordCount(chapter.content);
    if (actual === 0) {
      notes.push(`章节篇幅告警：Chapter ${index + 1} 为空，目标约 ${target} 字`);
      return chapter;
    }
    if (actual < minAllowed) {
      const deficit = target - actual;
      const expansion = buildExpansionParagraph(index, blueprint, atmosphere);
      const updatedContent = `${(chapter.content || '').trimEnd()}\n\n${expansion}`.trim();
      const updatedChapter = {
        ...chapter,
        content: updatedContent,
        wordCount: computeWordCount(updatedContent),
      };
      notes.push(`自动扩写篇幅：Chapter ${index + 1} 补充约 ${deficit} 字以接近 ${target} 字目标`);
      return updatedChapter;
    }
    if (actual > maxAllowed) {
      notes.push(`章节篇幅偏长：Chapter ${index + 1} 实际 ${actual} 字（目标 ${target} 字），请在修订阶段酌情收紧`);
    }
    return {
      ...chapter,
      wordCount: computeWordCount(chapter.content),
    };
  });
  const sanitized = sanitizeChapters(chapters);
  return {
    draft: {
      ...draft,
      chapters: sanitized,
    },
    notes,
  };
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
        const outlineWithNames = ensureChineseNames(outlineRaw);
        const outline = ensureSuspectMotiveMetadata(outlineWithNames);
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

        try {
          const clueGraph = buildClueGraphFromOutline(outline);
          const fairPlayReport = scoreFairPlay(clueGraph);
          telemetry?.registerArtifact?.({
            label: '阶段一线索图初检',
            type: 'json',
            preview: JSON.stringify(
              {
                nodes: clueGraph.nodes.length,
                edges: clueGraph.edges.length,
                unsupportedInferences: fairPlayReport.unsupportedInferences.length,
                orphanClues: fairPlayReport.orphanClues.length,
                economyScore: fairPlayReport.economyScore,
              },
              null,
              2,
            ),
            meta: {
              clueGraph,
              fairPlayReport,
              version: CLUE_GRAPH_VERSION,
            },
          });
        } catch (clueGraphError: any) {
          logger.warn(
            { err: clueGraphError },
            'Stage1 Planning: 构建线索图或公平度报告时出现异常（忽略并继续）',
          );
          telemetry?.log?.('warn', 'Stage1 构建线索图失败（已忽略）', {
            meta: { error: clueGraphError?.message },
          });
        }

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

      const stylisticNotes: string[] = [];

      const focalCommand = telemetry?.beginCommand?.({
        label: 'Watson 化视角对齐',
        command: 'enforceFocalization',
      });
      const focalResult = enforceFocalization(outline, storyDraftRaw);
      if (focalCommand) {
        telemetry?.completeCommand?.(focalCommand, {
          resultSummary: `调整 ${focalResult.notes.length > 0 ? focalResult.notes.join('；') : '无视角改动'}`,
        });
      }
      stylisticNotes.push(...focalResult.notes);

      const styleCommand = telemetry?.beginCommand?.({
        label: '应用角色声腔 StylePack',
        command: 'applyStylePackToDraft',
      });
      const styleResult = applyStylePackToDraft(outline, focalResult.draft);
      if (styleCommand) {
        telemetry?.completeCommand?.(styleCommand, {
          resultSummary: styleResult.notes.length > 0 ? styleResult.notes.join('；') : '无声腔调整',
        });
      }
      stylisticNotes.push(...styleResult.notes);

      let workingDraft = styleResult.draft;

      const templateCommand = telemetry?.beginCommand?.({
        label: '句式节流检查',
        command: 'throttleTemplates',
      });
      const templateResult = throttleTemplates(workingDraft);
      if (templateCommand) {
        telemetry?.completeCommand?.(templateCommand, {
          resultSummary: templateResult.notes.length > 0 ? templateResult.notes.join('；') : '未发现重复模板',
        });
      }
      stylisticNotes.push(...templateResult.notes);
      workingDraft = templateResult.draft;

      const clicheCommand = telemetry?.beginCommand?.({
        label: '陈词滥调限流',
        command: 'applyClicheGuard',
      });
      const clicheResult = applyClicheGuard(workingDraft);
      if (clicheCommand) {
        telemetry?.completeCommand?.(clicheCommand, {
          resultSummary: clicheResult.notes.length > 0 ? clicheResult.notes.join('；') : '陈词滥调未触发',
        });
      }
      stylisticNotes.push(...clicheResult.notes);
      workingDraft = clicheResult.draft;

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
      const storyDraftWithDialogues = await enforceDialoguesInDraft(workingDraft, dialoguesTarget);
      if (enforceCommand) {
        telemetry?.completeCommand?.(enforceCommand, {
          resultSummary: `完成增强，对话目标 ${dialoguesTarget}`,
        });
      }

      const anchorCommand = telemetry?.beginCommand?.({
        label: '补齐章节时间与动机伏笔',
        command: 'applyAnchorsAndMotives',
      });
      const anchorResult = applyAnchorsAndMotives(outline, storyDraftWithDialogues);
      if (anchorCommand) {
        telemetry?.completeCommand?.(anchorCommand, {
          resultSummary: `自动补齐提示 ${anchorResult.continuityNotes.length} 项`,
        });
      }
      const wordTargetCommand = telemetry?.beginCommand?.({
        label: '校准章节篇幅',
        command: 'enforceChapterWordTargets',
      });
      const wordTargetResult = enforceChapterWordTargets(outline, anchorResult.draft);
      if (wordTargetCommand) {
        telemetry?.completeCommand?.(wordTargetCommand, {
          resultSummary: `篇幅提示 ${wordTargetResult.notes.length} 条`,
        });
      }
      const continuityNotes = Array.from(
        new Set([
          ...stylisticNotes,
          ...(storyDraftWithDialogues.continuityNotes ?? []),
          ...anchorResult.continuityNotes,
          ...wordTargetResult.notes,
        ]),
      ).filter(Boolean);
      const storyDraft: DetectiveStoryDraft = {
        ...wordTargetResult.draft,
        continuityNotes:
          continuityNotes.length > 0 ? continuityNotes : wordTargetResult.draft.continuityNotes,
        ttsAssets: storyDraftWithDialogues.ttsAssets ?? wordTargetResult.draft.ttsAssets,
      };

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

  let betaInsight: BetaReaderInsight | null = null;
  const betaCommand = telemetry?.beginCommand?.({
    label: 'Beta Reader 解题模拟',
    command: 'betaReaderSolve',
  });
  betaInsight = await betaReaderSolve(outline, storyDraft);
  if (betaCommand) {
    if (betaInsight) {
      telemetry?.completeCommand?.(betaCommand, {
        resultSummary: `当前最可疑：${betaInsight.topSuspect}（置信度 ${(betaInsight.confidence * 100).toFixed(0)}%）`,
      });
    } else {
      telemetry?.completeCommand?.(betaCommand, {
        resultSummary: '未能生成 Beta Reader 结果',
      });
    }
  }
  if (betaInsight) {
    (review as any).betaReader = betaInsight;
    telemetry?.registerArtifact?.({
      label: 'Beta Reader 解题洞察',
      type: 'json',
      preview: JSON.stringify(betaInsight, null, 2),
    });
  }

  let hypothesisEval: HypothesisEvaluation | null = null;
  const hypoCommand = telemetry?.beginCommand?.({
    label: '多解竞争性评估',
    command: 'enumerateHypotheses',
  });
  hypothesisEval = await enumerateHypotheses(outline, storyDraft);
  if (hypoCommand) {
    if (hypothesisEval?.candidates?.length) {
      telemetry?.completeCommand?.(hypoCommand, {
        resultSummary: `候选解数量 ${hypothesisEval.candidates.length}`,
      });
    } else {
      telemetry?.completeCommand?.(hypoCommand, {
        resultSummary: '未获得有效候选假说',
      });
    }
  }
  if (hypothesisEval) {
    (review as any).hypotheses = hypothesisEval;
    telemetry?.registerArtifact?.({
      label: '假设集合评估',
      type: 'json',
      preview: JSON.stringify(hypothesisEval, null, 2),
    });
  }

  if (hypothesisEval?.candidates?.length) {
    const sorted = [...hypothesisEval.candidates].sort((a, b) => b.confidence - a.confidence);
    const primary = sorted[0];
    const runnerUp = sorted[1];
    const reviewIssues = Array.isArray((review as any).issues)
      ? ((review as any).issues as any[])
      : [];
    if (runnerUp) {
      const gap = Math.abs(primary.confidence - runnerUp.confidence);
      if (gap < 0.2) {
        reviewIssues.push({
          id: 'hypothesis-competition',
          detail: `多解竞争：${primary.suspect} 与 ${runnerUp.suspect} 的置信度差距仅 ${(gap * 100).toFixed(0)}%，需增写独有矛盾线索。`,
          severity: 'warn',
          category: 'uniqueness',
        });
      }
    } else if (primary && primary.confidence < 0.5) {
      reviewIssues.push({
        id: 'hypothesis-weak-solution',
        detail: `主要解法置信度 ${(primary.confidence * 100).toFixed(0)}%，需补充指向真凶的强制线索。`,
        severity: 'warn',
        category: 'uniqueness',
      });
    }
    (review as any).issues = reviewIssues;
  }

  telemetry?.registerArtifact?.({
    label: '阶段三审稿结果',
    type: 'json',
    preview: JSON.stringify(review, null, 2).slice(0, 2000),
  });
  return review;
}

export async function runStage4Revision(
  outline: DetectiveOutline,
  storyDraft: DetectiveStoryDraft,
  review: Record<string, unknown> | null | undefined,
  validation: ValidationReport | null | undefined,
  promptOpts?: PromptBuildOptions,
  telemetry?: StageTelemetry,
): Promise<Stage4RevisionResult> {
  const clueGraph = buildClueGraphFromOutline(outline);
  const denouementScript = planDenouement(outline, storyDraft, clueGraph);
  const plantIssues = assertPlantPayoffCompleteness(clueGraph, storyDraft);

  telemetry?.registerArtifact?.({
    label: '自动生成的揭示脚本',
    type: 'json',
    preview: JSON.stringify(denouementScript, null, 2),
  });

  const reviewWorking: Record<string, unknown> = review ? { ...review } : {};
  (reviewWorking as any).denouementScript = denouementScript;
  if (plantIssues.length > 0) {
    const reviewIssues = Array.isArray((reviewWorking as any).issues)
      ? ((reviewWorking as any).issues as any[])
      : [];
    plantIssues.forEach((detail, index) => {
      reviewIssues.push({
        id: `plant-payoff-${index + 1}`,
        detail,
        severity: 'critical',
        category: 'structure',
      });
    });
    (reviewWorking as any).issues = reviewIssues;
  }

  const plan = deriveRevisionPlan(reviewWorking, validation);
  if (plantIssues.length > 0) {
    plantIssues.forEach((detail, index) => {
      plan.mustFix.push({
        id: `structure-plant-payoff-${index + 1}`,
        detail,
        category: 'structure',
      });
    });
  }
  if (!plan.suggestions.includes('请参考自动生成的揭示脚本，完善聚众揭示流程')) {
    plan.suggestions.push('请参考自动生成的揭示脚本，完善聚众揭示流程');
  }
  const hasActionableIssues = plan.mustFix.length > 0 || plan.warnings.length > 0;

  telemetry?.log?.('info', '阶段四：生成修订计划', {
    meta: {
      mustFix: plan.mustFix.length,
      warnings: plan.warnings.length,
      suggestions: plan.suggestions.length,
    },
  });

  if (!hasActionableIssues) {
    telemetry?.log?.('info', '审稿未要求必修修改，跳过自动修订');
    return {
      draft: storyDraft,
      plan,
      skipped: true,
    };
  }

  const promptCommand = telemetry?.beginCommand?.({
    label: '构建阶段四修订提示词',
    command: promptOpts ? 'buildStage4RevisionPromptProfile' : 'buildStage4RevisionPrompt',
    meta: {
      mustFix: plan.mustFix.length,
      warnings: plan.warnings.length,
    },
  });
  const prompt = promptOpts
    ? buildStage4RevisionPromptProfile(outline, storyDraft, reviewWorking ?? {}, plan, promptOpts)
    : buildStage4RevisionPrompt(outline, storyDraft, reviewWorking ?? {}, plan);
  if (promptCommand) {
    telemetry?.completeCommand?.(promptCommand, {
      resultSummary: `提示词长度 ${prompt.length} 字符`,
    });
  }

  const RETRIES = 2;
  for (let attempt = 0; attempt < RETRIES; attempt += 1) {
    const callCommand = telemetry?.beginCommand?.({
      label: `调用 DeepSeek 修订模型（尝试 ${attempt + 1}）`,
      command: 'POST /chat/completions',
      meta: {
        model: DETECTIVE_CONFIG.writingModel,
        temperature: Math.min(0.5, DETECTIVE_CONFIG.writingTemperature),
        attempt: attempt + 1,
      },
    });
    try {
      const response = await callDeepseek({
        model: DETECTIVE_CONFIG.writingModel,
        messages: [
          {
            role: 'system',
            content: '你是一名推理小说修订编辑，根据问题清单做定向修改并保持最小必要改动，仅输出 JSON。',
          },
          { role: 'user', content: prompt },
        ],
        maxTokens: DETECTIVE_CONFIG.maxTokens,
        temperature: Math.min(0.5, DETECTIVE_CONFIG.writingTemperature),
      });

      if (callCommand) {
        telemetry?.completeCommand?.(callCommand, {
          resultSummary: `获得修订稿 ${response.content.length} 字符`,
          meta: { usage: response.usage },
        });
      }

      const parseCommand = telemetry?.beginCommand?.({
        label: '解析修订输出',
        command: 'extractJson',
        meta: { attempt: attempt + 1 },
      });
      try {
        const revised = extractJson(response.content) as DetectiveStoryDraft;
        if (parseCommand) {
          telemetry?.completeCommand?.(parseCommand, {
            resultSummary: `修订稿章节 ${revised?.chapters?.length ?? 0}`,
          });
        }
        if (!Array.isArray(revised?.chapters) || revised.chapters.length === 0) {
          throw new Error('修订输出缺少章节内容');
        }
        const continuityCommand = telemetry?.beginCommand?.({
          label: '修订稿补齐时间与动机伏笔',
          command: 'applyAnchorsAndMotives',
        });
        const rehydrated = applyAnchorsAndMotives(outline, revised);
        if (continuityCommand) {
          telemetry?.completeCommand?.(continuityCommand, {
            resultSummary: `补齐提示 ${rehydrated.continuityNotes.length} 项`,
          });
        }
        const revisionTimestamp = new Date().toISOString();
        const modelRevisionNotes = normalizeRevisionNotes(revised.revisionNotes, {
          category: 'model',
          stage: 'stage4_revision',
          source: 'model-output',
          createdAt: revisionTimestamp,
        });
        const continuityRevisionNotes = normalizeRevisionNotes(rehydrated.continuityNotes, {
          category: 'system',
          stage: 'stage4_revision',
          source: 'auto-continuity',
          createdAt: revisionTimestamp,
        });
        const revisionNotes = mergeRevisionNotes([modelRevisionNotes, continuityRevisionNotes]);
        const finalDraft: DetectiveStoryDraft = {
          ...rehydrated.draft,
          revisionNotes,
          ttsAssets: storyDraft.ttsAssets ?? rehydrated.draft.ttsAssets,
        };
        telemetry?.registerArtifact?.({
          label: '阶段四修订后的草稿',
          type: 'json',
          preview: JSON.stringify(
            {
              chapters: finalDraft.chapters.length,
              overallWordCount: finalDraft.overallWordCount ?? null,
              revisionNotes,
            },
            null,
            2,
          ),
        });
        return {
          draft: finalDraft,
          plan,
          skipped: false,
        };
      } catch (parseError: any) {
        if (parseCommand) {
          telemetry?.failCommand?.(parseCommand, {
            errorMessage: parseError?.message || '解析失败',
          });
        }
        if (attempt === RETRIES - 1) {
          throw parseError;
        }
        telemetry?.log?.('warn', '修订输出解析失败，准备重试', {
          meta: { attempt: attempt + 1, error: parseError?.message },
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
      telemetry?.log?.('warn', '修订模型调用失败，准备重试', {
        commandId: callCommand,
        meta: { attempt: attempt + 1 },
      });
    }
  }

  throw new Error('Stage4 Revision 未能生成有效修订稿');
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
