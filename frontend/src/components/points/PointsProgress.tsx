import React from 'react';
import { cn } from '../../utils/cn';

interface PointsProgressProps {
  value: number;
  max?: number;
  label?: string;
  icon?: React.ReactNode;
  showValue?: boolean;
  className?: string;
}

export function PointsProgress({
  value,
  max = 100,
  label,
  icon,
  showValue = true,
  className,
}: PointsProgressProps) {
  const percentage = Math.max(0, Math.min(100, Math.round((value / max) * 100)));

  return (
    <div className={cn('space-y-2', className)}>
      {(label || icon) && (
        <div className="flex items-center gap-2 text-sm font-semibold text-points-text-muted">
          {icon && <span className="text-base text-points-primary">{icon}</span>}
          {label && <span>{label}</span>}
          {showValue && <span className="ml-auto text-points-text-strong">{percentage}%</span>}
        </div>
      )}
      <div className="relative h-3 w-full rounded-points-pill bg-white/60 shadow-inner">
        <div
          className="absolute inset-y-0 left-0 rounded-points-pill bg-points-primary transition-all duration-500"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
