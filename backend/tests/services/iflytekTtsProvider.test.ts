const mockPost = jest.fn();

jest.mock('axios', () => {
  const create = jest.fn(() => ({ post: mockPost }));
  return {
    __esModule: true,
    default: { create },
    create,
  };
});

import { IflytekTtsProvider } from '../../src/services/tts/providers/iflytekTtsProvider';

describe('IflytekTtsProvider', () => {
  beforeEach(() => {
    mockPost.mockReset();

    process.env.IFLYTEK_TTS_APP_ID = 'demo-app-id';
    process.env.IFLYTEK_TTS_API_KEY = 'demo-api-key';
    process.env.IFLYTEK_TTS_API_SECRET = 'demo-api-secret';
    process.env.IFLYTEK_TTS_API_HOST = 'api-dx.xf-yun.com';
    process.env.IFLYTEK_TTS_POLL_INTERVAL_MS = '0';
    process.env.IFLYTEK_TTS_POLL_TIMEOUT_MS = '5000';
    process.env.IFLYTEK_TTS_REQUEST_TIMEOUT_MS = '1000';
    delete process.env.IFLYTEK_TTS_TEST_FAKE;
  });

  afterEach(() => {
    delete process.env.IFLYTEK_TTS_APP_ID;
    delete process.env.IFLYTEK_TTS_API_KEY;
    delete process.env.IFLYTEK_TTS_API_SECRET;
    delete process.env.IFLYTEK_TTS_API_HOST;
    delete process.env.IFLYTEK_TTS_POLL_INTERVAL_MS;
    delete process.env.IFLYTEK_TTS_POLL_TIMEOUT_MS;
    delete process.env.IFLYTEK_TTS_REQUEST_TIMEOUT_MS;
    delete process.env.IFLYTEK_TTS_TEST_FAKE;
  });

  it('缺少凭证时抛出配置错误', async () => {
    delete process.env.IFLYTEK_TTS_APP_ID;
    const provider = new IflytekTtsProvider();

    await expect(provider.synthesize({ text: '你好世界' })).rejects.toMatchObject({
      code: 'IFLYTEK_CONFIG_MISSING',
    });
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('成功创建任务并返回音频链接', async () => {
    const audioUrl = 'http://cdn.iflytek.com/audio/demo.mp3';
    const audioUrlBase64 = Buffer.from(audioUrl, 'utf8').toString('base64');

    mockPost
      .mockResolvedValueOnce({
        data: {
          header: {
            code: 0,
            message: 'success',
            task_id: 'task-123',
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          header: {
            code: 0,
            message: 'success',
            task_status: '5',
          },
          payload: {
            audio: {
              audio: audioUrlBase64,
              encoding: 'lame',
            },
          },
        },
      });

    const provider = new IflytekTtsProvider();
    const result = await provider.synthesize({ text: '这是一个测试故事。', format: 'mp3' });

    expect(result.provider).toBe('iflytek');
    expect(result.audioUrl).toBe(audioUrl);
    expect(result.format).toBe('mp3');
    expect(result.requestId).toMatch(/^iflytek-/);
    expect(mockPost).toHaveBeenCalledTimes(2);

    const createPayload = mockPost.mock.calls[0][1];
    expect(createPayload.payload.text.text).toBe(Buffer.from('这是一个测试故事。').toString('base64'));
  });

  it('任务失败时抛出错误', async () => {
    mockPost
      .mockResolvedValueOnce({
        data: {
          header: {
            code: 0,
            message: 'success',
            task_id: 'task-456',
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          header: {
            code: 0,
            message: 'failed',
            task_status: '4',
          },
        },
      });

    const provider = new IflytekTtsProvider();

    await expect(provider.synthesize({ text: '失败案例' })).rejects.toMatchObject({
      code: 'IFLYTEK_TASK_FAILED',
    });
    expect(mockPost).toHaveBeenCalledTimes(2);
  });
});
