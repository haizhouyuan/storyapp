import React from 'react';
import { motion } from 'framer-motion';

interface LoadingSpinnerProps {
  message?: string;
  size?: 'small' | 'medium' | 'large';
}

/**
 * 可爱的加载动画组件（积分主题版）
 */
export default function LoadingSpinner({ message = '正在创作神奇的故事...', size = 'medium' }: LoadingSpinnerProps) {
  const sizeClass = {
    small: 'w-8 h-8',
    medium: 'w-12 h-12',
    large: 'w-16 h-16',
  }[size];

  const textClass = {
    small: 'text-sm',
    medium: 'text-base',
    large: 'text-lg',
  }[size];

  return (
    <div className="flex flex-col items-center justify-center p-8">
      <motion.div
        animate={{ rotate: 360, scale: [1, 1.1, 1] }}
        transition={{ rotate: { duration: 2, repeat: Infinity, ease: 'linear' }, scale: { duration: 1.5, repeat: Infinity, ease: 'easeInOut' } }}
        className={`${sizeClass} mb-6`}
      >
        <svg viewBox="0 0 24 24" fill="none" className="h-full w-full">
          <motion.path
            d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"
            stroke="url(#gradient1)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <motion.path
            d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"
            stroke="url(#gradient2)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <motion.path
            d="M8 7h8"
            stroke="url(#gradient1)"
            strokeWidth="1.5"
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
          />
          <motion.path
            d="M8 11h5"
            stroke="url(#gradient2)"
            strokeWidth="1.5"
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut', delay: 0.3 }}
          />

          <defs>
            <linearGradient id="gradient1" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="rgba(var(--points-secondary), 1)" />
              <stop offset="100%" stopColor="rgba(var(--points-primary), 1)" />
            </linearGradient>
            <linearGradient id="gradient2" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="rgba(var(--points-primary), 1)" />
              <stop offset="100%" stopColor="rgba(var(--points-magenta), 1)" />
            </linearGradient>
          </defs>
        </svg>
      </motion.div>

      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className={`text-center font-semibold text-points-text-muted ${textClass}`}
      >
        {message}
      </motion.p>

      <div className="mt-3 flex gap-1">
        {[0, 1, 2].map((index) => (
          <motion.div
            key={index}
            animate={{ y: [0, -8, 0], opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 1.2, repeat: Infinity, delay: index * 0.2, ease: 'easeInOut' }}
            className="h-2 w-2 rounded-full bg-gradient-to-r from-points-secondary to-points-primary"
          />
        ))}
      </div>
    </div>
  );
}
