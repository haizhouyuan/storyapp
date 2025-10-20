import { Router, Request, Response } from 'express';
import type { TtsSynthesisRequest } from '../services/tts/types';
import { createTtsManager } from '../services/tts';
import { EventType, logError, logInfo } from '../utils/logger';
import type { TtsManager } from '../services/tts/ttsManager';
import { StoryTextSegmenter } from '../services/tts/textSegmenter';
import path from 'path';
import fs from 'fs';
import { listTasks, findTask, getProviderSummary, TaskStatus, findLatestTaskByStoryId } from '../services/tts/taskRegistry';
import { createTtsEvent } from '../services/workflowEventBus';

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

  try {
    const segmenter = new StoryTextSegmenter(1000); // 每段最多 1000 字
    const segments = segmenter.segmentStory(fullText, chapterMarkers);

    logInfo(EventType.TTS_REQUEST_RECEIVED, `故事分段完成：${segments.length} 段`, {
      storyId,
      totalLength: fullText.length,
      segmentCount: segments.length,
    }, undefined, sessionId);

    const mgr = getManager();

    // 并行合成所有分段
    const synthesisPromises = segments.map(async (segment) => {
      try {
        const result = await mgr.synthesize({
          text: segment.text,
          voiceId: typeof voiceId === 'string' ? voiceId : undefined,
          speed: parseNumber(speed, 1),
          format: 'mp3',
          sessionId: typeof sessionId === 'string' ? sessionId : undefined,
          metadata: { storyId, segmentIndex: segment.index },
        }, {
          sessionId: typeof sessionId === 'string' ? sessionId : undefined,
        });

        return {
          segmentIndex: segment.index,
          audioUrl: result.audioUrl,
          duration: segment.estimatedDuration,
          startOffset: segment.startOffset,
          endOffset: segment.endOffset,
          chapterTitle: segment.chapterTitle,
          cached: result.cached,
        };
      } catch (error: any) {
        logError(EventType.TTS_ERROR, `分段 ${segment.index} 合成失败`, error, {
          segmentIndex: segment.index,
          storyId,
        }, sessionId);

        return {
          segmentIndex: segment.index,
          error: error.message || '合成失败',
          duration: segment.estimatedDuration,
          startOffset: segment.startOffset,
          endOffset: segment.endOffset,
          chapterTitle: segment.chapterTitle,
        };
      }
    });

    const audioSegments = await Promise.all(synthesisPromises);

    const totalDuration = audioSegments.reduce((sum, seg) => sum + seg.duration, 0);
    const successCount = audioSegments.filter((seg) => !seg.error).length;

    logInfo(EventType.TTS_RESPONSE_SENT, '故事合成完成', {
      storyId,
      totalSegments: audioSegments.length,
      successCount,
      totalDuration,
    }, undefined, sessionId);

    return res.json({
      success: true,
      storyId,
      totalSegments: audioSegments.length,
      successCount,
      totalDuration,
      segments: audioSegments,
    });
    if (typeof storyId === 'string' && storyId.trim()) {
      const status = successCount === audioSegments.length ? 'success' : 'error';
      createTtsEvent(storyId, status, status === 'success' ? '整篇朗读已生成' : '整篇朗读部分失败', {
        successCount,
        totalSegments: audioSegments.length,
      });
    }
  } catch (error: any) {
    logError(EventType.TTS_ERROR, '故事合成失败', error, { storyId }, sessionId);
    if (typeof storyId === 'string' && storyId.trim()) {
      createTtsEvent(storyId, 'error', '整篇朗读生成失败', {
        error: error?.message,
      });
    }

    return res.status(500).json({
      success: false,
      error: error.message || 'TTS 合成失败',
      code: 'SYNTHESIS_ERROR',
    });
  }
});

export default router;
