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
 * 阿里云语音合成 Provider 雏形
 * 当前阶段复用 Mock 数据，后续接入真实 API 时补充鉴权与调用逻辑。
 */
export class AlicloudTtsProvider implements TtsProvider {
  readonly id = 'alicloud';

  private readonly mock = new MockTtsProvider();

  readonly metadata: TtsProviderMetadata = {
    name: 'Alicloud Text-to-Speech',
    version: '0.1.0-mock',
  };

  readonly capabilities: TtsProviderCapabilities = {
    ...this.mock.capabilities,
    voices: [
      { id: 'alicloud_xiaoyun', name: '阿里云-晓云', language: 'zh-CN', gender: 'female' },
      { id: 'alicloud_xiaoguo', name: '阿里云-晓果', language: 'zh-CN', gender: 'male' },
    ],
    defaultVoice: 'alicloud_xiaoyun',
  };

  async synthesize(params: TtsSynthesisParams, context?: TtsProviderContext): Promise<TtsSynthesisResult> {
    const baseResult = await this.mock.synthesize(params, context);
    return {
      ...baseResult,
      provider: this.id,
      requestId: `${this.id}-${randomUUID()}`,
    };
  }
}

export default AlicloudTtsProvider;
