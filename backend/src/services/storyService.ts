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
import type { 
  GenerateStoryRequest, 
  GenerateStoryResponse,
  SaveStoryRequest, 
  SaveStoryResponse,
  GetStoriesResponse,
  GetStoryResponse,
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
      model: DEEPSEEK_CONFIG.CHAT_MODEL,
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
          model: DEEPSEEK_CONFIG.CHAT_MODEL,
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
 * 生成完整故事树服务（增强版 - 双模型协作）
 */
export async function generateFullStoryTreeService(params: GenerateFullStoryRequest): Promise<GenerateFullStoryResponse> {
  try {
    const { topic } = params;
    
    console.log(`开始生成完整故事树，主题: ${topic}`);
    
    // 检查是否有API密钥，没有则使用模拟数据
    if (!process.env.DEEPSEEK_API_KEY) {
      console.log('使用模拟数据生成故事树');
      const storyTreeId = new ObjectId().toString();
      const timestamp = new Date().toISOString();
      return generateMockStoryTree(topic, storyTreeId, timestamp);
    }
    
    // 使用增强的双模型协作生成故事树
    return await generateAdvancedStoryTree(topic);
    
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
    
    // 验证字数要求
    const segmentLength = parsedResponse.segment.replace(/\s/g, '').length;
    if (segmentLength < 500) {
      console.warn(`节点字数不足500字: ${segmentLength}字，路径: ${path}`);
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
 * 扩展故事片段到500字以上
 */
async function expandStorySegment(segment: string): Promise<string | null> {
  try {
    const expandMessages = [
      { 
        role: 'system', 
        content: '你是一个擅长润色儿童故事的助手，请将给定文本保留情节不变地扩展为至少500字，语言温柔、适合3-8岁儿童。只返回扩展后的正文，不要任何额外说明。' 
      },
      { 
        role: 'user', 
        content: segment 
      }
    ];
    
    const expandResp = await deepseekClient.post('/chat/completions', {
      model: DEEPSEEK_CONFIG.CHAT_MODEL,
      messages: expandMessages,
      max_tokens: Math.max(DEEPSEEK_CONFIG.MAX_TOKENS - 200, 800),
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
