import type { StorySession } from '../../../shared/types';

/**
 * 格式化日期为友好的显示格式
 */
export function formatDate(dateString: string): string {
  try {
    const date = new Date(dateString);
    const now = new Date();
    
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
      return '今天';
    } else if (diffDays === 1) {
      return '昨天';
    } else if (diffDays < 7) {
      return `${diffDays}天前`;
    } else {
      return date.toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    }
  } catch (error) {
    console.error('日期格式化失败:', error);
    return '未知时间';
  }
}

/**
 * 生成故事完整内容用于保存
 */
export function generateStoryContent(session: StorySession): string {
  try {
    const content = {
      topic: session.topic,
      path: session.path,
      isComplete: session.isComplete,
      startTime: session.startTime,
      endTime: Date.now(),
      duration: Date.now() - session.startTime,
      
      // 生成可读的故事文本
      fullStory: session.path.map((pathItem, index) => {
        let text = pathItem.segment;
        if (index < session.path.length - 1 && pathItem.choice) {
          text += `\n\n[选择: ${pathItem.choice}]\n\n`;
        }
        return text;
      }).join('')
    };
    
    return JSON.stringify(content, null, 2);
  } catch (error) {
    console.error('生成故事内容失败:', error);
    return JSON.stringify({ error: '故事内容生成失败' });
  }
}

/**
 * 从故事内容中提取标题
 */
export function extractStoryTitle(content: string, fallbackTopic?: string): string {
  try {
    const parsed = JSON.parse(content);
    
    // 优先使用主题作为标题
    if (parsed.topic && parsed.topic.trim()) {
      return parsed.topic.trim();
    }
    
    // 从第一段故事中提取前几个词作为标题
    if (parsed.fullStory || parsed.path?.[0]?.segment) {
      const firstSegment = parsed.fullStory || parsed.path[0].segment;
      const words = firstSegment.trim().split('').slice(0, 20).join('');
      return words + (firstSegment.length > 20 ? '...' : '');
    }
    
    return fallbackTopic || '未命名故事';
  } catch (error) {
    console.error('提取故事标题失败:', error);
    return fallbackTopic || '未命名故事';
  }
}

/**
 * 检查故事会话是否有效
 */
export function isValidStorySession(session: any): session is StorySession {
  return (
    session &&
    typeof session.topic === 'string' &&
    Array.isArray(session.path) &&
    typeof session.isComplete === 'boolean' &&
    typeof session.startTime === 'number'
  );
}

/**
 * 截断文本到指定长度
 */
export function truncateText(text: string, maxLength: number = 50): string {
  if (!text || text.length <= maxLength) return text;
  
  return text.slice(0, maxLength).trim() + '...';
}

/**
 * 验证故事主题输入
 */
export function validateStoryTopic(topic: string): {
  isValid: boolean;
  error?: string;
} {
  if (!topic || typeof topic !== 'string') {
    return { isValid: false, error: '请输入故事主题' };
  }
  
  const trimmed = topic.trim();
  
  if (trimmed.length === 0) {
    return { isValid: false, error: '故事主题不能为空' };
  }
  
  if (trimmed.length < 2) {
    return { isValid: false, error: '故事主题太短，至少需要2个字符' };
  }
  
  if (trimmed.length > 100) {
    return { isValid: false, error: '故事主题太长，不能超过100个字符' };
  }
  
  // 检查是否包含不适合的内容（简单过滤）
  const inappropriate = ['暴力', '恐怖', '血腥', '战争', '死亡'];
  const hasInappropriate = inappropriate.some(word => 
    trimmed.toLowerCase().includes(word)
  );
  
  if (hasInappropriate) {
    return { isValid: false, error: '请输入适合儿童的故事主题' };
  }
  
  return { isValid: true };
}

/**
 * 播放反馈音效（如果支持）
 */
export function playFeedbackSound(type: 'click' | 'success' | 'error' = 'click'): void {
  try {
    // 检查用户偏好设置
    const preferences = localStorage.getItem('storyapp_user_preferences');
    if (preferences) {
      const { soundEnabled } = JSON.parse(preferences);
      if (!soundEnabled) return;
    }
    
    // Web Audio API 简单实现
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    // 根据类型设置不同的音频参数
    switch (type) {
      case 'click':
        oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(400, audioContext.currentTime + 0.1);
        break;
      case 'success':
        oscillator.frequency.setValueAtTime(523, audioContext.currentTime);
        oscillator.frequency.setValueAtTime(659, audioContext.currentTime + 0.1);
        oscillator.frequency.setValueAtTime(784, audioContext.currentTime + 0.2);
        break;
      case 'error':
        oscillator.frequency.setValueAtTime(300, audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(200, audioContext.currentTime + 0.3);
        break;
    }
    
    gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.3);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.3);
  } catch (error) {
    // 音效播放失败不影响主要功能
    console.debug('音效播放失败:', error);
  }
}

/**
 * 获取随机的鼓励语句
 */
export function getRandomEncouragement(): string {
  const encouragements = [
    '太棒了！继续你的故事冒险吧！',
    '你的想象力真丰富！',
    '这个选择很有趣！',
    '故事变得越来越精彩了！',
    '你是个很棒的故事创作者！',
    '继续探索这个神奇的世界吧！',
    '每个选择都让故事更精彩！',
    '你的故事真有创意！'
  ];
  
  return encouragements[Math.floor(Math.random() * encouragements.length)];
}

/**
 * 生成唯一ID
 */
export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

/**
 * 深拷贝对象
 */
export function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') return obj;
  
  if (obj instanceof Date) return new Date(obj.getTime()) as unknown as T;
  if (obj instanceof Array) return obj.map(item => deepClone(item)) as unknown as T;
  
  const cloned = {} as { [key: string]: any };
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      cloned[key] = deepClone((obj as any)[key]);
    }
  }
  
  return cloned as T;
}