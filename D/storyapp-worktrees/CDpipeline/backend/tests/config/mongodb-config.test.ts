// MongoDB配置测试
import { setupTestDatabase, teardownTestDatabase, clearTestDatabase } from './mongodb.test';

describe('MongoDB测试配置', () => {
  it('应该能够设置和清理测试数据库', async () => {
    const { client, db } = await setupTestDatabase();
    
    // 验证数据库连接
    expect(client).toBeDefined();
    expect(db).toBeDefined();
    
    // 测试基本操作
    const testCollection = db.collection('test');
    await testCollection.insertOne({ test: 'data' });
    const result = await testCollection.findOne({ test: 'data' });
    expect(result).toBeTruthy();
    expect(result?.test).toBe('data');
    
    // 清理
    await clearTestDatabase(db);
    const afterClear = await testCollection.findOne({ test: 'data' });
    expect(afterClear).toBeNull();
    
    // 关闭连接
    await teardownTestDatabase();
  }, 15000);
});