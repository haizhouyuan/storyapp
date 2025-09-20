import React from 'react';
import { cn } from '../../utils/cn';

type BadgeVariant = 'primary' | 'accent' | 'magenta' | 'success' | 'warning' | 'neutral';

interface PointsBadgeProps {
  children: React.ReactNode;
  icon?: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
}

const variantMap: Record<BadgeVariant, string> = {
  primary: 'bg-points-primary/15 text-points-primary border border-points-primary/30',
  accent: 'bg-points-accent-soft/30 text-points-accent border border-points-accent/30',
  magenta: 'bg-points-magenta/20 text-points-magenta border border-points-magenta/30',
  success: 'bg-points-success/20 text-points-success border border-points-success/30',
  warning: 'bg-points-warning/15 text-points-text border border-points-warning/35',
  neutral: 'bg-white text-points-text border border-points-border/50',
};

export function PointsBadge({ children, icon, variant = 'primary', className }: PointsBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-points-pill px-3 py-1 text-xs font-medium tracking-wide',
        variantMap[variant],
        className,
      )}
    >
      {icon && <span className="text-base">{icon}</span>}
      {children}
    </span>
  );
}
