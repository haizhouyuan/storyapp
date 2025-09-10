import React from 'react';
import { motion } from 'framer-motion';
import { playFeedbackSound } from '../utils/helpers';

interface ButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'primary' | 'secondary' | 'accent' | 'warning' | 'success';
  size?: 'small' | 'medium' | 'large';
  icon?: React.ReactNode;
  className?: string;
  testId?: string;
}

/**
 * 儿童友好的按钮组件
 * 特点：大尺寸、圆润边角、鲜艳颜色、动画反馈
 */
export default function Button({
  children,
  onClick,
  disabled = false,
  loading = false,
  variant = 'primary',
  size = 'medium',
  icon,
  className = '',
  testId
}: ButtonProps) {
  
  const handleClick = () => {
    if (disabled || loading) return;
    
    playFeedbackSound('click');
    onClick?.();
  };

  // 根据variant选择背景色
  const getVariantClasses = () => {
    switch (variant) {
      case 'primary':
        return 'bg-child-blue hover:bg-blue-300 text-blue-900';
      case 'secondary':
        return 'bg-child-green hover:bg-green-300 text-green-900';
      case 'accent':
        return 'bg-child-orange hover:bg-orange-300 text-orange-900';
      case 'warning':
        return 'bg-child-orange hover:bg-orange-300 text-orange-900';
      case 'success':
        return 'bg-child-green hover:bg-green-300 text-green-900';
      default:
        return 'bg-child-blue hover:bg-blue-300 text-blue-900';
    }
  };

  // 根据size选择尺寸类
  const getSizeClasses = () => {
    switch (size) {
      case 'small':
        return 'px-child-md py-child-sm text-child-sm min-h-[48px]';
      case 'medium':
        return 'px-child-lg py-child-md text-child-base min-h-[56px]';
      case 'large':
        return 'px-child-xl py-child-lg text-child-lg min-h-[64px]';
      default:
        return 'px-child-lg py-child-md text-child-base min-h-[56px]';
    }
  };

  return (
    <motion.button
      whileHover={{ scale: disabled || loading ? 1 : 1.05 }}
      whileTap={{ scale: disabled || loading ? 1 : 0.95 }}
      animate={{
        opacity: disabled ? 0.6 : 1,
      }}
      transition={{
        type: 'spring',
        stiffness: 400,
        damping: 17
      }}
      onClick={handleClick}
      disabled={disabled || loading}
      data-testid={testId}
      className={`
        relative
        inline-flex
        items-center
        justify-center
        font-child
        font-bold
        rounded-child-lg
        shadow-child-lg
        transition-all
        duration-200
        focus:outline-none
        focus:ring-4
        focus:ring-yellow-300
        focus:ring-opacity-50
        disabled:cursor-not-allowed
        select-none
        ${getVariantClasses()}
        ${getSizeClasses()}
        ${className}
      `}
    >
      {/* 加载状态 */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            className="w-6 h-6 border-2 border-current border-t-transparent rounded-full"
          />
        </div>
      )}
      
      {/* 按钮内容 */}
      <div className={`flex items-center gap-child-sm ${loading ? 'opacity-0' : 'opacity-100'}`}>
        {icon && (
          <span className="flex-shrink-0">
            {icon}
          </span>
        )}
        <span>{children}</span>
      </div>
    </motion.button>
  );
}