import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  HomeIcon,
  BookOpenIcon,
  PlusIcon,
  MagnifyingGlassIcon,
  ExclamationTriangleIcon,
  ClipboardDocumentListIcon,
} from '@heroicons/react/24/outline';
import { toast } from 'react-hot-toast';

import Button from '../components/Button';
import StoryCard from '../components/StoryCard';
import LoadingSpinner from '../components/LoadingSpinner';
import { PointsBadge, PointsModal, PointsPageShell, PointsSection, PointsStatCard } from '../components/points';
import { getStories, getStoryById, deleteStory } from '../utils/api';
import type { Story } from '../../../shared/types';

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

  const parseStoryContent = (content: string): string => {
    try {
      const parsed = JSON.parse(content);
      if (parsed.fullStory) {
        return parsed.fullStory;
      }
      if (parsed.storySegment) {
        return parsed.storySegment;
      }
      return JSON.stringify(parsed, null, 2);
    } catch (parseError) {
      return content;
    }
  };

  useEffect(() => {
    loadStories();
  }, []);

  useEffect(() => {
    if (!searchTerm.trim()) {
      setFilteredStories(stories);
      return;
    }

    const keyword = searchTerm.toLowerCase();
    const filtered = stories.filter((story) =>
      story.title.toLowerCase().includes(keyword) || story.content.toLowerCase().includes(keyword),
    );

    setFilteredStories(filtered);
  }, [stories, searchTerm]);

  const loadStories = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await getStories();
      const storiesData: Story[] = response.stories.map((story) => ({
        id: story.id,
        title: story.title,
        content: story.preview,
        created_at: story.created_at,
      }));

      setStories(storiesData);
      setFilteredStories(storiesData);
    } catch (loadError: any) {
      console.error('加载故事失败:', loadError);
      setError(loadError.message || '加载故事失败，请稍后重试');
      toast.error('加载故事失败');
    } finally {
      setIsLoading(false);
    }
  };

  const handleViewStory = async (story: Story) => {
    setSelectedStory(story);
    setFullStoryContent('');
    setIsLoadingStoryDetail(true);

    try {
      const response = await getStoryById(story.id);
      const parsedContent = parseStoryContent(response.content);
      setFullStoryContent(parsedContent);
    } catch (detailError: any) {
      console.error('获取故事详情失败:', detailError);
      toast.error('获取故事详情失败');
      setFullStoryContent(story.content);
    } finally {
      setIsLoadingStoryDetail(false);
    }
  };

  const handleDeleteStory = async (story: Story) => {
    if (!window.confirm(`确定要删除故事"${story.title}"吗？此操作不可恢复。`)) {
      return;
    }

    try {
      await deleteStory(story.id);
      const updated = stories.filter((item) => item.id !== story.id);
      setStories(updated);
      const keyword = searchTerm.toLowerCase();
      setFilteredStories(
        updated.filter(
          (item) =>
            !keyword ||
            item.title.toLowerCase().includes(keyword) ||
            item.content.toLowerCase().includes(keyword),
        ),
      );
      toast.success('故事已成功删除');
    } catch (deleteError: any) {
      console.error('删除故事失败:', deleteError);
      toast.error('删除故事失败，请稍后重试');
    }
  };

  const handleCloseStoryDetail = () => {
    setSelectedStory(null);
    setFullStoryContent('');
    setIsLoadingStoryDetail(false);
  };

  const handleGoHome = () => {
    navigate('/');
  };

  const handleNewStory = () => {
    navigate('/');
  };

  const totalStories = stories.length;
  const matchStories = filteredStories.length;
  const searchActive = Boolean(searchTerm.trim());
  const hasStories = matchStories > 0;

  return (
    <PointsPageShell
      backgroundVariant="hud"
      maxWidth="2xl"
      topBar={
        <>
          <div className="flex items-center gap-2 text-sm">
            <BookOpenIcon className="h-5 w-5 text-points-primary" />
            <span>睡前故事 · 管理中心</span>
          </div>
          <Button
            onClick={handleGoHome}
            variant="ghost"
            size="small"
            icon={<HomeIcon className="h-5 w-5" />}
            testId="home-button"
            className="shadow-none"
          >
            返回首页
          </Button>
        </>
      }
      header={
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-3">
            <PointsBadge variant="neutral">我的故事</PointsBadge>
            <div>
              <h1 className="text-3xl font-semibold text-points-text-strong">管理孩子的专属冒险</h1>
              <p className="mt-2 text-base text-points-text-muted">
                浏览、搜索与回顾已保存的故事，随时继续亲子共读的旅程。
              </p>
            </div>
          </div>
          <Button
            onClick={handleNewStory}
            variant="primary"
            size="medium"
            icon={<PlusIcon className="h-5 w-5" />}
            testId="new-story-button"
          >
            创作新故事
          </Button>
        </div>
      }
    >
      <PointsSection
        title="故事概览"
        description="快速了解故事库的状态，并按关键词检索想看的故事。"
        icon={<ClipboardDocumentListIcon className="h-6 w-6" />}
        actions={
          <div className="relative flex w-full max-w-md items-center">
            <MagnifyingGlassIcon className="pointer-events-none absolute left-3 h-5 w-5 text-points-text-muted" />
            <input
              type="text"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="输入标题或关键字搜索"
              className="w-full rounded-points-lg border border-points-border/70 bg-white/95 py-3 pl-10 pr-4 text-sm text-points-text shadow-inner transition focus:border-points-primary focus:ring-4 focus:ring-points-primary/20"
              data-testid="search-input"
            />
          </div>
        }
        contentClassName="grid gap-4 sm:grid-cols-2"
      >
        <PointsStatCard
          label={searchActive ? '匹配故事' : '已保存故事'}
          value={matchStories}
          helperText={searchActive ? '符合当前搜索条件的故事数量' : '故事库中的总故事数'}
        />
        <PointsStatCard
          label={searchActive ? '搜索关键词' : '故事库状态'}
          value={searchActive ? `“${searchTerm.trim()}”` : `${totalStories > 0 ? '准备好讲述新的故事' : '暂无保存故事'}`}
          helperText={
            searchActive
              ? '更换关键词可探索不同主题'
              : totalStories > 0
              ? '可随时回顾或删除保存的故事'
              : '先生成一个故事再回来看看吧'
          }
        />
      </PointsSection>

      {isLoading && (
        <div className="flex justify-center">
          <LoadingSpinner message="正在加载你的故事..." size="large" />
        </div>
      )}

      {!isLoading && error && (
        <PointsSection layout="card" className="border-red-200 bg-red-50/90">
          <div className="flex flex-col items-center gap-4 text-center text-points-text-strong">
            <ExclamationTriangleIcon className="h-10 w-10 text-points-danger" />
            <h2 className="text-xl font-semibold">加载故事时出了点问题</h2>
            <p className="text-sm text-points-text-muted">{error}</p>
            <Button onClick={loadStories} variant="primary" size="medium">
              重新加载
            </Button>
          </div>
        </PointsSection>
      )}

      {!isLoading && !error && !hasStories && (
        <PointsSection>
          <div className="flex flex-col items-center gap-4 rounded-points-lg border border-dashed border-points-border/60 bg-white/90 px-8 py-12 text-center shadow-sm">
            {searchActive ? (
              <>
                <div className="text-5xl">🔍</div>
                <h3 className="text-xl font-semibold text-points-text-strong">没有找到匹配的故事</h3>
                <p className="text-sm text-points-text-muted">试试其他关键词，或者重新回顾之前的冒险。</p>
                <Button onClick={() => setSearchTerm('')} variant="ghost" size="medium">
                  清除搜索
                </Button>
              </>
            ) : (
              <>
                <div className="text-5xl">📚</div>
                <h3 className="text-xl font-semibold text-points-text-strong">还没有保存的故事</h3>
                <p className="text-sm text-points-text-muted">和孩子一起创作第一个互动故事，开启晚安仪式。</p>
                <Button onClick={handleNewStory} variant="primary" size="large" icon={<PlusIcon className="h-5 w-5" />}>
                  创作第一个故事
                </Button>
              </>
            )}
          </div>
        </PointsSection>
      )}

      {!isLoading && !error && hasStories && (
        <PointsSection layout="plain" className="space-y-6">
          <div className="flex items-center justify-between text-sm text-points-text-muted">
            <span>
              {searchActive ? (
                <>
                  共找到 <span className="font-semibold text-points-text-strong">{matchStories}</span> 个匹配的故事
                </>
              ) : (
                <>
                  当前共有 <span className="font-semibold text-points-text-strong">{totalStories}</span> 个珍藏故事
                </>
              )}
            </span>
          </div>

          <motion.div layout className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            <AnimatePresence>
              {filteredStories.map((story) => (
                <motion.div key={story.id} layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}>
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
        </PointsSection>
      )}

      <PointsModal open={Boolean(selectedStory)} onClose={handleCloseStoryDetail} ariaLabel="故事详情">
        {selectedStory && (
          <div className="space-y-6">
            <div className="space-y-1 pr-10">
              <h2 className="text-2xl font-semibold text-points-text-strong">{selectedStory.title}</h2>
              <p className="text-sm text-points-text-muted">{parseStoryContent(selectedStory.content).slice(0, 60)}...</p>
            </div>
            <div className="max-h-[60vh] overflow-y-auto rounded-points-lg border border-points-border/40 bg-white/90 p-5 text-base leading-relaxed text-points-text whitespace-pre-wrap">
              {isLoadingStoryDetail ? (
                <div className="flex flex-col items-center justify-center py-10">
                  <LoadingSpinner message="正在加载故事详情..." size="medium" />
                </div>
              ) : (
                fullStoryContent || selectedStory.content
              )}
            </div>
          </div>
        )}
      </PointsModal>
    </PointsPageShell>
  );
}
