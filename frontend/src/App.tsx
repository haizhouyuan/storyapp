import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';

// 导入页面组件
import HomePage from './pages/HomePage';
import StoryPage from './pages/StoryPage';
import EndPage from './pages/EndPage';
import MyStoriesPage from './pages/MyStoriesPage';

// 导入类型
import type { StorySession } from '../../shared/types';

function App() {
  // 故事会话状态 - 在整个应用中共享
  const [storySession, setStorySession] = React.useState<StorySession | null>(null);

  return (
    <Router>
      <div className="App min-h-screen bg-gradient-to-br from-child-mint via-child-cream to-child-yellow">
        {/* 全局Toast通知 */}
        <Toaster
          position="top-center"
          toastOptions={{
            duration: 3000,
            style: {
              background: '#fff',
              color: '#333',
              borderRadius: '16px',
              padding: '16px 20px',
              fontSize: '18px',
              fontWeight: '600',
              fontFamily: 'Nunito, sans-serif',
              boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
              maxWidth: '500px',
            },
            success: {
              iconTheme: {
                primary: '#10B981',
                secondary: '#fff',
              },
            },
            error: {
              iconTheme: {
                primary: '#EF4444',
                secondary: '#fff',
              },
            },
          }}
        />

        {/* 路由配置 */}
        <Routes>
          {/* 首页：故事主题输入页 */}
          <Route 
            path="/" 
            element={
              <HomePage 
                onStartStory={setStorySession} 
              />
            } 
          />
          
          {/* 故事互动页 */}
          <Route 
            path="/story" 
            element={
              <StoryPage 
                storySession={storySession}
                onUpdateSession={setStorySession}
              />
            } 
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