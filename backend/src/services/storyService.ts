import { ObjectId } from 'mongodb';
import { getDatabase, TABLES } from '../config/database';
import { 
  StoryDocument, 
  createStoryDocument, 
  validateStoryDocument, 
  storyDocumentToResponse, 
  requestToStoryDocument 
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
  STORY_REVIEW_PROMPT
} from '../config/deepseek';
import { 
  logger, 
  createSession, 
  endSession, 
  LogLevel, 
  EventType, 
  logAIApiCall, 
  logPerformance
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
  StoryTreeNode
} from '../types';

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
    const { topic, currentStory, selectedChoice, turnIndex, maxChoices, forceEnding } = params;
    
    // 验证输入参数
    if (!topic || topic.trim().length === 0) {
      const customError = new Error('story_topic_required');
      (customError as any).code = 'VALIDATION_ERROR';
      throw customError;
    }
    
    // 在没有API Key时使用mock数据（除了生产环境）
    if (!process.env.DEEPSEEK_API_KEY && process.env.NODE_ENV !== 'production') {
      console.log('使用模拟数据生成适合8-12岁儿童的故事');
      return generateMockStoryResponse(topic, currentStory, selectedChoice, turnIndex, maxChoices, forceEnding);
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
    const response = await deepseekClient.post('/chat/completions', {
      model: DEEPSEEK_CONFIG.CHAT_MODEL,
      messages,
      max_tokens: DEEPSEEK_CONFIG.MAX_TOKENS,
      temperature: DEEPSEEK_CONFIG.TEMPERATURE,
      stream: DEEPSEEK_CONFIG.STREAM
    });
    const apiDuration = Date.now() - apiStartTime;

    if (!response.data || !response.data.choices || response.data.choices.length === 0) {
      throw new Error('DeepSeek API返回数据格式不正确');
    }

    const aiResponse = response.data.choices[0].message.content;
    
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
        
        // 如果重试也失败，使用更智能的fallback策略
        const fallbackStory = aiResponse.length > 800 ? aiResponse.substring(0, 800) + '...' : aiResponse;
        parsedResponse = {
          storySegment: fallbackStory,
          choices: ['继续冒险探索', '寻找新的线索', '回到安全地带'],
          isEnding: false
        };
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
    
    // 在没有API Key时使用mock数据（除了生产环境）
    if (!process.env.DEEPSEEK_API_KEY && process.env.NODE_ENV !== 'production') {
      console.log('使用模拟数据生成适合8-12岁儿童的故事树');
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
  const response = await deepseekClient.post('/chat/completions', {
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
  
  if (!response.data?.choices?.[0]?.message?.content) {
    throw new Error('DeepSeek Reasoner API返回数据格式不正确');
  }
  
  const content = response.data.choices[0].message.content;
  try {
    return extractJson(content);
  } catch (parseError) {
    console.error('解析Reasoner响应失败:', parseError, '原始输出片段:', String(content).slice(0, 200));
    throw new Error('思考模式响应格式解析失败');
  }
}

/**
 * 调用DeepSeek快速模式
 */
async function callDeepSeekChat(systemPrompt: string, userMessage: string): Promise<any> {
  const response = await deepseekClient.post('/chat/completions', {
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
  
  if (!response.data?.choices?.[0]?.message?.content) {
    throw new Error('DeepSeek Chat API返回数据格式不正确');
  }
  
  const content = response.data.choices[0].message.content;
  try {
    return extractJson(content);
  } catch (parseError) {
    console.error('解析Chat响应失败:', parseError, '原始输出片段:', String(content).slice(0, 200));
    throw new Error('快速模式响应格式解析失败');
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

    // 检查是否有API密钥，没有则使用模拟数据
    if (!process.env.DEEPSEEK_API_KEY) {
      console.log('使用模拟数据生成故事树');
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
    const response = await deepseekClient.post('/chat/completions', {
      model: DEEPSEEK_CONFIG.CHAT_MODEL,
      messages,
      max_tokens: DEEPSEEK_CONFIG.MAX_TOKENS,
      temperature: DEEPSEEK_CONFIG.TEMPERATURE,
      stream: DEEPSEEK_CONFIG.STREAM
    });
    
    if (!response.data?.choices?.[0]?.message?.content) {
      throw new Error('DeepSeek API返回数据格式不正确');
    }
    
    const aiResponse = response.data.choices[0].message.content;
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
    
    const expandResp = await deepseekClient.post('/chat/completions', {
      model: DEEPSEEK_CONFIG.CHAT_MODEL,
      messages: expandMessages,
      max_tokens: Math.max(DEEPSEEK_CONFIG.MAX_TOKENS, 1500),
      temperature: 0.7,
      stream: false
    });
    
    const expanded = expandResp?.data?.choices?.[0]?.message?.content?.trim();
    return expanded || null;
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
  const isSpace = lowerTopic.includes('太空') || lowerTopic.includes('宇航') || lowerTopic.includes('外星') || lowerTopic.includes('星球') || lowerTopic.includes('月亮');
  const isUnicorn = lowerTopic.includes('独角兽') || lowerTopic.includes('魔法');
  const isScience = lowerTopic.includes('科学') || lowerTopic.includes('实验') || lowerTopic.includes('发明');
  const isAdventure = lowerTopic.includes('冒险') || lowerTopic.includes('探索') || lowerTopic.includes('寻找');
  const isAnimal = lowerTopic.includes('兔子') || lowerTopic.includes('小兔') || lowerTopic.includes('老鼠') || lowerTopic.includes('小鸟') || lowerTopic.includes('猫') || lowerTopic.includes('狗') || lowerTopic.includes('熊');
  const isDragon = lowerTopic.includes('龙') || lowerTopic.includes('小龙');
  const isForest = lowerTopic.includes('森林') || lowerTopic.includes('树林') || lowerTopic.includes('大树');
  const isCastle = lowerTopic.includes('城堡') || lowerTopic.includes('宫殿') || lowerTopic.includes('彩虹');
  
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
  } else if (isAnimal) {
    return {
      opening: `十岁的小雨特别喜欢小动物，她家附近的公园里有很多可爱的小生灵。今天下午，当她在公园里散步时，突然听到草丛里传来细小的求助声。"救救我！"声音听起来又急切又害怕。

小雨小心地拨开草丛，发现了一只毛茸茸的小生灵，它看起来迷路了，眼睛里满含着眼泪。"别害怕，小家伙，"小雨轻声安慰着，"我是来帮助你的。"

这只小动物告诉小雨，它本来是和家人一起在森林里玩耍，但是不小心走散了。现在它不知道怎么回家，而且天快黑了。小雨决定帮助这个新朋友找到回家的路...`,
      initialChoices: [
        '向公园管理员询问森林的方向',
        '跟着小动物熟悉的气味寻找',
        '制作临时的避难所过夜'
      ],
      continuation: `小雨选择了"${selectedChoice}"，这个善良的决定让她学到了很多关于动物习性和自然知识。在帮助小动物的过程中，她发现每个生命都有自己的智慧和生存技能。通过观察和倾听，她学会了如何与动物交流，如何读懂它们的身体语言，还学会了在自然中找到方向。"每个生命都值得被尊重和保护，"小雨想，"而且帮助别人会让自己也变得更快乐。"现在，她们面临着新的考验...`,
      continuationChoices: [
        '教小动物一些自我保护的技能',
        '寻找更多迷路的小伙伴',
        '在森林里建立一个帮助站'
      ],
      ending: `经过这次温暖的冒险，小雨不仅成功帮助小动物回到了家人身边，还学会了许多关于友谊、责任和大自然的宝贵知识。小动物的家人们都非常感激她，送给她一个特殊的哨子，说："这个哨子能让森林里的动物知道你是它们的朋友。"从那以后，小雨成为了小动物们最信任的朋友，每当有小生灵需要帮助时，她总是第一个伸出援手。她明白了最大的快乐来自于帮助他人，而真正的友谊没有物种的界限！`
    };
  } else if (isDragon) {
    return {
      opening: `十岁的小峰是个充满想象力的孩子，他总是相信世界上有神奇的生物存在。一个阴雨绵绵的下午，当他在阁楼里整理旧书时，突然从一本古老的故事书中飞出了一道七彩的光芒！

光芒散去后，一只手掌大小的小龙出现在他面前。这只小龙有着翡翠绿的鳞片和金色的眼睛，看起来既害羞又友善。"你好，小朋友，"小龙用细细的声音说，"我叫星光，我被困在书里很久了，谢谢你解救了我！"

星光告诉小峰，它来自一个充满智慧和和谐的龙之王国，但现在王国遇到了困难，需要一个纯真善良的孩子来帮助解决问题...`,
      initialChoices: [
        '询问龙之王国遇到了什么困难',
        '邀请星光先在家里休息一下',
        '问问怎样才能帮助龙之王国'
      ],
      continuation: `小峰做出了明智的选择："${selectedChoice}"。通过与星光的对话，他了解到龙之王国的智慧之花正在枯萎，只有通过传播友善、诚实和勇气的种子，才能重新让智慧之花绽放。星光解释说，每当有人做出善良的行为，智慧之花就会重新获得一点生命力。"真正的魔力不在于法术，"星光说，"而在于善良的心和正确的行为。"现在，他们需要找到传播这些美德的方法...`,
      continuationChoices: [
        '在学校里组织一个友善行动周',
        '帮助邻居解决他们的小困难',
        '写一个关于善良的故事分享给大家'
      ],
      ending: `通过这次奇妙的经历，小峰明白了每个人心中都有一条友善的小龙，它代表着我们最美好的品格。星光告诉他，龙之王国的智慧之花已经重新绽放，这都是因为小峰传播的善良种子。作为感谢，星光送给小峰一枚龙鳞徽章，说："只要你继续保持善良和勇敢，这枚徽章就会发光，提醒你内心的力量。"从那天起，小峰变得更加自信和乐于助人，他知道真正的勇敢就是选择做正确的事情，而真正的魔法就是用善良点亮世界！`
    };
  } else if (isForest) {
    return {
      opening: `十岁的小林最喜欢大自然了，每个周末都会和爷爷一起去附近的森林里散步。这个周末，当他们走到平常很熟悉的小径时，却发现了一条从来没有见过的神秘小路，小路两旁长满了会发光的蘑菇！

"这里以前没有这条路啊，"小林好奇地说。爷爷笑着摸摸他的头："大自然总是充满惊喜的，也许它想带我们去看看新的朋友呢。"

沿着这条神奇的小路，他们来到了森林深处的一个美丽空地。这里的每棵树都高得直冲云霄，阳光透过茂密的叶子洒下斑驳的光影，空气中弥漫着清新的花香。突然，一个慈祥的声音从最大的那棵橡树上传来："欢迎来到智慧森林，年轻的探索者！"...`,
      initialChoices: [
        '礼貌地向大橡树问好和自我介绍',
        '询问智慧森林有什么特别之处',
        '请教关于大自然的知识'
      ],
      continuation: `小林选择了"${selectedChoice}"，这让森林里的朋友们都很喜欢他。大橡树告诉他，智慧森林是一个特殊的地方，这里每个生命都相互帮助，共同创造着和谐美好的环境。小林学到了森林生态系统的奥秘，了解了植物和动物之间的相互依存关系，还学会了如何倾听大自然的声音。"保护环境就是保护我们的未来，"大橡树温和地说，"每个人都可以从小事做起。"现在，小林想要为森林做些什么...`,
      continuationChoices: [
        '帮助清理森林里的垃圾',
        '学习种植更多有益的植物',
        '向更多人宣传保护森林的重要性'
      ],
      ending: `这次神奇的森林之旅让小林明白了人与自然和谐相处的重要性。临别时，大橡树送给他一颗特殊的种子，说："这颗种子代表着希望和责任，只要你继续爱护环境，它就会在你心中生根发芽。"回到城市后，小林开始在家里种植物，参加环保活动，还和同学们一起组织了"绿色小卫士"的环保小组。每当看到那颗种子长成的小树苗，他就想起了智慧森林的教导：我们每个人都是地球的守护者，保护环境从我们的每一个小行动开始！`
    };
  } else if (isCastle) {
    return {
      opening: `十岁的小虹是个爱做梦的女孩，她总是想象着童话中的美丽城堡。今天，当她在画彩虹的时候，突然发现彩虹的另一端出现了一座闪闪发光的城堡！更神奇的是，彩虹竟然变成了一座彩虹桥，通向那座城堡。

"这一定是彩虹王国！"小虹兴奋地想。她小心翼翼地踏上彩虹桥，感觉脚下软软的，就像踩在云朵上一样。走过彩虹桥，她来到了城堡门前，发现这里的一切都闪着温柔的七彩光芒。

城堡的大门自动打开了，一位穿着彩虹长裙的仙女走了出来。"欢迎来到彩虹王国，善良的小朋友，"仙女温和地说，"我是彩虹仙女，我们的王国需要你的帮助。最近颜色们都不开心了，彩虹变得暗淡无光。"...`,
      initialChoices: [
        '询问颜色们为什么不开心',
        '主动提出要帮助解决问题',
        '请彩虹仙女带自己去看看情况'
      ],
      continuation: `小虹选择了"${selectedChoice}"，她的善良和主动让彩虹仙女很感动。原来，彩虹王国里的颜色们因为听到了太多争吵和不和谐的声音，所以失去了光彩。彩虹仙女解释说，只有通过传播欢乐、友谊和美好的情感，才能让颜色们重新快乐起来。小虹明白了，美丽不只是外表，更重要的是内心的善良和对世界的热爱。"每个人心中都有一道彩虹，"彩虹仙女说，"关键是要让它闪闪发光。"现在，她要想办法让颜色们重新开心...`,
      continuationChoices: [
        '为每种颜色唱一首快乐的歌',
        '分享自己生活中的美好回忆',
        '邀请颜色们一起做有趣的游戏'
      ],
      ending: `通过小虹的努力，彩虹王国重新变得光彩夺目，所有的颜色都恢复了往日的快乐。彩虹仙女感动地说："你让我们明白了，真正的美丽来自于分享爱与快乐。"作为感谢，她送给小虹一个彩虹水晶，说："只要你保持乐观和善良，这个水晶就会提醒你，你有让世界变得更美好的能力。"回到现实世界后，小虹变得更加自信和开朗，她学会了用积极的态度面对生活中的困难，还经常帮助其他小朋友找到快乐。她知道，每个人心中都有一座彩虹城堡，只要我们用爱心和善意去装扮它，生活就会变得美丽而精彩！`
    };
  } else {
    // 睡前友善冒险故事模板（适合其他主题，专为10岁儿童睡前设计）
    return {
      opening: `十岁的小安是个温柔善良的孩子，总是用心观察身边的美好事物。今天傍晚，当夕阳西下、天空染上温暖的橙色时，他/她在关于"${topic}"的温馨探索中，意外发现了一个充满温暖光芒的奇妙地方。

这里就像是从童话书中走出来的世界，到处都散发着安宁祥和的氛围。花朵轻柔地摇摆，蝴蝶优雅地飞舞，还有远处传来的如同摇篮曲般轻柔的声音。当小安轻轻走近时，遇到了一位慈祥的守护者。

"欢迎你，善良的小朋友，"守护者温和地微笑着说，"这里是梦想与现实相遇的地方。关于'${topic}'，这里藏着许多温暖的秘密，但只有拥有善良之心的人才能发现。你愿意用你的爱心和智慧，来帮助这里的朋友们吗？"...`,
      initialChoices: [
        `用心聆听${topic}想要传达的温柔故事`,
        '主动帮助这里需要关爱的小伙伴',
        '学习如何用善良温暖他人的心'
      ],
      continuation: `小安选择了"${selectedChoice}"，这个充满爱心的决定让周围的一切都变得更加美好。通过这次温柔的经历，小安学会了耐心倾听、细心观察和用心关怀。每一个微笑都能传递温暖，每一个善意的举动都能点亮他人的心。"最美丽的宝藏就是我们心中的善良，"守护者轻声说道，"当我们用爱心对待世界时，世界也会用爱回应我们。"现在，更多需要关爱的朋友正在等待着小安的帮助...`,
      continuationChoices: [
        '安慰一个感到孤独的小朋友',
        '分享自己的快乐回忆给大家',
        '创造一个让所有人都开心的温暖活动'
      ],
      ending: `这次关于"${topic}"的美好旅程即将结束，小安的心中充满了暖暖的感动。通过帮助别人，他/她发现自己也变得更加快乐和自信。守护者送给小安一颗会发光的小星星，轻声说："这颗星星代表着你内心的善良之光。无论走到哪里，只要你继续用爱心对待他人，它就会为你照亮前进的路。"

当小安回到温暖的家中时，发现自己看世界的眼光变得更加温柔。从那天起，他/她总是主动关心同学和朋友，用自己的善良感染着身边的每一个人。每当夜幕降临，看着那颗发光的小星星，小安就会想起今天学到的最重要的道理：用善良点亮世界，用爱心温暖他人，这是最美好的生活方式。现在，该是安静地进入甜美梦乡的时候了...`
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
