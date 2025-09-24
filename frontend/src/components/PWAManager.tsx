import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * PWA 生命周期管理组件 - Phase D
 * 处理Service Worker更新、缓存管理和用户通知
 */

interface PWAManagerProps {
  className?: string;
}

interface ServiceWorkerUpdate {
  isUpdateAvailable: boolean;
  registration: ServiceWorkerRegistration | null;
  waitingWorker: ServiceWorker | null;
}

interface CacheStats {
  caches: Array<{
    name: string;
    size: number;
    urls?: string[];
  }>;
  totalCaches: number;
  totalEntries: number;
}

const PWAManager: React.FC<PWAManagerProps> = ({ className = '' }) => {
  const [swUpdate, setSwUpdate] = useState<ServiceWorkerUpdate>({
    isUpdateAvailable: false,
    registration: null,
    waitingWorker: null
  });
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [showUpdatePrompt, setShowUpdatePrompt] = useState(false);
  const [showOfflineBanner, setShowOfflineBanner] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null);
  const [showCacheManager, setShowCacheManager] = useState(false);
  const [swVersion, setSwVersion] = useState<string | null>(null);

  // 监听网络状态变化
  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
      setShowOfflineBanner(false);
      console.log('PWA Manager: 网络已连接');

      // 尝试同步离线数据
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: 'TRIGGER_SYNC',
          syncType: 'story-sync'
        });
      }
    };

    const handleOffline = () => {
      setIsOffline(true);
      setShowOfflineBanner(true);
      console.log('PWA Manager: 网络已断开');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // 初始化时检查网络状态
    if (!navigator.onLine) {
      setShowOfflineBanner(true);
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // 监听Service Worker更新
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const handleServiceWorkerUpdate = (registration: ServiceWorkerRegistration) => {
      console.log('PWA Manager: Service Worker更新可用');

      setSwUpdate({
        isUpdateAvailable: true,
        registration,
        waitingWorker: registration.waiting
      });

      // 延迟显示更新提示，避免打断用户
      setTimeout(() => {
        setShowUpdatePrompt(true);
      }, 5000);
    };

    // 监听已有的Service Worker更新
    navigator.serviceWorker.ready.then(registration => {
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              handleServiceWorkerUpdate(registration);
            }
          });
        }
      });

      // 检查是否已有等待的Service Worker
      if (registration.waiting) {
        handleServiceWorkerUpdate(registration);
      }
    });

    // 监听Service Worker消息
    const handleSWMessage = (event: MessageEvent) => {
      const { data } = event;
      if (!data) return;

      switch (data.type) {
        case 'CACHE_STATS_RESPONSE':
          setCacheStats(data);
          break;

        case 'SYNC_COMPLETE':
          console.log('PWA Manager: 同步完成', data);
          showNotification('数据同步完成', 'success');
          break;

        case 'SYNC_ERROR':
          console.log('PWA Manager: 同步失败', data);
          showNotification('数据同步失败，将稍后重试', 'error');
          break;

        default:
          console.log('PWA Manager: 收到未知消息', data);
      }
    };

    navigator.serviceWorker.addEventListener('message', handleSWMessage);

    // 获取Service Worker版本信息
    navigator.serviceWorker.ready.then(registration => {
      if (registration.active) {
        const messageChannel = new MessageChannel();
        messageChannel.port1.onmessage = (event) => {
          if (event.data.version) {
            setSwVersion(event.data.version);
          }
        };

        registration.active.postMessage(
          { type: 'GET_VERSION' },
          [messageChannel.port2]
        );
      }
    });

    return () => {
      navigator.serviceWorker.removeEventListener('message', handleSWMessage);
    };
  }, []);

  // 应用Service Worker更新
  const handleApplyUpdate = useCallback(async () => {
    if (!swUpdate.waitingWorker) return;

    setIsUpdating(true);

    try {
      // 发送跳过等待消息
      swUpdate.waitingWorker.postMessage({ type: 'SKIP_WAITING' });

      // 监听Service Worker状态变化
      swUpdate.waitingWorker.addEventListener('statechange', () => {
        if (swUpdate.waitingWorker?.state === 'activated') {
          console.log('PWA Manager: Service Worker已激活，准备刷新');

          setTimeout(() => {
            window.location.reload();
          }, 1000);
        }
      });

      setShowUpdatePrompt(false);
      showNotification('正在更新应用...', 'info');

    } catch (error) {
      console.error('PWA Manager: 应用更新失败:', error);
      showNotification('更新失败，请重试', 'error');
      setIsUpdating(false);
    }
  }, [swUpdate.waitingWorker]);

  // 忽略更新
  const handleIgnoreUpdate = useCallback(() => {
    setShowUpdatePrompt(false);
    setSwUpdate(prev => ({ ...prev, isUpdateAvailable: false }));
  }, []);

  // 获取缓存统计
  const handleGetCacheStats = useCallback(async () => {
    if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) return;

    const messageChannel = new MessageChannel();
    messageChannel.port1.onmessage = (event) => {
      setCacheStats(event.data);
      setShowCacheManager(true);
    };

    navigator.serviceWorker.controller.postMessage(
      { type: 'CACHE_STATS' },
      [messageChannel.port2]
    );
  }, []);

  // 清理缓存
  const handleClearCache = useCallback(async () => {
    if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) return;

    const messageChannel = new MessageChannel();
    messageChannel.port1.onmessage = (event) => {
      if (event.data.type === 'CACHE_CLEARED') {
        showNotification('缓存已清理', 'success');
        setCacheStats(null);
        setShowCacheManager(false);
      }
    };

    navigator.serviceWorker.controller.postMessage(
      { type: 'CLEAR_CACHE' },
      [messageChannel.port2]
    );
  }, []);

  // 显示通知
  const showNotification = (message: string, type: 'success' | 'error' | 'info') => {
    // 这里可以集成toast库或自定义通知组件
    console.log(`PWA通知 [${type}]: ${message}`);
  };

  return (
    <div className={`pwa-manager ${className}`}>
      {/* 离线状态横幅 */}
      <AnimatePresence>
        {showOfflineBanner && (
          <motion.div
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -50 }}
            className="fixed top-0 left-0 right-0 z-50 bg-yellow-500 text-white px-4 py-2 text-center text-sm"
          >
            <span className="mr-2">📶</span>
            当前处于离线模式，部分功能可能受限
            <button
              onClick={() => setShowOfflineBanner(false)}
              className="ml-4 text-yellow-200 hover:text-white"
            >
              ✕
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Service Worker更新提示 */}
      <AnimatePresence>
        {showUpdatePrompt && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="fixed top-4 right-4 z-50 bg-white rounded-lg shadow-2xl border border-gray-200 p-4 max-w-sm"
          >
            <div className="flex items-start">
              <div className="flex-shrink-0 mr-3">
                <span className="text-2xl">🚀</span>
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-gray-900 mb-1">
                  应用更新可用
                </h3>
                <p className="text-xs text-gray-600 mb-3">
                  新版本包含功能改进和错误修复
                </p>
                <div className="flex space-x-2">
                  <button
                    onClick={handleApplyUpdate}
                    disabled={isUpdating}
                    className="flex-1 bg-blue-500 text-white text-xs py-2 px-3 rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isUpdating ? '更新中...' : '立即更新'}
                  </button>
                  <button
                    onClick={handleIgnoreUpdate}
                    className="text-xs text-gray-500 hover:text-gray-700 px-2"
                  >
                    稍后
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 缓存管理器 */}
      <AnimatePresence>
        {showCacheManager && cacheStats && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              className="bg-white rounded-lg shadow-2xl max-w-md w-full max-h-96 overflow-hidden"
            >
              <div className="p-4 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900">
                    缓存管理
                  </h3>
                  <button
                    onClick={() => setShowCacheManager(false)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    ✕
                  </button>
                </div>
              </div>

              <div className="p-4 max-h-64 overflow-y-auto">
                <div className="mb-4">
                  <div className="text-sm text-gray-600 mb-2">
                    总计 {cacheStats.totalCaches} 个缓存，{cacheStats.totalEntries} 个条目
                  </div>
                  {swVersion && (
                    <div className="text-xs text-gray-500">
                      Service Worker 版本: {swVersion}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  {cacheStats.caches.map((cache, index) => (
                    <div key={index} className="bg-gray-50 rounded p-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-gray-900">
                          {cache.name}
                        </span>
                        <span className="text-xs text-gray-500">
                          {cache.size} 项
                        </span>
                      </div>
                      {cache.urls && cache.urls.length > 0 && (
                        <div className="text-xs text-gray-500">
                          {cache.urls.slice(0, 2).map(url => (
                            <div key={url} className="truncate">
                              {url.replace(window.location.origin, '')}
                            </div>
                          ))}
                          {cache.urls.length > 2 && (
                            <div>... 还有 {cache.urls.length - 2} 项</div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-4 border-t border-gray-200">
                <button
                  onClick={handleClearCache}
                  className="w-full bg-red-500 text-white py-2 px-4 rounded hover:bg-red-600 text-sm"
                >
                  清理所有缓存
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* PWA状态指示器 */}
      {process.env.NODE_ENV === 'development' && (
        <div className="fixed bottom-4 right-4 z-40">
          <div className="bg-gray-800 text-white text-xs rounded-lg p-2 space-y-1">
            <div>网络: {isOffline ? '离线' : '在线'}</div>
            <div>SW更新: {swUpdate.isUpdateAvailable ? '可用' : '无'}</div>
            {swVersion && <div>版本: {swVersion}</div>}
            <button
              onClick={handleGetCacheStats}
              className="text-blue-300 hover:text-blue-100 underline"
            >
              查看缓存
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default PWAManager;