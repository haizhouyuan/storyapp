// 测试环境设置文件
import { config } from 'dotenv';
import { MongoMemoryServer } from 'mongodb-memory-server';

// 模拟axios以避免ES模块问题
jest.mock('axios', () => ({
  __esModule: true,
  default: {
    create: jest.fn(() => ({
      post: jest.fn(),
      get: jest.fn(),
      put: jest.fn(),
      delete: jest.fn(),
      interceptors: {
        request: {
          use: jest.fn()
        },
        response: {
          use: jest.fn()
        }
      }
    })),
    post: jest.fn(),
    get: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
    interceptors: {
      request: {
        use: jest.fn()
      },
      response: {
        use: jest.fn()
      }
    }
  }
}));

// 先清除可能影响测试的环境变量
delete process.env.DEEPSEEK_API_KEY;

// 加载测试环境变量
config({ path: '.env.test' });

// 设置测试超时时间（下载内存Mongo时可能较慢）
jest.setTimeout(120000);

// 全局测试设置
beforeAll(async () => {
  // 设置测试环境
  process.env.NODE_ENV = 'test';

  const mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  process.env.MONGODB_URI = uri;
  process.env.MONGODB_DB_NAME = 'storyapp_test';

  // 将实例挂到全局，供 afterAll 清理
  (global as typeof globalThis & { __MONGO_MEMORY__?: MongoMemoryServer }).__MONGO_MEMORY__ = mongoServer;
});

afterAll(async () => {
  // 清理测试环境
  const globalWithMongo = global as typeof globalThis & { __MONGO_MEMORY__?: MongoMemoryServer };
  if (globalWithMongo.__MONGO_MEMORY__) {
    await globalWithMongo.__MONGO_MEMORY__.stop();
    delete globalWithMongo.__MONGO_MEMORY__;
  }
});
