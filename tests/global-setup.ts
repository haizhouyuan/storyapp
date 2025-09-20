import { FullConfig } from '@playwright/test';
import path from 'path';

/**
 * Playwright全局设置
 * 在CI环境中，服务健康检查和种子数据已在工作流中完成
 * 此处仅作为占位符，确保配置正确
 */
async function globalSetup(config: FullConfig) {
  console.log('🌱 开始Playwright全局设置...');
  
  // 确定base URL
  const baseURL = config.use?.baseURL || process.env.BASE_URL || 'http://localhost:5001';
  console.log(`目标服务: ${baseURL}`);
  
  // 在本地运行时，为 E2E 测试补充基本种子数据，模拟 CI 环境
  if (!process.env.CI) {
    try {
      const seedScriptPath = path.resolve(__dirname, '../scripts/ci/seed-test-data.js');
      // 仅在未显式指定 BASE_URL 时，使用默认后端地址
      const previousBaseUrl = process.env.BASE_URL;
      if (!previousBaseUrl) {
        process.env.BASE_URL = process.env.API_URL || 'http://localhost:5000';
      }
      console.log('🫘 正在生成本地测试数据...');
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { seedTestData } = require(seedScriptPath);
      await seedTestData({ apiUrl: process.env.API_URL || 'http://localhost:5000' });
      console.log('✅ 本地测试数据准备完成');
      if (!previousBaseUrl) {
        delete process.env.BASE_URL;
      }
    } catch (error) {
      console.warn('⚠️ 本地种子数据创建失败，不影响后续测试继续：', error);
    }
  } else {
    console.log('ℹ️ 服务健康检查和种子数据已在CI工作流中完成');
  }
  console.log('🎉 Playwright全局设置完成');
}

export default globalSetup;
