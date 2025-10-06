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

precacheAndRoute(self.__WB_MANIFEST);
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
