import React from 'react';
import { motion } from 'framer-motion';
import { playFeedbackSound } from '../utils/helpers';
import { cn } from '../utils/cn';

type ButtonVariant = 'primary' | 'secondary' | 'accent' | 'success' | 'warning' | 'danger' | 'ghost';
type ButtonSize = 'small' | 'medium' | 'large';

interface ButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: React.ReactNode;
  className?: string;
  testId?: string;
  tabIndex?: number;
  type?: 'button' | 'submit' | 'reset';
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-points-primary text-white shadow-points-soft hover:shadow-xl hover:-translate-y-0.5',
  secondary:
    'bg-white/90 text-points-text border border-points-border shadow-points-soft hover:bg-points-secondary/30',
  accent:
    'bg-points-magenta text-white shadow-points-soft hover:shadow-xl hover:-translate-y-0.5',
  success:
    'bg-gradient-to-r from-points-success to-points-primary text-white shadow-points-soft hover:shadow-xl',
  warning:
    'bg-gradient-to-r from-points-warning to-points-secondary text-points-text shadow-points-soft hover:saturate-125',
  danger:
    'bg-gradient-to-r from-points-danger to-points-magenta text-white shadow-points-soft hover:shadow-xl',
  ghost:
    'bg-transparent border border-dashed border-points-border text-points-text hover:bg-white/60',
};

const sizeClasses: Record<ButtonSize, string> = {
  small: 'px-5 py-2.5 text-sm',
  medium: 'px-6 py-3 text-base',
  large: 'px-7 py-3.5 text-lg',
};

export default function Button({
  children,
  onClick,
  disabled = false,
  loading = false,
  variant = 'primary',
  size = 'medium',
  icon,
  className = '',
  testId,
  tabIndex,
  type = 'button',
}: ButtonProps) {
  const handleClick = () => {
    if (disabled || loading) return;
    playFeedbackSound('click');
    onClick?.();
  };

  return (
    <motion.button
      whileHover={{ scale: disabled || loading ? 1 : 1.02 }}
      whileTap={{ scale: disabled || loading ? 1 : 0.98 }}
      animate={{ opacity: disabled ? 0.65 : 1 }}
      transition={{ type: 'spring', stiffness: 320, damping: 20 }}
      onClick={handleClick}
      disabled={disabled || loading}
      data-testid={testId}
      tabIndex={tabIndex}
      type={type}
      className={cn(
        'relative inline-flex items-center justify-center rounded-points-pill font-semibold tracking-wide transition-all duration-200 points-focus disabled:cursor-not-allowed disabled:saturate-75 select-none gap-2',
        variantClasses[variant],
        sizeClasses[size],
        loading ? 'pointer-events-none' : '',
        className,
      )}
    >
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 0.9, repeat: Infinity, ease: 'linear' }}
            className="w-5 h-5 border-2 border-white/80 border-t-transparent rounded-full"
          />
        </div>
      )}

      <div className={cn('flex items-center gap-2', loading ? 'opacity-0' : 'opacity-100')}>
        {icon && <span className="flex-shrink-0 text-lg">{icon}</span>}
        <span className="whitespace-nowrap">{children}</span>
      </div>
    </motion.button>
  );
}
