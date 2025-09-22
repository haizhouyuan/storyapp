/* eslint-disable no-restricted-globals */
/**
 * Enhanced Service Worker - PWA Phase B
 * 增强缓存策略和离线回退功能
 */

import { clientsClaim, skipWaiting } from 'workbox-core';
import { ExpirationPlugin } from 'workbox-expiration';
import { precacheAndRoute, createHandlerBoundToURL, cleanupOutdatedCaches } from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';
import { StaleWhileRevalidate, CacheFirst, NetworkFirst, NetworkOnly } from 'workbox-strategies';
import { BackgroundSyncPlugin } from 'workbox-background-sync';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';

// 立即控制所有客户端
clientsClaim();

// 清理过期缓存
cleanupOutdatedCaches();

// 预缓存构建时生成的资源
precacheAndRoute(self.__WB_MANIFEST);

// 离线页面预缓存
const OFFLINE_PAGE = '/offline.html';
const FALLBACK_IMAGE = '/images/offline-story.png';

// ============ Phase B: 增强缓存策略 ============

// 1. 应用外壳路由 - 智能SPA路由处理
const navigationHandler = createHandlerBoundToURL('/index.html');
const navigationRoute = new NavigationRoute(navigationHandler, {
  denylist: [
    /^\/_/,                    // 排除 _next, _nuxt 等框架路由
    /\/[^/?]+\.[^/]+$/,       // 排除有文件扩展名的请求
    /\/api\//,                // 排除 API 请求
    /\/admin\//               // 排除管理后台
  ]
});
registerRoute(navigationRoute);

// 2. 静态资源 - 缓存优先策略
registerRoute(
  ({ request, url }) => {
    return (
      request.destination === 'style' ||
      request.destination === 'script' ||
      request.destination === 'worker' ||
      url.pathname.startsWith('/static/')
    );
  },
  new CacheFirst({
    cacheName: 'static-resources-v2',
    plugins: [
      new CacheableResponsePlugin({
        statuses: [0, 200],
      }),
      new ExpirationPlugin({
        maxEntries: 100,
        maxAgeSeconds: 30 * 24 * 60 * 60, // 30天
        purgeOnQuotaError: true,
      }),
    ],
  })
);

// 3. 图片资源 - 缓存优先 + 占位符回退
registerRoute(
  ({ request }) => request.destination === 'image',
  new CacheFirst({
    cacheName: 'images-v2',
    plugins: [
      new CacheableResponsePlugin({
        statuses: [0, 200],
      }),
      new ExpirationPlugin({
        maxEntries: 60,
        maxAgeSeconds: 7 * 24 * 60 * 60, // 7天
        purgeOnQuotaError: true,
      }),
    ],
  })
);

// 4. Google Fonts - 持久缓存
registerRoute(
  ({ url }) => url.origin === 'https://fonts.googleapis.com',
  new StaleWhileRevalidate({
    cacheName: 'google-fonts-stylesheets-v2',
    plugins: [
      new CacheableResponsePlugin({
        statuses: [0, 200],
      }),
    ],
  })
);

registerRoute(
  ({ url }) => url.origin === 'https://fonts.gstatic.com',
  new CacheFirst({
    cacheName: 'google-fonts-webfonts-v2',
    plugins: [
      new CacheableResponsePlugin({
        statuses: [0, 200],
      }),
      new ExpirationPlugin({
        maxEntries: 30,
        maxAgeSeconds: 60 * 60 * 24 * 365, // 1年
        purgeOnQuotaError: true,
      }),
    ],
  })
);

// 5. API请求 - 网络优先 + 离线回退
registerRoute(
  ({ url }) => url.pathname.startsWith('/api/'),
  new NetworkFirst({
    cacheName: 'api-cache-v2',
    networkTimeoutSeconds: 10,
    plugins: [
      new CacheableResponsePlugin({
        statuses: [0, 200],
      }),
      new ExpirationPlugin({
        maxEntries: 50,
        maxAgeSeconds: 5 * 60, // 5分钟
        purgeOnQuotaError: true,
      }),
    ],
  })
);

// 6. 故事内容 - 特殊策略 + 后台同步
const bgSyncPlugin = new BackgroundSyncPlugin('story-sync-queue', {
  maxRetentionTime: 24 * 60 // 24小时重试
});

registerRoute(
  ({ url }) =>
    url.pathname.startsWith('/api/generate-story') ||
    url.pathname.startsWith('/api/get-story') ||
    url.pathname.startsWith('/api/save-story'),
  new NetworkFirst({
    cacheName: 'story-content-v2',
    networkTimeoutSeconds: 30, // 故事生成可能需要更长时间
    plugins: [
      new CacheableResponsePlugin({
        statuses: [0, 200],
      }),
      new ExpirationPlugin({
        maxEntries: 100,
        maxAgeSeconds: 24 * 60 * 60, // 24小时
        purgeOnQuotaError: true,
      }),
      bgSyncPlugin, // 失败请求后台重试
    ],
  })
);

// 7. 健康检查 - 仅网络
registerRoute(
  ({ url }) => url.pathname.startsWith('/healthz') || url.pathname.startsWith('/api/health'),
  new NetworkOnly()
);

// ============ Phase B: 离线回退策略 ============

// 离线页面回退
registerRoute(
  ({ request }) => request.mode === 'navigate',
  async (params) => {
    try {
      return await navigationHandler(params);
    } catch (error) {
      return caches.match(OFFLINE_PAGE) ||
             caches.match('/index.html') ||
             new Response('离线模式 - 请检查网络连接', {
               status: 200,
               headers: { 'Content-Type': 'text/html; charset=utf-8' }
             });
    }
  }
);

// 图片回退策略
registerRoute(
  ({ request }) => request.destination === 'image',
  async (params) => {
    try {
      return await new CacheFirst({
        cacheName: 'images-v2',
        plugins: [
          new CacheableResponsePlugin({
            statuses: [0, 200],
          }),
        ],
      }).handle(params);
    } catch (error) {
      return caches.match(FALLBACK_IMAGE) ||
             new Response('', { status: 200 });
    }
  }
);

// ============ Phase B: 高级消息处理 ============

self.addEventListener('message', async (event) => {
  const { data } = event;

  if (!data) return;

  switch (data.type) {
    case 'SKIP_WAITING':
      skipWaiting();
      break;

    case 'GET_VERSION':
      event.ports[0].postMessage({
        version: process.env.REACT_APP_VERSION || '1.0.0',
        timestamp: new Date().toISOString(),
        caches: [
          'static-resources-v2',
          'images-v2',
          'api-cache-v2',
          'story-content-v2',
          'google-fonts-stylesheets-v2',
          'google-fonts-webfonts-v2'
        ],
        features: ['offline-support', 'background-sync', 'advanced-caching']
      });
      break;

    case 'CACHE_STATS':
      try {
        const cacheNames = await caches.keys();
        const stats = await Promise.all(
          cacheNames.map(async cacheName => {
            const cache = await caches.open(cacheName);
            const keys = await cache.keys();
            return {
              name: cacheName,
              size: keys.length,
              urls: keys.slice(0, 5).map(req => req.url) // 前5个URL示例
            };
          })
        );
        event.ports[0].postMessage({
          type: 'CACHE_STATS_RESPONSE',
          stats,
          totalCaches: stats.length,
          totalEntries: stats.reduce((sum, cache) => sum + cache.size, 0)
        });
      } catch (error) {
        event.ports[0].postMessage({
          type: 'CACHE_STATS_ERROR',
          error: error.message
        });
      }
      break;

    case 'CLEAR_CACHE':
      try {
        const cacheNames = await caches.keys();
        await Promise.all(
          cacheNames
            .filter(name => name.includes('v2') || data.cachePattern?.test(name))
            .map(name => caches.delete(name))
        );
        event.ports[0].postMessage({
          type: 'CACHE_CLEARED',
          clearedCaches: cacheNames.length
        });
      } catch (error) {
        event.ports[0].postMessage({
          type: 'CACHE_CLEAR_ERROR',
          error: error.message
        });
      }
      break;

    case 'FORCE_UPDATE':
      // 强制更新缓存
      try {
        await self.registration.update();
        event.ports[0].postMessage({
          type: 'UPDATE_TRIGGERED'
        });
      } catch (error) {
        event.ports[0].postMessage({
          type: 'UPDATE_ERROR',
          error: error.message
        });
      }
      break;

    default:
      console.log('Service Worker: 未知消息类型:', data.type);
  }
});

// ============ 生命周期事件处理 ============

// 安装事件 - 预缓存关键资源
self.addEventListener('install', (event) => {
  console.log('Service Worker: 安装新版本...');

  event.waitUntil(
    caches.open('pwa-core-v2').then(cache => {
      return cache.addAll([
        '/',
        '/index.html',
        '/manifest.json',
        // 可以添加离线页面
        // '/offline.html'
      ]).catch(error => {
        console.warn('Service Worker: 预缓存部分资源失败:', error);
        // 不阻止安装过程
        return Promise.resolve();
      });
    })
  );

  // 立即激活新版本
  skipWaiting();
});

// 激活事件 - 清理旧缓存
self.addEventListener('activate', (event) => {
  console.log('Service Worker: 激活新版本...');

  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          // 清理旧版本缓存 (不包含v2的)
          if (cacheName.includes('pwa-core-') && !cacheName.includes('v2')) {
            console.log('Service Worker: 删除旧缓存:', cacheName);
            return caches.delete(cacheName);
          }
          // 清理过期的API缓存
          if (cacheName.includes('api-cache') && !cacheName.includes('v2')) {
            console.log('Service Worker: 删除过期API缓存:', cacheName);
            return caches.delete(cacheName);
          }
        }).filter(Boolean)
      );
    }).then(() => {
      // 立即控制所有页面
      return self.clients.claim();
    })
  );
});

// 错误处理
self.addEventListener('error', (event) => {
  console.error('Service Worker 错误:', event.error);
});

self.addEventListener('unhandledrejection', (event) => {
  console.error('Service Worker 未处理的Promise拒绝:', event.reason);
});

console.log('Enhanced Service Worker (Phase B) 加载完成 - 包含高级缓存策略和离线支持');