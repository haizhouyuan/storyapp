import React, { useEffect, useMemo, useState } from 'react';
import type { TtsVoiceOption, TtsVoicesResponse } from '../../../shared/types';
import { PointsModal } from './points';
import Button from './Button';
import { fetchTtsVoices } from '../utils/api';
import { useAudioPreferences } from '../context/AudioPreferencesContext';

interface AudioSettingsModalProps {
  open: boolean;
  onClose: () => void;
}

const SPEED_MIN = 0.5;
const SPEED_MAX = 2;
const PITCH_MIN = 0.5;
const PITCH_MAX = 2;

const toPercent = (value: number, min: number, max: number) => ((value - min) / (max - min)) * 100;
const fromPercent = (percent: number, min: number, max: number) => min + (percent / 100) * (max - min);

const AudioSettingsModal: React.FC<AudioSettingsModalProps> = ({ open, onClose }) => {
  const { preferences, updatePreferences, resetPreferences } = useAudioPreferences();
  const [voices, setVoices] = useState<TtsVoiceOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    let mounted = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const response: TtsVoicesResponse = await fetchTtsVoices();
        if (mounted) {
          setVoices(response.voices || []);
        }
      } catch (err: any) {
        if (mounted) {
          setError(err?.message || '获取语音列表失败');
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();
    return () => {
      mounted = false;
    };
  }, [open]);

  const selectedVoice = useMemo(() => {
    return voices.find((voice) => voice.id === preferences.voiceId) || voices[0];
  }, [preferences.voiceId, voices]);

  const handleSpeedChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const percent = Number(event.target.value);
    const value = Math.round(fromPercent(percent, SPEED_MIN, SPEED_MAX) * 100) / 100;
    updatePreferences({ speechSpeed: value });
  };

  const handlePitchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const percent = Number(event.target.value);
    const value = Math.round(fromPercent(percent, PITCH_MIN, PITCH_MAX) * 100) / 100;
    updatePreferences({ speechPitch: value });
  };

  const handleVoiceChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    updatePreferences({ voiceId: event.target.value });
  };

  const handleToggle = (key: 'autoPlay' | 'showTranscript' | 'mute' | 'soundEnabled') => {
    updatePreferences({ [key]: !preferences[key] } as Partial<typeof preferences>);
  };

  return (
    <PointsModal open={open} onClose={onClose} ariaLabel="语音播放设置">
      <div className="space-y-6">
        <header className="space-y-2">
          <h2 className="text-lg font-semibold text-points-text-strong">语音播放设置</h2>
          <p className="text-sm text-points-text-muted">为孩子选择合适的音色与播放方式。</p>
        </header>

        {loading && <p className="text-sm text-points-text-muted">正在加载可用音色...</p>}
        {error && <p className="text-sm text-red-500">{error}</p>}

        <div className="space-y-2">
          <label className="block text-sm font-medium text-points-text-strong">音色选择</label>
          <select
            className="w-full rounded-lg border border-points-border/60 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-points-primary/60"
            value={selectedVoice?.id || preferences.voiceId || ''}
            onChange={handleVoiceChange}
            aria-label="选择语音合成音色"
          >
            {voices.map((voice) => (
              <option key={voice.id} value={voice.id}>
                {voice.name} · {voice.language}
              </option>
            ))}
            {voices.length === 0 && <option value="">默认音色</option>}
          </select>
          {selectedVoice?.description && (
            <p className="text-xs text-points-text-muted">{selectedVoice.description}</p>
          )}
        </div>

        <div className="space-y-3">
          <label className="block text-sm font-medium text-points-text-strong" htmlFor="speech-speed">语速</label>
          <input
            id="speech-speed"
            type="range"
            min={0}
            max={100}
            value={toPercent(preferences.speechSpeed, SPEED_MIN, SPEED_MAX)}
            onChange={handleSpeedChange}
            className="w-full"
            aria-valuemin={SPEED_MIN}
            aria-valuemax={SPEED_MAX}
            aria-valuenow={preferences.speechSpeed}
          />
          <p className="text-xs text-points-text-muted">当前语速：{preferences.speechSpeed.toFixed(2)}x</p>
        </div>

        <div className="space-y-3">
          <label className="block text-sm font-medium text-points-text-strong" htmlFor="speech-pitch">音调</label>
          <input
            id="speech-pitch"
            type="range"
            min={0}
            max={100}
            value={toPercent(preferences.speechPitch, PITCH_MIN, PITCH_MAX)}
            onChange={handlePitchChange}
            className="w-full"
            aria-valuemin={PITCH_MIN}
            aria-valuemax={PITCH_MAX}
            aria-valuenow={preferences.speechPitch}
          />
          <p className="text-xs text-points-text-muted">当前音调：{preferences.speechPitch.toFixed(2)}</p>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-points-text-strong">自动播放下一段</span>
            <button
              type="button"
              onClick={() => handleToggle('autoPlay')}
              className={`points-focus inline-flex h-6 w-11 items-center rounded-full transition ${preferences.autoPlay ? 'bg-points-primary' : 'bg-gray-300'}`}
              role="switch"
              aria-checked={preferences.autoPlay}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white transition ${preferences.autoPlay ? 'translate-x-5' : 'translate-x-1'}`}
              />
            </button>
          </div>
          <p className="text-xs text-points-text-muted">开启后生成新段落时自动开始朗读。</p>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-points-text-strong">显示字幕</span>
            <button
              type="button"
              onClick={() => handleToggle('showTranscript')}
              className={`points-focus inline-flex h-6 w-11 items-center rounded-full transition ${preferences.showTranscript ? 'bg-points-primary' : 'bg-gray-300'}`}
              role="switch"
              aria-checked={preferences.showTranscript}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white transition ${preferences.showTranscript ? 'translate-x-5' : 'translate-x-1'}`}
              />
            </button>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-points-text-strong">静音（保留字幕）</span>
            <button
              type="button"
              onClick={() => handleToggle('mute')}
              className={`points-focus inline-flex h-6 w-11 items-center rounded-full transition ${preferences.mute ? 'bg-points-primary' : 'bg-gray-300'}`}
              role="switch"
              aria-checked={preferences.mute}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white transition ${preferences.mute ? 'translate-x-5' : 'translate-x-1'}`}
              />
            </button>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-points-text-strong">界面提示音效</span>
            <button
              type="button"
              onClick={() => handleToggle('soundEnabled')}
              className={`points-focus inline-flex h-6 w-11 items-center rounded-full transition ${preferences.soundEnabled ? 'bg-points-primary' : 'bg-gray-300'}`}
              role="switch"
              aria-checked={preferences.soundEnabled}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white transition ${preferences.soundEnabled ? 'translate-x-5' : 'translate-x-1'}`}
              />
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 pt-4">
          <Button variant="ghost" onClick={resetPreferences} size="small">
            恢复默认设置
          </Button>
          <div className="flex gap-3">
            <Button variant="ghost" onClick={onClose} size="small">
              取消
            </Button>
            <Button variant="primary" onClick={onClose} size="small">
              保存
            </Button>
          </div>
        </div>
      </div>
    </PointsModal>
  );
};

export default AudioSettingsModal;
