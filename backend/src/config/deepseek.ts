import axios from 'axios';

// DeepSeek API配置
const DEEPSEEK_API_URL = process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com';
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

if (!DEEPSEEK_API_KEY) {
  console.warn('⚠️  未配置DeepSeek API Key，将使用模拟数据进行测试');
}

// 创建DeepSeek API客户端
export const deepseekClient = axios.create({
  baseURL: DEEPSEEK_API_URL,
  timeout: 30000, // 30秒超时
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
  }
});

// DeepSeek API参数配置
export const DEEPSEEK_CONFIG = {
  MODEL: 'deepseek-chat', // V3.1 非思考模式，适合故事生成
  // 每次至少500字的片段 + 3个选项的文本，增加最大token
  MAX_TOKENS: 2000,
  TEMPERATURE: 0.7,
  STREAM: false
} as const;

// 故事生成的系统提示词
export const STORY_SYSTEM_PROMPT = `你是一个专业的儿童故事创作助手。请根据以下要求创作睡前故事：

1. 内容要求：
   - 适合3-8岁儿童，内容温馨正面
   - 语言简单易懂，句子不要太长
   - 避免暴力、恐怖或不适合儿童的内容
   - 富有想象力和童趣

2. 格式要求：
   - 每次生成一个故事片段（至少500字）
   - 在故事片段后提供恰好3个逻辑合理、贴合当前剧情的后续情节选择（除非已经到达结尾）
   - 用JSON格式返回：{"storySegment": "故事内容", "choices": ["选择1", "选择2", "选择3"], "isEnding": false}

3. 故事发展：
   - 根据用户选择继续发展故事，承接上文情节，保持前后连贯，不要重启故事
   - 互动次数控制在5-10次内结束（遵循调用方提供的turnIndex/maxChoices约束）
   - 结尾要温馨，适合睡前氛围
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
${forceEnding ? '注意：这是最后一次互动，请生成温馨、合理的结局，并将 isEnding 设为 true，choices 设为空数组。' : '请继续这个故事，生成一个至少500字的片段，并给出恰好3个符合逻辑的新选择。'}

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
    "segment": "开头故事片段(500+字)",
    "choices": ["选择A", "选择B"],
    "children": [
      {
        "segment": "选择A后的故事(500+字)", 
        "choices": ["选择A1", "选择A2"],
        "children": [
          {
            "segment": "A1路径结局(500+字)",
            "choices": [],
            "isEnding": true
          },
          {
            "segment": "A2路径结局(500+字)", 
            "choices": [],
            "isEnding": true
          }
        ]
      },
      {
        "segment": "选择B后的故事(500+字)",
        "choices": ["选择B1", "选择B2"], 
        "children": [
          {
            "segment": "B1路径结局(500+字)",
            "choices": [],
            "isEnding": true
          },
          {
            "segment": "B2路径结局(500+字)",
            "choices": [],
            "isEnding": true  
          }
        ]
      }
    ]
  }
}

确保每个故事片段都不少于500字，所有路径都完整且逻辑连贯。`;

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
  ? '这是最后一层，请生成温馨的结局片段(500+字)，不需要提供选择。'
  : '请基于上述内容继续故事，生成500+字的片段，并提供恰好2个选择。'
}

请用JSON格式回复：
${isLastLevel 
  ? '{"segment": "结局内容...", "choices": [], "isEnding": true}'
  : '{"segment": "故事内容...", "choices": ["选择1", "选择2"], "isEnding": false}'
}`;
