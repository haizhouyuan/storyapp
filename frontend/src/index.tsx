import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import * as serviceWorkerRegistration from './serviceWorkerRegistration';

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// 注册Service Worker以启用PWA功能 - Phase D Enhanced
serviceWorkerRegistration.register({
  onSuccess: (registration) => {
    console.log('✅ PWA安装成功，应用已缓存，可离线使用');

    // 显示离线就绪提示
    const event = new CustomEvent('pwa-offline-ready', {
      detail: { registration, features: ['offline-support', 'background-sync'] }
    });
    window.dispatchEvent(event);

    // 请求通知权限
    if ('Notification' in window && Notification.permission === 'default') {
      setTimeout(() => {
        Notification.requestPermission().then(permission => {
          console.log('通知权限:', permission);
        });
      }, 5000); // 5秒后请求，避免打扰用户
    }
  },

  onUpdate: (registration) => {
    console.log('🔄 检测到新版本，建议刷新应用');

    // 显示更新提示
    const event = new CustomEvent('pwa-update-available', {
      detail: {
        registration,
        version: process.env.REACT_APP_VERSION || '1.0.0',
        timestamp: new Date().toISOString()
      }
    });
    window.dispatchEvent(event);
  },

  onOfflineReady: () => {
    console.log('📱 应用已准备好离线使用');

    const event = new CustomEvent('pwa-offline-ready');
    window.dispatchEvent(event);
  },

  onNeedRefresh: (registration) => {
    console.log('🆕 有新版本可用，点击刷新以获取最新内容');

    // 显示用户友好的更新提示
    const event = new CustomEvent('pwa-need-refresh', {
      detail: {
        registration,
        message: '有新版本可用，建议立即更新以获得最佳体验'
      }
    });
    window.dispatchEvent(event);
  }
});

// PWA生命周期事件监听
if ('serviceWorker' in navigator) {
  // 监听Service Worker状态变化
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    console.log('🔄 Service Worker控制器已更改');

    // 通知应用Service Worker已更新
    const event = new CustomEvent('pwa-controller-changed');
    window.dispatchEvent(event);
  });

  // 监听Service Worker消息
  navigator.serviceWorker.addEventListener('message', (event) => {
    const { data } = event;
    if (!data) return;

    console.log('收到Service Worker消息:', data);

    // 处理同步完成事件
    if (data.type === 'SYNC_COMPLETE') {
      const event = new CustomEvent('pwa-sync-complete', {
        detail: data.data
      });
      window.dispatchEvent(event);
    }

    // 处理同步错误事件
    if (data.type === 'SYNC_ERROR') {
      const event = new CustomEvent('pwa-sync-error', {
        detail: data.data
      });
      window.dispatchEvent(event);
    }
  });

  // Service Worker准备就绪后初始化
  navigator.serviceWorker.ready.then(registration => {
    console.log('📱 Service Worker已准备就绪');

    // 检查是否有等待的Service Worker
    if (registration.waiting) {
      const event = new CustomEvent('pwa-update-available', {
        detail: { registration }
      });
      window.dispatchEvent(event);
    }

    // 设置定期检查更新
    setInterval(() => {
      registration.update();
    }, 60000); // 每分钟检查一次更新
  });
}

// 网络状态监听
window.addEventListener('online', () => {
  console.log('🌐 网络已连接');
  const event = new CustomEvent('pwa-network-online');
  window.dispatchEvent(event);
});

window.addEventListener('offline', () => {
  console.log('📡 网络已断开');
  const event = new CustomEvent('pwa-network-offline');
  window.dispatchEvent(event);
});

// 开发环境下的调试信息
if (process.env.NODE_ENV === 'development') {
  console.log('🔧 开发模式：PWA功能已启用 (Phase D)');

  // 添加全面的调试事件监听
  [
    'pwa-offline-ready',
    'pwa-update-available',
    'pwa-need-refresh',
    'pwa-controller-changed',
    'pwa-sync-complete',
    'pwa-sync-error',
    'pwa-network-online',
    'pwa-network-offline'
  ].forEach(eventType => {
    window.addEventListener(eventType, (event) => {
      console.log(`📱 PWA事件 [${eventType}]:`, (event as CustomEvent).detail);
    });
  });

  // 显示PWA功能状态
  console.log('📱 PWA功能状态:');
  console.log('  - Service Worker:', 'serviceWorker' in navigator ? '✅ 支持' : '❌ 不支持');
  console.log('  - 通知API:', 'Notification' in window ? '✅ 支持' : '❌ 不支持');
  console.log('  - 后台同步:', 'serviceWorker' in navigator && 'sync' in window.ServiceWorkerRegistration.prototype ? '✅ 支持' : '❌ 不支持');
  console.log('  - 推送通知:', 'serviceWorker' in navigator && 'PushManager' in window ? '✅ 支持' : '❌ 不支持');
  console.log('  - 网络状态:', navigator.onLine ? '🌐 在线' : '📡 离线');
}