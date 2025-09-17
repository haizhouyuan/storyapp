# 故事生成逻辑审计与高质量工作流方案

> 文档目的：梳理当前代码中的“故事生成”实现与问题，提出一套可落地的高质量工作流方案，便于后续演进与实施。

## 总览
- 模式：支持“渐进式互动生成”（每回合生成一段 + 选项）与“一次性故事树生成”（根→分支→结局）。
- 模型：DeepSeek 双模型结构
  - `deepseek-chat`（快速写作）
  - `deepseek-reasoner`（深度推理/审校）
- 数据：MongoDB 集合 `stories`（索引：`created_at`、`title` 文本索引）。
- 接口：
  - `POST /api/generate-story` 渐进式生成
  - `POST /api/generate-full-story` 生成完整故事树
  - `POST /api/save-story`、`GET /api/get-stories`、`GET /api/get-story/:id`
  - `GET /api/health` 健康检查

---

## 当前实现（代码级）

### 渐进式生成（核心）
- 文件：`backend/src/services/storyService.ts` → `generateStoryService`
- 提示词：`backend/src/config/deepseek.ts`
  - `STORY_SYSTEM_PROMPT`：儿童向、安全、JSON结构（至少500字 + 3个选项，结尾空选项）
  - `STORY_CONTINUE_PROMPT(topic, currentStory, selectedChoice, turnIndex, maxChoices, forceEnding)`
- 处理流程：
  1. 组装 `messages`（新故事 vs. 续写）
  2. 调用 `deepseekClient.post('/chat/completions', {...})`
  3. 解析返回：去除 ```json 包裹后 `JSON.parse`；失败则 fallback（截取前200字 + 3个默认选项）
  4. 规范化：限制选项最多3个、补齐到3个；`forceEnding` 时强制 `isEnding=true, choices=[]`
  5. 长度检查：<500 字仅记录日志，不触发扩写（为避免超时）

### 故事树生成（两条路径）
- 路由：`POST /api/generate-full-story` → `generateFullStoryTreeService`
- 默认策略：调用“基础模式”`generateBasicStoryTreeService`
  - 逐步生成：根（2选）→ 第二层（2×分支）→ 第三层（4×结局）
  - 节点提示词：`STORY_TREE_NODE_PROMPT`
  - 若字数 <500：调用 `expandStorySegment` 尝试扩写一次
- 高级模式（已实现未默认启用）：`generateAdvancedStoryTree`
  - Phase 1 规划（reasoner）`STORY_PLANNING_PROMPT`
  - Phase 2 写作（chat）`STORY_WRITING_PROMPT`
  - Phase 3 审校（reasoner）`STORY_REVIEW_PROMPT` → 不合格再用 chat 改写

### DeepSeek 集成
- 配置：`backend/src/config/deepseek.ts`
  - 180s 超时、网络错误/5xx 最多 3 次重试（指数退避）
  - `CHAT_MODEL='deepseek-chat'`、`REASONER_MODEL='deepseek-reasoner'`
- 健康检查：`GET /api/health` 若未配置 API Key，返回“AI 功能降级：使用模拟数据”

### 数据与基础设施
- MongoDB：`backend/src/config/mongodb.ts`
  - 集合：`stories`
  - 索引：`created_at`（desc）、`title`（text）
- 速率限制：全局 `express-rate-limit`（默认 15 分钟 / IP / 100 次）

---

## 发现的问题与风险
- JSON 解析脆弱：`JSON.parse` 失败时直接降级到“200 字 + 默认选项”，与既定“≥500 字、3选项”不一致。
- 质量一致性：渐进式默认不做扩写与复查，易出现“段落偏短/风格漂移/节奏失衡”。
- 结构约束：仅依赖 `turnIndex/maxChoices/forceEnding` 提示，模型可能不完全遵守；缺少程序化强校验与自动纠偏。
- 故事树规模：基础模式固定 2 层分支（4 条路径、深度 2），短于“2×2×2=8 结局”的典型设定。
- 体验与可用性：不支持流式输出，长响应时前端只能等待。
- 内容安全：仅在提示词中约束，缺少程序化审查与修订流程的兜底机制。
- 观测性：缺少 `traceId`、阶段用时、重试次数、token 开销等指标，难以定位线上问题。

---

## 高质量故事生成工作流（建议）
> 目标：规划先行、受控生成、强校验、可回退、可观测、可扩展。兼容“渐进式交互（默认）”与“一次性故事树（选配）”。

### 渐进式（每回合，轻量三阶段）
- Phase 0 约束与上下文
  - 输入校验（zod/Joi）：`topic` 限长与字符集、`selectedChoice` 合法性、`currentStory` 尺寸
  - 上下文压缩：过长时生成“剧情摘要+伏笔清单”（小 prompt），续写仅携带“摘要 + 最近两段 + 上次选择”
- Phase 1 规划（reasoner）
  - 产出“微大纲”：本段目标、场景元素、情感曲线、需呼应的伏笔、3 个高质量选项的意图
  - 仅返回 JSON（严格 schema）
- Phase 2 写作（chat）
  - 基于“微大纲 + 上下文”写 600–800 字；返回 `{ storySegment, draftChoices }`
  - 约束：中文、儿童向、句式短、画面感、连贯、避免重启故事
- Phase 3 审校与修订（reasoner → chat）
  - 检查：长度、可读、适龄、安全、连贯、节奏；不达标给出“结构化修订建议”
  - 修订：`chat` 根据建议改写；最多 1–2 轮，超限回退“仅结构修订”
  - 选项处理：去重、语义多样、可操作性强、12–18 字，恰好 3（结尾 0）
- Phase 4 结构校验与返回
  - Schema 校验：`{storySegment:string(>=500), choices: string[], isEnding: boolean}`
  - JSON-only 重试：若解析失败 → 发送“仅返回纯 JSON，不要代码块与解释”提示重试 1 次
  - 兜底降级：温度下调重试 → 仅结构重写 → 最后 fallback（模板化内容 + 默认选项）
  - 返回：附带 `traceId`、`phaseTimings`、`modelUsed`、`retryCount`

### 一次性故事树（完整三阶段）
- 规划（reasoner）：
  - 设计 2×2×2 树（3 轮选择，8 结局），每节点含“目标字数、风格、伏笔/回收条目、路径标识与深度”
- 写作（chat）：
  - 各节点 500–700 字；枝节点 2 选项、叶子 0 选项；标注 `path` 与 `depth`
- 审校（reasoner+chat）：
  - 逐节点质检与自动修订；最终结构装配校验
- 回退策略：超时/错误 → 自动降级到“基础模式”；基础模式失败 → 返回稳定 Mock 并向前端提示“AI 降级”

### 提示词与参数建议
- 温度：规划/审校 0.2–0.4；写作 0.6–0.8（可按主题动态）
- 明确“仅以纯 JSON 响应，不要代码块、不带解释文字”
- 安全/风格词表：避免暴力、恐怖、疾病、歧视等词汇
- 选项规范：不含“继续/下一步”此类空洞词；长度 12–18 字；紧贴剧情、可读可说

### 稳定性与性能
- JSON 解析稳健化：剥离代码块 → 定位大括号范围 → 失败触发“reformat to JSON only”二次请求
- token 预算：基于“摘要 token + 上下文 token + 目标长度 token”动态调 `max_tokens`
- 超时分级：chat 45–60s；reasoner 60–90s（可配置）
- 并发保护：对 `/generate-story` 追加更严格限流（例如 15 分钟 / 30 次 / IP）
- 扩写缓存：`expandStorySegment` 以内容 hash 做 LRU 缓存，减少重复开销

### 观测与运维
- 贯穿 `traceId`，记录 `phaseTimings`、`retryCount`、`tokensIn/out`
- 健康页暴露：最近错误原因、降级状态；日志采样
- 配置开关：`STORY_MODE=basic|advanced`、`STORY_TREE_MODE=basic|advanced`、`STREAMING=true|false`

### 前端体验
- 流式输出：支持 `stream=true`，前端边到边渲染；长时任务显示规划/写作/审校阶段进度
- 交互稳定：点击选项后禁用，收到结果恢复；错误友好降级并可“再次尝试”

---

## 可落地的近期改动（小步快跑）
- 立即可做（低风险高收益）：
  1. `generateStoryService` 增加“JSON-only 重试一次”，再失败才 fallback
  2. 统一 `choices` 规范化：去重、长度限制（12–18 字）、语义多样
  3. 段落 <500 字尝试一次 `expandStorySegment`（失败不再二次）
  4. 为 `/generate-story` 单独叠加限流（如 15 分钟 / IP / 30 次）
  5. 返回体增加 `traceId`、`phaseTimings` 字段
- 可配置灰度：
  - `STORY_MODE=advanced` 时对渐进式开启“轻量三阶段”（默认 off）
  - `STORY_TREE_MODE=advanced` 时将 `/generate-full-story` 切换至高级三阶段（已有实现，仅需开关 + 超时回退）
  - 引入 zod/Joi 对请求/响应做 schema 校验

---

## 测试与质量保障
- 单元测试（Jest）
  - JSON 解析：带 ```json 包裹、有噪声、半角/全角引号
  - 选项规范化：长度、去重、多样性
  - 扩写缓存：相同输入的复用
- 集成测试
  - `/generate-story`：首段、续写、结尾路径；超时与降级；限流触发
  - `/generate-full-story`：basic/advanced 两模式；高级模式超时回退
- E2E（Playwright）
  - 交互主流程已有；新增“慢响应时前端不冻结、阶段进度条渲染”用例

---

## 下一步建议
1. 先在 `generateStoryService` 加：JSON-only 重试 + choices 规范化 + 单次扩写（改动最小，显著提升质量稳定性）。
2. 增加 `/generate-story` 独立限流，附带 `traceId/phaseTimings` 便于线上追踪。
3. 上线 `STORY_MODE=advanced` 灰度，将“轻量三阶段”接入渐进式调用（默认 off）。
4. 评估流式输出改造（后端 SSE / 前端分段渲染），改善长响应体验。

---

## 参考文件与位置
- 路由：`backend/src/routes/stories.ts`、`backend/src/routes/health.ts`
- 服务：`backend/src/services/storyService.ts`
- DeepSeek 配置与提示词：`backend/src/config/deepseek.ts`
- 数据库：`backend/src/config/mongodb.ts`、`backend/src/config/database.ts`
- 类型：`shared/types.ts`
- 前端调用：`frontend/src/utils/api.ts`、交互页 `frontend/src/pages/StoryPage.tsx`

> 如需我直接提交“近期改动”的代码补丁，请告知是否启用 `STORY_MODE=advanced`，以及限流与超时的具体门限偏好。

