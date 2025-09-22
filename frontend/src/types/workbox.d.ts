/**
 * Workbox TypeScript 类型声明
 */

declare global {
  interface Window {
    workbox: any;
    gtag: (...args: any[]) => void;
  }

  interface ServiceWorkerGlobalScope {
    __WB_MANIFEST: Array<{
      url: string;
      revision: string | null;
    }>;
  }
}

export {};