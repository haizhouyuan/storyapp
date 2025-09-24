/* eslint-disable no-restricted-globals */
/**
 * Service Worker Phase C - 完整PWA实现
 * 包含后台同步、推送通知和高级缓存策略
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

// ============ 缓存策略配置 ============

// 应用外壳路由
const navigationHandler = createHandlerBoundToURL('/index.html');
const navigationRoute = new NavigationRoute(navigationHandler, {
  denylist: [/^\/_/, /\/[^/?]+\.[^/]+$/, /\/api\//, /\/admin\//]
});
registerRoute(navigationRoute);

// 静态资源缓存
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
    cacheName: 'static-resources-v3',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({
        maxEntries: 100,
        maxAgeSeconds: 30 * 24 * 60 * 60,
        purgeOnQuotaError: true,
      }),
    ],
  })
);

// 图片资源缓存
registerRoute(
  ({ request }) => request.destination === 'image',
  new CacheFirst({
    cacheName: 'images-v3',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({
        maxEntries: 60,
        maxAgeSeconds: 7 * 24 * 60 * 60,
        purgeOnQuotaError: true,
      }),
    ],
  })
);

// API缓存 + 后台同步
const bgSyncPlugin = new BackgroundSyncPlugin('api-sync-queue', {
  maxRetentionTime: 24 * 60
});

registerRoute(
  ({ url }) => url.pathname.startsWith('/api/'),
  new NetworkFirst({
    cacheName: 'api-cache-v3',
    networkTimeoutSeconds: 10,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({
        maxEntries: 50,
        maxAgeSeconds: 5 * 60,
        purgeOnQuotaError: true,
      }),
      bgSyncPlugin,
    ],
  })
);

// ============ Phase C: 后台同步实现 ============

self.addEventListener('sync', (event) => {
  console.log('Service Worker: 后台同步事件:', event.tag);

  switch (event.tag) {
    case 'story-sync':
      event.waitUntil(handleStorySync());
      break;
    case 'user-preferences-sync':
      event.waitUntil(handleUserPreferencesSync());
      break;
    case 'analytics-sync':
      event.waitUntil(handleAnalyticsSync());
      break;
    default:
      console.log('Service Worker: 未知同步标签:', event.tag);
  }
});

// 故事数据同步
async function handleStorySync() {
  try {
    console.log('Service Worker: 开始同步故事数据...');

    const pendingStories = await getStoredData('pendingStories');
    if (pendingStories.length === 0) {
      console.log('Service Worker: 没有待同步的故事');
      return;
    }

    const results = [];
    for (const story of pendingStories) {
      try {
        const response = await fetch('/api/save-story', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(story.data)
        });

        if (response.ok) {
          await removeStoredData('pendingStories', story.id);
          results.push({ success: true, id: story.id });
        } else {
          results.push({ success: false, id: story.id, error: response.statusText });
        }
      } catch (error) {
        results.push({ success: false, id: story.id, error: error.message });
      }
    }

    // 通知所有客户端同步结果
    await notifyAllClients('SYNC_COMPLETE', {
      type: 'stories',
      results,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length
    });

    console.log(`Service Worker: 故事同步完成 - 成功: ${results.filter(r => r.success).length}, 失败: ${results.filter(r => !r.success).length}`);

  } catch (error) {
    console.error('Service Worker: 故事同步失败:', error);
    await notifyAllClients('SYNC_ERROR', { type: 'stories', error: error.message });
  }
}

// 用户偏好同步
async function handleUserPreferencesSync() {
  try {
    const preferences = await getStoredData('userPreferences');
    if (preferences.length === 0) return;

    const response = await fetch('/api/user/preferences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(preferences[0].data)
    });

    if (response.ok) {
      await clearStoredData('userPreferences');
      await notifyAllClients('SYNC_COMPLETE', { type: 'preferences' });
      console.log('Service Worker: 用户偏好同步完成');
    }
  } catch (error) {
    console.error('Service Worker: 用户偏好同步失败:', error);
  }
}

// 分析数据同步
async function handleAnalyticsSync() {
  try {
    const events = await getStoredData('analyticsEvents');
    if (events.length === 0) return;

    const response = await fetch('/api/analytics/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events: events.map(e => e.data) })
    });

    if (response.ok) {
      await clearStoredData('analyticsEvents');
      console.log(`Service Worker: ${events.length} 条分析数据同步完成`);
    }
  } catch (error) {
    console.error('Service Worker: 分析数据同步失败:', error);
  }
}

// ============ Phase C: 推送通知实现 ============

self.addEventListener('push', (event) => {
  console.log('Service Worker: 收到推送通知');

  let notificationData = {
    title: '睡前故事',
    body: '您有新的故事内容可以查看！',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-72x72.png',
    tag: 'story-notification',
    renotify: true,
    requireInteraction: false,
    vibrate: [100, 50, 100, 50, 100],
    data: {
      url: '/',
      timestamp: Date.now(),
      source: 'story-update'
    },
    actions: [
      {
        action: 'view',
        title: '立即查看',
        icon: '/icons/action-view.png'
      },
      {
        action: 'later',
        title: '稍后提醒',
        icon: '/icons/action-later.png'
      },
      {
        action: 'settings',
        title: '通知设置',
        icon: '/icons/action-settings.png'
      }
    ]
  };

  // 解析推送数据
  if (event.data) {
    try {
      const pushData = event.data.json();
      notificationData = {
        ...notificationData,
        ...pushData,
        data: { ...notificationData.data, ...(pushData.data || {}) }
      };
    } catch (error) {
      console.warn('Service Worker: 推送数据解析失败，使用默认通知');
    }
  }

  // 检查通知权限
  event.waitUntil(
    checkNotificationPermission().then(hasPermission => {
      if (hasPermission) {
        return self.registration.showNotification(notificationData.title, notificationData);
      } else {
        console.log('Service Worker: 无通知权限，跳过显示');
      }
    })
  );
});

// 通知点击处理
self.addEventListener('notificationclick', (event) => {
  console.log('Service Worker: 通知被点击:', event.action);

  event.notification.close();

  const { action } = event;
  const { url = '/', storyId, source } = event.notification.data || {};

  // 记录通知交互
  recordNotificationInteraction(action, event.notification.data);

  switch (action) {
    case 'view':
      event.waitUntil(openOrFocusApp(storyId ? `/story/${storyId}` : url));
      break;

    case 'later':
      event.waitUntil(scheduleReminderNotification(event.notification.data));
      break;

    case 'settings':
      event.waitUntil(openOrFocusApp('/settings/notifications'));
      break;

    default:
      event.waitUntil(openOrFocusApp(url));
      break;
  }
});

// 通知关闭处理
self.addEventListener('notificationclose', (event) => {
  console.log('Service Worker: 通知被关闭');
  recordNotificationInteraction('close', event.notification.data);
});

// ============ 工具函数 ============

// 检查通知权限
async function checkNotificationPermission() {
  return Notification.permission === 'granted';
}

// 打开或聚焦应用
async function openOrFocusApp(url) {
  const clients = await self.clients.matchAll({
    type: 'window',
    includeUncontrolled: true
  });

  // 尝试聚焦现有窗口
  for (const client of clients) {
    if (client.url.includes(url.split('?')[0])) {
      await client.focus();
      if (url !== '/') {
        client.navigate(url);
      }
      return client;
    }
  }

  // 打开新窗口
  return self.clients.openWindow(url);
}

// 安排提醒通知
async function scheduleReminderNotification(data) {
  const reminderTime = 30 * 60 * 1000; // 30分钟

  console.log('Service Worker: 安排稍后提醒');

  // 使用setTimeout (实际应用建议使用服务器推送)
  setTimeout(() => {
    self.registration.showNotification('故事提醒', {
      body: '您之前关注的故事等待查看！',
      icon: '/icons/icon-192x192.png',
      tag: 'reminder-notification',
      data: { ...data, source: 'reminder' },
      actions: [
        { action: 'view', title: '查看故事' },
        { action: 'dismiss', title: '关闭' }
      ]
    });
  }, reminderTime);
}

// 记录通知交互
async function recordNotificationInteraction(action, data) {
  const interaction = {
    action,
    data,
    timestamp: Date.now(),
    userAgent: navigator.userAgent
  };

  try {
    await fetch('/api/analytics/notification-interaction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(interaction)
    });
  } catch (error) {
    // 保存到本地，稍后同步
    await storeData('analyticsEvents', {
      id: Date.now(),
      data: interaction
    });
  }
}

// ============ 数据存储工具 ============

// 存储数据到 IndexedDB
async function storeData(storeName, data) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('StoryAppDB', 1);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      const stores = ['pendingStories', 'userPreferences', 'analyticsEvents'];

      stores.forEach(store => {
        if (!db.objectStoreNames.contains(store)) {
          const objectStore = db.createObjectStore(store, { keyPath: 'id' });
          objectStore.createIndex('timestamp', 'timestamp', { unique: false });
        }
      });
    };

    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);

      const putRequest = store.put({ ...data, timestamp: Date.now() });

      putRequest.onsuccess = () => resolve();
      putRequest.onerror = () => reject(putRequest.error);
    };

    request.onerror = () => reject(request.error);
  });
}

// 获取存储的数据
async function getStoredData(storeName) {
  return new Promise((resolve) => {
    const request = indexedDB.open('StoryAppDB', 1);

    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const getAllRequest = store.getAll();

      getAllRequest.onsuccess = () => resolve(getAllRequest.result || []);
      getAllRequest.onerror = () => resolve([]);
    };

    request.onerror = () => resolve([]);
  });
}

// 删除指定数据
async function removeStoredData(storeName, id) {
  return new Promise((resolve) => {
    const request = indexedDB.open('StoryAppDB', 1);

    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      store.delete(id);
      resolve();
    };

    request.onerror = () => resolve();
  });
}

// 清除存储数据
async function clearStoredData(storeName) {
  return new Promise((resolve) => {
    const request = indexedDB.open('StoryAppDB', 1);

    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      store.clear();
      resolve();
    };

    request.onerror = () => resolve();
  });
}

// ============ 客户端通信 ============

// 通知所有客户端
async function notifyAllClients(type, data) {
  const clients = await self.clients.matchAll({ includeUncontrolled: true });

  const message = {
    type,
    data,
    timestamp: Date.now()
  };

  clients.forEach(client => {
    client.postMessage(message);
  });
}

// ============ 高级消息处理 ============

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
        features: ['offline-support', 'background-sync', 'push-notifications', 'advanced-caching'],
        caches: ['static-resources-v3', 'images-v3', 'api-cache-v3']
      });
      break;

    case 'CACHE_STATS':
      const stats = await getCacheStats();
      event.ports[0].postMessage({
        type: 'CACHE_STATS_RESPONSE',
        ...stats
      });
      break;

    case 'TRIGGER_SYNC':
      if (data.syncType) {
        await self.registration.sync.register(data.syncType);
        event.ports[0].postMessage({ type: 'SYNC_TRIGGERED', syncType: data.syncType });
      }
      break;

    case 'STORE_STORY':
      await storeData('pendingStories', { id: Date.now(), data: data.story });
      await self.registration.sync.register('story-sync');
      event.ports[0].postMessage({ type: 'STORY_STORED' });
      break;

    default:
      console.log('Service Worker: 未知消息类型:', data.type);
  }
});

// 获取缓存统计
async function getCacheStats() {
  const cacheNames = await caches.keys();
  const stats = [];

  for (const cacheName of cacheNames) {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();

    stats.push({
      name: cacheName,
      size: keys.length,
      urls: keys.slice(0, 3).map(req => req.url)
    });
  }

  return {
    caches: stats,
    totalCaches: stats.length,
    totalEntries: stats.reduce((sum, cache) => sum + cache.size, 0)
  };
}

// ============ 生命周期事件 ============

self.addEventListener('install', (event) => {
  console.log('Service Worker: 安装Phase C版本...');

  event.waitUntil(
    caches.open('pwa-core-v3').then(cache => {
      return cache.addAll([
        '/',
        '/index.html',
        '/manifest.json',
        '/offline.html'
      ]).catch(error => {
        console.warn('Service Worker: 预缓存失败:', error);
        return Promise.resolve();
      });
    })
  );

  skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('Service Worker: 激活Phase C版本...');

  event.waitUntil(
    Promise.all([
      // 清理旧版本缓存
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            if (cacheName.includes('v1') || cacheName.includes('v2')) {
              console.log('Service Worker: 删除旧缓存:', cacheName);
              return caches.delete(cacheName);
            }
          }).filter(Boolean)
        );
      }),
      // 立即控制所有页面
      self.clients.claim()
    ])
  );
});

console.log('Service Worker Phase C 加载完成 - 包含完整PWA功能');