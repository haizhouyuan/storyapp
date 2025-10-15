import { test, expect } from '@playwright/test';

/**
 * 侦探故事工作室（新UI）- 快速随机蓝图生成验证
 * 依赖已运行的后端（端口 8702 或外部域名），使用 playwright.prod.config.ts 执行。
 * 运行示例：
 *   PLAYWRIGHT_BASE_URL=http://127.0.0.1:8702 scripts/dev/nodehere npx playwright test -c playwright.prod.config.ts tests/production/detective-builder.spec.ts
 */

test.describe('Detective Builder - Fast Plan', () => {
  test('生成随机蓝图成功且包含中心机制与线索矩阵', async ({ page }) => {
    await page.goto('/');

    // 主题输入
    const topicInput = page.getByLabel('主题', { exact: true });
    await topicInput.fill('雾岚古堡的第八声');

    // 点击“生成蓝图”
    await page.getByRole('button', { name: '生成蓝图' }).click();

    // 等待 Outline 区域出现 JSON（预期包含 centralTrick 或 clueMatrix 字段）
    const container = page.getByText('蓝图 Outline').locator('xpath=..');
    const outlinePre = container.locator('pre');
    await expect(outlinePre).toBeVisible({ timeout: 20000 });

    const text = (await outlinePre.textContent()) || '';
    expect(text.length).toBeGreaterThan(20);
    expect(/centralTrick|clueMatrix/.test(text)).toBeTruthy();

    console.log('\n[Outline excerpt]\n' + text.slice(0, 240));
  });
});
