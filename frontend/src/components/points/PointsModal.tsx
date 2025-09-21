import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '../../utils/cn';

interface PointsModalProps {
  open: boolean;
  onClose?: () => void;
  children: React.ReactNode;
  className?: string;
  ariaLabel?: string;
}

export function PointsModal({ open, onClose, children, className, ariaLabel }: PointsModalProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="points-modal"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-10 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={ariaLabel}
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.92, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 160, damping: 18 }}
            className={cn(
              'relative w-full max-w-2xl rounded-points-xl border border-points-border/60 bg-white/95 p-6 shadow-lg',
              className,
            )}
            onClick={(event) => event.stopPropagation()}
          >
            {children}
            {onClose && (
              <button
                type="button"
                className="points-focus absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full border border-points-border/60 text-points-text-muted transition hover:bg-points-muted/50"
                onClick={onClose}
                aria-label="关闭"
              >
                ×
              </button>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
