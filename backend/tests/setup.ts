// 测试环境设置文件
import { config } from 'dotenv';

// 模拟axios以避免ES模块问题
jest.mock('axios', () => ({
  __esModule: true,
  default: {
    create: jest.fn(() => ({
      post: jest.fn(),
      get: jest.fn(),
      put: jest.fn(),
      delete: jest.fn()
    })),
    post: jest.fn(),
    get: jest.fn(),
    put: jest.fn(),
    delete: jest.fn()
  }
}));

// 先清除可能影响测试的环境变量
delete process.env.DEEPSEEK_API_KEY;

// 加载测试环境变量
config({ path: '.env.test' });

// 设置测试超时时间
jest.setTimeout(10000);

// 全局测试设置
beforeAll(async () => {
  // 设置测试环境
  process.env.NODE_ENV = 'test';
});

afterAll(async () => {
  // 清理测试环境
});