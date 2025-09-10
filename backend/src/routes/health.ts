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
      deepseek: {
        available: false,
        status: 'unknown' as 'ok' | 'missing' | 'unknown'
      }
    };

    // 检查数据库连接
    try {
      checks.database = await checkDatabaseHealth();
    } catch (error) {
      console.warn('数据库健康检查失败:', error);
    }

    // 检查DeepSeek API配置（非关键依赖）
    try {
      const hasApiKey = !!process.env.DEEPSEEK_API_KEY;
      checks.deepseek = {
        available: hasApiKey,
        status: hasApiKey ? 'ok' : 'missing'
      };
    } catch (error) {
      console.warn('DeepSeek API检查失败:', error);
      checks.deepseek = {
        available: false,
        status: 'unknown'
      };
    }

    // 核心服务健康状态：只要服务器和数据库正常就是健康的
    const coreHealthy = checks.server && checks.database;
    
    // 服务状态说明
    let statusMessage = '儿童故事App后端服务';
    if (!checks.deepseek.available) {
      statusMessage += ' (AI功能降级：使用模拟数据)';
    }

    res.status(coreHealthy ? 200 : 503).json({
      status: coreHealthy ? 'healthy' : 'unhealthy',
      checks,
      version: '1.0.0',
      message: statusMessage,
      warnings: !checks.deepseek.available ? ['DeepSeek API未配置，AI故事生成将使用模拟数据'] : []
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