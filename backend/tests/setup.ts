// 测试环境设置文件
import { config } from 'dotenv';
import { MongoMemoryServer } from 'mongodb-memory-server';
import os from 'os';
import path from 'path';

const { resetLoadState } = require('../../config/env-loader');

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

// 设置测试超时时间（内存Mongo首次下载可能较慢）
jest.setTimeout(120000);

// 全局测试设置
beforeAll(async () => {
  // 设置测试环境
  process.env.NODE_ENV = 'test';
  process.env.IFLYTEK_TTS_TEST_FAKE = process.env.IFLYTEK_TTS_TEST_FAKE || '1';

  // CI 环境已提供真实 MongoDB，跳过 Memory Server
  const useExternalMongo = process.env.MONGODB_URI && (process.env.CI === 'true' || process.env.USE_EXTERNAL_MONGO === '1');

  if (!useExternalMongo) {
    // 本地开发环境：使用 MongoDB Memory Server
    const binaryOptions: Record<string, unknown> = {};
    if (process.env.MONGOMS_SYSTEM_BINARY) {
      binaryOptions.systemBinary = process.env.MONGOMS_SYSTEM_BINARY;
    } else {
      binaryOptions.version = process.env.MONGOMS_VERSION || '7.0.14';
      const downloadDir =
        process.env.MONGOMS_DOWNLOAD_DIR ||
        path.join((typeof os.homedir === 'function' ? os.homedir() : undefined) || os.tmpdir(), '.cache', 'mongodb-memory-server');
      binaryOptions.downloadDir = downloadDir;
    }

    const createOptions = Object.keys(binaryOptions).length > 0 ? { binary: binaryOptions } : undefined;

    const mongoServer = await MongoMemoryServer.create(createOptions);
    const uri = mongoServer.getUri();

    process.env.MONGODB_URI = uri;
    process.env.MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || 'storyapp_test';

    (global as typeof globalThis & { __MONGO_MEMORY__?: MongoMemoryServer }).__MONGO_MEMORY__ = mongoServer;
  } else {
    // CI 环境：使用外部 MongoDB
    process.env.MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || 'storyapp_test';
  }

  resetLoadState();
});

afterAll(async () => {
  // 清理测试环境
  const globalWithMongo = global as typeof globalThis & { __MONGO_MEMORY__?: MongoMemoryServer };
  if (globalWithMongo.__MONGO_MEMORY__) {
    await globalWithMongo.__MONGO_MEMORY__.stop();
    delete globalWithMongo.__MONGO_MEMORY__;
  }
});
