import request from 'supertest';
import express from 'express';
import adminRouter from '../../src/routes/admin';

const sampleLogs = [
  { _id: '1', timestamp: new Date('2025-01-01T10:00:00Z'), sessionId: 's1', logLevel: 'info', eventType: 'story_generation_start', message: 'start' },
  { _id: '2', timestamp: new Date('2025-01-01T10:00:10Z'), sessionId: 's1', logLevel: 'info', eventType: 'ai_api_response', message: 'ok' },
  { _id: '3', timestamp: new Date('2025-01-01T10:00:20Z'), sessionId: 's2', logLevel: 'error', eventType: 'json_parse_error', message: 'bad json', stackTrace: 'Error: simulated' },
];

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

jest.mock('../../src/config/database', () => ({
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
            Object.keys(project).forEach((key) => { if (project[key] === 0) delete (clone as any)[key]; });
            return clone;
          };
          return {
            sort: (_: any) => ({
              toArray: async () => filtered.map(applyProjection),
              skip: (_s: number) => ({ limit: (_l: number) => ({ toArray: async () => filtered.map(applyProjection) }) })
            })
          };
        }
      } as any;
    }
  })
}));

describe('Admin Logs API - multi eventType filter', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/admin', adminRouter);

  it('supports comma-separated eventType', async () => {
    const res = await request(app).get('/api/admin/logs').query({ eventType: 'ai_api_response,story_generation_start', limit: '100' });
    expect(res.status).toBe(200);
    const types = res.body.data.logs.map((l: any) => l.eventType).sort();
    expect(types).toEqual(['ai_api_response', 'story_generation_start'].sort());
  });

  it('supports repeated eventType params', async () => {
    const res = await request(app).get('/api/admin/logs').query({ eventType: ['ai_api_response', 'story_generation_start'], limit: '100' } as any);
    expect(res.status).toBe(200);
    const types = res.body.data.logs.map((l: any) => l.eventType).sort();
    expect(types).toEqual(['ai_api_response', 'story_generation_start'].sort());
  });

  it('JSON export respects multi eventType', async () => {
    const res = await request(app).post('/api/admin/logs/export').send({ format: 'json', eventType: 'ai_api_response,story_generation_start' });
    expect(res.status).toBe(200);
    expect(res.body.totalRecords).toBe(2);
    const types = res.body.data.map((l: any) => l.eventType).sort();
    expect(types).toEqual(['ai_api_response', 'story_generation_start'].sort());
  });

  it('exclude stackTrace by default; include when requested', async () => {
    const res1 = await request(app).get('/api/admin/logs').query({ eventType: 'json_parse_error', limit: '100' });
    expect(res1.status).toBe(200);
    expect(res1.body.data.logs[0].stackTrace).toBeUndefined();
    const res2 = await request(app).get('/api/admin/logs').query({ eventType: 'json_parse_error', includeStackTrace: 'true', limit: '100' });
    expect(res2.status).toBe(200);
    expect(res2.body.data.logs[0].stackTrace).toBeDefined();
  });
});

