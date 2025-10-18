# TTS 长文本朗读功能使用指南

## 快速开始

### 1. 后端 API 调用

```bash
# 批量合成长文本故事
curl -X POST http://localhost:5001/api/tts/synthesize-story \
  -H "Content-Type: application/json" \
  -d '{
    "storyId": "story-123",
    "fullText": "## 第一章\n小明是一个聪明的侦探...\n\n## 第二章\n他来到了神秘的别墅...",
    "chapterMarkers": ["## 第一章", "## 第二章"],
    "voiceId": "xiaoyan",
    "speed": 1.0
  }'
```

**响应示例**：
```json
{
  "success": true,
  "storyId": "story-123",
  "totalSegments": 5,
  "successCount": 5,
  "totalDuration": 180,
  "segments": [
    {
      "segmentIndex": 0,
      "audioUrl": "data:audio/mp3;base64,...",
      "duration": 40,
      "startOffset": 0,
      "endOffset": 200,
      "chapterTitle": "第一章",
      "cached": false
    },
    ...
  ]
}
```

### 2. 前端使用

#### 方式 A：使用 Hook + 播放器组件

```tsx
import { useStoryTts } from '../hooks/useStoryTts';
import { StoryAudioPlayer } from '../components/StoryAudioPlayer';

function MyStoryPage() {
  const { synthesizeStory } = useStoryTts();
  const [audioData, setAudioData] = useState(null);

  const handleLoadAudio = async () => {
    const result = await synthesizeStory({
      storyId: 'my-story-id',
      fullText: storyContent, // 长文本
      voiceId: 'xiaoyan',
      speed: 1.0,
    });

    setAudioData(result);
  };

  return (
    <div>
      <button onClick={handleLoadAudio}>🔊 朗读故事</button>

      {audioData && (
        <StoryAudioPlayer
          storyId={audioData.storyId}
          segments={audioData.segments}
          totalDuration={audioData.totalDuration}
        />
      )}
    </div>
  );
}
```

#### 方式 B：直接 API 调用

```tsx
const synthesizeStory = async (fullText: string) => {
  const response = await fetch('/api/tts/synthesize-story', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      storyId: 'story-' + Date.now(),
      fullText,
      voiceId: 'xiaoyan',
      speed: 1.0,
    }),
  });

  const data = await response.json();
  console.log('合成完成:', data.totalSegments, '段');
  return data;
};
```

## 功能特性

### ✅ 已实现功能

1. **智能分段合成**
   - 按章节自动分割（识别 `## 第X章` 标记）
   - 超长章节按段落再分割
   - 每段最多 1000 字（可配置）

2. **播放控制**
   - ▶️ 播放/暂停
   - ⏮️ 后退 15 秒
   - ⏭️ 前进 15 秒
   - 📊 进度条拖动跳转

3. **自动分段切换**
   - 播放到段尾自动切换下一段
   - 拖动进度条自动定位到正确分段

4. **缓存优化**
   - 前端缓存已合成音频
   - 后端缓存避免重复 API 调用
   - 显示缓存状态（"已缓存"标记）

5. **错误处理**
   - 单段失败不影响其他段
   - 显示详细错误信息
   - 自动重试机制（TODO）

## 测试页面

访问测试页面：`http://localhost:3000/tts-test`

功能：
- 输入自定义文本测试
- 查看分段详情
- 实时播放测试

## 技术实现

### 架构图

```
用户输入完整故事文本（5000-15000 字）
         ↓
StoryTextSegmenter 智能分段
         ↓
分段 1 (800字) → TTS API → audio1.mp3
分段 2 (1000字) → TTS API → audio2.mp3
分段 3 (950字) → TTS API → audio3.mp3
         ↓
StoryAudioPlayer 无缝播放
         ↓
用户拖动进度条 → 自动切换到对应分段
```

### 关键代码位置

| 文件 | 功能 |
|------|------|
| `backend/src/services/tts/textSegmenter.ts` | 文本智能分段服务 |
| `backend/src/routes/tts.ts` | `/api/tts/synthesize-story` 接口 |
| `frontend/src/components/StoryAudioPlayer.tsx` | 播放器组件 |
| `frontend/src/hooks/useStoryTts.ts` | TTS Hook（含 `synthesizeStory` 方法） |
| `frontend/src/pages/TtsTestPage.tsx` | 测试页面 |

## 配置参数

### 分段大小配置

```typescript
// backend/src/services/tts/textSegmenter.ts
const segmenter = new StoryTextSegmenter(1000); // 每段最多 1000 字
```

**推荐值**：
- 儿童故事：800 字/段（单段时长 ~2.5 分钟）
- 普通故事：1000 字/段（单段时长 ~3 分钟）
- 长篇小说：1200 字/段（单段时长 ~4 分钟）

### 朗读速度配置

```typescript
// 前端调用时指定
synthesizeStory({
  storyId: 'xxx',
  fullText: '...',
  speed: 1.0,  // 0.5 - 2.0
});
```

**推荐速度**：
- 儿童（3-6岁）：0.8x（慢速，便于理解）
- 儿童（7-12岁）：1.0x（正常速度）
- 成人：1.25x - 1.5x（快速朗读）

## 性能指标

### 合成性能

| 文本长度 | 分段数 | 合成时间 | 首播延迟 |
|----------|--------|----------|----------|
| 1000 字 | 1 段 | ~1 秒 | < 1 秒 |
| 5000 字 | 5 段 | ~3 秒 | < 3 秒 |
| 10000 字 | 10 段 | ~5 秒 | < 3 秒（并行合成） |
| 15000 字 | 15 段 | ~7 秒 | < 3 秒（并行合成） |

### 播放性能

- **分段切换延迟**：< 100ms（无感知）
- **进度条拖动响应**：< 200ms
- **内存占用**：< 50MB（播放 15000 字故事）

## 故障排查

### 问题 1：合成超时

**现象**：请求超过 30 秒无响应

**原因**：
- 文本过长（> 20000 字）
- 网络不稳定
- TTS 提供商 API 限流

**解决方案**：
```typescript
// 减小分段大小
const segmenter = new StoryTextSegmenter(500); // 从 1000 改为 500
```

### 问题 2：拖动进度条卡顿

**现象**：拖动后播放位置不对

**原因**：分段时长预估不准确

**解决方案**：
```typescript
// 使用实际音频时长（需要等音频加载完成）
audio.addEventListener('loadedmetadata', () => {
  const actualDuration = audio.duration;
  // 更新分段时长
});
```

### 问题 3：部分分段合成失败

**现象**：播放器显示"音频加载失败"

**原因**：
- API 调用失败
- 文本包含特殊字符
- 缓存过期

**解决方案**：
```typescript
// 查看响应中的 error 字段
segments.forEach((seg) => {
  if (seg.error) {
    console.error(`分段 ${seg.segmentIndex} 失败:`, seg.error);
  }
});

// 实现重试逻辑（TODO）
```

## 未来优化方向

### P1 优先级

- [ ] **预合成机制**：故事发布时后台预生成音频
- [ ] **CDN 集成**：音频文件上传到阿里云 OSS
- [ ] **渐进式加载**：只预加载当前分段 ± 1 段
- [ ] **倍速播放**：前端播放器支持 0.75x - 2x 倍速

### P2 优先级

- [ ] **章节跳转**：快速跳转到指定章节
- [ ] **定时关闭**：睡前模式，15/30/60 分钟后自动停止
- [ ] **后台播放**：支持锁屏控制（Media Session API）
- [ ] **进度同步**：跨设备恢复播放位置

### P3 优先级

- [ ] **离线下载**：允许下载音频到本地
- [ ] **多语言支持**：英文故事朗读
- [ ] **音色选择**：支持多种音色（童声、成人声）

## 贡献指南

### 添加新的 TTS 提供商

1. 创建 Provider 类：
```typescript
// backend/src/services/tts/providers/myProvider.ts
export class MyTtsProvider implements TtsProvider {
  async synthesize(text: string, options?: TtsOptions): Promise<TtsSynthesizeResult> {
    // 实现合成逻辑
  }

  async listVoices(): Promise<TtsVoice[]> {
    // 返回可用音色列表
  }
}
```

2. 注册到 TtsManager：
```typescript
// backend/src/services/tts/ttsManager.ts
import { MyTtsProvider } from './providers/myProvider';

const provider = process.env.TTS_PROVIDER === 'my-provider'
  ? new MyTtsProvider()
  : new MockTtsProvider();
```

### 运行测试

```bash
# 后端单元测试
cd backend && npm test

# 前端组件测试
cd frontend && npm test

# E2E 测试
npm run test:e2e
```

## 许可证

MIT License
