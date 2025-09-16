import { MongoClient, Db } from 'mongodb';

// 使用集中化配置加载器
const { getTypedConfig } = require('../../../config/env-loader');

const typedConfig = getTypedConfig();
const MONGODB_URI = typedConfig.database.uri;
const MONGODB_DB_NAME = typedConfig.database.name;

// 数据库集合名称常量
export const COLLECTIONS = {
  STORIES: 'stories'
} as const;

// MongoDB客户端实例
let client: MongoClient;
let db: Db;

/**
 * 连接到MongoDB数据库
 */
export async function connectToDatabase(): Promise<Db> {
  if (db) {
    return db;
  }

  try {
    console.log('正在连接到MongoDB...');
    
    client = new MongoClient(MONGODB_URI, {
      // 连接选项
      maxPoolSize: 10,
      minPoolSize: 2,
      connectTimeoutMS: 30000,
      socketTimeoutMS: 45000
    });

    await client.connect();
    db = client.db(MONGODB_DB_NAME);
    
    console.log('✅ MongoDB连接成功');
    console.log(`📍 数据库: ${MONGODB_DB_NAME}`);
    console.log(`🔗 URI: ${MONGODB_URI}`);
    
    return db;
  } catch (error) {
    console.error('❌ MongoDB连接失败:', error);
    throw new Error('MongoDB连接失败');
  }
}


/**
 * 获取数据库实例
 */
export function getDatabase(): Db {
  if (!db) {
    throw new Error('数据库未连接，请先调用 connectToDatabase()');
  }
  return db;
}

/**
 * 关闭数据库连接
 */
export async function closeDatabase(): Promise<void> {
  if (client) {
    await client.close();
    console.log('MongoDB连接已关闭');
  }
}

/**
 * 检查数据库连接状态
 */
export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    if (!db) {
      return false;
    }
    
    // 执行简单的ping命令检查连接
    await db.command({ ping: 1 });
    return true;
  } catch (error) {
    console.error('数据库健康检查失败:', error);
    return false;
  }
}

/**
 * 获取数据库连接信息（用于测试）
 * 自动使用内存数据库（本地）或真实MongoDB（CI）
 */
export async function getConnectionForTesting(): Promise<{ client: MongoClient; db: Db }> {
  const { setupTestDatabase } = require('../../tests/config/mongodb.test');
  return await setupTestDatabase();
}