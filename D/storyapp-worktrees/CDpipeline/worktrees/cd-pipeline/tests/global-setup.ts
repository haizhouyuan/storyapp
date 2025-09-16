import { chromium, FullConfig } from '@playwright/test';
import { execSync } from 'child_process';
import path from 'path';

/**
 * Playwright全局设置 - E2E测试种子数据初始化
 * 仅在CI环境中运行，确保测试环境有确定性的数据
 */
async function globalSetup(config: FullConfig) {
  console.log('🌱 开始Playwright全局设置...');
  
  // 确定base URL
  const baseURL = config.use?.baseURL || process.env.BASE_URL || 'http://localhost:5001';
  console.log(`目标服务: ${baseURL}`);
  
  // 启动浏览器进行健康检查
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  try {
    // 等待服务就绪
    console.log('⏳ 等待服务就绪...');
    let retries = 30;
    
    while (retries > 0) {
      try {
        const response = await page.goto(`${baseURL}/healthz`, { 
          waitUntil: 'networkidle',
          timeout: 5000 
        });
        
        if (response && response.status() === 200) {
          console.log('✅ 服务已就绪');
          break;
        }
      } catch (error) {
        console.log(`等待服务就绪... (${31 - retries}/30)`);
        await page.waitForTimeout(2000);
        retries--;
      }
    }
    
    if (retries === 0) {
      throw new Error('服务在60秒后仍未就绪');
    }
    
    // 运行种子数据脚本
    console.log('🌱 创建E2E测试种子数据...');
    const seedScriptPath = path.resolve(__dirname, '..', 'scripts', 'seed-e2e-data.js');
    
    try {
      execSync(`node "${seedScriptPath}"`, {
        stdio: 'inherit',
        env: {
          ...process.env,
          BASE_URL: baseURL,
          CLEANUP_EXISTING: 'true'
        },
        timeout: 30000
      });
      
      console.log('✅ 种子数据创建完成');
    } catch (error) {
      console.error('❌ 种子数据创建失败:', error);
      throw error;
    }
    
    // 验证种子数据
    console.log('🔍 验证种子数据...');
    const storiesResponse = await page.goto(`${baseURL}/api/get-stories`);
    
    if (storiesResponse && storiesResponse.status() === 200) {
      const storiesData = await storiesResponse.json();
      const testStories = (storiesData.stories || []).filter((story: any) => 
        story.title && story.title.startsWith('测试故事：')
      );
      
      console.log(`📊 验证结果: ${testStories.length} 个测试故事已创建`);
      
      if (testStories.length === 0) {
        console.warn('⚠️ 警告: 没有发现测试故事，E2E测试可能不稳定');
      }
    } else {
      console.warn('⚠️ 无法验证种子数据');
    }
    
  } finally {
    await browser.close();
  }
  
  console.log('🎉 Playwright全局设置完成');
}

export default globalSetup;