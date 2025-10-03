import request from 'supertest';
import express from 'express';
import path from 'path';
import fs from 'fs';

jest.mock('prom-client', () => {
  const buildMetric = () => ({ observe: jest.fn(), inc: jest.fn(), dec: jest.fn(), set: jest.fn() });
  class MockRegistry {
    registerMetric = jest.fn();
  }
  return {
    Registry: MockRegistry,
    Counter: jest.fn(buildMetric),
    Histogram: jest.fn(buildMetric),
    Gauge: jest.fn(buildMetric),
    collectDefaultMetrics: jest.fn(),
  };
}, { virtual: true });

import ttsRouter from '../../src/routes/tts';

const TEMP_TTS_DIR = path.join(__dirname, '..', 'tmp-tts');

process.env.TTS_PROVIDER = 'mock';
process.env.TTS_AUDIO_BASE_URL = 'http://localhost:5001/static/tts';
process.env.TTS_AUDIO_OUTPUT_DIR = TEMP_TTS_DIR;
process.env.TTS_AUDIO_DOWNLOAD_TIMEOUT_MS = '5000';

const app = express();
app.use(express.json());
app.use('/api/tts', ttsRouter);

describe('TTS API Routes', () => {
  beforeAll(() => {
    fs.rmSync(TEMP_TTS_DIR, { recursive: true, force: true });
    fs.mkdirSync(TEMP_TTS_DIR, { recursive: true });
  });

  afterAll(() => {
    fs.rmSync(TEMP_TTS_DIR, { recursive: true, force: true });
  });

  it('POST /api/tts 应该生成 Mock 音频', async () => {
    const response = await request(app)
      .post('/api/tts')
      .send({ text: '从前有一只小兔子，想要和朋友去草地冒险。' })
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(typeof response.body.audioUrl).toBe('string');
    expect(response.body.audioUrl).toMatch(/^http:\/\/localhost:5001\/static\/tts\/.+\.(mp3|pcm)$/);
    expect(response.body.provider).toBe('mock');
    expect(response.body.expiresIn).toBeGreaterThan(0);

    const fileName = response.body.audioUrl.split('/').pop();
    expect(fileName).toBeTruthy();
    const filePath = path.join(TEMP_TTS_DIR, fileName as string);
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it('POST /api/tts 缺少文本时返回 400', async () => {
    const response = await request(app)
      .post('/api/tts')
      .send({})
      .expect(400);

    expect(response.body.success).toBe(false);
    expect(response.body.code).toBe('INVALID_TEXT');
  });
});
