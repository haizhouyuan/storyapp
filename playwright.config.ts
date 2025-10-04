import { defineConfig, devices } from '@playwright/test';

const isCI = !!process.env.CI;
const desktopProjects = [
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
];

const mobileProjects = [
  {
    name: 'Mobile Chrome',
    use: { ...devices['Pixel 5'] },
  },
  {
    name: 'Mobile Safari',
    use: { ...devices['iPhone 12'] },
  },
];

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './tests',
  /* Run tests in files in parallel */
  fullyParallel: !isCI, // CI环境中仍按文件串行，避免数据竞争
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: isCI ? 3 : undefined,
  /* Global setup for seeding test data */
  globalSetup: isCI ? require.resolve('./tests/global-setup.ts') : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [
    ['html'],
    ['json', { outputFile: 'test-results/results.json' }],
    ['list']
  ],
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: process.env.CI ? 'http://localhost:5001' : 'http://localhost:3000',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',

    /* Disable motion animations when possible to stabilise visual assertions */
    reducedMotion: 'reduce',

    /* Take screenshot on failure */
    screenshot: 'only-on-failure',
    
    /* Record video on failure */
    video: 'retain-on-failure',
    
    /* Maximum time each action such as `click()` can take. Defaults to 0 (no limit). */
    actionTimeout: 10000,
    
    /* Maximum time each test can take */
    timeout: 60000
  },

  /* Configure projects for major browsers */
  projects: isCI ? desktopProjects : [...desktopProjects, ...mobileProjects],

  /* Run your local dev server before starting the tests */
  webServer: process.env.CI || process.env.TEST_WITHOUT_BACKEND ? undefined : [
    {
      command: 'cd backend && npm run dev',
      url: 'http://localhost:5000/api/health',
      reuseExistingServer: true,
      timeout: 120000,
    },
    {
      command: 'cd frontend && npm start',
      url: 'http://localhost:3000',
      reuseExistingServer: true,
      timeout: 120000,
    }
  ],
});
