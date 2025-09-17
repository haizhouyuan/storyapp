import { getDatabase } from './database';

// 数据库集合名称
export const COLLECTIONS = {
  STORIES: 'stories',
  STORY_LOGS: 'story_logs'
} as const;

// 初始化数据库索引和配置
export async function initializeDatabase(): Promise<void> {
  try {
    const db = getDatabase();
    
    console.log('🔧 正在初始化数据库索引...');
    
    // 1. 故事集合索引
    const storiesCollection = db.collection(COLLECTIONS.STORIES);
    
    // 现有索引保持不变
    await storiesCollection.createIndex({ created_at: -1 });
    await storiesCollection.createIndex({ title: 'text' });
    console.log('✅ 故事集合索引创建完成');
    
    // 2. 日志集合索引 - 新增
    const logsCollection = db.collection(COLLECTIONS.STORY_LOGS);
    
    // 主要查询索引
    await logsCollection.createIndex({ sessionId: 1 });
    await logsCollection.createIndex({ timestamp: -1 });
    await logsCollection.createIndex({ eventType: 1 });
    await logsCollection.createIndex({ logLevel: 1 });
    
    // 复合索引用于常见查询
    await logsCollection.createIndex({ sessionId: 1, timestamp: -1 });
    await logsCollection.createIndex({ eventType: 1, timestamp: -1 });
    await logsCollection.createIndex({ logLevel: 1, timestamp: -1 });
    
    // 过期索引 - 自动清理30天前的日志
    const retentionDays = parseInt(process.env.LOG_RETENTION_DAYS || '30');
    await logsCollection.createIndex(
      { timestamp: 1 }, 
      { expireAfterSeconds: retentionDays * 24 * 60 * 60 }
    );
    
    console.log('✅ 日志集合索引创建完成');
    
    // 3. 创建统计视图（可选）
    try {
      await db.createCollection('daily_stats', {
        viewOn: COLLECTIONS.STORY_LOGS,
        pipeline: [
          {
            $match: {
              eventType: 'story_generation_complete'
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
                }
              },
              totalGenerations: { $sum: 1 },
              avgDuration: { $avg: '$performance.duration' },
              avgTokens: { $avg: '$performance.tokensUsed' }
            }
          },
          {
            $sort: { '_id.date': -1 }
          }
        ]
      });
      console.log('✅ 统计视图创建完成');
    } catch (error) {
      // 视图可能已存在，忽略错误
      console.log('ℹ️  统计视图已存在或创建失败，继续执行');
    }
    
    console.log('🎉 数据库初始化完成！');
    
  } catch (error) {
    console.error('❌ 数据库初始化失败:', error);
    throw error;
  }
}

// 获取数据库统计信息
export async function getDatabaseStats(): Promise<any> {
  try {
    const db = getDatabase();
    
    const storiesStats = await db.collection(COLLECTIONS.STORIES).estimatedDocumentCount();
    const logsStats = await db.collection(COLLECTIONS.STORY_LOGS).estimatedDocumentCount();
    
    // 获取最近24小时的活动统计
    const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    const recentActivity = await db.collection(COLLECTIONS.STORY_LOGS).aggregate([
      {
        $match: {
          timestamp: { $gte: last24Hours }
        }
      },
      {
        $group: {
          _id: '$eventType',
          count: { $sum: 1 }
        }
      }
    ]).toArray();
    
    // 获取活跃会话数
    const activeSessions = await db.collection(COLLECTIONS.STORY_LOGS).distinct('sessionId', {
      timestamp: { $gte: last24Hours },
      eventType: 'session_start'
    });
    
    return {
      collections: {
        stories: {
          count: storiesStats
        },
        logs: {
          count: logsStats
        }
      },
      activity: {
        last24Hours: recentActivity,
        activeSessions: activeSessions.length
      }
    };
  } catch (error) {
    console.error('获取数据库统计信息失败:', error);
    throw error;
  }
}

// 清理过期日志（手动清理，补充自动过期）
export async function cleanupOldLogs(daysToKeep: number = 30): Promise<number> {
  try {
    const db = getDatabase();
    const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);
    
    const result = await db.collection(COLLECTIONS.STORY_LOGS).deleteMany({
      timestamp: { $lt: cutoffDate }
    });
    
    console.log(`🧹 清理了 ${result.deletedCount} 条过期日志记录`);
    return result.deletedCount;
  } catch (error) {
    console.error('清理过期日志失败:', error);
    throw error;
  }
}