const { chromium } = require('playwright');

async function debugSimpleProduction() {
  console.log('🚀 开始调试生产环境（使用HTTP）...');
  
  const browser = await chromium.launch({ 
    headless: false  // 显示浏览器窗口以便观察
  });
  
  try {
    const page = await browser.newPage();
    
    // 监听网络请求
    page.on('request', request => {
      if (request.url().includes('/api/')) {
        console.log(`📤 API请求: ${request.method()} ${request.url()}`);
        if (request.postData()) {
          console.log(`📤 请求数据: ${request.postData()}`);
        }
      }
    });
    
    // 监听网络响应
    page.on('response', response => {
      if (response.url().includes('/api/')) {
        console.log(`📥 API响应: ${response.status()} ${response.url()}`);
      }
    });
    
    // 监听控制台错误
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log(`❌ 控制台错误: ${msg.text()}`);
      }
    });
    
    // 监听页面错误
    page.on('pageerror', error => {
      console.log(`💥 页面错误: ${error.message}`);
    });
    
    // 1. 导航到生产站点（使用HTTP）
    console.log('🌐 导航到: http://storyapp.dandanbaba.xyz');
    await page.goto('http://storyapp.dandanbaba.xyz', { 
      waitUntil: 'networkidle',
      timeout: 30000 
    });
    
    // 2. 截图页面状态
    await page.screenshot({ path: 'debug-homepage-http.png', fullPage: true });
    console.log('📸 已保存首页截图: debug-homepage-http.png');
    
    // 3. 等待页面元素加载
    await page.waitForTimeout(3000);
    
    // 4. 查找输入框 - 尝试多种选择器
    console.log('🔍 查找输入框...');
    let inputElement = null;
    
    const inputSelectors = [
      '[data-testid="topic-input"]',
      'input[placeholder*="故事"]',
      'input[placeholder*="主题"]', 
      'textarea',
      'input[type="text"]'
    ];
    
    for (const selector of inputSelectors) {
      try {
        const element = await page.locator(selector);
        if (await element.count() > 0) {
          console.log(`✅ 找到输入框: ${selector}`);
          inputElement = element.first();
          break;
        }
      } catch (e) {
        console.log(`❌ 选择器 ${selector} 未找到`);
      }
    }
    
    if (!inputElement) {
      console.log('❌ 未找到任何输入框，检查页面结构...');
      const pageContent = await page.content();
      console.log('页面HTML长度:', pageContent.length);
      console.log('页面标题:', await page.title());
      
      // 查找所有输入元素
      const allInputs = await page.locator('input, textarea').count();
      console.log(`页面中总共有 ${allInputs} 个输入元素`);
      
      if (allInputs > 0) {
        for (let i = 0; i < allInputs; i++) {
          const input = page.locator('input, textarea').nth(i);
          const placeholder = await input.getAttribute('placeholder');
          const id = await input.getAttribute('id');
          const testId = await input.getAttribute('data-testid');
          console.log(`输入框 ${i}: placeholder="${placeholder}", id="${id}", data-testid="${testId}"`);
        }
      }
      return;
    }
    
    // 5. 填写输入框
    console.log('✏️ 填写故事主题...');
    await inputElement.fill('小兔子的冒险');
    
    // 6. 查找开始按钮
    console.log('🔍 查找开始按钮...');
    let buttonElement = null;
    
    const buttonSelectors = [
      '[data-testid="start-story-button"]',
      'button:has-text("开始")',
      'button:has-text("讲故事")',
      'button:has-text("生成")',
      'button[type="submit"]'
    ];
    
    for (const selector of buttonSelectors) {
      try {
        const element = await page.locator(selector);
        if (await element.count() > 0) {
          console.log(`✅ 找到按钮: ${selector}`);
          buttonElement = element.first();
          break;
        }
      } catch (e) {
        console.log(`❌ 按钮选择器 ${selector} 未找到`);
      }
    }
    
    if (!buttonElement) {
      console.log('❌ 未找到开始按钮');
      const allButtons = await page.locator('button').count();
      console.log(`页面中总共有 ${allButtons} 个按钮`);
      
      for (let i = 0; i < allButtons; i++) {
        const button = page.locator('button').nth(i);
        const text = await button.textContent();
        const testId = await button.getAttribute('data-testid');
        console.log(`按钮 ${i}: text="${text}", data-testid="${testId}"`);
      }
      return;
    }
    
    // 7. 检查按钮是否启用
    const isEnabled = await buttonElement.isEnabled();
    console.log(`🎯 按钮启用状态: ${isEnabled}`);
    
    if (!isEnabled) {
      console.log('❌ 按钮被禁用');
      return;
    }
    
    // 8. 点击按钮并观察
    console.log('🎬 点击开始按钮...');
    await buttonElement.click();
    
    // 9. 等待并观察页面变化
    console.log('⏳ 等待页面响应（10秒）...');
    await page.waitForTimeout(10000);
    
    // 10. 检查当前URL
    const currentUrl = page.url();
    console.log(`🔗 当前URL: ${currentUrl}`);
    
    // 11. 截图当前状态
    await page.screenshot({ path: 'debug-after-click.png', fullPage: true });
    console.log('📸 已保存点击后截图: debug-after-click.png');
    
    // 12. 检查是否有错误消息
    try {
      const errorMessages = await page.locator('*:has-text("错误"), *:has-text("失败"), *:has-text("timeout")').count();
      if (errorMessages > 0) {
        console.log(`❌ 发现 ${errorMessages} 个错误消息`);
        for (let i = 0; i < errorMessages; i++) {
          const errorText = await page.locator('*:has-text("错误"), *:has-text("失败"), *:has-text("timeout")').nth(i).textContent();
          console.log(`错误消息 ${i}: ${errorText}`);
        }
      }
    } catch (e) {
      console.log('检查错误消息时出错:', e.message);
    }
    
    console.log('🔍 保持浏览器打开30秒以观察...');
    await page.waitForTimeout(30000);
    
  } catch (error) {
    console.log(`💥 执行过程中发生错误: ${error.message}`);
  } finally {
    console.log('✅ 测试完成');
    // 不关闭浏览器，以便手动检查
    // await browser.close();
  }
}

// 运行调试函数
debugSimpleProduction().catch(console.error);