# 侦探故事生成 Agent 全面开发计划

## 1. 整体蓝图
- 构建“侦探故事生成 Agent”，用户输入设定即可生成符合本格推理规范的长篇故事。
- 最终产物包含结构化大纲、完整正文、审核报告，可直接在 StoryApp 中展示与存档。
- 流程基于《故事创作工作流.md》，确保线索公平、动机自洽、节奏完整。

## 2. 功能范围
- 新增侦探模式入口、设定表单、生成进度 UI、故事展示与保存能力。
- 后端实现三阶段流水线（规划→写作→审核+单次修订），并保留扩展 Stage4~Stage10 的接口。
- 引入公平线索、Chekhov 回收、时间轴一致性等自动校验。
- 提供提示词模板、日志记录、版本管理及内容安全策略。

## 3. 系统架构
- Orchestrator：`backend/src/agents/storyWorkflow/StoryWorkflowService.ts` 管理 Stage 队列、状态持久化、回滚与重试。
- Stage 执行器：`Stage01Planning.ts`（Reasoner）、`Stage02Writing.ts`（Chat）、`Stage03Review.ts`（Reasoner），后续预留 Stage04+。
- DeepSeek 客户端：复用现有封装，新增侦探专用 Prompt 常量与模型配置。
- 数据存储：Mongo 集合 `story_workflows`（流程与版本）和 `stories`（成稿与大纲扩展字段）。
- 前端 React 页面：侦探模式设置页、进度页、阅读页；状态由 Zustand/Redux 管理。
- 日志与监控：沿用详细日志系统，新增 `mystery-agent` 分类与 traceId。

## 4. 阶段流程概述
1. **Stage0** 建立项目卡：记录类型、意象、DoD、风险。
2. **Prompt 预验证**：用脚本对样例设定测试 Prompt 输出（至少 2 份），确保 JSON 结构稳健。
3. **Stage1** Reasoner 生成结构化大纲（核心诡计、角色、三幕、线索矩阵、时间表、真相）。
4. **Stage2** Chat 按大纲写作 ~5000 字正文（必要时分幕生成后拼接）。
5. **Stage3** Reasoner 审核逻辑，输出 `{approved, issues[], suggestions[]}`；若未通过，调用修订 Prompt 一次。
6. **Stage4** 运行校验器（公平线索、Chekhov 回收、时空一致性、误导策略、感官覆盖）。
7. **Stage5** 整合结果并提供保存接口；生成故事、审核报告与版本记录。
8. **Stage6~10** 预留：语言打磨、指标归档等后续扩展。

## 5. 数据模型（Mongo + 共享 TypeScript 接口）
- `StoryWorkflow`：包含 `project`, `miracle`, `outline`, `story`, `reviews`, `stageStates[]`, `validationReports[]`, `history[]`。
- `DetectiveOutline`：`centralTrick`, `characters`, `acts`, `clues`, `timeline`, `solution`, `themes`。
- `DetectiveStory`：`text`, `chapters`, `wordCount`, `styleFlags`。
- `ValidationReport`：`ruleId`, `status`, `details`, `checkedAt`。
- `Story` 文档新增 `{ type: "mystery", story, outline, review, length, tags }`。

## 6. 提示词策略
- `DETECTIVE_PLANNING_PROMPT`：强调公平线索、三幕结构、角色动机与时间表，强制 JSON Schema 输出。
- `DETECTIVE_WRITING_PROMPT`：传入 Outline JSON 与文风指令，限定视角、语气与目标字数。
- `DETECTIVE_REVIEW_PROMPT`：校验线索回收、时间一致、动机合理、语气节奏；输出结构化审核结果。
- `DETECTIVE_REVISION_PROMPT(issues)`：根据审核意见定位修改点，避免整篇重写。
- 所有 Prompt 在开发阶段通过 `scripts/dev/nodehere node scripts/test-prompts/detective-*.js` 进行样例验证。

## 7. 校验体系
- 公平线索时序：每个结论至少两条线索支持，且全部在揭示前出现。
- Chekhov 回收：所有道具/线索必须有“出现→起效→回收”闭环。
- 时间轴一致性：基于 timeline 计算角色最短移动路径与事件先后（结合城堡拓扑数据）。
- 误导占比：红鲱鱼不超过 40%，且每条误导配置反证场景。
- 感官覆盖：五感型线索占比 ≥ 60%。
- 校验失败时返回可读信息，允许人工编辑后重跑。

## 8. 前端实现
- `MysterySetupPage`：多步表单收集背景、侦探身份、谜题类型、意象标签、字数目标。
- `MysteryProgressDrawer`：轮询 `GET /api/story-workflows/:id`，显示阶段状态、耗时、实时日志；支持取消与重试。
- `MysteryStoryPage`：展示章节、线索表、审核报告；提供保存、Markdown 导出、返回入口。
- 前端 API 封装：`generateMystery`, `getWorkflowStatus`, `saveMysteryStory`, `rerunStage`。
- UI 细节：统一 loading 提示（规划中/写作中/审核中），并在失败时输出错误详情与指导语。

## 9. 版本管理与回滚
- `stageStates` 记录 `status`, `startedAt`, `finishedAt`, `outputRef`, `revision`。
- 每次人工编辑或修订写入 `history`（含 diff）；前端提供版本时间线视图。
- `POST /api/story-workflows/:id/revert` 支持管理员回滚到指定 revision。

## 10. 内容安全策略
- 放宽“案件相关词汇”过滤，允许“谋杀”“密室”等，但过滤过度血腥描述。
- 响应中附带 `contentWarnings` 字段，提示用户故事含悬疑案件元素。
- 记录审核日志供运营复查，保留人工审核开关和实时更新名单。

## 11. 测试计划
- 单元测试：Stage 执行器、Prompt 解析、校验器逻辑（Jest）。
- 集成测试：利用 fixture 模拟 DeepSeek 响应，覆盖 `/api/story-workflows` 全流程（Supertest）。
- 前端测试：React Testing Library 验证表单与状态切换；Playwright 覆盖“填写→生成→展示→保存”。
- 性能测试：评估 5000 字生成耗时与内存；必要时拆分写作请求。
- 回归测试：确保现有儿童故事流程不受影响。

## 12. 运维与部署
- 环境变量：`DETECTIVE_PLANNING_MODEL`, `DETECTIVE_WRITING_MODEL`, `DETECTIVE_REVIEW_MODEL`, `MYSTERY_TIMEOUT_SECONDS`。
- Node 命令统一使用 `scripts/dev/nodehere` 前缀。
- 迁移脚本：`npm run -w backend migrate:story-workflow` 创建集合及索引。
- 监控：统计生成时长、审核失败率、人工干预频次。
- 文档：`docs/STORY_WORKFLOW_AGENT.md`（接口、Prompt、FAQ），`docs/STORY_WORKFLOW_VALIDATION.md`（校验规则与应对流程）。

## 13. 风险与缓解
- Prompt 跑题：上线前做好样例验证；监控审核失败率及时调优 Prompt。
- DeepSeek 格式异常：封装层添加重试与格式兜底，解析失败时返回原文供排查。
- 存储膨胀：限制历史版本数量，定期归档老数据。
- 用户等待时间过长：提供阶段提示与取消按钮；必要时后台异步完成并通知。
- 合规风险：可配置白名单敏感词；运维端支持实时更新。

## 14. 时间表（4 周节奏）
- **第 1 周**：需求复核、数据模型、Prompt 设计与样例验证、Orchestrator 雏形。
- **第 2 周**：实现 Stage1~3、校验器、REST API，完成后端单元/集成测试。
- **第 3 周**：前端表单/进度/展示页，联调 API，完善保存流程。
- **第 4 周**：E2E 测试、性能调优、文档编写、内部试运行与反馈修复。

## 15. 验收标准
- 至少成功生成 3 篇 ≈5000 字侦探故事，逻辑无重大漏洞，审核通过率 ≥ 80%。
- 校验器能准确捕捉设计的线索遗漏、时间矛盾案例。
- 前端完整支持用户设定→生成→展示→保存流程，提示信息准确。
- 单元/集成/E2E 测试全部通过，监控指标纳入既有平台。

