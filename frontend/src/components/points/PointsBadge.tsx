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
  primary: 'bg-points-primary/10 text-points-primary border border-points-primary/40',
  accent: 'bg-points-accent/15 text-points-accent border border-points-accent/40',
  magenta: 'bg-points-magenta/15 text-points-magenta border border-points-magenta/40',
  success: 'bg-points-success/15 text-points-success border border-points-success/40',
  warning: 'bg-points-warning/15 text-points-text border border-points-warning/50',
  neutral: 'bg-white/60 text-points-text border border-points-border/60',
};

export function PointsBadge({ children, icon, variant = 'primary', className }: PointsBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-points-pill px-3 py-1 text-xs font-semibold uppercase tracking-wide shadow-sm backdrop-blur-sm',
        variantMap[variant],
        className,
      )}
    >
      {icon && <span className="text-base">{icon}</span>}
      {children}
    </span>
  );
}
