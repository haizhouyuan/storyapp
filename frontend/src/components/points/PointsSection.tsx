import React from 'react';
import { cn } from '../../utils/cn';
import { PointsBadge } from './PointsBadge';

interface PointsSectionProps {
  title?: string;
  description?: string;
  badge?: React.ReactNode;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  layout?: 'card' | 'plain';
  className?: string;
  contentClassName?: string;
}

export function PointsSection({
  title,
  description,
  badge,
  icon,
  actions,
  children,
  layout = 'card',
  className,
  contentClassName,
}: PointsSectionProps) {
  const Wrapper = layout === 'card' ? 'div' : 'section';

  return (
    <Wrapper
      className={cn(
        layout === 'card'
          ? 'rounded-points-lg border border-points-border/60 bg-white/90 p-6 shadow-sm backdrop-blur-sm'
          : 'space-y-4'
        ,
        className,
      )}
    >
      {(title || description || icon || badge || actions) && (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-points-text-muted">
              {icon && <span className="text-points-primary">{icon}</span>}
              {badge && typeof badge === 'string' ? (
                <PointsBadge variant="neutral">{badge}</PointsBadge>
              ) : (
                badge
              )}
            </div>
            {title && <h2 className="text-2xl font-semibold text-points-text-strong">{title}</h2>}
            {description && <p className="text-sm text-points-text-muted">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
        </div>
      )}
      {children && <div className={cn('space-y-5', contentClassName)}>{children}</div>}
    </Wrapper>
  );
}
