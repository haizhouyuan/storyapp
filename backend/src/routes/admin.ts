import { Router, Request, Response } from 'express';
import { ObjectId } from 'mongodb';
import { getDatabase } from '../config/database';
import { COLLECTIONS, getDatabaseStats, cleanupOldLogs } from '../config/initializeDatabase';
import { LogLevel, EventType } from '../utils/logger';
import { createLogger } from '../config/logger';

const router = Router();
const adminLogger = createLogger('routes:admin');

// GET /api/admin/logs - 获取日志列表（支持分页和筛选）
router.get('/logs', async (req: Request, res: Response) => {
  try {
    const {
      page = '1',
      limit = '50',
      sessionId,
      logLevel,
      eventType,
      startDate,
      endDate,
      search
    } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    // 构建查询条件
    const filter: any = {};
    
    if (sessionId) {
      filter.sessionId = sessionId;
    }
    
    if (logLevel) {
      // 支持逗号分隔的多选值，例如 "info,warn,error"
      const levels = String(logLevel)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      filter.logLevel = levels.length > 1 ? { $in: levels } : levels[0];
    }

    if (eventType) {
      // 支持逗号分隔的多选值，例如 "ai_api_response,json_parse_success"  
      const types = String(eventType)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      filter.eventType = types.length > 1 ? { $in: types } : types[0];
    }
    
    if (startDate || endDate) {
      filter.timestamp = {};
      if (startDate) {
        filter.timestamp.$gte = new Date(startDate as string);
      }
      if (endDate) {
        filter.timestamp.$lte = new Date(endDate as string);
      }
    }
    
    if (search) {
      const searchRegex = { $regex: String(search), $options: 'i' };
      filter.$or = [
        { message: searchRegex },
        { 'data.topic': searchRegex },
        { sessionId: searchRegex }
      ];
    }

    const db = getDatabase();
    const logsCollection = db.collection(COLLECTIONS.STORY_LOGS);

    // 获取总数
    const total = await logsCollection.countDocuments(filter);

    // 默认不返回较大的字段（例如 stackTrace），除非显式要求
    const includeStack = String(req.query.includeStackTrace || '').toLowerCase() === 'true';

    // 获取日志数据
    const logs = await logsCollection
      .find(filter, includeStack ? undefined : { projection: { stackTrace: 0 } })
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limitNum)
      .toArray();

    res.json({
      success: true,
      data: {
        logs,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          pages: Math.ceil(total / limitNum)
        }
      }
    });
  } catch (error: any) {
    adminLogger.error({ err: error }, '获取日志列表失败');
    res.status(500).json({
      success: false,
      error: '获取日志列表失败',
      message: error.message
    });
  }
});

// GET /api/admin/logs/:sessionId - 获取特定会话的完整日志
router.get('/logs/:sessionId', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;

    const db = getDatabase();
    const logsCollection = db.collection(COLLECTIONS.STORY_LOGS);

    // 获取会话的所有日志，按时间排序
    const logs = await logsCollection
      .find({ sessionId })
      .sort({ timestamp: 1 })
      .toArray();

    if (logs.length === 0) {
      return res.status(404).json({
        success: false,
        error: '会话不存在',
        code: 'SESSION_NOT_FOUND'
      });
    }

    // 计算会话统计信息
    const startLog = logs.find(log => log.eventType === EventType.SESSION_START);
    const endLog = logs.find(log => log.eventType === EventType.SESSION_END);
    
    const sessionStats = {
      sessionId,
      startTime: startLog?.timestamp,
      endTime: endLog?.timestamp,
      duration: endLog?.performance?.duration,
      totalLogs: logs.length,
      errorCount: logs.filter(log => log.logLevel === LogLevel.ERROR).length,
      apiCalls: logs.filter(log => log.eventType === EventType.AI_API_RESPONSE).length,
      topic: startLog?.data?.topic,
      mode: startLog?.data?.mode
    };

    res.json({
      success: true,
      data: {
        sessionStats,
        logs
      }
    });
  } catch (error: any) {
    adminLogger.error({ err: error }, '获取会话日志失败');
    res.status(500).json({
      success: false,
      error: '获取会话日志失败',
      message: error.message
    });
  }
});

// GET /api/admin/stats - 获取系统统计信息
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const logsCollection = db.collection(COLLECTIONS.STORY_LOGS);
    
    // 时间范围查询
    const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const last7Days = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const last30Days = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // 并行执行多个统计查询
    const [
      totalSessions,
      sessionsLast24h,
      sessionsLast7d,
      avgDuration,
      successRate,
      errorsByType,
      topTopics,
      performanceMetrics
    ] = await Promise.all([
      // 总会话数
      logsCollection.countDocuments({ eventType: EventType.SESSION_START }),
      
      // 最近24小时会话数
      logsCollection.countDocuments({
        eventType: EventType.SESSION_START,
        timestamp: { $gte: last24Hours }
      }),
      
      // 最近7天会话数
      logsCollection.countDocuments({
        eventType: EventType.SESSION_START,
        timestamp: { $gte: last7Days }
      }),
      
      // 平均完成时间
      logsCollection.aggregate([
        {
          $match: {
            eventType: EventType.SESSION_END,
            'performance.duration': { $exists: true }
          }
        },
        {
          $group: {
            _id: null,
            avgDuration: { $avg: '$performance.duration' }
          }
        }
      ]).toArray(),
      
      // 成功率统计
      logsCollection.aggregate([
        {
          $match: {
            eventType: EventType.SESSION_END,
            timestamp: { $gte: last7Days }
          }
        },
        {
          $group: {
            _id: '$data.success',
            count: { $sum: 1 }
          }
        }
      ]).toArray(),
      
      // 错误类型统计
      logsCollection.aggregate([
        {
          $match: {
            logLevel: LogLevel.ERROR,
            timestamp: { $gte: last7Days }
          }
        },
        {
          $group: {
            _id: '$eventType',
            count: { $sum: 1 }
          }
        },
        {
          $sort: { count: -1 }
        }
      ]).toArray(),
      
      // 热门主题统计
      logsCollection.aggregate([
        {
          $match: {
            eventType: EventType.SESSION_START,
            timestamp: { $gte: last30Days },
            'data.topic': { $exists: true }
          }
        },
        {
          $group: {
            _id: '$data.topic',
            count: { $sum: 1 }
          }
        },
        {
          $sort: { count: -1 }
        },
        {
          $limit: 10
        }
      ]).toArray(),
      
      // 性能指标统计
      logsCollection.aggregate([
        {
          $match: {
            eventType: EventType.AI_API_RESPONSE,
            timestamp: { $gte: last7Days },
            'performance.duration': { $exists: true }
          }
        },
        {
          $group: {
            _id: null,
            avgApiDuration: { $avg: '$performance.duration' },
            maxApiDuration: { $max: '$performance.duration' },
            minApiDuration: { $min: '$performance.duration' },
            totalApiCalls: { $sum: 1 },
            avgTokens: { $avg: '$performance.tokensUsed' }
          }
        }
      ]).toArray()
    ]);

    // 计算成功率
    const successStats = successRate.reduce((acc, item) => {
      acc[item._id ? 'success' : 'failed'] = item.count;
      return acc;
    }, { success: 0, failed: 0 });

    const totalCompleted = successStats.success + successStats.failed;
    const successRatePercent = totalCompleted > 0 ? (successStats.success / totalCompleted * 100) : 0;

    // 获取数据库统计
    const dbStats = await getDatabaseStats();

    res.json({
      success: true,
      data: {
        overview: {
          totalSessions,
          sessionsLast24h,
          sessionsLast7d,
          avgDuration: avgDuration[0]?.avgDuration || 0,
          successRate: successRatePercent,
          totalErrors: errorsByType.reduce((sum, item) => sum + item.count, 0)
        },
        performance: performanceMetrics[0] || {},
        errors: errorsByType,
        topTopics,
        database: dbStats
      }
    });
  } catch (error: any) {
    adminLogger.error({ err: error }, '获取统计信息失败');
    res.status(500).json({
      success: false,
      error: '获取统计信息失败',
      message: error.message
    });
  }
});

// GET /api/admin/performance - 获取性能指标
router.get('/performance', async (req: Request, res: Response) => {
  try {
    const { days = '7' } = req.query;
    const daysNum = parseInt(days as string);
    const startDate = new Date(Date.now() - daysNum * 24 * 60 * 60 * 1000);

    const db = getDatabase();
    const logsCollection = db.collection(COLLECTIONS.STORY_LOGS);

    // 获取时间序列性能数据
    const performanceTimeline = await logsCollection.aggregate([
      {
        $match: {
          eventType: EventType.AI_API_RESPONSE,
          timestamp: { $gte: startDate },
          'performance.duration': { $exists: true }
        }
      },
      {
        $group: {
          _id: {
            date: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: '$timestamp'
              }
            },
            hour: {
              $hour: '$timestamp'
            }
          },
          avgDuration: { $avg: '$performance.duration' },
          maxDuration: { $max: '$performance.duration' },
          apiCalls: { $sum: 1 },
          avgTokens: { $avg: '$performance.tokensUsed' }
        }
      },
      {
        $sort: { '_id.date': 1, '_id.hour': 1 }
      }
    ]).toArray();

    // 按模型类型统计性能
    const performanceByModel = await logsCollection.aggregate([
      {
        $match: {
          eventType: EventType.AI_API_RESPONSE,
          timestamp: { $gte: startDate },
          'data.model': { $exists: true }
        }
      },
      {
        $group: {
          _id: '$data.model',
          avgDuration: { $avg: '$performance.duration' },
          maxDuration: { $max: '$performance.duration' },
          minDuration: { $min: '$performance.duration' },
          calls: { $sum: 1 },
          avgTokens: { $avg: '$performance.tokensUsed' }
        }
      }
    ]).toArray();

    res.json({
      success: true,
      data: {
        timeline: performanceTimeline,
        byModel: performanceByModel
      }
    });
  } catch (error: any) {
    adminLogger.error({ err: error }, '获取性能指标失败');
    res.status(500).json({
      success: false,
      error: '获取性能指标失败',
      message: error.message
    });
  }
});

// POST /api/admin/logs/export - 导出日志数据
router.post('/logs/export', async (req: Request, res: Response) => {
  try {
    const {
      format = 'json',
      sessionId,
      startDate,
      endDate,
      logLevel,
      eventType
    } = req.body;

    // 构建查询条件
    const filter: any = {};
    
    if (sessionId) filter.sessionId = sessionId;
    
    if (logLevel) {
      // 支持逗号分隔的多选值，例如 "info,warn,error"
      const levels = String(logLevel)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      filter.logLevel = levels.length > 1 ? { $in: levels } : levels[0];
    }
    
    if (eventType) {
      // 支持逗号分隔的多选值，例如 "story_generation,ai_api_request"
      const types = String(eventType)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      filter.eventType = types.length > 1 ? { $in: types } : types[0];
    }
    
    if (startDate || endDate) {
      filter.timestamp = {};
      if (startDate) filter.timestamp.$gte = new Date(startDate);
      if (endDate) filter.timestamp.$lte = new Date(endDate);
    }

    const db = getDatabase();
    const logsCollection = db.collection(COLLECTIONS.STORY_LOGS);

    const logs = await logsCollection
      .find(filter)
      .sort({ timestamp: 1 })
      .toArray();

    if (format === 'csv') {
      // 生成CSV格式
      const csvHeader = 'timestamp,sessionId,logLevel,eventType,message,data\n';
      const csvData = logs.map(log => {
        const data = log.data ? JSON.stringify(log.data).replace(/"/g, '""') : '';
        return `"${log.timestamp}","${log.sessionId}","${log.logLevel}","${log.eventType}","${log.message}","${data}"`;
      }).join('\n');
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="logs_${Date.now()}.csv"`);
      res.send(csvHeader + csvData);
    } else {
      // 默认JSON格式
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="logs_${Date.now()}.json"`);
      res.json({
        exportTime: new Date().toISOString(),
        filter,
        totalRecords: logs.length,
        data: logs
      });
    }
  } catch (error: any) {
    adminLogger.error({ err: error }, '导出日志失败');
    res.status(500).json({
      success: false,
      error: '导出日志失败',
      message: error.message
    });
  }
});

// DELETE /api/admin/logs/cleanup - 手动清理过期日志
router.delete('/logs/cleanup', async (req: Request, res: Response) => {
  try {
    const { days = 30 } = req.body;
    const deletedCount = await cleanupOldLogs(days);

    res.json({
      success: true,
      message: `成功清理了 ${deletedCount} 条过期日志`,
      deletedCount
    });
  } catch (error: any) {
    adminLogger.error({ err: error }, '清理日志失败');
    res.status(500).json({
      success: false,
      error: '清理日志失败',
      message: error.message
    });
  }
});

// GET /api/admin/sessions/active - 获取活跃会话列表
router.get('/sessions/active', async (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const logsCollection = db.collection(COLLECTIONS.STORY_LOGS);

    // 查找最近1小时内开始但未结束的会话
    const recentTime = new Date(Date.now() - 60 * 60 * 1000);
    
    const activeSessions = await logsCollection.aggregate([
      {
        $match: {
          timestamp: { $gte: recentTime }
        }
      },
      {
        $group: {
          _id: '$sessionId',
          startTime: { 
            $min: {
              $cond: [
                { $eq: ['$eventType', EventType.SESSION_START] },
                '$timestamp',
                null
              ]
            }
          },
          endTime: {
            $max: {
              $cond: [
                { $eq: ['$eventType', EventType.SESSION_END] },
                '$timestamp',
                null
              ]
            }
          },
          lastActivity: { $max: '$timestamp' },
          topic: {
            $first: {
              $cond: [
                { $eq: ['$eventType', EventType.SESSION_START] },
                '$data.topic',
                null
              ]
            }
          },
          errorCount: {
            $sum: {
              $cond: [
                { $eq: ['$logLevel', LogLevel.ERROR] },
                1,
                0
              ]
            }
          }
        }
      },
      {
        $match: {
          startTime: { $ne: null },
          endTime: null // 未结束的会话
        }
      },
      {
        $sort: { lastActivity: -1 }
      }
    ]).toArray();

    res.json({
      success: true,
      data: {
        activeSessions,
        count: activeSessions.length
      }
    });
  } catch (error: any) {
    adminLogger.error({ err: error }, '获取活跃会话失败');
    res.status(500).json({
      success: false,
      error: '获取活跃会话失败',
      message: error.message
    });
  }
});

export default router;
