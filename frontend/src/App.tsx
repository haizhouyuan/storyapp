import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { PointsToaster } from './components/points';
import { AudioPreferencesProvider } from './context/AudioPreferencesContext';

// 导入页面组件
import DetectiveBuilderPage from './pages/DetectiveBuilderPage';

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
            {/* 新首页：侦探故事工作室 */}
            <Route path="/" element={<DetectiveBuilderPage />} />
          </Routes>

        </div>
      </Router>
    </AudioPreferencesProvider>
  );
}

export default App;
