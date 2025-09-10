import { Router, Request, Response } from 'express';
import { 
  generateStoryService, 
  saveStoryService, 
  getStoriesService, 
  getStoryByIdService,
  generateFullStoryTreeService
} from '../services/storyService';
import type { 
  GenerateStoryRequest, 
  SaveStoryRequest,
  GenerateFullStoryRequest
} from '../types';

const router = Router();

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

    console.log(`正在为主题"${topic}"生成故事...`);
    
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
    console.error('生成故事失败:', error);
    
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

    console.log(`正在保存故事"${title}"...`);

    // 调用故事保存服务
    const result = await saveStoryService({
      title: title.trim(),
      content: content.trim()
    });

    res.json(result);
  } catch (error: any) {
    console.error('保存故事失败:', error);
    
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
    console.log('正在获取故事列表...');
    
    // 调用故事列表服务
    const result = await getStoriesService();
    
    res.json(result);
  } catch (error: any) {
    console.error('获取故事列表失败:', error);
    
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

    console.log(`正在获取故事详情, ID: ${id}`);
    
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
    console.error('获取故事详情失败:', error);
    
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

    console.log(`正在为主题"${topic}"生成完整故事树...`);
    
    // 调用故事树生成服务
    const result = await generateFullStoryTreeService({
      topic: topic.trim()
    });

    res.json(result);
  } catch (error: any) {
    console.error('生成故事树失败:', error);
    
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

// GET /api/tts - 语音合成接口（占位）
router.get('/tts', (req: Request, res: Response) => {
  res.status(501).json({
    error: '语音合成功能尚未实现',
    message: '此接口为未来功能预留，可集成百度TTS、讯飞语音等中文TTS服务',
    code: 'NOT_IMPLEMENTED'
  });
});

export default router;
