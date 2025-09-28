import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { serverConfig, securityConfig, validateConfig } from './config';

// Import observability and security middleware
import {
  securityMiddleware,
  compressionMiddleware,
  generalRateLimit,
  authRateLimit,
  createProjectRateLimit,
  validationRateLimit,
  httpMetricsMiddleware,
  errorMetricsMiddleware,
  requestIdMiddleware,
  healthCheckMiddleware,
  readyCheckMiddleware,
  metricsMiddleware,
  ttsRateLimit
} from './middleware/observability';
import logger, { createLogger } from './config/logger';

// 导入路由
import storyRoutes from './routes/stories';
import healthRoutes from './routes/health';
import adminRoutes from './routes/admin';
import ttsRoutes from './routes/tts';
// import workflowProjectsRoutes from './routes/workflow/projects';
// import workflowMiraclesRoutes from './routes/workflow/miracles';
import docsRoutes from './routes/docs';

// 导入数据库连接
import { connectToDatabase, checkDatabaseHealth } from './config/database';
import { initializeDatabase } from './config/initializeDatabase';

// Validate configuration on startup
validateConfig();

const app = express();
const { port: PORT, frontendUrl: FRONTEND_URL } = serverConfig;

const appLogger = createLogger('app');

// Trust proxy for accurate IP addresses
if (securityConfig.trustProxy) {
  app.set('trust proxy', securityConfig.trustProxy);
}

// Apply middleware in order of priority:

// 1. Request tracing and ID generation
app.use(requestIdMiddleware);

// 2. Health/ready/metrics endpoints (before other middleware)
app.use(healthCheckMiddleware);
app.use(readyCheckMiddleware);
app.use(metricsMiddleware);

// 3. Security middleware
app.use(securityMiddleware);

// 4. CORS configuration
app.use(cors({
  origin: [...securityConfig.corsOrigins, FRONTEND_URL],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-Correlation-ID']
}));

// 5. Compression for response optimization
app.use(compressionMiddleware);

// 6. HTTP metrics and logging
app.use(httpMetricsMiddleware);

// 7. Request body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// 8. General rate limiting
app.use(generalRateLimit);

// 9. Route-specific middleware and endpoints

// Authentication routes with stricter rate limiting
app.use('/api/auth', authRateLimit);

// Workflow routes with specific rate limiters
// app.use('/api/workflow/projects', createProjectRateLimit, workflowProjectsRoutes);
// app.use('/api/workflow', validationRateLimit, workflowMiraclesRoutes);

// API documentation routes (public)
app.use('/docs', docsRoutes);

// 标准健康检查端点（符合 ultrathink 规范）
app.use('/healthz', healthRoutes);
// 保持向后兼容
app.use('/api/health', healthRoutes);

// Main API routes
app.use('/api/admin', adminRoutes);
app.use('/api/tts', ttsRateLimit, ttsRoutes);
app.use('/api', storyRoutes);

// 静态文件服务（前端）
// ✅ 改成"在非开发环境，或显式要求时，一律服务静态资源"
const staticCandidates = [
  path.resolve(__dirname, '../public'),
  path.resolve(__dirname, './public'),
  path.resolve(process.cwd(), 'public')
];

const STATIC_DIR = staticCandidates.find((candidate) =>
  fs.existsSync(candidate)
);

const serveStatic =
  !!STATIC_DIR && (process.env.SERVE_STATIC === '1' || process.env.NODE_ENV !== 'development');

if (serveStatic && STATIC_DIR) {
  // 服务React构建的静态文件
  app.use(express.static(STATIC_DIR));

  // 首页与前端路由回退
  app.get(['/', '/index.html'], (_req, res) =>
    res.sendFile(path.join(STATIC_DIR, 'index.html'))
  );
  app.get(/^(?!\/api\/).+/, (_req, res) =>
    res.sendFile(path.join(STATIC_DIR, 'index.html'))
  );
} else {
  appLogger.warn({ STATIC_DIR, candidates: staticCandidates }, 'Static assets directory not found; frontend routes will not be served');
}

// 404处理
app.use('*', (req, res) => {
  appLogger.warn({
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  }, `404 - Path not found: ${req.originalUrl}`);
  
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    message: `Path ${req.originalUrl} not found`,
    code: 'NOT_FOUND'
  });
});

// 全局错误处理 (must be last middleware)
app.use(errorMetricsMiddleware);

// 启动服务器并初始化数据库
async function startServer() {
  try {
    appLogger.info('Starting server initialization...');
    
    // 初始化数据库连接
    appLogger.info('Connecting to database...');
    await connectToDatabase();
    appLogger.info('Database connection established');
    
    // 初始化数据库索引和配置
    appLogger.info('Initializing database indexes and configuration...');
    await initializeDatabase();
    appLogger.info('Database initialization completed');
    
    const server = app.listen(PORT, () => {
      appLogger.info({
        port: PORT,
        environment: process.env.NODE_ENV || 'development',
        frontendUrl: FRONTEND_URL,
        endpoints: {
          health: `http://localhost:${PORT}/healthz`,
          ready: `http://localhost:${PORT}/api/ready`,
          metrics: `http://localhost:${PORT}/metrics`,
          admin: `http://localhost:${PORT}/api/admin`
        }
      }, 'Server started successfully');
    });
    
    // Graceful shutdown handling
    const gracefulShutdown = (signal: string) => {
      appLogger.info(`Received ${signal}, starting graceful shutdown...`);
      
      server.close((err) => {
        if (err) {
          appLogger.error({ err }, 'Error during server shutdown');
          process.exit(1);
        }
        
        appLogger.info('Server closed successfully');
        process.exit(0);
      });
    };
    
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    
  } catch (error) {
    appLogger.error({ err: error }, 'Server startup failed');
    process.exit(1);
  }
}

startServer();

export default app;
