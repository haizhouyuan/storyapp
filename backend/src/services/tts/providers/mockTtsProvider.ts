import { randomUUID } from 'crypto';
import type {
  TtsProvider,
  TtsProviderCapabilities,
  TtsProviderContext,
  TtsProviderMetadata,
  TtsSynthesisParams,
  TtsSynthesisResult
} from '../types';

const DEFAULT_DURATION_MS = 1200;

const buildDataUrl = (frequency = 440, durationSeconds = 0.6, sampleRate = 16000): string => {
  const sampleCount = Math.floor(durationSeconds * sampleRate);
  const blockAlign = 2; // mono, 16-bit
  const byteRate = sampleRate * blockAlign;
  const dataSize = sampleCount * blockAlign;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // PCM header size
  buffer.writeUInt16LE(1, 20); // PCM format
  buffer.writeUInt16LE(1, 22); // channels
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(16, 34); // bits per sample
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < sampleCount; i += 1) {
    const t = i / sampleRate;
    const amplitude = Math.sin(2 * Math.PI * frequency * t) * 0.6;
    buffer.writeInt16LE(Math.floor(amplitude * 0x7fff), 44 + i * 2);
  }

  return `data:audio/wav;base64,${buffer.toString('base64')}`;
};

export class MockTtsProvider implements TtsProvider {
  readonly id = 'mock';

  readonly metadata: TtsProviderMetadata = {
    name: 'Mock TTS Provider',
    version: '1.0.0',
  };

  readonly capabilities: TtsProviderCapabilities = {
    voices: [
      { id: 'mock_child', name: 'Mock Child Voice', language: 'zh-CN', gender: 'child' },
      { id: 'mock_calm', name: 'Mock Calm Narrator', language: 'zh-CN', gender: 'female' },
    ],
    speedRange: [0.5, 2],
    pitchRange: [0.5, 2],
    formats: ['mp3', 'pcm'],
    defaultVoice: 'mock_child',
  };

  async synthesize(params: TtsSynthesisParams, _context?: TtsProviderContext): Promise<TtsSynthesisResult> {
    const frequency = params.voiceId === 'mock_calm' ? 330 : 440;
    const dataUrl = buildDataUrl(frequency, 0.65 + Math.min(params.text.length / 200, 1));
    const requestId = randomUUID();
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes

    return {
      provider: this.id,
      requestId,
      audioUrl: dataUrl,
      expiresAt,
      format: params.format || 'mp3',
      durationMs: DEFAULT_DURATION_MS,
      warnings: params.text.length > 2000 ? ['文本较长，Mock 音频长度未完全匹配实际语速'] : undefined,
      metadata: {
        mode: 'mock',
        textLength: params.text.length,
        voiceId: params.voiceId ?? this.capabilities.defaultVoice,
      },
    };
  }
}

export default MockTtsProvider;
