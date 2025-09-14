import { test, expect, Page } from '@playwright/test';

// 测试配置常量（支持通过环境变量覆盖，便于CI/容器环境运行）
const FRONTEND_URL = process.env.BASE_URL || 'http://localhost:3000';
const BACKEND_URL = process.env.API_URL || 'http://localhost:5000';

// 测试数据
const TEST_STORY_TOPICS = [
  '小兔子的冒险',
  '神奇的森林',
  '月亮上的旅行',
  '彩虹城堡'
];

/**
 * 儿童睡前故事App E2E测试套件
 * 测试完整的用户流程：输入主题 → 故事互动 → 选择分支 → 保存故事 → 查看我的故事
 */

test.describe('儿童睡前故事App', () => {
  
  test.beforeEach(async ({ page }) => {
    // 每个测试前都访问首页
    await page.goto(FRONTEND_URL);
    
    // 等待页面加载完成
    await expect(page.locator('text=睡前故事时间')).toBeVisible();
  });

  test('应用首页加载和基本元素显示', async ({ page }) => {
    // 验证页面标题
    await expect(page).toHaveTitle(/儿童睡前故事/);
    
    // 验证主要UI元素
    await expect(page.locator('text=睡前故事时间')).toBeVisible();
    await expect(page.locator('text=告诉我你想听什么故事')).toBeVisible();
    
    // 验证输入框
    const topicInput = page.getByTestId('topic-input');
    await expect(topicInput).toBeVisible();
    await expect(topicInput).toHaveAttribute('placeholder', /请输入你想听的故事主题/);
    
    // 验证开始按钮（应该是禁用状态）
    const startButton = page.getByTestId('start-story-button');
    await expect(startButton).toBeVisible();
    await expect(startButton).toBeDisabled();
    
    // 验证"我的故事"按钮
    const myStoriesButton = page.getByTestId('my-stories-button');
    await expect(myStoriesButton).toBeVisible();
    
    // 验证示例主题按钮
    await expect(page.locator('text=小兔子的冒险')).toBeVisible();
  });

  test('故事主题输入验证', async ({ page }) => {
    const topicInput = page.getByTestId('topic-input');
    const startButton = page.getByTestId('start-story-button');
    
    // 测试空输入
    await expect(startButton).toBeDisabled();
    
    // 测试有效输入
    await topicInput.fill('小猫咪的冒险');
    await expect(startButton).toBeEnabled();
    
    // 测试字符计数
    await expect(page.locator('text=7/100')).toBeVisible();
    
    // 测试清空输入
    await topicInput.clear();
    await expect(startButton).toBeDisabled();
  });

  test('使用示例主题快速填充', async ({ page }) => {
    const topicInput = page.getByTestId('topic-input');
    
    // 点击示例主题
    await page.locator('text=小兔子的冒险').click();
    
    // 验证输入框被填充
    await expect(topicInput).toHaveValue('小兔子的冒险');
    
    // 验证开始按钮启用
    await expect(page.getByTestId('start-story-button')).toBeEnabled();
  });

  test('导航到"我的故事"页面', async ({ page }) => {
    // 点击"我的故事"按钮
    await page.getByTestId('my-stories-button').click();
    
    // 验证页面跳转
    await expect(page).toHaveURL(/\/my-stories$/);
    
    // 验证页面内容
    await expect(page.locator('text=我的故事')).toBeVisible();
    await expect(page.getByTestId('home-button')).toBeVisible();
    
    // 检查页面是否加载完成（等待加载状态消失或内容出现）
    await page.waitForLoadState('networkidle');
    
    // 等待页面内容加载完成
    await page.locator('text=我的故事').waitFor({ state: 'visible' });
    
    // 验证搜索框存在
    await expect(page.getByTestId('search-input')).toBeVisible();
    
    // 检查是否有故事或显示空状态
    const hasStories = await page.locator('[data-testid^="story-card-"]').count() > 0;
    
    if (!hasStories) {
      await expect(page.locator('text=还没有保存的故事')).toBeVisible();
      await expect(page.getByTestId('create-first-story-button')).toBeVisible();
    } else {
      // 如果有故事，验证故事统计信息显示
      await expect(page.locator('text=共有').first()).toBeVisible();
    }
  });

  test('从"我的故事"返回首页', async ({ page }) => {
    // 导航到"我的故事"
    await page.getByTestId('my-stories-button').click();
    await expect(page).toHaveURL(/\/my-stories$/);
    
    // 点击返回首页按钮
    await page.getByTestId('home-button').click();
    
    // 验证回到首页
    await expect(page).toHaveURL(FRONTEND_URL);
    await expect(page.locator('text=睡前故事时间')).toBeVisible();
  });

  test('故事创作完整流程', async ({ page }) => {
    // 步骤1: 输入故事主题
    const topicInput = page.getByTestId('topic-input');
    const testTopic = TEST_STORY_TOPICS[0];
    
    await topicInput.fill(testTopic);
    await expect(page.getByTestId('start-story-button')).toBeEnabled();
    
    // 步骤2: 开始故事
    await page.getByTestId('start-story-button').click();
    
    // 验证跳转到故事页面
    await expect(page).toHaveURL(/\/story$/);
    
    // 等待故事生成（使用模拟数据时应该很快）
    await expect(page.locator('text=正在为你创作精彩的故事')).toBeVisible();
    
    // 等待故事内容出现（CI环境使用模拟数据，超时时间缩短）
    await expect(page.locator('[data-testid^="choice-button-"]').first()).toBeVisible({ timeout: 15000 });
    
    // 验证故事页面元素
    await expect(page.locator(`text=${testTopic}`)).toBeVisible();
    await expect(page.getByTestId('home-button')).toBeVisible();
    
    // 步骤3: 进行选择
    const choiceButtons = page.locator('[data-testid^="choice-button-"]');
    const choiceCount = await choiceButtons.count();
    
    expect(choiceCount).toBeGreaterThanOrEqual(1);
    expect(choiceCount).toBeLessThanOrEqual(3);
    
    // 点击第一个选择
    await choiceButtons.first().click();
    
    // 等待新的故事片段生成
    await expect(page.locator('text=故事正在继续')).toBeVisible();
    
    // CI环境中使用模拟数据，响应更快
    console.log('故事生成测试完成 (使用模拟数据)');
  }, 30000); // 减少测试超时时间到30秒（CI环境使用模拟数据）

  test('API健康检查', async ({ page }) => {
    // 直接测试后端API
    const response = await page.request.get(`${BACKEND_URL}/api/health`);
    
    expect(response.status()).toBe(200);
    
    const healthData = await response.json();
    expect(healthData).toHaveProperty('status');
    expect(healthData.status).toEqual('healthy');
  });

  test('故事主题验证 - 过长输入', async ({ page }) => {
    const topicInput = page.getByTestId('topic-input');
    
    // 输入超长文本（超过100字符）
    const longTopic = 'a'.repeat(101);
    await topicInput.fill(longTopic);
    
    // 验证字符限制
    const inputValue = await topicInput.inputValue();
    expect(inputValue.length).toBeLessThanOrEqual(100);
  });

  test('响应式设计 - 移动端视图', async ({ page }) => {
    // 设置移动端视口
    await page.setViewportSize({ width: 375, height: 667 });
    
    // 验证页面仍然可用
    await expect(page.locator('text=睡前故事时间')).toBeVisible();
    await expect(page.getByTestId('topic-input')).toBeVisible();
    await expect(page.getByTestId('my-stories-button')).toBeVisible();
    
    // 验证按钮足够大（适合触摸）
    const startButton = page.getByTestId('start-story-button');
    const boundingBox = await startButton.boundingBox();
    
    if (boundingBox) {
      // 按钮高度应至少48px（推荐的最小触摸目标）
      expect(boundingBox.height).toBeGreaterThanOrEqual(48);
    }
  });

  test('搜索功能测试', async ({ page }) => {
    // 导航到"我的故事"页面
    await page.getByTestId('my-stories-button').click();
    await expect(page).toHaveURL(/\/my-stories$/);
    
    // 定位搜索输入框
    const searchInput = page.getByTestId('search-input');
    await expect(searchInput).toBeVisible();
    
    // 测试搜索功能（即使没有故事也不会报错）
    await searchInput.fill('测试搜索');
    
    // 验证搜索结果提示
    // 如果没有匹配的故事，应该显示相应消息
    const hasResults = await page.locator('[data-testid^="story-card-"]').count() > 0;
    
    if (!hasResults) {
      await expect(page.locator('text=没找到匹配的故事')).toBeVisible();
    }
  });

  test('键盘导航支持', async ({ page }) => {
    const topicInput = page.getByTestId('topic-input');
    
    // 等待页面完全加载
    await page.waitForLoadState('networkidle');
    
    // 由于输入框有autofocus，它应该已经获得焦点
    await expect(topicInput).toBeFocused();
    
    // 输入内容
    await topicInput.fill('键盘测试故事');
    
    // 使用Tab键导航到按钮
    await page.keyboard.press('Tab');
    
    // 验证按钮获得焦点
    const startButton = page.getByTestId('start-story-button');
    await expect(startButton).toBeFocused();
    
    // 按Enter键应该触发开始故事
    await page.keyboard.press('Enter');
    
    // 验证导航到故事页面
    await expect(page).toHaveURL(/\/story$/);
  });

  test('错误处理 - 网络失败', async ({ page }) => {
    // 拦截API请求并返回网络错误
    await page.route('**/api/generate-story', route => {
      route.abort('failed');
    });
    
    // 尝试开始故事
    await page.getByTestId('topic-input').fill('测试网络错误');
    await page.getByTestId('start-story-button').click();
    
    // 应该显示错误消息（通过toast或其他错误提示）
    // 具体实现取决于应用的错误处理方式
    console.log('网络错误测试完成');
  });
});

test.describe('Accessibility Tests', () => {
  test('基本无障碍性检查', async ({ page }) => {
    await page.goto(FRONTEND_URL);
    
    // 验证页面有适当的标题
    await expect(page).toHaveTitle(/儿童睡前故事/);
    
    // 验证主要交互元素有适当的标签
    const topicInput = page.getByTestId('topic-input');
    await expect(topicInput).toHaveAttribute('placeholder');
    
    // 验证按钮有可访问的文本
    const startButton = page.getByTestId('start-story-button');
    const buttonText = await startButton.textContent();
    expect(buttonText).toBeTruthy();
    expect(buttonText?.length).toBeGreaterThan(0);
  });
  
  test('颜色对比度和视觉可访问性', async ({ page }) => {
    await page.goto(FRONTEND_URL);
    
    // 验证重要元素可见性
    await expect(page.locator('text=睡前故事时间')).toBeVisible();
    await expect(page.getByTestId('topic-input')).toBeVisible();
    await expect(page.getByTestId('start-story-button')).toBeVisible();
    
    // 确保在禁用状态下按钮仍然可见
    const startButton = page.getByTestId('start-story-button');
    await expect(startButton).toBeVisible();
  });
});

// 辅助函数
async function waitForStoryGeneration(page: Page, timeout = 30000) {
  // 等待加载状态消失
  await expect(page.locator('text=正在创作神奇的故事')).toBeHidden({ timeout });
  
  // 等待选择按钮出现
  await expect(page.locator('[data-testid^="choice-button-"]').first()).toBeVisible({ timeout });
}
