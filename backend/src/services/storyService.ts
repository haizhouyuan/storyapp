import { ObjectId } from 'mongodb';
import { getDatabase, TABLES } from '../config/database';
import {
  StoryDocument,
  createStoryDocument,
  validateStoryDocument,
  storyDocumentToResponse,
  requestToStoryDocument,
} from '../models/Story';
import {
  deepseekClient,
  DEEPSEEK_CONFIG,
  STORY_SYSTEM_PROMPT,
  STORY_CONTINUE_PROMPT,
  STORY_TREE_SYSTEM_PROMPT,
  STORY_TREE_NODE_PROMPT,
  STORY_PLANNING_PROMPT,
  STORY_WRITING_PROMPT,
  STORY_REVIEW_PROMPT,
  isDeepseekApiKeyValid,
} from '../config/deepseek';
import {
  logger,
  createSession,
  endSession,
  LogLevel,
  EventType,
  logAIApiCall,
  logPerformance,
} from '../utils/logger';
import type { PerformanceMetrics } from '../types';
import type {
  GenerateStoryRequest,
  GenerateStoryResponse,
  SaveStoryRequest,
  SaveStoryResponse,
  GetStoriesResponse,
  GetStoryResponse,
  DeleteStoryRequest,
  DeleteStoryResponse,
  GenerateFullStoryRequest,
  GenerateFullStoryResponse,
  StoryTree,
  StoryTreeNode,
} from '../types';

type GenerationMode = 'mock' | 'live';

function resolveGenerationMode(): GenerationMode {
  const nodeEnv = process.env.NODE_ENV || 'development';
  const hasValidKey = isDeepseekApiKeyValid();

  if (!hasValidKey) {
    if (nodeEnv === 'production') {
      const configError = new Error('DeepSeek API Key 缺失或无效，请检查生产环境配置');
      (configError as any).code = 'DEEPSEEK_CONFIG_ERROR';
      throw configError;
    }

    logger.warn(EventType.STORY_GENERATION_START, 'DeepSeek API Key 缺失或无效，使用 Mock 模式', {
      nodeEnv,
      hasKey: !!process.env.DEEPSEEK_API_KEY,
    });
    return 'mock';
  }

  if (nodeEnv === 'test' && process.env.DEEPSEEK_USE_REAL !== 'true') {
    return 'mock';
  }

  return 'live';
}

function extractJson(content: string): any {
  const cleaned = String(content || '')
    .replace(/```json\n?/gi, '')
    .replace(/```\n?/g, '')
    .trim();
  // First try direct parse
  try {
    return JSON.parse(cleaned);
  } catch {}
  // Try to locate a JSON object within text
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    const candidate = cleaned.slice(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(candidate);
    } catch {}
  }
  throw new Error('无法从模型输出中解析有效JSON');
}

/**
 * 生成故事片段服务
 */
export async function generateStoryService(params: GenerateStoryRequest): Promise<GenerateStoryResponse> {
  // 创建会话记录
  const sessionId = createSession(params.topic, 'progressive', params);
  const startTime = Date.now();
  
  try {
    const { topic: rawTopic, currentStory, selectedChoice, turnIndex, maxChoices, forceEnding } = params;
    let topic = (rawTopic || '').trim();
    
    // 验证输入参数
    if (!topic) {
      const customError = new Error('story_topic_required');
      (customError as any).code = 'VALIDATION_ERROR';
      throw customError;
    }
    
    // 加强输入验证：主题长度限制，超出时自动截断
    if (topic.length > 100) {
      logger.warn(EventType.STORY_GENERATION_START, '故事主题过长，已自动截断', {
        originalLength: topic.length,
        truncatedLength: 100
      }, sessionId);

      topic = topic.slice(0, 100);
    }
    
    // 儿童内容安全检查：过滤不适当关键词
    const inappropriateKeywords = [
      '暴力', '打架', '血', '死亡', '杀', '恐怖', '害怕', '鬼', '吓人',
      '战争', '武器', '刀', '枪', '炸', '毒', '酒', '烟', '赌博'
    ];
    const lowerTopic = topic.toLowerCase();
    const foundInappropriate = inappropriateKeywords.find(keyword => 
      lowerTopic.includes(keyword) || topic.includes(keyword)
    );
    
    if (foundInappropriate) {
      const customError = new Error(`story_topic_inappropriate: ${foundInappropriate}`);
      (customError as any).code = 'CONTENT_SAFETY_ERROR';
      throw customError;
    }
    
    let generationMode: GenerationMode;
    try {
      generationMode = resolveGenerationMode();
    } catch (configError) {
      logger.error(
        EventType.STORY_GENERATION_ERROR,
        'DeepSeek 配置无效，无法生成真实故事',
        configError as Error,
        {
          nodeEnv: process.env.NODE_ENV,
        },
        sessionId,
      );
      throw configError;
    }

    if (generationMode === 'mock') {
      logger.info(
        EventType.STORY_GENERATION_START,
        '使用Mock模式生成故事',
        {
          reason: 'API key 缺失或测试环境',
          nodeEnv: process.env.NODE_ENV,
          hasApiKey: !!process.env.DEEPSEEK_API_KEY,
        },
        undefined,
        sessionId,
      );

      const mockResponse = generateMockStoryResponse(
        topic,
        currentStory,
        selectedChoice,
        turnIndex,
        maxChoices,
        forceEnding,
      );

      logger.info(
        EventType.STORY_GENERATION_COMPLETE,
        'Mock故事生成完成',
        {
          storyLength: mockResponse.storySegment.length,
          choicesCount: mockResponse.choices.length,
          isEnding: mockResponse.isEnding,
          success: true,
        },
        {
          startTime,
          endTime: Date.now(),
          duration: Date.now() - startTime,
        },
        sessionId,
      );

      endSession(sessionId, true);
      return mockResponse;
    }
    
    logger.info(EventType.STORY_GENERATION_START, '开始生成故事片段', {
      topic,
      isNewStory: !currentStory,
      turnIndex,
      maxChoices,
      forceEnding,
      selectedChoice
    }, { startTime }, sessionId);
    
    // 构造给DeepSeek的消息
    const messages = [
      {
        role: 'system',
        content: STORY_SYSTEM_PROMPT
      }
    ];

    // 根据是否是继续故事来构造用户消息
    if (currentStory && selectedChoice) {
      // 继续现有故事
      logger.debug(EventType.STORY_GENERATION_START, '继续现有故事', {
        currentStoryLength: currentStory.length,
        selectedChoice,
        turnIndex
      }, sessionId);
      
      messages.push({
        role: 'user',
        content: STORY_CONTINUE_PROMPT(
          topic,
          currentStory,
          selectedChoice,
          turnIndex,
          maxChoices,
          forceEnding
        )
      });
    } else {
      // 开始新故事 - 使用更详细的提示确保足够长度
      logger.debug(EventType.STORY_GENERATION_START, '开始新故事', {
        topic,
        expectedTurns: Math.max(5, Math.min(10, maxChoices || 6))
      }, sessionId);
      
      messages.push({
        role: 'user',
        content: `请为以下主题创作一个适合8-12岁儿童的睡前故事开头：${topic}。

要求：
1. 故事内容800-1200字，语言生动有趣，适合8-12岁儿童的认知水平
2. 包含丰富的场景描述、角色心理和细节刻画
3. 设定有挑战性和悬念的开头情境，激发孩子思考
4. 融入教育元素：科学知识、历史文化或道德品格
5. 提供3个具有策略性和思考性的选择，每个选择导向不同故事发展
6. 使用JSON格式返回：{"storySegment":"故事内容（800-1200字）","choices":["选择1","选择2","选择3"],"isEnding":false}

总互动次数预计为 ${Math.max(8, Math.min(15, maxChoices || 10))} 次，支持更复杂的故事发展。`
      });
    }

    logger.info(EventType.AI_API_REQUEST, '准备调用DeepSeek API', {
      model: DEEPSEEK_CONFIG.CHAT_MODEL,
      messagesCount: messages.length,
      promptLength: messages.reduce((sum, msg) => sum + msg.content.length, 0)
    }, undefined, sessionId);
    
    // 调用DeepSeek API
    const apiStartTime = Date.now();
    let response;
    let aiResponse: string;
    
    try {
      response = await deepseekClient.post('/chat/completions', {
        model: DEEPSEEK_CONFIG.CHAT_MODEL,
        messages,
        max_tokens: DEEPSEEK_CONFIG.MAX_TOKENS,
        temperature: DEEPSEEK_CONFIG.TEMPERATURE,
        stream: DEEPSEEK_CONFIG.STREAM
      });
      
      if (!response || !response.data || !response.data.choices || response.data.choices.length === 0) {
        throw new Error('DeepSeek API返回数据格式不正确');
      }
      
      const choice = response.data.choices[0];
      if (!choice || !choice.message || !choice.message.content) {
        throw new Error('DeepSeek API返回的消息内容格式不正确');
      }
      
      aiResponse = choice.message.content;
    } catch (error: any) {
      const apiDuration = Date.now() - apiStartTime;
      
      logger.error(EventType.AI_API_ERROR, 'DeepSeek API调用失败', error, {
        errorMessage: error.message,
        status: error.response?.status,
        duration: apiDuration
      }, sessionId);
      throw error;
    }
    
    const apiDuration = Date.now() - apiStartTime;
    
    // 简单的token估算
    const estimateTokens = (text: string): number => {
      const chineseCount = (text.match(/[\u4e00-\u9fff]/g) || []).length;
      const englishCount = text.length - chineseCount;
      return chineseCount + Math.ceil(englishCount / 4);
    };
    
    const tokensUsed = estimateTokens(JSON.stringify(messages)) + estimateTokens(aiResponse);
    
    // 记录API调用成功
    logAIApiCall(
      sessionId,
      DEEPSEEK_CONFIG.CHAT_MODEL,
      { messages, config: { max_tokens: DEEPSEEK_CONFIG.MAX_TOKENS, temperature: DEEPSEEK_CONFIG.TEMPERATURE } },
      { content: aiResponse },
      apiDuration,
      tokensUsed
    );

    // 解析AI返回的JSON（增强重试机制）
    logger.info(EventType.JSON_PARSE_START, '开始解析AI响应', {
      responseLength: aiResponse.length,
      responsePreview: aiResponse.substring(0, 100) + '...'
    }, undefined, sessionId);
    
    let parsedResponse;
    try {
      parsedResponse = extractJson(aiResponse);
      
      logger.info(EventType.JSON_PARSE_SUCCESS, 'JSON解析成功', {
        hasStorySegment: !!parsedResponse.storySegment,
        choicesCount: Array.isArray(parsedResponse.choices) ? parsedResponse.choices.length : 0,
        isEnding: !!parsedResponse.isEnding
      }, undefined, sessionId);
      
    } catch (parseError) {
      logger.error(EventType.JSON_PARSE_ERROR, 'JSON解析失败，尝试重新请求', parseError as Error, {
        originalResponse: aiResponse,
        parseError: (parseError as Error).message
      }, sessionId);
      
      // JSON解析失败时，尝试重新请求纯JSON格式
      try {
        logger.info(EventType.JSON_PARSE_START, '尝试JSON重试请求', {}, undefined, sessionId);
        
        const retryMessages = [
          { role: 'system', content: '请仅返回纯JSON格式，不要包含代码块标记或任何额外说明文字。' },
          { role: 'user', content: `请将以下内容转换为严格的JSON格式：\n\n${aiResponse}\n\n要求格式：{"storySegment": "故事内容", "choices": ["选择1", "选择2", "选择3"], "isEnding": false}` }
        ];
        
        const retryResponse = await deepseekClient.post('/chat/completions', {
          model: DEEPSEEK_CONFIG.CHAT_MODEL,
          messages: retryMessages,
          max_tokens: DEEPSEEK_CONFIG.MAX_TOKENS,
          temperature: 0.1, // 降低温度确保格式准确
          stream: DEEPSEEK_CONFIG.STREAM
        });
        
        const retryContent = retryResponse.data?.choices?.[0]?.message?.content;
        if (retryContent) {
          parsedResponse = extractJson(retryContent);
          logger.info(EventType.JSON_PARSE_SUCCESS, 'JSON重试解析成功', {
            hasStorySegment: !!parsedResponse.storySegment,
            choicesCount: Array.isArray(parsedResponse.choices) ? parsedResponse.choices.length : 0
          }, undefined, sessionId);
        } else {
          throw new Error('重试请求返回空内容');
        }
      } catch (retryError) {
        logger.error(EventType.JSON_PARSE_ERROR, 'JSON重试也失败，使用fallback策略', retryError as Error, sessionId);
        
        // 对于儿童应用，JSON解析失败时不使用原始AI响应
        // 而是抛出错误，确保内容安全性
        logger.error(EventType.JSON_PARSE_ERROR, 'JSON解析彻底失败，为确保儿童内容安全，拒绝使用原始响应', retryError as Error, sessionId);
        throw new Error('AI响应格式无效，无法安全解析，请重新尝试');
      }
    }

    // 验证响应格式
    logger.info(EventType.CONTENT_VALIDATION, '开始内容验证', {
      hasStorySegment: !!parsedResponse.storySegment,
      hasChoices: !!parsedResponse.choices,
      isEnding: !!parsedResponse.isEnding
    }, undefined, sessionId);
    
    if (!parsedResponse.storySegment) {
      logger.error(EventType.CONTENT_VALIDATION, 'AI响应缺少故事内容', undefined, {
        parsedResponse
      }, sessionId);
      throw new Error('AI响应缺少故事内容');
    }

    // 确保choices是数组且不超过3个
    if (!Array.isArray(parsedResponse.choices)) {
      logger.warn(EventType.CONTENT_VALIDATION, 'choices不是数组，使用默认选择', {
        originalChoices: parsedResponse.choices,
        defaultChoices: ['继续冒险', '返回起点', '寻找新路径']
      }, sessionId);
      parsedResponse.choices = ['继续冒险', '返回起点', '寻找新路径'];
    }
    
    // 限制选择数量为最多3个
    if (parsedResponse.choices.length > 3) {
      logger.warn(EventType.CONTENT_VALIDATION, '选择过多，截取前3个', {
        originalCount: parsedResponse.choices.length,
        originalChoices: parsedResponse.choices,
        trimmedChoices: parsedResponse.choices.slice(0, 3)
      }, sessionId);
      parsedResponse.choices = parsedResponse.choices.slice(0, 3);
    } else if (parsedResponse.choices.length < 3 && !parsedResponse.isEnding) {
      // 如果不是结尾且选择少于3个，补充默认选择
      const defaultChoices = ['继续故事', '换个方向', '寻求帮助'];
      const originalChoices = [...parsedResponse.choices];
      while (parsedResponse.choices.length < 3) {
        const nextDefault = defaultChoices[parsedResponse.choices.length];
        if (!parsedResponse.choices.includes(nextDefault)) {
          parsedResponse.choices.push(nextDefault);
        } else {
          parsedResponse.choices.push(`选择${parsedResponse.choices.length + 1}`);
        }
      }
      logger.warn(EventType.CONTENT_VALIDATION, '选择不足3个，补充默认选择', {
        originalChoices,
        supplementedChoices: parsedResponse.choices
      }, sessionId);
    }

    // 如果调用方要求强制结尾，则覆盖AI的返回，确保没有choices并标记isEnding
    if (forceEnding) {
      logger.info(EventType.CONTENT_VALIDATION, '强制结尾模式，移除选择', {
        originalIsEnding: parsedResponse.isEnding,
        originalChoices: parsedResponse.choices
      }, undefined, sessionId);
      parsedResponse.isEnding = true;
      parsedResponse.choices = [];
    }

    // 检查故事长度（仅记录日志，不进行二次调用避免超时）
    const plainLen = String(parsedResponse.storySegment || '').replace(/\s/g, '').length;
    logger.info(EventType.QUALITY_CHECK, '故事长度检查', {
      storyLength: plainLen,
      targetLength: 500,
      meetsTarget: plainLen >= 500,
      wordCount: parsedResponse.storySegment.length
    }, undefined, sessionId);
    
    if (plainLen < 500) {
      logger.warn(EventType.QUALITY_CHECK, '故事片段长度不足500字，但跳过扩展避免超时', {
        actualLength: plainLen,
        targetLength: 500,
        shortfall: 500 - plainLen
      }, sessionId);
    }

    // 记录生成完成
    const totalDuration = Date.now() - startTime;
    logger.info(EventType.STORY_GENERATION_COMPLETE, '故事片段生成完成', {
      storyLength: parsedResponse.storySegment.length,
      choicesCount: parsedResponse.choices.length,
      isEnding: parsedResponse.isEnding,
      success: true
    }, {
      startTime,
      endTime: Date.now(),
      duration: totalDuration
    }, sessionId);
    
    // 结束会话
    endSession(sessionId, true);
    
    return {
      storySegment: parsedResponse.storySegment,
      choices: parsedResponse.isEnding ? [] : parsedResponse.choices,
      isEnding: !!parsedResponse.isEnding
    };
  } catch (error: any) {
    // 记录错误
    const totalDuration = Date.now() - startTime;

    if ((error as any)?.code === 'DEEPSEEK_CONFIG_ERROR') {
      logger.error(
        EventType.STORY_GENERATION_ERROR,
        'DeepSeek 配置错误，生成流程终止',
        error,
        {
          duration: totalDuration,
        },
        sessionId,
      );
      endSession(sessionId, false);
      throw error;
    }
    
    if (error.response) {
      logger.error(EventType.AI_API_ERROR, 'DeepSeek API响应错误', error, {
        status: error.response.status,
        data: error.response.data,
        duration: totalDuration
      }, sessionId);
    } else {
      logger.error(EventType.STORY_GENERATION_ERROR, 'DeepSeek API调用失败', error, {
        duration: totalDuration,
        errorType: error.constructor.name
      }, sessionId);
    }
    
    // 结束会话（失败）
    endSession(sessionId, false);
    
    const customError = new Error('DeepSeek API调用失败');
    (customError as any).code = 'DEEPSEEK_API_ERROR';
    throw customError;
  }
}

/**
 * 保存故事服务
 */
export async function saveStoryService(params: SaveStoryRequest): Promise<SaveStoryResponse> {
  const sessionId = createSession(undefined, undefined, params);
  const startTime = Date.now();
  
  try {
    const { title, content } = params;
    
    logger.info(EventType.DB_SAVE_START, '开始保存故事到MongoDB', {
      title,
      contentLength: content.length,
      contentPreview: content.substring(0, 100) + '...'
    }, { startTime }, sessionId);
    
    // 创建故事文档
    const storyDoc = createStoryDocument(title, content);
    
    // 验证文档
    const validationErrors = validateStoryDocument(storyDoc);
    if (validationErrors.length > 0) {
      logger.error(EventType.CONTENT_VALIDATION, '数据验证失败', undefined, {
        validationErrors,
        storyDoc
      }, sessionId);
      throw new Error(`数据验证失败: ${validationErrors.join(', ')}`);
    }
    
    logger.debug(EventType.CONTENT_VALIDATION, '文档验证通过', {
      docSize: JSON.stringify(storyDoc).length,
      hasTitle: !!storyDoc.title,
      hasContent: !!storyDoc.content
    }, sessionId);
    
    // 获取数据库实例
    const db = getDatabase();
    const storiesCollection = db.collection(TABLES.STORIES);
    
    // 保存到MongoDB
    const dbStartTime = Date.now();
    const result = await storiesCollection.insertOne(storyDoc);
    const dbDuration = Date.now() - dbStartTime;
    
    if (!result.acknowledged || !result.insertedId) {
      logger.error(EventType.DB_SAVE_ERROR, '数据库插入操作未确认', undefined, {
        result,
        acknowledged: result.acknowledged,
        insertedId: result.insertedId
      }, sessionId);
      throw new Error('数据库插入操作未确认');
    }

    const totalDuration = Date.now() - startTime;
    logger.info(EventType.DB_SAVE_SUCCESS, '故事保存成功', {
      storyId: result.insertedId.toString(),
      title,
      success: true
    }, {
      startTime,
      endTime: Date.now(),
      duration: totalDuration
    }, sessionId);

    endSession(sessionId, true);

    return {
      success: true,
      storyId: result.insertedId.toString(),
      message: '故事已成功保存到"我的故事"中！'
    };
  } catch (error: any) {
    const totalDuration = Date.now() - startTime;
    
    logger.error(EventType.DB_SAVE_ERROR, '保存故事服务错误', error, {
      duration: totalDuration,
      errorType: error.constructor.name,
      originalErrorCode: error.code
    }, sessionId);
    
    endSession(sessionId, false);
    
    if (error.code === 'DATABASE_ERROR') {
      throw error;
    }
    
    const customError = new Error('保存故事失败');
    (customError as any).code = 'DATABASE_ERROR';
    throw customError;
  }
}

/**
 * 获取故事列表服务
 */
export async function getStoriesService(): Promise<GetStoriesResponse> {
  try {
    console.log('正在从MongoDB获取故事列表...');
    
    // 获取数据库实例
    const db = getDatabase();
    const storiesCollection = db.collection(TABLES.STORIES);
    
    // 从MongoDB查询故事列表，按创建时间倒序
    const storiesCursor = storiesCollection
      .find({})
      .sort({ created_at: -1 });
    
    const storiesData = await storiesCursor.toArray();

    // 处理返回数据，生成预览
    const stories = storiesData.map(story => ({
      id: story._id?.toString() || '',
      title: story.title,
      created_at: story.created_at.toISOString(),
      preview: generatePreview(story.content)
    }));

    console.log(`成功获取${stories.length}个故事`);

    return { stories };
  } catch (error: any) {
    console.error('获取故事列表服务错误:', error);
    
    if (error.code === 'DATABASE_ERROR') {
      throw error;
    }
    
    const customError = new Error('获取故事列表失败');
    (customError as any).code = 'DATABASE_ERROR';
    throw customError;
  }
}

/**
 * 获取单个故事详情服务
 */
export async function getStoryByIdService(id: string): Promise<GetStoryResponse | null> {
  try {
    console.log('正在从MongoDB获取故事详情...');
    
    // 验证ID格式
    if (!ObjectId.isValid(id)) {
      throw new Error('无效的故事ID格式');
    }
    
    // 获取数据库实例
    const db = getDatabase();
    const storiesCollection = db.collection(TABLES.STORIES);
    
    // 从MongoDB查询单个故事
    const story = await storiesCollection.findOne({ 
      _id: new ObjectId(id) 
    });

    if (!story) {
      // 记录不存在
      return null;
    }

    console.log(`成功获取故事详情, ID: ${id}`);

    return {
      id: story._id?.toString() || '',
      title: story.title,
      content: story.content,
      created_at: story.created_at.toISOString()
    };
  } catch (error: any) {
    console.error('获取故事详情服务错误:', error);
    
    // 如果是验证错误，直接抛出
    if (error.message === '无效的故事ID格式') {
      throw error;
    }
    
    if (error.code === 'DATABASE_ERROR') {
      throw error;
    }
    
    const customError = new Error('获取故事详情失败');
    (customError as any).code = 'DATABASE_ERROR';
    throw customError;
  }
}

/**
 * 删除故事服务
 */
export async function deleteStoryService(params: DeleteStoryRequest): Promise<DeleteStoryResponse> {
  try {
    const { id } = params;
    
    console.log(`正在删除故事, ID: ${id}`);
    
    // 验证ID格式
    if (!ObjectId.isValid(id)) {
      throw new Error('无效的故事ID格式');
    }
    
    // 获取数据库实例
    const db = getDatabase();
    const storiesCollection = db.collection(TABLES.STORIES);
    
    // 先检查故事是否存在
    const existingStory = await storiesCollection.findOne({ 
      _id: new ObjectId(id) 
    });

    if (!existingStory) {
      throw new Error('要删除的故事不存在');
    }

    // 从MongoDB删除故事
    const result = await storiesCollection.deleteOne({ 
      _id: new ObjectId(id) 
    });

    if (result.deletedCount === 0) {
      throw new Error('故事删除失败');
    }

    console.log(`故事删除成功, ID: ${id}`);

    return {
      success: true,
      message: '故事已成功删除'
    };
  } catch (error: any) {
    console.error('删除故事服务错误:', error);
    
    // 如果是验证错误，直接抛出
    if (error.message === '无效的故事ID格式') {
      throw error;
    }
    
    if (error.message === '要删除的故事不存在') {
      const customError = new Error('要删除的故事不存在');
      (customError as any).code = 'STORY_NOT_FOUND';
      throw customError;
    }
    
    if (error.code === 'DATABASE_ERROR') {
      throw error;
    }
    
    const customError = new Error('删除故事失败');
    (customError as any).code = 'DATABASE_ERROR';
    throw customError;
  }
}

/**
 * 生成完整故事树服务（增强版 - 双模型协作）
 */
export async function generateFullStoryTreeService(params: GenerateFullStoryRequest): Promise<GenerateFullStoryResponse> {
  try {
    const { topic } = params;
    
    console.log(`开始生成完整故事树，主题: ${topic}`);
    
    let generationMode: GenerationMode;
    try {
      generationMode = resolveGenerationMode();
    } catch (configError) {
      console.error('DeepSeek 配置无效，无法生成真实故事树', configError);
      throw configError;
    }

    if (generationMode === 'mock') {
      console.log('使用Mock模式生成故事树');
      const storyTreeId = new ObjectId().toString();
      const timestamp = new Date().toISOString();
      return generateMockStoryTree(topic, storyTreeId, timestamp);
    }
    
    // 默认启用高级模式（三阶段协作），超时或失败时降级到基础模式
    try {
      console.log('尝试使用高级三阶段生成模式...');
      return await generateAdvancedStoryTree(topic);
    } catch (advancedError) {
      console.warn('高级模式失败，降级到基础模式:', advancedError);
      return await generateBasicStoryTreeService({ topic });
    }
    
  } catch (error: any) {
    console.error('故事树生成失败:', error);
    if ((error as any)?.code === 'DEEPSEEK_CONFIG_ERROR') {
      throw error;
    }

    const customError = new Error('故事树生成失败');
    (customError as any).code = 'STORY_TREE_GENERATION_ERROR';
    throw customError;
  }
}

/**
 * 使用双模型协作生成高质量故事树
 */
async function generateAdvancedStoryTree(topic: string): Promise<GenerateFullStoryResponse> {
  const storyTreeId = new ObjectId().toString();
  const timestamp = new Date().toISOString();
  
  console.log('Phase 1: 使用思考模式进行故事规划...');
  
  // Phase 1: 使用思考模式进行深度故事规划
  const storyOutline = await callDeepSeekReasoner(
    STORY_PLANNING_PROMPT,
    `为主题"${topic}"设计完整的儿童故事树结构`
  );
  
  console.log('Phase 2: 使用快速模式进行内容创作...');
  
  // Phase 2: 基于规划，使用快速模式创作各个片段
  const storyNodes = await generateStoryNodesWithOutline(topic, storyOutline);
  
  console.log('Phase 3: 使用思考模式进行质量检查...');
  
  // Phase 3: 使用思考模式对每个片段进行质量检查
  const reviewedNodes = await reviewAndRefineNodes(storyNodes);
  
  // 组装最终故事树
  const storyTree = assembleStoryTree(storyTreeId, topic, timestamp, reviewedNodes);
  
  return {
    success: true,
    storyTree,
    message: '高质量故事树生成完成！'
  };
}

/**
 * 调用DeepSeek思考模式
 */
async function callDeepSeekReasoner(systemPrompt: string, userMessage: string): Promise<any> {
  let response;
  try {
    response = await deepseekClient.post('/chat/completions', {
      model: DEEPSEEK_CONFIG.REASONER_MODEL,
      messages: [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'user', 
          content: userMessage
        }
      ],
      max_tokens: DEEPSEEK_CONFIG.MAX_TOKENS,
      temperature: DEEPSEEK_CONFIG.TEMPERATURE,
      stream: DEEPSEEK_CONFIG.STREAM
    });
    
    if (!response || !response.data || !response.data.choices || response.data.choices.length === 0) {
      throw new Error('DeepSeek Reasoner API返回数据格式不正确');
    }
    
    const choice = response.data.choices[0];
    if (!choice || !choice.message || !choice.message.content) {
      throw new Error('DeepSeek Reasoner API返回的消息内容格式不正确');
    }
    
    const content = choice.message.content;
    try {
      return extractJson(content);
    } catch (parseError) {
      console.error('解析Reasoner响应失败:', parseError, '原始输出片段:', String(content).slice(0, 200));
      throw new Error('思考模式响应格式解析失败');
    }
  } catch (error: any) {
    console.error('DeepSeek Reasoner API调用失败:', error.message);
    throw error;
  }
}

/**
 * 调用DeepSeek快速模式
 */
async function callDeepSeekChat(systemPrompt: string, userMessage: string): Promise<any> {
  let response;
  try {
    response = await deepseekClient.post('/chat/completions', {
      model: DEEPSEEK_CONFIG.CHAT_MODEL,
      messages: [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'user',
          content: userMessage
        }
      ],
      max_tokens: DEEPSEEK_CONFIG.MAX_TOKENS,
      temperature: DEEPSEEK_CONFIG.TEMPERATURE,
      stream: DEEPSEEK_CONFIG.STREAM
    });
    
    if (!response || !response.data || !response.data.choices || response.data.choices.length === 0) {
      throw new Error('DeepSeek Chat API返回数据格式不正确');
    }
    
    const choice = response.data.choices[0];
    if (!choice || !choice.message || !choice.message.content) {
      throw new Error('DeepSeek Chat API返回的消息内容格式不正确');
    }
    
    const content = choice.message.content;
    try {
      return extractJson(content);
    } catch (parseError) {
      console.error('解析Chat响应失败:', parseError, '原始输出片段:', String(content).slice(0, 200));
      throw new Error('快速模式响应格式解析失败');
    }
  } catch (error: any) {
    console.error('DeepSeek Chat API调用失败:', error.message);
    throw error;
  }
}

/**
 * 基于大纲生成故事节点
 */
async function generateStoryNodesWithOutline(topic: string, outline: any): Promise<StoryTreeNode[]> {
  const nodes: StoryTreeNode[] = [];
  const outlineStr = JSON.stringify(outline, null, 2);
  
  // 生成开头节点
  console.log('生成故事开头...');
  const openingContent = await callDeepSeekChat(
    '你是专业的儿童故事作家，请根据规划创作故事内容。',
    STORY_WRITING_PROMPT(outlineStr, 'opening', `主题：${topic}`)
  );
  
  const rootNode: StoryTreeNode = {
    id: new ObjectId().toString(),
    segment: openingContent.segment,
    choices: openingContent.choices || outline.story_outline.first_choices,
    children: [],
    isEnding: false,
    depth: 0,
    path: ''
  };
  nodes.push(rootNode);
  
  // 生成第二层和第三层节点
  const branches = outline.story_outline.branches || [];
  const secondLevelNodes: StoryTreeNode[] = [];
  
  for (let i = 0; i < branches.length; i++) {
    const branch = branches[i];
    
    console.log(`生成第二层节点 ${i + 1}...`);
    const branchContent = await callDeepSeekChat(
      '你是专业的儿童故事作家，请根据规划创作故事内容。',
      STORY_WRITING_PROMPT(outlineStr, 'branch', `分支：${branch.development}`)
    );
    
    const secondLevelNode: StoryTreeNode = {
      id: new ObjectId().toString(),
      segment: branchContent.segment,
      choices: branchContent.choices || branch.second_choices,
      children: [],
      isEnding: false,
      depth: 1,
      path: i.toString()
    };
    
    // 为每个第二层节点生成结局
    const endingNodes: StoryTreeNode[] = [];
    for (let j = 0; j < 2; j++) {
      console.log(`生成结局 ${i}-${j}...`);
      const endingContent = await callDeepSeekChat(
        '你是专业的儿童故事作家，请根据规划创作故事内容。',
        STORY_WRITING_PROMPT(outlineStr, 'ending', `结局概要：${branch.endings[j]}`)
      );
      
      const endingNode: StoryTreeNode = {
        id: new ObjectId().toString(),
        segment: endingContent.segment,
        choices: [],
        children: undefined,
        isEnding: true,
        depth: 2,
        path: `${i}-${j}`
      };
      endingNodes.push(endingNode);
      nodes.push(endingNode);
    }
    
    secondLevelNode.children = endingNodes;
    secondLevelNodes.push(secondLevelNode);
    nodes.push(secondLevelNode);
  }
  
  rootNode.children = secondLevelNodes;
  
  return nodes;
}

/**
 * 使用思考模式检查和优化节点内容
 */
async function reviewAndRefineNodes(nodes: StoryTreeNode[]): Promise<StoryTreeNode[]> {
  const reviewedNodes: StoryTreeNode[] = [];
  
  for (const node of nodes) {
    console.log(`检查节点质量：深度${node.depth}，路径${node.path}...`);
    
    try {
      const review = await callDeepSeekReasoner(
        '你是专业的儿童故事编辑，请检查故事内容质量。',
        STORY_REVIEW_PROMPT(node.segment, 500)
      );
      
      if (review.approved && review.word_count >= 500) {
        console.log(`节点通过检查，质量分数：${review.quality_score}/10`);
        reviewedNodes.push(node);
      } else {
        console.log(`节点需要改进：${review.issues.join(', ')}`);
        
        // 尝试改进内容
        const improvedContent = await callDeepSeekChat(
          '请改进以下故事内容，确保达到500字并提高质量。',
          `原内容：${node.segment}\n\n改进建议：${review.suggestions.join('; ')}\n\n请返回JSON格式：{"segment": "改进后的内容", "choices": ${JSON.stringify(node.choices)}, "isEnding": ${node.isEnding}}`
        );
        
        const improvedNode: StoryTreeNode = {
          ...node,
          segment: improvedContent.segment
        };
        
        console.log(`内容已改进，重新检查中...`);
        reviewedNodes.push(improvedNode);
      }
    } catch (error) {
      console.warn(`节点检查失败，使用原内容：`, error);
      reviewedNodes.push(node);
    }
  }
  
  return reviewedNodes;
}

/**
 * 组装最终故事树
 */
function assembleStoryTree(id: string, topic: string, timestamp: string, nodes: StoryTreeNode[]): StoryTree {
  // 找到根节点
  const rootNode = nodes.find(n => n.depth === 0);
  if (!rootNode) {
    throw new Error('未找到根节点');
  }
  
  // 重新建立节点关系
  const secondLevelNodes = nodes.filter(n => n.depth === 1);
  const endingNodes = nodes.filter(n => n.depth === 2);
  
  secondLevelNodes.forEach(secondNode => {
    const children = endingNodes.filter(endNode => 
      endNode.path.startsWith(secondNode.path + '-')
    );
    secondNode.children = children;
  });
  
  rootNode.children = secondLevelNodes;
  
  return {
    id,
    topic,
    root: rootNode,
    created_at: timestamp,
    totalPaths: 4,
    maxDepth: 2
  };
}

/**
 * 生成完整故事树服务（原始版本 - 保持向下兼容）
 */
export async function generateBasicStoryTreeService(params: GenerateFullStoryRequest): Promise<GenerateFullStoryResponse> {
  try {
    const { topic } = params;
    
    console.log(`开始生成完整故事树，主题: ${topic}`);
    
    // 生成故事树ID
    const storyTreeId = new ObjectId().toString();
    const timestamp = new Date().toISOString();

    // 智能API Key检查与Mock模式降级
    let generationMode: GenerationMode;
    try {
      generationMode = resolveGenerationMode();
    } catch (configError) {
      console.error('DeepSeek 配置无效，无法生成基础故事树', configError);
      throw configError;
    }

    if (generationMode === 'mock') {
      console.log('使用Mock模式生成基础故事树');
      return generateMockStoryTree(topic, storyTreeId, timestamp);
    }
    
    // 使用渐进式生成策略：先生成根节点，再分别生成各个分支
    // 这样可以确保故事的连贯性，避免一次性生成导致内容不一致
    
    // Step 1: 生成根节点
    console.log('生成根节点...');
    const rootNode = await generateStoryTreeNode(topic, '', '', 0, false, '');
    
    // Step 2: 生成第二层节点（2个）
    console.log('生成第二层节点...');
    const secondLevelNodes = await Promise.all([
      generateStoryTreeNode(topic, rootNode.segment, rootNode.choices[0], 1, false, '0'),
      generateStoryTreeNode(topic, rootNode.segment, rootNode.choices[1], 1, false, '1')
    ]);
    
    // Step 3: 生成第三层节点（4个结局）
    console.log('生成第三层节点（结局）...');
    const thirdLevelNodes = await Promise.all([
      generateStoryTreeNode(topic, secondLevelNodes[0].segment, secondLevelNodes[0].choices[0], 2, true, '0-0'),
      generateStoryTreeNode(topic, secondLevelNodes[0].segment, secondLevelNodes[0].choices[1], 2, true, '0-1'),
      generateStoryTreeNode(topic, secondLevelNodes[1].segment, secondLevelNodes[1].choices[0], 2, true, '1-0'),
      generateStoryTreeNode(topic, secondLevelNodes[1].segment, secondLevelNodes[1].choices[1], 2, true, '1-1')
    ]);
    
    // Step 4: 组装故事树
    secondLevelNodes[0].children = [thirdLevelNodes[0], thirdLevelNodes[1]];
    secondLevelNodes[1].children = [thirdLevelNodes[2], thirdLevelNodes[3]];
    rootNode.children = secondLevelNodes;
    
    const storyTree: StoryTree = {
      id: storyTreeId,
      topic,
      root: rootNode,
      created_at: timestamp,
      totalPaths: 4,  // 实际是4条路径（3轮选择，每轮2选择：2^2=4）
      maxDepth: 2     // 实际深度是2（0->1->2）
    };
    
    console.log('故事树生成完成');
    
    return {
      success: true,
      storyTree,
      message: '故事树生成成功！'
    };
  } catch (error: any) {
    console.error('故事树生成失败:', error);
    if ((error as any)?.code === 'DEEPSEEK_CONFIG_ERROR') {
      throw error;
    }
    
    const customError = new Error('故事树生成失败');
    (customError as any).code = 'STORY_TREE_GENERATION_ERROR';
    throw customError;
  }
}

/**
 * 生成故事树单个节点
 */
async function generateStoryTreeNode(
  topic: string,
  parentStory: string,
  selectedChoice: string,
  depth: number,
  isLastLevel: boolean,
  path: string
): Promise<StoryTreeNode> {
  try {
    const nodeId = new ObjectId().toString();
    
    let messages;
    
    if (depth === 0) {
      // 根节点：使用特殊提示词
      messages = [
        {
          role: 'system',
          content: `你是一个专业的儿童故事创作助手。请为主题"${topic}"创作故事开头。要求：
1. 内容适合3-8岁儿童，温馨正面
2. 故事片段不少于500字
3. 提供恰好2个选择选项，为后续剧情发展做铺垫
4. 用JSON格式返回：{"segment": "故事内容...", "choices": ["选择1", "选择2"], "isEnding": false}`
        },
        {
          role: 'user',
          content: `请为主题"${topic}"创作一个精彩的儿童故事开头。`
        }
      ];
    } else {
      // 非根节点：使用节点专用提示词
      messages = [
        {
          role: 'system',
          content: '你是一个专业的儿童故事创作助手。请根据用户要求继续故事发展。'
        },
        {
          role: 'user',
          content: STORY_TREE_NODE_PROMPT(topic, parentStory, selectedChoice, depth, isLastLevel)
        }
      ];
    }
    
    // 调用DeepSeek API
    let response;
    let aiResponse: string;
    
    try {
      response = await deepseekClient.post('/chat/completions', {
        model: DEEPSEEK_CONFIG.CHAT_MODEL,
        messages,
        max_tokens: DEEPSEEK_CONFIG.MAX_TOKENS,
        temperature: DEEPSEEK_CONFIG.TEMPERATURE,
        stream: DEEPSEEK_CONFIG.STREAM
      });
      
      if (!response || !response.data || !response.data.choices || response.data.choices.length === 0) {
        throw new Error('DeepSeek API返回数据格式不正确');
      }
      
      const choice = response.data.choices[0];
      if (!choice || !choice.message || !choice.message.content) {
        throw new Error('DeepSeek API返回的消息内容格式不正确');
      }
      
      aiResponse = choice.message.content;
    } catch (error: any) {
      console.error('DeepSeek API调用失败:', error.message);
      throw error;
    }
    console.log(`节点生成完成，深度: ${depth}, 路径: ${path}`);
    
    // 解析AI返回的JSON
    let parsedResponse;
    try {
      const cleanedResponse = aiResponse
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
      
      parsedResponse = JSON.parse(cleanedResponse);
    } catch (parseError) {
      console.error('解析AI响应失败:', parseError, '原始响应:', aiResponse);
      throw new Error('AI响应格式解析失败');
    }
    
    // 验证响应格式
    if (!parsedResponse.segment) {
      throw new Error('AI响应缺少故事内容');
    }
    
    // 验证字数要求（800字标准）
    const segmentLength = parsedResponse.segment.replace(/\s/g, '').length;
    if (segmentLength < 800) {
      console.warn(`节点字数不足800字: ${segmentLength}字，路径: ${path}`);
      // 尝试扩展内容
      try {
        const expandResponse = await expandStorySegment(parsedResponse.segment);
        if (expandResponse) {
          parsedResponse.segment = expandResponse;
        }
      } catch (e) {
        console.warn('扩展故事片段失败，使用原始内容');
      }
    }
    
    // 处理选择选项
    if (isLastLevel) {
      parsedResponse.choices = [];
      parsedResponse.isEnding = true;
    } else {
      if (!Array.isArray(parsedResponse.choices) || parsedResponse.choices.length !== 2) {
        parsedResponse.choices = ['继续冒险', '选择另一条路'];
      }
      parsedResponse.isEnding = false;
    }
    
    return {
      id: nodeId,
      segment: parsedResponse.segment,
      choices: parsedResponse.choices,
      children: undefined,  // 将在外部函数中设置
      isEnding: parsedResponse.isEnding || false,
      depth,
      path
    };
  } catch (error: any) {
    console.error(`生成故事节点失败，深度: ${depth}, 路径: ${path}:`, error);
    throw error;
  }
}

/**
 * 扩展故事片段到800字以上（适合8-12岁）
 */
async function expandStorySegment(segment: string): Promise<string | null> {
  try {
    const expandMessages = [
      { 
        role: 'system', 
        content: '你是一个擅长创作儿童故事的专家，请将给定文本保留情节不变地扩展为800-1200字，语言生动有趣、适合8-12岁儿童的认知水平。增加更多的场景描述、角色心理和细节刑画。只返回扩展后的正文，不要任何额外说明。' 
      },
      { 
        role: 'user', 
        content: segment 
      }
    ];
    
    let expandResp;
    try {
      expandResp = await deepseekClient.post('/chat/completions', {
        model: DEEPSEEK_CONFIG.CHAT_MODEL,
        messages: expandMessages,
        max_tokens: Math.max(DEEPSEEK_CONFIG.MAX_TOKENS, 1500),
        temperature: 0.7,
        stream: false
      });
      
      if (!expandResp || !expandResp.data || !expandResp.data.choices || expandResp.data.choices.length === 0) {
        throw new Error('DeepSeek API返回数据格式不正确');
      }
      
      const expanded = expandResp.data.choices[0].message.content?.trim();
      return expanded || null;
    } catch (error: any) {
      console.warn('扩展故事片段失败:', error.message);
      return null;
    }
  } catch (e) {
    console.warn('扩展故事片段失败:', e);
    return null;
  }
}

/**
 * 生成模拟故事树（用于测试）
 */
/**
 * 生成模拟故事响应（用于测试环境，针对10岁儿童优化）
 */
function generateMockStoryResponse(
  topic: string, 
  currentStory?: string, 
  selectedChoice?: string, 
  turnIndex?: number, 
  maxChoices?: number, 
  forceEnding?: boolean
): GenerateStoryResponse {
  const isNewStory = !currentStory;
  const actualTurnIndex = turnIndex || 0;
  
  let storySegment: string;
  let choices: string[];
  let isEnding = false;
  
  // 基于主题生成更个性化的故事内容
  const themeBasedContent = generateThemeBasedStory(topic, isNewStory, selectedChoice, actualTurnIndex, forceEnding);
  
  if (isNewStory) {
    storySegment = themeBasedContent.opening;
    choices = themeBasedContent.initialChoices;
  } else if (forceEnding || actualTurnIndex >= 4) {
    storySegment = themeBasedContent.ending;
    choices = [];
    isEnding = true;
  } else {
    storySegment = themeBasedContent.continuation;
    choices = themeBasedContent.continuationChoices;
  }
  
  return {
    storySegment,
    choices,
    isEnding
  };
}

/**
 * 根据主题生成适合10岁儿童的故事内容
 */
function generateThemeBasedStory(
  topic: string,
  isNewStory: boolean,
  selectedChoice?: string,
  turnIndex?: number,
  forceEnding?: boolean
) {
  // 分析主题关键词，生成相应的故事元素
  const lowerTopic = topic.toLowerCase();
  const isSpace = lowerTopic.includes('太空') || lowerTopic.includes('宇航') || lowerTopic.includes('外星') || lowerTopic.includes('星球');
  const isUnicorn = lowerTopic.includes('独角兽') || lowerTopic.includes('魔法');
  const isScience = lowerTopic.includes('科学') || lowerTopic.includes('实验') || lowerTopic.includes('发明');
  const isAdventure = lowerTopic.includes('冒险') || lowerTopic.includes('探索') || lowerTopic.includes('寻找');
  
  if (isSpace) {
    return {
      opening: `十岁的小明是个对天空充满好奇的孩子，每天晚上都喜欢看星星。今天，他在后院发现了一个闪闪发光的神秘装置，看起来像是从天空中掉下来的。当他小心翼翼地触碰装置时，突然间，一道温暖的蓝光包围了他，他感觉自己轻飘飘地飞了起来！

眨眼间，小明发现自己站在了一艘超级酷炫的宇宙飞船里。飞船的窗户外面是璀璨的星空，各种颜色的星球在远方闪烁着。这时，一个友好的外星朋友出现了，它有着大大的眼睛和温和的笑容。"欢迎来到银河探险号！"外星朋友说，"我叫星星，我们正在进行一次特殊的太空探索任务。你愿意帮助我们吗？"

小明兴奋地点点头，他从来没有想过会有这样的奇遇！星星告诉他，宇宙中有许多有趣的科学现象等待他们去发现...`,
      initialChoices: [
        '先去参观神奇的太空实验室',
        '选择飞向最亮的那颗星球',
        '学习如何驾驶宇宙飞船'
      ],
      continuation: `跟随星星的指引，小明选择了"${selectedChoice}"。这个决定让他学到了很多关于宇宙的知识：原来星球有不同的重力，有些星球上还有会发光的植物！在星星朋友的帮助下，小明用特殊的太空望远镜观察了遥远的星系，还学会了如何在零重力环境中移动。"每个星球都有它独特的秘密，"星星说，"科学让我们能够理解这些奥妙。"现在，他们面临着新的探索选择...`,
      continuationChoices: [
        '探索一颗有奇特生物的星球',
        '研究黑洞的神秘现象',
        '帮助修复受损的太空站'
      ],
      ending: `经过这次不可思议的太空冒险，小明学到了许多宇宙科学知识，也明白了友谊和勇气的重要性。星星送给他一个特殊的星空指南针，告诉他："只要保持好奇心和学习的热情，科学的奥秘就会一直陪伴你。"当小明回到地球时，他望着夜空中的星星，心中充满了对科学探索的渴望。从此以后，他更加努力地学习，希望将来真的能成为一名宇航员，去探索更多未知的世界！`
    };
  } else if (isUnicorn) {
    return {
      opening: `十岁的小莉是个特别善良的女孩，她总是相信世界上有魔法存在。一个阳光明媚的周末，当她在奶奶家的花园里玩耍时，突然听到了一阵轻柔的铃声。循着声音，她推开了花园深处一扇从未见过的小门。

门后是一片令人惊叹的魔法森林！彩虹色的蝴蝶在空中翩翩起舞，会唱歌的花朵正在合唱美妙的旋律。就在这时，一只纯白色的独角兽优雅地走到了小莉面前，它的独角闪着像钻石一样的光芒。

"你好，善良的孩子，"独角兽温柔地说，"我是月光，这片森林的守护者。但最近森林里出现了一些问题，我需要一个纯真善良的朋友来帮助我。"月光告诉小莉，森林里的魔法正在慢慢消失，只有通过帮助别人和传递善意，才能重新点亮森林的魔法光芒...`,
      initialChoices: [
        '帮助迷路的小动物找到家',
        '修复被暴风雨破坏的魔法花园',
        '寻找传说中的友谊水晶'
      ],
      continuation: `在月光独角兽的陪伴下，小莉选择了"${selectedChoice}"。这个善良的决定让她发现了帮助别人带来的快乐。她学会了倾听小动物们的心声，学会了照料受伤的植物，还学会了用真诚的友谊温暖他人的心。每当她做出一个善良的行为，森林里就会有更多的花朵绽放，更多的星光闪烁。"真正的魔法来自于善良的心，"月光说，"你已经在用你的行动让世界变得更美好了。"现在，还有更多需要帮助的朋友在等待着他们...`,
      continuationChoices: [
        '帮助解决森林居民之间的小误会',
        '寻找能治愈忧伤的神奇花朵',
        '教会其他小朋友分享的快乐'
      ],
      ending: `通过这次神奇的冒险，小莉明白了最珍贵的魔法就藏在每个人的心中——那就是善良、友爱和乐于助人的品格。月光独角兽送给她一个闪闪发光的小吊坠，说："无论走到哪里，记住保持善良的心，你就能为这个世界带来真正的魔法。"当小莉回到现实世界时，她发现自己变得更加自信和快乐。从那以后，她总是主动帮助同学和朋友，成为了大家心中的"小天使"，她相信每一个善良的行为都能让世界变得更加美好！`
    };
  } else {
    // 通用冒险故事模板（适合其他主题）
    return {
      opening: `十岁的主人公是个充满好奇心的孩子，对世界上的一切都充满了兴趣。今天，在关于"${topic}"的探险中，他/她发现了一个从未见过的神秘地方。这里的景色美得像童话故事一样，空气中飘着淡淡的花香，还能听到远处传来的神秘声音。

当主人公小心翼翼地探索这个地方时，遇到了一位智慧的长者。长者告诉他/她，这里隐藏着关于"${topic}"的重要秘密，但需要通过智慧、勇气和善良才能发现。"年轻的探险家，"长者说，"真正的宝藏不是金银财宝，而是在冒险过程中学到的知识和品格。"

现在，主人公面临着人生中一个重要的选择时刻，每个选择都会带来不同的学习和成长经历...`,
      initialChoices: [
        `深入了解${topic}的奥秘`,
        '寻找志同道合的伙伴一起探索',
        '学习解决困难的新方法'
      ],
      continuation: `主人公做出了明智的选择："${selectedChoice}"。这个决定让他/她在${topic}的世界里有了新的发现和理解。通过亲身体验，主人公学会了观察、思考和解决问题的方法，也明白了坚持不懈的重要性。每一个挑战都让他/她变得更加聪明和勇敢，每一个成功都带来了满满的成就感。"学习是一生的冒险，"智慧长者说，"记住今天学到的知识和品格，它们会陪伴你一辈子。"现在，新的机会又出现了...`,
      continuationChoices: [
        '挑战更高难度的探索任务',
        '把学到的知识教给其他小朋友',
        '寻找这次冒险的终极意义'
      ],
      ending: `这次关于"${topic}"的奇妙冒险让主人公收获满满。他/她不仅学到了很多新知识，更重要的是培养了独立思考、勇于探索和乐于助人的优秀品格。智慧长者送给主人公一本特殊的日记本，说："把你的每一次学习和成长都记录下来，这将是你最珍贵的财富。"当主人公回到日常生活中时，发现自己看待事物的眼光变得更加深入和全面。从此以后，他/她带着这次冒险中学到的智慧和勇气，在学习和生活中不断进步，成为了同龄人中的榜样！`
    };
  }
}

function generateMockStoryTree(topic: string, storyTreeId: string, timestamp: string): GenerateFullStoryResponse {
  const mockSegmentText = `在一个美丽的${topic === '小兔子的冒险' ? '花园里' : '神奇的地方'}，我们的主角开始了一段奇妙的旅程。阳光透过绿叶洒下斑驳的光影，微风轻柔地吹过，带来了花朵的香气。在这个充满魔法的世界里，每一步都可能遇到意想不到的惊喜。

我们的主角充满好奇地四处张望，发现周围有许多有趣的东西。不远处，一只美丽的蝴蝶正在花丛中翩翩起舞，它的翅膀闪闪发光，就像彩虹一样美丽。另一边，一条小河正在欢快地流淌，发出叮咚叮咚的悦耳声音。

突然，主角听到了一个神秘的声音，这个声音似乎在召唤着什么。这时，面前出现了两条不同的道路：一条通向充满鲜花的小径，另一条则通向神秘的森林深处。每一条路都充满了未知的冒险和惊喜，现在需要做出选择了...`;

  // 创建模拟节点
  const createMockNode = (
    id: string, 
    segment: string, 
    choices: string[], 
    isEnding: boolean, 
    depth: number, 
    path: string
  ): StoryTreeNode => ({
    id,
    segment,
    choices,
    children: undefined,
    isEnding,
    depth,
    path
  });

  // 创建4个结局节点
  const endings = [
    createMockNode(
      new ObjectId().toString(),
      `经过一番冒险，主角终于找到了传说中的彩虹宝石。这块宝石闪闪发光，散发着温暖的光芒。当主角轻轻触碰宝石时，一阵神奇的魔法力量涌现，将整个世界变得更加美丽和充满爱。从此以后，这里变成了所有小动物们最喜欢的乐园，而我们的主角也成为了大家心目中的英雄。太阳西下，美好的一天结束了，主角带着满满的快乐和成就感，踏上了回家的路。这真是一次永远难忘的奇妙冒险！`,
      [],
      true,
      2,
      '0-0'
    ),
    createMockNode(
      new ObjectId().toString(),
      `主角发现了一座隐藏的魔法城堡，里面住着善良的魔法师。魔法师看到主角的勇敢和善良，决定教给主角一些有用的魔法。在魔法师的指导下，主角学会了让花朵盛开的咒语，学会了和小动物们对话，还学会了让彩虹出现的神奇魔法。从城堡出来时，主角的心里充满了快乐和满足。现在，主角可以用这些魔法帮助更多的朋友，让世界变得更加美好。夜幕降临，星星在天空中闪烁，主角带着魔法的力量和美好的回忆，开心地踏上了回家的路。`,
      [],
      true,
      2,
      '0-1'
    ),
    createMockNode(
      new ObjectId().toString(),
      `在森林的深处，主角遇到了一群迷路的小动物们。它们看起来很害怕，不知道怎么回家。我们善良的主角决定帮助它们找到回家的路。经过一番努力，主角终于带着所有的小动物们找到了它们的家园。小动物们非常感激，它们邀请主角参加了一个盛大的感谢派对。森林里充满了欢声笑语，大家一起唱歌跳舞，分享美味的浆果和蜂蜜。当月亮升起时，所有的动物朋友们都依依不舍地和主角告别，并约定以后要经常来玩。主角带着新朋友们的祝福和温暖的回忆，满足地踏上了回家的路。`,
      [],
      true,
      2,
      '1-0'
    ),
    createMockNode(
      new ObjectId().toString(),
      `主角在河边发现了一艘小小的魔法船。当主角坐上小船时，小船竟然开始自动航行，带着主角来到了一个美丽的魔法岛屿。岛上到处都是会唱歌的花朵和会跳舞的蝴蝶，还有一颗结满彩色果实的神奇大树。主角品尝了这些魔法果实，每一种都有不同的魔法效果：有的让人感到无比快乐，有的让人充满勇气，还有的让人拥有智慧。在岛上度过了一个美好的下午后，魔法船又载着主角回到了岸边。主角的心里充满了神奇的体验和美好的回忆，这次冒险让主角变得更加勇敢和聪明。夕阳西下，主角踏着轻快的步伐回家了。`,
      [],
      true,
      2,
      '1-1'
    )
  ];

  // 创建第二层节点
  const secondLevel = [
    createMockNode(
      new ObjectId().toString(),
      `主角选择了鲜花小径，这里真是太美了！到处都是五颜六色的花朵，空气中弥漫着甜甜的香味。蜜蜂和蝴蝶在花丛中忙碌着，发出嗡嗡的欢快声音。走着走着，主角来到了一片特别神奇的花田，这里的花朵似乎会发出微弱的光芒，就像小星星一样。突然，花田中央出现了一个闪闪发光的东西，看起来像是某种宝物。同时，主角也注意到不远处有一座美丽的小房子，烟囱里冒着温暖的烟。现在主角面临着新的选择...`,
      ['走向那个闪光的宝物', '去敲小房子的门'],
      false,
      1,
      '0'
    ),
    createMockNode(
      new ObjectId().toString(),
      `主角勇敢地选择了神秘的森林小径。这里的树木非常高大，绿色的树叶形成了一个天然的屋顶，阳光从缝隙中洒下来，形成了美丽的光柱。森林里很安静，只能听到鸟儿偶尔的歌唱和树叶沙沙的声音。主角小心地往前走，发现森林里有很多有趣的东西：色彩斑斓的蘑菇、可爱的小松鼠，还有清澈的小溪。忽然，主角听到前方传来了一些奇怪的声音，好像是有人在哭泣，也可能是有什么动物需要帮助。另一个方向，主角看到了一条通往河边的小路...`,
      ['去看看是谁在哭泣', '走向河边的小路'],
      false,
      1,
      '1'
    )
  ];

  // 设置子节点关系
  secondLevel[0].children = [endings[0], endings[1]];
  secondLevel[1].children = [endings[2], endings[3]];

  // 创建根节点
  const rootNode = createMockNode(
    new ObjectId().toString(),
    mockSegmentText,
    ['选择鲜花小径', '选择神秘森林'],
    false,
    0,
    ''
  );
  rootNode.children = secondLevel;

  const storyTree: StoryTree = {
    id: storyTreeId,
    topic,
    root: rootNode,
    created_at: timestamp,
    totalPaths: 4,
    maxDepth: 2
  };

  return {
    success: true,
    storyTree,
    message: '模拟故事树生成完成！'
  };
}

/**
 * 生成故事预览文本
 * 支持多种故事内容格式：
 * 1. 渐进式故事：{ storySegment: "...", ... }
 * 2. 故事树模式：{ fullStory: "...", mode: "story-tree", ... }
 * 3. 纯文本格式
 */
function generatePreview(content: string, maxLength: number = 100): string {
  try {
    // 尝试解析JSON格式的故事内容
    const parsed = JSON.parse(content);
    if (typeof parsed === 'object') {
      // 故事树模式：使用 fullStory 字段
      if (parsed.fullStory && typeof parsed.fullStory === 'string') {
        const preview = parsed.fullStory.substring(0, maxLength);
        return preview.length < parsed.fullStory.length ? preview + '...' : preview;
      }
      
      // 渐进式故事模式：使用 storySegment 字段
      if (parsed.storySegment && typeof parsed.storySegment === 'string') {
        const preview = parsed.storySegment.substring(0, maxLength);
        return preview.length < parsed.storySegment.length ? preview + '...' : preview;
      }
      
      // 如果是对象但没有预期字段，尝试取第一个字符串值作为预览
      const firstStringValue = Object.values(parsed).find(value => 
        typeof value === 'string' && value.length > 10
      ) as string;
      
      if (firstStringValue) {
        const preview = firstStringValue.substring(0, maxLength);
        return preview.length < firstStringValue.length ? preview + '...' : preview;
      }
    }
  } catch {
    // 如果不是JSON格式，直接截取文本
  }
  
  // 兜底：直接处理原始文本
  const preview = content.substring(0, maxLength);
  return preview.length < content.length ? preview + '...' : preview;
}
