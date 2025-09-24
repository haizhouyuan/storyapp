/**
 * 基础Service Worker - 阶段A版本
 * 提供基本的缓存和离线支持
 *
 * 注意：这是临时的基础版本，后续会被Workbox生成的文件替换
 */

const CACHE_NAME = 'storyapp-v1.0.0';
const APP_SHELL_CACHE = 'app-shell-v1';
const RUNTIME_CACHE = 'runtime-v1';

// 应用外壳资源
const APP_SHELL = [
  '/',
  '/index.html',
  '/static/js/bundle.js',
  '/static/css/main.css',
  '/manifest.json'
];

// 安装事件 - 预缓存应用外壳
self.addEventListener('install', (event) => {
  console.log('Service Worker: Installing...');

  event.waitUntil(
    caches.open(APP_SHELL_CACHE)
      .then((cache) => {
        console.log('Service Worker: Caching App Shell');
        return cache.addAll(APP_SHELL);
      })
      .then(() => {
        console.log('Service Worker: Installed successfully');
        // 强制激活新的Service Worker
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('Service Worker: Install failed:', error);
      })
  );
});

// 激活事件 - 清理旧缓存
self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activating...');

  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== APP_SHELL_CACHE && cacheName !== RUNTIME_CACHE) {
              console.log('Service Worker: Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        console.log('Service Worker: Activated successfully');
        // 立即控制所有客户端
        return self.clients.claim();
      })
  );
});

// 请求拦截 - 缓存策略
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 只处理同源请求
  if (url.origin !== location.origin) {
    return;
  }

  // API请求 - 网络优先策略
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // 成功获取API响应，缓存副本
          if (response.status === 200) {
            const responseClone = response.clone();
            caches.open(RUNTIME_CACHE).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          // 网络失败，尝试从缓存获取
          console.log('Service Worker: Network failed, trying cache for:', request.url);
          return caches.match(request)
            .then((cachedResponse) => {
              if (cachedResponse) {
                return cachedResponse;
              }

              // 返回离线页面或错误响应
              if (url.pathname.startsWith('/api/')) {
                return new Response(
                  JSON.stringify({
                    error: '网络连接失败，请检查网络后重试',
                    offline: true
                  }),
                  {
                    status: 503,
                    statusText: 'Service Unavailable',
                    headers: { 'Content-Type': 'application/json' }
                  }
                );
              }
            });
        })
    );
    return;
  }

  // 静态资源 - 缓存优先策略
  event.respondWith(
    caches.match(request)
      .then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }

        return fetch(request)
          .then((response) => {
            // 只缓存成功的响应
            if (response.status === 200) {
              const responseClone = response.clone();

              // 根据资源类型选择缓存
              const cacheName = APP_SHELL.includes(url.pathname) ?
                APP_SHELL_CACHE : RUNTIME_CACHE;

              caches.open(cacheName).then((cache) => {
                cache.put(request, responseClone);
              });
            }

            return response;
          })
          .catch(() => {
            // 网络失败且无缓存，返回离线页面
            if (request.destination === 'document') {
              return caches.match('/index.html');
            }
          });
      })
  );
});

// 处理来自主线程的消息
self.addEventListener('message', (event) => {
  console.log('Service Worker: Received message:', event.data);

  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('Service Worker: Skipping waiting...');
    self.skipWaiting();
  }

  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({
      version: CACHE_NAME,
      timestamp: new Date().toISOString()
    });
  }
});

// 后台同步（基础版本）
self.addEventListener('sync', (event) => {
  console.log('Service Worker: Background sync triggered:', event.tag);

  if (event.tag === 'story-sync') {
    event.waitUntil(
      // 这里可以实现故事数据的后台同步
      console.log('Service Worker: Story sync completed')
    );
  }
});

// 推送通知（预留）
self.addEventListener('push', (event) => {
  console.log('Service Worker: Push message received');

  if (event.data) {
    const options = {
      body: event.data.text(),
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-72x72.png',
      vibrate: [200, 100, 200],
      actions: [
        {
          action: 'open',
          title: '打开应用'
        },
        {
          action: 'close',
          title: '关闭'
        }
      ]
    };

    event.waitUntil(
      self.registration.showNotification('睡前故事', options)
    );
  }
});

// 通知点击处理
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'open') {
    event.waitUntil(
      clients.openWindow('/')
    );
  }
});

console.log('Service Worker: Loaded successfully');