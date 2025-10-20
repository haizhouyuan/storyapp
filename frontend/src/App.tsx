import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { PointsToaster } from './components/points';
import { AudioPreferencesProvider } from './context/AudioPreferencesContext';

// 页面组件
import ReaderHomePage from './pages/ReaderHomePage';
import StoryReaderPage from './pages/StoryReaderPage';
import DetectiveBuilderPage from './pages/DetectiveBuilderPage';
import TtsTestPage from './pages/TtsTestPage';

function App() {
  return (
    <AudioPreferencesProvider>
      <Router>
        <div className="App min-h-screen text-points-text">
          <PointsToaster />

          <Routes>
            <Route path="/" element={<ReaderHomePage />} />
            <Route path="/story/:workflowId" element={<StoryReaderPage />} />
            <Route path="/builder" element={<DetectiveBuilderPage />} />
            <Route path="/tts-test" element={<TtsTestPage />} />
          </Routes>

        </div>
      </Router>
    </AudioPreferencesProvider>
  );
}

export default App;
