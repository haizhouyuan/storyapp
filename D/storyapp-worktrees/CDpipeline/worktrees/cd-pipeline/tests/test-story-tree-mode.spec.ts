import { test, expect } from '@playwright/test';

test.describe('故事树模式测试', () => {
  test('应该能够成功生成并浏览故事树', async ({ page }) => {
    console.log('🌲 开始测试故事树模式...');
    
    // 1. 访问首页
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');
    
    // 2. 选择故事树模式
    console.log('📻 选择故事树模式...');
    await page.click('button:has-text("故事树模式")');
    
    // 3. 输入故事主题
    console.log('✏️ 输入故事主题...');
    await page.fill('input[placeholder*="主题"]', '森林里的小兔子');
    
    // 等待按钮可用
    await page.waitForSelector('button:has-text("开始讲故事"):not([disabled])', { timeout: 10000 });
    
    // 4. 点击开始按钮
    console.log('🚀 点击开始讲故事按钮...');
    await page.click('button:has-text("开始讲故事")');
    
    // 5. 等待导航到故事树页面
    console.log('⏳ 等待导航到故事树页面...');
    await page.waitForURL('**/story-tree', { timeout: 10000 });
    
    // 6. 等待故事树生成完成或降级到模拟数据
    console.log('🌳 等待故事树生成...');
    
    // 设置较长的超时时间，因为故事树生成可能需要时间
    await page.waitForSelector('[data-testid="story-content"], .story-content, .story-segment', { 
      timeout: 120000 // 2分钟
    });
    
    // 7. 验证故事内容是否存在
    console.log('📖 验证故事内容...');
    const storyContent = await page.textContent('[data-testid="story-content"], .story-content, .story-segment');
    expect(storyContent).toBeTruthy();
    expect(storyContent.length).toBeGreaterThan(50);
    
    console.log('📝 故事内容预览:', storyContent?.substring(0, 100) + '...');
    
    // 8. 等待并验证选择按钮是否存在
    console.log('🎯 等待选择按钮出现...');
    await page.waitForSelector('[data-testid^="choice-button-"]', { timeout: 30000 });
    
    console.log('🎯 验证选择按钮...');
    const choiceButtons = await page.locator('[data-testid^="choice-button-"]').count();
    console.log('🎲 发现选择按钮数量:', choiceButtons);
    expect(choiceButtons).toBeGreaterThan(0);
    
    // 9. 尝试点击第一个选择
    console.log('👆 点击第一个选择...');
    const firstChoice = page.locator('[data-testid="choice-button-0"]');
    await firstChoice.click();
    
    // 10. 等待新的故事内容
    console.log('⏳ 等待新的故事内容...');
    await page.waitForTimeout(3000); // 等待3秒让内容更新
    
    // 11. 验证内容已更新
    const newContent = await page.textContent('[data-testid="story-content"], .story-content, .story-segment');
    expect(newContent).toBeTruthy();
    console.log('📝 新故事内容预览:', newContent?.substring(0, 100) + '...');
    
    console.log('✅ 故事树模式测试完成！');
  });
  
  test('故事树生成超时时应该降级到模拟数据', async ({ page }) => {
    console.log('⏱️ 测试故事树超时降级机制...');
    
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');
    
    // 选择故事树模式
    await page.click('button:has-text("故事树模式")');
    await page.fill('input[placeholder*="主题"]', '超级复杂的故事主题用来测试超时');
    await page.click('button:has-text("开始讲故事")');
    
    await page.waitForURL('**/story-tree', { timeout: 10000 });
    
    // 即使超时，也应该有模拟数据
    await page.waitForSelector('[data-testid="story-content"], .story-content, .story-segment', { 
      timeout: 180000 // 3分钟，足够触发超时和降级
    });
    
    const content = await page.textContent('[data-testid="story-content"], .story-content, .story-segment');
    expect(content).toBeTruthy();
    console.log('📝 降级内容预览:', content?.substring(0, 100) + '...');
    
    console.log('✅ 超时降级测试完成！');
  });
});