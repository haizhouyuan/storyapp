import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { HomeIcon, SpeakerWaveIcon } from '@heroicons/react/24/outline';
import { toast } from 'react-hot-toast';

import Button from '../components/Button';
import LoadingSpinner from '../components/LoadingSpinner';
import { generateStory } from '../utils/api';
import { getRandomEncouragement } from '../utils/helpers';
import type { StorySession } from '../../../shared/types';

interface StoryPageProps {
  storySession: StorySession | null;
  onUpdateSession: (session: StorySession) => void;
}

/**
 * 故事互动页面
 * 特点：故事展示区、3个选择按钮、语音播放、返回首页
 */
export default function StoryPage({ storySession, onUpdateSession }: StoryPageProps) {
  const [currentSegment, setCurrentSegment] = useState('');
  const [currentChoices, setCurrentChoices] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  
  const navigate = useNavigate();

  // 如果没有故事会话，重定向到首页
  useEffect(() => {
    if (!storySession) {
      navigate('/');
      return;
    }

    // 如果故事已完成，跳转到结束页
    if (storySession.isComplete) {
      navigate('/end');
      return;
    }

    // 如果故事刚开始，生成第一段
    if (storySession.path.length === 0) {
      generateFirstSegment();
    } else {
      // 显示最后一段故事和选择
      const lastPath = storySession.path[storySession.path.length - 1];
      setCurrentSegment(lastPath.segment);
      // 这里需要重新生成选择，实际项目中应该保存选择到session中
      setHasStarted(true);
    }
  }, [storySession]);

  // 生成第一段故事
  const generateFirstSegment = async () => {
    if (!storySession) return;

    setIsLoading(true);
    try {
      const response = await generateStory({
        topic: storySession.topic,
        turnIndex: 0,
        maxChoices: storySession.maxChoices,
        forceEnding: false
      });

      setCurrentSegment(response.storySegment);
      setCurrentChoices(response.choices);
      setHasStarted(true);

      // 更新会话
      const updatedSession: StorySession = {
        ...storySession,
        path: [
          {
            segment: response.storySegment,
            timestamp: Date.now()
          }
        ]
      };
      onUpdateSession(updatedSession);

      if (response.isEnding) {
        // 如果AI认为这就是结尾，标记为完成
        setTimeout(() => {
          const completedSession = { ...updatedSession, isComplete: true };
          onUpdateSession(completedSession);
          navigate('/end');
        }, 2000);
      }
    } catch (error: any) {
      console.error('生成故事失败:', error);
      toast.error(error.message || '故事生成失败，请返回重试');
    } finally {
      setIsLoading(false);
    }
  };

  // 处理选择
  const handleChoice = async (choice: string, choiceIndex: number) => {
    if (!storySession || isLoading) return;

    setIsLoading(true);
    setCurrentChoices([]); // 清除当前选择

    try {
      // 构造当前故事内容
      const currentStory = storySession.path.map(p => p.segment).join('\n\n');

      const choicesMade = storySession.path.filter(p => p.choice).length; // 已做的选择次数
      const nextTurnIndex = choicesMade; // 本次提交后要生成的片段属于第 choicesMade+1 次互动，但从0开始传入
      const willForceEnd = nextTurnIndex + 1 >= storySession.maxChoices; // 达到上限则结尾

      const response = await generateStory({
        topic: storySession.topic,
        currentStory,
        selectedChoice: choice,
        turnIndex: nextTurnIndex,
        maxChoices: storySession.maxChoices,
        forceEnding: willForceEnd
      });

      // 显示新故事片段
      setCurrentSegment(response.storySegment);
      
      if (response.isEnding) {
        // 故事结束
        const updatedSession: StorySession = {
          ...storySession,
          path: [
            ...storySession.path.slice(0, -1), // 移除最后一个没有选择的片段
            {
              ...storySession.path[storySession.path.length - 1],
              choice // 添加用户选择
            },
            {
              segment: response.storySegment,
              timestamp: Date.now()
            }
          ],
          isComplete: true
        };
        
        onUpdateSession(updatedSession);
        
        // 延迟跳转到结束页面
        setTimeout(() => {
          navigate('/end');
        }, 3000);
        
        toast.success('故事完成了！', {
          icon: '🎉'
        });
      } else {
        // 继续故事
        setCurrentChoices(response.choices);
        
        const updatedSession: StorySession = {
          ...storySession,
          path: [
            ...storySession.path.slice(0, -1), // 移除最后一个没有选择的片段
            {
              ...storySession.path[storySession.path.length - 1],
              choice // 添加用户选择
            },
            {
              segment: response.storySegment,
              timestamp: Date.now()
            }
          ]
        };
        
        onUpdateSession(updatedSession);
        
        // 显示鼓励消息
        toast.success(getRandomEncouragement(), {
          duration: 2000,
          icon: '⭐'
        });
      }
    } catch (error: any) {
      console.error('生成故事片段失败:', error);
      toast.error(error.message || '故事继续失败，请重试');
      
      // 恢复选择按钮
      setCurrentChoices(currentChoices);
    } finally {
      setIsLoading(false);
    }
  };

  // 返回首页
  const handleGoHome = () => {
    navigate('/');
  };

  // 播放语音（占位功能）
  const handlePlayAudio = () => {
    toast('语音播放功能即将上线！', {
      icon: '🔊'
    });
  };

  if (!storySession) {
    return null; // 会重定向到首页
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-child-cream via-child-mint to-child-blue p-child-lg">
      {/* 顶部导航 */}
      <div className="flex justify-between items-center mb-child-xl">
        {/* 返回首页按钮 */}
        <Button
          onClick={handleGoHome}
          variant="secondary"
          size="small"
          icon={<HomeIcon className="w-5 h-5" />}
          className="!min-h-[48px]"
          testId="home-button"
        >
          返回首页
        </Button>

        {/* 故事主题标题 */}
        <div className="flex-1 text-center mx-child-lg">
          <h1 className="
            font-child 
            font-bold 
            text-child-xl 
            text-gray-800
            bg-white/80
            px-child-lg
            py-child-sm
            rounded-child
            shadow-child
          ">
            {storySession.topic}
          </h1>
          <p className="mt-child-sm text-child-sm text-gray-600">
            进度：第 {storySession.path.filter(p => p.choice).length + (hasStarted ? 0 : 0)} / {storySession.maxChoices} 次互动
          </p>
        </div>

        <div className="w-24" /> {/* 占位，保持标题居中 */}
      </div>

      {/* 主要内容区域 */}
      <div className="max-w-4xl mx-auto">
        {/* 加载状态 */}
        {isLoading && !hasStarted && (
          <div className="text-center">
            <LoadingSpinner 
              message="正在为你创作精彩的故事..."
              size="large"
            />
          </div>
        )}

        {/* 故事展示区域 */}
        {hasStarted && (
          <AnimatePresence mode="wait">
            <motion.div
              key={currentSegment}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -30 }}
              transition={{ type: 'spring', stiffness: 100, damping: 15 }}
              className="mb-child-3xl"
            >
              {/* 故事卡片 */}
              <div className="
                bg-white 
                rounded-child-xl 
                shadow-child-xl 
                p-child-3xl 
                relative
                border-4
                border-white/50
              ">
                {/* 语音播放按钮 */}
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={handlePlayAudio}
                  className="
                    absolute 
                    top-child-lg 
                    right-child-lg 
                    w-12 h-12 
                    bg-gradient-to-r from-child-green to-child-blue 
                    rounded-full 
                    shadow-child
                    hover:shadow-child-lg
                    flex 
                    items-center 
                    justify-center
                    transition-all
                    duration-200
                  "
                  title="播放语音"
                >
                  <SpeakerWaveIcon className="w-6 h-6 text-white" />
                </motion.button>

                {/* 故事文本 */}
                <div className="pr-child-xl">
                  <p className="
                    font-child 
                    text-child-lg 
                    text-gray-800 
                    leading-relaxed
                    whitespace-pre-wrap
                  ">
                    {currentSegment}
                  </p>
                </div>

                {/* 装饰性插画区域 */}
                <div className="mt-child-lg flex justify-center">
                  <motion.div
                    animate={{ 
                      rotate: [0, 5, -5, 0],
                      scale: [1, 1.05, 1]
                    }}
                    transition={{ 
                      duration: 4, 
                      repeat: Infinity,
                      ease: 'easeInOut'
                    }}
                    className="w-24 h-24"
                  >
                    {/* 简单的装饰图标 */}
                    <svg viewBox="0 0 100 100" className="w-full h-full opacity-30">
                      <circle cx="50" cy="50" r="30" fill="#FFB3BA" />
                      <circle cx="40" cy="40" r="5" fill="#333" />
                      <circle cx="60" cy="40" r="5" fill="#333" />
                      <path d="M 35 65 Q 50 75 65 65" stroke="#333" strokeWidth="2" fill="none" />
                    </svg>
                  </motion.div>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        )}

        {/* 选择按钮区域 */}
        {hasStarted && currentChoices.length > 0 && !isLoading && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="space-y-child-lg"
          >
            <div className="text-center mb-child-xl">
              <h2 className="
                font-child 
                font-bold 
                text-child-xl 
                text-gray-700
              ">
                接下来会发生什么呢？
              </h2>
              <p className="
                font-child 
                text-child-base 
                text-gray-500 
                mt-child-sm
              ">
                选择一个你喜欢的方向
              </p>
            </div>

            {/* 选择按钮 */}
            <div className="grid gap-child-lg max-w-2xl mx-auto">
              {currentChoices.map((choice, index) => (
                <motion.div
                  key={`${choice}-${index}`}
                  initial={{ opacity: 0, x: index % 2 === 0 ? -50 : 50 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.7 + index * 0.1, type: 'spring' }}
                >
                  <Button
                    onClick={() => handleChoice(choice, index)}
                    variant={index === 0 ? 'primary' : index === 1 ? 'secondary' : 'accent'}
                    size="large"
                    className="w-full text-left justify-start !py-child-lg"
                    testId={`choice-button-${index}`}
                  >
                    <span className="flex items-center">
                      <span className="
                        flex-shrink-0 
                        w-8 h-8 
                        bg-white/30 
                        rounded-full 
                        flex 
                        items-center 
                        justify-center 
                        mr-child-md
                        font-bold
                      ">
                        {index + 1}
                      </span>
                      <span>{choice}</span>
                    </span>
                  </Button>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}

        {/* 继续生成时的加载状态 */}
        {isLoading && hasStarted && (
          <div className="text-center mt-child-xl">
            <LoadingSpinner 
              message="故事正在继续..."
              size="medium"
            />
          </div>
        )}
      </div>

      {/* 背景装饰 */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10">
        {/* 漂浮的气泡 */}
        {[...Array(6)].map((_, i) => (
          <motion.div
            key={i}
            initial={{ 
              x: Math.random() * window.innerWidth,
              y: window.innerHeight + 50
            }}
            animate={{
              y: -50,
              x: Math.random() * window.innerWidth
            }}
            transition={{
              duration: 8 + Math.random() * 4,
              repeat: Infinity,
              delay: i * 2
            }}
            className="absolute w-4 h-4 bg-white/20 rounded-full"
          />
        ))}
      </div>
    </div>
  );
}
