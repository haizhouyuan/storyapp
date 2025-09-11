import { generateStoryService, saveStoryService, getStoriesService, getStoryByIdService, deleteStoryService } from '../../src/services/storyService';
import { getConnectionForTesting } from '../../src/config/database';
import { MongoClient, Db, Collection } from 'mongodb';

describe('Story Service', () => {
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

  describe('generateStoryService', () => {
    it('应该生成故事内容', async () => {
      const result = await generateStoryService({ topic: '小兔子的冒险' });
      
      expect(result).toBeDefined();
      expect(result.storySegment).toBeDefined();
      expect(result.choices).toBeDefined();
      expect(Array.isArray(result.choices)).toBe(true);
      expect(result.choices.length).toBeGreaterThan(0);
      expect(result.choices.length).toBeLessThanOrEqual(6);
    });

    it('应该处理空主题', async () => {
      await expect(generateStoryService({ topic: '' })).rejects.toThrow();
    });

    it('应该处理超长主题', async () => {
      const longTopic = 'a'.repeat(1000);
      const result = await generateStoryService({ topic: longTopic });
      expect(result).toBeDefined();
    });
  });

  describe('saveStoryService', () => {
    it('应该成功保存故事', async () => {
      const storyData = {
        title: '测试故事',
        content: JSON.stringify({
          storySegment: '从前有一只小兔子...',
          choices: ['选择1', '选择2']
        })
      };

      const result = await saveStoryService(storyData);
      
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.storyId).toBeDefined();
      
      const saved = await collection.findOne({ title: storyData.title });
      expect(saved).toBeDefined();
      expect(saved?.title).toBe(storyData.title);
      expect(saved?.content).toBe(storyData.content);
      expect(saved?.created_at).toBeDefined();
      expect(saved?.updated_at).toBeDefined();
    });

    it('应该处理缺少标题的情况', async () => {
      const storyData = {
        title: '',
        content: '测试内容'
      };

      await expect(saveStoryService(storyData)).rejects.toThrow();
    });

    it('应该处理缺少内容的情况', async () => {
      const storyData = {
        title: '测试标题',
        content: ''
      };

      await expect(saveStoryService(storyData)).rejects.toThrow();
    });
  });

  describe('getStoriesService', () => {
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
        },
        {
          title: '故事3',
          content: '内容3',
          created_at: new Date('2024-01-03'),
          updated_at: new Date('2024-01-03')
        }
      ];
      await collection.insertMany(testStories);
    });

    it('应该返回按创建时间降序排列的故事列表', async () => {
      const stories = await getStoriesService();
      
      expect(stories).toBeDefined();
      expect(stories.stories).toBeDefined();
      expect(Array.isArray(stories.stories)).toBe(true);
      expect(stories.stories.length).toBe(3);
      expect(stories.stories[0].title).toBe('故事3');
      expect(stories.stories[1].title).toBe('故事2');
      expect(stories.stories[2].title).toBe('故事1');
    });

    it('应该返回空数组当没有故事时', async () => {
      await collection.deleteMany({});
      const stories = await getStoriesService();
      
      expect(stories).toBeDefined();
      expect(stories.stories).toBeDefined();
      expect(Array.isArray(stories.stories)).toBe(true);
      expect(stories.stories.length).toBe(0);
    });
  });

  describe('getStoryByIdService', () => {
    it('应该根据ID返回单个故事', async () => {
      const insertResult = await collection.insertOne({
        title: '测试故事',
        content: '测试内容',
        created_at: new Date(),
        updated_at: new Date()
      });

      const story = await getStoryByIdService(insertResult.insertedId.toString());
      
      expect(story).toBeDefined();
      expect(story?.title).toBe('测试故事');
      expect(story?.content).toBe('测试内容');
    });

    it('应该在故事不存在时返回null', async () => {
      const story = await getStoryByIdService('507f1f77bcf86cd799439011');
      expect(story).toBeNull();
    });

    it('应该处理无效的ID格式', async () => {
      await expect(getStoryByIdService('invalid-id')).rejects.toThrow();
    });
  });

  describe('deleteStoryService', () => {
    it('应该成功删除存在的故事', async () => {
      const insertResult = await collection.insertOne({
        title: '待删除故事',
        content: '待删除内容',
        created_at: new Date(),
        updated_at: new Date()
      });

      const result = await deleteStoryService({ id: insertResult.insertedId.toString() });
      
      expect(result.success).toBe(true);
      
      const deleted = await collection.findOne({ _id: insertResult.insertedId });
      expect(deleted).toBeNull();
    });

    it('应该在故事不存在时返回deletedCount为0', async () => {
      const result = await deleteStoryService({ id: '507f1f77bcf86cd799439011' });
      expect(result.success).toBe(false);
    });

    it('应该处理无效的ID格式', async () => {
      await expect(deleteStoryService({ id: 'invalid-id' })).rejects.toThrow();
    });
  });
});