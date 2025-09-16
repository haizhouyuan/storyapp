# Codex 工具路由规则（强制执行）

> **系统提示**：所有回复必须使用中文。

## 总目标
- 在满足需求的同时，优先使用最合适的 MCP/工具，减少无效尝试与幻觉。

---

## 一、三层控制法（从强到弱，逐层兜底）

### ① 配置层（启用哪些工具）
- 在 `~/.codex/config.toml` 里声明要用的 MCP（playwright / figma / shadcn / context7 等）。
- 只挂**真正会用**的 MCP，减少歧义与错误调用。
- 确保 `npx --help` 可用，避免执行时才发现缺依赖。

### ② 策略层（写进 `AGENTS.md` 的工具路由规则）
- 在仓库根目录维护本文件，明确“**什么时候必须用哪个工具**、什么时候**绝对不要用**”。
- 提供少量高质量 few-shot 示例，帮助模型正确路由。

### ③ 会话层（每个任务开头 10 行的路由指令块）
- 每次任务都要求：**先给出计划（含将调用的 MCP/命令），再动手**。
- 计划里若没有必要的工具，视为路由失败，需要重新规划。
- 使用触发词/标签强提示（如“【需要拉官方文档】→ 用 Context7”）。

---

## 二、可复制模板（放在 `AGENTS.md` 顶部或开场提示）

```md
# Codex 工具路由规则（强制执行）

## 总目标
- 在满足需求的同时，优先使用最合适的 MCP/工具，减少无效尝试与幻觉。

## 何时必须调用
- Context7：当出现“最新/指定版本/破坏性变更/错误信息不确定”→ 先查 `package@version` 官方文档，再写代码。
- Figma MCP：当任务涉及“按设计稿对齐尺寸/约束/变量/图层名称/切图”→ 先拉取目标文件/页面/节点信息（tokens、constraints），再生成代码。
- shadcn MCP：当要“生成或补齐 React 组件/样式且项目使用 shadcn 体系”→ 先用 shadcn MCP/CLI 脚手架生成，再按项目约定修改。
- Playwright MCP：当要“端到端验证 UI/交互/路由/无障碍/性能”或“重现并录制失败场景”→ 生成并运行 E2E 测试，产出 trace/screenshot。

## 何时禁止调用
- 不要用 Playwright 获取文档或做 HTTP API 说明（请用 Context7+文档）。
- 不要在未指定 Figma 文件/页面/节点时盲目调用 Figma（先向用户或变量确认）。
- 不要在项目未采用 shadcn 或未存在 components.json 时强行生成 shadcn 组件。
- 在未说明联网安全策略时，不要自动下载大型依赖；需先给出计划与成本预估。

## 执行流程（每个任务都遵守）
1. **Plan**：打印“工具与步骤计划”（含将调用的 MCP 名称、为什么需要它）。
2. **Probe**：若要调用 MCP，先执行最小探针（list/search/getMeta），确认可用与参数正确。
3. **Act**：实现最小闭环；若需外网/写文件/跑浏览器，列出命令与预计时长/资源供确认。
4. **Verify**：生成验证命令（例如 `npx playwright test --project=chromium` 或相关单元/集成测试）。
5. **Artifacts**：列出产出（代码路径、测试报告、trace、截图、文档链接）。

## Few-Shot（示例）
- *示例1：修复 axios 429*
  - 使用 Context7 查询 `axios@1.x` 与服务端速率限制最佳实践 → 修改重试/退避。
- *示例2：按设计稿生成 Button*
  - Figma MCP 获取 tokens/constraints → shadcn 生成组件骨架 → Playwright 录制并断言交互。
```

---

## 三、会话里“任务头三行”模板

### 模板 A（路由+计划优先）
```
请按以下顺序执行并先打印计划再开工：
1) 选择并列出要用的 MCP/工具（Context7/Figma/shadcn/Playwright/本地Shell），每个写“为什么需要它”；
2) 用最小探针检验 MCP 参数是否可用（失败立即回报并给修复建议，不要硬跑）；
3) 产出可验证的最小闭环，并给出验证命令与通过标准；
4) 列出生成的文件、报告、trace 的路径。

任务：{在此粘贴你的业务需求}
```

### 模板 B（强制 Context7 先查再写）
```
如果任务涉及库/框架/API 的版本或不确定之处，必须先用 Context7 查询指定版本官方文档与示例，然后再编码。
任务：{…}
```

### 模板 C（设计驱动 UI）
```
需要从 Figma 文件 {FILE_KEY}/{PAGE}/{NODE?} 读取 tokens/constraints，然后用 shadcn 生成组件，最后用 Playwright 录制 E2E。
请先打印工具计划与最小探针结果，再开始。
```

---

## 四、典型场景“该用谁”的决策表

| 场景/线索 | 该用的工具 | 触发词/信号 | 禁止使用 |
| --- | --- | --- | --- |
| 不确定 API/版本、看到报错栈、要“最新版做法” | **Context7** | “最新 / vX / breaking / error” | 不要用 Playwright 去翻网页 |
| 要把 Figma 设计还原为代码（尺寸/约束/变量命名） | **Figma MCP** | 指定 `file/page/node`、tokens | 不要瞎猜像素或手填 |
| 需要生成/统一组件库的代码骨架 | **shadcn MCP/CLI** | 项目采用 shadcn、存在 components.json | 不要手写全部样式 |
| 端到端验证页面、交互、路由、可访问性、截图/trace | **Playwright MCP** | “验证 / 回归 / 录制 / trace / e2e” | 不要用单元测试替代 |
| 只改一处小 bug、无外部依赖 | **本地 Shell/编辑动作** | 无需联网/外部工具 | 不要为小改动启用大型工具 |

---

## 五、输出与安全：动手前的自检
- 无论是否使用 `--dangerously-bypass-approvals-and-sandbox`，都要求先打印计划。
- 在计划里明确：
  - 将调用的 MCP 名称/方法（如 `context7.query(axios@1.7, topic="retry")`）。
  - 是否需要外网/浏览器/写文件及预计成本（示例：“下载 120MB 浏览器内核，约 3 分钟”）。
  - 验证命令与通过标准（如“Playwright 全绿、Lighthouse ≥ 90、无 a11y 高风险”）。

---

## 六、即插即用的实战提示词

### 1）文档敏感的后端改造（Context7 → 实现 → 验证）
```
当遇到 API/版本不确定，请先用 Context7 查询并引用官方文档链接与段落，然后再写代码。
任务：把 login 接口的 axios 重试与退避策略改为指数退避，并兼容429/503；给出单元测试和 curl 验证命令。
```

### 2）设计还原到组件（Figma → shadcn → Playwright）
```
请从 Figma FILE={XXX} PAGE={YYY} NODE={可选} 读取 tokens/constraints，
用 shadcn 生成 Button 组件（变体：primary/ghost/disabled），
最后用 Playwright 录制点击与键盘可达性测试；给出测试命令与截图/trace。
```

### 3）前端报错修复（Context7 → 小范围修补 → E2E 冒烟）
```
先用 Context7 查 {react-router-dom@6.x} 关于 {Navigate/Redirect} 的官方做法，
修复我们项目的路由重定向错误；生成一个 Playwright 冒烟测试覆盖登录→主页→设置→退出全链路。
```

---

## 七、失败回退策略
1. **最小探针失败** → 不要继续硬跑。打印失败原因与修复建议（如缺 PAT、需 `npx playwright install`、代理/证书问题）。
2. **暂时无法用 MCP** → 切换到非工具路径（例如手动实现并标注 TODO，或请求所需参数）。
3. **再次尝试前** → 打印即将进行的变更列表（文件修改、命令、预期副作用）。

---

## 八、完成条件
- 代码改动路径与 diff 概览。
- 若使用 Context7：引用到的官方文档链接、标题、版本，并简述采用点。
- 若使用 Figma：列出提取的 tokens/constraints。
- 若使用 shadcn：列出生成的组件/样式/变体清单。
- 若使用 Playwright：提供测试命令、通过的项目、生成的 trace/screenshot 路径。
- 本地验证或 CI 指令需一键执行。

---

## 小结
- **配置层**决定工具能否使用。
- **策略层**（本文件）决定何时应使用。
- **会话层**指令块确保每次任务先规划，正确调用工具并验证结果。
- 结合模板与决策表，Codex 将更可靠地选择 MCP/工具并在必要时回退。

---
# Repository Guidelines

## Project Overview

这是一个儿童睡前互动故事应用，使用AI生成个性化故事内容，让孩子通过选择不同的情节分支来推动故事发展。

### 技术栈
- **前端**: React + TypeScript + Tailwind CSS + Framer Motion
- **后端**: Node.js + Express + TypeScript
- **数据库**: MongoDB（通过 Docker Compose 内置 `mongo` 服务）
- **AI服务**: DeepSeek API
- **测试**: Playwright E2E测试
- **监控**: 详细日志记录系统 + Appsmith可视化后台

## Project Structure & Module Organization
- `frontend/` – React + TypeScript UI (Tailwind). Key dirs: `src/components/`, `src/pages/`, `src/utils/`.
- `backend/` – Express + TypeScript API. Key dirs: `src/routes/`, `src/services/`, `src/config/`.
- `shared/` – Cross‑package types.
- `tests/` – Playwright E2E tests; config in `playwright.config.ts`.
- `docs/` – Documentation; `.env.example` at repo root (copy to `backend/.env`).

## Build, Test, and Development Commands

### 安装依赖
```bash
# 安装所有依赖（推荐）
npm run install:all

# 或分别安装
npm install
cd backend && npm install
cd ../frontend && npm install --legacy-peer-deps
```

### 开发模式
```bash
# 同时启动前后端开发服务器
npm run dev

# 分别启动
npm run dev:backend  # 后端: http://localhost:5000
npm run dev:frontend # 前端: http://localhost:3000
```

### 构建和部署
```bash
# 构建生产版本
npm run build

# 启动生产服务器
npm run start
```

### 测试
```bash
# 安装Playwright浏览器
npx playwright install

# 运行E2E测试
npm test

# 运行后端测试
cd backend && npm test

# 测试日志记录系统（新增）
node test-logging-system.js
```

## Coding Style & Naming Conventions
- TypeScript everywhere; prefer explicit types at module boundaries.
- Indentation: 2 spaces; max line ~100–120 chars.
- React components: PascalCase files (e.g., `StoryCard.tsx`). Hooks: `useX.ts`.
- Backend modules and routes: kebab- or lower-case (e.g., `stories.ts`, `health.ts`).
- Use ESLint from CRA defaults in `frontend`; keep code formatted (Prettier defaults are fine).

## Testing Guidelines
- E2E: Add scenarios in `tests/`; use stable selectors (e.g., `data-testid="choice-button"`).
- Backend: Add Jest tests alongside source or in `backend/__tests__/`.
- Include a basic test plan in PRs; run `npm test` locally before pushing.

## Commit & Pull Request Guidelines
- Use Conventional Commits: `feat`, `fix`, `docs`, `test`, `refactor`, `chore`.
  - Example: `feat(backend): add GET /api/get-stories`
- PRs should include:
  - Clear description and rationale; link issues.
  - Screenshots/GIFs for UI changes.
  - Test plan and any new/updated tests.

## Security & Configuration Tips
- Do not commit secrets. Create a root `.env` with `DEEPSEEK_API_KEY` (and optional `DEEPSEEK_API_URL`).
- MongoDB uses Docker Compose defaults (`mongodb://mongo:27017/storyapp`); override via `MONGODB_URI`/`MONGODB_DB_NAME` only if needed.
- Avoid logging sensitive values; validate inputs on all API routes.
- Rate limiting is configurable via `RATE_LIMIT_*` env vars.

## Agent-Specific Instructions
- Keep changes minimal and scoped; follow this guide.
- Respect existing structure and scripts; avoid broad refactors in a single PR.

## Project Overview
- Children’s interactive bedtime story app with AI-generated, branching narratives.
- Stack: React + TypeScript + Tailwind + Framer Motion (frontend); Node.js + Express + TypeScript (backend); MongoDB (Docker Compose `mongo`); DeepSeek API; Playwright for E2E.

## Core APIs
- `POST /api/generate-story` – Generate story via DeepSeek.
- `POST /api/save-story` – Persist story to MongoDB.
- `GET /api/get-stories` – List stories.
- `GET /api/get-story/:id` – Story detail.
- `GET /api/health` – Health check.
- `GET /api/tts` – TTS placeholder.

### 管理后台API（新增）
- `GET /api/admin/stats` - 获取系统统计数据
- `GET /api/admin/logs` - 获取分页日志数据
- `GET /api/admin/performance` - 获取性能指标
- `GET /api/admin/sessions/active` - 获取活跃会话
- `GET /api/admin/logs/:sessionId` - 获取特定会话日志
- `POST /api/admin/logs/export` - 导出日志数据
- `DELETE /api/admin/logs/cleanup` - 清理过期日志

## Environment Variables

Backend (root `.env`, used by Docker Compose):

```
# DeepSeek API
DEEPSEEK_API_KEY=your_deepseek_api_key
DEEPSEEK_API_URL=https://api.deepseek.com

# MongoDB (optional overrides)
# MONGODB_URI=mongodb://mongo:27017/storyapp
# MONGODB_DB_NAME=storyapp

# 日志记录配置（新增）
ENABLE_DETAILED_LOGGING=true
ENABLE_DB_LOGGING=true
LOG_LEVEL=info
LOG_RETENTION_DAYS=30
```

Frontend (`frontend/.env`, optional for local dev):

```
REACT_APP_API_URL=http://localhost:5001/api
REACT_APP_VERSION=1.0.0
REACT_APP_DEBUG=true
```

## Database Schema (MongoDB)

### 主要集合

#### `stories` 集合
- `_id: ObjectId`
- `title: string`（必填）
- `content: string`（必填，通常为包含 `storySegment`/`choices` 的 JSON 字符串）
- `created_at: Date`
- `updated_at: Date`

#### `story_logs` 集合（新增）
- `_id: ObjectId`
- `sessionId: string`（会话唯一标识）
- `timestamp: Date`（事件时间戳）
- `logLevel: string`（日志级别：debug/info/warn/error）
- `eventType: string`（事件类型）
- `message: string`（日志消息）
- `data: Object`（业务数据）
- `performance: Object`（性能指标）
- `context: Object`（上下文信息）
- `stackTrace: string`（错误堆栈，可选）

### 数据库索引

启动时自动创建索引：

**stories集合**：
- `created_at` 降序索引（列表排序）
- `title` 文本索引（全文搜索）

**story_logs集合**：
- `sessionId` 索引（会话查询）
- `timestamp` 降序索引（时间排序）
- `eventType` 索引（事件类型筛选）
- `logLevel` 索引（日志级别筛选）
- `{sessionId: 1, timestamp: -1}` 复合索引
- `{eventType: 1, timestamp: -1}` 复合索引
- `{timestamp: 1}` TTL索引（30天自动过期）

## Story Generation Flow
1. Client calls `POST /api/generate-story` with user inputs.
2. Backend service calls DeepSeek API to compose structured story JSON with branches.
3. Client can optionally call `POST /api/save-story` to persist result to `stories`.
4. Client fetches via `GET /api/get-stories` and `GET /api/get-story/:id` to render/play.

Notes:
- Validate and sanitize inputs; enforce rate limiting.
- Provide user-friendly Chinese error messages on failure paths.

## Deployment (Step-by-Step)

- Repos:
  - GitHub (primary): `https://github.com/haizhouyuan/storyapp.git`
  - Gitee (prod): `https://gitee.com/yuanhaizhou123/storyapp.git`

- Server Access:
  - SSH: `ssh root@47.120.74.212`
  - Project path (absolute): `/root/projects/storyapp`

- Code flow:
  - Commit with Conventional Commits, push to both remotes.
  - Use `./scripts/push-to-all.sh` or push `origin` and `gitee` manually.

- Server prep (.env at repo root; do not commit):
  - `DEEPSEEK_API_KEY=...`
  - `DEEPSEEK_API_URL=https://api.deepseek.com`

- Build and run (manual commands; prefer this over batch scripts like `deploy.sh`):
  - `docker compose -f docker-compose.yml build --no-cache app`
  - `docker compose -f docker-compose.yml up -d mongo`
  - `docker compose -f docker-compose.yml up -d app`
  - Health: `curl http://localhost:5001/api/health`
  - Logs: `docker compose -f docker-compose.yml logs -f app`
  - Optional proxy: `docker compose -f docker-compose.yml --profile nginx up -d nginx`

- Ports:
  - App container `5000` → host `5001`. Use `http://localhost:5001` for checks and tests.

- E2E (production):
  - `ssh <prod-user>@<prod-host>` then run on the server:
    - `cd /path/to/storyapp`
    - `npx playwright install`
    - `npx playwright test -c playwright.prod.config.ts`
  - Do NOT run against local services to avoid confusing local smoke tests with production tests.

Note: Prefer these step-by-step commands over batch scripts like `deploy.sh`.

## Testing & Troubleshooting
- E2E: Playwright (`npm test`); install browsers via `npx playwright install`.
- Backend unit tests: `cd backend && npm test`.
- Common issues: see `docs/SETUP.md` (env vars, DB connection, DeepSeek failures, frontend build).

## UX & Quality Notes
- Child-friendly UI: large buttons, rounded corners, soft colors.
- Accessibility: keyboard navigation and screen readers.
- Responsive: mobile and desktop.
- Code style: TypeScript, single-responsibility components/functions, semantic commits.

## 日志记录和监控系统（新增）

### 系统概述
项目集成了详细的日志记录系统和Appsmith可视化后台，用于监控故事生成流程的每个步骤。

### 快速测试
```bash
# 运行完整的系统功能测试
node test-logging-system.js
```

### 主要功能
1. **会话级别跟踪** - 每个故事生成分配唯一会话ID
2. **详细步骤记录** - AI API调用、JSON解析、质量检查等
3. **性能指标收集** - 响应时间、Token使用量、错误率
4. **可视化监控** - Appsmith构建的管理后台界面
5. **数据导出功能** - 支持JSON/CSV格式导出
6. **自动清理机制** - 过期日志自动删除（30天）

### Appsmith后台配置
1. **导入配置文件**：
   ```bash
   # 使用项目根目录的配置文件
   appsmith-story-admin.json
   ```

2. **查看配置指南**：
   ```bash
   # 详细的Appsmith搭建文档
   docs/APPSMITH_SETUP.md
   ```

3. **数据源配置**：
   - MongoDB: `mongodb://localhost:27017/storyapp`
   - REST API: `http://localhost:5001/api/admin`

### 监控指标
- **系统概览**: 总会话数、24小时活跃数、成功率
- **性能分析**: API响应时间趋势、Token使用统计
- **错误监控**: 错误类型分布、失败率趋势
- **用户行为**: 热门主题排行、使用模式分析

### 日志事件类型
- `session_start/session_end` - 会话生命周期
- `story_generation_start/complete` - 故事生成流程
- `ai_api_request/response/error` - AI API调用
- `json_parse_start/success/error` - JSON解析
- `content_validation` - 内容验证
- `quality_check` - 质量检查
- `db_save_start/success/error` - 数据库操作
