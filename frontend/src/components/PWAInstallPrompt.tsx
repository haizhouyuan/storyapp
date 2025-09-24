import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * PWA 安装提示组件 - Phase D
 * 处理应用安装提示和用户引导
 */

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

interface PWAInstallPromptProps {
  className?: string;
  onInstallSuccess?: () => void;
  onInstallDismiss?: () => void;
}

const PWAInstallPrompt: React.FC<PWAInstallPromptProps> = ({
  className = '',
  onInstallSuccess,
  onInstallDismiss
}) => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [installationStep, setInstallationStep] = useState<'prompt' | 'installing' | 'success'>('prompt');
  const [dismissCount, setDismissCount] = useState(0);

  useEffect(() => {
    // 检查是否已在独立模式运行
    const checkStandalone = () => {
      const isStandaloneMode = window.matchMedia('(display-mode: standalone)').matches ||
                              (window.navigator as any).standalone ||
                              document.referrer.includes('android-app://');
      setIsStandalone(isStandaloneMode);
    };

    checkStandalone();

    // 监听beforeinstallprompt事件
    const handleBeforeInstallPrompt = (e: Event) => {
      console.log('PWA: beforeinstallprompt事件触发');
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);

      // 获取用户之前的选择
      const dismissedCount = parseInt(localStorage.getItem('pwa-install-dismissed') || '0');
      const lastDismissed = localStorage.getItem('pwa-install-last-dismissed');
      const now = Date.now();

      // 如果用户已经多次拒绝且在24小时内，则不显示
      if (dismissedCount >= 3 && lastDismissed) {
        const lastDismissedTime = parseInt(lastDismissed);
        if (now - lastDismissedTime < 24 * 60 * 60 * 1000) {
          console.log('PWA: 用户已多次拒绝，24小时内不再显示');
          return;
        }
      }

      setDismissCount(dismissedCount);
      // 延迟显示，让用户先体验应用
      setTimeout(() => {
        if (!isStandalone) {
          setShowPrompt(true);
        }
      }, 30000); // 30秒后显示
    };

    // 监听appinstalled事件
    const handleAppInstalled = () => {
      console.log('PWA: 应用已安装');
      setIsInstalled(true);
      setShowPrompt(false);
      setInstallationStep('success');
      localStorage.removeItem('pwa-install-dismissed');
      localStorage.removeItem('pwa-install-last-dismissed');

      // 显示成功消息
      setTimeout(() => {
        onInstallSuccess?.();
      }, 1000);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, [isStandalone, onInstallSuccess]);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    setInstallationStep('installing');

    try {
      // 显示安装提示
      await deferredPrompt.prompt();

      // 等待用户选择
      const { outcome } = await deferredPrompt.userChoice;

      console.log(`PWA: 用户选择结果: ${outcome}`);

      if (outcome === 'accepted') {
        console.log('PWA: 用户接受安装');
        setInstallationStep('success');
      } else {
        console.log('PWA: 用户拒绝安装');
        handleDismiss();
      }

      setDeferredPrompt(null);
    } catch (error) {
      console.error('PWA: 安装过程出错:', error);
      setInstallationStep('prompt');
    }
  };

  const handleDismiss = () => {
    const newDismissCount = dismissCount + 1;
    setDismissCount(newDismissCount);
    setShowPrompt(false);

    // 记录拒绝次数和时间
    localStorage.setItem('pwa-install-dismissed', newDismissCount.toString());
    localStorage.setItem('pwa-install-last-dismissed', Date.now().toString());

    onInstallDismiss?.();
  };

  const handleLater = () => {
    setShowPrompt(false);
    // 1小时后再次尝试显示
    setTimeout(() => {
      if (deferredPrompt && !isStandalone) {
        setShowPrompt(true);
      }
    }, 60 * 60 * 1000); // 1小时
  };

  // 如果已安装或在独立模式运行，不显示提示
  if (isInstalled || isStandalone || !deferredPrompt) {
    return null;
  }

  return (
    <AnimatePresence>
      {showPrompt && (
        <motion.div
          initial={{ opacity: 0, y: 100 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 100 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className={`fixed bottom-4 left-4 right-4 z-50 ${className}`}
        >
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden max-w-md mx-auto">
            {installationStep === 'prompt' && (
              <div className="p-6">
                {/* 头部图标和标题 */}
                <div className="flex items-center mb-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center mr-4">
                    <span className="text-2xl">📱</span>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">
                      安装睡前故事应用
                    </h3>
                    <p className="text-sm text-gray-600">
                      离线使用，更快体验
                    </p>
                  </div>
                </div>

                {/* 功能列表 */}
                <div className="mb-6">
                  <div className="space-y-2">
                    <div className="flex items-center text-sm text-gray-700">
                      <span className="w-4 h-4 mr-3 text-green-500">✓</span>
                      离线阅读已保存的故事
                    </div>
                    <div className="flex items-center text-sm text-gray-700">
                      <span className="w-4 h-4 mr-3 text-green-500">✓</span>
                      更快的启动速度
                    </div>
                    <div className="flex items-center text-sm text-gray-700">
                      <span className="w-4 h-4 mr-3 text-green-500">✓</span>
                      推送通知提醒
                    </div>
                    <div className="flex items-center text-sm text-gray-700">
                      <span className="w-4 h-4 mr-3 text-green-500">✓</span>
                      无需应用商店下载
                    </div>
                  </div>
                </div>

                {/* 按钮组 */}
                <div className="flex space-x-3">
                  <button
                    onClick={handleInstallClick}
                    className="flex-1 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-medium py-3 px-4 rounded-xl hover:from-purple-600 hover:to-pink-600 transition-all duration-200 shadow-lg hover:shadow-xl"
                  >
                    立即安装
                  </button>
                  <button
                    onClick={handleLater}
                    className="px-4 py-3 text-gray-600 hover:text-gray-800 font-medium transition-colors duration-200"
                  >
                    稍后
                  </button>
                  <button
                    onClick={handleDismiss}
                    className="px-2 py-3 text-gray-400 hover:text-gray-600 transition-colors duration-200"
                  >
                    ✕
                  </button>
                </div>

                {/* 拒绝次数提示 */}
                {dismissCount > 0 && (
                  <p className="text-xs text-gray-500 mt-3 text-center">
                    💡 您已拒绝 {dismissCount} 次，安装后可获得更好的体验
                  </p>
                )}
              </div>
            )}

            {installationStep === 'installing' && (
              <div className="p-6 text-center">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  className="w-12 h-12 border-4 border-purple-200 border-t-purple-500 rounded-full mx-auto mb-4"
                />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  正在安装...
                </h3>
                <p className="text-sm text-gray-600">
                  请在浏览器提示中确认安装
                </p>
              </div>
            )}

            {installationStep === 'success' && (
              <div className="p-6 text-center">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                  className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4"
                >
                  <span className="text-2xl text-green-600">✓</span>
                </motion.div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  安装成功！
                </h3>
                <p className="text-sm text-gray-600">
                  您现在可以从主屏幕访问睡前故事应用
                </p>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default PWAInstallPrompt;