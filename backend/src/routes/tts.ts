import { Router, Request, Response } from 'express';
import type { StoryTtsSegment, DetectiveStoryAudioAsset } from '@storyapp/shared';
import type { TtsSynthesisRequest } from '../services/tts/types';
import { createTtsManager } from '../services/tts';
import { EventType, logError, logInfo } from '../utils/logger';
import type { TtsManager } from '../services/tts/ttsManager';
import { StoryTextSegmenter } from '../services/tts/textSegmenter';
import path from 'path';
import fs from 'fs';
import { listTasks, findTask, getProviderSummary, TaskStatus, findLatestTaskByStoryId } from '../services/tts/taskRegistry';
import { createTtsEvent } from '../services/workflowEventBus';
import { saveWorkflowTtsAsset } from '../services/detectiveWorkflowService';
import { getDatabase, COLLECTIONS } from '../config/database';
import { ObjectId } from 'mongodb';
import type { DetectiveWorkflowDocument } from '../models/DetectiveWorkflow';

const router = Router();
let manager: TtsManager | undefined;

// 延迟初始化 TTS Manager，避免在模块加载时出错
const getManager = (): TtsManager => {
  if (!manager) {
    manager = createTtsManager();
  }
  return manager;
};

const parseNumber = (value: unknown, fallback?: number): number | undefined => {
  if (value === undefined || value === null) return fallback;
  const num = Number(value);
  if (Number.isNaN(num)) return fallback;
  return num;
};

type StorySynthesisStatus = 'pending' | 'ready' | 'error';

interface StorySynthesisState {
  storyId: string;
  status: StorySynthesisStatus;
  totalSegments: number;
  successCount: number;
  totalDuration: number;
  segments: StoryTtsSegment[];
  error?: string;
  updatedAt: number;
}

const STORY_SYNTHESIS_TTL_MS = Number.parseInt(process.env.TTS_BATCH_STATE_TTL_MS || `${60 * 60 * 1000}`, 10);
const STORY_STATUS_POLL_INTERVAL_MS = Number.parseInt(process.env.TTS_BATCH_STATUS_POLL_INTERVAL_MS || '3000', 10);
const storySynthesisStore = new Map<string, StorySynthesisState>();

const cleanupStoryStore = () => {
  const now = Date.now();
  for (const [storyId, state] of storySynthesisStore.entries()) {
    if (now - state.updatedAt > STORY_SYNTHESIS_TTL_MS) {
      storySynthesisStore.delete(storyId);
    }
  }
};

const initializeStoryState = (storyId: string, totalSegments: number): StorySynthesisState => {
  const initialState: StorySynthesisState = {
    storyId,
    status: 'pending',
    totalSegments,
    successCount: 0,
    totalDuration: 0,
    segments: [],
    updatedAt: Date.now(),
  };
  storySynthesisStore.set(storyId, initialState);
  return initialState;
};

const HEX_OBJECT_ID = /^[a-f\d]{24}$/i;

async function assertStoryPassedValidation(storyId: string): Promise<void> {
  if (!HEX_OBJECT_ID.test(storyId)) {
    return;
  }
  const db = getDatabase();
  const collection = db.collection<DetectiveWorkflowDocument>(COLLECTIONS.STORY_WORKFLOWS);
  const objectId = new ObjectId(storyId);
  const document = await collection.findOne(
    { _id: objectId },
    { projection: { validation: 1, stageStates: 1 } },
  );
  if (!document) {
    return;
  }
  const validationStage = (document.stageStates || []).find((stage) => stage.stage === 'stage5_validation');
  if (!validationStage || validationStage.status !== 'completed') {
    const error = new Error('故事尚未完成最终校验，请先运行完整工作流。');
    (error as any).code = 'VALIDATION_PENDING';
    throw error;
  }
  const results = Array.isArray(document.validation?.results) ? document.validation!.results : [];
  const failResults = results.filter((result) => result.status === 'fail');
  if (failResults.length > 0) {
    const error = new Error('故事校验存在失败项，暂无法生成朗读音频。');
    (error as any).code = 'VALIDATION_FAILED';
    (error as any).details = failResults;
    throw error;
  }
  const warnResults = results.filter((result) => result.status === 'warn');
  if (warnResults.length > 0) {
    const error = new Error('故事校验仍有警告，请修复后再尝试朗读生成。');
    (error as any).code = 'VALIDATION_HAS_WARN';
    (error as any).details = warnResults;
    throw error;
  }
}

const updateStoryState = (storyId: string, mutator: (state: StorySynthesisState) => void) => {
  const state = storySynthesisStore.get(storyId);
  if (!state) {
    return;
  }
  mutator(state);
  state.updatedAt = Date.now();
  storySynthesisStore.set(storyId, state);
};

const upsertSegment = (state: StorySynthesisState, segment: StoryTtsSegment) => {
  const nextSegments = state.segments.slice();
  const existingIndex = nextSegments.findIndex((item) => item.segmentIndex === segment.segmentIndex);
  if (existingIndex >= 0) {
    nextSegments[existingIndex] = segment;
  } else {
    nextSegments.push(segment);
  }
  nextSegments.sort((a, b) => a.segmentIndex - b.segmentIndex);
  state.segments = nextSegments;
  state.successCount = nextSegments.filter((item) => !item.error).length;
  state.totalDuration = nextSegments.reduce((sum, item) => sum + (item.duration || 0), 0);
};

router.get('/voices', (_req: Request, res: Response) => {
  const mgr = getManager();
  const capabilities = mgr.getCapabilities();
  res.json({
    provider: mgr.getProviderId(),
    voices: capabilities.voices,
    speedRange: capabilities.speedRange,
    pitchRange: capabilities.pitchRange,
    formats: capabilities.formats,
    defaultVoice: capabilities.defaultVoice,
    metadata: mgr.getMetadata(),
  });
});

router.post('/', async (req: Request<unknown, unknown, TtsSynthesisRequest>, res: Response) => {
  const {
    text,
    voiceId,
    speed,
    pitch,
    format,
    sessionId,
    metadata,
  } = req.body || {} as TtsSynthesisRequest;

  if (!text || typeof text !== 'string') {
    return res.status(400).json({
      success: false,
      error: '请提供有效的文本内容',
      code: 'INVALID_TEXT'
    });
  }

  if (text.length > 8000) {
    return res.status(400).json({
      success: false,
      error: '文本长度超过限制，请拆分后再试',
      code: 'TEXT_TOO_LONG'
    });
  }

  try {
    const mgr = getManager();
    const result = await mgr.synthesize({
      text,
      voiceId: typeof voiceId === 'string' ? voiceId : undefined,
      speed: parseNumber(speed, 1),
      pitch: parseNumber(pitch, 1),
      format: typeof format === 'string' ? (format.toLowerCase() as 'mp3' | 'pcm') : undefined,
      sessionId: typeof sessionId === 'string' ? sessionId : undefined,
      metadata: typeof metadata === 'object' ? metadata : undefined,
    }, {
      sessionId: typeof sessionId === 'string' ? sessionId : undefined,
    });

    const expiresIn = Math.max(0, Math.floor((result.expiresAt - Date.now()) / 1000));

    logInfo(EventType.TTS_RESPONSE_SENT, 'TTS 响应已返回客户端', {
      provider: result.provider,
      requestId: result.requestId,
      expiresIn,
      cached: result.cached,
    }, undefined, sessionId);

    return res.json({
      success: true,
      audioUrl: result.audioUrl,
      provider: result.provider,
      requestId: result.requestId,
      expiresIn,
      format: result.format,
      cached: result.cached ?? false,
      warnings: result.warnings,
    });
  } catch (error: any) {
    const message = error?.message || '语音合成失败，请稍后再试';
    const status = error?.statusCode || error?.status || 503;

    logError(EventType.TTS_ERROR, 'TTS 请求处理失败', error, {
      provider: getManager().getProviderId(),
      status,
    }, sessionId);

    return res.status(status).json({
      success: false,
      error: message,
      code: error?.code || 'TTS_ERROR',
    });
  }
});

router.get('/tasks', (req: Request, res: Response) => {
  const { provider, status, limit } = req.query;
  const parsedStatus = typeof status === 'string' && ['pending', 'success', 'error'].includes(status)
    ? (status as TaskStatus)
    : undefined;
  const parsedLimit = typeof limit === 'string' ? Number.parseInt(limit, 10) : undefined;

  const tasks = listTasks({
    provider: typeof provider === 'string' ? provider : undefined,
    status: parsedStatus,
    limit: Number.isNaN(parsedLimit) ? undefined : parsedLimit,
  });

  const summary = typeof provider === 'string'
    ? getProviderSummary(provider)
    : undefined;

  res.json({
    success: true,
    data: {
      tasks,
      summary,
    },
  });
});

router.get('/tasks/:storyId/latest', (req: Request, res: Response) => {
  const { storyId } = req.params;
  if (!storyId) {
    return res.status(400).json({
      success: false,
      error: 'MISSING_STORY_ID',
      message: '缺少故事 ID',
    });
  }

  const provider = typeof req.query.provider === 'string' ? req.query.provider : undefined;
  const task = findLatestTaskByStoryId(storyId, provider);
  if (!task) {
    return res.status(404).json({
      success: false,
      error: 'TASK_NOT_FOUND',
      message: '未找到对应的朗读任务',
    });
  }

  res.json({
    success: true,
    data: task,
  });
});

router.get('/tasks/:identifier', (req: Request, res: Response) => {
  const { identifier } = req.params;
  const task = findTask(identifier);
  if (!task) {
    return res.status(404).json({
      success: false,
      error: 'TASK_NOT_FOUND',
      message: '未找到对应的 TTS 任务',
    });
  }
  res.json({ success: true, data: task });
});

/**
 * 批量合成接口 - 长文本分段合成
 * POST /api/tts/synthesize-story
 */
router.post('/synthesize-story', async (req: Request, res: Response) => {
  const { storyId, fullText, chapterMarkers, voiceId, speed, sessionId } = req.body;

  if (!fullText || typeof fullText !== 'string') {
    return res.status(400).json({
      success: false,
      error: '缺少故事文本',
      code: 'MISSING_TEXT',
    });
  }

  const rawStoryId = typeof storyId === 'string' ? storyId.trim() : '';
  const effectiveStoryId = rawStoryId ? rawStoryId : `story-${Date.now()}`;

  if (HEX_OBJECT_ID.test(rawStoryId)) {
    try {
      await assertStoryPassedValidation(rawStoryId);
    } catch (validationError: any) {
      return res.status(409).json({
        success: false,
        error: validationError?.code || 'VALIDATION_BLOCKED',
        message: validationError?.message || '故事尚未通过校验，无法生成朗读音频',
        details: validationError?.details,
      });
    }
  }

  try {
    const segmenter = new StoryTextSegmenter(1000); // 每段最多 1000 字
    const segments = segmenter.segmentStory(fullText, chapterMarkers);

    if (segments.length === 0) {
      return res.status(400).json({
        success: false,
        error: '暂无可朗读的内容',
        code: 'NO_SEGMENTS',
      });
    }

    cleanupStoryStore();
    const initialState = initializeStoryState(effectiveStoryId, segments.length);
    initialState.error = undefined;

    logInfo(EventType.TTS_REQUEST_RECEIVED, `故事分段完成：${segments.length} 段`, {
      storyId: effectiveStoryId,
      totalLength: fullText.length,
      segmentCount: segments.length,
    }, undefined, sessionId);

    const mgr = getManager();

    const processStory = async () => {
      for (const segment of segments) {
        try {
          const result = await mgr.synthesize({
            text: segment.text,
            voiceId: typeof voiceId === 'string' ? voiceId : undefined,
            speed: parseNumber(speed, 1),
            format: 'mp3',
            sessionId: typeof sessionId === 'string' ? sessionId : undefined,
            metadata: { storyId: effectiveStoryId, segmentIndex: segment.index },
          }, {
            sessionId: typeof sessionId === 'string' ? sessionId : undefined,
          });

          const segmentResult: StoryTtsSegment = {
            segmentIndex: segment.index,
            audioUrl: result.audioUrl,
            duration: segment.estimatedDuration,
            startOffset: segment.startOffset,
            endOffset: segment.endOffset,
            chapterTitle: segment.chapterTitle,
            cached: result.cached,
          };

          updateStoryState(effectiveStoryId, (state) => {
            upsertSegment(state, segmentResult);
          });
        } catch (error: any) {
          logError(EventType.TTS_ERROR, `分段 ${segment.index} 合成失败`, error, {
            segmentIndex: segment.index,
            storyId: effectiveStoryId,
          }, sessionId);

          const failedSegment: StoryTtsSegment = {
            segmentIndex: segment.index,
            duration: segment.estimatedDuration,
            startOffset: segment.startOffset,
            endOffset: segment.endOffset,
            chapterTitle: segment.chapterTitle,
            error: error?.message || '合成失败',
          };

          updateStoryState(effectiveStoryId, (state) => {
            upsertSegment(state, failedSegment);
          });
        }
      }

      const finalState = storySynthesisStore.get(effectiveStoryId);
      if (!finalState) {
        return;
      }

      const isSuccess = finalState.successCount === finalState.totalSegments;
      updateStoryState(effectiveStoryId, (state) => {
        state.status = isSuccess ? 'ready' : 'error';
        state.error = isSuccess ? undefined : '部分朗读片段生成失败';
      });

      logInfo(EventType.TTS_RESPONSE_SENT, '故事合成完成', {
        storyId: effectiveStoryId,
        totalSegments: finalState.totalSegments,
        successCount: finalState.successCount,
        totalDuration: finalState.totalDuration,
      }, undefined, sessionId);

      const workflowStatus = isSuccess ? 'success' : 'error';
      createTtsEvent(
        effectiveStoryId,
        workflowStatus,
        isSuccess ? '整篇朗读已生成' : '整篇朗读部分失败',
        {
          successCount: finalState.successCount,
          totalSegments: finalState.totalSegments,
        },
      );

      if (HEX_OBJECT_ID.test(rawStoryId)) {
        const totalDuration = finalState.totalDuration;
        const ttsAsset: DetectiveStoryAudioAsset = {
          storyId: effectiveStoryId,
          workflowId: rawStoryId,
          generatedAt: new Date().toISOString(),
          status: isSuccess ? 'ready' : 'error',
          totalDuration,
          segments: finalState.segments,
          voiceId: typeof voiceId === 'string' ? voiceId : undefined,
          speed: parseNumber(speed, undefined),
          provider: mgr.getProviderId(),
          sessionId: typeof sessionId === 'string' ? sessionId : undefined,
        };
        saveWorkflowTtsAsset(rawStoryId, ttsAsset).catch((persistError: any) => {
          logError(EventType.TTS_ERROR, '持久化 TTS 结果失败', persistError, {
            storyId: effectiveStoryId,
            workflowId: rawStoryId,
          }, sessionId);
        });
      }
    };

    processStory().catch((error: any) => {
      logError(EventType.TTS_ERROR, '故事合成失败', error, { storyId: effectiveStoryId }, sessionId);
      updateStoryState(effectiveStoryId, (state) => {
        state.status = 'error';
        state.error = error?.message || 'TTS 合成失败';
      });
      createTtsEvent(effectiveStoryId, 'error', '整篇朗读生成失败', {
        error: error?.message,
      });
    });

    return res.status(202).json({
      success: true,
      status: 'pending',
      storyId: effectiveStoryId,
      totalSegments: segments.length,
      successCount: 0,
      totalDuration: 0,
      segments: [] as StoryTtsSegment[],
      nextPollInMs: STORY_STATUS_POLL_INTERVAL_MS,
    });
  } catch (error: any) {
    logError(EventType.TTS_ERROR, '故事合成失败', error, { storyId: effectiveStoryId }, sessionId);
    updateStoryState(effectiveStoryId, (state) => {
      state.status = 'error';
      state.error = error?.message || 'TTS 合成失败';
    });
    createTtsEvent(effectiveStoryId, 'error', '整篇朗读生成失败', {
      error: error?.message,
    });

    return res.status(500).json({
      success: false,
      error: error?.message || 'TTS 合成失败',
      code: 'SYNTHESIS_ERROR',
    });
  }
});

router.get('/synthesize-story/status/:storyId', (req: Request, res: Response) => {
  const { storyId } = req.params;
  if (!storyId) {
    return res.status(400).json({
      success: false,
      error: 'MISSING_STORY_ID',
      code: 'MISSING_STORY_ID',
    });
  }

  cleanupStoryStore();
  const state = storySynthesisStore.get(storyId);
  if (!state) {
    return res.status(404).json({
      success: false,
      error: 'SYNTHESIS_NOT_FOUND',
      code: 'SYNTHESIS_NOT_FOUND',
    });
  }

  return res.json({
    success: state.status === 'ready',
    status: state.status,
    storyId: state.storyId,
    totalSegments: state.totalSegments,
    successCount: state.successCount,
    totalDuration: state.totalDuration,
    segments: state.segments,
    error: state.error,
    nextPollInMs: STORY_STATUS_POLL_INTERVAL_MS,
  });
});

export default router;
