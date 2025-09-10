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
  STORY_CONTINUE_PROMPT 
} from '../config/deepseek';
import type { 
  GenerateStoryRequest, 
  GenerateStoryResponse,
  SaveStoryRequest, 
  SaveStoryResponse,
  GetStoriesResponse,
  GetStoryResponse
} from '../types';

/**
 * 生成故事片段服务
 */
export async function generateStoryService(params: GenerateStoryRequest): Promise<GenerateStoryResponse> {
  try {
    const { topic, currentStory, selectedChoice, turnIndex, maxChoices, forceEnding } = params;
    
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
      // 开始新故事
      messages.push({
        role: 'user',
        content: `请为以下主题创作一个儿童睡前故事的开头（至少500字）：${topic}。
为了确保互动在有限次数内自然结束，本故事计划的总互动次数为 ${Math.max(5, Math.min(10, maxChoices || 6))} 次。请注意承接关系，后续每次将根据选择继续发展。请使用JSON格式：{"storySegment":"...","choices":["...","...","..."],"isEnding":false}`
      });
    }

    console.log('正在调用DeepSeek API...');
    
    // 调用DeepSeek API
    const response = await deepseekClient.post('/chat/completions', {
      model: DEEPSEEK_CONFIG.MODEL,
      messages,
      max_tokens: DEEPSEEK_CONFIG.MAX_TOKENS,
      temperature: DEEPSEEK_CONFIG.TEMPERATURE,
      stream: DEEPSEEK_CONFIG.STREAM
    });

    if (!response.data || !response.data.choices || response.data.choices.length === 0) {
      throw new Error('DeepSeek API返回数据格式不正确');
    }

    const aiResponse = response.data.choices[0].message.content;
    console.log('DeepSeek API响应:', aiResponse);

    // 解析AI返回的JSON
    let parsedResponse;
    try {
      // 清理可能的markdown格式
      const cleanedResponse = aiResponse
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
      
      parsedResponse = JSON.parse(cleanedResponse);
    } catch (parseError) {
      console.error('解析AI响应失败:', parseError, '原始响应:', aiResponse);
      
      // 如果JSON解析失败，尝试从文本中提取故事内容
      const fallbackStory = aiResponse.substring(0, 200) + '...';
      parsedResponse = {
        storySegment: fallbackStory,
        choices: ['继续探索', '回到家中', '寻求帮助'],
        isEnding: false
      };
    }

    // 验证响应格式
    if (!parsedResponse.storySegment) {
      throw new Error('AI响应缺少故事内容');
    }

    // 确保choices是数组且不超过3个
    if (!Array.isArray(parsedResponse.choices)) {
      parsedResponse.choices = ['继续冒险', '返回起点', '寻找新路径'];
    }
    
    // 限制选择数量为最多3个
    if (parsedResponse.choices.length > 3) {
      parsedResponse.choices = parsedResponse.choices.slice(0, 3);
    } else if (parsedResponse.choices.length < 3 && !parsedResponse.isEnding) {
      // 如果不是结尾且选择少于3个，补充默认选择
      const defaultChoices = ['继续故事', '换个方向', '寻求帮助'];
      while (parsedResponse.choices.length < 3) {
        const nextDefault = defaultChoices[parsedResponse.choices.length];
        if (!parsedResponse.choices.includes(nextDefault)) {
          parsedResponse.choices.push(nextDefault);
        } else {
          parsedResponse.choices.push(`选择${parsedResponse.choices.length + 1}`);
        }
      }
    }

    // 如果调用方要求强制结尾，则覆盖AI的返回，确保没有choices并标记isEnding
    if (forceEnding) {
      parsedResponse.isEnding = true;
      parsedResponse.choices = [];
    }

    // 保障片段长度：如小于500字，进行一次扩展调用（不改变情节，仅延展描述）
    const plainLen = String(parsedResponse.storySegment || '').replace(/\s/g, '').length;
    if (plainLen < 500) {
      try {
        const expandMessages = [
          { role: 'system', content: '你是一个擅长润色儿童故事的助手，请将给定文本保留情节不变地扩展为至少500字，语言温柔、适合3-8岁儿童。只返回扩展后的正文，不要任何额外说明。' },
          { role: 'user', content: String(parsedResponse.storySegment) }
        ];
        const expandResp = await deepseekClient.post('/chat/completions', {
          model: DEEPSEEK_CONFIG.MODEL,
          messages: expandMessages,
          max_tokens: Math.max(DEEPSEEK_CONFIG.MAX_TOKENS - 200, 800),
          temperature: 0.7,
          stream: false
        });
        const expanded = expandResp?.data?.choices?.[0]?.message?.content?.trim();
        if (expanded) {
          parsedResponse.storySegment = expanded;
        }
      } catch (e) {
        console.warn('扩展故事片段失败，使用原文返回:', e);
      }
    }

    return {
      storySegment: parsedResponse.storySegment,
      choices: parsedResponse.isEnding ? [] : parsedResponse.choices,
      isEnding: !!parsedResponse.isEnding
    };
  } catch (error: any) {
    console.error('DeepSeek API调用失败:', error);
    
    if (error.response) {
      console.error('API响应错误:', error.response.status, error.response.data);
    }
    
    const customError = new Error('DeepSeek API调用失败');
    (customError as any).code = 'DEEPSEEK_API_ERROR';
    throw customError;
  }
}

/**
 * 保存故事服务
 */
export async function saveStoryService(params: SaveStoryRequest): Promise<SaveStoryResponse> {
  try {
    const { title, content } = params;
    
    console.log('正在保存故事到MongoDB...');
    
    // 创建故事文档
    const storyDoc = createStoryDocument(title, content);
    
    // 验证文档
    const validationErrors = validateStoryDocument(storyDoc);
    if (validationErrors.length > 0) {
      throw new Error(`数据验证失败: ${validationErrors.join(', ')}`);
    }
    
    // 获取数据库实例
    const db = getDatabase();
    const storiesCollection = db.collection(TABLES.STORIES);
    
    // 保存到MongoDB
    const result = await storiesCollection.insertOne(storyDoc);
    
    if (!result.acknowledged || !result.insertedId) {
      throw new Error('数据库插入操作未确认');
    }

    console.log('故事保存成功, ID:', result.insertedId);

    return {
      success: true,
      storyId: result.insertedId.toString(),
      message: '故事已成功保存到"我的故事"中！'
    };
  } catch (error: any) {
    console.error('保存故事服务错误:', error);
    
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
    
    if (error.code === 'DATABASE_ERROR') {
      throw error;
    }
    
    const customError = new Error('获取故事详情失败');
    (customError as any).code = 'DATABASE_ERROR';
    throw customError;
  }
}

/**
 * 生成故事预览文本
 */
function generatePreview(content: string, maxLength: number = 50): string {
  try {
    // 尝试解析JSON格式的故事内容
    const parsed = JSON.parse(content);
    if (typeof parsed === 'object' && parsed.storySegment) {
      const preview = parsed.storySegment.substring(0, maxLength);
      return preview.length < parsed.storySegment.length ? preview + '...' : preview;
    }
  } catch {
    // 如果不是JSON格式，直接截取文本
  }
  
  const preview = content.substring(0, maxLength);
  return preview.length < content.length ? preview + '...' : preview;
}
