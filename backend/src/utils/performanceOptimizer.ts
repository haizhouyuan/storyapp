/**
 * P1级别性能优化工具
 * 提供智能缓存、内存管理和性能监控功能
 */

import NodeCache from 'node-cache';
import { logger, EventType, LogLevel } from './logger';

// 故事生成缓存（智能TTL）
const storyCache = new NodeCache({
  stdTTL: 3600, // 1小时默认TTL
  checkperiod: 300, // 5分钟检查过期
  maxKeys: 1000, // 最多缓存1000个故事
  useClones: false // 提升性能，不克隆对象
});

// API响应缓存（短期）
const apiCache = new NodeCache({
  stdTTL: 300, // 5分钟TTL
  checkperiod: 60, // 1分钟检查
  maxKeys: 500
});

// 智能内存管理器
class MemoryManager {
  private static instance: MemoryManager;
  private memoryThreshold = 0.8; // 80%内存阈值
  private cleanupInProgress = false;
  
  public static getInstance(): MemoryManager {
    if (!MemoryManager.instance) {
      MemoryManager.instance = new MemoryManager();
    }
    return MemoryManager.instance;
  }
  
  /**
   * 检查内存使用情况
   */
  public checkMemoryUsage(): { usage: number; needsCleanup: boolean } {
    const memUsage = process.memoryUsage();
    const totalMem = memUsage.heapTotal;
    const usedMem = memUsage.heapUsed;
    const usageRatio = usedMem / totalMem;
    
    return {
      usage: usageRatio,
      needsCleanup: usageRatio > this.memoryThreshold
    };
  }
  
  /**
   * 智能清理内存
   */
  public async performCleanup(): Promise<void> {
    if (this.cleanupInProgress) return;
    
    this.cleanupInProgress = true;
    logger.info(EventType.PERFORMANCE_OPTIMIZATION, '开始智能内存清理');
    
    try {
      // 清理过期缓存
      storyCache.flushAll();
      apiCache.flushAll();
      
      // 手动GC（如果可用）
      if (global.gc) {
        global.gc();
      }
      
      const afterCleanup = this.checkMemoryUsage();
      logger.info(EventType.PERFORMANCE_OPTIMIZATION, '内存清理完成', {
        memoryUsageAfter: afterCleanup.usage,
        cacheCleared: true
      });
    } catch (error) {
      logger.error(EventType.PERFORMANCE_OPTIMIZATION, '内存清理失败', error as Error);
    } finally {
      this.cleanupInProgress = false;
    }
  }
  
  /**
   * 启动自动内存监控
   */
  public startMemoryMonitoring(): void {
    setInterval(() => {
      const memStatus = this.checkMemoryUsage();
      if (memStatus.needsCleanup) {
        this.performCleanup();
      }
    }, 30000); // 每30秒检查一次
  }
}

/**
 * 智能故事缓存管理器
 */
export class StoryCache {
  /**
   * 生成缓存键
   */
  private static generateCacheKey(
    type: 'progressive' | 'tree', 
    topic: string, 
    context?: any
  ): string {
    const contextHash = context ? JSON.stringify(context).slice(0, 100) : '';
    return `story:${type}:${topic}:${Buffer.from(contextHash).toString('base64').slice(0, 20)}`;
  }
  
  /**
   * 获取缓存的故事
   */
  public static get(
    type: 'progressive' | 'tree',
    topic: string,
    context?: any
  ): any | null {
    const key = this.generateCacheKey(type, topic, context);
    const cached = storyCache.get(key);
    
    if (cached) {
      logger.debug(EventType.PERFORMANCE_OPTIMIZATION, '故事缓存命中', {
        cacheKey: key,
        type,
        topic
      });
    }
    
    return cached || null;
  }
  
  /**
   * 缓存故事（智能TTL）
   */
  public static set(
    type: 'progressive' | 'tree',
    topic: string,
    data: any,
    context?: any
  ): void {
    const key = this.generateCacheKey(type, topic, context);
    
    // 智能TTL：复杂故事缓存时间更长
    let ttl = 3600; // 默认1小时
    if (type === 'tree') {
      ttl = 7200; // 故事树缓存2小时
    }
    if (typeof data === 'object' && data.storySegment?.length > 1000) {
      ttl = 5400; // 长故事缓存1.5小时
    }
    
    storyCache.set(key, data, ttl);
    
    logger.debug(EventType.PERFORMANCE_OPTIMIZATION, '故事已缓存', {
      cacheKey: key,
      type,
      topic,
      ttl,
      dataSize: JSON.stringify(data).length
    });
  }
  
  /**
   * 清除特定主题的缓存
   */
  public static clearTopic(topic: string): void {
    const keys = storyCache.keys();
    const topicKeys = keys.filter(key => key.includes(`:${topic}:`));
    
    topicKeys.forEach(key => storyCache.del(key));
    
    logger.info(EventType.PERFORMANCE_OPTIMIZATION, '主题缓存已清除', {
      topic,
      clearedKeys: topicKeys.length
    });
  }
  
  /**
   * 获取缓存统计信息
   */
  public static getStats(): any {
    const stats = storyCache.getStats();
    return {
      ...stats,
      memoryUsage: MemoryManager.getInstance().checkMemoryUsage()
    };
  }
}

/**
 * API响应缓存管理器
 */
export class ApiCache {
  /**
   * 生成API缓存键
   */
  private static generateApiKey(method: string, url: string, body?: any): string {
    const bodyHash = body ? Buffer.from(JSON.stringify(body)).toString('base64').slice(0, 20) : '';
    return `api:${method}:${url}:${bodyHash}`;
  }
  
  /**
   * 获取API缓存
   */
  public static get(method: string, url: string, body?: any): any | null {
    const key = this.generateApiKey(method, url, body);
    return apiCache.get(key) || null;
  }
  
  /**
   * 缓存API响应
   */
  public static set(method: string, url: string, data: any, body?: any, ttl?: number): void {
    const key = this.generateApiKey(method, url, body);
    apiCache.set(key, data, ttl || 300);
  }
}

/**
 * 请求去重器（防止重复请求）
 */
export class RequestDeduplicator {
  private static pendingRequests = new Map<string, Promise<any>>();
  
  /**
   * 执行去重请求
   */
  public static async execute<T>(
    key: string,
    requestFn: () => Promise<T>,
    ttl: number = 5000
  ): Promise<T> {
    // 如果相同请求正在进行中，返回现有Promise
    if (this.pendingRequests.has(key)) {
      logger.debug(EventType.PERFORMANCE_OPTIMIZATION, '请求去重命中', { requestKey: key });
      return this.pendingRequests.get(key) as Promise<T>;
    }
    
    // 创建新请求
    const requestPromise = requestFn();
    this.pendingRequests.set(key, requestPromise);
    
    // 设置清理定时器
    setTimeout(() => {
      this.pendingRequests.delete(key);
    }, ttl);
    
    try {
      const result = await requestPromise;
      return result;
    } catch (error) {
      // 请求失败时立即清理
      this.pendingRequests.delete(key);
      throw error;
    }
  }
}

/**
 * 性能监控工具
 */
export class PerformanceMonitor {
  private static metrics = {
    apiCalls: 0,
    cacheHits: 0,
    cacheMisses: 0,
    avgResponseTime: 0,
    totalResponseTime: 0,
    errors: 0
  };
  
  /**
   * 记录API调用
   */
  public static recordApiCall(duration: number, isError: boolean = false): void {
    this.metrics.apiCalls++;
    this.metrics.totalResponseTime += duration;
    this.metrics.avgResponseTime = this.metrics.totalResponseTime / this.metrics.apiCalls;
    
    if (isError) {
      this.metrics.errors++;
    }
  }
  
  /**
   * 记录缓存命中
   */
  public static recordCacheHit(): void {
    this.metrics.cacheHits++;
  }
  
  /**
   * 记录缓存未命中
   */
  public static recordCacheMiss(): void {
    this.metrics.cacheMisses++;
  }
  
  /**
   * 获取性能指标
   */
  public static getMetrics(): any {
    const cacheHitRate = this.metrics.cacheHits / (this.metrics.cacheHits + this.metrics.cacheMisses) || 0;
    const errorRate = this.metrics.errors / this.metrics.apiCalls || 0;
    
    return {
      ...this.metrics,
      cacheHitRate: Math.round(cacheHitRate * 100) / 100,
      errorRate: Math.round(errorRate * 100) / 100,
      memoryUsage: MemoryManager.getInstance().checkMemoryUsage()
    };
  }
  
  /**
   * 重置指标
   */
  public static resetMetrics(): void {
    this.metrics = {
      apiCalls: 0,
      cacheHits: 0,
      cacheMisses: 0,
      avgResponseTime: 0,
      totalResponseTime: 0,
      errors: 0
    };
  }
}

// 启动内存监控
MemoryManager.getInstance().startMemoryMonitoring();

export { MemoryManager };