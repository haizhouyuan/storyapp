import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { PointsToaster } from './components/points';

// 导入页面组件
import HomePage from './pages/HomePage';
import StoryPage from './pages/StoryPage';
import StoryTreePage from './pages/StoryTreePage';
import EndPage from './pages/EndPage';
import MyStoriesPage from './pages/MyStoriesPage';

// 导入PWA组件 - Phase D
import PWAInstallPrompt from './components/PWAInstallPrompt';
import PWAManager from './components/PWAManager';

// 导入类型
import type { StorySession, StoryTreeSession } from '../../shared/types';

function App() {
  // 故事会话状态 - 在整个应用中共享
  const [storySession, setStorySession] = React.useState<StorySession | null>(null);
  const [storyTreeSession, setStoryTreeSession] = React.useState<StoryTreeSession | null>(null);

  // PWA状态管理 - Phase D
  const [showInstallSuccess, setShowInstallSuccess] = React.useState(false);

  // TODO: 在后续版本中实现故事树功能
  React.useEffect(() => {
    if (storyTreeSession) {
      console.log('Story tree session:', storyTreeSession);
    }
  }, [storyTreeSession]);

  // PWA事件处理
  React.useEffect(() => {
    // 监听PWA安装成功事件
    const handleInstallSuccess = () => {
      setShowInstallSuccess(true);
      setTimeout(() => setShowInstallSuccess(false), 5000);
    };

    // 监听网络状态变化
    const handleNetworkChange = (event: Event) => {
      const isOnline = (event as CustomEvent).type === 'pwa-network-online';
      console.log(`网络状态变化: ${isOnline ? '在线' : '离线'}`);
    };

    // 添加事件监听器
    window.addEventListener('pwa-offline-ready', handleInstallSuccess);
    window.addEventListener('pwa-network-online', handleNetworkChange);
    window.addEventListener('pwa-network-offline', handleNetworkChange);

    return () => {
      window.removeEventListener('pwa-offline-ready', handleInstallSuccess);
      window.removeEventListener('pwa-network-online', handleNetworkChange);
      window.removeEventListener('pwa-network-offline', handleNetworkChange);
    };
  }, []);

  return (
    <Router>
      <div className="App min-h-screen text-points-text">
        <PointsToaster />

        {/* PWA管理组件 - Phase D */}
        <PWAManager />

        {/* PWA安装提示组件 */}
        <PWAInstallPrompt
          onInstallSuccess={() => setShowInstallSuccess(true)}
          onInstallDismiss={() => console.log('用户拒绝安装PWA')}
        />

        {/* 安装成功提示 */}
        {showInstallSuccess && (
          <div className="fixed top-4 left-4 right-4 z-50 bg-green-500 text-white p-4 rounded-lg shadow-lg text-center">
            🎉 应用安装成功！现在可以离线使用睡前故事了
          </div>
        )}

        {/* 路由配置 */}
        <Routes>
          {/* 首页：故事主题输入页 */}
          <Route 
            path="/" 
            element={
              <HomePage 
                onStartStory={setStorySession}
                onStartStoryTree={setStoryTreeSession}
              />
            } 
          />
          
          {/* 故事互动页（传统模式） */}
          <Route 
            path="/story" 
            element={
              <StoryPage 
                storySession={storySession}
                onUpdateSession={setStorySession}
              />
            } 
          />

          {/* 故事树互动页（新模式） */}
          <Route 
            path="/story-tree" 
            element={<StoryTreePage />} 
          />
          
          {/* 故事结束页 */}
          <Route 
            path="/end" 
            element={
              <EndPage 
                storySession={storySession}
                onResetSession={() => setStorySession(null)}
              />
            } 
          />
          
          {/* 我的故事页 */}
          <Route 
            path="/my-stories" 
            element={<MyStoriesPage />} 
          />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
