import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { PointsToaster } from './components/points';
import { AudioPreferencesProvider } from './context/AudioPreferencesContext';

// 导入页面组件
import HomePage from './pages/HomePage';
import StoryPage from './pages/StoryPage';
import StoryTreePage from './pages/StoryTreePage';
import EndPage from './pages/EndPage';
import MyStoriesPage from './pages/MyStoriesPage';

// 导入类型
import type { StorySession, StoryTreeSession } from '../../shared/types';

function App() {
  // 故事会话状态 - 在整个应用中共享
  const [storySession, setStorySession] = React.useState<StorySession | null>(null);
  const [storyTreeSession, setStoryTreeSession] = React.useState<StoryTreeSession | null>(null);
  
  // TODO: 在后续版本中实现故事树功能
  React.useEffect(() => {
    if (storyTreeSession) {
      console.log('Story tree session:', storyTreeSession);
    }
  }, [storyTreeSession]);

  return (
    <AudioPreferencesProvider>
      <Router>
        <div className="App min-h-screen text-points-text">
          <PointsToaster />

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
    </AudioPreferencesProvider>
  );
}

export default App;
