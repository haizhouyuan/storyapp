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

precacheAndRoute([{"revision":"8621612ab956453f4184fbb762bd0bb4","url":"asset-manifest.json"},{"revision":"cb8ba7aff5c41d395b98fd823eff45ba","url":"icons/icon-192.png"},{"revision":"9820a101ba3849167fbbf2c13dbba2ca","url":"icons/icon-512.png"},{"revision":"c835fbd6f7925889f9509cf11381be51","url":"index.html"},{"revision":"2793e112135a00b746dab1c6cec4f48e","url":"manifest.json"},{"revision":"7529e3747070c7c8a91525b1e63f19e3","url":"offline.html"},{"revision":"cc99c526f118a28d56d76943c4594459","url":"static/css/main.9429ecf9.css"},{"revision":"651f32ea528d5feb6463bfc2169faba9","url":"static/js/main.ba679129.js"},{"revision":"20a37c71621f17355b2ed1227aef9b2c","url":"static/js/react-vendor.3e2059c6.js"},{"revision":"e18e0fd114c669f6f3af5e5966d95c80","url":"static/js/runtime.d2366040.js"},{"revision":"da9caf4415bdac5c8c043b3fc39ca724","url":"static/js/ui-vendor.8af8f3b3.js"},{"revision":"6f5c5e89b4aecf387f8d0f7a8f9e00c8","url":"static/js/vendors.322a3d33.js"}]);
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
