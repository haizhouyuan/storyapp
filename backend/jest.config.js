module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: [
    '**/__tests__/**/*.test.ts',
    '**/?(*.)+(spec|test).ts'
  ],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  // 允许Jest处理ES模块
  transformIgnorePatterns: [
    'node_modules/(?!(uuid)/)'
  ],
  // 处理ES模块的包
  extensionsToTreatAsEsm: ['.ts'],
  globals: {
    'ts-jest': {
      useESM: true
    }
  },
  // 模块名映射，确保使用CommonJS版本
  moduleNameMapper: {
    '^uuid$': 'uuid'
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/index.ts',
    '!src/**/*.d.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  
  // 全局设置和清理（用于内存数据库）
  globalSetup: '<rootDir>/tests/globalSetup.ts',
  globalTeardown: '<rootDir>/tests/globalTeardown.ts',
  testTimeout: 10000,
  // 为避免并发测试之间对同一Mongo集合的相互清理/干扰，序列化执行测试
  maxWorkers: 1,
  verbose: true
};
