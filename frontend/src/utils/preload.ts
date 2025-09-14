import { useEffect } from 'react';

/**
 * 预加载关键资源以提升用户体验
 * 在用户可能需要时提前加载页面组件
 */
export const preloadCriticalResources = () => {
  const criticalComponents = [
    // 最常用的页面组件
    () => import('../pages/StoryPage'),
    () => import('../pages/StoryTreePage'),
  ];

  // 延迟预加载，避免影响首屏加载
  const preloadTimer = setTimeout(() => {
    criticalComponents.forEach(importFn => 
      importFn().catch(err => {
        console.debug('Preload failed for component:', err);
      })
    );
  }, 2000); // 延迟2秒预加载

  return () => clearTimeout(preloadTimer);
};

/**
 * 智能预加载Hook
 * 根据用户行为模式智能预加载相关页面
 */
export const useSmartPreload = () => {
  useEffect(() => {
    const cleanup = preloadCriticalResources();
    return cleanup;
  }, []);

  // 预加载特定页面的函数
  const preloadStoryPages = () => {
    Promise.all([
      import('../pages/StoryPage'),
      import('../pages/EndPage')
    ]).catch(err => {
      console.debug('Story pages preload failed:', err);
    });
  };

  const preloadMyStoriesPage = () => {
    import('../pages/MyStoriesPage').catch(err => {
      console.debug('MyStories page preload failed:', err);
    });
  };

  return {
    preloadStoryPages,
    preloadMyStoriesPage
  };
};

/**
 * 检测网络连接质量并调整预加载策略
 */
export const getPreloadStrategy = () => {
  // 检测网络连接
  const connection = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
  
  if (connection) {
    // 根据网络速度调整预加载策略
    const effectiveType = connection.effectiveType;
    
    switch (effectiveType) {
      case 'slow-2g':
      case '2g':
        // 慢速网络：最小化预加载
        return {
          preloadDelay: 5000,
          preloadComponents: 0
        };
      case '3g':
        // 中速网络：适度预加载
        return {
          preloadDelay: 3000,
          preloadComponents: 1
        };
      case '4g':
      default:
        // 快速网络：积极预加载
        return {
          preloadDelay: 2000,
          preloadComponents: 2
        };
    }
  }

  // 默认策略
  return {
    preloadDelay: 2000,
    preloadComponents: 2
  };
};

/**
 * 自适应预加载Hook
 * 根据网络条件智能调整预加载行为
 */
export const useAdaptivePreload = () => {
  useEffect(() => {
    const strategy = getPreloadStrategy();
    
    const timer = setTimeout(() => {
      const componentsToPreload = [
        () => import('../pages/StoryPage'),
        () => import('../pages/StoryTreePage'),
        () => import('../pages/EndPage'),
        () => import('../pages/MyStoriesPage')
      ].slice(0, strategy.preloadComponents);

      componentsToPreload.forEach(importFn => 
        importFn().catch(err => {
          console.debug('Adaptive preload failed:', err);
        })
      );
    }, strategy.preloadDelay);

    return () => clearTimeout(timer);
  }, []);
};

/**
 * 页面可见性API优化的预加载
 * 只在页面可见时进行预加载
 */
export const useVisibilityOptimizedPreload = () => {
  useEffect(() => {
    let preloadTimer: NodeJS.Timeout;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // 页面可见时启动预加载
        preloadTimer = setTimeout(() => {
          preloadCriticalResources();
        }, 1000);
      } else {
        // 页面不可见时清除预加载
        if (preloadTimer) {
          clearTimeout(preloadTimer);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // 初始检查
    if (document.visibilityState === 'visible') {
      handleVisibilityChange();
    }

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (preloadTimer) {
        clearTimeout(preloadTimer);
      }
    };
  }, []);
};