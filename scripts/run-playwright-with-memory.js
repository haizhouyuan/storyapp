#!/usr/bin/env node
const { MongoMemoryServer } = require('mongodb-memory-server');
const { spawn } = require('child_process');

async function main() {
  const mongoServer = await MongoMemoryServer.create({
    binary: {
      version: process.env.MONGOMS_VERSION || '7.0.14',
    },
    instance: {
      dbName: process.env.MONGODB_DB_NAME || 'storyapp_e2e',
    },
  });
  const uri = mongoServer.getUri();
  const env = {
    ...process.env,
    MONGODB_URI: uri,
    MONGODB_DB_NAME: process.env.MONGODB_DB_NAME || 'storyapp_e2e',
    STAGING_BASE_URL: process.env.STAGING_BASE_URL || 'http://localhost:3000',
    STAGING_API_URL:
      process.env.STAGING_API_URL || 'http://localhost:5000/api',
    BASE_URL: process.env.BASE_URL || 'http://localhost:3000',
    API_URL: process.env.API_URL || 'http://localhost:5000',
    REACT_APP_API_URL:
      process.env.REACT_APP_API_URL || 'http://localhost:5000/api',
  };

  console.log(`[setup] In-memory Mongo started at ${uri}`);
  if (!process.env.MONGOMS_DOWNLOAD_DIR) {
    env.MONGOMS_DOWNLOAD_DIR = `${env.HOME || '.'}/.cache/mongobin`;
  }

  const path = require('path');
  const bin = path.resolve(__dirname, '../node_modules/.bin/playwright');
  const isWin = process.platform === 'win32';
  const execPath = isWin ? `${bin}.cmd` : bin;

  const args = [
    'test',
    'tests/story-app.spec.ts',
    'tests/staging-smoke.spec.ts',
    '--reporter=line',
  ];

  const child = spawn(execPath, args, {
    env,
    stdio: 'inherit',
  });

  child.on('close', async (code) => {
    await mongoServer.stop();
    console.log('[teardown] In-memory Mongo stopped');
    process.exit(code);
  });

  child.on('error', async (error) => {
    console.error('[error] Failed to run Playwright tests:', error);
    await mongoServer.stop();
    process.exit(1);
  });
}

main().catch(async (error) => {
  console.error('[error] Unexpected failure while preparing Playwright run:', error);
  process.exit(1);
});
