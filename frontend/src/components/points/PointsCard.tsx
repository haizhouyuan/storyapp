import React from 'react';
import { cn } from '../../utils/cn';

export type PointsCardVariant = 'default' | 'highlight' | 'surface' | 'outline';

interface PointsCardProps {
  title?: string;
  subtitle?: string;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
  footer?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  variant?: PointsCardVariant;
}

const variantStyles = {
  default: 'bg-points-surface border border-points-border/60 shadow-sm',
  highlight: 'bg-gradient-to-br from-white via-white to-points-muted/50 border border-points-border/50 shadow-md',
  surface: 'bg-points-surface-elevated border border-points-border/40 shadow-sm',
  outline: 'bg-transparent border-2 border-dashed border-points-border/60',
};

export function PointsCard({
  title,
  subtitle,
  icon,
  badge,
  actions,
  footer,
  children,
  className,
  variant = 'default',
}: PointsCardProps) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-points-lg p-6 transition-all duration-200',
        variantStyles[variant],
        className,
      )}
    >
      {(icon || badge) && (
        <div className="mb-4 flex items-start justify-between gap-3">
          {icon && (
            <div className="flex h-10 w-10 items-center justify-center rounded-points-md bg-white/80 text-points-primary">
              {icon}
            </div>
          )}
          {badge && <div className="shrink-0">{badge}</div>}
        </div>
      )}

      {(title || subtitle) && (
        <div className="mb-4 space-y-2">
          {title && (
            <h3 className="text-lg font-semibold text-points-text-strong">{title}</h3>
          )}
          {subtitle && (
            <p className="text-sm text-points-text-muted">{subtitle}</p>
          )}
        </div>
      )}

      {children && <div className="space-y-4 text-points-text">{children}</div>}

      {actions && <div className="mt-6 flex flex-wrap gap-3">{actions}</div>}
      {footer && (
        <div className="mt-6 border-t border-points-border/50 pt-4 text-sm text-points-text-muted">
          {footer}
        </div>
      )}
    </div>
  );
}
