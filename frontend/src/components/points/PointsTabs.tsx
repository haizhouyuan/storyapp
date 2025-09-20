import React from 'react';
import { cn } from '../../utils/cn';

export interface PointsTabItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  description?: string;
}

interface PointsTabsProps {
  items: PointsTabItem[];
  activeId: string;
  onChange: (id: string) => void;
  className?: string;
  align?: 'start' | 'center';
}

export function PointsTabs({ items, activeId, onChange, className, align = 'center' }: PointsTabsProps) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div
        className={cn(
          'flex flex-wrap gap-2 rounded-points-pill border border-points-border/60 bg-white/80 p-1',
          align === 'center' ? 'justify-center' : 'justify-start',
        )}
      >
        {items.map((item) => {
          const isActive = item.id === activeId;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onChange(item.id)}
              className={cn(
                'points-focus relative flex items-center gap-2 rounded-points-pill px-4 py-2 text-sm font-medium transition-colors duration-200',
                isActive
                  ? 'bg-points-primary text-white shadow-sm'
                  : 'text-points-text-muted hover:bg-points-muted/60',
              )}
            >
              {item.icon && <span className="text-lg">{item.icon}</span>}
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
      {items.map((item) => {
        if (item.id !== activeId || !item.description) return null;
        return (
          <div key={item.id} className="mx-auto max-w-3xl text-center text-sm text-points-text-muted">
            {item.description}
          </div>
        );
      })}
    </div>
  );
}
