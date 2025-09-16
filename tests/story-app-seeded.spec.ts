import { test, expect } from '@playwright/test';

/**
 * 基于确定性种子数据的E2E测试
 * 这些测试依赖于global-setup.ts中创建的预定义测试数据
 */

// 测试配置
const BASE_URL = process.env.BASE_URL || 'http://localhost:5001';

// 预期的种子数据（与seed-e2e-data.js保持同步）
const EXPECTED_SEED_STORIES = [
  {
    title: '测试故事：小兔子的冒险',
    expectedChoices: [
      '选择走向花香阵阵的左边小路',
      '选择走向鸟语花香的中间大路', 
      '选择走向神秘幽静的右边小径'
    ]
  },
  {
    title: '测试故事：月亮上的旅行',
    expectedChoices: [
      '去拜访住在月宫里的嫦娥姐姐',
      '和可爱的月兔一起玩耍',
      '收集美丽的星星做项链'
    ]
  },
  {
    title: '测试故事：彩虹城堡的秘密',
    expectedChoices: [
      '按下红色按钮（代表勇气）',
      '按下蓝色按钮（代表智慧）',
      '按下黄色按钮（代表友善）'
    ]
  }
];

test.describe('确定性种子数据E2E测试', () => {
  
  test.beforeEach(async ({ page }) => {
    // 访问应用首页
    await page.goto('/');
    await expect(page.locator('text=睡前故事时间')).toBeVisible();
  });

  test('验证种子数据已正确创建', async ({ page }) => {
    // 导航到"我的故事"页面
    await page.getByTestId('my-stories-button').click();
    await expect(page).toHaveURL(/\/my-stories$/);
    
    // 验证页面加载
    await expect(page.locator('text=我的故事')).toBeVisible();
    
    // 等待故事卡片加载
    await page.waitForSelector('[data-testid^="story-card-"]', { timeout: 10000 });
    
    // 获取所有故事卡片
    const storyCards = page.locator('[data-testid^="story-card-"]');
    const storyCount = await storyCards.count();
    
    console.log(`发现 ${storyCount} 个故事`);
    expect(storyCount).toBeGreaterThanOrEqual(EXPECTED_SEED_STORIES.length);
    
    // 验证测试故事存在
    for (const expectedStory of EXPECTED_SEED_STORIES) {
      await expect(page.locator(`text=${expectedStory.title}`)).toBeVisible();
      console.log(`✅ 发现预期故事: ${expectedStory.title}`);
    }
  });

  test('测试种子故事详情页访问', async ({ page }) => {
    // 导航到我的故事
    await page.getByTestId('my-stories-button').click();
    
    // 点击第一个测试故事
    const firstTestStory = page.locator('[data-testid^="story-card-"]').first();
    await firstTestStory.click();
    
    // 验证跳转到故事详情页
    await expect(page).toHaveURL(/\/story\?id=/);
    
    // 验证故事内容显示
    await expect(page.locator('[data-testid="story-content"]')).toBeVisible();
    
    // 验证选择按钮存在
    const choiceButtons = page.locator('[data-testid^="choice-button-"]');
    const choiceCount = await choiceButtons.count();
    expect(choiceCount).toBeGreaterThan(0);
    expect(choiceCount).toBeLessThanOrEqual(3);
  });

  test('测试确定性选择交互', async ({ page }) => {
    // 导航到我的故事
    await page.getByTestId('my-stories-button').click();
    
    // 查找"小兔子的冒险"故事
    const rabbitStory = page.locator('text=测试故事：小兔子的冒险').first();
    await rabbitStory.click();
    
    // 验证跳转到故事页面
    await expect(page).toHaveURL(/\/story\?id=/);
    
    // 等待故事内容加载
    await expect(page.locator('[data-testid="story-content"]')).toBeVisible();
    
    // 验证预期的选择选项存在
    const expectedChoices = EXPECTED_SEED_STORIES[0].expectedChoices;
    for (const choice of expectedChoices) {
      await expect(page.locator(`text=${choice}`)).toBeVisible();
    }
    
    // 点击第一个选择
    const firstChoice = page.locator('[data-testid^="choice-button-"]').first();
    await firstChoice.click();
    
    // 验证选择后的反馈（加载状态或新内容）
    // 注意：由于种子数据是静态的，可能不会触发AI生成
    await expect(page.locator('text=故事正在继续')).toBeVisible();
  });

  test('测试故事搜索功能（基于种子数据）', async ({ page }) => {
    // 导航到我的故事
    await page.getByTestId('my-stories-button').click();
    
    // 使用搜索功能查找特定故事
    const searchInput = page.getByTestId('search-input');
    await searchInput.fill('小兔子');
    
    // 验证搜索结果
    await expect(page.locator('text=测试故事：小兔子的冒险')).toBeVisible();
    
    // 验证其他故事被过滤掉
    await expect(page.locator('text=测试故事：月亮上的旅行')).not.toBeVisible();
    
    // 清空搜索，验证所有故事再次显示
    await searchInput.clear();
    await expect(page.locator('text=测试故事：小兔子的冒险')).toBeVisible();
    await expect(page.locator('text=测试故事：月亮上的旅行')).toBeVisible();
  });

  test('验证种子数据API接口', async ({ page }) => {
    // 直接测试API接口
    const response = await page.request.get('/api/get-stories');
    
    expect(response.status()).toBe(200);
    
    const data = await response.json();
    expect(data).toHaveProperty('stories');
    expect(data.stories).toBeInstanceOf(Array);
    
    // 验证测试故事存在
    const testStories = data.stories.filter((story: any) => 
      story.title && story.title.startsWith('测试故事：')
    );
    
    expect(testStories.length).toBeGreaterThanOrEqual(EXPECTED_SEED_STORIES.length);
    
    // 验证每个测试故事的结构
    for (const story of testStories) {
      expect(story).toHaveProperty('_id');
      expect(story).toHaveProperty('title');
      expect(story).toHaveProperty('content');
      expect(story).toHaveProperty('created_at');
      
      // 验证内容是有效的JSON
      expect(() => JSON.parse(story.content)).not.toThrow();
      
      const contentData = JSON.parse(story.content);
      expect(contentData).toHaveProperty('storySegment');
      expect(contentData).toHaveProperty('choices');
      expect(contentData.choices).toBeInstanceOf(Array);
    }
  });

  test('测试种子数据的故事内容结构', async ({ page }) => {
    // 获取故事列表
    const response = await page.request.get('/api/get-stories');
    const data = await response.json();
    
    const rabbitStory = data.stories.find((story: any) => 
      story.title === '测试故事：小兔子的冒险'
    );
    
    expect(rabbitStory).toBeTruthy();
    
    const contentData = JSON.parse(rabbitStory.content);
    
    // 验证故事片段
    expect(contentData.storySegment).toContain('小兔子波波');
    expect(contentData.storySegment).toContain('森林里探险');
    
    // 验证选择选项
    expect(contentData.choices).toHaveLength(3);
    expect(contentData.choices[0]).toContain('花香阵阵的左边小路');
    expect(contentData.choices[1]).toContain('鸟语花香的中间大路');
    expect(contentData.choices[2]).toContain('神秘幽静的右边小径');
    
    // 验证元数据
    expect(contentData.metadata).toHaveProperty('theme', 'adventure');
    expect(contentData.metadata).toHaveProperty('ageGroup', '3-6');
    expect(contentData.metadata).toHaveProperty('sessionId');
  });

  test('E2E流程测试：从首页到故事交互（基于种子数据）', async ({ page }) => {
    // 步骤1：验证首页
    await expect(page.locator('text=睡前故事时间')).toBeVisible();
    
    // 步骤2：导航到我的故事
    await page.getByTestId('my-stories-button').click();
    
    // 步骤3：验证故事列表有种子数据
    await expect(page.locator('text=测试故事：小兔子的冒险')).toBeVisible();
    
    // 步骤4：点击故事进入详情
    await page.locator('text=测试故事：小兔子的冒险').first().click();
    
    // 步骤5：验证故事内容和选择
    await expect(page.locator('[data-testid="story-content"]')).toBeVisible();
    await expect(page.locator('text=选择走向花香阵阵的左边小路')).toBeVisible();
    
    // 步骤6：进行选择交互
    await page.locator('text=选择走向花香阵阵的左边小路').click();
    
    // 步骤7：验证交互反馈
    await expect(page.locator('text=故事正在继续')).toBeVisible();
    
    // 步骤8：返回首页
    await page.getByTestId('home-button').click();
    await expect(page).toHaveURL('/');
    await expect(page.locator('text=睡前故事时间')).toBeVisible();
  });
});

// 验证种子数据清理功能（可选）
test.describe('种子数据管理', () => {
  test('验证测试数据标识', async ({ page }) => {
    const response = await page.request.get('/api/get-stories');
    const data = await response.json();
    
    const testStories = data.stories.filter((story: any) => 
      story.title && story.title.startsWith('测试故事：')
    );
    
    // 验证所有测试故事都有正确的标识
    for (const story of testStories) {
      const contentData = JSON.parse(story.content);
      expect(contentData.metadata).toHaveProperty('sessionId');
      expect(contentData.metadata.sessionId).toMatch(/^e2e-test-session-/);
    }
  });
});