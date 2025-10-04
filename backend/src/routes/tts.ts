import { Router, Request, Response } from 'express';
import type { TtsSynthesisRequest } from '../services/tts/types';
import { createTtsManager } from '../services/tts';
import { EventType, logError, logInfo } from '../utils/logger';
import type { TtsManager } from '../services/tts/ttsManager';

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

export default router;
