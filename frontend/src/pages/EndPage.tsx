import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  HeartIcon, 
  BookOpenIcon, 
  HomeIcon,
  SparklesIcon 
} from '@heroicons/react/24/outline';
import { toast } from 'react-hot-toast';

import Button from '../components/Button';
import { saveStory } from '../utils/api';
import { generateStoryContent, extractStoryTitle } from '../utils/helpers';
import type { StorySession, StoryTree } from '../../../shared/types';

interface EndPageProps {
  storySession: StorySession | null;
  onResetSession: () => void;
}

// 故事树模式传入的数据接口
interface StoryTreeEndState {
  topic: string;
  storyTree: StoryTree;
  finalPath: number[];
}

/**
 * 故事结束页面
 * 支持两种模式：
 * 1. 渐进式故事模式 (storySession)
 * 2. 故事树模式 (location.state)
 */
export default function EndPage({ storySession, onResetSession }: EndPageProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  
  // 获取故事树模式传入的数据
  const storyTreeData = location.state as StoryTreeEndState | undefined;

  // 检查数据有效性并处理重定向
  useEffect(() => {
    const hasValidSession = storySession && storySession.isComplete;
    const hasValidTreeData = storyTreeData && storyTreeData.topic && storyTreeData.storyTree && storyTreeData.finalPath;
    
    if (!hasValidSession && !hasValidTreeData) {
      navigate('/');
      return;
    }
  }, [storySession, storyTreeData, navigate]);

  // 保存故事 - 支持两种模式
  const handleSaveStory = async () => {
    if (isSaving || isSaved) return;

    setIsSaving(true);
    
    try {
      let storyContent: string;
      let storyTitle: string;

      if (storySession) {
        // 渐进式故事模式
        storyContent = generateStoryContent(storySession);
        storyTitle = extractStoryTitle(storyContent, storySession.topic);
      } else if (storyTreeData) {
        // 故事树模式 - 生成完整故事内容
        const fullStoryContent = generateStoryTreeContent(storyTreeData);
        storyContent = JSON.stringify(fullStoryContent);
        storyTitle = extractStoryTitle(fullStoryContent.fullStory, storyTreeData.topic);
      } else {
        throw new Error('没有有效的故事数据');
      }

      const response = await saveStory({
        title: storyTitle,
        content: storyContent
      });

      if (response.success) {
        setIsSaved(true);
        toast.success('故事已保存到"我的故事"中！', {
          duration: 4000,
          icon: '💾'
        });
      }
    } catch (error: any) {
      console.error('保存故事失败:', error);
      toast.error(error.message || '保存故事失败，请稍后重试');
    } finally {
      setIsSaving(false);
    }
  };

  // 从故事树生成完整故事内容
  const generateStoryTreeContent = (treeData: StoryTreeEndState) => {
    const { storyTree, finalPath, topic } = treeData;
    let fullStorySegments: string[] = [];
    let currentNode = storyTree.root;
    
    // 添加开始节点
    fullStorySegments.push(currentNode.segment);
    
    // 根据选择路径收集故事片段
    for (let i = 0; i < finalPath.length; i++) {
      const choiceIndex = finalPath[i];
      if (currentNode.children && currentNode.children[choiceIndex]) {
        currentNode = currentNode.children[choiceIndex];
        fullStorySegments.push(currentNode.segment);
      }
    }
    
    return {
      topic,
      mode: 'story-tree',
      fullStory: fullStorySegments.join('\n\n'),
      path: finalPath,
      storyTreeId: storyTree.id,
      totalSegments: fullStorySegments.length,
      created_at: new Date().toISOString()
    };
  };

  // 返回首页
  const handleGoHome = () => {
    onResetSession();
    navigate('/');
  };

  // 查看我的故事
  const handleViewMyStories = () => {
    onResetSession();
    navigate('/my-stories');
  };

  // 开始新故事
  const handleNewStory = () => {
    onResetSession();
    navigate('/');
  };

  // 如果两种模式都没有有效数据，返回null等待重定向
  if ((!storySession || !storySession.isComplete) && !storyTreeData) {
    return null;
  }

  // 计算故事统计信息 - 支持两种模式
  let storyDuration = 0;
  let choiceCount = 0;
  let segmentCount = 0;
  // let currentTopic = '';

  if (storySession) {
    // 渐进式故事模式
    storyDuration = Math.round((Date.now() - storySession.startTime) / 1000 / 60);
    choiceCount = storySession.path.filter(p => p.choice).length;
    segmentCount = storySession.path.length;
    // currentTopic = storySession.topic;
  } else if (storyTreeData) {
    // 故事树模式
    storyDuration = 5; // 估算值，因为故事树模式通常较快
    choiceCount = storyTreeData.finalPath.length;
    segmentCount = storyTreeData.finalPath.length + 1; // 包含开始节点
    // currentTopic = storyTreeData.topic;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-child-gold/30 via-child-cream to-child-mint p-child-lg overflow-hidden">
      {/* 庆祝背景动画 */}
      <div className="fixed inset-0 pointer-events-none">
        {/* 飘落的星星 */}
        {[...Array(20)].map((_, i) => (
          <motion.div
            key={i}
            initial={{ 
              y: -50, 
              x: Math.random() * window.innerWidth,
              rotate: 0,
              opacity: 0
            }}
            animate={{ 
              y: window.innerHeight + 50, 
              rotate: 360,
              opacity: [0, 1, 1, 0]
            }}
            transition={{ 
              duration: 3 + Math.random() * 2, 
              delay: Math.random() * 5,
              repeat: Infinity
            }}
            className="absolute"
          >
            <SparklesIcon className="w-6 h-6 text-child-gold" />
          </motion.div>
        ))}

        {/* 彩色气泡 */}
        {[...Array(10)].map((_, i) => (
          <motion.div
            key={`bubble-${i}`}
            initial={{ 
              y: window.innerHeight + 50,
              x: Math.random() * window.innerWidth,
              scale: 0
            }}
            animate={{ 
              y: -50,
              scale: [0, 1, 1, 0],
              x: Math.random() * window.innerWidth
            }}
            transition={{ 
              duration: 4 + Math.random() * 2,
              delay: Math.random() * 3,
              repeat: Infinity
            }}
            className={`
              absolute 
              w-8 h-8 
              rounded-full 
              ${i % 3 === 0 ? 'bg-child-blue/30' : 
                i % 3 === 1 ? 'bg-child-green/30' : 'bg-child-pink/30'}
            `}
          />
        ))}
      </div>

      {/* 主要内容 */}
      <div className="max-w-4xl mx-auto text-center relative z-10">
        {/* 完结插画 */}
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 100, damping: 10, delay: 0.2 }}
          className="mb-child-3xl"
        >
          <div className="w-64 h-64 mx-auto">
            <svg viewBox="0 0 200 200" className="w-full h-full">
              {/* 夜空背景 */}
              <motion.circle
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.5, type: 'spring' }}
                cx="100"
                cy="100"
                r="90"
                fill="url(#nightGradient)"
              />
              
              {/* 月亮 */}
              <motion.circle
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.7, type: 'spring' }}
                cx="130"
                cy="70"
                r="25"
                fill="#FFF8DC"
              />
              
              {/* 小熊睡觉 */}
              <motion.g
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.9, type: 'spring' }}
              >
                {/* 床 */}
                <rect x="60" y="140" width="80" height="20" rx="10" fill="#8B4513" />
                
                {/* 被子 */}
                <ellipse cx="100" cy="130" rx="35" ry="15" fill="#FFB3BA" />
                
                {/* 小熊头部 */}
                <circle cx="100" cy="120" r="20" fill="#DEB887" />
                
                {/* 小熊耳朵 */}
                <circle cx="90" cy="105" r="8" fill="#D2B48C" />
                <circle cx="110" cy="105" r="8" fill="#D2B48C" />
                
                {/* 睡眠眼睛 */}
                <path d="M 92 118 Q 96 122 100 118" stroke="#333" strokeWidth="2" fill="none" />
                <path d="M 100 118 Q 104 122 108 118" stroke="#333" strokeWidth="2" fill="none" />
                
                {/* Z字母表示睡觉 */}
                <motion.g
                  animate={{ 
                    opacity: [0.3, 1, 0.3],
                    y: [0, -5, 0]
                  }}
                  transition={{ 
                    duration: 2, 
                    repeat: Infinity 
                  }}
                >
                  <text x="140" y="85" fontSize="14" fill="#4ECDC4" fontWeight="bold">Z</text>
                  <text x="145" y="70" fontSize="12" fill="#4ECDC4" fontWeight="bold">Z</text>
                  <text x="150" y="60" fontSize="10" fill="#4ECDC4" fontWeight="bold">Z</text>
                </motion.g>
              </motion.g>
              
              {/* 星星 */}
              {[...Array(6)].map((_, i) => (
                <motion.g
                  key={i}
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ 
                    scale: [0, 1, 1],
                    opacity: [0, 1, 0.7],
                    rotate: [0, 180]
                  }}
                  transition={{ 
                    delay: 1 + i * 0.2, 
                    duration: 0.5,
                    rotate: { duration: 4, repeat: Infinity }
                  }}
                >
                  <SparklesIcon 
                    x={30 + (i % 3) * 40} 
                    y={30 + Math.floor(i / 3) * 30} 
                    width="12" 
                    height="12" 
                    className="text-child-gold"
                  />
                </motion.g>
              ))}
              
              {/* 渐变定义 */}
              <defs>
                <radialGradient id="nightGradient">
                  <stop offset="0%" stopColor="#1e3a8a" />
                  <stop offset="100%" stopColor="#312e81" />
                </radialGradient>
              </defs>
            </svg>
          </div>
        </motion.div>

        {/* 庆祝标题 */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.2 }}
          className="mb-child-3xl"
        >
          <h1 className="
            font-child 
            font-bold 
            text-child-4xl 
            text-gray-800 
            mb-child-lg
          ">
            🎉 故事完结啦！🎉
          </h1>
          
          <p className="
            font-child 
            text-child-lg 
            text-gray-600 
            mb-child-lg
          ">
            你创造了一个精彩的冒险故事！
          </p>
          
          {/* 故事统计 */}
          <div className="
            bg-white/80 
            rounded-child-lg 
            p-child-lg 
            shadow-child 
            max-w-md 
            mx-auto
          ">
            <div className="flex justify-around text-center">
              <div>
                <div className="text-child-2xl font-bold text-child-blue">
                  {choiceCount}
                </div>
                <div className="text-child-sm text-gray-600">个选择</div>
              </div>
              <div>
                <div className="text-child-2xl font-bold text-child-green">
                  {storyDuration}
                </div>
                <div className="text-child-sm text-gray-600">分钟</div>
              </div>
              <div>
                <div className="text-child-2xl font-bold text-child-orange">
                  {segmentCount}
                </div>
                <div className="text-child-sm text-gray-600">段落</div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* 操作按钮区域 */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.5 }}
          className="space-y-child-lg max-w-lg mx-auto"
        >
          {/* 保存故事按钮 */}
          {!isSaved && (
            <Button
              onClick={handleSaveStory}
              loading={isSaving}
              disabled={isSaving}
              variant="warning"
              size="large"
              icon={!isSaving && <HeartIcon className="w-6 h-6" />}
              className="w-full animate-pulse-glow"
              testId="save-story-button"
            >
              {isSaving ? '正在保存...' : '保存到我的故事'}
            </Button>
          )}

          {/* 已保存状态 */}
          {isSaved && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="
                bg-child-success 
                text-green-800 
                px-child-xl 
                py-child-lg 
                rounded-child-lg 
                shadow-child
                font-child
                font-bold
                text-child-lg
              "
            >
              ✅ 故事已保存成功！
            </motion.div>
          )}

          {/* 查看我的故事 */}
          {isSaved && (
            <Button
              onClick={handleViewMyStories}
              variant="secondary"
              size="large"
              icon={<BookOpenIcon className="w-6 h-6" />}
              className="w-full"
              testId="view-stories-button"
            >
              去我的故事查看
            </Button>
          )}

          {/* 开始新故事 */}
          <Button
            onClick={handleNewStory}
            variant="primary"
            size="large"
            icon={<SparklesIcon className="w-6 h-6" />}
            className="w-full"
            testId="new-story-button"
          >
            创作新故事
          </Button>

          {/* 返回首页 */}
          <Button
            onClick={handleGoHome}
            variant="accent"
            size="medium"
            icon={<HomeIcon className="w-5 h-5" />}
            className="w-full"
            testId="home-button"
          >
            返回首页
          </Button>
        </motion.div>

        {/* 鼓励话语 */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2 }}
          className="mt-child-3xl"
        >
          <p className="
            font-child 
            text-child-base 
            text-gray-600 
            italic
          ">
            "每一个故事都是独一无二的冒险，就像你一样特别！"
          </p>
          <p className="
            font-child 
            text-child-sm 
            text-gray-500 
            mt-child-sm
          ">
            晚安，做个好梦 🌙
          </p>
        </motion.div>
      </div>
    </div>
  );
}