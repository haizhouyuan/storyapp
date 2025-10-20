import { test, expect } from '@playwright/test';

const WORKFLOW_ID = process.env.PLAYWRIGHT_WORKFLOW_ID;
const FRONTEND_ORIGIN = process.env.PLAYWRIGHT_FRONTEND_ORIGIN || 'http://localhost:3000';

if (!WORKFLOW_ID) {
  test.skip('requires PLAYWRIGHT_WORKFLOW_ID env', async () => {});
}

const workflowId = WORKFLOW_ID as string;

function url(path: string) {
  return `${FRONTEND_ORIGIN}${path}`;
}

test.describe('Reader smoke test', () => {
  test('should display story info and support TTS flow', async ({ page }) => {
    test.skip(!WORKFLOW_ID, 'PLAYWRIGHT_WORKFLOW_ID env missing');

    await page.goto(url(`/story/${workflowId}`), { waitUntil: 'domcontentloaded' });

    await expect(page.getByText('故事阅读')).toBeVisible();
    await expect(page.getByText('故事正文')).toBeVisible();
    await page.waitForTimeout(1000);

    const drawerToggle = page.getByRole('button', { name: '创作进度', exact: false });
    const drawerHeading = page.getByRole('heading', { name: '创作进度' });
    if (!(await drawerHeading.isVisible())) {
      await drawerToggle.click();
    }

    await expect(drawerHeading).toBeVisible();
    await expect(page.getByText('连接正常')).toBeVisible();
    await expect(page.getByRole('button', { name: '手动刷新' })).toBeVisible();
    await expect(page.getByRole('button', { name: '导出故事' })).toBeVisible();
    const retryButton = page.getByRole('button', { name: '重试失败阶段' });
    await expect(retryButton).toBeDisabled();

    await page.evaluate(async (id) => {
      await fetch(`/api/story-workflows/${id}/test-events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: 'info', message: '测试通知', meta: { action: 'openExport' } }),
      });
    }, workflowId);

    await expect(page.getByText('测试通知')).toBeVisible();

    await page.getByRole('button', { name: '关闭' }).click();

    await expect(page.getByRole('button', { name: '朗读整篇' })).toBeVisible();

    await page.getByRole('button', { name: '朗读整篇' }).click();
    await expect(page.getByText('正在生成朗读音频', { exact: false })).toBeVisible();

    await page.waitForTimeout(2000);
    await page.waitForFunction(() => {
      const hint = Array.from(document.querySelectorAll('p')).find((el) => el.textContent?.includes('朗读音频已就绪'));
      return Boolean(hint);
    }, { timeout: 60000 });

    await expect(page.getByText('朗读音频已就绪', { exact: false })).toBeVisible();
  });
});
