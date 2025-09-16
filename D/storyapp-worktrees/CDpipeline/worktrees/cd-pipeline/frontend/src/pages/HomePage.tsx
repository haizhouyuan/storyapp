import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { BookOpenIcon, StarIcon, HomeIcon } from '@heroicons/react/24/outline';
import { toast } from 'react-hot-toast';

import Button from '../components/Button';
import { validateStoryTopic } from '../utils/helpers';
import type { StorySession, StoryTreeSession } from '../../../shared/types';

interface HomePageProps {
  onStartStory: (session: StorySession) => void;
  onStartStoryTree?: (session: StoryTreeSession) => void;
}

type StoryMode = 'progressive' | 'tree';

/**
 * 故事主题输入页（首页）
 * 特点：温馨背景、大输入框、醒目按钮、"我的故事"入口、故事模式选择
 */
export default function HomePage({ onStartStory, onStartStoryTree }: HomePageProps) {
  const [topic, setTopic] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [storyMode, setStoryMode] = useState<StoryMode>('progressive');
  const navigate = useNavigate();

  // 处理开始故事
  const handleStartStory = async () => {
    // 验证输入
    const validation = validateStoryTopic(topic);
    if (!validation.isValid) {
      toast.error(validation.error!);
      return;
    }

    setIsLoading(true);
    
    try {
      if (storyMode === 'tree') {
        // 故事树模式：导航到故事树页面，让页面自己生成故事树
        navigate('/story-tree', { state: { topic: topic.trim() } });
      } else {
        // 渐进模式：使用原有逻辑
        const maxChoices = Math.floor(Math.random() * 6) + 5; // 5-10 次
        const session: StorySession = {
          topic: topic.trim(),
          path: [],
          isComplete: false,
          startTime: Date.now(),
          maxChoices
        };

        onStartStory(session);
        navigate('/story');
      }
    } catch (error: any) {
      console.error('开始故事失败:', error);
      toast.error('故事启动失败，请稍后再试');
    } finally {
      setIsLoading(false);
    }
  };

  // 处理键盘事件
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isLoading) {
      handleStartStory();
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-child-lg relative overflow-hidden">
      {/* 背景装饰元素 */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* 漂浮的星星 */}
        {[...Array(8)].map((_, i) => (
          <motion.div
            key={i}
            initial={{ 
              opacity: 0.3,
              scale: 0,
              x: Math.random() * window.innerWidth,
              y: Math.random() * window.innerHeight
            }}
            animate={{
              opacity: [0.3, 0.8, 0.3],
              scale: [0.5, 1, 0.5],
              rotate: [0, 180, 360]
            }}
            transition={{
              duration: 3 + Math.random() * 2,
              repeat: Infinity,
              delay: i * 0.5
            }}
            className="absolute"
          >
            <StarIcon className="w-6 h-6 text-child-gold" />
          </motion.div>
        ))}

        {/* 彩色云朵 */}
        <motion.div
          animate={{ 
            x: [-100, window.innerWidth + 100],
            rotate: [0, 5, 0]
          }}
          transition={{ 
            duration: 20, 
            repeat: Infinity,
            ease: 'linear'
          }}
          className="absolute top-20 w-32 h-20 bg-white/20 rounded-full blur-sm"
        />
      </div>

      {/* "我的故事"入口 */}
      <motion.button
        initial={{ opacity: 0, scale: 0 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.5, type: 'spring' }}
        onClick={() => navigate('/my-stories')}
        className="
          absolute 
          top-child-xl 
          right-child-xl 
          w-16 h-16 
          bg-gradient-to-r from-child-purple to-child-pink 
          rounded-full 
          shadow-child-lg 
          hover:shadow-child-xl
          transition-all 
          duration-200
          flex 
          items-center 
          justify-center
          group
          z-20
        "
        data-testid="my-stories-button"
      >
        <BookOpenIcon className="w-8 h-8 text-white group-hover:scale-110 transition-transform" />
      </motion.button>

      {/* 主要内容 */}
      <div className="max-w-2xl mx-auto text-center z-10">
        {/* 欢迎插画 */}
        <motion.div
          initial={{ opacity: 0, y: -50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 100, damping: 10 }}
          className="mb-child-3xl"
        >
          {/* SVG卡通动物拿着故事书 */}
          <div className="w-48 h-48 mx-auto mb-child-xl">
            <svg viewBox="0 0 200 200" className="w-full h-full">
              {/* 小熊身体 */}
              <motion.circle
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, type: 'spring' }}
                cx="100"
                cy="120"
                r="45"
                fill="#FFB3BA"
              />
              
              {/* 小熊头部 */}
              <motion.circle
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.3, type: 'spring' }}
                cx="100"
                cy="75"
                r="35"
                fill="#FFB3BA"
              />
              
              {/* 小熊耳朵 */}
              <motion.circle
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.4, type: 'spring' }}
                cx="85"
                cy="55"
                r="12"
                fill="#FF9FA5"
              />
              <motion.circle
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.4, type: 'spring' }}
                cx="115"
                cy="55"
                r="12"
                fill="#FF9FA5"
              />
              
              {/* 故事书 */}
              <motion.rect
                initial={{ scale: 0, rotate: -10 }}
                animate={{ scale: 1, rotate: -10 }}
                transition={{ delay: 0.5, type: 'spring' }}
                x="70"
                y="140"
                width="60"
                height="40"
                rx="5"
                fill="#4ECDC4"
              />
              
              {/* 书页线条 */}
              <motion.line
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ delay: 1, duration: 0.5 }}
                x1="80"
                y1="150"
                x2="120"
                y2="150"
                stroke="#fff"
                strokeWidth="2"
              />
              <motion.line
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ delay: 1.2, duration: 0.5 }}
                x1="80"
                y1="160"
                x2="115"
                y2="160"
                stroke="#fff"
                strokeWidth="2"
              />
              
              {/* 小熊眼睛 */}
              <circle cx="92" cy="70" r="3" fill="#333" />
              <circle cx="108" cy="70" r="3" fill="#333" />
              
              {/* 小熊嘴巴 */}
              <motion.path
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ delay: 1.5, duration: 0.3 }}
                d="M 95 85 Q 100 90 105 85"
                stroke="#333"
                strokeWidth="2"
                fill="none"
                strokeLinecap="round"
              />
            </svg>
          </div>
        </motion.div>

        {/* 标题 */}
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="
            font-child 
            font-bold 
            text-child-4xl 
            text-gray-800 
            mb-child-lg
            bg-gradient-to-r 
            from-child-blue 
            to-child-green 
            bg-clip-text 
            text-transparent
          "
        >
          睡前故事时间
        </motion.h1>

        {/* 副标题 */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
          className="
            font-child 
            text-child-lg 
            text-gray-600 
            mb-child-3xl
            max-w-lg 
            mx-auto
          "
        >
          告诉我你想听什么故事，我们一起创作一个神奇的冒险吧！
        </motion.p>

        {/* 故事模式选择 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.75 }}
          className="mb-child-2xl"
        >
          <p className="text-child-base font-child font-medium text-gray-700 mb-child-md text-center">
            选择故事体验模式
          </p>
          
          <div className="flex justify-center gap-child-md">
            {/* 故事树模式 */}
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setStoryMode('tree')}
              className={`
                px-child-lg py-child-md rounded-child-lg border-2 transition-all duration-200
                ${storyMode === 'tree' 
                  ? 'bg-child-blue text-white border-child-blue shadow-child-lg' 
                  : 'bg-white text-gray-700 border-gray-300 shadow-child hover:border-child-blue/50'
                }
              `}
            >
              <div className="text-center">
                <div className="text-child-base font-semibold mb-1">故事树模式</div>
                <div className="text-child-xs">
                  {storyMode === 'tree' ? '✨ 推荐模式' : '3轮选择·预生成'}
                </div>
              </div>
            </motion.button>

            {/* 渐进模式 */}
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setStoryMode('progressive')}
              className={`
                px-child-lg py-child-md rounded-child-lg border-2 transition-all duration-200
                ${storyMode === 'progressive' 
                  ? 'bg-child-green text-white border-child-green shadow-child-lg' 
                  : 'bg-white text-gray-700 border-gray-300 shadow-child hover:border-child-green/50'
                }
              `}
            >
              <div className="text-center">
                <div className="text-child-base font-semibold mb-1">经典模式</div>
                <div className="text-child-xs">
                  {storyMode === 'progressive' ? '🎯 传统体验' : '实时生成·灵活'}
                </div>
              </div>
            </motion.button>
          </div>
        </motion.div>

        {/* 主题输入区域 */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
          className="mb-child-3xl"
        >
          {/* 输入框容器 */}
          <div className="relative mb-child-xl">
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="请输入你想听的故事主题..."
              disabled={isLoading}
              autoFocus
              tabIndex={1}
              data-testid="topic-input"
              className="
                w-full
                px-child-xl
                py-child-lg
                text-child-lg
                font-child
                font-semibold
                text-gray-800
                bg-white
                border-4
                border-child-blue/30
                rounded-child-xl
                shadow-child-lg
                focus:outline-none
                focus:border-child-blue
                focus:ring-4
                focus:ring-child-blue/20
                focus:shadow-child-xl
                transition-all
                duration-200
                placeholder-gray-400
                disabled:opacity-60
                disabled:cursor-not-allowed
              "
              maxLength={100}
            />
            
            {/* 魔法棒图标 */}
            <div className="absolute right-child-md top-1/2 transform -translate-y-1/2">
              <motion.div
                animate={{ rotate: [0, 10, -10, 0] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                <svg viewBox="0 0 24 24" className="w-8 h-8 text-child-gold">
                  <path
                    fill="currentColor"
                    d="M7.5,5.6L5,7L6.4,4.5L5,2L7.5,3.4L10,2L8.6,4.5L10,7L7.5,5.6M19.5,15.4L22,14L20.6,16.5L22,19L19.5,17.6L17,19L18.4,16.5L17,14L19.5,15.4M22,2L20.6,4.5L22,7L19.5,5.6L17,7L18.4,4.5L17,2L19.5,3.4L22,2M13.34,12.78L15.78,10.34L13.66,8.22L11.22,10.66L13.34,12.78M14.37,7.29L16.71,9.63C17.1,10.02 17.1,10.65 16.71,11.04L5.04,22.71C4.65,23.1 4.02,23.1 3.63,22.71L1.29,20.37C0.9,19.98 0.9,19.35 1.29,18.96L12.96,7.29C13.35,6.9 13.98,6.9 14.37,7.29Z"
                  />
                </svg>
              </motion.div>
            </div>
          </div>

          {/* 字符计数 */}
          <div className="text-right text-child-xs text-gray-400 mb-child-lg">
            {topic.length}/100
          </div>

          {/* 开始按钮 */}
          <Button
            onClick={handleStartStory}
            disabled={!topic.trim() || isLoading}
            loading={isLoading}
            variant="primary"
            size="large"
            icon={!isLoading && <HomeIcon className="w-6 h-6" />}
            testId="start-story-button"
            tabIndex={2}
            className="w-full max-w-xs"
          >
            {isLoading ? '正在准备...' : '开始讲故事'}
          </Button>
        </motion.div>

        {/* 示例主题提示 */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2 }}
          className="text-center"
        >
          <p className="text-child-sm text-gray-500 mb-child-sm">
            试试这些主题：
          </p>
          <div className="flex flex-wrap justify-center gap-child-sm">
            {[
              '小兔子的冒险',
              '神奇的森林',
              '月亮上的旅行',
              '彩虹城堡',
              '友善的小龙'
            ].map((example, index) => (
              <motion.button
                key={example}
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 1.3 + index * 0.1 }}
                onClick={() => setTopic(example)}
                disabled={isLoading}
                className="
                  px-child-md 
                  py-child-sm 
                  text-child-xs 
                  font-child 
                  font-medium
                  bg-white/50 
                  hover:bg-white/80
                  text-gray-600
                  rounded-child
                  shadow-child
                  hover:shadow-child-lg
                  transition-all 
                  duration-200
                  disabled:opacity-60
                  disabled:cursor-not-allowed
                "
              >
                {example}
              </motion.button>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
