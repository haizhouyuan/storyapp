import React, { useState } from 'react';
import { BrowserRouter as Router } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';

// 使用懒加载路由替代直接导入页面组件
import { LazyRoutes } from './router/LazyRoutes';

// 导入类型
import type { StorySession, StoryTreeSession } from '../../shared/types';

function App() {
  // 故事会话状态 - 在整个应用中共享
  const [storySession, setStorySession] = useState<StorySession | null>(null);
  const [storyTreeSession, setStoryTreeSession] = useState<StoryTreeSession | null>(null);

  // 创建故事会话的处理函数
  const handleStartStory = (topic: string) => {
    const session: StorySession = {
      topic,
      path: [],
      isComplete: false,
      startTime: Date.now(),
      maxChoices: Math.floor(Math.random() * 6) + 5, // 5-10之间随机
    };
    setStorySession(session);
  };

  const handleStartStoryTree = (topic: string) => {
    // 为故事树创建会话 - 暂时使用简单结构
    const session: StoryTreeSession = {
      topic,
      storyTree: {
        id: `tree_${Date.now()}`,
        topic,
        root: {
          id: 'root',
          segment: '',
          choices: [],
          isEnding: false,
          depth: 0,
          path: '0'
        },
        created_at: new Date().toISOString(),
        totalPaths: 8,
        maxDepth: 3
      },
      currentPath: [],
      currentNode: {
        id: 'root',
        segment: '',
        choices: [],
        isEnding: false,
        depth: 0,
        path: '0'
      },
      isComplete: false,
      startTime: Date.now(),
    };
    setStoryTreeSession(session);
  };

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

        {/* 懒加载路由配置 */}
        <LazyRoutes
          storySession={storySession}
          storyTreeSession={storyTreeSession}
          onStartStory={handleStartStory}
          onStartStoryTree={handleStartStoryTree}
          onUpdateSession={setStorySession}
          onResetSession={() => setStorySession(null)}
        />
      </div>
    </Router>
  );
}

export default App;