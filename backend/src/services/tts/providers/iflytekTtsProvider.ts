import axios, { AxiosInstance } from 'axios';
import { createHmac, randomUUID } from 'crypto';
import type {
  TtsAudioFormat,
  TtsProvider,
  TtsProviderCapabilities,
  TtsProviderContext,
  TtsProviderMetadata,
  TtsSynthesisParams,
  TtsSynthesisResult
} from '../types';
import { logError, logInfo, EventType } from '../../../utils/logger';

interface IflytekHeader {
  code: number;
  message: string;
  sid?: string;
  task_id?: string;
  task_status?: string;
}

interface IflytekCreateResponse {
  header: IflytekHeader;
}

interface IflytekQueryResponse {
  header: IflytekHeader;
  payload?: {
    audio?: {
      audio?: string;
      encoding?: string;
      sample_rate?: string | number;
      channels?: string | number;
      bit_depth?: string | number;
    };
    pybuf?: {
      text?: string;
      encoding?: string;
    };
  };
}

interface IflytekVoiceConfig {
  id: string;
  name: string;
  language: string;
  gender?: 'male' | 'female' | 'child';
  description?: string;
  vcn: string;
}

class IflytekTtsError extends Error {
  code: string;
  statusCode: number;
  details?: Record<string, unknown>;

  constructor(message: string, code: string, statusCode = 502, details?: Record<string, unknown>) {
    super(message);
    this.name = 'IflytekTtsError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

const REMOTE_AUDIO_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 官方文档：云端保存7天
const DEFAULT_POLL_INTERVAL_MS = 2000;
const DEFAULT_POLL_TIMEOUT_MS = 120000;
const DEFAULT_REQUEST_TIMEOUT_MS = 15000;
const DEFAULT_FORMAT: TtsAudioFormat = 'mp3';

const SUPPORTED_VOICES: IflytekVoiceConfig[] = [
  {
    id: 'iflytek_yeting',
    name: '讯飞-希涵',
    language: 'zh-CN',
    gender: 'female',
    description: '柔和女性旁白，适合睡前故事',
    vcn: 'x4_yeting',
  },
  {
    id: 'iflytek_qianxue',
    name: '讯飞-千雪',
    language: 'zh-CN',
    gender: 'female',
    description: '柔和平稳，适合睡前故事',
    vcn: 'x4_qianxue'
  },
  {
    id: 'iflytek_pengfei',
    name: '讯飞-小鹏',
    language: 'zh-CN',
    gender: 'male',
    description: '温暖男声，适合旁白讲述',
    vcn: 'x4_pengfei'
  },
  {
    id: 'iflytek_doudou',
    name: '讯飞-豆豆',
    language: 'zh-CN',
    gender: 'child',
    description: '童音活泼，适合儿童角色',
    vcn: 'x4_doudou'
  }
];

export class IflytekTtsProvider implements TtsProvider {
  readonly id = 'iflytek';

  readonly metadata: TtsProviderMetadata = {
    name: 'iFlytek Long-form TTS',
    version: '1.0.0',
  };

  readonly capabilities: TtsProviderCapabilities = {
    voices: SUPPORTED_VOICES.map(({ id, name, language, gender, description }) => ({
      id,
      name,
      language,
      gender,
      description,
    })),
    speedRange: [0.5, 2],
    pitchRange: [0.5, 2],
    formats: ['mp3', 'pcm'],
    defaultVoice: SUPPORTED_VOICES[0].id,
  };

  private readonly appId: string | undefined;
  private readonly apiKey: string | undefined;
  private readonly apiSecret: string | undefined;
  private readonly host: string;
  private readonly pollIntervalMs: number;
  private readonly pollTimeoutMs: number;
  private readonly http: AxiosInstance;

  constructor() {
    this.appId = process.env.IFLYTEK_TTS_APP_ID;
    this.apiKey = process.env.IFLYTEK_TTS_API_KEY;
    this.apiSecret = process.env.IFLYTEK_TTS_API_SECRET;
    this.host = process.env.IFLYTEK_TTS_API_HOST || 'api-dx.xf-yun.com';
    this.pollIntervalMs = parseInt(process.env.IFLYTEK_TTS_POLL_INTERVAL_MS || `${DEFAULT_POLL_INTERVAL_MS}`, 10);
    this.pollTimeoutMs = parseInt(process.env.IFLYTEK_TTS_POLL_TIMEOUT_MS || `${DEFAULT_POLL_TIMEOUT_MS}`, 10);
    const requestTimeout = parseInt(process.env.IFLYTEK_TTS_REQUEST_TIMEOUT_MS || `${DEFAULT_REQUEST_TIMEOUT_MS}`, 10);

    this.http = axios.create({
      timeout: Number.isNaN(requestTimeout) ? DEFAULT_REQUEST_TIMEOUT_MS : requestTimeout,
    });
  }

  async synthesize(params: TtsSynthesisParams, context?: TtsProviderContext): Promise<TtsSynthesisResult> {
    this.ensureConfigured();

    const sessionId = context?.sessionId;
    const requestId = randomUUID();
    const requestLabel = `${this.id}-${requestId}`;
    const voice = this.resolveVoice(params.voiceId);
    const format = params.format || DEFAULT_FORMAT;

    // 测试环境短路：跳过真实轮询，直接返回可控的假音频数据。
    if (process.env.NODE_ENV === 'test' && process.env.IFLYTEK_TTS_TEST_FAKE === '1') {
      const fallbackAudio = Buffer.from('iflytek-test-audio').toString('base64');
      const fakeUrl =
        process.env.TTS_TEST_FAKE_AUDIO_URL || `data:audio/mp3;base64,${fallbackAudio}`;

      return {
        provider: this.id,
        requestId: requestLabel,
        audioUrl: fakeUrl,
        expiresAt: Date.now() + 5 * 60 * 1000,
        format,
        cached: false,
        warnings: ['IFLYTEK_TTS_TEST_FAKE 模式返回的测试音频'],
      };
    }

    const createPayload = this.buildCreatePayload(params, voice, requestId);
    const createResponse = await this.callApi<IflytekCreateResponse>(
      '/v1/private/dts_create',
      createPayload,
      requestLabel,
      sessionId,
      'create'
    );

    if (!createResponse?.header) {
      throw new IflytekTtsError('讯飞接口返回格式异常：缺少 header', 'IFLYTEK_INVALID_RESPONSE');
    }

    if (createResponse.header.code !== 0 || !createResponse.header.task_id) {
      throw new IflytekTtsError(
        `讯飞创建任务失败: ${createResponse.header.message || '未知错误'}`,
        `IFLYTEK_CREATE_${createResponse.header.code}`,
        502,
        { header: createResponse.header }
      );
    }

    const taskId = createResponse.header.task_id;
    const sid = createResponse.header.sid;

    logInfo(EventType.AI_API_RESPONSE, '讯飞语音任务创建成功', {
      provider: this.id,
      requestId: requestLabel,
      taskId,
      sid,
    }, undefined, sessionId);

    const pollResponse = await this.pollTask(taskId, requestLabel, sessionId);
    const audioUrl = this.extractAudioUrl(pollResponse);
    const resolvedFormat = this.resolveFormat(format, pollResponse.payload?.audio?.encoding);
    const warnings = this.collectWarnings(pollResponse);
    const finalSid = pollResponse.header?.sid || sid;
    const taskStatus = pollResponse.header?.task_status;

    logInfo(EventType.AI_API_RESPONSE, '讯飞语音任务完成', {
      provider: this.id,
      requestId: requestLabel,
      taskId,
      sid: finalSid,
      taskStatus,
    }, undefined, sessionId);

    return {
      provider: this.id,
      requestId: requestLabel,
      audioUrl,
      expiresAt: Date.now() + REMOTE_AUDIO_TTL_MS,
      format: resolvedFormat,
      warnings: warnings.length > 0 ? warnings : undefined,
      metadata: {
        provider: this.id,
        taskId,
        sid: finalSid,
        taskStatus,
      },
    };
  }

  private ensureConfigured(): void {
    if (!this.appId || !this.apiKey || !this.apiSecret) {
      throw new IflytekTtsError(
        '未配置讯飞长文本语音合成凭证，请设置 IFLYTEK_TTS_APP_ID/API_KEY/API_SECRET',
        'IFLYTEK_CONFIG_MISSING',
        500
      );
    }
  }

  private resolveVoice(voiceId?: string) {
    const candidate = SUPPORTED_VOICES.find((voice) => voice.id === voiceId);
    return candidate || SUPPORTED_VOICES[0];
  }

  private buildCreatePayload(params: TtsSynthesisParams, voice: IflytekVoiceConfig, requestId: string) {
    const textBase64 = Buffer.from(params.text).toString('base64');
    const speed = this.mapPercentage(params.speed);
    const pitch = this.mapPercentage(params.pitch);
    const format = params.format || DEFAULT_FORMAT;

    return {
      header: {
        app_id: this.appId,
        request_id: requestId,
      },
      parameter: {
        dts: {
          vcn: voice.vcn,
          language: 'zh',
          speed,
          volume: 50,
          pitch,
          rhy: 0,
          audio: this.buildAudioConfig(format),
          pybuf: {
            encoding: 'utf8',
            compress: 'raw',
            format: 'plain',
          },
        },
      },
      payload: {
        text: {
          encoding: 'utf8',
          compress: 'raw',
          format: 'plain',
          text: textBase64,
        },
      },
    };
  }

  private buildAudioConfig(format: TtsAudioFormat) {
    if (format === 'pcm') {
      return {
        encoding: 'raw',
        sample_rate: 16000,
      };
    }

    return {
      encoding: 'lame',
      sample_rate: 16000,
    };
  }

  private mapPercentage(value?: number, min = 0.5, max = 2, mid = 1): number {
    const clamped = Math.min(Math.max(value ?? mid, min), max);
    if (clamped === mid) {
      return 50;
    }
    if (clamped < mid) {
      const ratio = (clamped - min) / (mid - min);
      return Math.round(ratio * 50);
    }
    const ratio = (clamped - mid) / (max - mid);
    return Math.round(50 + ratio * 50);
  }

  private async pollTask(taskId: string, requestLabel: string, sessionId?: string): Promise<IflytekQueryResponse> {
    if (process.env.NODE_ENV === 'test' && process.env.IFLYTEK_TTS_TEST_FAKE === '1') {
      const fakeUrl = process.env.TTS_TEST_FAKE_AUDIO_URL || 'http://localhost/fake.mp3';
      return {
        header: {
          code: 0,
          message: 'success',
          task_status: '5',
        },
        payload: {
          audio: {
            audio: Buffer.from(fakeUrl, 'utf8').toString('base64'),
            encoding: 'lame',
            sample_rate: 16000,
          },
        },
      } as unknown as IflytekQueryResponse;
    }

    const deadline = Date.now() + (Number.isNaN(this.pollTimeoutMs) ? DEFAULT_POLL_TIMEOUT_MS : this.pollTimeoutMs);
    const interval = Number.isNaN(this.pollIntervalMs) ? DEFAULT_POLL_INTERVAL_MS : this.pollIntervalMs;

    while (Date.now() < deadline) {
      const response = await this.callApi<IflytekQueryResponse>(
        '/v1/private/dts_query',
        {
          header: {
            app_id: this.appId,
            task_id: taskId,
          },
        },
        requestLabel,
        sessionId,
        'query'
      );

      if (!response?.header) {
        throw new IflytekTtsError('讯飞查询任务返回格式异常：缺少 header', 'IFLYTEK_INVALID_QUERY_RESPONSE');
      }

      if (response.header.code !== 0) {
        throw new IflytekTtsError(
          `讯飞查询任务失败: ${response.header.message || '未知错误'}`,
          `IFLYTEK_QUERY_${response.header.code}`,
          502,
          { header: response.header }
        );
      }

      const status = response.header.task_status;
      if (status === '5') {
        return response;
      }
      if (status === '4') {
        throw new IflytekTtsError(
          '讯飞语音合成任务处理失败',
          'IFLYTEK_TASK_FAILED',
          502,
          { header: response.header }
        );
      }

      await this.delay(interval);
    }

    throw new IflytekTtsError('讯飞语音合成任务查询超时', 'IFLYTEK_TASK_TIMEOUT', 504, { timeoutMs: this.pollTimeoutMs });
  }

  private extractAudioUrl(response: IflytekQueryResponse): string {
    const audioBase64 = response.payload?.audio?.audio;
    if (!audioBase64) {
      throw new IflytekTtsError('讯飞查询结果缺少音频链接', 'IFLYTEK_NO_AUDIO_URL', 502, { payload: response.payload });
    }

    try {
      return Buffer.from(audioBase64, 'base64').toString('utf8');
    } catch (error: any) {
      throw new IflytekTtsError('解码讯飞音频链接失败', 'IFLYTEK_AUDIO_DECODE_ERROR', 502, {
        message: error?.message,
      });
    }
  }

  private resolveFormat(requested: TtsAudioFormat, encoding?: string): TtsAudioFormat {
    if (!encoding) {
      return requested;
    }

    const normalized = encoding.toLowerCase();
    if (normalized === 'raw') {
      return 'pcm';
    }
    if (normalized === 'lame') {
      return 'mp3';
    }
    return requested;
  }

  private collectWarnings(response: IflytekQueryResponse): string[] {
    const warnings: string[] = [];

    if (response.header?.message && response.header.message !== 'success') {
      warnings.push(response.header.message);
    }

    if (!response.payload?.audio?.audio) {
      warnings.push('讯飞返回结果未包含音频链接');
    }

    return warnings;
  }

  private async callApi<T>(
    path: string,
    payload: unknown,
    requestLabel: string,
    sessionId?: string,
    stage: 'create' | 'query' = 'create'
  ): Promise<T> {
    const url = this.buildSignedUrl(path);
    const start = Date.now();

    logInfo(EventType.AI_API_REQUEST, '调用讯飞长文本语音合成接口', {
      provider: this.id,
      stage,
      path,
      requestId: requestLabel,
      host: this.host,
    }, undefined, sessionId);

    try {
      const response = await this.http.post<T>(url, payload, {
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const duration = Date.now() - start;
      logInfo(EventType.AI_API_RESPONSE, '讯飞长文本语音合成接口响应', {
        provider: this.id,
        stage,
        path,
        requestId: requestLabel,
        duration,
      }, {
        startTime: start,
        endTime: start + duration,
        duration,
      }, sessionId);

      return response.data;
    } catch (error: any) {
      logError(EventType.AI_API_ERROR, '调用讯飞长文本语音合成接口失败', error, {
        provider: this.id,
        stage,
        path,
        requestId: requestLabel,
      }, sessionId);

      const message = error?.response?.data?.header?.message || error?.message || '未知错误';
      throw new IflytekTtsError(
        `调用讯飞接口失败: ${message}`,
        'IFLYTEK_HTTP_ERROR',
        502,
        {
          stage,
          status: error?.response?.status,
          response: error?.response?.data,
        }
      );
    }
  }

  private buildSignedUrl(path: string): string {
    if (!this.apiSecret || !this.apiKey) {
      throw new IflytekTtsError('讯飞凭证未配置，无法生成签名', 'IFLYTEK_SIGN_MISSING', 500);
    }

    const date = new Date().toUTCString();
    const requestLine = `POST ${path} HTTP/1.1`;
    const signatureOrigin = `host: ${this.host}\ndate: ${date}\n${requestLine}`;
    const signature = createHmac('sha256', this.apiSecret).update(signatureOrigin).digest('base64');
    const authorizationOrigin = `api_key="${this.apiKey}",algorithm="hmac-sha256",headers="host date request-line",signature="${signature}"`;
    const authorization = Buffer.from(authorizationOrigin).toString('base64');
    const params = new URLSearchParams({
      host: this.host,
      date,
      authorization,
    });

    return `https://${this.host}${path}?${params.toString()}`;
  }

  private async delay(ms: number): Promise<void> {
    if (ms <= 0) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export default IflytekTtsProvider;
