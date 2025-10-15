/* eslint-disable no-restricted-globals */
/// <reference lib="webworker" />

import { clientsClaim } from 'workbox-core';
import { ExpirationPlugin } from 'workbox-expiration';
import { precacheAndRoute, cleanupOutdatedCaches, matchPrecache } from 'workbox-precaching';
import { registerRoute, setCatchHandler } from 'workbox-routing';
import { NetworkFirst, StaleWhileRevalidate, CacheFirst } from 'workbox-strategies';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';

/** @typedef {{url: string, revision?: string|null}} WBManifestEntry */

const OFFLINE_FALLBACK_URL = '/offline.html';
const PRECACHE_MANIFEST = [
  { url: OFFLINE_FALLBACK_URL, revision: '1' },
];

self.skipWaiting();
clientsClaim();

precacheAndRoute([{"revision":"cf9ff4d619708a5b1b5e3524583fd875","url":"asset-manifest.json"},{"revision":"cb8ba7aff5c41d395b98fd823eff45ba","url":"icons/icon-192.png"},{"revision":"9820a101ba3849167fbbf2c13dbba2ca","url":"icons/icon-512.png"},{"revision":"008160862e93df767ae1e59bc2a4c726","url":"index.html"},{"revision":"2793e112135a00b746dab1c6cec4f48e","url":"manifest.json"},{"revision":"7529e3747070c7c8a91525b1e63f19e3","url":"offline.html"},{"revision":"a5d778df9a5b26a54ff4b88c8518036b","url":"static/css/main.69cb675c.css"},{"revision":"f9c6611b0db29b5c69dc3cd71e3d2ee3","url":"static/js/main.9e0f7fb5.js"},{"revision":"577f15cefb57abdf77bfb7cf8d50ac22","url":"static/js/react-vendor.b75a9d80.js"},{"revision":"3a3b08ef40e80bff6ddf6a645dd05afe","url":"static/js/runtime.7ac58b83.js"},{"revision":"144f4ef881755f38b79854ee8866bf40","url":"static/js/vendors.f8e4ec5f.js"}]);
precacheAndRoute(PRECACHE_MANIFEST);

cleanupOutdatedCaches();

// 页面导航请求：网络优先，失败时返回离线页
registerRoute(
  ({ request }) => request.mode === 'navigate',
  async ({ event }) => {
    try {
      const preloadResponse = await event.preloadResponse;
      if (preloadResponse) {
        return preloadResponse;
      }

      return await fetch(event.request);
    } catch (error) {
      const cachedResponse = await matchPrecache(OFFLINE_FALLBACK_URL);
      if (cachedResponse) {
        return cachedResponse;
      }

      return Response.error();
    }
  }
);

// API 请求：网络优先，短期缓存成功响应
registerRoute(
  ({ url }) => url.pathname.startsWith('/api/'),
  new NetworkFirst({
    cacheName: 'api-cache',
    networkTimeoutSeconds: 8,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({
        maxEntries: 50,
        maxAgeSeconds: 5 * 60,
      }),
    ],
  })
);

// 图片资源：缓存优先 + 过期清理
registerRoute(
  ({ request }) => request.destination === 'image',
  new CacheFirst({
    cacheName: 'image-cache',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({
        maxEntries: 60,
        maxAgeSeconds: 7 * 24 * 60 * 60,
      }),
    ],
  })
);

// CSS / JS / Worker 等静态资源：网络优先回退缓存
registerRoute(
  ({ request }) => ['style', 'script', 'worker'].includes(request.destination),
  new StaleWhileRevalidate({
    cacheName: 'static-resources',
    plugins: [new CacheableResponsePlugin({ statuses: [0, 200] })],
  })
);

setCatchHandler(async ({ event }) => {
  if (event.request.mode === 'navigate') {
    const cachedResponse = await matchPrecache(OFFLINE_FALLBACK_URL);
    if (cachedResponse) {
      return cachedResponse;
    }
  }

  return Response.error();
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
