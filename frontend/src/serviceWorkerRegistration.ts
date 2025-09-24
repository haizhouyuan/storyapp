/**
 * Service Worker 注册和管理
 * 负责PWA的核心功能：缓存、离线支持、应用更新
 */

const isLocalhost = Boolean(
  window.location.hostname === 'localhost' ||
  window.location.hostname === '[::1]' ||
  window.location.hostname.match(
    /^127(?:\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)){3}$/
  )
);

type Config = {
  onSuccess?: (registration: ServiceWorkerRegistration) => void;
  onUpdate?: (registration: ServiceWorkerRegistration) => void;
  onOfflineReady?: () => void;
  onNeedRefresh?: (registration: ServiceWorkerRegistration) => void;
};

export function register(config?: Config) {
  if ('serviceWorker' in navigator) {
    // 生产环境或本地开发
    const publicUrl = new URL(process.env.PUBLIC_URL!, window.location.href);
    if (publicUrl.origin !== window.location.origin) {
      return;
    }

    window.addEventListener('load', () => {
      const swUrl = `${process.env.PUBLIC_URL}/service-worker.js`;

      if (isLocalhost) {
        // 本地开发模式
        checkValidServiceWorker(swUrl, config);

        navigator.serviceWorker.ready.then(() => {
          console.log(
            '这是在本地开发模式下运行的Service Worker。' +
            '了解更多: https://cra.link/PWA'
          );
          config?.onOfflineReady?.();
        });
      } else {
        // 生产模式
        registerValidSW(swUrl, config);
      }
    });
  }
}

function registerValidSW(swUrl: string, config?: Config) {
  navigator.serviceWorker
    .register(swUrl)
    .then((registration) => {
      console.log('SW registered: ', registration);

      // 检查是否有新版本
      registration.addEventListener('updatefound', () => {
        const installingWorker = registration.installing;
        if (installingWorker == null) {
          return;
        }

        installingWorker.addEventListener('statechange', () => {
          if (installingWorker.state === 'installed') {
            if (navigator.serviceWorker.controller) {
              // 有新版本可用
              console.log(
                '新内容可用，将在所有标签页关闭后生效。'
              );

              // 通知应用有更新
              config?.onUpdate?.(registration);
              config?.onNeedRefresh?.(registration);
            } else {
              // 首次安装完成
              console.log('内容已缓存，可离线使用。');
              config?.onSuccess?.(registration);
              config?.onOfflineReady?.();
            }
          }
        });
      });

      // 定期检查更新 - 优化频率以减少对儿童设备的性能影响
      setInterval(() => {
        registration.update();
      }, 30 * 60 * 1000); // 每30分钟检查一次，减少电池消耗
    })
    .catch((error) => {
      console.error('SW registration failed: ', error);
    });
}

function checkValidServiceWorker(swUrl: string, config?: Config) {
  // 检查service worker文件是否存在
  fetch(swUrl, {
    headers: { 'Service-Worker': 'script' },
  })
    .then((response) => {
      const contentType = response.headers.get('content-type');
      if (
        response.status === 404 ||
        (contentType != null && contentType.indexOf('javascript') === -1)
      ) {
        // Service worker不存在，卸载已有的
        navigator.serviceWorker.ready.then((registration) => {
          registration.unregister().then(() => {
            window.location.reload();
          });
        });
      } else {
        // Service worker存在，正常注册
        registerValidSW(swUrl, config);
      }
    })
    .catch(() => {
      console.log('离线模式：无法获取Service Worker文件。');
    });
}

export function unregister() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready
      .then((registration) => {
        registration.unregister();
        console.log('Service Worker已卸载');
      })
      .catch((error) => {
        console.error('卸载Service Worker失败:', error.message);
      });
  }
}

// PWA安装提示管理
export class PWAInstallPrompt {
  private deferredPrompt: any = null;
  private isInstalled = false;

  constructor() {
    this.setupInstallPrompt();
    this.checkIfInstalled();
  }

  private setupInstallPrompt() {
    window.addEventListener('beforeinstallprompt', (e) => {
      console.log('PWA安装提示已准备');
      e.preventDefault();
      this.deferredPrompt = e;

      // 触发自定义安装提示事件
      window.dispatchEvent(new CustomEvent('pwa-install-available'));
    });

    window.addEventListener('appinstalled', () => {
      console.log('PWA已安装');
      this.isInstalled = true;
      this.deferredPrompt = null;

      // 记录安装事件
      this.trackInstallEvent('installed');
      window.dispatchEvent(new CustomEvent('pwa-installed'));
    });
  }

  private checkIfInstalled() {
    // 检查是否以PWA模式运行
    if (window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as any).standalone) {
      this.isInstalled = true;
      console.log('应用以PWA模式运行');
    }
  }

  public async showInstallPrompt(): Promise<boolean> {
    if (!this.deferredPrompt) {
      console.log('安装提示不可用');
      return false;
    }

    try {
      const result = await this.deferredPrompt.prompt();
      console.log('用户安装选择:', result.outcome);

      this.trackInstallEvent(result.outcome === 'accepted' ? 'accepted' : 'dismissed');

      if (result.outcome === 'accepted') {
        this.deferredPrompt = null;
        return true;
      }

      return false;
    } catch (error) {
      console.error('显示安装提示失败:', error);
      return false;
    }
  }

  public isInstallAvailable(): boolean {
    return !!this.deferredPrompt;
  }

  public isAppInstalled(): boolean {
    return this.isInstalled;
  }

  private trackInstallEvent(action: string) {
    // 儿童隐私保护：仅在本地记录事件，不收集个人数据
    // COPPA合规：移除第三方分析跟踪

    // 仅本地日志记录，不向外部服务发送数据
    console.log(`PWA安装事件: ${action}`);

    // 可选：存储到本地存储进行应用内统计（不涉及个人信息）
    try {
      const stats = JSON.parse(localStorage.getItem('app_stats') || '{}');
      stats.pwa_events = stats.pwa_events || [];
      stats.pwa_events.push({
        action,
        timestamp: Date.now(),
        // 注意：不记录任何个人身份信息
      });
      // 限制本地统计数据大小
      if (stats.pwa_events.length > 50) {
        stats.pwa_events = stats.pwa_events.slice(-50);
      }
      localStorage.setItem('app_stats', JSON.stringify(stats));
    } catch (error) {
      // 静默处理本地存储错误
      console.warn('本地统计存储失败:', error);
    }
  }
}

// Service Worker 更新管理
export class ServiceWorkerUpdateManager {
  private registration: ServiceWorkerRegistration | null = null;

  constructor(registration?: ServiceWorkerRegistration) {
    this.registration = registration || null;
  }

  public setRegistration(registration: ServiceWorkerRegistration) {
    this.registration = registration;
  }

  public async skipWaiting(): Promise<void> {
    if (!this.registration?.waiting) {
      throw new Error('没有等待中的Service Worker');
    }

    // 通知Service Worker跳过等待
    this.registration.waiting.postMessage({ type: 'SKIP_WAITING' });

    // 等待控制权转移
    return new Promise((resolve) => {
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        resolve();
      });
    });
  }

  public async update(): Promise<void> {
    if (!this.registration) {
      throw new Error('Service Worker未注册');
    }

    await this.registration.update();
  }

  public isUpdateAvailable(): boolean {
    return !!(this.registration?.waiting);
  }
}