# TTS 长文本朗读功能改进方案

**场景**: 整篇故事朗读（3000-15000 字），支持进度条拖动、暂停/继续、倍速播放
**目标**: 提供类似喜马拉雅/微信读书的专业级音频阅读体验

---

## 🎯 核心问题分析

### 当前 TTS 系统的限制

#### 1. 单次合成长度限制
```typescript
// iFlytek API 限制（参考 iflytekTtsProvider.ts）
const MAX_TEXT_PER_REQUEST = 5000; // 字符数上限
```

**问题**：
- 一篇故事通常 5000-15000 字
- 超过上限会导致 API 拒绝或超时
- 即使成功，音频文件过大（100MB+），加载慢

#### 2. 缺少音频分段管理
```typescript
// 当前实现（frontend/src/hooks/useStoryTts.ts）
const synthesize = async (text: string, voice?: string) => {
  // ⚠️ 直接发送整篇文本，无分段逻辑
  const response = await fetch('/api/tts/synthesize', {
    method: 'POST',
    body: JSON.stringify({ text, voice }),
  });
};
```

**影响**：
- 无法支持进度条拖动（因为只有一个音频文件）
- 无法实现"跳转到第 3 章"功能
- 缓存效率低（修改一个字就要重新合成全文）

#### 3. 前端播放器功能缺失
```typescript
// 当前：仅返回 audioDataUrl，没有播放器组件
<audio src={audioDataUrl} />
```

**缺少**：
- 进度条显示（当前播放时间/总时长）
- 拖动跳转功能
- 倍速播放（0.75x, 1x, 1.25x, 1.5x, 2x）
- 章节跳转（"下一章"/"上一章"）
- 后台播放（切换页面时继续播放）

---

## 💡 具体改进方案

### 方案 1: 分段合成 + 无缝拼接（推荐）

#### 架构设计

```
完整故事（15000字）
    ↓
智能分段（按章节 + 段落）
    ↓
分段1 (1000字) → TTS API → audio1.mp3
分段2 (1200字) → TTS API → audio2.mp3
分段3 (900字)  → TTS API → audio3.mp3
    ...
    ↓
前端播放器无缝切换播放
```

#### 实现步骤

##### 1.1 后端：智能文本分段服务

```typescript
// backend/src/services/tts/textSegmenter.ts
export interface TextSegment {
  index: number;
  text: string;
  startOffset: number;
  endOffset: number;
  chapterTitle?: string;
  estimatedDuration: number; // 秒
}

export class StoryTextSegmenter {
  private maxSegmentLength = 1000; // 每段最多 1000 字

  /**
   * 智能分段：优先按章节分，超长章节再按段落分
   */
  segmentStory(fullText: string, chapterMarkers?: string[]): TextSegment[] {
    const segments: TextSegment[] = [];
    let currentOffset = 0;

    // 步骤 1: 按章节标记分割
    const chapters = this.splitByChapters(fullText, chapterMarkers);

    chapters.forEach((chapter, chapterIndex) => {
      if (chapter.text.length <= this.maxSegmentLength) {
        // 章节短，直接作为一段
        segments.push({
          index: segments.length,
          text: chapter.text,
          startOffset: currentOffset,
          endOffset: currentOffset + chapter.text.length,
          chapterTitle: chapter.title,
          estimatedDuration: this.estimateDuration(chapter.text),
        });
        currentOffset += chapter.text.length;
      } else {
        // 章节长，按段落拆分
        const paragraphs = this.splitByParagraphs(chapter.text);
        let buffer = '';

        paragraphs.forEach((para) => {
          if (buffer.length + para.length > this.maxSegmentLength && buffer) {
            // 缓冲区满了，保存为一段
            segments.push({
              index: segments.length,
              text: buffer,
              startOffset: currentOffset,
              endOffset: currentOffset + buffer.length,
              chapterTitle: chapter.title,
              estimatedDuration: this.estimateDuration(buffer),
            });
            currentOffset += buffer.length;
            buffer = para;
          } else {
            buffer += para;
          }
        });

        // 保存最后的缓冲区
        if (buffer) {
          segments.push({
            index: segments.length,
            text: buffer,
            startOffset: currentOffset,
            endOffset: currentOffset + buffer.length,
            chapterTitle: chapter.title,
            estimatedDuration: this.estimateDuration(buffer),
          });
          currentOffset += buffer.length;
        }
      }
    });

    return segments;
  }

  private splitByChapters(text: string, markers?: string[]) {
    // 检测章节标记：## 第X章 或 Chapter X
    const chapterRegex = /^##\s*第?\s*[0-9一二三四五六七八九十]+\s*章\s*(.*)$/gm;
    const chapters: { title: string; text: string }[] = [];
    let lastIndex = 0;
    let match;

    while ((match = chapterRegex.exec(text)) !== null) {
      if (lastIndex < match.index) {
        chapters.push({
          title: match[1] || `章节 ${chapters.length + 1}`,
          text: text.slice(lastIndex, match.index).trim(),
        });
      }
      lastIndex = match.index;
    }

    // 最后一个章节
    if (lastIndex < text.length) {
      chapters.push({
        title: `章节 ${chapters.length + 1}`,
        text: text.slice(lastIndex).trim(),
      });
    }

    return chapters.length > 0 ? chapters : [{ title: '全文', text }];
  }

  private splitByParagraphs(text: string): string[] {
    // 按段落分割（中文按句号、问号、感叹号）
    return text.split(/[。！？\n]+/).filter(Boolean).map((p) => p.trim() + '。');
  }

  private estimateDuration(text: string): number {
    // 中文朗读速度约 300 字/分钟（5 字/秒）
    return Math.ceil(text.length / 5);
  }
}
```

##### 1.2 后端：批量合成 API

```typescript
// backend/src/routes/tts.ts
router.post('/synthesize-story', async (req, res) => {
  const { storyId, fullText, chapterMarkers, voice, speed } = req.body;

  // 验证
  if (!fullText || typeof fullText !== 'string') {
    return res.status(400).json({ error: '缺少故事文本' });
  }

  try {
    const segmenter = new StoryTextSegmenter();
    const segments = segmenter.segmentStory(fullText, chapterMarkers);

    logger.info(`故事分段完成：${segments.length} 段`, { storyId });

    // 并行合成所有分段（加速处理）
    const synthesisPromises = segments.map(async (segment) => {
      const cacheKey = `story_${storyId}_seg_${segment.index}`;
      const cached = await ttsCache.get(cacheKey);

      if (cached) {
        logger.info(`分段 ${segment.index} 使用缓存`);
        return cached;
      }

      // 调用 TTS API
      const result = await ttsManager.synthesize(segment.text, {
        voice,
        speed,
        format: 'mp3',
      });

      // 保存到文件系统（便于 CDN 分发）
      const filename = `${storyId}_seg_${segment.index}.mp3`;
      await ttsCache.saveToFile(result, filename);

      // 缓存结果
      await ttsCache.set(cacheKey, result, 7 * 24 * 60 * 60); // 7 天

      return {
        segmentIndex: segment.index,
        audioUrl: `/api/tts/audio/${filename}`,
        duration: segment.estimatedDuration,
        startOffset: segment.startOffset,
        endOffset: segment.endOffset,
        chapterTitle: segment.chapterTitle,
      };
    });

    const audioSegments = await Promise.all(synthesisPromises);

    res.json({
      storyId,
      totalSegments: audioSegments.length,
      totalDuration: audioSegments.reduce((sum, seg) => sum + seg.duration, 0),
      segments: audioSegments,
    });
  } catch (error) {
    logger.error('故事合成失败:', error);
    res.status(500).json({ error: 'TTS 合成失败' });
  }
});

// 新增：获取音频文件
router.get('/audio/:filename', (req, res) => {
  const { filename } = req.params;
  const filepath = path.join(TTS_CACHE_DIR, filename);

  if (!fs.existsSync(filepath)) {
    return res.status(404).json({ error: '音频文件不存在' });
  }

  res.setHeader('Content-Type', 'audio/mpeg');
  res.setHeader('Cache-Control', 'public, max-age=604800'); // 7 天缓存
  fs.createReadStream(filepath).pipe(res);
});
```

##### 1.3 前端：专业音频播放器组件

```tsx
// frontend/src/components/StoryAudioPlayer.tsx
import React, { useState, useRef, useEffect } from 'react';

interface AudioSegment {
  segmentIndex: number;
  audioUrl: string;
  duration: number;
  startOffset: number;
  endOffset: number;
  chapterTitle?: string;
}

interface StoryAudioPlayerProps {
  storyId: string;
  segments: AudioSegment[];
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
  const [playbackRate, setPlaybackRate] = useState(1.0);

  const audioRef = useRef<HTMLAudioElement>(null);
  const segmentStartTime = useRef(0); // 当前分段的起始时间（全局）

  // 计算全局播放进度
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateTime = () => {
      const globalTime = segmentStartTime.current + audio.currentTime;
      setCurrentTime(globalTime);
    };

    audio.addEventListener('timeupdate', updateTime);
    return () => audio.removeEventListener('timeupdate', updateTime);
  }, [currentSegmentIndex]);

  // 自动切换到下一分段
  const handleSegmentEnd = () => {
    if (currentSegmentIndex < segments.length - 1) {
      const nextIndex = currentSegmentIndex + 1;
      segmentStartTime.current += segments[currentSegmentIndex].duration;
      setCurrentSegmentIndex(nextIndex);
      // 无缝播放下一段
      setTimeout(() => audioRef.current?.play(), 50);
    } else {
      setIsPlaying(false); // 全部播放完毕
    }
  };

  // 拖动进度条跳转
  const handleSeek = (targetTime: number) => {
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
            if (isPlaying) audioRef.current.play();
          }
        }, 100);
        break;
      }

      accumulatedTime += segmentDuration;
    }
  };

  // 章节跳转
  const jumpToChapter = (chapterTitle: string) => {
    const targetSegment = segments.find((seg) => seg.chapterTitle === chapterTitle);
    if (targetSegment) {
      const targetTime = segments
        .slice(0, targetSegment.segmentIndex)
        .reduce((sum, seg) => sum + seg.duration, 0);
      handleSeek(targetTime);
    }
  };

  const togglePlayPause = () => {
    if (isPlaying) {
      audioRef.current?.pause();
    } else {
      audioRef.current?.play();
    }
    setIsPlaying(!isPlaying);
  };

  const changeSpeed = (rate: number) => {
    setPlaybackRate(rate);
    if (audioRef.current) {
      audioRef.current.playbackRate = rate;
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="story-audio-player bg-white rounded-2xl shadow-lg p-6">
      {/* 隐藏的音频元素（实际播放器） */}
      <audio
        ref={audioRef}
        src={segments[currentSegmentIndex]?.audioUrl}
        onEnded={handleSegmentEnd}
        preload="auto"
      />

      {/* 章节标题显示 */}
      <div className="text-center mb-4">
        <h3 className="text-lg font-semibold text-gray-800">
          {segments[currentSegmentIndex]?.chapterTitle || '正在播放'}
        </h3>
        <p className="text-sm text-gray-500">
          第 {currentSegmentIndex + 1}/{segments.length} 段
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
        />
        <div className="flex justify-between text-xs text-gray-600 mt-2">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(totalDuration)}</span>
        </div>
      </div>

      {/* 控制按钮 */}
      <div className="flex items-center justify-center gap-4 mb-4">
        {/* 后退 15 秒 */}
        <button
          onClick={() => handleSeek(Math.max(0, currentTime - 15))}
          className="p-3 rounded-full bg-gray-100 hover:bg-gray-200"
          title="后退 15 秒"
        >
          <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z" />
            <text x="9" y="15" fontSize="8" fontWeight="bold">15</text>
          </svg>
        </button>

        {/* 播放/暂停 */}
        <button
          onClick={togglePlayPause}
          className="p-4 rounded-full bg-blue-600 text-white hover:bg-blue-700 shadow-lg"
        >
          {isPlaying ? (
            <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
            </svg>
          ) : (
            <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>

        {/* 前进 15 秒 */}
        <button
          onClick={() => handleSeek(Math.min(totalDuration, currentTime + 15))}
          className="p-3 rounded-full bg-gray-100 hover:bg-gray-200"
          title="前进 15 秒"
        >
          <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 5V1l5 5-5 5V7c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6h2c0 4.42-3.58 8-8 8s-8-3.58-8-8 3.58-8 8-8z" />
            <text x="9" y="15" fontSize="8" fontWeight="bold">15</text>
          </svg>
        </button>
      </div>

      {/* 倍速控制 */}
      <div className="flex items-center justify-center gap-2 mb-4">
        <span className="text-sm text-gray-600">倍速:</span>
        {[0.75, 1.0, 1.25, 1.5, 2.0].map((rate) => (
          <button
            key={rate}
            onClick={() => changeSpeed(rate)}
            className={`px-3 py-1 rounded-full text-sm ${
              playbackRate === rate
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {rate}x
          </button>
        ))}
      </div>

      {/* 章节列表（可折叠） */}
      <details className="mt-4">
        <summary className="cursor-pointer text-sm text-gray-600 font-medium">
          📖 章节列表 ({new Set(segments.map((s) => s.chapterTitle)).size} 章)
        </summary>
        <ul className="mt-2 space-y-2 max-h-48 overflow-y-auto">
          {Array.from(new Set(segments.map((s) => s.chapterTitle))).map((title) => (
            <li
              key={title}
              onClick={() => jumpToChapter(title || '')}
              className="cursor-pointer px-3 py-2 rounded-lg hover:bg-blue-50 text-sm"
            >
              {title}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
};
```

##### 1.4 前端：使用示例

```tsx
// frontend/src/pages/StoryPage.tsx
import { StoryAudioPlayer } from '../components/StoryAudioPlayer';

const StoryPage = () => {
  const [audioData, setAudioData] = useState(null);

  const handleLoadAudio = async (storyId: string) => {
    const response = await fetch('/api/tts/synthesize-story', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        storyId,
        fullText: storyContent, // 完整故事文本
        chapterMarkers: ['## 第一章', '## 第二章'], // 可选
        voice: 'xiaoyan',
        speed: 1.0,
      }),
    });

    const data = await response.json();
    setAudioData(data);
  };

  return (
    <div>
      <button onClick={() => handleLoadAudio('story-123')}>
        🔊 朗读整篇故事
      </button>

      {audioData && (
        <StoryAudioPlayer
          storyId={audioData.storyId}
          segments={audioData.segments}
          totalDuration={audioData.totalDuration}
        />
      )}
    </div>
  );
};
```

---

## 📊 性能优化策略

### 1. 预合成 + CDN 分发

```typescript
// 预合成策略：故事发布时预生成音频
async function presynthesizeStory(storyId: string) {
  const story = await getStoryById(storyId);

  // 后台任务：分段合成
  const segments = segmenter.segmentStory(story.content);

  for (const segment of segments) {
    await ttsManager.synthesize(segment.text, { voice: 'xiaoyan' });
  }

  // 上传到 CDN（阿里云 OSS/AWS S3）
  await uploadToCdn(storyId, segments);
}
```

**优势**：
- 用户点击"朗读"时无需等待合成
- 音频文件通过 CDN 加速下载
- 减轻服务器实时合成压力

### 2. 渐进式加载（边播边下载）

```typescript
// 只预加载前 3 个分段，后续动态加载
const [loadedSegments, setLoadedSegments] = useState([]);

useEffect(() => {
  // 预加载当前分段 + 前后各 1 段
  const toLoad = [
    currentSegmentIndex - 1,
    currentSegmentIndex,
    currentSegmentIndex + 1,
  ].filter((i) => i >= 0 && i < segments.length);

  toLoad.forEach((index) => {
    if (!loadedSegments.includes(index)) {
      preloadAudio(segments[index].audioUrl);
    }
  });
}, [currentSegmentIndex]);
```

### 3. 缓存策略

```typescript
// 三层缓存
1. 浏览器缓存（Service Worker）
   → 离线播放支持

2. 服务器文件缓存（/tmp/tts-cache）
   → 避免重复 API 调用

3. CDN 缓存（7 天 TTL）
   → 全球加速
```

---

## 🎨 UI/UX 增强建议

### 1. 睡前模式优化

```tsx
// 定时关闭功能
<select onChange={(e) => setSleepTimer(Number(e.target.value))}>
  <option value={0}>不自动关闭</option>
  <option value={15}>15 分钟后关闭</option>
  <option value={30}>30 分钟后关闭</option>
  <option value={60}>1 小时后关闭</option>
</select>

// 夜间模式（降低屏幕亮度）
<button onClick={() => setNightMode(!nightMode)}>
  🌙 夜间模式
</button>
```

### 2. 后台播放支持

```typescript
// 使用 Media Session API（支持锁屏控制）
if ('mediaSession' in navigator) {
  navigator.mediaSession.metadata = new MediaMetadata({
    title: story.title,
    artist: '智能朗读',
    artwork: [
      { src: story.coverImage, sizes: '512x512', type: 'image/png' },
    ],
  });

  navigator.mediaSession.setActionHandler('play', () => {
    audioRef.current?.play();
  });

  navigator.mediaSession.setActionHandler('pause', () => {
    audioRef.current?.pause();
  });

  navigator.mediaSession.setActionHandler('seekbackward', () => {
    handleSeek(currentTime - 15);
  });

  navigator.mediaSession.setActionHandler('seekforward', () => {
    handleSeek(currentTime + 15);
  });
}
```

### 3. 进度同步（跨设备）

```typescript
// 保存播放进度到服务器
const saveProgress = async (storyId: string, currentTime: number) => {
  await fetch('/api/user/progress', {
    method: 'POST',
    body: JSON.stringify({ storyId, audioProgress: currentTime }),
  });
};

// 页面加载时恢复进度
useEffect(() => {
  const restoreProgress = async () => {
    const progress = await fetch(`/api/user/progress/${storyId}`);
    const data = await progress.json();
    if (data.audioProgress) {
      handleSeek(data.audioProgress);
    }
  };
  restoreProgress();
}, [storyId]);
```

---

## 🚀 实施优先级

### P0 - 核心功能（2 周）

- [ ] 后端文本分段服务（`textSegmenter.ts`）
- [ ] 批量合成 API（`POST /api/tts/synthesize-story`）
- [ ] 前端播放器组件（`StoryAudioPlayer.tsx`）
- [ ] 进度条拖动 + 暂停/播放
- [ ] 倍速播放（0.75x - 2x）

### P1 - 性能优化（1 周）

- [ ] 预合成机制（故事发布时后台任务）
- [ ] CDN 集成（阿里云 OSS）
- [ ] 渐进式加载（边播边下载）
- [ ] 浏览器缓存（Service Worker）

### P2 - 体验增强（1 周）

- [ ] 章节跳转功能
- [ ] 定时关闭（睡前模式）
- [ ] 后台播放支持（Media Session API）
- [ ] 进度同步（跨设备）
- [ ] 夜间模式

---

## 📝 关键技术决策

### 1. 分段大小：1000 字 vs 500 字？

| 分段大小 | 优势 | 劣势 |
|----------|------|------|
| **1000 字** | 分段少（10-15 段），缓存效率高 | 跳转精度较低 |
| **500 字** | 跳转精度高，加载快 | 分段多（30 段），HTTP 请求多 |

**推荐**：1000 字（优先缓存效率，用户很少需要精确到 500 字跳转）

### 2. 音频格式：MP3 vs PCM？

| 格式 | 文件大小 | 兼容性 | 质量 |
|------|----------|--------|------|
| **MP3** | 小（10KB/秒） | 所有浏览器 | 有损压缩 |
| **PCM/WAV** | 大（176KB/秒） | 所有浏览器 | 无损 |

**推荐**：MP3（故事朗读对音质要求不高，文件大小更重要）

### 3. 预合成 vs 实时合成？

| 策略 | 优势 | 劣势 |
|------|------|------|
| **预合成** | 响应快（无等待），减轻服务器负载 | 占用存储空间，修改故事需重新合成 |
| **实时合成** | 节省存储，灵活 | 首次播放等待时间长（30-60 秒） |

**推荐**：混合策略
- 发布的故事：预合成（后台任务）
- 草稿故事：实时合成（首次播放缓存）

---

## 🔧 代码修改清单

### 新增文件

```
backend/src/services/tts/
  ├── textSegmenter.ts          (文本分段服务)
  └── presynthesizer.ts         (预合成任务)

frontend/src/components/
  └── StoryAudioPlayer.tsx      (专业播放器组件)
```

### 修改文件

```diff
# backend/src/routes/tts.ts
+ router.post('/synthesize-story', async (req, res) => { /* 批量合成 */ });
+ router.get('/audio/:filename', (req, res) => { /* 获取音频文件 */ });

# frontend/src/pages/StoryPage.tsx
+ import { StoryAudioPlayer } from '../components/StoryAudioPlayer';
+ const [audioData, setAudioData] = useState(null);
```

---

## 📚 参考示例

### 类似产品对比

| 功能 | 喜马拉雅 | 微信读书 | **我们的方案** |
|------|----------|----------|----------------|
| 分段播放 | ✅ | ✅ | ✅ |
| 进度条拖动 | ✅ | ✅ | ✅ |
| 倍速播放 | ✅ (0.5x-3x) | ✅ (0.8x-2x) | ✅ (0.75x-2x) |
| 章节跳转 | ✅ | ✅ | ✅ |
| 定时关闭 | ✅ | ✅ | ✅ (P2) |
| 后台播放 | ✅ | ✅ | ✅ (P2) |
| 离线下载 | ✅ | ✅ | ⏳ (未来) |

---

## ✅ 验收标准

### 功能测试

- [ ] 15000 字故事完整朗读无中断
- [ ] 拖动进度条到任意位置，继续播放正确
- [ ] 切换倍速（1x → 1.5x → 2x）流畅无卡顿
- [ ] 点击"下一章"正确跳转
- [ ] 关闭页面再打开，进度正确恢复

### 性能测试

- [ ] 首次播放等待时间 < 3 秒
- [ ] 分段切换无明显停顿（< 100ms）
- [ ] 内存占用 < 100MB（播放 15000 字故事）
- [ ] CDN 命中率 > 95%

### 兼容性测试

- [ ] Chrome/Safari/Firefox 正常播放
- [ ] iOS Safari 后台播放正常
- [ ] Android Chrome 后台播放正常
- [ ] 锁屏控制（Media Session）正常

---

**总结**：通过分段合成 + 专业播放器组件，可以实现媲美喜马拉雅/微信读书的长文本朗读体验。核心是将长文本智能分段（1000 字/段），前端无缝拼接播放，支持进度条拖动、倍速、章节跳转等功能。

**预计工作量**：
- P0 核心功能：2 周（1 个后端开发 + 1 个前端开发）
- P1 性能优化：1 周
- P2 体验增强：1 周

**建议优先实现 P0 功能**，验证用户接受度后再投入 P1/P2 优化。
