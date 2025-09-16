import React from 'react';
import { cn } from '../../utils/cn';

export type PointsCardVariant = 'default' | 'highlight' | 'surface' | 'outline';
export type PointsCardAccent = 'primary' | 'accent' | 'magenta' | 'success';

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
  accent?: PointsCardAccent;
}

const variantStyles = {
  default:
    'bg-points-surface backdrop-blur-xl border border-points-border/70 shadow-points-soft',
  highlight:
    'bg-points-primary text-white shadow-points-soft drop-shadow-points saturate-125',
  surface: 'glass-elevated shadow-points-soft',
  outline: 'bg-white/50 border-2 border-dashed border-points-border/70 backdrop-blur-lg',
};

const accentPills: Record<NonNullable<PointsCardProps['accent']>, string> = {
  primary: 'from-points-primary to-points-secondary text-white',
  accent: 'from-points-accent to-points-secondary text-white',
  magenta: 'from-points-magenta to-points-accent text-white',
  success: 'from-points-success to-points-primary text-white',
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
  accent = 'primary',
}: PointsCardProps) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-points-lg p-6 transition-all duration-200',
        variantStyles[variant],
        className,
      )}
    >
      {variant === 'highlight' && (
        <div className="absolute -top-16 -right-16 h-32 w-32 rounded-full bg-white/20 blur-3xl" />
      )}

      {(icon || badge) && (
        <div className="mb-4 flex items-start justify-between gap-4">
          {icon && (
            <div className="flex h-12 w-12 items-center justify-center rounded-points-md bg-white/75 shadow-sm">
              {icon}
            </div>
          )}
          {badge && <div className="shrink-0">{badge}</div>}
        </div>
      )}

      {(title || subtitle) && (
        <div className="mb-4 space-y-1">
          {title && (
            <h3 className="text-xl font-bold text-points-text-strong">
              <span
                className={cn(
                  'inline-flex items-center rounded-points-pill bg-gradient-to-r px-3 py-1 text-sm font-semibold shadow-sm',
                  accentPills[accent],
                )}
              >
                {title}
              </span>
            </h3>
          )}
          {subtitle && (
            <p className="text-sm text-points-text-muted">{subtitle}</p>
          )}
        </div>
      )}

      {children && <div className="space-y-4 text-points-text">{children}</div>}

      {actions && <div className="mt-6 flex flex-wrap gap-3">{actions}</div>}
      {footer && <div className="mt-6 border-t border-white/40 pt-4 text-sm text-points-text-muted">{footer}</div>}
    </div>
  );
}
