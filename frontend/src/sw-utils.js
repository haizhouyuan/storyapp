/**
 * Service Worker Utilities - Phase C
 * 后台同步和推送通知工具函数
 */

// ============ 后台同步工具 ============

/**
 * 处理故事数据后台同步
 */
export async function syncStoryData() {
  console.log('Service Worker: 开始后台同步故事数据...');

  try {
    // 1. 从 IndexedDB 获取待同步的数据
    const pendingData = await getPendingStoryData();

    if (pendingData.length === 0) {
      console.log('Service Worker: 没有待同步的数据');
      return Promise.resolve();
    }

    console.log(`Service Worker: 发现 ${pendingData.length} 条待同步数据`);

    // 2. 尝试同步每条数据
    const syncResults = [];
    for (const item of pendingData) {
      try {
        const result = await syncSingleStoryItem(item);
        syncResults.push({ success: true, item, result });

        // 同步成功后从本地删除
        await removePendingStoryData(item.id);

      } catch (error) {
        console.error('Service Worker: 同步失败:', item.id, error);
        syncResults.push({ success: false, item, error });
      }
    }

    // 3. 通知主线程同步结果
    await notifyClients('SYNC_COMPLETE', {
      total: pendingData.length,
      successful: syncResults.filter(r => r.success).length,
      failed: syncResults.filter(r => !r.success).length,
      results: syncResults
    });

    console.log('Service Worker: 后台同步完成');
    return Promise.resolve();

  } catch (error) {
    console.error('Service Worker: 后台同步失败:', error);

    // 通知主线程同步失败
    await notifyClients('SYNC_ERROR', {
      error: error.message,
      timestamp: new Date().toISOString()
    });

    throw error;
  }
}

/**
 * 从 IndexedDB 获取待同步的故事数据
 */
async function getPendingStoryData() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('StoryAppDB', 1);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction(['pendingStories'], 'readonly');
      const store = transaction.objectStore('pendingStories');
      const getAllRequest = store.getAll();

      getAllRequest.onsuccess = () => resolve(getAllRequest.result || []);
      getAllRequest.onerror = () => reject(getAllRequest.error);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('pendingStories')) {
        const store = db.createObjectStore('pendingStories', { keyPath: 'id' });
        store.createIndex('timestamp', 'timestamp', { unique: false });
        store.createIndex('type', 'type', { unique: false });
      }
    };
  });
}

/**
 * 同步单条故事数据
 */
async function syncSingleStoryItem(item) {
  const { type, data, endpoint } = item;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data)
  });

  if (!response.ok) {
    throw new Error(`同步失败: ${response.status} ${response.statusText}`);
  }

  return await response.json();
}

/**
 * 从 IndexedDB 删除已同步的数据
 */
async function removePendingStoryData(id) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('StoryAppDB', 1);

    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction(['pendingStories'], 'readwrite');
      const store = transaction.objectStore('pendingStories');
      const deleteRequest = store.delete(id);

      deleteRequest.onsuccess = () => resolve();
      deleteRequest.onerror = () => reject(deleteRequest.error);
    };

    request.onerror = () => reject(request.error);
  });
}

// ============ 推送通知工具 ============

/**
 * 处理推送通知
 */
export function handlePushNotification(event) {
  console.log('Service Worker: 收到推送通知');

  let notificationData = {
    title: '睡前故事',
    body: '您有新的故事内容可以查看！',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-72x72.png',
    tag: 'story-notification',
    renotify: true,
    requireInteraction: false,
    vibrate: [100, 50, 100],
    data: {
      url: '/',
      timestamp: Date.now()
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
        data: {
          ...notificationData.data,
          ...(pushData.data || {})
        }
      };
    } catch (error) {
      console.warn('Service Worker: 推送数据解析失败，使用默认通知');
    }
  }

  // 显示通知
  event.waitUntil(
    self.registration.showNotification(notificationData.title, notificationData)
  );
}

/**
 * 处理通知点击事件
 */
export function handleNotificationClick(event) {
  console.log('Service Worker: 通知被点击:', event.action);

  event.notification.close();

  const { action } = event;
  const { url = '/', storyId } = event.notification.data || {};

  switch (action) {
    case 'view':
      // 立即查看 - 打开指定页面
      event.waitUntil(openOrFocusClient(storyId ? `/story/${storyId}` : url));
      break;

    case 'later':
      // 稍后提醒 - 设置延迟通知
      event.waitUntil(scheduleReminderNotification(event.notification.data));
      break;

    default:
      // 默认点击 - 打开应用
      event.waitUntil(openOrFocusClient(url));
      break;
  }

  // 记录通知交互
  recordNotificationInteraction(action, event.notification.data);
}

/**
 * 打开或聚焦到客户端窗口
 */
async function openOrFocusClient(url) {
  const clients = await self.clients.matchAll({
    type: 'window',
    includeUncontrolled: true
  });

  // 尝试聚焦到现有窗口
  for (const client of clients) {
    if (client.url.includes(url.split('?')[0])) {
      await client.focus();
      if (url !== '/') {
        client.navigate(url);
      }
      return;
    }
  }

  // 没有找到现有窗口，打开新窗口
  return self.clients.openWindow(url);
}

/**
 * 安排稍后提醒通知
 */
async function scheduleReminderNotification(data) {
  // 30分钟后提醒
  const reminderTime = Date.now() + (30 * 60 * 1000);

  try {
    // 使用 Notification API 安排延迟通知
    // 注意：实际实现可能需要服务器端支持
    console.log('Service Worker: 已安排稍后提醒:', new Date(reminderTime));

    // 暂时使用setTimeout (实际应用中建议使用服务器端推送)
    setTimeout(() => {
      self.registration.showNotification('故事提醒', {
        body: '您之前关注的故事更新了！',
        icon: '/icons/icon-192x192.png',
        tag: 'reminder-notification',
        data: data,
        actions: [
          {
            action: 'view',
            title: '查看故事'
          }
        ]
      });
    }, 30 * 60 * 1000); // 30分钟

  } catch (error) {
    console.error('Service Worker: 安排提醒失败:', error);
  }
}

/**
 * 记录通知交互数据
 */
async function recordNotificationInteraction(action, data) {
  try {
    const interaction = {
      action,
      data,
      timestamp: Date.now(),
      userAgent: navigator.userAgent
    };

    // 发送到分析服务
    await fetch('/api/analytics/notification-interaction', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(interaction)
    }).catch(error => {
      console.warn('Service Worker: 无法记录通知交互:', error);
    });

  } catch (error) {
    console.warn('Service Worker: 记录通知交互失败:', error);
  }
}

// ============ 客户端通信工具 ============

/**
 * 向所有客户端发送消息
 */
export async function notifyClients(type, data) {
  const clients = await self.clients.matchAll({
    includeUncontrolled: true
  });

  const message = {
    type,
    data,
    timestamp: Date.now()
  };

  clients.forEach(client => {
    client.postMessage(message);
  });
}

/**
 * 获取活跃客户端数量
 */
export async function getActiveClientsCount() {
  const clients = await self.clients.matchAll({
    includeUncontrolled: true
  });
  return clients.length;
}

// ============ 存储管理工具 ============

/**
 * 清理过期缓存
 */
export async function cleanupExpiredCaches() {
  const cacheNames = await caches.keys();
  const expiredCaches = [];

  for (const cacheName of cacheNames) {
    // 清理版本号小于v2的缓存
    if (cacheName.includes('v1') ||
        cacheName.includes('old') ||
        cacheName.includes('temp')) {
      expiredCaches.push(cacheName);
    }
  }

  await Promise.all(
    expiredCaches.map(cacheName => caches.delete(cacheName))
  );

  console.log(`Service Worker: 清理了 ${expiredCaches.length} 个过期缓存`);
  return expiredCaches;
}

/**
 * 获取缓存统计信息
 */
export async function getCacheStats() {
  const cacheNames = await caches.keys();
  const stats = [];

  for (const cacheName of cacheNames) {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();

    stats.push({
      name: cacheName,
      size: keys.length,
      estimatedSize: await estimateCacheSize(cache, keys),
      lastModified: await getLastModifiedTime(cache, keys)
    });
  }

  return {
    caches: stats,
    totalCaches: stats.length,
    totalEntries: stats.reduce((sum, cache) => sum + cache.size, 0),
    totalEstimatedSize: stats.reduce((sum, cache) => sum + cache.estimatedSize, 0)
  };
}

/**
 * 估算缓存大小
 */
async function estimateCacheSize(cache, keys) {
  let totalSize = 0;

  // 只计算前10个条目来估算
  const sampleKeys = keys.slice(0, Math.min(10, keys.length));

  for (const key of sampleKeys) {
    try {
      const response = await cache.match(key);
      if (response) {
        const blob = await response.blob();
        totalSize += blob.size;
      }
    } catch (error) {
      // 忽略单个条目的错误
    }
  }

  // 基于样本估算总大小
  return Math.round((totalSize / sampleKeys.length) * keys.length);
}

/**
 * 获取缓存最后修改时间
 */
async function getLastModifiedTime(cache, keys) {
  if (keys.length === 0) return null;

  try {
    const response = await cache.match(keys[0]);
    return response ? response.headers.get('date') : null;
  } catch (error) {
    return null;
  }
}