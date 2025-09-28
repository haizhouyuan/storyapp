import axios from 'axios';
import type { 
  GenerateStoryRequest,
  GenerateStoryResponse,
  SaveStoryRequest,
  SaveStoryResponse,
  GetStoriesResponse,
  GetStoryResponse,
  DeleteStoryResponse,
  GenerateFullStoryRequest,
  GenerateFullStoryResponse,
  ApiError,
  TtsSynthesisRequest,
  TtsSynthesisResponse,
  TtsVoicesResponse
} from '../../../shared/types';

// API基础配置
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001/api';

// 创建axios实例
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 180000, // 3分钟超时 - 适应故事树生成需要的时间
  headers: {
    'Content-Type': 'application/json',
  }
});

// 请求拦截器 - 添加日志
apiClient.interceptors.request.use(
  (config) => {
    console.log(`🚀 API请求: ${config.method?.toUpperCase()} ${config.url}`);
    return config;
  },
  (error) => {
    console.error('❌ API请求错误:', error);
    return Promise.reject(error);
  }
);

// 响应拦截器 - 统一错误处理
apiClient.interceptors.response.use(
  (response) => {
    console.log(`✅ API响应: ${response.config.url}`, response.status);
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

/**
 * 请求语音合成
 */
export async function requestStorySpeech(params: TtsSynthesisRequest): Promise<TtsSynthesisResponse> {
  try {
    const response = await apiClient.post('/tts', params);
    return response.data;
  } catch (error) {
    console.error('语音合成请求失败:', error);
    throw error;
  }
}

/**
 * 获取可用语音列表
 */
export async function fetchTtsVoices(): Promise<TtsVoicesResponse> {
  try {
    const response = await apiClient.get('/tts/voices');
    return response.data;
  } catch (error) {
    console.error('获取语音列表失败:', error);
    throw error;
  }
}
