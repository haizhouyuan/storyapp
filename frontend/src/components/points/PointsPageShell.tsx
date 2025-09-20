import React from 'react';
import { cn } from '../../utils/cn';

interface PointsPageShellProps {
  children: React.ReactNode;
  topBar?: React.ReactNode;
  header?: React.ReactNode;
  footer?: React.ReactNode;
  backgroundVariant?: 'hud' | 'hero' | 'magenta';
  maxWidth?: 'lg' | 'xl' | '2xl' | '3xl' | 'full';
  className?: string;
  containerClassName?: string;
}

const backgroundMap: Record<NonNullable<PointsPageShellProps['backgroundVariant']>, string> = {
  hud: 'bg-[rgb(var(--points-hud-bg))]',
  hero: 'bg-points-hero',
  magenta: 'bg-points-magenta-wave',
};

const maxWidthMap: Record<NonNullable<PointsPageShellProps['maxWidth']>, string> = {
  lg: 'max-w-4xl',
  xl: 'max-w-5xl',
  '2xl': 'max-w-6xl',
  '3xl': 'max-w-7xl',
  full: 'max-w-none',
};

export function PointsPageShell({
  children,
  topBar,
  header,
  footer,
  backgroundVariant = 'hud',
  maxWidth = 'xl',
  className,
  containerClassName,
}: PointsPageShellProps) {
  return (
    <div
      className={cn(
        'relative min-h-screen overflow-hidden pb-16 pt-10 transition-colors ease-out',
        backgroundMap[backgroundVariant],
        className,
      )}
    >
      <div className="absolute inset-0 pointer-events-none opacity-40">
        <div className="mx-auto h-full w-full max-w-7xl bg-gradient-to-tr from-white/20 via-transparent to-points-accent-soft/40" />
      </div>

      <div className={cn('relative mx-auto w-full px-5 sm:px-8', maxWidthMap[maxWidth], containerClassName)}>
        {topBar && <div className="mb-6 flex items-center justify-between gap-4 text-sm text-points-text-muted">{topBar}</div>}
        {header && <div className="mb-10 space-y-6">{header}</div>}
        <div className="space-y-8">{children}</div>
        {footer && <div className="mt-10 border-t border-points-border/50 pt-6 text-sm text-points-text-muted">{footer}</div>}
      </div>
    </div>
  );
}
