import { FullConfig } from '@playwright/test';

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
  
  console.log('ℹ️ 服务健康检查和种子数据已在CI工作流中完成');
  console.log('🎉 Playwright全局设置完成');
}

export default globalSetup;