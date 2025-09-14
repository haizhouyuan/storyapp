import React, { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import LoadingSpinner from '../components/LoadingSpinner';
import { StoryAppErrorBoundary } from '../components/ErrorBoundary';
import type { StorySession, StoryTreeSession } from '../../../shared/types';

// 懒加载页面组件 - 实现代码分割
const HomePage = lazy(() => import('../pages/HomePage'));
const StoryPage = lazy(() => import('../pages/StoryPage'));
const StoryTreePage = lazy(() => import('../pages/StoryTreePage'));
const EndPage = lazy(() => import('../pages/EndPage'));
const MyStoriesPage = lazy(() => import('../pages/MyStoriesPage'));

// 页面级错误边界包装器
const PageWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <StoryAppErrorBoundary>
    {children}
  </StoryAppErrorBoundary>
);

// 优化的加载状态组件
const PageLoadingSuspense: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Suspense 
    fallback={
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-child-mint via-child-cream to-child-yellow">
        <LoadingSpinner 
          message="页面正在加载，马上就好..."
          size="large" 
        />
      </div>
    }
  >
    {children}
  </Suspense>
);

// 懒加载路由组件属性接口
interface LazyRoutesProps {
  storySession: StorySession | null;
  storyTreeSession: StoryTreeSession | null;
  onStartStory: (session: StorySession) => void;
  onStartStoryTree: (session: StoryTreeSession) => void;
  onUpdateSession: (session: StorySession) => void;
  onResetSession: () => void;
}

export const LazyRoutes: React.FC<LazyRoutesProps> = ({
  storySession,
  storyTreeSession,
  onStartStory,
  onStartStoryTree,
  onUpdateSession,
  onResetSession
}) => {
  return (
    <PageLoadingSuspense>
      <Routes>
        {/* 首页路由 */}
        <Route 
          path="/" 
          element={
            <PageWrapper>
              <HomePage 
                onStartStory={onStartStory}
                onStartStoryTree={onStartStoryTree}
              />
            </PageWrapper>
          } 
        />
        
        {/* 故事互动页（传统模式）*/}
        <Route 
          path="/story" 
          element={
            <PageWrapper>
              <StoryPage 
                storySession={storySession}
                onUpdateSession={onUpdateSession}
              />
            </PageWrapper>
          } 
        />

        {/* 故事树互动页（新模式）*/}
        <Route 
          path="/story-tree" 
          element={
            <PageWrapper>
              <StoryTreePage />
            </PageWrapper>
          } 
        />
        
        {/* 故事结束页 */}
        <Route 
          path="/end" 
          element={
            <PageWrapper>
              <EndPage 
                storySession={storySession}
                onResetSession={onResetSession}
              />
            </PageWrapper>
          } 
        />
        
        {/* 我的故事页 */}
        <Route 
          path="/my-stories" 
          element={
            <PageWrapper>
              <MyStoriesPage />
            </PageWrapper>
          } 
        />

        {/* 404 页面 - 也使用懒加载 */}
        <Route 
          path="*" 
          element={
            <PageWrapper>
              <div className="min-h-screen flex items-center justify-center bg-child-cream p-child-lg">
                <div className="text-center max-w-md mx-auto bg-white rounded-child-xl shadow-child-xl p-child-3xl">
                  <div className="text-8xl mb-child-lg">🔍</div>
                  <h2 className="font-child font-bold text-child-2xl text-gray-800 mb-child-lg">
                    页面走丢了
                  </h2>
                  <p className="font-child text-child-base text-gray-600 mb-child-xl">
                    这个页面好像不存在呢，让我们回到故事世界吧！
                  </p>
                  <button
                    onClick={() => window.location.href = '/'}
                    className="bg-child-blue text-white px-child-xl py-child-lg rounded-child-lg font-child font-bold hover:bg-blue-300 transition-colors"
                  >
                    🏠 回到首页
                  </button>
                </div>
              </div>
            </PageWrapper>
          }
        />
      </Routes>
    </PageLoadingSuspense>
  );
};

export default LazyRoutes;