import type { StorySession } from '../../../shared/types';

// 本地存储工具函数

const STORAGE_KEYS = {
  STORY_SESSION: 'storyapp_current_session',
  STORY_HISTORY: 'storyapp_story_history',
  USER_PREFERENCES: 'storyapp_user_preferences'
} as const;

export interface UserPreferences {
  soundEnabled: boolean;
  animationEnabled: boolean;
  fontSize: 'small' | 'medium' | 'large';
  theme: 'default' | 'dark' | 'high-contrast';
  voiceId?: string;
  speechSpeed: number;
  speechPitch: number;
  autoPlay: boolean;
  mute: boolean;
  showTranscript: boolean;
  lastProvider?: string;
}

export const defaultPreferences: UserPreferences = {
  soundEnabled: true,
  animationEnabled: true,
  fontSize: 'medium',
  theme: 'default',
  speechSpeed: 1,
  speechPitch: 1,
  autoPlay: false,
  mute: false,
  showTranscript: true,
};

/**
 * 保存当前故事会话到本地存储
 */
export function saveStorySession(session: StorySession): void {
  try {
    localStorage.setItem(STORAGE_KEYS.STORY_SESSION, JSON.stringify(session));
    console.log('故事会话已保存到本地存储');
  } catch (error) {
    console.error('保存故事会话失败:', error);
  }
}

/**
 * 从本地存储获取故事会话
 */
export function getStorySession(): StorySession | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.STORY_SESSION);
    if (!stored) return null;
    
    const session: StorySession = JSON.parse(stored);
    console.log('从本地存储恢复故事会话');
    return session;
  } catch (error) {
    console.error('获取故事会话失败:', error);
    return null;
  }
}

/**
 * 清除当前故事会话
 */
export function clearStorySession(): void {
  try {
    localStorage.removeItem(STORAGE_KEYS.STORY_SESSION);
    console.log('故事会话已清除');
  } catch (error) {
    console.error('清除故事会话失败:', error);
  }
}

/**
 * 保存故事到历史记录
 */
export function saveToHistory(storyData: {
  topic: string;
  content: string;
  timestamp: number;
  duration: number;
}): void {
  try {
    const existing = localStorage.getItem(STORAGE_KEYS.STORY_HISTORY);
    const history = existing ? JSON.parse(existing) : [];
    
    history.unshift(storyData); // 添加到开头
    
    // 限制历史记录数量（最多保存50个）
    if (history.length > 50) {
      history.splice(50);
    }
    
    localStorage.setItem(STORAGE_KEYS.STORY_HISTORY, JSON.stringify(history));
    console.log('故事已保存到历史记录');
  } catch (error) {
    console.error('保存故事历史失败:', error);
  }
}

/**
 * 获取故事历史记录
 */
export function getStoryHistory(): any[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.STORY_HISTORY);
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.error('获取故事历史失败:', error);
    return [];
  }
}

/**
 * 保存用户偏好设置
 */
export function saveUserPreferences(preferences: Partial<UserPreferences>): void {
  try {
    const current = getUserPreferences();
    const payload = { ...current, ...preferences };
    localStorage.setItem(STORAGE_KEYS.USER_PREFERENCES, JSON.stringify(payload));
    console.log('用户偏好已保存');
  } catch (error) {
    console.error('保存用户偏好失败:', error);
  }
}

/**
 * 获取用户偏好设置
 */
export function getUserPreferences(): UserPreferences {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.USER_PREFERENCES);
    if (!stored) {
      return { ...defaultPreferences };
    }
    return { ...defaultPreferences, ...JSON.parse(stored) };
  } catch (error) {
    console.error('获取用户偏好失败:', error);
    return { ...defaultPreferences };
  }
}

/**
 * 清除所有本地存储数据
 */
export function clearAllData(): void {
  try {
    Object.values(STORAGE_KEYS).forEach(key => {
      localStorage.removeItem(key);
    });
    console.log('所有本地数据已清除');
  } catch (error) {
    console.error('清除本地数据失败:', error);
  }
}

/**
 * 检查本地存储可用性
 */
export function isStorageAvailable(): boolean {
  try {
    const test = '__storage_test__';
    localStorage.setItem(test, 'test');
    localStorage.removeItem(test);
    return true;
  } catch {
    return false;
  }
}
