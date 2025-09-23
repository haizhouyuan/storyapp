import { defineConfig, devices } from '@playwright/test';

/**
 * 生产环境 Playwright 配置
 * 专门用于测试部署后的应用
 */
const baseURL = (process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5001').replace(/\/$/, '');

export default defineConfig({
  testDir: './tests/production',
  
  /* Run tests in files in parallel */
  fullyParallel: true,
  
  /* Retry on CI only */
  retries: 2,
  
  /* Opt out of parallel tests on CI. */
  workers: 1,
  
  /* Reporter to use */
  reporter: [
    ['html', { outputFolder: 'playwright-report/production' }],
    ['json', { outputFile: 'test-results/production-results.json' }],
    ['list']
  ],
  
  /* Shared settings for all projects */
  use: {
    /* Base URL for production environment */
    baseURL,

    /* Collect trace when retrying the failed test */
    trace: 'on-first-retry',
    
    /* Take screenshot on failure */
    screenshot: 'only-on-failure',
    
    /* Record video on failure */
    video: 'retain-on-failure',
    
    /* Maximum time each action can take */
    actionTimeout: 15000,
    
    /* Maximum time each test can take */
    timeout: 90000
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],

  /* 不启动本地服务器，使用已部署的服务 */
  webServer: undefined,
});
