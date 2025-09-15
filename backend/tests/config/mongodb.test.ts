// MongoDB测试配置 - 使用内存模拟
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, Db } from 'mongodb';

let mongod: MongoMemoryServer;
let client: MongoClient;
let db: Db;

export const setupTestDatabase = async (): Promise<{ client: MongoClient; db: Db }> => {
  if (process.env.CI) {
    // CI环境使用真实MongoDB（由GitHub Actions services提供）
    const uri = process.env.MONGODB_URI || 'mongodb://root:pass123@localhost:27017/storyapp_test?authSource=admin';
    client = new MongoClient(uri);
    await client.connect();
    db = client.db('storyapp_test');
  } else {
    // 本地环境使用内存数据库
    mongod = await MongoMemoryServer.create({
      instance: {
        dbName: 'storyapp_test'
      }
    });
    
    const uri = mongod.getUri();
    client = new MongoClient(uri);
    await client.connect();
    db = client.db('storyapp_test');
  }
  
  return { client, db };
};

export const teardownTestDatabase = async (): Promise<void> => {
  if (client) {
    await client.close();
  }
  
  if (mongod) {
    await mongod.stop();
  }
};

export const clearTestDatabase = async (db: Db): Promise<void> => {
  const collections = await db.listCollections().toArray();
  
  for (const collection of collections) {
    await db.collection(collection.name).deleteMany({});
  }
};