import React from 'react';
import { Toaster } from 'react-hot-toast';

export function PointsToaster() {
  return (
    <Toaster
      position="top-center"
      toastOptions={{
        duration: 3500,
        style: {
          background: 'rgba(255, 255, 255, 0.92)',
          color: 'rgb(var(--points-text))',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid rgba(var(--points-border), 0.6)',
          boxShadow: 'var(--shadow-soft)',
          padding: '14px 18px',
          fontWeight: 600,
          fontFamily: 'Quicksand, Nunito, sans-serif',
        },
        success: {
          iconTheme: {
            primary: 'rgb(var(--points-success))',
            secondary: '#ffffff',
          },
        },
        error: {
          iconTheme: {
            primary: 'rgb(var(--points-danger))',
            secondary: '#ffffff',
          },
        },
      }}
    />
  );
}
