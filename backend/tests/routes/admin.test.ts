import request from 'supertest';
import express from 'express';
import adminRouter from '../../src/routes/admin';
import { getConnectionForTesting } from '../../src/config/database';
import { Db, MongoClient } from 'mongodb';

const app = express();
app.use(express.json());
app.use('/api/admin', adminRouter);

describe('Admin API Routes (Appsmith compatibility)', () => {
  let client: MongoClient;
  let db: Db;

  beforeAll(async () => {
    const conn = await getConnectionForTesting();
    client = conn.client;
    db = conn.db;
  });

  afterAll(async () => {
    await client?.close();
  });

  beforeEach(async () => {
    await db.collection('story_logs').deleteMany({});
  });

  it('GET /api/admin/logs supports comma-separated eventType and logLevel', async () => {
    const now = new Date();
    await db.collection('story_logs').insertMany([
      {
        timestamp: now,
        sessionId: 's1',
        logLevel: 'info',
        eventType: 'ai_api_response',
        message: 'ok',
      },
      {
        timestamp: now,
        sessionId: 's2',
        logLevel: 'error',
        eventType: 'json_parse_success',
        message: 'ok2',
      },
      {
        timestamp: now,
        sessionId: 's3',
        logLevel: 'debug',
        eventType: 'content_validation',
        message: 'ok3',
      },
    ]);

    const res = await request(app)
      .get('/api/admin/logs')
      .query({ eventType: 'ai_api_response,json_parse_success', logLevel: 'info,error' })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.logs)).toBe(true);
    // Should only include the first two logs by our filter
    const events = res.body.data.logs.map((l: any) => l.eventType);
    expect(events).toEqual(expect.arrayContaining(['ai_api_response', 'json_parse_success']));
    expect(events).not.toContain('content_validation');
  });

  it('GET /api/admin/stats responds with expected structure', async () => {
    const res = await request(app).get('/api/admin/stats').expect(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('overview');
    expect(res.body.data).toHaveProperty('performance');
    expect(res.body.data).toHaveProperty('database');
  });

  it('GET /api/admin/performance returns timeline array', async () => {
    const res = await request(app).get('/api/admin/performance').expect(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('timeline');
    expect(Array.isArray(res.body.data.timeline)).toBe(true);
  });

  it('GET /api/admin/logs supports search by partial sessionId and excludes stackTrace by default', async () => {
    const now = new Date();
    await db.collection('story_logs').insertMany([
      {
        timestamp: now,
        sessionId: 'abc123searchable',
        logLevel: 'error',
        eventType: 'story_generation_error',
        message: 'fail with stack',
        stackTrace: 'Error: something bad\n at here',
      },
      {
        timestamp: now,
        sessionId: 'other-session',
        logLevel: 'info',
        eventType: 'ai_api_response',
        message: 'ok',
      },
    ]);

    const res = await request(app)
      .get('/api/admin/logs')
      .query({ search: 'abc123' })
      .expect(200);

    expect(res.body.success).toBe(true);
    const logs = res.body.data.logs;
    expect(logs.length).toBe(1);
    expect(logs[0].sessionId).toBe('abc123searchable');
    expect(logs[0].stackTrace).toBeUndefined();

    const resWithStack = await request(app)
      .get('/api/admin/logs')
      .query({ search: 'abc123', includeStackTrace: 'true' })
      .expect(200);
    expect(resWithStack.body.data.logs[0].stackTrace).toBeDefined();
  });
});
