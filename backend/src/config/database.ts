// MongoDB数据库配置 - 替换原来的Supabase配置
import { connectToDatabase, getDatabase, closeDatabase, checkDatabaseHealth, COLLECTIONS } from './mongodb';

export { connectToDatabase, getDatabase, closeDatabase, checkDatabaseHealth, COLLECTIONS };

// 数据库表名常量（保持兼容性）
export const TABLES = {
  STORIES: COLLECTIONS.STORIES
} as const;

// 初始化数据库的SQL参考（仅用于文档，MongoDB不需要SQL）
export const INIT_SQL = `
-- 此项目已从Supabase迁移到MongoDB
-- 不再需要SQL语句，数据库会自动创建集合和索引
-- 运行应用时会自动连接到MongoDB并初始化索引
`;