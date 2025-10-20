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


长文本tts官方doc

长文本语音合成 API 文档
#接口说明
长文本语音合成提供了支持单次超大文本（万字级别）进行快速语音合成的功能。
支持单次合成上限约10万字符；
语音合成速度快，支持设置语速、语调和音量等特性；
支持中、英文，男、女声发音人；
支持输出pcm、mp3、speex、opus等编码格式音频；
支持通过主动查询和服务回调方式获取语音合成结果；
支持拼音标注功能；
注：接口返回的音频在云端保存7天，请及时下载音频

部分开发语言demo如下，其他开发语言请参照文档进行开发，也欢迎热心的开发者到 讯飞开放平台社区 分享你们的demo。
长文本语音合成 demo java语言
长文本语音合成 demo python语言

集成长文本语音合成时，需按照以下要求:

内容	说明
传输方式	http[s] (为提高安全性，强烈推荐https)
请求地址	1、创建任务：http(s): //api-dx.xf-yun.com/v1/private/dts_create
2、查询任务：http(s): //api-dx.xf-yun.com/v1/private/dts_query
注：服务器IP不固定，为保证您的接口稳定，请勿通过指定IP的方式调用接口，使用域名方式调用
请求行	1、创建任务：POST /v1/private/dts_create HTTP/1.1
2、查询任务：POST /v1/private/dts_query HTTP/1.1
接口鉴权	签名机制，详情请参照下方鉴权认证
字符编码	UTF-8
响应格式	统一采用JSON格式
开发语言	任意，只要可以向讯飞云服务发起HTTP请求的均可
适用范围	任意操作系统，但因不支持跨域不适用于浏览器
文本长度	单次合成上限约10万字符
音频格式	pcm、mp3、speex、opus

## 6. 实时任务查询接口（2025-10-19 更新）

- `GET /api/tts/tasks/:storyId/latest`
  - 说明：返回指定 `storyId` 最近一次朗读任务记录（含状态、音频地址、错误信息）。
  - 支持查询参数：
    - `provider`（可选）：按提供商过滤，例如 `iflytek`。
  - 返回：
    ```json
    {
      "success": true,
      "data": {
        "id": "task-id",
        "status": "success",
        "provider": "iflytek",
        "storyId": "workflow-id",
        "segmentIndex": 0,
        "audioUrl": "http://localhost:5001/static/tts/....mp3",
        "cached": false,
        "updatedAt": 1734648000000
      }
    }
    ```
  - `404` 表示该故事暂无任务记录。
  - 前端 `WorkflowTimelineDrawer` 会在 SSE 连接建立时及收到最新 TTS 事件后自动调用该接口，用于补齐历史状态或更新失败提示。
#鉴权说明
在调用业务接口时，请求方需要对请求进行签名，服务端通过签名来校验请求的合法性。

#鉴权方法
通过在请求地址后面加上鉴权相关参数的方式，请注意影响鉴权结果的值有url、apiSecret、apiKey、date，如果调试鉴权，请务必按照示例中给的值进行调试，具体参数如下：

http示例url：

http://api-dx.xf-yun.com/v1/private/dts_create?host=api-dx.xf-yun.com&date=Thu%2C+09+Feb+2023+03%3A37%3A55+GMT&authorization=YXBpX2tleT0iYXBpa2V5WFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFgiLCBhbGdvcml0aG09ImhtYWMtc2hhMjU2IiwgaGVhZGVycz0iaG9zdCBkYXRlIHJlcXVlc3QtbGluZSIsIHNpZ25hdHVyZT0idWpwWVFINGVCUHYwMm42dndQUDZ3cGJjeEV0ZGJ5WVJrQm9hbjlZQm1PWT0i
鉴权参数：

参数	类型	必须	说明	示例
host	string	是	请求主机	api-dx.xf-yun.com
date	string	是	当前时间戳，RFC1123格式("EEE, dd MMM yyyy HH:mm:ss z")	Thu, 09 Feb 2023 03:37:55 GMT
authorization	string	是	使用base64编码的签名相关信息(签名基于hamc-sha256计算)	参考下方详细生成规则
• date参数生成规则：

date必须是UTC+0或GMT时区，RFC1123格式(Thu, 09 Feb 2023 03:37:55 GMT)。
服务端会对date进行时钟偏移检查，最大允许300秒的偏差，超出偏差的请求都将被拒绝。

• authorization参数生成格式：

1）获取接口密钥APIKey 和 APISecret。
在讯飞开放平台控制台，创建一个应用后打开长文本合成页面可以获取，均为32位字符串。
2）参数authorization base64编码前（authorization_origin）的格式如下。

api_key="$api_key",algorithm="hmac-sha256",headers="host date request-line",signature="$signature"
其中 api_key 是在控制台获取的APIKey，algorithm 是加密算法（仅支持hmac-sha256），headers 是参与签名的参数（见下方注释）。
signature 是使用加密算法对参与签名的参数签名后并使用base64编码的字符串，详见下方。

注： headers是参与签名的参数，请注意是固定的参数名（"host date request-line"），而非这些参数的值。

3）signature的原始字段(signature_origin)规则如下。

signature原始字段由 host，date，request-line三个参数按照格式拼接成，
拼接的格式为(\n为换行符,’:’后面有一个空格)：

host: $host\ndate: $date\n$request-line
假设

请求url = "http(s): //api-dx.xf-yun.com/v1/private/dts_create"
date = "Thu, 09 Feb 2023 03:37:55 GMT"
那么 signature原始字段(signature_origin)则为：

host: api-dx.xf-yun.com
date: Thu, 09 Feb 2023 03:37:55 GMT
POST /v1/private/dts_create HTTP/1.1
4）使用hmac-sha256算法结合apiSecret对signature_origin签名，获得签名后的摘要signature_sha。

signature_sha=hmac-sha256(signature_origin,$apiSecret)
其中 apiSecret 是在控制台获取的APISecret

5）使用base64编码对signature_sha进行编码获得最终的signature。

signature=base64(signature_sha)
假设

APISecret = "apisecretXXXXXXXXXXXXXXXXXXXXXXX"	
date = "Thu, 09 Feb 2023 03:37:55 GMT"
则signature为

signature="ujpYQH4eBPv02n6vwPP6wpbcxEtdbyYRkBoan9YBmOY="
6）根据以上信息拼接authorization base64编码前（authorization_origin）的字符串，示例如下。

api_key="apikeyXXXXXXXXXXXXXXXXXXXXXXXXXX", algorithm="hmac-sha256", headers="host date request-line", signature="ujpYQH4eBPv02n6vwPP6wpbcxEtdbyYRkBoan9YBmOY="
注： headers是参与签名的参数，请注意是固定的参数名（"host date request-line"），而非这些参数的值。

7）最后再对authorization_origin进行base64编码获得最终的authorization参数。

authorization = base64(authorization_origin)
示例结果为：
authorization=YXBpX2tleT0iYXBpa2V5WFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFgiLCBhbGdvcml0aG09ImhtYWMtc2hhMjU2IiwgaGVhZGVycz0iaG9zdCBkYXRlIHJlcXVlc3QtbGluZSIsIHNpZ25hdHVyZT0idWpwWVFINGVCUHYwMm42dndQUDZ3cGJjeEV0ZGJ5WVJrQm9hbjlZQm1PWT0i
#鉴权结果
如果鉴权失败，则根据不同错误类型返回不同HTTP Code状态码，同时携带错误描述信息，详细错误说明如下：

HTTP Code	说明	错误描述信息	解决方法
401	缺少authorization参数	{"message":"Unauthorized"}	检查是否有authorization参数，详情见authorization参数详细生成规则
401	签名参数解析失败	{“message”:”HMAC signature cannot be verified”}	检查签名的各个参数是否有缺失是否正确，特别确认下复制的api_key是否正确
401	签名校验失败	{“message”:”HMAC signature does not match”}	签名验证失败，可能原因有很多。
1. 检查api_key,api_secret 是否正确。
2.检查计算签名的参数host，date，request-line是否按照协议要求拼接。
3. 检查signature签名的base64长度是否正常(正常44个字节)。
403	时钟偏移校验失败	{“message”:”HMAC signature cannot be verified, a valid date or x-date header is required for HMAC Authentication”}	检查服务器时间是否标准，相差5分钟以上会报此错误
时钟偏移校验失败示例：

HTTP/1.1 403 Forbidden
Date: Mon, 30 Nov 2020 02:34:33 GMT
Content-Length: 116
Content-Type: text/plain; charset=utf-8
{
    "message": "HMAC signature does not match, a valid date or x-date header is required for HMAC Authentication"
}
#1、创建任务
#请求参数
在调用业务接口时，都需要在 Http Request Body 中配置以下参数，请求数据均为json字符串。
请求参数示例：

{
	"header": {
		"app_id": "your_appid"
	},
	"parameter": {
		"dts": {
			"vcn": "x3_mingge",
			"language": "zh",
			"speed": 50,
			"volume": 50,
			"pitch": 50,
			"rhy": 1,
			"audio": {
				"encoding": "lame",
				"sample_rate": 16000,
			},
			"pybuf": {
				"encoding": "utf8",
				"compress": "raw",
				"format": "plain"
			}
		}
	},
	"payload": {
		"text": {
			"encoding": "utf8",
			"compress": "raw",
			"format": "plain",
			"text": "6L+Z5piv5LiA5q615rWL6K+V5paH5pys\n"
		}
	}
}
请求参数说明：

参数名	类型	必传	描述
header	Object	是	协议头部，用于描述平台特性的参数
parameter	Object	是	AI 特性参数，用于控制 AI 引擎特性的开关
dts	Object	是	服务别名
audio	Object	是	数据格式预期，用于描述返回结果的编码等相关约束，不同的数据类型，约束维度亦不相同，此 object 与响应结果存在对应关系
pybuf	Object	是	数据格式预期，用于描述返回结果的编码等相关约束，不同的数据类型，约束维度亦不相同，此 object 与响应结果存在对应关系
payload	Object	是	数据段，携带请求的数据
text	Object	是	输入数据
header段参数

参数名	类型	必传	描述
app_id	string	是	应⽤唯⼀标识
callback_url	string	否	任务结果回调服务地址
request_id	string	否	客户端⽤于标记任务的唯⼀id，最⼤⻓度64字符，由客户端保证唯⼀性，服务回调结果时会包含此参数
parameter.dts段参数

参数名	类型	必传	描述
vcn	string	是	详见发音人列表
language	string	否	合成文本语言
zh：中文(默认)
en：英文
speed	int	否	取值范围[0-100]，默认50
volume	int	否	取值范围[0-100]，默认50
pitch	int	否	取值范围[0-100]，默认50
ram	string	否	是否读出标点
0：不读出所有的标点符号(默认)
1：读出所有的标点符号
rhy	string	否	控制是否返回拼音标注
0: 不返回拼音(默认)
1: 返回拼音 (支持的引擎: xtts1.0-cpu, xtts1.0-gpu, xtts2.0-gpu, xtts2-gpu中是每句话一次性返回) 拼音标注的时间xtts2.0要乘以5ms
parameter.dts.pybuf段参数

参数名	类型	必传	描述
encoding	string	否	文本编码，可选值：utf8(默认)、gb2312
compress	string	否	文本压缩格式，可选值：raw
format	string	否	文本格式，可选值：plain
parameter.dts.audio段参数

参数名	类型	必传	描述
encoding	string	是	音频编码
raw：原始pcm音频
lame：mp3编码格式
opus：opus 8K
opus-wb：opus 16K
speex-org-nb;8：speex 8K
speex-org-wb;8：speex 16K
注：分号后面数字为压缩等级，取值1-10，缺省8
speex;7：讯飞定制8K speex
speex-wb;7：讯飞定制16K speex
注：分号后面数字为压缩等级，取值1-10，缺省7
sample_rate	int	否	采样率，可选值：16000(默认)、8000、24000
payload.text段参数

参数名	类型	必传	描述
encoding	string	是	文本编码，可选值：utf8(默认)、gb2312
compress	string	否	文本压缩格式，可选值：raw(默认)、gzip
format	string	否	文本格式，可选值：plain、json、xml
text	string	是	文本数据，最大支持10w 字文本字数，文本大小：0-1M
#返回结果
返回参数示例：
成功

{
	"header": {
		"code": 0,
		"message": "success",
		"sid": "dts000e81e2@dx184a8c91edf738d882",
		"task_id": "221124163743668851981200"
	},
	"payload": null
}
失败

{
	"header": {
		"code": 10313,
		"message": "appid cannot be empty",
		"sid": "dts000e61dd@dx184a8fe7c55738d882"
	}
}
返回参数说明:

参数名	类型	描述
header	object	⽤于传递平台框架使⽤的相关公共参数
header.code	int	0：任务创建成功
非0：任务创建失败
header.message	string	错误描述，针对任务创建错误码的描述
header.sid	string	本次会话的id，⽤于链路及问题跟踪
header.task_id	string	本次创建的任务id，⽤于唯⼀标识本次任务
#2、查询任务
#请求参数
在调用业务接口时，都需要在 Http Request Body 中配置以下参数，请求数据均为json字符串。
请求参数示例：

{
	"header": {
		"app_id": "3e79d91c",
		"task_id": "221124174214587600971201"
	}
}
请求参数说明：

参数名	类型	必传	描述
header	object	是	平台公共协议段，⽤于传递平台框架使⽤的相关公共参数
header.app_id	string	是	在平台申请的app id信息
header.task_id	string	是	任务唯⼀标识，由任务创建接⼝返回
#返回结果
返回参数示例：
成功

{
	"header": {
		"code": 0,
		"message": "success",
		"sid": "dts000fa2e7@dx184a90433d96f19882",
		"task_id": "221124174214587600971201",
		"task_status": "5"
	},
	"payload": {
		"audio": {
			"audio": "aHR0cD······",
			"bit_depth": "16",
			"channels": "1",
			"encoding": "lame",
			"sample_rate": "16000"
		},
		"pybuf": {
			"encoding": "utf8",
			"text": "aHR0cDovL······"
		}
	}
}
失败

{
	"header": {
		"code": 10163,
		"message": "parameter schema validate error: '$.header.task_id' length must be larger or equal than 1; ",
		"sid": "dts000ef953@dx184ac8e8ce4738d882"
	}
}
返回参数说明：

参数名	类型	描述
header	Object	协议头部，用于描述平台特性的参数
header.code	int	返回码，0表示成功，其它表示异常
header.message	string	错误描述
header.sid	string	本次会话的id
header.task_id	string	任务唯⼀标识
header.task_status	string	任务状态: 1:任务创建成功
2:任务派发失败
3:任务处理中
4:任务处理失败
5:任务处理成功
payload	Object	数据段，携带响应的数据
payload.audio	Object	输出数据
payload.audio.encoding	string	音频编码，可选值：lame, speex, opus, opus-wb, speex-wb
payload.audio.sample_rate	int	音频采样率，可选值：16000, 8000, 24000
payload.audio.channels	int	声道数，可选值：1, 2
payload.audio.bit_depth	int	单位bit，可选值：16, 8
payload.audio.audio	string	音频链接，采用base64编码
payload.pybuf	Object	输出数据
payload.pybuf.encoding	string	文本编码，可选值：utf8, gb2312
payload.pybuf.text	string	文本地址，音素链接，采用base64编码
#附录
发音人

中文名称	参数名称（vcn=）	音色	语种/方言	风格
希涵	x4_yeting	女	中文/普通话	游戏影视解说
关山-专题	x4_guanyijie	男	中文/普通话	专题片纪录片
小鹏	x4_pengfei	男	中文/普通话	新闻播报
千雪	x4_qianxue	女	中文/普通话	阅读听书
聆伯松-老年男声	x4_lingbosong	男	中文/普通话	阅读听书
秀英-老年女声	x4_xiuying	女	中文/普通话	阅读听书
明哥	x4_mingge	男	中文/普通话	阅读听书
豆豆	x4_doudou	男	中文/男童	阅读听书
聆小珊	x4_lingxiaoshan_profnews	女	中文/普通话	新闻播报
小果	x4_xiaoguo	女	中文/普通话	新闻播报
小忠	x4_xiaozhong	男	中文/普通话	新闻播报
小露	x4_yezi	女	中文/普通话	通用场景
超哥	x4_chaoge	男	中文/普通话	新闻播报
飞碟哥	x4_feidie	男	中文/普通话	游戏影视解说
聆飞皓-广告	x4_lingfeihao_upbeatads	男	中文/普通话	直播广告
嘉欣	x4_wangqianqian	女	中文/普通话	直播广告
聆小臻	x4_lingxiaozhen_eclives	女	中文/普通话	直播广告
#常见问题
#长文本语音合成的主要功能是什么？
答：长文本语音合成提供了支持单次超大文本（万字级别）进行快速语音合成的功能。

#长文本语音合成支持什么应用平台？
答：目前支持Web API应用平台。

#长文本语音合成支持合成什么格式的音频，音频在云端保存时间是多久？
答：支持合成pcm、mp3、speex、opus格式的音频。音频在云端保存7天，请及时下载音频。

## 健康监控与任务追踪

- `GET /api/health/tts/iflytek`：返回讯飞 TTS 配置状态、当前选用的 provider、最近一小时内的任务统计以及最新任务列表（最多 5 条）。缺失凭证或未启用讯飞时会返回降级/缺失提示，并在 Prometheus 指标 `storyapp_tts_provider_up{provider="iflytek"}` 中标记为 `0`。
- `GET /api/tts/tasks?provider=iflytek`：查询最近的 TTS 任务，支持通过 `status`（`pending`/`success`/`error`）与 `limit` 控制范围。返回结果附带 summary，可快速查看成功、失败与等待中的数量。
- `GET /api/tts/tasks/<id>`：根据内部任务 ID、`requestId`、`taskId` 或 `sid` 查询单条任务详情，便于对照讯飞后台排查问题。

> 提示：任务列表与 summary 会自动清理 1 小时前的记录，可通过 `TTS_TASK_REGISTRY_TTL_MS` 环境变量调整保存时长。
