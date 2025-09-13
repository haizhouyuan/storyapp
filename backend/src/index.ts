import express from 'express';
import cors from 'cors';
import path from 'path';
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
  metricsMiddleware
} from './middleware/observability';
import logger, { createLogger } from './config/logger';

// 导入路由
import storyRoutes from './routes/stories';
import healthRoutes from './routes/health';
import adminRoutes from './routes/admin';
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
app.set('trust proxy', 1);

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


// API documentation routes (public)
app.use('/docs', docsRoutes);

// 标准健康检查端点（符合 ultrathink 规范）
app.use('/healthz', healthRoutes);
// 保持向后兼容
app.use('/api/health', healthRoutes);

// Main API routes
app.use('/api/admin', adminRoutes);
app.use('/api', storyRoutes);

// 静态文件服务（前端）
if (process.env.NODE_ENV === 'production') {
  // 服务React构建的静态文件
  app.use(express.static(path.join(__dirname, '../public')));
  
  // 对于所有非API路由，返回React应用的index.html（用于React Router）
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(__dirname, '../public/index.html'));
    }
  });
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