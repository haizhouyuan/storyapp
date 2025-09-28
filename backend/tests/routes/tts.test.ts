import request from 'supertest';
import express from 'express';

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

process.env.TTS_PROVIDER = 'mock';

const app = express();
app.use(express.json());
app.use('/api/tts', ttsRouter);

describe('TTS API Routes', () => {
  it('POST /api/tts 应该生成 Mock 音频', async () => {
    const response = await request(app)
      .post('/api/tts')
      .send({ text: '从前有一只小兔子，想要和朋友去草地冒险。' })
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(typeof response.body.audioUrl).toBe('string');
    expect(response.body.audioUrl).toContain('data:audio');
    expect(response.body.provider).toBe('mock');
    expect(response.body.expiresIn).toBeGreaterThan(0);
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
