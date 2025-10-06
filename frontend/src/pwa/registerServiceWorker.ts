/*
 * 注册自定义 Service Worker，并处理更新提示和回退逻辑。
 */

const SW_URL = `${process.env.PUBLIC_URL ?? ''}/service-worker.js`;

const postSkipWaiting = (registration: ServiceWorkerRegistration) => {
  if (registration.waiting) {
    registration.waiting.postMessage({ type: 'SKIP_WAITING' });
  }
};

const promptUserForReload = (registration: ServiceWorkerRegistration) => {
  const shouldReload = window.confirm('有新版本的故事体验可用，是否立即更新？');
  if (shouldReload) {
    postSkipWaiting(registration);
  }
};

export const registerServiceWorker = () => {
  if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) {
    return;
  }

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(SW_URL)
      .then((registration) => {
        if (registration.waiting) {
          promptUserForReload(registration);
        }

        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (!newWorker) return;

          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              promptUserForReload(registration);
            }
          });
        });

        let refreshing = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (refreshing) return;
          refreshing = true;
          window.location.reload();
        });
      })
      .catch((error) => {
        if (process.env.NODE_ENV === 'production') {
          console.error('Service Worker 注册失败', error);
        }
      });
  });
};

export const unregisterServiceWorker = () => {
  if (!('serviceWorker' in navigator)) {
    return;
  }

  navigator.serviceWorker.ready
    .then((registration) => registration.unregister())
    .catch((error) => {
      console.error('注销 Service Worker 失败', error);
    });
};
