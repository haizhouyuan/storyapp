/**
 * 故事音频播放器 - 支持长文本分段播放
 * 核心功能：
 * 1. 点击"朗读故事" → 3 秒内开始播放
 * 2. 拖动进度条 → 立即跳转到目标位置
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { StoryTtsSegment } from '../../../shared/types';

interface StoryAudioPlayerProps {
  storyId: string;
  segments: StoryTtsSegment[];
  totalDuration: number;
}

export const StoryAudioPlayer: React.FC<StoryAudioPlayerProps> = ({
  storyId,
  segments,
  totalDuration,
}) => {
  const [currentSegmentIndex, setCurrentSegmentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0); // 全局累积时间（秒）
  const [isLoading, setIsLoading] = useState(false);

  const audioRef = useRef<HTMLAudioElement>(null);
  const segmentStartTime = useRef(0); // 当前分段的起始时间（全局）

  const currentSegment = segments[currentSegmentIndex];

  // 监听音频时间更新
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateTime = () => {
      const globalTime = segmentStartTime.current + audio.currentTime;
      setCurrentTime(globalTime);
    };

    const handleCanPlay = () => {
      setIsLoading(false);
    };

    const handleWaiting = () => {
      setIsLoading(true);
    };

    audio.addEventListener('timeupdate', updateTime);
    audio.addEventListener('canplay', handleCanPlay);
    audio.addEventListener('waiting', handleWaiting);

    return () => {
      audio.removeEventListener('timeupdate', updateTime);
      audio.removeEventListener('canplay', handleCanPlay);
      audio.removeEventListener('waiting', handleWaiting);
    };
  }, [currentSegmentIndex]);

  // 自动切换到下一分段
  const handleSegmentEnd = useCallback(() => {
    if (currentSegmentIndex < segments.length - 1) {
      const nextIndex = currentSegmentIndex + 1;
      segmentStartTime.current += segments[currentSegmentIndex].duration;
      setCurrentSegmentIndex(nextIndex);
      // 无缝播放下一段
      setTimeout(() => {
        if (audioRef.current && isPlaying) {
          audioRef.current.play().catch((err) => {
            console.error('播放下一段失败:', err);
            setIsPlaying(false);
          });
        }
      }, 50);
    } else {
      setIsPlaying(false); // 全部播放完毕
    }
  }, [currentSegmentIndex, segments, isPlaying]);

  // 拖动进度条跳转
  const handleSeek = useCallback(
    (targetTime: number) => {
      let accumulatedTime = 0;

      for (let i = 0; i < segments.length; i++) {
        const segmentDuration = segments[i].duration;

        if (accumulatedTime + segmentDuration > targetTime) {
          // 目标时间在这个分段内
          setCurrentSegmentIndex(i);
          segmentStartTime.current = accumulatedTime;

          const offsetInSegment = targetTime - accumulatedTime;
          setTimeout(() => {
            if (audioRef.current) {
              audioRef.current.currentTime = offsetInSegment;
              if (isPlaying) {
                audioRef.current.play().catch((err) => {
                  console.error('跳转后播放失败:', err);
                  setIsPlaying(false);
                });
              }
            }
          }, 100);
          break;
        }

        accumulatedTime += segmentDuration;
      }
    },
    [segments, isPlaying]
  );

  // 播放/暂停切换
  const togglePlayPause = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (!currentSegment?.audioUrl) {
      console.warn('当前分段没有可播放的音频');
      return;
    }

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play().catch((err) => {
        console.error('播放失败:', err);
        setIsPlaying(false);
      });
      setIsPlaying(true);
    }
  };

  // 格式化时间显示
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // 如果当前分段有错误，显示错误信息
  if (currentSegment?.error) {
    return (
      <div className="story-audio-player bg-red-50 rounded-2xl shadow-lg p-6">
        <div className="text-center text-red-600">
          <p className="text-lg font-semibold">❌ 音频加载失败</p>
          <p className="text-sm mt-2">{currentSegment.error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="story-audio-player bg-white rounded-2xl shadow-lg p-6 max-w-2xl mx-auto">
      {/* 隐藏的音频元素 */}
      <audio
        ref={audioRef}
        src={currentSegment?.audioUrl ?? ''}
        onEnded={handleSegmentEnd}
        preload="auto"
      />

      {/* 章节标题显示 */}
      <div className="text-center mb-4">
        <h3 className="text-lg font-semibold text-gray-800">
          {currentSegment?.chapterTitle || '正在播放'}
        </h3>
        <p className="text-sm text-gray-500">
          第 {currentSegmentIndex + 1} / {segments.length} 段
          {currentSegment?.cached && ' · 已缓存'}
        </p>
      </div>

      {/* 进度条 */}
      <div className="mb-6">
        <input
          type="range"
          min={0}
          max={totalDuration}
          value={currentTime}
          onChange={(e) => handleSeek(Number(e.target.value))}
          className="w-full h-2 bg-blue-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
          style={{
            background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${
              (currentTime / totalDuration) * 100
            }%, #bfdbfe ${(currentTime / totalDuration) * 100}%, #bfdbfe 100%)`,
          }}
        />
        <div className="flex justify-between text-xs text-gray-600 mt-2">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(totalDuration)}</span>
        </div>
      </div>

      {/* 控制按钮 */}
      <div className="flex items-center justify-center gap-6">
        {/* 后退 15 秒 */}
        <button
          onClick={() => handleSeek(Math.max(0, currentTime - 15))}
          className="p-3 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors"
          title="后退 15 秒"
          disabled={isLoading}
        >
          <svg className="w-6 h-6 text-gray-700" fill="currentColor" viewBox="0 0 24 24">
            <path d="M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z" />
          </svg>
        </button>

        {/* 播放/暂停按钮 */}
        <button
          onClick={togglePlayPause}
          disabled={isLoading}
          className={`p-4 rounded-full shadow-lg transition-all ${
            isLoading
              ? 'bg-gray-300 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-700 hover:scale-105'
          }`}
        >
          {isLoading ? (
            <svg
              className="w-8 h-8 text-white animate-spin"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          ) : isPlaying ? (
            <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
            </svg>
          ) : (
            <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>

        {/* 前进 15 秒 */}
        <button
          onClick={() => handleSeek(Math.min(totalDuration, currentTime + 15))}
          className="p-3 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors"
          title="前进 15 秒"
          disabled={isLoading}
        >
          <svg className="w-6 h-6 text-gray-700" fill="currentColor" viewBox="0 0 24 24">
            <path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z" />
          </svg>
        </button>
      </div>

      {/* 调试信息（开发模式） */}
      {process.env.NODE_ENV === 'development' && (
        <details className="mt-4 text-xs text-gray-500">
          <summary className="cursor-pointer">🔧 调试信息</summary>
          <pre className="mt-2 p-2 bg-gray-100 rounded overflow-auto max-h-32">
            {JSON.stringify(
              {
                currentSegmentIndex,
                currentTime: currentTime.toFixed(2),
                segmentStartTime: segmentStartTime.current,
                audioCurrentTime: audioRef.current?.currentTime.toFixed(2),
                isPlaying,
                isLoading,
              },
              null,
              2
            )}
          </pre>
        </details>
      )}
    </div>
  );
};
