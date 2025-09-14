import request from 'supertest';
import express from 'express';

// 被测路由
import adminRouter from '../../src/routes/admin';

// 构造内存数据集
const sampleLogs = [
  {
    _id: '1',
    timestamp: new Date('2025-01-01T10:00:00Z'),
    sessionId: 's1',
    logLevel: 'info',
    eventType: 'story_generation_start',
    message: 'start',
  },
  {
    _id: '2',
    timestamp: new Date('2025-01-01T10:00:10Z'),
    sessionId: 's1',
    logLevel: 'info',
    eventType: 'ai_api_response',
    message: 'ok',
  },
  {
    _id: '3',
    timestamp: new Date('2025-01-01T10:00:20Z'),
    sessionId: 's2',
    logLevel: 'error',
    eventType: 'json_parse_error',
    message: 'bad json',
    stackTrace: 'Error: simulated error\n at test',
  },
];

// 过滤器应用工具（仅支持本测试用到的字段）
function applyFilter(data: any[], filter: any) {
  return data.filter((log) => {
    for (const key of Object.keys(filter)) {
      const cond = (filter as any)[key];
      if (key === 'timestamp' && typeof cond === 'object') {
        if (cond.$gte && log.timestamp < new Date(cond.$gte)) return false;
        if (cond.$lte && log.timestamp > new Date(cond.$lte)) return false;
      } else if (typeof cond === 'object' && cond.$in) {
        if (!cond.$in.includes((log as any)[key])) return false;
      } else {
        if ((log as any)[key] !== cond) return false;
      }
    }
    return true;
  });
}

// mock getDatabase -> 返回带有 story_logs 集合的伪实现
jest.mock('../../src/config/database', () => {
  return {
    __esModule: true,
    getDatabase: () => ({
      collection: (name: string) => {
        if (name !== 'story_logs') throw new Error('Unexpected collection: ' + name);
        return {
          countDocuments: async (filter: any) => applyFilter(sampleLogs, filter || {}).length,
          find: (filter: any, options?: any) => {
            const filtered = applyFilter(sampleLogs, filter || {});
            const project = options?.projection || {};
            const applyProjection = (doc: any) => {
              const clone = { ...doc };
              // Support simple exclusion projection like { stackTrace: 0 }
              Object.keys(project).forEach((key) => {
                if (project[key] === 0) delete (clone as any)[key];
              });
              return clone;
            };
            return {
              sort: (_: any) => ({
                // path without pagination
                toArray: async () => filtered.map(applyProjection),
                // path with pagination
                skip: (_s: number) => ({
                  limit: (_l: number) => ({
                    toArray: async () => filtered.map(applyProjection),
                  })
                })
              })
            };
          },
        } as any;
      }
    }),
  };
});

describe('Admin Logs API - multi eventType filter', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/admin', adminRouter);

  test('GET /api/admin/logs supports comma-separated eventType', async () => {
    const res = await request(app)
      .get('/api/admin/logs')
      .query({ eventType: 'ai_api_response,story_generation_start', limit: '100' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const types = res.body.data.logs.map((l: any) => l.eventType);
    expect(types.sort()).toEqual(['ai_api_response', 'story_generation_start'].sort());
  });

  test('GET /api/admin/logs supports repeated eventType params', async () => {
    const res = await request(app)
      .get('/api/admin/logs')
      .query({ eventType: ['ai_api_response', 'story_generation_start'], limit: '100' } as any);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const types = res.body.data.logs.map((l: any) => l.eventType);
    expect(types.sort()).toEqual(['ai_api_response', 'story_generation_start'].sort());
  });

  test('POST /api/admin/logs/export JSON respects multi eventType', async () => {
    const res = await request(app)
      .post('/api/admin/logs/export')
      .send({ format: 'json', eventType: 'ai_api_response,story_generation_start' });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body.totalRecords).toBe(2);
    const types = res.body.data.map((l: any) => l.eventType);
    expect(types.sort()).toEqual(['ai_api_response', 'story_generation_start'].sort());
  });

  test('GET /api/admin/logs supports search by partial sessionId and excludes stackTrace by default', async () => {
    const res = await request(app)
      .get('/api/admin/logs')
      .query({ search: 's1', limit: '100' });

    expect(res.status).toBe(200);
    const ids = res.body.data.logs.map((l: any) => l.sessionId);
    // two logs with sessionId 's1'
    expect(ids.every((id: string) => id === 's1')).toBe(true);
    // default projection should remove stackTrace
    expect(res.body.data.logs.some((l: any) => 'stackTrace' in l)).toBe(false);
  });

  test('GET /api/admin/logs includeStackTrace=true returns stackTrace field', async () => {
    const res = await request(app)
      .get('/api/admin/logs')
      .query({ eventType: 'json_parse_error', includeStackTrace: 'true' });

    expect(res.status).toBe(200);
    expect(res.body.data.logs.length).toBe(1);
    expect(res.body.data.logs[0].eventType).toBe('json_parse_error');
    expect(res.body.data.logs[0].stackTrace).toBeDefined();
  });
});
