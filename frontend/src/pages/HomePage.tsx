import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { toast } from 'react-hot-toast';
import { validateAndSanitizeStoryTopic } from '../utils/security';

type StoryMode = 'progressive' | 'story-tree';

interface HomePageProps {
  onStartStory?: (topic: string) => void;
  onStartStoryTree?: (topic: string) => void;
}

const HomePage: React.FC<HomePageProps> = ({ onStartStory, onStartStoryTree }) => {
  const [topic, setTopic] = useState<string>('');
  const [storyMode, setStoryMode] = useState<StoryMode>('progressive');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleStartStory = async () => {
    const validation = validateAndSanitizeStoryTopic(topic);
    if (!validation.isValid) {
      toast.error(validation.error!);
      return;
    }

    const safeTopic = validation.sanitized;
    setTopic(safeTopic);
    setIsLoading(true);

    try {
      if (storyMode === 'progressive') {
        console.log(`🎭 渐进式故事模式启动，主题: ${safeTopic}`);
        onStartStory?.(safeTopic);
        navigate('/story');
      } else {
        console.log(`🌳 故事树模式启动，主题: ${safeTopic}`);
        onStartStoryTree?.(safeTopic);
        navigate('/story-tree');
      }
      
      toast.success('故事准备完成，开始你的冒险！');
    } catch (error: any) {
      console.error('开始故事失败:', error);
      toast.error('故事启动失败，请稍后再试');
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isLoading) {
      handleStartStory();
    }
  };

  const handleModeChange = (mode: StoryMode) => {
    setStoryMode(mode);
  };

  const handleExampleClick = (example: string) => {
    setTopic(example);
  };

  const storyExamples = [
    '小兔子的冒险',
    '神奇的森林', 
    '友善的小龙',
    '彩虹城堡',
    '月亮上的旅行',
    '勇敢的小老鼠'
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-child-purple-light via-child-blue-light to-child-green-light flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* 标题 */}
        <motion.div
          initial={{ opacity: 0, y: -50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="text-center mb-8"
        >
          <h1 className="text-child-2xl font-child font-bold text-white mb-2">
            🌟 睡前故事时间
          </h1>
          <p className="text-child-sm text-white/80 font-child">
            让我们一起创造一个美妙的故事吧！
          </p>
        </motion.div>

        {/* 输入区域 */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.8 }}
          className="bg-white/90 rounded-child-lg shadow-child-xl p-6 mb-6"
        >
          <label className="block text-child-sm font-child font-semibold text-gray-700 mb-3">
            你想听什么故事？
          </label>
          
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="比如：小猫咪的冒险..."
            className="w-full px-child-md py-child-md text-child-base font-child border-2 border-child-blue-light/30 rounded-child focus:outline-none focus:border-child-blue focus:ring-2 focus:ring-child-blue-light/20 transition-all duration-200 placeholder:text-gray-400"
            disabled={isLoading}
          />

          {/* 模式选择 */}
          <div className="mt-4">
            <label className="block text-child-sm font-child font-semibold text-gray-700 mb-3">
              选择故事模式：
            </label>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => handleModeChange('progressive')}
                className={`flex-1 px-child-md py-child-sm text-child-xs font-child font-medium rounded-child transition-all duration-200 ${
                  storyMode === 'progressive'
                    ? 'bg-child-blue text-white shadow-child'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
                disabled={isLoading}
              >
                🎭 渐进式
              </button>
              <button
                type="button"
                onClick={() => handleModeChange('story-tree')}
                className={`flex-1 px-child-md py-child-sm text-child-xs font-child font-medium rounded-child transition-all duration-200 ${
                  storyMode === 'story-tree'
                    ? 'bg-child-green text-white shadow-child'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
                disabled={isLoading}
              >
                🌳 故事树
              </button>
            </div>
          </div>

          {/* 开始按钮 */}
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleStartStory}
            disabled={!topic.trim() || isLoading}
            className="w-full mt-6 px-child-lg py-child-md bg-gradient-to-r from-child-purple to-child-blue text-white text-child-base font-child font-semibold rounded-child shadow-child-lg hover:shadow-child-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
          >
            {isLoading ? (
              <span className="flex items-center justify-center">
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                准备故事中...
              </span>
            ) : (
              '✨ 开始故事冒险'
            )}
          </motion.button>
        </motion.div>

        {/* 示例主题 */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6, duration: 0.8 }}
          className="text-center"
        >
          <p className="text-child-xs text-white/70 font-child mb-3">
            或者选择一个推荐主题：
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {storyExamples.map((example, index) => (
              <motion.button
                key={example}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 1.3 + index * 0.1 }}
                onClick={() => handleExampleClick(example)}
                disabled={isLoading}
                className="px-child-md py-child-sm text-child-xs font-child font-medium bg-white/50 hover:bg-white/80 text-gray-600 rounded-child shadow-child hover:shadow-child-lg transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {example}
              </motion.button>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default HomePage;