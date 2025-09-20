import { test, expect, request } from '@playwright/test';

const BASE_URL = process.env.STAGING_BASE_URL || process.env.PLAYWRIGHT_BASE_URL || process.env.BASE_URL || 'http://127.0.0.1:5001';
const API_URL = process.env.STAGING_API_URL || `${BASE_URL.replace(/\/$/, '')}/api`;

const withTrailingSlash = (url: string) => (url.endsWith('/') ? url : `${url}/`);

const HOME_URL = withTrailingSlash(BASE_URL);
const HEALTH_ENDPOINT = `${API_URL.replace(/\/$/, '')}/health`;

// staging smoke checks should be fast and deterministic – keep total runtime <30s

test.describe('Staging smoke', () => {
  test('health endpoint responds 200', async ({ request }) => {
    const response = await request.get(HEALTH_ENDPOINT, { timeout: 10_000 });
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.status || body.message).toBeTruthy();
  });

  test('homepage renders key hero copy', async ({ page }) => {
    await page.goto(HOME_URL, { waitUntil: 'networkidle' });
    await expect(page).toHaveTitle(/儿童睡前故事/i);
    await expect(page.getByTestId('hero-title')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('topic-input')).toBeVisible({ timeout: 10000 });
  });

  test('storybook flow basic interaction', async ({ page }) => {
    await page.goto(HOME_URL, { waitUntil: 'networkidle' });
    await expect(page.getByTestId('hero-title')).toBeVisible({ timeout: 10000 });
    const topicInput = page.getByTestId('topic-input');
    await expect(topicInput).toBeVisible({ timeout: 10000 });

    const sampleButton = page.locator('text=小兔子的冒险').first();
    if (await sampleButton.isVisible()) {
      await sampleButton.click();
    } else {
      await topicInput.fill('测试冒险');
    }
    await page.getByTestId('start-story-button').click();
    await page.waitForURL(/\/story/, { timeout: 15_000 });
    await expect(page.locator('[data-testid^="choice-button-"]').first()).toBeVisible({ timeout: 15_000 });
  });
});
