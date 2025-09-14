import axios from 'axios';
import { sanitizeUserInput, sanitizeAPIResponse, containsPotentialScript } from './security';
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
  ApiError
} from '../../../shared/types';

// API基础配置
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

// 创建axios实例
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 180000, // 3分钟超时 - 适应故事树生成需要的时间
  headers: {
    'Content-Type': 'application/json',
  }
});

// 请求拦截器 - 添加日志和安全验证
apiClient.interceptors.request.use(
  (config) => {
    console.log(`🚀 API请求: ${config.method?.toUpperCase()} ${config.url}`);
    
    // 验证请求数据是否安全
    if (config.data && typeof config.data === 'object') {
      // 检查请求数据中是否包含潜在的脚本注入
      const dataStr = JSON.stringify(config.data);
      if (containsPotentialScript(dataStr)) {
        console.warn('🔒 检测到潜在的安全风险，拒绝发送请求');
        return Promise.reject(new Error('请求包含不安全的内容'));
      }
      
      // 清理请求数据中的字符串字段
      if (config.data.topic) {
        config.data.topic = sanitizeUserInput(config.data.topic);
      }
      if (config.data.title) {
        config.data.title = sanitizeUserInput(config.data.title);
      }
      if (config.data.content) {
        config.data.content = sanitizeUserInput(config.data.content);
      }
    }
    
    return config;
  },
  (error) => {
    console.error('❌ API请求错误:', error);
    return Promise.reject(error);
  }
);

// 响应拦截器 - 统一错误处理和响应清理
apiClient.interceptors.response.use(
  (response) => {
    console.log(`✅ API响应: ${response.config.url}`, response.status);
    
    // 清理响应数据中的字符串内容
    if (response.data && typeof response.data === 'object') {
      if (response.data.storySegment) {
        response.data.storySegment = sanitizeAPIResponse(response.data.storySegment);
      }
      if (response.data.choices && Array.isArray(response.data.choices)) {
        response.data.choices = response.data.choices.map((choice: string) => 
          sanitizeAPIResponse(choice)
        );
      }
      if (response.data.title) {
        response.data.title = sanitizeAPIResponse(response.data.title);
      }
      if (response.data.content) {
        response.data.content = sanitizeAPIResponse(response.data.content);
      }
      
      // 清理故事列表数据
      if (response.data.stories && Array.isArray(response.data.stories)) {
        response.data.stories = response.data.stories.map((story: any) => ({
          ...story,
          title: story.title ? sanitizeAPIResponse(story.title) : story.title,
          content: story.content ? sanitizeAPIResponse(story.content) : story.content
        }));
      }
    }
    
    return response;
  },
  (error) => {
    console.error('❌ API响应错误:', error);
    
    const apiError: ApiError = {
      message: '请求失败，请稍后再试',
      status: error.response?.status || 500,
      code: error.response?.data?.code || 'UNKNOWN_ERROR'
    };

    // 根据错误状态码定制错误消息
    if (error.response) {
      const status = error.response.status;
      const serverMessage = error.response.data?.error || error.response.data?.message;
      
      if (status === 400) {
        apiError.message = serverMessage || '请求参数错误';
      } else if (status === 404) {
        apiError.message = serverMessage || '请求的资源不存在';
      } else if (status === 429) {
        apiError.message = '请求次数过多，请稍后再试';
      } else if (status >= 500) {
        apiError.message = '服务器暂时不可用，请稍后再试';
      } else {
        apiError.message = serverMessage || apiError.message;
      }
    } else if (error.code === 'ECONNABORTED') {
      apiError.message = '请求超时，请检查网络连接';
    } else if (error.code === 'NETWORK_ERROR') {
      apiError.message = '网络连接失败，请检查网络';
    }

    return Promise.reject(apiError);
  }
);

/**
 * 生成故事片段
 */
export async function generateStory(params: GenerateStoryRequest): Promise<GenerateStoryResponse> {
  try {
    const response = await apiClient.post('/generate-story', params);
    return response.data;
  } catch (error) {
    console.error('生成故事失败:', error);
    throw error;
  }
}

/**
 * 保存故事
 */
export async function saveStory(params: SaveStoryRequest): Promise<SaveStoryResponse> {
  try {
    const response = await apiClient.post('/save-story', params);
    return response.data;
  } catch (error) {
    console.error('保存故事失败:', error);
    throw error;
  }
}

/**
 * 获取故事列表
 */
export async function getStories(): Promise<GetStoriesResponse> {
  try {
    const response = await apiClient.get('/get-stories');
    return response.data;
  } catch (error) {
    console.error('获取故事列表失败:', error);
    throw error;
  }
}

/**
 * 获取单个故事详情
 */
export async function getStoryById(id: string): Promise<GetStoryResponse> {
  try {
    const response = await apiClient.get(`/get-story/${id}`);
    return response.data;
  } catch (error) {
    console.error('获取故事详情失败:', error);
    throw error;
  }
}

/**
 * 删除故事
 */
export async function deleteStory(id: string): Promise<DeleteStoryResponse> {
  try {
    const response = await apiClient.delete(`/delete-story/${id}`);
    return response.data;
  } catch (error) {
    console.error('删除故事失败:', error);
    throw error;
  }
}

/**
 * 生成完整故事树
 */
export async function generateFullStoryTree(params: GenerateFullStoryRequest): Promise<GenerateFullStoryResponse> {
  try {
    const response = await apiClient.post('/generate-full-story', params);
    return response.data;
  } catch (error) {
    console.error('生成故事树失败:', error);
    throw error;
  }
}

/**
 * 健康检查
 */
export async function healthCheck(): Promise<any> {
  try {
    const response = await apiClient.get('/health');
    return response.data;
  } catch (error) {
    console.error('健康检查失败:', error);
    throw error;
  }
}