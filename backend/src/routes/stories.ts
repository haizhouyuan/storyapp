import { Router, Request, Response } from 'express';
import { 
  generateStoryService, 
  saveStoryService, 
  getStoriesService, 
  getStoryByIdService,
  deleteStoryService,
  generateFullStoryTreeService
} from '../services/storyService';
import type { 
  GenerateStoryRequest, 
  SaveStoryRequest,
  GenerateFullStoryRequest
} from '../types';
import { createLogger } from '../config/logger';

const router = Router();
const storiesLogger = createLogger('routes:stories');

// POST /api/generate-story - 生成故事片段
router.post('/generate-story', async (req: Request, res: Response) => {
  try {
    const { topic, currentStory, selectedChoice, turnIndex, maxChoices, forceEnding }: GenerateStoryRequest = req.body;

    // 参数验证
    if (!topic || typeof topic !== 'string' || topic.trim().length === 0) {
      return res.status(400).json({
        error: '请提供有效的故事主题',
        code: 'INVALID_TOPIC'
      });
    }

    if (topic.length > 100) {
      return res.status(400).json({
        error: '故事主题不能超过100个字符',
        code: 'TOPIC_TOO_LONG'
      });
    }

    storiesLogger.info({ topic }, '开始生成故事片段');
    
    // 调用故事生成服务
    const result = await generateStoryService({
      topic: topic.trim(),
      currentStory,
      selectedChoice,
      turnIndex,
      maxChoices,
      forceEnding
    });

    res.json(result);
  } catch (error: any) {
    storiesLogger.error({ err: error, topic: req.body?.topic }, '生成故事失败');

    if (error.code === 'DEEPSEEK_CONFIG_ERROR') {
      return res.status(503).json({
        error: 'AI 服务配置缺失，请联系管理员',
        code: 'SERVICE_CONFIGURATION_ERROR'
      });
    }
    
    if (error.code === 'DEEPSEEK_API_ERROR') {
      return res.status(503).json({
        error: '故事生成服务暂时不可用，请稍后再试',
        code: 'SERVICE_UNAVAILABLE'
      });
    }
    
    res.status(500).json({
      error: '生成故事时发生错误，请稍后再试',
      code: 'INTERNAL_ERROR'
    });
  }
});

// POST /api/save-story - 保存完整故事
router.post('/save-story', async (req: Request, res: Response) => {
  try {
    const { title, content }: SaveStoryRequest = req.body;

    // 参数验证
    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return res.status(400).json({
        error: '请提供故事标题',
        code: 'INVALID_TITLE'
      });
    }

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return res.status(400).json({
        error: '请提供故事内容',
        code: 'INVALID_CONTENT'
      });
    }

    if (title.length > 200) {
      return res.status(400).json({
        error: '故事标题不能超过200个字符',
        code: 'TITLE_TOO_LONG'
      });
    }

    storiesLogger.info({ title }, '开始保存故事');

    // 调用故事保存服务
    const result = await saveStoryService({
      title: title.trim(),
      content: content.trim()
    });

    res.json(result);
  } catch (error: any) {
    storiesLogger.error({ err: error, title: req.body?.title }, '保存故事失败');
    
    if (error.code === 'DATABASE_ERROR') {
      return res.status(503).json({
        error: '数据库服务暂时不可用，请稍后再试',
        code: 'SERVICE_UNAVAILABLE'
      });
    }
    
    res.status(500).json({
      error: '保存故事时发生错误，请稍后再试',
      code: 'INTERNAL_ERROR'
    });
  }
});

// GET /api/get-stories - 获取故事列表
router.get('/get-stories', async (req: Request, res: Response) => {
  try {
    storiesLogger.info('开始获取故事列表');
    
    // 调用故事列表服务
    const result = await getStoriesService();
    
    res.json(result);
  } catch (error: any) {
    storiesLogger.error({ err: error }, '获取故事列表失败');
    
    if (error.code === 'DATABASE_ERROR') {
      return res.status(503).json({
        error: '数据库服务暂时不可用，请稍后再试',
        code: 'SERVICE_UNAVAILABLE'
      });
    }
    
    res.status(500).json({
      error: '获取故事列表时发生错误，请稍后再试',
      code: 'INTERNAL_ERROR'
    });
  }
});

// GET /api/get-story/:id - 获取单个故事详情
router.get('/get-story/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // 参数验证
    if (!id || typeof id !== 'string') {
      return res.status(400).json({
        error: '请提供有效的故事ID',
        code: 'INVALID_STORY_ID'
      });
    }

    storiesLogger.info({ storyId: id }, '开始获取故事详情');
    
    // 调用故事详情服务
    const result = await getStoryByIdService(id);
    
    if (!result) {
      return res.status(404).json({
        error: '故事不存在',
        code: 'STORY_NOT_FOUND'
      });
    }
    
    res.json(result);
  } catch (error: any) {
    storiesLogger.error({ err: error, storyId: req.params?.id }, '获取故事详情失败');
    
    // 检查是否是无效ID格式错误
    if (error.message === '无效的故事ID格式') {
      return res.status(400).json({
        error: '无效的故事ID格式',
        code: 'INVALID_ID_FORMAT'
      });
    }
    
    if (error.code === 'DATABASE_ERROR') {
      return res.status(503).json({
        error: '数据库服务暂时不可用，请稍后再试',
        code: 'SERVICE_UNAVAILABLE'
      });
    }
    
    res.status(500).json({
      error: '获取故事详情时发生错误，请稍后再试',
      code: 'INTERNAL_ERROR'
    });
  }
});

// DELETE /api/delete-story/:id - 删除故事
router.delete('/delete-story/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // 参数验证
    if (!id || typeof id !== 'string') {
      return res.status(400).json({
        error: '请提供有效的故事ID',
        code: 'INVALID_STORY_ID'
      });
    }

    storiesLogger.info({ storyId: id }, '开始删除故事');
    
    // 调用故事删除服务
    const result = await deleteStoryService({ id });
    
    res.json(result);
  } catch (error: any) {
    storiesLogger.error({ err: error, storyId: req.params?.id }, '删除故事失败');
    
    // 检查是否是无效ID格式错误
    if (error.message === '无效的故事ID格式') {
      return res.status(400).json({
        error: '无效的故事ID格式',
        code: 'INVALID_ID_FORMAT'
      });
    }
    
    if (error.code === 'STORY_NOT_FOUND') {
      return res.status(404).json({
        error: '要删除的故事不存在',
        code: 'STORY_NOT_FOUND'
      });
    }
    
    if (error.code === 'DATABASE_ERROR') {
      return res.status(503).json({
        error: '数据库服务暂时不可用，请稍后再试',
        code: 'SERVICE_UNAVAILABLE'
      });
    }
    
    res.status(500).json({
      error: '删除故事时发生错误，请稍后再试',
      code: 'INTERNAL_ERROR'
    });
  }
});

// POST /api/generate-full-story - 生成完整故事树
router.post('/generate-full-story', async (req: Request, res: Response) => {
  try {
    const { topic }: GenerateFullStoryRequest = req.body;

    // 参数验证
    if (!topic || typeof topic !== 'string' || topic.trim().length === 0) {
      return res.status(400).json({
        error: '请提供有效的故事主题',
        code: 'INVALID_TOPIC'
      });
    }

    if (topic.length > 100) {
      return res.status(400).json({
        error: '故事主题不能超过100个字符',
        code: 'TOPIC_TOO_LONG'
      });
    }

    storiesLogger.info({ topic }, '开始生成完整故事树');
    
    // 调用故事树生成服务
    const result = await generateFullStoryTreeService({
      topic: topic.trim()
    });

    res.json(result);
  } catch (error: any) {
    storiesLogger.error({ err: error, topic: req.body?.topic }, '生成故事树失败');

    if (error.code === 'DEEPSEEK_CONFIG_ERROR') {
      return res.status(503).json({
        error: 'AI 服务配置缺失，请联系管理员',
        code: 'SERVICE_CONFIGURATION_ERROR'
      });
    }
    
    if (error.code === 'STORY_TREE_GENERATION_ERROR') {
      return res.status(503).json({
        error: '故事树生成服务暂时不可用，请稍后再试',
        code: 'SERVICE_UNAVAILABLE'
      });
    }
    
    res.status(500).json({
      error: '生成故事树时发生错误，请稍后再试',
      code: 'INTERNAL_ERROR'
    });
  }
});

export default router;
