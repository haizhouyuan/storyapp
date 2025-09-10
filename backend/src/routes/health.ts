import { Router, Request, Response } from 'express';
import { checkDatabaseHealth } from '../config/database';
import { deepseekClient } from '../config/deepseek';

const router = Router();

// 健康检查接口
router.get('/', async (req: Request, res: Response) => {
  try {
    const checks = {
      server: true,
      timestamp: new Date().toISOString(),
      database: false,
      deepseek: false
    };

    // 检查数据库连接
    try {
      checks.database = await checkDatabaseHealth();
    } catch (error) {
      console.warn('数据库健康检查失败:', error);
    }

    // 检查DeepSeek API连接（简单验证，不实际调用）
    try {
      checks.deepseek = !!process.env.DEEPSEEK_API_KEY;
    } catch (error) {
      console.warn('DeepSeek API检查失败:', error);
    }

    const allHealthy = checks.server && checks.database && checks.deepseek;
    
    res.status(allHealthy ? 200 : 503).json({
      status: allHealthy ? 'healthy' : 'unhealthy',
      checks,
      version: '1.0.0',
      message: '儿童故事App后端服务'
    });
  } catch (error) {
    console.error('健康检查错误:', error);
    res.status(500).json({
      status: 'error',
      message: '健康检查失败',
      error: process.env.NODE_ENV !== 'production' ? String(error) : undefined
    });
  }
});

export default router;