#!/usr/bin/env node

const path = require('path');
const { injectManifest } = require('workbox-build');

const rootDir = path.resolve(__dirname, '..');

(async () => {
  try {
    const { count, size, warnings } = await injectManifest({
      swSrc: path.join(rootDir, 'src', 'service-worker.js'),
      swDest: path.join(rootDir, 'build', 'service-worker.js'),
      globDirectory: path.join(rootDir, 'build'),
      globPatterns: [
        '**/*.{html,js,css,json,png,svg,webp,woff2,jpg,jpeg}',
      ],
      maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
    });

    warnings.forEach((warning) => console.warn(warning));
    console.log(`Service Worker 注入完成: 预缓存 ${count} 个资源，共 ${(size / 1024).toFixed(1)} KB`);
  } catch (error) {
    console.error('Service Worker 注入失败:', error);
    process.exit(1);
  }
})();
