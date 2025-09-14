import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import { HomeIcon, SpeakerWaveIcon } from '@heroicons/react/24/outline';
import { toast } from 'react-hot-toast';

import Button from '../components/Button';
import LoadingSpinner from '../components/LoadingSpinner';
import { generateFullStoryTree } from '../utils/api';
import { getRandomEncouragement } from '../utils/helpers';
import type { StoryTree, StoryTreeNode } from '../../../shared/types';

/**
 * 故事树互动页面
 * 特点：预生成完整故事树，3轮选择，每轮2个选项
 */
export default function StoryTreePage() {
  const [storyTree, setStoryTree] = useState<StoryTree | null>(null);
  const [currentNode, setCurrentNode] = useState<StoryTreeNode | null>(null);
  const [currentPath, setCurrentPath] = useState<number[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  
  const navigate = useNavigate();
  const location = useLocation();
  const topic = location.state?.topic;

  // 生成完整故事树
  const generateStoryTree = useCallback(async () => {
    if (!topic) return;

    setIsGenerating(true);
    try {
      console.log('开始生成故事树:', topic);
      
      const response = await generateFullStoryTree({ topic });
      
      if (response.success && response.storyTree) {
        setStoryTree(response.storyTree);
        setCurrentNode(response.storyTree.root);
        setHasStarted(true);
        toast.success('故事准备完毕！');
      } else {
        throw new Error(response.message || '故事树生成失败');
      }
    } catch (error: any) {
      console.error('生成故事树失败:', error);
      toast.error(error.message || '故事生成失败，请返回重试');
      
      // 延迟后返回首页
      setTimeout(() => {
        navigate('/');
      }, 3000);
    } finally {
      setIsGenerating(false);
    }
  }, [topic, navigate]);

  // 如果没有主题，重定向到首页
  useEffect(() => {
    if (!topic) {
      navigate('/');
      return;
    }
    
    // 开始生成故事树
    generateStoryTree();
  }, [topic, generateStoryTree, navigate]);

  // 处理选择
  const handleChoice = (choiceIndex: number) => {
    if (!currentNode || !storyTree || currentNode.isEnding) return;

    const newPath = [...currentPath, choiceIndex];
    setCurrentPath(newPath);

    // 找到对应的子节点
    const nextNode = currentNode.children?.[choiceIndex];
    if (nextNode) {
      setCurrentNode(nextNode);
      
      if (nextNode.isEnding) {
        // 故事结束
        toast.success('故事完成了！', { icon: '🎉' });
        
        // 延迟后跳转到结束页面
        setTimeout(() => {
          navigate('/end', { 
            state: { 
              topic,
              storyTree,
              finalPath: newPath
            }
          });
        }, 2000);
      } else {
        // 继续故事
        toast.success(getRandomEncouragement(), {
          duration: 1500,
          icon: '⭐'
        });
      }
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

  // 获取当前进度
  const getCurrentProgress = () => {
    return `${currentPath.length} / 3`;
  };

  // 获取进度描述
  const getProgressDescription = () => {
    if (currentPath.length === 0) return '开始你的冒险';
    if (currentPath.length === 1) return '第一个选择已做出';
    if (currentPath.length === 2) return '第二个选择已做出';
    if (currentPath.length === 3) return '即将到达结局';
    return '';
  };

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
            {topic}
          </h1>
          <p className="mt-child-sm text-child-sm text-gray-600">
            进度：{getCurrentProgress()} · {getProgressDescription()}
          </p>
        </div>

        <div className="w-24" /> {/* 占位，保持标题居中 */}
      </div>

      {/* 主要内容区域 */}
      <div className="max-w-4xl mx-auto">
        {/* 故事树生成中的加载状态 */}
        {isGenerating && (
          <div className="text-center">
            <LoadingSpinner 
              message="正在为你创作完整的故事树，请稍等片刻..."
              size="large"
            />
            <p className="mt-child-lg text-child-base text-gray-600">
              我们正在生成包含3轮选择、4种不同结局的完整故事
            </p>
          </div>
        )}

        {/* 故事展示区域 */}
        {hasStarted && currentNode && (
          <AnimatePresence mode="wait">
            <motion.div
              key={`${currentPath.join('-')}`}
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
                  <p 
                    data-testid="story-content"
                    className="
                      font-child 
                      text-child-lg 
                      text-gray-800 
                      leading-relaxed
                      whitespace-pre-wrap
                    "
                  >
                    {currentNode.segment}
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
                    {/* 动态图标根据进度变化 */}
                    <svg viewBox="0 0 100 100" className="w-full h-full opacity-30">
                      {currentPath.length === 0 && (
                        // 开始：笑脸
                        <>
                          <circle cx="50" cy="50" r="30" fill="#FFB3BA" />
                          <circle cx="40" cy="40" r="3" fill="#333" />
                          <circle cx="60" cy="40" r="3" fill="#333" />
                          <path d="M 35 60 Q 50 70 65 60" stroke="#333" strokeWidth="2" fill="none" />
                        </>
                      )}
                      {currentPath.length === 1 && (
                        // 第一选择：思考脸
                        <>
                          <circle cx="50" cy="50" r="30" fill="#BAFFC9" />
                          <circle cx="40" cy="40" r="3" fill="#333" />
                          <circle cx="60" cy="40" r="3" fill="#333" />
                          <circle cx="50" cy="60" r="2" fill="#333" />
                        </>
                      )}
                      {currentPath.length === 2 && (
                        // 第二选择：惊喜脸
                        <>
                          <circle cx="50" cy="50" r="30" fill="#BAE1FF" />
                          <ellipse cx="40" cy="40" rx="2" ry="4" fill="#333" />
                          <ellipse cx="60" cy="40" rx="2" ry="4" fill="#333" />
                          <ellipse cx="50" cy="60" rx="8" ry="4" fill="#333" />
                        </>
                      )}
                      {currentPath.length >= 3 && (
                        // 结局：开心脸
                        <>
                          <circle cx="50" cy="50" r="30" fill="#FFFBBA" />
                          <path d="M 35 35 L 45 45 M 45 35 L 35 45" stroke="#333" strokeWidth="2" />
                          <path d="M 55 35 L 65 45 M 65 35 L 55 45" stroke="#333" strokeWidth="2" />
                          <path d="M 30 65 Q 50 80 70 65" stroke="#333" strokeWidth="3" fill="none" />
                        </>
                      )}
                    </svg>
                  </motion.div>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        )}

        {/* 选择按钮区域 */}
        {hasStarted && currentNode && currentNode.choices.length > 0 && !currentNode.isEnding && (
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
                选择一个你喜欢的方向（第 {currentPath.length + 1} 次选择）
              </p>
            </div>

            {/* 选择按钮 */}
            <div className="grid gap-child-lg max-w-2xl mx-auto">
              {currentNode.choices.map((choice, index) => (
                <motion.div
                  key={`${choice}-${index}`}
                  initial={{ opacity: 0, x: index % 2 === 0 ? -50 : 50 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.7 + index * 0.1, type: 'spring' }}
                >
                  <Button
                    onClick={() => handleChoice(index)}
                    variant={index === 0 ? 'primary' : 'secondary'}
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

        {/* 结局提示 */}
        {hasStarted && currentNode && currentNode.isEnding && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 1, type: 'spring' }}
            className="text-center mt-child-xl"
          >
            <div className="bg-gradient-to-r from-child-gold to-child-orange text-white px-child-2xl py-child-lg rounded-child-xl shadow-child-xl inline-block">
              <h3 className="font-child font-bold text-child-lg mb-child-sm">
                🎉 故事结束啦！
              </h3>
              <p className="font-child text-child-base">
                这是你的专属结局，希望你喜欢这个故事！
              </p>
            </div>
          </motion.div>
        )}
      </div>

      {/* 背景装饰 */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10">
        {/* 漂浮的气泡 */}
        {[...Array(6)].map((_, i) => (
          <motion.div
            key={i}
            initial={{ 
              x: Math.random() * (typeof window !== 'undefined' ? window.innerWidth : 1000),
              y: (typeof window !== 'undefined' ? window.innerHeight : 800) + 50
            }}
            animate={{
              y: -50,
              x: Math.random() * (typeof window !== 'undefined' ? window.innerWidth : 1000)
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