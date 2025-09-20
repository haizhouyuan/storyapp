import React, { memo, useMemo } from 'react';
import { motion } from 'framer-motion';
import { BookOpenIcon, CalendarIcon } from '@heroicons/react/24/outline';
import { formatDate } from '../utils/helpers';
import { cn } from '../utils/cn';

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
 * 积分主题的故事卡片组件
 * 提供更统一的阴影、圆角与悬停反馈，适配新的 Points HUD 风格
 */
const StoryCard = memo(function StoryCard({
  id,
  title,
  preview,
  createdAt,
  onClick,
  onDelete,
  className = '',
}: StoryCardProps) {
  const formattedDate = useMemo(() => formatDate(createdAt), [createdAt]);

  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4, scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
      transition={{ type: 'spring', stiffness: 260, damping: 20 }}
      onClick={onClick}
      className={cn(
        'group relative w-full rounded-points-lg border border-points-border/60 bg-white/95 p-5 text-left shadow-sm transition-all duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-points-primary/20 hover:shadow-md',
        className,
      )}
      data-testid={`story-card-${id}`}
    >
      <div className="flex items-start gap-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-points-md bg-points-accent-soft text-points-secondary">
          <BookOpenIcon className="h-8 w-8" />
        </div>

        <div className="flex-1 space-y-3">
          <div>
            <h3 className="line-clamp-1 text-lg font-semibold text-points-text-strong">{title}</h3>
            <p className="mt-1 line-clamp-3 text-sm text-points-text-muted">{preview}</p>
          </div>

          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-points-text-muted">
            <CalendarIcon className="h-4 w-4" />
            <span>{formattedDate}</span>
          </div>
        </div>
      </div>

      {onDelete && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onDelete();
          }}
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full border border-points-border/60 text-points-text-muted transition hover:bg-points-muted/60 hover:text-points-danger"
          aria-label="删除故事"
        >
          ×
        </button>
      )}

      <span className="pointer-events-none absolute inset-0 rounded-points-lg bg-gradient-to-br from-points-accent-soft/0 via-points-accent-soft/0 to-points-accent-soft/40 opacity-0 transition group-hover:opacity-100" />
    </motion.button>
  );
});

export default StoryCard;
