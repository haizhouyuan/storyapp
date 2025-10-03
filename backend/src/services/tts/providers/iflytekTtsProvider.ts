import { randomUUID } from 'crypto';
import type {
  TtsProvider,
  TtsProviderCapabilities,
  TtsProviderContext,
  TtsProviderMetadata,
  TtsSynthesisParams,
  TtsSynthesisResult
} from '../types';
import { MockTtsProvider } from './mockTtsProvider';

/**
 * 科大讯飞语音合成 Provider 雏形
 * 当前阶段返回 Mock 数据，后续替换为真实 WebAPI 调用。
 */
export class IflytekTtsProvider implements TtsProvider {
  readonly id = 'iflytek';

  private readonly mock = new MockTtsProvider();

  readonly metadata: TtsProviderMetadata = {
    name: 'iFlytek Long-form TTS',
    version: '0.1.0-mock',
  };

  readonly capabilities: TtsProviderCapabilities = {
    ...this.mock.capabilities,
    voices: [
      { id: 'iflytek_x3_mingge', name: '讯飞-晓萌', language: 'zh-CN', gender: 'child' },
      { id: 'iflytek_xiaoxuan', name: '讯飞-晓萱', language: 'zh-CN', gender: 'female' }
    ],
    defaultVoice: 'iflytek_x3_mingge',
  };

  async synthesize(params: TtsSynthesisParams, context?: TtsProviderContext): Promise<TtsSynthesisResult> {
    // 测试环境短路：跳过真实轮询，直接返回可控的假音频数据。
    if (process.env.NODE_ENV === 'test' && process.env.IFLYTEK_TTS_TEST_FAKE === '1') {
      const fallbackAudio = Buffer.from('iflytek-test-audio').toString('base64');
      const fakeUrl =
        process.env.TTS_TEST_FAKE_AUDIO_URL || `data:audio/mp3;base64,${fallbackAudio}`;

      return {
        provider: this.id,
        requestId: `${this.id}-${randomUUID()}`,
        audioUrl: fakeUrl,
        expiresAt: Date.now() + 5 * 60 * 1000,
        format: params.format || 'mp3',
        cached: false,
        warnings: ['IFLYTEK_TTS_TEST_FAKE 模式返回的测试音频'],
      };
    }

    const baseResult = await this.mock.synthesize(params, context);
    return {
      ...baseResult,
      provider: this.id,
      requestId: `${this.id}-${randomUUID()}`,
    };
  }
}

export default IflytekTtsProvider;
