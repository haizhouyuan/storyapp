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
  │   └─ providers/iflytekTtsProvider.ts (讯飞长文本 API 接入)
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
| `TTS_AUDIO_BASE_URL` | 音频文件访问前缀 | `http://localhost:5001/static/tts` |
| `TTS_AUDIO_OUTPUT_DIR` | 音频落盘目录（相对/绝对路径均可） | `storage/tts` |
| `TTS_AUDIO_DOWNLOAD_TIMEOUT_MS` | 下载第三方音频的超时时间（毫秒） | `20000` |
| `TTS_TEST_ALLOW_HTTP_DOWNLOAD` | 测试环境下是否允许真实 HTTP 下载（`1` 表示允许） | 空 |
| `ALICLOUD_TTS_APP_KEY` | 阿里云 APP Key | `-` |
| `ALICLOUD_TTS_ACCESS_KEY_ID` | 阿里云 AccessKeyId | `-` |
| `ALICLOUD_TTS_ACCESS_KEY_SECRET` | 阿里云 AccessKeySecret | `-` |
| `IFLYTEK_TTS_APP_ID` | 讯飞 APPID | `-` |
| `IFLYTEK_TTS_API_KEY` | 讯飞 APIKey | `-` |
| `IFLYTEK_TTS_API_SECRET` | 讯飞 APISecret | `-` |
| `IFLYTEK_TTS_API_HOST` | 讯飞接口域名 | `api-dx.xf-yun.com` |
| `IFLYTEK_TTS_POLL_INTERVAL_MS` | 任务轮询间隔（毫秒） | `2000` |
| `IFLYTEK_TTS_POLL_TIMEOUT_MS` | 任务超时时间（毫秒） | `120000` |
| `IFLYTEK_TTS_REQUEST_TIMEOUT_MS` | 单次 HTTP 请求超时时间（毫秒） | `15000` |
| `IFLYTEK_TTS_TEST_FAKE` | 测试环境是否使用假轮询结果 (`1` 则直接返回成功) | 空 |
| `TTS_TEST_FAKE_AUDIO_URL` | 测试用假音频地址（配合 `IFLYTEK_TTS_TEST_FAKE=1`） | `http://localhost/fake.mp3` |

> 科大讯飞长文本语音合成（`/home/yuanhaizhou/projects/tmuxagent/docs/语音合成key.md`）提供了鉴权签名与 Demo，可在接入阶段复用。

## 3. Provider 阶段性说明

| Provider | 当前状态 | 下一步计划 |
| --- | --- | --- |
| Mock | 生成 WAV Data URL，便于本地联调 | 支持自定义音色和语速模拟 |
| 阿里云 | 类 `alicloudTtsProvider.ts` 现阶段复用 Mock 结果 | 引入开放平台 SDK / HTTP API，封装 Token 缓存与重试策略 |
| 科大讯飞 | ✅ `iflytekTtsProvider.ts` 已接入长文本 API，完成鉴权、任务轮询与错误处理 | 观察真实数据，必要时补充多机容错/重试与音色白名单 |

所有 Provider 均通过 `TtsManager` 进行统一缓存、日志和指标上报，便于后续替换。

## 4. 缓存与限流

- **缓存**：默认使用内存缓存，键值为 `hash(text|voice|speed|pitch|format)`，TTL 同 `TTS_CACHE_TTL`。
  - 后续可替换成 Redis、OSS/OBS 或文件系统，需在 `services/tts/factory.ts` 中注入新的 `cacheDriver`。
- **音频落盘**：`TtsManager` 会在缓存 Miss 时下载/解析 Provider 返回的音频，写入 `TTS_AUDIO_OUTPUT_DIR` 指定目录（默认 `storage/tts`），并通过 `/static/tts/<hash>.{mp3|pcm}` 暴露下载链接。
- **限流**：`ttsRateLimit` 在 `/api/tts` 生效，命中时返回 `429`，并写入 Prometheus `storyapp_rate_limit_hits_total`。
- **指标**：
  - `storyapp_tts_requests_total{provider,cached}`
  - `storyapp_tts_latency_seconds{provider}`
  - `storyapp_tts_errors_total{provider,reason}`

## 5. 讯飞长文本 TTS 调用流程

1. **发起请求**：后端 `TtsManager` 调用 `iflytekTtsProvider.synthesize`，该 Provider 会：
   - 使用 `IFLYTEK_TTS_APP_ID`/`API_KEY`/`API_SECRET` 生成签名，请求 `dts_create` 创建任务；
   - 根据 `IFLYTEK_TTS_POLL_INTERVAL_MS`/`IFLYTEK_TTS_POLL_TIMEOUT_MS` 轮询 `dts_query`，捕获错误码并抛出易读异常。
2. **下载音频**：任务成功后 Provider 返回经 Base64 解码的音频下载 URL，`TtsManager` 会在本地下载音频到 `TTS_AUDIO_OUTPUT_DIR`，默认位置为 `<repo>/storage/tts`。
3. **响应客户端**：接口返回 `/static/tts/<cache-hash>.<ext>` 形式的 URL，同时记录请求、Provider 响应和落盘日志，方便在 Appsmith 后台回溯。
4. **凭证管理**：讯飞真实凭证位于 `projects/tmuxagent/docs/语音合成key.md`，请在本地 `.env` 或部署环境变量中配置，严禁写入仓库。
5. **测试安全阀**：在 `NODE_ENV=test` 下，`TtsManager` 默认禁止通过 HTTP 下载音频（需显式设置 `TTS_TEST_ALLOW_HTTP_DOWNLOAD=1` 才允许），`IflytekTtsProvider` 也可通过 `IFLYTEK_TTS_TEST_FAKE=1` 直接返回假结果，避免 Jest 挂起。

## 6. 日志

`backend/src/utils/logger.ts` 新增 TTS 事件：

- `tts_request_received`
- `tts_cache_hit`
- `tts_provider_response`
- `tts_response_sent`
- `tts_error`

所有日志落地 `story_logs`（如启用 DB logging），便于 Appsmith 后台展示。

## 7. 上线前检查

1. **凭证**：通过运维流程申请阿里云、讯飞账号，将密钥存放在服务器 KMS/密钥库，不直接写入仓库。
2. **鉴权**：完成阿里云 STS/AK 签名、讯飞 HMAC-SHA256 实现，并补充单元测试。
3. **存储**：选择音频持久化策略（OSS、COS 或本地挂载），更新 `TTS_AUDIO_BASE_URL`。
4. **监控**：更新 Appsmith 仪表盘，新增请求量、缓存命中率、错误类型图表。
5. **压测**：使用 `k6`/`artillery` 模拟真实文本长度，验证限流与成本预估。

## 8. 验证步骤

1. **本地环境配置**：复制 `.env.example` 至 `backend/.env`，填入 `IFLYTEK_TTS_*` 凭证，可选地调整 `TTS_AUDIO_OUTPUT_DIR`。
2. **运行单元测试**：`SKIP_MONGO_DOWNLOAD=1 npm test -- --detectOpenHandles`，确保 `backend/tests/services/iflytekTtsProvider.test.ts`、`backend/tests/routes/tts.test.ts` 全部通过。
   - 如需在测试中使用假轮询结果，设置 `IFLYTEK_TTS_TEST_FAKE=1`（可配合 `TTS_TEST_FAKE_AUDIO_URL`）；如确需真实 HTTP 下载，则显式设置 `TTS_TEST_ALLOW_HTTP_DOWNLOAD=1`。
3. **手动验证接口**：启动后端后执行 `curl -X POST http://localhost:5000/api/tts -H 'Content-Type: application/json' -d '{"text":"从前有一只小兔子……"}'`，返回体中的 `audioUrl` 应指向 `/static/tts/` 前缀，并可在浏览器直接播放。
4. **查看落盘文件**：确认 `storage/tts` 目录出现新文件，文件名为缓存哈希，格式与请求一致（mp3 或 pcm）。
5. **Appsmith 监控**：在 Appsmith 后台查看 TTS 面板，确认新增的请求/错误数据已经进入日志。

## 9. 参考资料

- 讯飞长文本语音合成鉴权：`/home/yuanhaizhou/projects/tmuxagent/docs/语音合成key.md`
- 日志系统说明：`README_LOGGING_SYSTEM.md`
- 监控后台配置：`appsmith-story-admin.json`

如需更新此文档，请同步在 PR 中列出变更点，确保团队了解最新的 TTS 配置要求。
