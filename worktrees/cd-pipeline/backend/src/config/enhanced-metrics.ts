import client from 'prom-client';
import { register } from './metrics';

/**
 * StoryApp增强监控指标
 * 专门针对儿童故事应用的业务指标
 */

// ===== 故事相关指标 =====

// 故事生成性能指标
export const storyGenerationDuration = new client.Histogram({
  name: 'storyapp_story_generation_duration_seconds',
  help: 'Duration of story generation requests',
  labelNames: ['story_type', 'ai_model', 'success'],
  buckets: [0.5, 1, 2, 5, 10, 15, 30, 60, 120], // 故事生成可能需要较长时间
});

export const storyGenerationTotal = new client.Counter({
  name: 'storyapp_story_generation_total',
  help: 'Total number of story generation requests',
  labelNames: ['story_type', 'ai_model', 'success'],
});

// DeepSeek API调用指标
export const deepseekApiCalls = new client.Counter({
  name: 'storyapp_deepseek_api_calls_total',
  help: 'Total number of DeepSeek API calls',
  labelNames: ['model', 'endpoint', 'status', 'error_type'],
});

export const deepseekTokenUsage = new client.Counter({
  name: 'storyapp_deepseek_tokens_used_total',
  help: 'Total number of tokens used in DeepSeek API calls',
  labelNames: ['model', 'type'], // prompt_tokens, completion_tokens
});

export const deepseekApiLatency = new client.Histogram({
  name: 'storyapp_deepseek_api_latency_seconds',
  help: 'DeepSeek API response latency',
  labelNames: ['model', 'endpoint'],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 20, 30, 60],
});

// 故事质量指标
export const storyQualityScores = new client.Histogram({
  name: 'storyapp_story_quality_score',
  help: 'Story quality assessment scores',
  labelNames: ['assessment_type', 'age_group'],
  buckets: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
});

export const contentValidationResults = new client.Counter({
  name: 'storyapp_content_validation_total',
  help: 'Content validation results',
  labelNames: ['validation_type', 'result', 'severity'],
});

// ===== 用户交互指标 =====

// 故事交互指标
export const storyInteractions = new client.Counter({
  name: 'storyapp_story_interactions_total',
  help: 'Total number of story interactions',
  labelNames: ['interaction_type', 'story_length', 'user_type'],
});

export const storyCompletionRate = new client.Gauge({
  name: 'storyapp_story_completion_rate',
  help: 'Rate of story completion',
  labelNames: ['time_period', 'story_type'],
});

export const userSessionDuration = new client.Histogram({
  name: 'storyapp_user_session_duration_seconds',
  help: 'Duration of user sessions',
  labelNames: ['session_type', 'completion_status'],
  buckets: [30, 60, 120, 300, 600, 1200, 1800, 3600], // 30秒到1小时
});

// 选择分析指标
export const choiceDistribution = new client.Counter({
  name: 'storyapp_story_choices_total',
  help: 'Distribution of story choices made by users',
  labelNames: ['story_theme', 'choice_position', 'choice_type'],
});

// ===== 系统健康指标 =====

// 数据库特定指标
export const mongoDbMetrics = new client.Gauge({
  name: 'storyapp_mongodb_metrics',
  help: 'MongoDB specific metrics',
  labelNames: ['metric_type'], // connections, operations_per_sec, storage_size
});

// 缓存性能指标
export const cacheMetrics = new client.Summary({
  name: 'storyapp_cache_operations',
  help: 'Cache operation performance',
  labelNames: ['operation', 'cache_type', 'hit_miss'],
  percentiles: [0.5, 0.9, 0.99],
});

// 日志记录指标
export const logEventCounter = new client.Counter({
  name: 'storyapp_log_events_total',
  help: 'Total number of log events by level',
  labelNames: ['level', 'component', 'event_type'],
});

// ===== 业务指标 =====

// 故事主题流行度
export const storyThemePopularity = new client.Counter({
  name: 'storyapp_story_themes_total',
  help: 'Popularity of story themes',
  labelNames: ['theme', 'age_group', 'time_of_day'],
});

// 错误率和恢复指标
export const serviceAvailability = new client.Gauge({
  name: 'storyapp_service_availability',
  help: 'Service availability percentage',
  labelNames: ['service_name', 'time_window'],
});

export const errorRecoveryTime = new client.Histogram({
  name: 'storyapp_error_recovery_seconds',
  help: 'Time to recover from errors',
  labelNames: ['error_type', 'component'],
  buckets: [1, 5, 10, 30, 60, 300, 600],
});

// ===== 性能预警指标 =====

// 资源使用预警
export const resourceUtilization = new client.Gauge({
  name: 'storyapp_resource_utilization',
  help: 'Resource utilization percentage',
  labelNames: ['resource_type', 'threshold_level'], // cpu, memory, disk - normal, warning, critical
});

// API响应时间分布
export const apiResponseTimeDistribution = new client.Summary({
  name: 'storyapp_api_response_time_distribution',
  help: 'API response time distribution',
  labelNames: ['endpoint', 'method'],
  percentiles: [0.5, 0.75, 0.9, 0.95, 0.99],
  maxAgeSeconds: 600,
  ageBuckets: 5,
});

// 注册所有增强指标
const enhancedMetrics = [
  storyGenerationDuration,
  storyGenerationTotal,
  deepseekApiCalls,
  deepseekTokenUsage,
  deepseekApiLatency,
  storyQualityScores,
  contentValidationResults,
  storyInteractions,
  storyCompletionRate,
  userSessionDuration,
  choiceDistribution,
  mongoDbMetrics,
  cacheMetrics,
  logEventCounter,
  storyThemePopularity,
  serviceAvailability,
  errorRecoveryTime,
  resourceUtilization,
  apiResponseTimeDistribution,
];

enhancedMetrics.forEach(metric => register.registerMetric(metric as any));

// ===== 辅助函数 =====

/**
 * 记录故事生成指标
 */
export const recordStoryGeneration = (
  storyType: string,
  aiModel: string,
  duration: number,
  success: boolean,
  tokensUsed?: { prompt: number; completion: number }
) => {
  const successLabel = success ? 'true' : 'false';
  
  storyGenerationDuration.observe(
    { story_type: storyType, ai_model: aiModel, success: successLabel },
    duration / 1000
  );
  
  storyGenerationTotal.inc({
    story_type: storyType,
    ai_model: aiModel,
    success: successLabel,
  });
  
  if (tokensUsed) {
    deepseekTokenUsage.inc({ model: aiModel, type: 'prompt' }, tokensUsed.prompt);
    deepseekTokenUsage.inc({ model: aiModel, type: 'completion' }, tokensUsed.completion);
  }
};

/**
 * 记录DeepSeek API调用
 */
export const recordDeepSeekApiCall = (
  model: string,
  endpoint: string,
  status: number,
  errorType: string | null,
  latency: number
) => {
  deepseekApiCalls.inc({
    model,
    endpoint,
    status: status.toString(),
    error_type: errorType || 'none',
  });
  
  deepseekApiLatency.observe(
    { model, endpoint },
    latency / 1000
  );
};

/**
 * 记录用户交互
 */
export const recordUserInteraction = (
  interactionType: string,
  storyLength: string,
  userType: string,
  sessionStartTime?: number
) => {
  storyInteractions.inc({
    interaction_type: interactionType,
    story_length: storyLength,
    user_type: userType,
  });
  
  if (sessionStartTime) {
    const sessionDuration = (Date.now() - sessionStartTime) / 1000;
    userSessionDuration.observe(
      { session_type: 'story', completion_status: 'completed' },
      sessionDuration
    );
  }
};

/**
 * 记录内容验证结果
 */
export const recordContentValidation = (
  validationType: string,
  result: 'pass' | 'fail' | 'warning',
  severity: 'low' | 'medium' | 'high'
) => {
  contentValidationResults.inc({
    validation_type: validationType,
    result,
    severity,
  });
};

/**
 * 更新MongoDB指标
 */
export const updateMongoDbMetrics = async (db: any) => {
  try {
    // 获取数据库统计信息
    const stats = await db.stats();
    
    mongoDbMetrics.set({ metric_type: 'storage_size' }, stats.storageSize || 0);
    mongoDbMetrics.set({ metric_type: 'data_size' }, stats.dataSize || 0);
    mongoDbMetrics.set({ metric_type: 'index_size' }, stats.indexSize || 0);
    mongoDbMetrics.set({ metric_type: 'objects' }, stats.objects || 0);
    
    // 连接信息
    const serverStatus = await db.admin().serverStatus();
    mongoDbMetrics.set({ metric_type: 'connections' }, serverStatus.connections?.current || 0);
    mongoDbMetrics.set({ metric_type: 'operations_per_sec' }, serverStatus.opcounters?.query || 0);
  } catch (error) {
    console.warn('Failed to update MongoDB metrics:', error);
  }
};

/**
 * 更新资源利用率指标
 */
export const updateResourceUtilization = () => {
  const memUsage = process.memoryUsage();
  const cpuUsage = process.cpuUsage();
  
  // 内存使用率估算（基于heapUsed/heapTotal）
  const memUtilization = (memUsage.heapUsed / memUsage.heapTotal) * 100;
  
  if (memUtilization > 90) {
    resourceUtilization.set({ resource_type: 'memory', threshold_level: 'critical' }, memUtilization);
  } else if (memUtilization > 70) {
    resourceUtilization.set({ resource_type: 'memory', threshold_level: 'warning' }, memUtilization);
  } else {
    resourceUtilization.set({ resource_type: 'memory', threshold_level: 'normal' }, memUtilization);
  }
};

// 启动定期指标更新
const resourceMetricsInterval = setInterval(updateResourceUtilization, 30000); // 每30秒更新一次

// 优雅关闭处理
const cleanupResourceMetrics = () => {
  if (resourceMetricsInterval) {
    clearInterval(resourceMetricsInterval);
    console.log('🧹 资源监控定时器已清理');
  }
};

// 监听进程退出事件
process.on('SIGINT', cleanupResourceMetrics);
process.on('SIGTERM', cleanupResourceMetrics);
process.on('exit', cleanupResourceMetrics);