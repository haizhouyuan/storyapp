import DOMPurify from 'dompurify';

/**
 * 用户输入安全验证和清理工具
 * 用于防护XSS攻击和恶意输入
 */

// DOMPurify配置 - 针对儿童应用的严格配置
const PURIFY_CONFIG: DOMPurify.Config = {
  // 只允许安全的标签和属性
  ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'span'],
  ALLOWED_ATTR: [],
  // 移除所有不安全的内容
  KEEP_CONTENT: false,
  // 返回字符串而非DocumentFragment
  RETURN_DOM: false,
  RETURN_DOM_FRAGMENT: false,
  // 移除脚本和样式
  FORBID_TAGS: ['script', 'object', 'embed', 'base', 'link', 'meta', 'style'],
  FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'style', 'href', 'src']
};

/**
 * 清理和验证用户输入的文本内容
 * 用于故事主题、用户选择等输入
 */
export function sanitizeUserInput(input: string): string {
  if (!input || typeof input !== 'string') {
    return '';
  }

  // 1. 基本清理：移除前后空格
  let cleaned = input.trim();

  // 2. 长度限制
  if (cleaned.length > 500) {
    cleaned = cleaned.substring(0, 500);
  }

  // 3. 使用DOMPurify清理潜在的HTML/Script注入
  cleaned = DOMPurify.sanitize(cleaned, PURIFY_CONFIG);

  // 4. 移除可能的控制字符和特殊字符
  cleaned = cleaned.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  // 5. 规范化Unicode字符（防止同形字符攻击）
  cleaned = cleaned.normalize('NFKC');

  return cleaned;
}

/**
 * 验证并清理故事主题输入
 * 包含儿童内容适宜性检查
 */
export function validateAndSanitizeStoryTopic(topic: string): {
  isValid: boolean;
  sanitized: string;
  error?: string;
} {
  // 先进行基本清理
  const sanitized = sanitizeUserInput(topic);

  // 验证是否为空
  if (!sanitized) {
    return {
      isValid: false,
      sanitized: '',
      error: '请输入故事主题'
    };
  }

  // 长度验证
  if (sanitized.length < 2) {
    return {
      isValid: false,
      sanitized,
      error: '故事主题太短，至少需要2个字符'
    };
  }

  if (sanitized.length > 100) {
    return {
      isValid: false,
      sanitized,
      error: '故事主题太长，不能超过100个字符'
    };
  }

  // 儿童内容适宜性检查
  const inappropriateKeywords = [
    // 暴力相关
    '暴力', '打架', '杀', '死', '血', '战争', '武器', '枪', '刀',
    // 恐怖相关
    '恐怖', '鬼', '怪物', '吓人', '噩梦', '黑暗', '魔鬼',
    // 不当内容
    '成人', '色情', '裸体', '性', '毒品', '酒精', '赌博',
    // 负面情绪
    '绝望', '痛苦', '折磨', '虐待', '欺凌'
  ];

  const lowerCaseTopic = sanitized.toLowerCase();
  const foundInappropriate = inappropriateKeywords.find(keyword => 
    lowerCaseTopic.includes(keyword)
  );

  if (foundInappropriate) {
    return {
      isValid: false,
      sanitized,
      error: '请输入适合儿童的故事主题，避免使用不当词汇'
    };
  }

  // 检查是否包含可疑的模式（如连续特殊字符）
  if (/[!@#$%^&*()_+=\[\]{}|\\:";'<>?,./]{3,}/.test(sanitized)) {
    return {
      isValid: false,
      sanitized,
      error: '故事主题包含过多特殊字符'
    };
  }

  return {
    isValid: true,
    sanitized
  };
}

/**
 * 清理API响应内容
 * 确保从服务器返回的内容也是安全的
 */
export function sanitizeAPIResponse(content: string): string {
  if (!content || typeof content !== 'string') {
    return '';
  }

  // 使用更宽松的配置清理API响应，保留基本格式
  const apiConfig: DOMPurify.Config = {
    ...PURIFY_CONFIG,
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'span', 'div'],
    KEEP_CONTENT: true
  };

  return DOMPurify.sanitize(content, apiConfig);
}

/**
 * 清理存储数据
 * 确保存储到localStorage的数据是安全的
 */
export function sanitizeStorageData(data: any): any {
  if (typeof data === 'string') {
    return sanitizeUserInput(data);
  }

  if (Array.isArray(data)) {
    return data.map(item => sanitizeStorageData(item));
  }

  if (data && typeof data === 'object') {
    const sanitizedObj: any = {};
    for (const key in data) {
      if (data.hasOwnProperty(key)) {
        // 清理键名
        const cleanKey = sanitizeUserInput(key);
        if (cleanKey) {
          sanitizedObj[cleanKey] = sanitizeStorageData(data[key]);
        }
      }
    }
    return sanitizedObj;
  }

  return data;
}

/**
 * 检查字符串是否包含潜在的脚本注入
 */
export function containsPotentialScript(input: string): boolean {
  if (!input || typeof input !== 'string') {
    return false;
  }

  const dangerousPatterns = [
    /<script/i,
    /javascript:/i,
    /on\w+\s*=/i,
    /<iframe/i,
    /<object/i,
    /<embed/i,
    /eval\s*\(/i,
    /document\./i,
    /window\./i
  ];

  return dangerousPatterns.some(pattern => pattern.test(input));
}

/**
 * 安全的HTML内容渲染辅助函数
 * 用于在React组件中安全地渲染用户生成的内容
 */
export function createSafeHTML(content: string): { __html: string } {
  const cleaned = sanitizeAPIResponse(content);
  return { __html: cleaned };
}

/**
 * 验证文件名（用于导出或上传功能）
 */
export function validateFileName(filename: string): {
  isValid: boolean;
  sanitized: string;
  error?: string;
} {
  if (!filename || typeof filename !== 'string') {
    return {
      isValid: false,
      sanitized: '',
      error: '文件名不能为空'
    };
  }

  // 清理文件名
  let sanitized = sanitizeUserInput(filename);

  // 移除不安全的文件名字符
  sanitized = sanitized.replace(/[<>:"/\\|?*\x00-\x1f]/g, '');

  // 移除前后的点
  sanitized = sanitized.replace(/^\.+|\.+$/g, '');

  if (!sanitized) {
    return {
      isValid: false,
      sanitized: '',
      error: '文件名无效'
    };
  }

  if (sanitized.length > 255) {
    sanitized = sanitized.substring(0, 255);
  }

  // 检查是否为保留文件名（Windows）
  const reservedNames = [
    'CON', 'PRN', 'AUX', 'NUL',
    'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
    'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'
  ];

  if (reservedNames.includes(sanitized.toUpperCase())) {
    return {
      isValid: false,
      sanitized,
      error: '文件名为系统保留名称'
    };
  }

  return {
    isValid: true,
    sanitized
  };
}

/**
 * 安全的JSON解析
 * 防止JSON注入攻击
 */
export function safeJSONParse<T = any>(jsonString: string): T | null {
  try {
    // 基本验证
    if (!jsonString || typeof jsonString !== 'string') {
      return null;
    }

    // 检查是否包含潜在危险的模式
    if (containsPotentialScript(jsonString)) {
      console.warn('检测到潜在的脚本注入，拒绝解析JSON');
      return null;
    }

    // 长度限制
    if (jsonString.length > 10000) { // 10KB限制
      console.warn('JSON字符串过长，可能存在安全风险');
      return null;
    }

    const parsed = JSON.parse(jsonString);

    // 递归清理解析后的对象
    return sanitizeStorageData(parsed);
  } catch (error) {
    console.error('JSON解析失败:', error);
    return null;
  }
}