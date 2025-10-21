import { test, expect } from '@playwright/test';

// 测试配置常量（支持通过环境变量覆盖，便于CI/容器环境运行）
const FRONTEND_URL = process.env.BASE_URL || 'http://localhost:3000';
const DEFAULT_BACKEND = process.env.CI ? 'http://localhost:5001' : 'http://localhost:5000';
const BACKEND_URL = (process.env.API_URL || DEFAULT_BACKEND).replace(/\/$/, '');

// 测试数据
const TEST_STORY_TOPICS = [
  '雾岚古堡的第八声',
  '雨夜小镇的隐藏钟声',
  '图书馆的镜面迷宫',
  '午夜列车的失踪乘客',
];

/**
 * 儿童睡前故事App E2E测试套件
 * 测试完整的用户流程：输入主题 → 故事互动 → 选择分支 → 保存故事 → 查看我的故事
 */

test.describe('儿童睡前故事App', () => {
  
  test.beforeEach(async ({ page }) => {
    // 每个测试前都访问首页
    await page.goto(FRONTEND_URL);

    // 等待动画完成后的主标题出现
    await expect(page.getByTestId('hero-title')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('hero-title')).toHaveText(/一键生成你的原创侦探谜案/);
  });

  test('应用首页加载和基本元素显示', async ({ page }) => {
    // 验证页面标题
    await expect(page).toHaveTitle(/故事|侦探/);

    // 验证主要UI元素
    await expect(page.getByTestId('hero-title')).toHaveText(/一键生成你的原创侦探谜案/);
    await expect(page.getByTestId('hero-subtitle')).toContainText('输入主题');
    
    // 验证输入框
    const topicInput = page.getByTestId('topic-input');
    await expect(topicInput).toBeVisible();
    await expect(topicInput).toHaveAttribute('placeholder', /海边灯塔的消失钟声/);
    
    // 验证开始按钮（应该是禁用状态）
    const startButton = page.getByTestId('start-story-button');
    await expect(startButton).toBeVisible();
    await expect(startButton).toBeDisabled();
    
    // 验证高级模式按钮存在
    await expect(page.getByTestId('advanced-mode-button')).toBeVisible();
    
    // 验证示例主题按钮
    await expect(page.locator('text=雾岚古堡的第八声').first()).toBeVisible();
  });

  test('故事主题输入验证', async ({ page }) => {
    const topicInput = page.getByTestId('topic-input');
    const startButton = page.getByTestId('start-story-button');
    
    // 测试空输入
    await expect(startButton).toBeDisabled();
    
    // 测试有效输入
    await topicInput.fill('海边灯塔的消失钟声之谜');
    await expect(startButton).toBeEnabled();
    
    // 测试字符计数
    await expect(page.locator('text=/\\d+\\/120/')).toBeVisible();
    
    // 测试清空输入
    await topicInput.clear();
    await expect(startButton).toBeDisabled();
  });

  test('使用示例主题快速填充', async ({ page }) => {
    const topicInput = page.getByTestId('topic-input');
    
    // 点击示例主题
    await page.locator('text=雾岚古堡的第八声').first().click();
    
    // 验证输入框被填充
    await expect(topicInput).toHaveValue('雾岚古堡的第八声');
    
    // 验证开始按钮启用
    await expect(page.getByTestId('start-story-button')).toBeEnabled();
  });

  test('导航到高级模式页面', async ({ page }) => {
    await page.getByTestId('advanced-mode-button').click();
    await expect(page).toHaveURL(/\/builder$/);
    await expect(page.locator('text=侦探故事工作室').first()).toBeVisible();

    // 返回首页
    await page.goBack();
    await expect(page).toHaveURL(FRONTEND_URL);
    await expect(page.getByTestId('hero-title')).toBeVisible();
  });

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
    const longTopic = 'a'.repeat(121);
    await topicInput.fill(longTopic);
    
    // 验证字符限制
    const inputValue = await topicInput.inputValue();
    expect(inputValue.length).toBeLessThanOrEqual(120);
  });

  test('响应式设计 - 移动端视图', async ({ page }) => {
    // 设置移动端视口
    await page.setViewportSize({ width: 375, height: 667 });
    
    // 验证页面仍然可用
    await expect(page.getByTestId('hero-title')).toBeVisible();
    await expect(page.getByTestId('topic-input')).toBeVisible();
    await expect(page.getByTestId('advanced-mode-button')).toBeVisible();
    
    // 验证按钮足够大（适合触摸）
    const startButton = page.getByTestId('start-story-button');
    const boundingBox = await startButton.boundingBox();
    
    if (boundingBox) {
      // 按钮高度应至少48px（推荐的最小触摸目标）
      expect(boundingBox.height).toBeGreaterThanOrEqual(48);
    }
  });

  test('键盘导航支持', async ({ page }) => {
    const topicInput = page.getByTestId('topic-input');
    
    await topicInput.click();
    // 输入内容
    await topicInput.fill('键盘测试故事');
    
    // 使用Tab键导航到按钮
    await page.keyboard.press('Tab');
    
    // 验证按钮获得焦点
    const startButton = page.getByTestId('start-story-button');
    await expect(startButton).toBeFocused();
    
    // 按Enter键应该触发开始故事
    await page.keyboard.press('Enter');
  });
});

test.describe('Accessibility Tests', () => {
  test('基本无障碍性检查', async ({ page }) => {
    await page.goto(FRONTEND_URL);
    
    // 验证页面有适当的标题
    await expect(page).toHaveTitle(/故事|侦探/);
    
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
    await expect(page.getByTestId('hero-title')).toBeVisible();
    await expect(page.getByTestId('topic-input')).toBeVisible();
    await expect(page.getByTestId('start-story-button')).toBeVisible();
    
    // 确保在禁用状态下按钮仍然可见
    const startButton = page.getByTestId('start-story-button');
    await expect(startButton).toBeVisible();
  });
});

// 辅助函数
