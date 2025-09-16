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
    <div className={cn('flex flex-col gap-3', className)}>
      <div
        className={cn(
          'flex flex-wrap gap-3 rounded-points-pill bg-white/70 p-2 shadow-points-soft backdrop-blur-md',
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
                'points-focus relative flex items-center gap-2 rounded-points-pill px-5 py-2 text-sm font-semibold transition-all duration-200',
                isActive
                  ? 'bg-points-hero text-white shadow-points-soft drop-shadow-points'
                  : 'text-points-text-muted hover:bg-white/90',
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
          <div
            key={item.id}
            className="mx-auto max-w-3xl text-center text-sm text-points-text-muted"
          >
            {item.description}
          </div>
        );
      })}
    </div>
  );
}
