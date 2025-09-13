import axios from 'axios';

// 使用集中化配置加载器
const { getTypedConfig } = require('../../../config/env-loader');

const typedConfig = getTypedConfig();
const DEEPSEEK_API_URL = typedConfig.api.deepseek.apiUrl;
const DEEPSEEK_API_KEY = typedConfig.api.deepseek.apiKey;

console.log('🔑 DeepSeek API Key 加载状态:', DEEPSEEK_API_KEY ? `已加载 (${DEEPSEEK_API_KEY.substring(0, 10)}...)` : '未找到');

if (!DEEPSEEK_API_KEY) {
  console.warn('⚠️  未配置DeepSeek API Key，将使用模拟数据进行测试');
}

// 创建DeepSeek API客户端
export const deepseekClient = axios.create({
  baseURL: DEEPSEEK_API_URL,
  timeout: 180000, // 增加到180秒超时，适应AI推理/生成
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
  },
  // 添加重试和连接配置
  maxRedirects: 5,
  // 添加请求重试配置
  validateStatus: function (status) {
    return status >= 200 && status < 300; // 只有2xx状态码才算成功
  }
});

// 添加请求重试拦截器
deepseekClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config;
    
    // 设置默认重试次数
    if (!config.__retryCount) {
      config.__retryCount = 0;
    }
    
    // 判断是否应该重试
    const shouldRetry = 
      config.__retryCount < 3 && // 最多重试3次
      (
        error.code === 'ECONNRESET' ||
        error.code === 'ENOTFOUND' ||
        error.code === 'ECONNREFUSED' ||
        error.code === 'ETIMEDOUT' ||
        (error.response && [502, 503, 504].includes(error.response.status))
      );
    
    if (shouldRetry) {
      config.__retryCount += 1;
      console.log(`🔄 网络请求失败，正在进行第 ${config.__retryCount} 次重试...`);
      
      // 指数退避延迟：1秒、2秒、4秒
      const delay = Math.pow(2, config.__retryCount - 1) * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
      
      return deepseekClient(config);
    }
    
    return Promise.reject(error);
  }
);

// DeepSeek API参数配置
export const DEEPSEEK_CONFIG = {
  // V3.1 非思考模式 - 用于快速内容生成
  CHAT_MODEL: 'deepseek-chat',
  // V3.1 思考模式 - 用于深度推理和构思
  REASONER_MODEL: 'deepseek-reasoner',
  // 每次至少500字的片段 + 3个选项的文本，增加最大token
  MAX_TOKENS: 2000,
  TEMPERATURE: 0.7,
  STREAM: false
} as const;

// 故事生成的系统提示词（针对8-12岁儿童优化）
export const STORY_SYSTEM_PROMPT = `你是一个专业的儿童故事创作助手。请根据以下要求创作睡前故事：

1. 内容要求：
   - 适合8-12岁儿童，内容富有想象力和适度挑战性
   - 语言生动有趣，可使用丰富词汇和复杂句式
   - 情节可以更加曲折，包含悬念、转折和问题解决
   - 避免暴力、恐怖内容，但可包含冒险和轻微紧张情节
   - 融入教育元素：科学知识、历史文化、逻辑思维

2. 格式要求：
   - 每次生成一个故事片段（800-1200字，内容更加丰富）
   - 提供3个具有策略性和思考性的后续选择（除非已达结尾）
   - 选择应涉及问题解决、道德判断或创意思维
   - 用JSON格式返回：{"storySegment": "故事内容", "choices": ["选择1", "选择2", "选择3"], "isEnding": false}

3. 故事发展：
   - 根据用户选择继续发展故事，承接上文情节，保持连贯性
   - 可适当增加互动次数到8-15次，支持更复杂的故事发展
   - 结尾要有深度和启发性，适合睡前思考
   - 当故事结束时，设置"isEnding": true，并且"choices"为空数组

请始终用JSON格式回复，确保格式正确。`;

// 故事继续的提示词模板
export const STORY_CONTINUE_PROMPT = (
  topic: string,
  currentStory: string,
  selectedChoice: string,
  turnIndex?: number,
  maxChoices?: number,
  forceEnding?: boolean
) => `
当前主题：${topic}
当前故事内容（从开头到此处）：
${currentStory}

用户刚刚选择了：${selectedChoice}
${typeof turnIndex === 'number' && typeof maxChoices === 'number' ? `
这是第 ${turnIndex + 1} 次互动（从1开始计数），本故事计划总互动次数为 ${maxChoices} 次。
` : ''}
${forceEnding ? '注意：这是最后一次互动，请生成有深度、启发性的结局（800-1000字），并将 isEnding 设为 true，choices 设为空数组。结局应当有教育意义和思考价值。' : '请继续这个故事，生成一个800-1200字的精彩片段，包含更复杂的情节发展和角色互动。给出3个具有策略性、需要思考的选择，每个选择都应该导向不同的故事发展方向。'}

请严格使用JSON格式回复：{"storySegment": "...", "choices": ["...","...","..."], "isEnding": false}`;

// 故事树一次性生成的系统提示词
export const STORY_TREE_SYSTEM_PROMPT = `你是一个专业的儿童故事创作助手。现在需要为给定主题创建一个完整的互动故事树结构。

要求：
1. 故事结构：3轮互动，每轮2个选择，形成8条完整的故事路径
2. 内容要求：
   - 适合3-8岁儿童，内容温馨正面
   - 每个故事片段不少于500字
   - 语言简单易懂，富有想象力
   - 所有8个结局都要温馨完整

3. 输出格式：返回JSON，包含完整的故事树结构
{
  "root": {
    "segment": "开头故事片段(800-1200字)",
    "choices": ["选择A", "选择B"],
    "children": [
      {
        "segment": "选择A后的故事(800-1200字)", 
        "choices": ["选择A1", "选择A2"],
        "children": [
          {
            "segment": "A1路径结局(800-1200字)",
            "choices": [],
            "isEnding": true
          },
          {
            "segment": "A2路径结局(800-1200字)", 
            "choices": [],
            "isEnding": true
          }
        ]
      },
      {
        "segment": "选择B后的故事(800-1200字)",
        "choices": ["选择B1", "选择B2"], 
        "children": [
          {
            "segment": "B1路径结局(800-1200字)",
            "choices": [],
            "isEnding": true
          },
          {
            "segment": "B2路径结局(800-1200字)",
            "choices": [],
            "isEnding": true  
          }
        ]
      }
    ]
  }
}

确保每个故事片段都达到800-1200字，所有路径都完整且逻辑连贯，具有教育价值。`;

// 故事树节点生成提示词 
export const STORY_TREE_NODE_PROMPT = (
  topic: string,
  parentStory: string,
  selectedChoice: string,
  depth: number,
  isLastLevel: boolean
) => `
主题：${topic}
父级故事内容：${parentStory}
用户选择：${selectedChoice}
当前深度：${depth}/3

${isLastLevel 
  ? '这是最后一层，请生成有深度和教育意义的结局片段(800-1200字)，适合8-12岁儿童，内容应引发思考。不需要提供选择。'
  : '请基于上述内容继续故事，生成800-1200字的精彩片段，适合8-12岁儿童。包含更复杂的情节和角色发展，并提供2个具有策略性的选择。'
}

请用JSON格式回复：
${isLastLevel 
  ? '{"segment": "结局内容...", "choices": [], "isEnding": true}'
  : '{"segment": "故事内容...", "choices": ["选择1", "选择2"], "isEnding": false}'
}`;

// 故事构思专用提示词（思考模式）
export const STORY_PLANNING_PROMPT = `你是一个专业的儿童故事构思师，需要为给定主题设计完整的故事树结构。

任务：为主题进行深度思考和规划，设计一个包含3轮选择的完整故事树：
- 第1轮：根据主题设定，提供2个初始方向选择
- 第2轮：每个分支再提供2个发展选择  
- 第3轮：最终形成4个不同的温馨结局

要求：
1. 故事结构要逻辑清晰，每个分支都有独特的发展路径
2. 所有结局都要积极正面，适合3-8岁儿童
3. 确保每个故事片段都能达到500字以上
4. 选择项要具体有趣，能够激发儿童想象力

请深度思考后，返回JSON格式的故事结构规划：
{
  "theme_analysis": "主题分析和理解",
  "story_outline": {
    "opening": "开场设定描述",
    "first_choices": ["选择A描述", "选择B描述"],
    "branches": [
      {
        "path": "A",
        "development": "A分支发展",
        "second_choices": ["A1选择", "A2选择"],
        "endings": ["A1结局概要", "A2结局概要"]
      },
      {
        "path": "B", 
        "development": "B分支发展",
        "second_choices": ["B1选择", "B2选择"],
        "endings": ["B1结局概要", "B2结局概要"]
      }
    ]
  },
  "content_guidelines": "内容创作指导原则"
}`;

// 故事写作专用提示词（非思考模式）
export const STORY_WRITING_PROMPT = (
  outline: string,
  segment_type: 'opening' | 'branch' | 'ending',
  context: string
) => `你是一个专业的儿童故事作家，请根据已规划好的故事结构进行具体的内容创作。

故事规划：
${outline}

当前任务：创作${segment_type === 'opening' ? '故事开头' : segment_type === 'branch' ? '中间发展片段' : '结局片段'}

上下文：${context}

写作要求：
1. 内容不少于500字，生动有趣
2. 语言适合3-8岁儿童，简单易懂
3. 情节发展自然流畅，符合规划
4. 描述要有画面感，激发想象力

返回JSON格式：
{
  "segment": "故事内容（500+字）",
  "choices": ${segment_type === 'ending' ? '[]' : '["选择1", "选择2"]'},
  "isEnding": ${segment_type === 'ending' ? 'true' : 'false'}
}`;

// 故事质量检查提示词（思考模式）
export const STORY_REVIEW_PROMPT = (content: string, expected_length: number = 500) => `你是一个专业的儿童故事编辑，请仔细检查以下故事内容的质量。

故事内容：
${content}

检查标准：
1. 内容是否适合3-8岁儿童（无暴力、恐怖内容）
2. 字数是否达到${expected_length}字以上
3. 语言是否简单易懂，有趣生动
4. 情节是否合理，有教育意义
5. 是否激发儿童想象力和好奇心

请深度思考后返回检查结果：
{
  "approved": true/false,
  "word_count": 实际字数,
  "quality_score": 1-10分,
  "issues": ["问题1", "问题2"] 或 [],
  "suggestions": ["改进建议1", "改进建议2"] 或 [],
  "summary": "总体评价"
}`;
