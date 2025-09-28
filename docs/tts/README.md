# Text-to-Speech (TTS) 接入方案

本文件描述 `storyapp` 项目语音合成链路的阶段性规划、环境变量、供应商对接与验证要点。当前阶段默认启用 Mock Provider，后续可逐步切换至阿里云或科大讯飞。

## 1. 架构概览

```
客户端 (React)
  ├─ useStoryTts Hook → 调用 `/api/tts`
  ├─ useStoryAudio Hook → 管理播放 / 降级
  └─ AudioPreferenceContext → 本地化用户偏好

后端 (Node/Express)
  ├─ routes/tts.ts → 请求校验、限流、响应包装
  ├─ services/tts/
  │   ├─ TtsManager → 缓存、日志、指标
  │   ├─ providers/mockTtsProvider.ts
  │   ├─ providers/alicloudTtsProvider.ts (mock 实现)
  │   └─ providers/iflytekTtsProvider.ts (mock 实现)
  ├─ 缓存：InMemoryTtsCache (可替换 Redis/OSS)
  └─ 监控：Prometheus 指标 `storyapp_tts_*`
``` 

## 2. 环境变量

在 `.env` / `.env.local` 中新增以下配置（示例见仓库根目录 `.env.example`）：

| 变量 | 说明 | 默认值 |
| --- | --- | --- |
| `TTS_PROVIDER` | 当前启用的 Provider (`mock` / `alicloud` / `iflytek`) | `mock` |
| `TTS_CACHE_TTL` | 音频缓存有效期（秒） | `300` |
| `TTS_RATE_LIMIT_WINDOW` | 限流窗口（毫秒） | `60000` |
| `TTS_RATE_LIMIT_MAX` | 单窗口最大请求数 | `10` |
| `TTS_AUDIO_BASE_URL` | 音频文件访问前缀（接入对象存储时使用） | `http://localhost:5001/static/tts` |
| `ALICLOUD_TTS_APP_KEY` | 阿里云 APP Key | `-` |
| `ALICLOUD_TTS_ACCESS_KEY_ID` | 阿里云 AccessKeyId | `-` |
| `ALICLOUD_TTS_ACCESS_KEY_SECRET` | 阿里云 AccessKeySecret | `-` |
| `IFLYTEK_TTS_APP_ID` | 讯飞 APPID | `-` |
| `IFLYTEK_TTS_API_KEY` | 讯飞 APIKey | `-` |
| `IFLYTEK_TTS_API_SECRET` | 讯飞 APISecret | `-` |

> 科大讯飞长文本语音合成（`/home/yuanhaizhou/projects/tmuxagent/docs/语音合成key.md`）提供了鉴权签名与 Demo，可在接入阶段复用。

## 3. Provider 阶段性说明

| Provider | 当前状态 | 下一步计划 |
| --- | --- | --- |
| Mock | 生成 WAV Data URL，便于本地联调 | 支持自定义音色和语速模拟 |
| 阿里云 | 类 `alicloudTtsProvider.ts` 现阶段复用 Mock 结果 | 引入开放平台 SDK / HTTP API，封装 Token 缓存与重试策略 |
| 科大讯飞 | 类 `iflytekTtsProvider.ts` 复用 Mock 结果 | 按文档实现 HMAC-SHA256 鉴权、`dts_create` / `dts_query` 轮询 |

所有 Provider 均通过 `TtsManager` 进行统一缓存、日志和指标上报，便于后续替换。

## 4. 缓存与限流

- **缓存**：默认使用内存缓存，键值为 `hash(text|voice|speed|pitch|format)`，TTL 同 `TTS_CACHE_TTL`。
  - 后续可替换成 Redis、OSS/OBS 或文件系统，需在 `services/tts/factory.ts` 中注入新的 `cacheDriver`。
- **限流**：`ttsRateLimit` 在 `/api/tts` 生效，命中时返回 `429`，并写入 Prometheus `storyapp_rate_limit_hits_total`。
- **指标**：
  - `storyapp_tts_requests_total{provider,cached}`
  - `storyapp_tts_latency_seconds{provider}`
  - `storyapp_tts_errors_total{provider,reason}`

## 5. 日志

`backend/src/utils/logger.ts` 新增 TTS 事件：

- `tts_request_received`
- `tts_cache_hit`
- `tts_provider_response`
- `tts_response_sent`
- `tts_error`

所有日志落地 `story_logs`（如启用 DB logging），便于 Appsmith 后台展示。

## 6. 上线前检查

1. **凭证**：通过运维流程申请阿里云、讯飞账号，将密钥存放在服务器 KMS/密钥库，不直接写入仓库。
2. **鉴权**：完成阿里云 STS/AK 签名、讯飞 HMAC-SHA256 实现，并补充单元测试。
3. **存储**：选择音频持久化策略（OSS、COS 或本地挂载），更新 `TTS_AUDIO_BASE_URL`。
4. **监控**：更新 Appsmith 仪表盘，新增请求量、缓存命中率、错误类型图表。
5. **压测**：使用 `k6`/`artillery` 模拟真实文本长度，验证限流与成本预估。

## 7. 参考资料

- 讯飞长文本语音合成鉴权：`/home/yuanhaizhou/projects/tmuxagent/docs/语音合成key.md`
- 日志系统说明：`README_LOGGING_SYSTEM.md`
- 监控后台配置：`appsmith-story-admin.json`

如需更新此文档，请同步在 PR 中列出变更点，确保团队了解最新的 TTS 配置要求。
