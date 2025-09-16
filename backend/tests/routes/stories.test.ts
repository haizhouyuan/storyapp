import request from 'supertest';
import express from 'express';
import storiesRouter from '../../src/routes/stories';
import { getConnectionForTesting } from '../../src/config/database';
import { MongoClient, Db, Collection } from 'mongodb';

const app = express();
app.use(express.json());
app.use('/api', storiesRouter);

describe('Stories API Routes', () => {
  let client: MongoClient;
  let db: Db;
  let collection: Collection;

  beforeAll(async () => {
    const connection = await getConnectionForTesting();
    client = connection.client;
    db = connection.db;
    collection = db.collection('stories');
  });

  afterAll(async () => {
    await client?.close();
  });

  beforeEach(async () => {
    await collection.deleteMany({});
  });

  describe('POST /api/generate-story', () => {
    it('应该生成故事内容', async () => {
      const response = await request(app)
        .post('/api/generate-story')
        .send({ topic: '小兔子的冒险' })
        .expect(200);

      expect(response.body).toBeDefined();
      expect(response.body.storySegment).toBeDefined();
      expect(response.body.choices).toBeDefined();
      expect(Array.isArray(response.body.choices)).toBe(true);
    });

    it('应该处理缺少topic的请求', async () => {
      const response = await request(app)
        .post('/api/generate-story')
        .send({})
        .expect(400);

      expect(response.body.error).toBeDefined();
    });

    it('应该处理空topic', async () => {
      const response = await request(app)
        .post('/api/generate-story')
        .send({ topic: '' })
        .expect(400);

      expect(response.body.error).toBeDefined();
    });

    it('应该处理maxChoices参数', async () => {
      const response = await request(app)
        .post('/api/generate-story')
        .send({ 
          topic: '小兔子的冒险',
          maxChoices: 3
        })
        .expect(200);

      expect(response.body.choices.length).toBeLessThanOrEqual(3);
    });
  });

  describe('POST /api/save-story', () => {
    it('应该成功保存故事', async () => {
      const storyData = {
        title: '测试故事',
        content: JSON.stringify({
          storySegment: '从前有一只小兔子...',
          choices: ['选择1', '选择2']
        })
      };

      const response = await request(app)
        .post('/api/save-story')
        .send(storyData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.storyId).toBeDefined();
    });

    it('应该处理缺少title的请求', async () => {
      const response = await request(app)
        .post('/api/save-story')
        .send({ content: '测试内容' })
        .expect(400);

      expect(response.body.error).toBeDefined();
    });

    it('应该处理缺少content的请求', async () => {
      const response = await request(app)
        .post('/api/save-story')
        .send({ title: '测试标题' })
        .expect(400);

      expect(response.body.error).toBeDefined();
    });
  });

  describe('GET /api/get-stories', () => {
    beforeEach(async () => {
      const testStories = [
        {
          title: '故事1',
          content: '内容1',
          created_at: new Date('2024-01-01'),
          updated_at: new Date('2024-01-01')
        },
        {
          title: '故事2',
          content: '内容2', 
          created_at: new Date('2024-01-02'),
          updated_at: new Date('2024-01-02')
        }
      ];
      await collection.insertMany(testStories);
    });

    it('应该返回故事列表', async () => {
      const response = await request(app)
        .get('/api/get-stories')
        .expect(200);

      expect(response.body.stories).toBeDefined();
      expect(Array.isArray(response.body.stories)).toBe(true);
      expect(response.body.stories.length).toBe(2);
      expect(response.body.stories[0].title).toBeDefined();
    });

    it('应该返回空数组当没有故事时', async () => {
      await collection.deleteMany({});
      
      const response = await request(app)
        .get('/api/get-stories')
        .expect(200);

      expect(response.body.stories).toBeDefined();
      expect(Array.isArray(response.body.stories)).toBe(true);
      expect(response.body.stories.length).toBe(0);
    });
  });

  describe('GET /api/get-story/:id', () => {
    it('应该返回指定ID的故事', async () => {
      const insertResult = await collection.insertOne({
        title: '测试故事',
        content: '测试内容',
        created_at: new Date(),
        updated_at: new Date()
      });

      const response = await request(app)
        .get(`/api/get-story/${insertResult.insertedId}`)
        .expect(200);

      expect(response.body).toBeDefined();
      expect(response.body.title).toBe('测试故事');
      expect(response.body.content).toBe('测试内容');
    });

    it('应该在故事不存在时返回404', async () => {
      const response = await request(app)
        .get('/api/get-story/507f1f77bcf86cd799439011')
        .expect(404);

      expect(response.body.error).toBe('故事不存在');
    });

    it('应该处理无效的ID格式', async () => {
      const response = await request(app)
        .get('/api/get-story/invalid-id')
        .expect(400);

      expect(response.body.error).toBeDefined();
    });
  });

  describe('DELETE /api/delete-story/:id', () => {
    it('应该成功删除存在的故事', async () => {
      const insertResult = await collection.insertOne({
        title: '待删除故事',
        content: '待删除内容',
        created_at: new Date(),
        updated_at: new Date()
      });

      const response = await request(app)
        .delete(`/api/delete-story/${insertResult.insertedId}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      
      const deleted = await collection.findOne({ _id: insertResult.insertedId });
      expect(deleted).toBeNull();
    });

    it('应该在故事不存在时返回404', async () => {
      const response = await request(app)
        .delete('/api/delete-story/507f1f77bcf86cd799439011')
        .expect(404);

      expect(response.body.error).toBe('要删除的故事不存在');
    });

    it('应该处理无效的ID格式', async () => {
      const response = await request(app)
        .delete('/api/delete-story/invalid-id')
        .expect(400);

      expect(response.body.error).toBeDefined();
    });
  });
});