import client from 'prom-client';

const isTestEnv = process.env.NODE_ENV === 'test' || typeof process.env.JEST_WORKER_ID !== 'undefined';

// Create a Registry to register metrics
export const register = new client.Registry();

let defaultMetricsInterval: NodeJS.Timeout | undefined;
if (!isTestEnv) {
  // Add default metrics (process and Node.js metrics)
  defaultMetricsInterval = client.collectDefaultMetrics({
    register,
    prefix: 'storyapp_backend_',
    gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5], // These are in seconds
  }) as unknown as NodeJS.Timeout;
}

// Custom application metrics

// HTTP request metrics
export const httpRequestDuration = new client.Histogram({
  name: 'storyapp_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
});

export const httpRequestTotal = new client.Counter({
  name: 'storyapp_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
});

export const httpRequestsInFlight = new client.Gauge({
  name: 'storyapp_http_requests_in_flight',
  help: 'Number of HTTP requests currently being processed',
  labelNames: ['method'],
});

// Database operation metrics
export const dbOperationDuration = new client.Histogram({
  name: 'storyapp_db_operation_duration_seconds',
  help: 'Duration of database operations in seconds',
  labelNames: ['operation', 'collection', 'status'],
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
});

export const dbOperationTotal = new client.Counter({
  name: 'storyapp_db_operations_total',
  help: 'Total number of database operations',
  labelNames: ['operation', 'collection', 'status'],
});

export const dbConnectionPool = new client.Gauge({
  name: 'storyapp_db_connection_pool',
  help: 'Database connection pool status',
  labelNames: ['status'], // active, idle, total
});

// Application-specific metrics
export const projectOperations = new client.Counter({
  name: 'storyapp_project_operations_total',
  help: 'Total number of project operations',
  labelNames: ['operation', 'stage', 'status'],
});

export const validationOperations = new client.Counter({
  name: 'storyapp_validation_operations_total',
  help: 'Total number of validation operations',
  labelNames: ['rule_id', 'project_stage', 'result'],
});

export const activeProjects = new client.Gauge({
  name: 'storyapp_active_projects',
  help: 'Number of active projects in the system',
  labelNames: ['stage'],
});

export const memoryUsage = new client.Gauge({
  name: 'storyapp_memory_usage_bytes',
  help: 'Memory usage by type',
  labelNames: ['type'], // rss, heapUsed, heapTotal, external
});

// Rate limiting metrics
export const rateLimitHits = new client.Counter({
  name: 'storyapp_rate_limit_hits_total',
  help: 'Total number of rate limit hits',
  labelNames: ['endpoint', 'user_id'],
});

// Error metrics
export const errorCounter = new client.Counter({
  name: 'storyapp_errors_total',
  help: 'Total number of errors',
  labelNames: ['type', 'endpoint', 'error_code'],
});

// Text-to-Speech metrics
export const ttsRequestCounter = new client.Counter({
  name: 'storyapp_tts_requests_total',
  help: 'Total number of TTS synthesis requests',
  labelNames: ['provider', 'cached'],
});

export const ttsLatencyHistogram = new client.Histogram({
  name: 'storyapp_tts_latency_seconds',
  help: 'Latency for TTS synthesis requests',
  labelNames: ['provider'],
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 20],
});

export const ttsErrorCounter = new client.Counter({
  name: 'storyapp_tts_errors_total',
  help: 'Total number of TTS synthesis errors',
  labelNames: ['provider', 'reason'],
});

export const ttsProviderUp = new client.Gauge({
  name: 'storyapp_tts_provider_up',
  help: 'Indicates whether a TTS provider is available (1) or degraded (0)',
  labelNames: ['provider'],
});

// Register all custom metrics
register.registerMetric(httpRequestDuration);
register.registerMetric(httpRequestTotal);
register.registerMetric(httpRequestsInFlight);
register.registerMetric(dbOperationDuration);
register.registerMetric(dbOperationTotal);
register.registerMetric(dbConnectionPool);
register.registerMetric(projectOperations);
register.registerMetric(validationOperations);
register.registerMetric(activeProjects);
register.registerMetric(memoryUsage);
register.registerMetric(rateLimitHits);
register.registerMetric(errorCounter);
register.registerMetric(ttsRequestCounter);
register.registerMetric(ttsLatencyHistogram);
register.registerMetric(ttsErrorCounter);
register.registerMetric(ttsProviderUp);

// Helper function to update memory usage metrics
export const updateMemoryMetrics = () => {
  const memUsage = process.memoryUsage();
  memoryUsage.set({ type: 'rss' }, memUsage.rss);
  memoryUsage.set({ type: 'heapUsed' }, memUsage.heapUsed);
  memoryUsage.set({ type: 'heapTotal' }, memUsage.heapTotal);
  memoryUsage.set({ type: 'external' }, memUsage.external);
};

// Start memory monitoring（测试环境关闭定时器，避免阻塞 Jest 退出）
const memoryMetricsInterval = isTestEnv ? undefined : setInterval(updateMemoryMetrics, 30000);

// 优雅关闭处理
const cleanupMemoryMetrics = () => {
  if (memoryMetricsInterval) {
    clearInterval(memoryMetricsInterval);
  }
  if (defaultMetricsInterval) {
    clearInterval(defaultMetricsInterval);
  }
};

if (!isTestEnv) {
  process.on('SIGINT', cleanupMemoryMetrics);
  process.on('SIGTERM', cleanupMemoryMetrics);
  process.on('exit', cleanupMemoryMetrics);
}

// Helper function to record HTTP metrics
export const recordHttpMetrics = (req: any, res: any, startTime: number) => {
  const duration = (Date.now() - startTime) / 1000;
  const labels = {
    method: req.method,
    route: req.route?.path || req.url,
    status_code: res.statusCode.toString(),
  };
  
  httpRequestDuration.observe(labels, duration);
  httpRequestTotal.inc(labels);
};

// Helper function to record database metrics
export const recordDbMetrics = (operation: string, collection: string, startTime: number, error?: Error) => {
  const duration = (Date.now() - startTime) / 1000;
  const status = error ? 'error' : 'success';
  
  dbOperationDuration.observe({ operation, collection, status }, duration);
  dbOperationTotal.inc({ operation, collection, status });
};

// Helper function to record project operation metrics
export const recordProjectOperation = (operation: string, stage: string, status: string) => {
  projectOperations.inc({ operation, stage, status });
};

// Helper function to record validation metrics
export const recordValidationOperation = (ruleId: string, projectStage: string, result: 'pass' | 'fail' | 'error') => {
  validationOperations.inc({ rule_id: ruleId, project_stage: projectStage, result });
};

// Helper function to record error metrics
export const recordError = (type: string, endpoint: string, errorCode: string) => {
  errorCounter.inc({ type, endpoint, error_code: errorCode });
};

export const ttsMetrics = {
  incrementRequests(providerId: string, cached: boolean) {
    ttsRequestCounter.inc({ provider: providerId, cached: cached ? 'true' : 'false' });
  },
  observeLatency(providerId: string, durationMs: number) {
    ttsLatencyHistogram.observe({ provider: providerId }, durationMs / 1000);
  },
  incrementErrors(providerId: string, reason: string) {
    ttsErrorCounter.inc({ provider: providerId, reason });
  },
};

export type TtsMetricsType = typeof ttsMetrics;
