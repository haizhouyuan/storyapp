import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import path from 'path';

// 导入路由
import storyRoutes from './routes/stories';
import healthRoutes from './routes/health';

// 导入数据库连接
import { connectToDatabase, checkDatabaseHealth } from './config/database';

// 加载环境变量
dotenv.config({ path: path.join(__dirname, "..", "..", ".env") });

const app = express();
const PORT = process.env.PORT || 5001;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

// 安全中间件
app.use(helmet({
  crossOriginEmbedderPolicy: false, // 允许跨域嵌入
  contentSecurityPolicy: false     // 简化CSP配置
}));

// CORS配置
app.use(cors({
  origin: [FRONTEND_URL, 'http://localhost:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// 速率限制
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15分钟
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),      // 每IP最多100次请求
  message: {
    error: '请求次数过多，请稍后再试',
    code: 'RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false
});

app.use(limiter);

// 请求体解析
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// 请求日志中间件
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// 注册路由
app.use('/api/health', healthRoutes);
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
  res.status(404).json({
    error: '接口不存在',
    message: `路径 ${req.originalUrl} 未找到`,
    code: 'NOT_FOUND'
  });
});

// 全局错误处理
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('服务器错误:', err);
  
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' ? '服务器内部错误' : err.message,
    code: err.code || 'INTERNAL_SERVER_ERROR',
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  });
});

// 启动服务器并初始化数据库
async function startServer() {
  try {
    // 初始化数据库连接
    await connectToDatabase();
    
    app.listen(PORT, () => {
      console.log(`🚀 服务器启动成功！`);
      console.log(`📍 端口: ${PORT}`);
      console.log(`🌐 环境: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🔗 健康检查: http://localhost:${PORT}/api/health`);
      
      if (process.env.NODE_ENV !== 'production') {
        console.log(`🎨 前端地址: ${FRONTEND_URL}`);
      }
    });
  } catch (error) {
    console.error('服务器启动失败:', error);
    process.exit(1);
  }
}

startServer();

// 优雅关闭
process.on('SIGTERM', () => {
  console.log('收到SIGTERM信号，正在关闭服务器...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('收到SIGINT信号，正在关闭服务器...');
  process.exit(0);
});

export default app;