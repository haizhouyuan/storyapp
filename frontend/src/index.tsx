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

// 注册Service Worker以启用PWA功能
serviceWorkerRegistration.register({
  onSuccess: (registration) => {
    console.log('✅ PWA安装成功，应用已缓存，可离线使用');

    // 显示离线就绪提示
    const event = new CustomEvent('pwa-offline-ready');
    window.dispatchEvent(event);
  },

  onUpdate: (registration) => {
    console.log('🔄 检测到新版本，建议刷新应用');

    // 显示更新提示
    const event = new CustomEvent('pwa-update-available', {
      detail: { registration }
    });
    window.dispatchEvent(event);
  },

  onOfflineReady: () => {
    console.log('📱 应用已准备好离线使用');
  },

  onNeedRefresh: (registration) => {
    console.log('🆕 有新版本可用，点击刷新以获取最新内容');

    // 可以在这里显示用户友好的更新提示
    const event = new CustomEvent('pwa-need-refresh', {
      detail: { registration }
    });
    window.dispatchEvent(event);
  }
});

// 开发环境下的调试信息
if (process.env.NODE_ENV === 'development') {
  console.log('🔧 开发模式：PWA功能已启用');

  // 添加调试事件监听
  window.addEventListener('pwa-offline-ready', () => {
    console.log('📱 PWA离线就绪事件触发');
  });

  window.addEventListener('pwa-update-available', () => {
    console.log('🔄 PWA更新可用事件触发');
  });
}