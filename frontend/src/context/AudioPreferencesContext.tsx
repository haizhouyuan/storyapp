import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { defaultPreferences, getUserPreferences, saveUserPreferences, UserPreferences } from '../utils/storage';

type AudioPreferencesContextValue = {
  preferences: UserPreferences;
  updatePreferences: (updates: Partial<UserPreferences>) => void;
  resetPreferences: () => void;
};

const AudioPreferencesContext = createContext<AudioPreferencesContextValue | undefined>(undefined);

export const AudioPreferencesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [preferences, setPreferences] = useState<UserPreferences>(() => getUserPreferences());

  const updatePreferences = useCallback((updates: Partial<UserPreferences>) => {
    setPreferences((prev) => {
      const next = { ...prev, ...updates };
      saveUserPreferences(next);
      return next;
    });
  }, []);

  const resetPreferences = useCallback(() => {
    saveUserPreferences(defaultPreferences);
    setPreferences({ ...defaultPreferences });
  }, []);

  const value = useMemo<AudioPreferencesContextValue>(() => ({
    preferences,
    updatePreferences,
    resetPreferences,
  }), [preferences, resetPreferences, updatePreferences]);

  return (
    <AudioPreferencesContext.Provider value={value}>
      {children}
    </AudioPreferencesContext.Provider>
  );
};

export const useAudioPreferences = (): AudioPreferencesContextValue => {
  const context = useContext(AudioPreferencesContext);
  if (!context) {
    throw new Error('useAudioPreferences 必须在 AudioPreferencesProvider 内使用');
  }
  return context;
};
