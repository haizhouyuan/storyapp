import express from 'express';
import request from 'supertest';
import bodyParser from 'body-parser';
import { connectToDatabase } from '../src/config/database';
import { initializeDatabase } from '../src/config/initializeDatabase';
import projectRoutes from '../src/routes/projects';
import blueprintRoutes from '../src/routes/blueprints';
import { getDatabase } from '../src/config/database';
import { COLLECTIONS } from '../src/config/mongodb';

jest.mock('../src/engines/planner_llm', () => ({
  __esModule: true,
  planBlueprint: jest.fn(async (topic: string) => ({
    ok: true,
    outline: {
      centralTrick: { summary: '潮汐风道+共振', mechanism: '风道滑轮共振', fairnessNotes: ['多次听音'] },
      caseSetup: { victim: '方庆', crimeScene: '钟楼', initialMystery: '第八声' },
      characters: [
        { name: '蛋蛋', role: 'detective' },
        { name: '郇夫人', role: 'suspect' },
        { name: '沈伯', role: 'suspect' },
        { name: '陆清', role: 'witness' },
        { name: '方庆', role: 'victim' },
        { name: '周老', role: 'witness' }
      ],
      acts: [
        { act: 1, focus: '设谜', beats: [{ beat: 1, summary: '开场' }] },
        { act: 2, focus: '调查', beats: [{ beat: 1, summary: '调查' }] },
        { act: 3, focus: '揭晓', beats: [{ beat: 1, summary: '收束' }] }
      ],
      clueMatrix: [
        { clue: '第七钟后细响', mustForeshadow: true, explicitForeshadowChapters: ['Chapter 1'] },
        { clue: '门缝铜丝', mustForeshadow: true, explicitForeshadowChapters: ['Chapter 2'] }
      ],
      timeline: [
        { time: 'Day1 19:00', event: '七声钟' },
        { time: 'Day1 22:30', event: '机关轻击' }
      ],
      themes: ['成长'],
      logicChecklist: ['线索公平']
    }
  }))
}));

jest.mock('../src/agents/detective/stageRunner', () => ({
  __esModule: true,
  runSceneWriting: jest.fn(async (_outline: any, sceneId: string) => ({
    scene_id: sceneId,
    chapter: {
      title: '海鸥的眼睛',
      summary: '线索铺垫',
      wordCount: 1500,
      content: '这是正文'.repeat(600),
      cluesEmbedded: ['门缝铜丝'],
      redHerringsEmbedded: []
    }
  })),
  runSceneEditing: jest.fn(async (chapter: any) => ({
    ...chapter,
    content: (chapter.content || '')
      .replace(/血腥/g, '不适宜词语')
  }))
}));

function createTestApp() {
  const app = express();
  app.use(bodyParser.json({ limit: '2mb' }));
  app.use('/api/projects', projectRoutes);
  app.use('/api/blueprints', blueprintRoutes);
  return app;
}

describe('Projects & Blueprints API (M2)', () => {
  const app = createTestApp();

  beforeAll(async () => {
    await connectToDatabase();
    await initializeDatabase();
  });

  test('POST /api/projects → creates project', async () => {
    const res = await request(app)
      .post('/api/projects')
      .send({ title: '古堡的第八声' })
      .expect(200);

    expect(res.body?.success).toBe(true);
    expect(res.body?.project?.project_id).toBeTruthy();
  });

  test('POST /api/projects/:id/plan → generates blueprint', async () => {
    const createRes = await request(app)
      .post('/api/projects')
      .send({ title: '古堡的第八声' });

    const projectId = createRes.body.project.project_id;
    const res = await request(app)
      .post(`/api/projects/${projectId}/plan`)
      .send({})
      .expect(200);

    expect(res.body?.success).toBe(true);
    expect(res.body?.blueprintId).toBeTruthy();

    // verify blueprint stored
    const db = getDatabase();
    const bp = await db.collection(COLLECTIONS.STORY_BLUEPRINTS).findOne({ blueprintId: res.body.blueprintId });
    expect(bp).toBeTruthy();
  });

  test('POST /api/projects/:id/write?scene_id=S3 → returns chapter (schema+words ok)', async () => {
    const createRes = await request(app).post('/api/projects').send({ title: '古堡的第八声' });
    const projectId = createRes.body.project.project_id;
    const planRes = await request(app).post(`/api/projects/${projectId}/plan`).send({});
    expect(planRes.body?.blueprintId).toBeTruthy();

    const res = await request(app)
      .post(`/api/projects/${projectId}/write?scene_id=S3`)
      .send({})
      .expect(200);

    expect(res.body?.success).toBe(true);
    expect(res.body?.scene_id).toBe('S3');
    expect(res.body?.chapter?.title).toBeTruthy();
  });

  test('POST /api/projects/:id/edit?scene_id=S3 → returns edited chapter', async () => {
    const createRes = await request(app).post('/api/projects').send({ title: '古堡的第八声' });
    const projectId = createRes.body.project.project_id;
    const planRes = await request(app).post(`/api/projects/${projectId}/plan`).send({});
    expect(planRes.body?.blueprintId).toBeTruthy();

    const res = await request(app)
      .post(`/api/projects/${projectId}/edit?scene_id=S3`)
      .send({})
      .expect(200);

    expect(res.body?.success).toBe(true);
    expect(res.body?.scene_id).toBe('S3');
    expect(typeof res.body?.chapter?.content).toBe('string');
  });
});
