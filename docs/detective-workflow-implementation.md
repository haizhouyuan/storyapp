# 侦探工作流落地任务清单

本文档用于跟踪从脚本原型到完整工作流服务的开发任务。整体目标：在现有儿童故事项目中落地侦探故事多阶段流水线（Stage0~Stage10），并将其与日志、前端体验、数据库管理对齐。

## 任务分解

### 1. 数据模型与类型（进行中）
- [x] 在 `shared/` 中补充侦探工作流相关类型（Outline/StoryDraft/ValidationReport 等）
- [x] 扩展 `stories` / 新增 `story_workflows` 集合的 TypeScript 定义
- [x] 补充对应的 MongoDB 初始化逻辑与索引

### 2. 后端工作流 Orchestrator
- [x] 新建 `backend/src/agents/detective/` 模块，封装 Stage 执行入口
- [x] 对接 DeepSeek 调用（Stage1~3）并留出 Stage4+ 接口
- [x] 增加失败重试 / 观察性日志（复用现有 logger）

### 3. Stage4 校验器
- [x] 实现公平线索、时间轴一致性基础校验规则
- [x] 引入 Chekhov 回收、红鲱鱼占比等扩展校验，并在 `ValidationReport` 中附带指标
- [x] 覆盖单元测试（mock Outline 与 StoryDraft）

### 4. Stage5 版本整合与持久化
- [x] 整合 Stage1~4 输出，形成 `StoryWorkflow` 版本快照
- [x] 写入 `story_workflows` / 扩展 `stories` 集合
- [x] 支持追加历史版本、回滚、人工备注

### 5. API 与路由
- [x] 新增 `/api/story-workflows` 系列 REST 接口（创建、查询、重试、回滚）
- [x] 接入 rate limit / metrics / 日志
- [ ] 增加 Swagger 文档与自动化测试（Supertest）

### 6. 前端体验
- [x] 新增侦探模式入口 & 表单
- [x] 进度抽屉（轮询 Stage 状态、展示日志、允许取消/重试）
- [ ] 阅读页整合大纲、正文、校验报告，支持导出/保存

### 7. 监控与运维
- [ ] 扩展现有日志分类（新增 `mystery-agent` traceId）
- [ ] 将校验与 Stage 指标纳入监控（Prometheus + Appsmith 大屏）
- [ ] 更新部署脚本与 Runbook（DeepSeek 模型、超时配置等）

### 8. 提示词调优与脚本化
- [ ] 将调优脚本迁移到 `scripts/workflow/`，支持参数化运行
- [ ] 为 Stage1/2/3/4 输出生成快照与回归数据
- [ ] 建立 Prompt 版本控制与对比报告

## 当前迭代 TODO

- [x] 设计并落地 Stage4 校验器最小可用版本（含类型定义、单元测试）
- [x] 在共享类型中补齐侦探工作流相关接口
- [ ] 将 Stage4 校验器集成到后端（临时 CLI 或 Service Hook）
- [ ] 制作 CLI/脚本示例，演示从 Stage1/2 输出生成校验报告
- [ ] 规划下一步：扩展校验规则（Chekhov 回收、误导占比等）

> 注：以上 TODO 完成后，再规划 Stage5+ 的落地与前端联调。
