import React, { memo } from 'react';
import { motion } from 'framer-motion';
import { BookOpenIcon, CalendarIcon } from '@heroicons/react/24/outline';
import { formatDate } from '../utils/helpers';

// 动画配置常量，移到组件外部避免重复创建
const MOTION_TRANSITION = {
  type: 'spring' as const,
  stiffness: 300,
  damping: 20
};

interface StoryCardProps {
  id: string;
  title: string;
  preview: string;
  createdAt: string;
  onClick?: () => void;
  onDelete?: () => void;
  className?: string;
}

/**
 * 故事卡片组件
 * 用于在"我的故事"页面显示故事列表项
 * 使用React.memo优化性能，避免不必要的重渲染
 */
const StoryCard = memo(function StoryCard({
  id,
  title,
  preview,
  createdAt,
  onClick,
  onDelete,
  className = ''
}: StoryCardProps) {
  // 仅对复杂计算使用useMemo，简单字符串操作直接计算更高效
  const formattedDate = formatDate(createdAt);

  // 简单的className拼接不需要缓存
  const cardClassName = `
    relative
    bg-white
    rounded-child-lg
    shadow-child-lg
    p-child-lg
    cursor-pointer
    border-2
    border-transparent
    hover:border-child-blue
    hover:shadow-child-xl
    transition-all
    duration-200
    ${className}
  `;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.02, y: -2 }}
      whileTap={{ scale: 0.98 }}
      transition={MOTION_TRANSITION}
      onClick={onClick}
      className={cardClassName}
      data-testid={`story-card-${id}`}
    >
      {/* 故事缩略图区域 */}
      <div className="flex items-start gap-child-md">
        {/* 书本图标 */}
        <div className="flex-shrink-0 w-16 h-16 bg-gradient-to-br from-child-mint to-child-blue rounded-child p-3">
          <BookOpenIcon className="w-full h-full text-white" />
        </div>

        {/* 故事信息 */}
        <div className="flex-1 min-w-0">
          {/* 故事标题 */}
          <h3 className="
            font-child 
            font-bold 
            text-child-lg 
            text-gray-800 
            mb-2
            truncate
          ">
            {title}
          </h3>

          {/* 故事预览 */}
          <p className="
            font-child 
            text-child-sm 
            text-gray-600 
            mb-3
            line-clamp-2
          ">
            {preview}
          </p>

          {/* 创建时间 */}
          <div className="flex items-center gap-2 text-child-xs text-gray-500">
            <CalendarIcon className="w-4 h-4" />
            <span>{formattedDate}</span>
          </div>
        </div>

        {/* 播放按钮 */}
        <motion.div
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          className="
            flex-shrink-0 
            w-12 h-12 
            bg-gradient-to-r from-child-green to-child-blue 
            rounded-full 
            flex 
            items-center 
            justify-center
            shadow-child
            hover:shadow-child-lg
            transition-shadow
            duration-200
          "
        >
          {/* 播放图标 */}
          <svg 
            viewBox="0 0 24 24" 
            fill="none" 
            className="w-6 h-6 text-white ml-0.5"
          >
            <path
              d="M8 5v14l11-7L8 5z"
              fill="currentColor"
            />
          </svg>
        </motion.div>
      </div>

      {/* 删除按钮（隐藏在右上角） */}
      {onDelete && (
        <motion.button
          initial={{ opacity: 0 }}
          whileHover={{ opacity: 1 }}
          whileTap={{ scale: 0.9 }}
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="
            absolute 
            -top-2 
            -right-2 
            w-8 h-8 
            bg-red-400 
            hover:bg-red-500 
            rounded-full 
            flex 
            items-center 
            justify-center
            shadow-child
            transition-colors
            duration-200
          "
          title="删除故事"
        >
          <svg viewBox="0 0 24 24" className="w-4 h-4 text-white">
            <path
              fill="currentColor"
              d="M19 6.41L17.59 5L12 10.59L6.41 5L5 6.41L10.59 12L5 17.59L6.41 19L12 13.41L17.59 19L19 17.59L13.41 12L19 6.41z"
            />
          </svg>
        </motion.button>
      )}

      {/* 悬停发光效果 */}
      <motion.div
        initial={{ opacity: 0 }}
        whileHover={{ opacity: 1 }}
        className="
          absolute 
          inset-0 
          rounded-child-lg 
          bg-gradient-to-r 
          from-child-mint/20 
          to-child-blue/20 
          pointer-events-none
        "
      />
    </motion.div>
  );
});

export default StoryCard;