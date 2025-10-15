# 侦探故事工作流 MVP 落地路线图（可执行、可验收）

本文档基于现有仓库的 Stage1~4 与工作流 API 现状，定义三周内完成的 MVP 闭环计划：里程碑目标 → 交付物 → 具体改动点 → 验收标准 → 测试方案 → 风险与缓解。默认沿用“蓝图 → 逐章写作 → 校验 → 编辑 → 导出”的工程化工作流，并与现有后端 `story-workflows` 路由对齐。

## 总目标（3 周）

- 蓝图（Schema 严格校验）→ 逐章写作 + 编辑降级（面向少儿）→ 四类校验（公平/时间/可行/语言）→ 历史版本与回滚 → 前端可视化 → 导出 HTML+互动包。
- 模型参数与提示词可切换，流水线可重跑、可重试、可回滚，具备基础监控。

---

## 里程碑 M0：基线同步（0.5 天）

- 目标：统一现状与目标，冻结接口与目录结构。
- 交付物：
  - 现有 Stage1~4 的现状确认（已完成：后端 Stage1-4、部分 API、前端工作流页）。
  - “高质量基线”故事样本固化为 `fixtures/`（outline/draft/review/validation）。
- 验收标准：
  - `fixtures` 存档可被新的校验器与导出器直接使用演示。

---

## 里程碑 M1：蓝图 Schema + 规划器落地（2 天）

- 目标：引入 `StoryProject/StoryBlueprint` 严格 Schema；Planner 只产出 JSON，失败自动重试+报告。
- 具体改动：
  - 新增类型与 Schema 校验
    - `shared/src/types/{project.ts, blueprint.ts}`（注：与现有 `detective.ts` 并存）
    - `shared/schema/detectiveOutline.schema.json`（ajv 校验现有大纲结构）
  - Planner 提示词外置（仅 JSON，无解释）
    - `backend/prompts/planner_prompt.txt`
    - `backend/engines/planner_llm`（封装调用+schema 校验+最大重试3次）
  - API（MVP）
    - POST `/api/projects`（创建项目，落项目档）
    - POST `/api/projects/:id/plan`（调用 Planner，返回/落地 blueprint）
    - GET `/api/blueprints/:id`
- 验收标准：
  - blueprint 必须通过 ajv 校验，字段齐全（cast/locations/clues/acts/timeline/fairness_policy 或现有等价字段）。
  - 至少 2 个主题成功生成蓝图；失败时返回结构化错误（缺字段/不一致项列表）。
- 测试：
  - 单测：ajv 校验、字段依赖（如 `explicitForeshadowChapters` 合法性）。
  - 集成：调 `/plan` 接口，比较输出结构。

---

## 里程碑 M2：逐章写作 + 编辑降级（3 天）

- 目标：把 Stage2 改为“按 `scene_id` 逐章生成”，新增 Editor 阶段（控句长/词频/禁词）。
- 具体改动：
  - Writer（逐章）
    - `backend/prompts/writer_prompt.txt`（输入：blueprint + scene_id；输出：{scene_id,title,words,text}）
    - `backend/engines/writer_llm`（支持 seed/温度）
  - Editor（阅读级分级）
    - `backend/prompts/editor_prompt.txt`（输入：章节 JSON；输出：同结构 JSON，仅 text 改写）
    - `backend/engines/editor_llm`（句长 ≤ 22，去恐怖化/禁词替换）
  - Orchestrator 改造
    - 对 `blueprint.acts.beats[].scene_id` 循环写作与编辑
    - 在章节 `text` 中打“线索埋点”标注（如 `[CLUE:K2]`）或 JSON metadata 
  - API
    - POST `/api/projects/:id/write?scene_id=S3`
    - POST `/api/projects/:id/edit?scene_id=S3`
- 验收标准：
  - 每个 scene 的 JSON 均通过 schema 校验，`words` 落在阈值 ±15%
  - Editor 阶段显著降低平均句长、清除禁词，标点/空格规范
- 测试：
  - 单测：章节 JSON 校验、禁词替换
  - 集成：完整跑一章→检查分级指标（句长、词频）

---

## 里程碑 M3：四类校验引擎增强（2 天）

- 目标：在现有 Stage4 校验器基础上，补齐公平线索/时间轴/诡计可行/语言适配。
- 具体改动：
  - 扩展 `backend/src/agents/detective/validators`
    - 公平线索：`min_exposures_per_key_clue`、必须在 S8 前出现
    - 时间轴：timeline 递增 + 正文时间抽取（正则+轻量 LLM）
    - 诡计可行性：中心奇迹 require hooks 是否在蓝图/正文中出现
    - 语言适配：句长、词频、禁词、恐怖强度
  - 报告结构化输出：每条规则 `{status, details, metrics}`
- 验收标准：
  - 基线故事校验通过项≥3，warn≤2，fail=0；误导占比 ≤ 35%，Chekhov 回收=pass
- 测试：
  - 单测：规则分支与边界
  - 集成：更换模型时，报告稳定性

---

## 里程碑 M4：Orchestrator 与工作流 API 完整化（2 天）

- 目标：状态机化，支持重试/回滚/终止，保留每次修订快照（现有路由基础上完善）。
- 具体改动：
  - 模型：`DetectiveWorkflowDocument` 扩展 revisions/history（既有）
  - API：完善列表/详情/重试/回滚/终止（既有基础上补齐）
  - 前端：`MysteryWorkflowPage` 完善轮询、回滚/重试体验、指标展示
- 验收标准：
  - 列表/详情可用；重试/回滚产生新 revision；终止状态正确，历史可追溯
- 测试：
  - 集成：创建→执行→回滚→重试链路
  - 回归：更换模型 id 后稳定跑完

---

## 里程碑 M5：家长端 Builder + 阅读器证物板（3 天）

- 目标：可视化蓝图与线索矩阵，阅读器可查看“证物板/时间线/人物卡”。
- 具体改动：
  - Builder（家长端）：参数面板（舞台/诡计/篇幅/复杂度/seed），蓝图可视化（Timeline + Clue Matrix），局部重生
  - 阅读器（小读者）：章节阅读 + 右滑“证物板”（cast_cards/clue_matrix/timeline）；破案模式题目（`interactive_pack.quiz`）
- 验收标准：
  - 生成→可视化→逐章阅读→证物板/时间线联动；破案模式可作答并显示解析
- 测试：
  - 手动 + E2E（Playwright）断言“证物板”渲染正确

---

## 里程碑 M6：导出服务（1.5 天）

- 目标：导出 HTML + 互动 JSON，后续加 ePub。
- 具体改动：
  - `services/compile_exporter`：将 blueprint + draft 生成 `book.html` 与 `interactive.json`
  - API：POST `/api/projects/:id/compile?format=html+interactive` → `download_url`
- 验收标准：
  - 打包可下载，本地打开 HTML 可阅读；互动包 JSON 与阅读端结构一致
- 测试：
  - 单测：导出函数
  - 集成：生成→导出→前端加载 interactive 包

---

## 里程碑 M7：观测与安全（1 天）

- 目标：完善日志/指标与内容安全。
- 具体改动：
  - 日志分类：`mystery-agent` + `traceId`
  - 指标：各阶段时长、重试率、校验 fail 数（Prometheus）
  - 内容安全：敏感词列表调整，Editor 自动降级策略演示
- 验收标准：
  - 控制台/面板能看到完整执行轨迹，校验失败可快速定位
- 测试：
  - 手动 + 脚本化模拟故障/降级场景

---

## 质量门槛（每次出书必须达成）

- Stage3 审核：`approved = true`，`logic ≥ 80`，`fairness ≥ 80`
- Stage4 校验：
  - `clue-foreshadowing = pass`
  - `timeline-consistency = pass`
  - `chekhov-recovery = pass`
  - `red-herring-ratio ≤ 0.35`
- Editor 后指标：平均句长 ≤ 22 字；敏感词=0；恐怖强度=low
- 导出 HTML + interactive 可正常渲染；前端证物板/时间线可联动

---

## 工程约束与安全

- LLM 输出“仅 JSON，无解释”；调用端做“宽松解析 + schema 校验 + 重试 + 降级”。
- 可重现性：固定 seed；温度梯度（Planner 低 / Writer 中 / Editor 低）。
- Feature Flag：新工作流入口默认隐藏，`ENABLE_MYSTERY=1` 开启。
- 兼容：保留现有儿童睡前故事功能不受影响，相关 API 路由隔离。

---

## 风险清单与缓解

- 模型输出不稳定 → 强 schema + 自动重试 + 宽容解析 + 降级模板。
- 时间与线索前后冲突 → 逐章写作 + 校验后自动修订（时间字段替换/补铺线索）。
- 成本与延时 → 按 scene 切片并发/串行、缓存里程碑结果、提示词压缩。
- 年龄适配争议 → Editor 阶段自动降级 + 词典双检 + 人工白名单。

---

## 建议实施顺序

1) M1 → M2 → M3（蓝图/逐章写作/校验闭环）
2) M4（工作流历史与回滚）
3) M5（前端 Builder + 阅读器证物板）
4) M6（导出）→ M7（观测与安全）

> 注：与现有实现对齐：
> - 后端核心：`backend/src/services/detectiveWorkflowService.ts`、`backend/src/agents/detective/*`、`backend/src/routes/storyWorkflows.ts`
> - 校验器：`backend/src/agents/detective/validators/stage4Validator.ts`
> - 前端工作流页：`frontend/src/pages/MysteryWorkflowPage.tsx`
> - 脚本：`backend/scripts/runStagesNoDb.ts`（无DB） 与 `runDetectiveWorkflow.ts`（带DB）
