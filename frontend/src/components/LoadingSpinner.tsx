import React from 'react';
import { motion } from 'framer-motion';

interface LoadingSpinnerProps {
  message?: string;
  size?: 'small' | 'medium' | 'large';
}

/**
 * 可爱的加载动画组件
 * 特点：彩色旋转书本图标 + 温馨提示文字
 */
export default function LoadingSpinner({ 
  message = '正在创作神奇的故事...', 
  size = 'medium' 
}: LoadingSpinnerProps) {
  
  const getSizeClasses = () => {
    switch (size) {
      case 'small':
        return 'w-8 h-8';
      case 'medium':
        return 'w-12 h-12';
      case 'large':
        return 'w-16 h-16';
      default:
        return 'w-12 h-12';
    }
  };

  const getTextSize = () => {
    switch (size) {
      case 'small':
        return 'text-child-sm';
      case 'medium':
        return 'text-child-base';
      case 'large':
        return 'text-child-lg';
      default:
        return 'text-child-base';
    }
  };

  return (
    <div className="flex flex-col items-center justify-center p-child-xl">
      {/* 旋转的书本图标 */}
      <motion.div
        animate={{ 
          rotate: 360,
          scale: [1, 1.1, 1]
        }}
        transition={{ 
          rotate: { duration: 2, repeat: Infinity, ease: 'linear' },
          scale: { duration: 1.5, repeat: Infinity, ease: 'easeInOut' }
        }}
        className={`${getSizeClasses()} mb-child-lg`}
      >
        {/* SVG书本图标 */}
        <svg 
          viewBox="0 0 24 24" 
          fill="none" 
          className="w-full h-full"
        >
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
          
          {/* 渐变定义 */}
          <defs>
            <linearGradient id="gradient1" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#FF6B6B" />
              <stop offset="100%" stopColor="#4ECDC4" />
            </linearGradient>
            <linearGradient id="gradient2" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#45B7D1" />
              <stop offset="100%" stopColor="#96CEB4" />
            </linearGradient>
          </defs>
        </svg>
      </motion.div>

      {/* 加载消息 */}
      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className={`
          font-child 
          font-semibold 
          text-center 
          text-gray-600
          ${getTextSize()}
        `}
      >
        {message}
      </motion.p>

      {/* 跳动的小圆点 */}
      <div className="flex gap-1 mt-child-sm">
        {[0, 1, 2].map((index) => (
          <motion.div
            key={index}
            animate={{
              y: [0, -8, 0],
              opacity: [0.5, 1, 0.5]
            }}
            transition={{
              duration: 1.2,
              repeat: Infinity,
              delay: index * 0.2,
              ease: 'easeInOut'
            }}
            className="w-2 h-2 bg-gradient-to-r from-child-blue to-child-green rounded-full"
          />
        ))}
      </div>
    </div>
  );
}