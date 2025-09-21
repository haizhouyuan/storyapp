import React from 'react';
import { cn } from '../../utils/cn';

interface PointsStatCardProps {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  trend?: {
    value: string;
    direction?: 'up' | 'down' | 'neutral';
  };
  helperText?: string;
  className?: string;
}

const trendColorMap = {
  up: 'text-points-success',
  down: 'text-points-danger',
  neutral: 'text-points-text-muted',
};

export function PointsStatCard({ label, value, icon, trend, helperText, className }: PointsStatCardProps) {
  return (
    <div
      className={cn(
        'rounded-points-lg border border-points-border/60 bg-white/90 p-5 shadow-sm backdrop-blur-sm transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-md',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-points-text-muted">{label}</p>
          <div className="mt-1 text-3xl font-semibold text-points-text-strong">{value}</div>
          {trend && (
            <div className={cn('mt-2 flex items-center gap-1 text-sm font-medium', trendColorMap[trend.direction ?? 'neutral'])}>
              {trend.direction === 'up' && <span aria-hidden>▲</span>}
              {trend.direction === 'down' && <span aria-hidden>▼</span>}
              {trend.direction === 'neutral' && <span aria-hidden>■</span>}
              <span>{trend.value}</span>
            </div>
          )}
        </div>
        {icon && (
          <div className="flex h-12 w-12 items-center justify-center rounded-points-md bg-points-accent-soft/60 text-points-secondary">
            {icon}
          </div>
        )}
      </div>
      {helperText && <p className="mt-3 text-sm text-points-text-muted">{helperText}</p>}
    </div>
  );
}
