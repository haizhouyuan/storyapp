# Storyapp 项目执行与测试计划（2025-09-26）

> 目标：在保证现有功能可用性的前提下，完成故事生成质量提升、后端稳态化与交付链路收敛，并以可重复的真实场景测试闭环支撑持续迭代。

## 1. 当前现状洞察
- **可用性与交付存在落差**：顶层文档宣称项目已完成，但生产 Docker 自测 4/7 通过、管理 API 屡次超时，deployment-summary 与 production-test-report 暗示尚未达到稳定线。
- **故事生成逻辑存在结构性短板**：缺乏 JSON-only 重试、选项规范化和阶段化审校，易出现解析失败、长度不足及风格漂移；故事树默认仅 2×2×1 分支，体验欠缺。
- **后端基础能力待完善**：OpenAPI 仅占位、Ready Check 未探测真实依赖、项目权限与阶段校验逻辑留有 TODO，缺少可观测与降级信息。
- **工程与流程尚未收敛**：CI/CD 报告指出 staging 部署为“伪可用”流程、主仓与 worktree 分支分散；package 脚本引用 `playwright-mcp` 目录但仓库缺失，安装链易失败。
- **前端体验进入中期阶段**：StoryTree 模式、Points UI 已上线但缺乏异常兜底与音频能力；测试依赖 Mock，真实 API 与性能路径覆盖不足。

## 2. 开发执行计划
| 阶段 | 时间窗口 | 核心目标 | 关键输出 |
| --- | --- | --- | --- |
| **阶段 I：可用性基线** | Day 0-2 | 修复依赖脚本、同步工作树、跑通 build/test/dev；统一 `.env` 与数据库初始脚本 | 整理工作树状态报告、更新安装与环境文档、`npm run build/test` 通过证明 |
| **阶段 II：后端稳态** | Day 2-5 | 复原 OpenAPI、Ready Check 真探测、实现权限/阶段校验最小版、优化管理 API 索引性能 | 更新后的 OpenAPI 文档、Ready/Health 指标截图、聚焦管理 API 的性能基线报告 |
| **阶段 III：故事生成质量冲刺** | Day 5-9 | 落地 JSON-only 重试、选项规范化、单次扩写、traceId/phaseTimings、独立限流；StoryTree 高级模式灰度 | 服务层改动 MR、单测/集成测试报告、StoryTree 降级提示设计稿 |
| **阶段 IV：交付链路收敛** | Day 9-12 | 重构 staging workflow、重新验证生产 Docker、整理 CI + 运维文档、准备发布 Checklist | 新的 CI/CD 工作流、`production-test-report` 回归、发布手册与验收清单 |

## 3. 测试目标
1. **基础可用性**：前后端启动、核心 API（生成/保存/列表/详情/删除）、StoryTree、高级管理视图在两种模式（真实 API / Mock）下均可运行。
2. **故事质量与结构**：每段内容 ≥500 字、中文、贴合儿童风格；分支选项数量与文案符合规范；StoryTree 生成 2×2×2 完整结构并具备降级策略。
3. **稳态与回退**：Mongo/DeepSeek 依赖可观测、Ready/Health 能反映降级；Mock 模式、限流、降级路径触发后系统保持可用。
4. **交付链路**：CI、staging、生产部署脚本全绿；Playwright、后端单测、Docker 验证在流水线与本地保持一致。
5. **运维操作性**：监控指标（请求量、成功率、延迟、限流命中）、日志审计、测试报告齐备，可在 30 分钟内完成一次端到端验收。

## 4. 测试计划（参考 orchestrator 场景法）

### 4.1 测试体系结构
- **单元测试**：后端 `npm run -w backend test` 聚焦 JSON 解析、限流、Mock 降级；前端组件单测（必要时引入 vitest / react-testing-library）。
- **集成测试**：
  - API 层：使用 supertest / Playwright API 模块验证 `generate-story`、`generate-full-story`、`admin/*`、健康/就绪接口。
  - 数据层：在 Mongo Memory Server 中验证索引、日志留存、清理任务。
- **端到端测试**：Playwright 按设备（桌面/移动）与模式（渐进式/故事树）分三套跑，覆盖保存、列表、删除、回到首页等链路；增加真实 DeepSeek 与 Mock 两种运行模式的基线。
- **运维测试**：Docker Compose（dev/prod）、CI/CD Workflow、SSH 脚本、日志与监控采集脚本，自带验证命令。

### 4.2 场景矩阵（A-G）
| 场景 | 目标 & 步骤 | 通过标准 | 记录输出 |
| --- | --- | --- | --- |
| **A. 命令执行反馈** | 运行 `npm run build && npm run test`、`docker compose up -d`，观察日志与终端输出 | 所有命令零错误；重要服务端口开放；Prometheus `/metrics` 可访问 | 构建日志、端口/健康探针截图 |
| **B. 故事生成链路** | 先 Mock 模式，后真 API；覆盖首段、续写、结尾；模拟 JSON 解析异常与超时 | 每种输入返回结构化 JSON，失败时触发重试或降级；traceId 与 phaseTimings 存在 | API 响应样例、服务日志、指标快照 |
| **C. StoryTree 与高级模式** | 触发 `/generate-full-story` 基础/高级模式；验证降级回退；前端 StoryTree 流程至结局 | 获取 2×2×2 树结构，节点长度合规；高级模式失败时降级到基础模式并提示 | StoryTree JSON、前端录屏、失败降级日志 |
| **D. 管理与审计** | 调用 `admin/stats`、`admin/logs` 等接口；执行日志导出/清理 | 响应在性能阈值内；分页、过滤、导出成功；日志索引命中 | API 报告、查询耗时、索引命中统计 |
| **E. 异常与降级** | 断开 Mongo、替换假 DeepSeek key、触发限流、强制超时 | Ready/Health 呈现降级状态；Mock 模式响应；限流返回 429；服务不中断 | 降级状态截图、限流命中数、错误日志 |
| **F. 部署与运维** | 跑 staging/生产 workflow、Docker prod 脚本、SSH 诊断脚本 | 所有 Workflow 绿色；Docker 验证通过；SSH 脚本输出 OK | CI 结果、`docker stats`、诊断日志 |
| **G. 指标与告警** | 采集 Prometheus、日志审计、WeCom/Slack 通知；模拟报警条件 | 指标项齐全；通知渠道成功；审计日志可查询 | 指标面板截图、通知记录、日志样本 |

### 4.3 调度与频率
- **每次开发迭代**：单元 + 集成 + 核心 E2E（A/B/E）。
- **周回归**：全量 E2E（A-G）、Docker 验证、CI/CD 自测。
- **发布前**：执行整套测试计划并更新《发布验收单》；准备回滚脚本；锁定 commit 与环境。

### 4.4 自动化与工具
- Playwright 测试独立配置（Desktop/Mobile/StoryTree），接入 HTML 报告与视频回放。
- GitHub Actions：CI 工作流分拆为 lint/typecheck、unit、api、playwright、docker 验证；staging/生产部署采用矩阵环境变量。
- Prometheus + Grafana：对接 `orchestrator_decision_latency_seconds` 类指标的 storyapp 版本（请求总数、成功率、响应时间、限流命中、Mock 使用率）。

## 5. 环境与准备
- **基础环境**：Node 20.x、npm ≥9、MongoDB 6.x、本地 DeepSeek API Key（或模拟）、Docker 24.x。
- **配置文件**：`config/env-loader` 自动加载 `.env*`；准备 `.env.development.local`（真实 API）与 `.env.mock`（降级）。
- **测试数据**：构造 5 组故事主题 + 组合选择路径；Mongo 初始化脚本创建最少 3 条历史故事记录。
- **服务依赖**：Prometheus/Grafana（监控）、WeCom 或 Slack Webhook（通知）、StoryTree 渲染所需静态资源。

## 6. 指标与验收准则
- **功能**：核心 API 成功率 ≥ 99%，StoryTree 节点全部返回；前端关键路径无致命错误。
- **性能**：生成接口 P95 < 5s（Mock 模式），P95 < 12s（真 API）；管理 API P95 < 2s。
- **稳定性**：降级切换耗时 < 5s；限流命中恢复后系统自动回归正常。
- **交付**：CI/CD 工作流 100% 通过；Docker/Staging 校验与文档更新同步完成。
- **运维**：指标面板、审计日志、通知验证齐备，可在 30 分钟内完成一次全链路验收。

## 7. 注意事项与风险缓解
- DeepSeek API 速率限制需提前申请；设置 Mock 兜底避免阻塞测试。
- Mongo 指标索引上线前需预演数据迁移，避免写入阻塞；初次部署建议进行备份。
- `playwright-mcp` 相关脚本需明确是否保留；如不落地必须清理以免 CI 失败。
- StoryTree 高级模式运行时长较长，需设置合理超时与降级提示，避免前端假死。
- WeCom/Slack 通知存在 IP 白名单限制，建议提供 Webhook 与本地消息总线两种模式。

## 8. 里程碑与交付物
1. 《Storyapp 可用性验收单》——记录阶段 I 核心流程与环境校验结果。
2. 《Story 生成质量改进 MR》+ 单元/集成测试报告（阶段 III）。
3. 《Staging/生产部署回归报告》与更新后的 `production-test-report.md`。
4. 《Storyapp 测试作业指导书》——包含场景清单、命令、预期输出、故障排查。
5. Grafana 仪表盘导出文件 + 最新通知渠道配置说明。

---
*维护者：Storyapp 团队 / 更新日期：2025-09-26*
