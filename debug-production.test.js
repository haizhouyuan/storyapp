const { chromium } = require('playwright');

async function debugProduction() {
  console.log('🚀 开始调试生产环境故事生成功能...');
  
  const browser = await chromium.launch({ 
    headless: false,  // 显示浏览器窗口
    devtools: true    // 打开开发者工具
  });
  
  try {
    const page = await browser.newPage();
    
    // 监听网络请求
    page.on('request', request => {
      console.log(`📤 请求: ${request.method()} ${request.url()}`);
      if (request.postData()) {
        console.log(`📤 请求数据: ${request.postData()}`);
      }
    });
    
    // 监听网络响应
    page.on('response', response => {
      console.log(`📥 响应: ${response.status()} ${response.url()}`);
    });
    
    // 监听控制台错误
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log(`❌ 控制台错误: ${msg.text()}`);
      } else if (msg.type() === 'warn') {
        console.log(`⚠️ 控制台警告: ${msg.text()}`);
      } else {
        console.log(`ℹ️ 控制台: ${msg.text()}`);
      }
    });
    
    // 监听页面错误
    page.on('pageerror', error => {
      console.log(`💥 页面错误: ${error.message}`);
    });
    
    // 1. 导航到生产站点
    console.log('🌐 导航到: https://storyapp.dandanbaba.xyz');
    await page.goto('https://storyapp.dandanbaba.xyz', { 
      waitUntil: 'networkidle',
      timeout: 30000 
    });
    
    // 等待页面加载
    await page.waitForTimeout(2000);
    
    // 2. 检查页面是否正确加载
    try {
      await page.waitForSelector('text=睡前故事时间', { timeout: 10000 });
      console.log('✅ 主页面加载成功');
    } catch (error) {
      console.log('❌ 主页面加载失败:', error.message);
      
      // 截图查看实际页面内容
      await page.screenshot({ path: 'debug-homepage-error.png', fullPage: true });
      console.log('📸 已保存错误页面截图: debug-homepage-error.png');
      
      // 打印页面内容
      const content = await page.content();
      console.log('📄 页面内容:', content.substring(0, 1000) + '...');
      return;
    }
    
    // 3. 查找并填写输入框
    console.log('🔍 查找故事主题输入框...');
    const topicInput = await page.locator('[data-testid="topic-input"]');
    
    if (await topicInput.count() === 0) {
      console.log('❌ 未找到 data-testid="topic-input"，尝试其他选择器...');
      
      // 尝试其他可能的选择器
      const altSelectors = [
        'input[placeholder*="故事"]',
        'input[placeholder*="主题"]',
        'input[type="text"]',
        'textarea'
      ];
      
      let foundInput = null;
      for (const selector of altSelectors) {
        const element = page.locator(selector);
        if (await element.count() > 0) {
          console.log(`✅ 找到输入框: ${selector}`);
          foundInput = element.first();
          break;
        }
      }
      
      if (!foundInput) {
        console.log('❌ 未找到任何输入框');
        await page.screenshot({ path: 'debug-no-input.png', fullPage: true });
        return;
      }
    }
    
    // 4. 填写故事主题
    console.log('✏️ 填写故事主题: "小兔子的冒险"');
    await topicInput.fill('小兔子的冒险');
    
    // 5. 查找开始按钮
    console.log('🔍 查找开始按钮...');
    let startButton = page.locator('[data-testid="start-story-button"]');
    
    if (await startButton.count() === 0) {
      console.log('❌ 未找到 data-testid="start-story-button"，尝试其他选择器...');
      
      const altButtonSelectors = [
        'button:has-text("开始")',
        'button:has-text("讲故事")',
        'button:has-text("生成")',
        'button[type="submit"]',
        '.start-button',
        '.btn-primary'
      ];
      
      for (const selector of altButtonSelectors) {
        const element = page.locator(selector);
        if (await element.count() > 0) {
          console.log(`✅ 找到按钮: ${selector}`);
          startButton = element.first();
          break;
        }
      }
    }
    
    // 检查按钮状态
    const isEnabled = await startButton.isEnabled();
    console.log(`🎯 按钮状态: ${isEnabled ? '启用' : '禁用'}`);
    
    if (!isEnabled) {
      console.log('❌ 按钮被禁用，可能需要更多输入');
      await page.screenshot({ path: 'debug-button-disabled.png', fullPage: true });
      return;
    }
    
    // 6. 点击开始按钮
    console.log('🎬 点击开始按钮...');
    await startButton.click();
    
    // 7. 等待响应并观察变化
    console.log('⏳ 等待页面响应...');
    await page.waitForTimeout(5000);  // 等待5秒观察变化
    
    // 8. 检查是否跳转到故事页面
    const currentUrl = page.url();
    console.log(`🔗 当前URL: ${currentUrl}`);
    
    if (currentUrl.includes('/story')) {
      console.log('✅ 成功跳转到故事页面');
      
      // 等待故事内容加载
      console.log('⏳ 等待故事内容加载...');
      await page.waitForTimeout(10000);  // 等待10秒让AI生成内容
      
      // 检查是否有错误信息
      const errorElements = await page.locator('text*="错误"').count();
      if (errorElements > 0) {
        console.log('❌ 发现错误信息');
        const errorText = await page.locator('text*="错误"').first().textContent();
        console.log(`❌ 错误内容: ${errorText}`);
      }
      
      // 截图保存当前状态
      await page.screenshot({ path: 'debug-story-page.png', fullPage: true });
      console.log('📸 已保存故事页面截图: debug-story-page.png');
      
    } else {
      console.log('❌ 未跳转到故事页面，仍在首页');
      await page.screenshot({ path: 'debug-no-redirect.png', fullPage: true });
    }
    
    console.log('🔍 等待60秒以观察网络请求和页面变化...');
    await page.waitForTimeout(60000);  // 等待1分钟观察完整流程
    
  } catch (error) {
    console.log(`💥 执行过程中发生错误: ${error.message}`);
    console.log(`📍 错误堆栈: ${error.stack}`);
  } finally {
    // 不关闭浏览器，保持打开状态供手动检查
    console.log('🔍 测试完成，浏览器保持打开状态供手动检查...');
    // await browser.close();
  }
}

// 运行调试函数
debugProduction().catch(console.error);