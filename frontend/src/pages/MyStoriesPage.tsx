import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { 
  HomeIcon, 
  BookOpenIcon, 
  PlusIcon,
  MagnifyingGlassIcon 
} from '@heroicons/react/24/outline';
import { toast } from 'react-hot-toast';

import Button from '../components/Button';
import StoryCard from '../components/StoryCard';
import LoadingSpinner from '../components/LoadingSpinner';
import { getStories, getStoryById, deleteStory } from '../utils/api';
import type { Story } from '../../../shared/types';

/**
 * 我的故事页面
 * 特点：故事列表、搜索功能、故事详情查看
 */
export default function MyStoriesPage() {
  const [stories, setStories] = useState<Story[]>([]);
  const [filteredStories, setFilteredStories] = useState<Story[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedStory, setSelectedStory] = useState<Story | null>(null);
  const [fullStoryContent, setFullStoryContent] = useState<string>('');
  const [isLoadingStoryDetail, setIsLoadingStoryDetail] = useState(false);
  
  const navigate = useNavigate();

  // 解析故事内容的辅助函数
  const parseStoryContent = (content: string): string => {
    try {
      // 尝试解析JSON格式的内容
      const parsed = JSON.parse(content);
      
      // 处理故事树格式 (fullStory)
      if (parsed.fullStory) {
        return parsed.fullStory;
      }
      
      // 处理渐进式故事格式 (storySegment)
      if (parsed.storySegment) {
        return parsed.storySegment;
      }
      
      // 如果有其他字段，返回整个JSON的字符串表示
      return JSON.stringify(parsed, null, 2);
    } catch (error) {
      // 如果不是JSON格式，直接返回原始内容
      return content;
    }
  };

  // 加载故事列表
  useEffect(() => {
    loadStories();
  }, []);

  // 搜索过滤
  useEffect(() => {
    if (!searchTerm.trim()) {
      setFilteredStories(stories);
    } else {
      const filtered = stories.filter(story => 
        story.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        story.content.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredStories(filtered);
    }
  }, [stories, searchTerm]);

  // 加载故事数据
  const loadStories = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await getStories();
      const storiesData: Story[] = response.stories.map(story => ({
        id: story.id,
        title: story.title,
        content: story.preview, // 在列表中使用预览内容
        created_at: story.created_at
      }));
      
      setStories(storiesData);
      setFilteredStories(storiesData);
    } catch (error: any) {
      console.error('加载故事失败:', error);
      setError(error.message || '加载故事失败，请稍后重试');
      toast.error('加载故事失败');
    } finally {
      setIsLoading(false);
    }
  };

  // 查看故事详情
  const handleViewStory = async (story: Story) => {
    setSelectedStory(story);
    setFullStoryContent('');
    setIsLoadingStoryDetail(true);
    
    try {
      const response = await getStoryById(story.id);
      const parsedContent = parseStoryContent(response.content);
      setFullStoryContent(parsedContent);
    } catch (error: any) {
      console.error('获取故事详情失败:', error);
      toast.error('获取故事详情失败');
      // 如果获取失败，使用预览内容作为后备
      setFullStoryContent(story.content);
    } finally {
      setIsLoadingStoryDetail(false);
    }
  };

  // 关闭故事详情
  const handleCloseStoryDetail = () => {
    setSelectedStory(null);
    setFullStoryContent('');
    setIsLoadingStoryDetail(false);
  };

  // 删除故事
  const handleDeleteStory = async (story: Story) => {
    // 确认删除
    if (!window.confirm(`确定要删除故事"${story.title}"吗？此操作不可恢复。`)) {
      return;
    }

    try {
      // 调用删除API
      await deleteStory(story.id);
      
      // 从列表中移除已删除的故事
      const updatedStories = stories.filter(s => s.id !== story.id);
      setStories(updatedStories);
      setFilteredStories(updatedStories.filter(s => 
        !searchTerm.trim() || 
        s.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.content.toLowerCase().includes(searchTerm.toLowerCase())
      ));
      
      toast.success('故事已成功删除');
    } catch (error: any) {
      console.error('删除故事失败:', error);
      toast.error('删除故事失败，请稍后重试');
    }
  };

  // 返回首页
  const handleGoHome = () => {
    navigate('/');
  };

  // 创建新故事
  const handleNewStory = () => {
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-child-mint via-child-cream to-child-yellow p-child-lg">
      {/* 顶部导航栏 */}
      <div className="max-w-6xl mx-auto mb-child-xl">
        <div className="flex items-center justify-between mb-child-lg">
          {/* 返回首页按钮 */}
          <Button
            onClick={handleGoHome}
            variant="secondary"
            size="small"
            icon={<HomeIcon className="w-5 h-5" />}
            testId="home-button"
          >
            返回首页
          </Button>

          {/* 页面标题 */}
          <motion.h1
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="
              font-child 
              font-bold 
              text-child-3xl 
              text-gray-800
              text-center
              flex
              items-center
              gap-child-sm
            "
          >
            <BookOpenIcon className="w-8 h-8 text-child-blue" />
            我的故事
          </motion.h1>

          {/* 创建新故事按钮 */}
          <Button
            onClick={handleNewStory}
            variant="primary"
            size="small"
            icon={<PlusIcon className="w-5 h-5" />}
            testId="new-story-button"
          >
            新故事
          </Button>
        </div>

        {/* 搜索栏 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="relative max-w-md mx-auto"
        >
          <div className="relative">
            <MagnifyingGlassIcon className="
              absolute 
              left-child-md 
              top-1/2 
              transform 
              -translate-y-1/2 
              w-5 h-5 
              text-gray-400
            " />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="搜索你的故事..."
              className="
                w-full
                pl-12
                pr-child-lg
                py-child-md
                text-child-base
                font-child
                bg-white
                border-2
                border-child-blue/20
                rounded-child-lg
                shadow-child
                focus:outline-none
                focus:border-child-blue
                focus:shadow-child-lg
                transition-all
                duration-200
                placeholder-gray-400
              "
              data-testid="search-input"
            />
          </div>
        </motion.div>
      </div>

      {/* 主要内容区域 */}
      <div className="max-w-6xl mx-auto">
        {/* 加载状态 */}
        {isLoading && (
          <div className="text-center">
            <LoadingSpinner 
              message="正在加载你的故事..."
              size="large"
            />
          </div>
        )}

        {/* 错误状态 */}
        {error && !isLoading && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center"
          >
            <div className="
              bg-red-100 
              border-2 
              border-red-300 
              rounded-child-lg 
              p-child-3xl 
              max-w-md 
              mx-auto
            ">
              <p className="
                font-child 
                font-semibold 
                text-red-700 
                text-child-lg 
                mb-child-lg
              ">
                😔 加载故事时出错了
              </p>
              <p className="
                font-child 
                text-red-600 
                text-child-base 
                mb-child-lg
              ">
                {error}
              </p>
              <Button
                onClick={loadStories}
                variant="primary"
                size="medium"
              >
                重新加载
              </Button>
            </div>
          </motion.div>
        )}

        {/* 故事列表 */}
        {!isLoading && !error && (
          <>
            {/* 故事统计 */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="text-center mb-child-xl"
            >
              <p className="font-child text-child-base text-gray-600">
                {searchTerm ? (
                  <>找到 <span className="font-bold text-child-blue">{filteredStories.length}</span> 个匹配的故事</>
                ) : (
                  <>共有 <span className="font-bold text-child-blue">{stories.length}</span> 个珍贵的故事</>
                )}
              </p>
            </motion.div>

            {/* 空状态 */}
            {filteredStories.length === 0 && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.4 }}
                className="text-center"
              >
                <div className="max-w-md mx-auto">
                  {searchTerm ? (
                    // 搜索无结果
                    <div className="
                      bg-white/80 
                      rounded-child-xl 
                      p-child-3xl 
                      shadow-child-lg
                    ">
                      <div className="text-6xl mb-child-lg">🔍</div>
                      <h3 className="
                        font-child 
                        font-bold 
                        text-child-xl 
                        text-gray-700 
                        mb-child-md
                      ">
                        没找到匹配的故事
                      </h3>
                      <p className="
                        font-child 
                        text-child-base 
                        text-gray-600 
                        mb-child-lg
                      ">
                        试试其他关键词，或者创作一个新故事吧！
                      </p>
                      <Button
                        onClick={() => setSearchTerm('')}
                        variant="secondary"
                        size="medium"
                      >
                        清除搜索
                      </Button>
                    </div>
                  ) : (
                    // 无故事状态
                    <div className="
                      bg-white/80 
                      rounded-child-xl 
                      p-child-3xl 
                      shadow-child-lg
                    ">
                      <div className="text-6xl mb-child-lg">📚</div>
                      <h3 className="
                        font-child 
                        font-bold 
                        text-child-xl 
                        text-gray-700 
                        mb-child-md
                      ">
                        还没有保存的故事
                      </h3>
                      <p className="
                        font-child 
                        text-child-base 
                        text-gray-600 
                        mb-child-lg
                      ">
                        创作你的第一个故事吧！每个故事都是独特的冒险。
                      </p>
                      <Button
                        onClick={handleNewStory}
                        variant="primary"
                        size="large"
                        icon={<PlusIcon className="w-6 h-6" />}
                        testId="create-first-story-button"
                      >
                        创作第一个故事
                      </Button>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* 故事网格 */}
            {filteredStories.length > 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-child-lg"
              >
                <AnimatePresence>
                  {filteredStories.map((story, index) => (
                    <motion.div
                      key={story.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      transition={{ delay: index * 0.1 }}
                    >
                      <StoryCard
                        id={story.id}
                        title={story.title}
                        preview={story.content}
                        createdAt={story.created_at}
                        onClick={() => handleViewStory(story)}
                        onDelete={() => handleDeleteStory(story)}
                      />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </motion.div>
            )}
          </>
        )}
      </div>

      {/* 故事详情弹窗 */}
      <AnimatePresence>
        {selectedStory && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center p-child-lg z-50"
            onClick={handleCloseStoryDetail}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="
                bg-white 
                rounded-child-xl 
                shadow-child-xl 
                p-child-xl 
                max-w-2xl 
                max-h-[80vh] 
                overflow-y-auto
                w-full
              "
            >
              {/* 弹窗标题 */}
              <div className="flex justify-between items-center mb-child-lg">
                <h2 className="
                  font-child 
                  font-bold 
                  text-child-xl 
                  text-gray-800
                ">
                  {selectedStory.title}
                </h2>
                <button
                  onClick={handleCloseStoryDetail}
                  className="
                    w-8 h-8 
                    bg-gray-200 
                    hover:bg-gray-300 
                    rounded-full 
                    flex 
                    items-center 
                    justify-center
                    transition-colors
                  "
                >
                  <svg viewBox="0 0 24 24" className="w-5 h-5">
                    <path
                      fill="currentColor"
                      d="M19 6.41L17.59 5L12 10.59L6.41 5L5 6.41L10.59 12L5 17.59L6.41 19L12 13.41L17.59 19L19 17.59L13.41 12L19 6.41z"
                    />
                  </svg>
                </button>
              </div>

              {/* 故事内容 */}
              <div className="
                font-child 
                text-child-base 
                text-gray-700 
                leading-relaxed
                whitespace-pre-wrap
                min-h-[200px]
              ">
                {isLoadingStoryDetail ? (
                  <div className="flex flex-col items-center justify-center py-child-xl">
                    <LoadingSpinner message="正在加载故事详情..." size="medium" />
                  </div>
                ) : (
                  fullStoryContent || selectedStory.content
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}