const { chromium } = require('playwright');

async function testStoryGeneration() {
  console.log('🚀 Starting production story generation test...');
  
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Navigate to production site
    console.log('📍 Navigating to http://storyapp.dandanbaba.xyz');
    await page.goto('http://storyapp.dandanbaba.xyz', { 
      waitUntil: 'networkidle',
      timeout: 30000 
    });

    // Check page title
    const title = await page.title();
    console.log(`📄 Page title: ${title}`);

    // Check if default mode is "经典模式" - with error handling
    try {
      const selectedMode = await page.locator('input[type="radio"]:checked').getAttribute('value', { timeout: 10000 });
      console.log(`🎯 Default story mode: ${selectedMode}`);
      
      if (selectedMode === 'progressive') {
        console.log('✅ Default mode is correctly set to progressive (经典模式)');
      } else {
        console.log('❌ Default mode is not progressive:', selectedMode);
      }
    } catch (error) {
      console.log('⚠️ Could not find selected radio button, checking all radio buttons...');
      const radioButtons = await page.locator('input[type="radio"]').all();
      for (let i = 0; i < radioButtons.length; i++) {
        const value = await radioButtons[i].getAttribute('value');
        const checked = await radioButtons[i].isChecked();
        console.log(`  Radio ${i}: value=${value}, checked=${checked}`);
      }
    }

    // Fill in story topic
    console.log('📝 Filling in story topic: 小兔子的冒险');
    await page.fill('input[placeholder*="主题"]', '小兔子的冒险');

    // Monitor network requests
    const requests = [];
    page.on('request', request => {
      if (request.url().includes('/api/')) {
        requests.push({
          url: request.url(),
          method: request.method(),
          timestamp: new Date().toISOString()
        });
        console.log(`🌐 API Request: ${request.method()} ${request.url()}`);
      }
    });

    // Monitor network responses
    page.on('response', response => {
      if (response.url().includes('/api/')) {
        console.log(`📡 API Response: ${response.status()} ${response.url()}`);
        if (response.status() >= 400) {
          console.log(`❌ API Error: ${response.status()} ${response.statusText()}`);
        }
      }
    });

    // Click start story button
    console.log('🔴 Clicking "开始讲故事" button...');
    await page.click('button:has-text("开始讲故事")');

    // Wait for navigation or error
    console.log('⏳ Waiting for navigation or response...');
    
    try {
      // Wait for navigation to story page
      await page.waitForURL(/.*\/story.*/, { timeout: 60000 });
      
      const currentUrl = page.url();
      console.log(`🔄 Current URL: ${currentUrl}`);
      
      if (currentUrl.includes('/story')) {
        console.log('✅ Successfully navigated to story page!');
        
        // Wait for story content to load - try multiple selectors
        try {
          await Promise.race([
            page.waitForSelector('.story-content', { timeout: 60000 }),
            page.waitForSelector('.story-segment', { timeout: 60000 }),
            page.waitForSelector('[data-testid="story-content"]', { timeout: 60000 }),
            page.waitForSelector('text=/在.*的/', { timeout: 60000 }) // Wait for story-like text
          ]);
          
          // Try to get story content from various possible selectors
          const contentSelectors = ['.story-content', '.story-segment', '[data-testid="story-content"]', 'main', '.container'];
          let storyContent = '';
          
          for (const selector of contentSelectors) {
            try {
              const element = await page.locator(selector).first();
              if (await element.isVisible()) {
                storyContent = await element.textContent();
                if (storyContent && storyContent.length > 50) {
                  console.log(`📖 Story content found via "${selector}":`, storyContent.substring(0, 150) + '...');
                  break;
                }
              }
            } catch (e) {
              // Continue to next selector
            }
          }
          
          if (!storyContent || storyContent.length < 50) {
            console.log('⚠️ Story content not found, checking page text...');
            const pageText = await page.textContent('body');
            console.log('📄 Page content sample:', pageText?.substring(0, 200) + '...');
          }
          
        } catch (error) {
          console.log('⚠️ Could not find story content, but page loaded. Checking choices...');
          
          // Look for choice buttons
          const choiceButtons = await page.locator('button').all();
          console.log(`🎯 Found ${choiceButtons.length} buttons on the page`);
          
          for (let i = 0; i < Math.min(choiceButtons.length, 5); i++) {
            const buttonText = await choiceButtons[i].textContent();
            console.log(`  Button ${i}: "${buttonText}"`);
          }
        }
      } else {
        // Check for error messages
        const errorElement = await page.locator('.error, [role="alert"]').first();
        if (await errorElement.isVisible()) {
          const errorText = await errorElement.textContent();
          console.log('❌ Error message found:', errorText);
        } else {
          console.log('⚠️ No navigation to story page, checking current state...');
        }
      }
      
    } catch (error) {
      console.log('⚠️ Timeout or error during story generation:', error.message);
      
      // Check current page state
      const currentUrl = page.url();
      console.log(`🔄 Current URL after timeout: ${currentUrl}`);
      
      // Look for any error messages
      const errorElements = await page.locator('text=/错误|失败|Error|timeout/i').all();
      for (const element of errorElements) {
        const text = await element.textContent();
        console.log('❌ Error found:', text);
      }
    }

    // Summary of API requests
    console.log('\n📊 API Requests Summary:');
    requests.forEach(req => {
      console.log(`  ${req.method} ${req.url} at ${req.timestamp}`);
    });

  } catch (error) {
    console.error('💥 Test failed:', error);
  } finally {
    console.log('🏁 Test completed, keeping browser open for 10 seconds...');
    await page.waitForTimeout(10000);
    await browser.close();
  }
}

testStoryGeneration().catch(console.error);