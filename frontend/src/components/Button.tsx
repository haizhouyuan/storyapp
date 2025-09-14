import React, { memo, useCallback, useMemo } from 'react';
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
  tabIndex?: number;
}

/**
 * 儿童友好的按钮组件（性能优化版）
 * 特点：大尺寸、圆润边角、鲜艳颜色、动画反馈
 * 优化：使用memo、useCallback、useMemo避免不必要的重渲染
 */
const Button = memo<ButtonProps>(function Button({
  children,
  onClick,
  disabled = false,
  loading = false,
  variant = 'primary',
  size = 'medium',
  icon,
  className = '',
  testId,
  tabIndex
}) {
  
  // 缓存点击处理函数，只在onClick、disabled、loading变化时重新创建
  const handleClick = useCallback(() => {
    if (disabled || loading) return;
    
    playFeedbackSound('click');
    onClick?.();
  }, [disabled, loading, onClick]);

  // 缓存样式类计算，避免每次渲染都重新计算
  const variantClasses = useMemo(() => {
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
  }, [variant]);

  const sizeClasses = useMemo(() => {
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
  }, [size]);

  // 缓存最终的className字符串
  const finalClassName = useMemo(() => `
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
    ${variantClasses}
    ${sizeClasses}
    ${className}
  `, [variantClasses, sizeClasses, className]);

  // 缓存动画属性对象，避免每次渲染都创建新对象
  const motionProps = useMemo(() => ({
    whileHover: { scale: disabled || loading ? 1 : 1.05 },
    whileTap: { scale: disabled || loading ? 1 : 0.95 },
    animate: {
      opacity: disabled ? 0.6 : 1,
    },
    transition: {
      type: 'spring' as const,
      stiffness: 400,
      damping: 17
    }
  }), [disabled, loading]);

  return (
    <motion.button
      {...motionProps}
      onClick={handleClick}
      disabled={disabled || loading}
      data-testid={testId}
      tabIndex={tabIndex}
      className={finalClassName}
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
});

export default Button;