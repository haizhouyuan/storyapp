import { test, expect } from '@playwright/test';

const APP_URL = 'http://localhost:5001';

test.describe('调试测试 - 检查页面元素', () => {
  test('检查页面加载和元素存在', async ({ page }) => {
    console.log('🔍 开始页面调试...');
    
    // 访问页面
    await page.goto(APP_URL);
    await page.waitForLoadState('networkidle');
    
    // 截图查看页面状态
    await page.screenshot({ path: 'debug-homepage.png', fullPage: true });
    
    // 获取页面标题
    const title = await page.title();
    console.log('📄 页面标题:', title);
    
    // 检查页面内容
    const bodyContent = await page.textContent('body');
    console.log('📝 页面内容前200字符:', bodyContent?.substring(0, 200));
    
    // 检查是否有常见的文本
    const hasStoryTime = await page.getByTestId('hero-title').isVisible();
    console.log('🌙 是否有"睡前故事时间":', hasStoryTime);
    
    // 查找所有按钮
    const buttons = await page.locator('button').all();
    console.log(`🔘 发现 ${buttons.length} 个按钮:`);
    for (let i = 0; i < Math.min(buttons.length, 5); i++) {
      const text = await buttons[i].textContent();
      console.log(`  按钮 ${i + 1}: "${text}"`);
    }
    
    // 查找所有输入框
    const inputs = await page.locator('input').all();
    console.log(`📝 发现 ${inputs.length} 个输入框:`);
    for (let i = 0; i < inputs.length; i++) {
      const placeholder = await inputs[i].getAttribute('placeholder');
      const type = await inputs[i].getAttribute('type');
      console.log(`  输入框 ${i + 1}: type="${type}", placeholder="${placeholder}"`);
    }
    
    // 查找所有链接
    const links = await page.locator('a').all();
    console.log(`🔗 发现 ${links.length} 个链接`);
    
    // 检查页面是否完全加载（等待React应用渲染）
    await page.waitForTimeout(3000);
    
    // 再次截图
    await page.screenshot({ path: 'debug-homepage-after-wait.png', fullPage: true });
    
    console.log('✅ 调试完成');
  });

  test('测试页面交互', async ({ page }) => {
    console.log('🎯 开始交互测试...');
    
    await page.goto(APP_URL);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    
    // 尝试查找各种可能的选择器
    const selectors = [
      'input[placeholder*="故事"]',
      'input[placeholder*="主题"]', 
      'input[type="text"]',
      'textarea',
      'button:has-text("开始")',
      'button:has-text("故事")',
      '[data-testid="topic-input"]',
      '[data-testid="start-story-button"]'
    ];
    
    for (const selector of selectors) {
      const element = page.locator(selector);
      const isVisible = await element.isVisible().catch(() => false);
      const count = await element.count();
      console.log(`🎯 选择器 "${selector}": 可见=${isVisible}, 数量=${count}`);
    }
    
    console.log('✅ 交互测试完成');
  });
});
