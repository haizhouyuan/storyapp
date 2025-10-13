# Repository Guidelines

## ⚠️ 重要：Node.js 环境配置

**本项目使用仓库内的 Node.js v22.19.0，禁止直接使用系统 `node` 或 `npm` 命令！**

### 所有 Node/npm 命令必须通过以下方式执行：

```bash
# 方式1：使用 nodehere 脚本（推荐）
scripts/dev/nodehere node -v
scripts/dev/nodehere npm run -w backend type-check
scripts/dev/nodehere npm run -w frontend build
scripts/dev/nodehere npm test

# 方式2：手动设置 PATH（不推荐，容易忘记）
export PATH="$PWD/.tools/node-v22/bin:$PATH"
node -v
npm -v
```

### 为什么需要这样做？
- Codex/OpenAI Codex 的沙箱环境无法访问系统级 Node.js
- 项目在 `.tools/node-v22/` 中包含了完整的 Node.js 环境
- `scripts/dev/nodehere` 脚本会自动设置正确的 PATH

### 常用命令速查

```bash
# 类型检查
scripts/dev/nodehere npm run -w backend type-check
scripts/dev/nodehere npm run -w frontend type-check

# 构建
scripts/dev/nodehere npm run build

# 测试
scripts/dev/nodehere npm test

# 开发模式
scripts/dev/nodehere npm run dev
```

📝 **详细文档**：`docs/CODEX_NODE_SETUP.md`

---

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

⚠️ **重要提醒**：所有命令都必须使用 `scripts/dev/nodehere` 前缀！

### 安装依赖
```bash
# 安装所有依赖（推荐）
scripts/dev/nodehere npm run install:all

# 或分别安装
scripts/dev/nodehere npm install
cd backend && ../scripts/dev/nodehere npm install
cd ../frontend && ../scripts/dev/nodehere npm install --legacy-peer-deps
```

### 开发模式
```bash
# 同时启动前后端开发服务器
scripts/dev/nodehere npm run dev

# 分别启动
scripts/dev/nodehere npm run dev:backend  # 后端: http://localhost:5000
scripts/dev/nodehere npm run dev:frontend # 前端: http://localhost:3000
```

### 构建和部署
```bash
# 构建生产版本
scripts/dev/nodehere npm run build

# 启动生产服务器
scripts/dev/nodehere npm run start
```

### 测试
```bash
# 安装Playwright浏览器
scripts/dev/nodehere npx playwright install

# 运行E2E测试
scripts/dev/nodehere npm test

# 运行后端测试
cd backend && ../scripts/dev/nodehere npm test

# 测试日志记录系统（新增）
scripts/dev/nodehere node test-logging-system.js
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
- 所有对外回复默认使用中文，除非用户另有明确要求。

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

- Server Access:
  - SSH: `ssh root@47.120.74.212`
  - Project path (absolute): `/root/projects/storyapp`

- Code flow:
  - Commit with Conventional Commits 并推送到 GitHub `origin`。

- Server prep (.env at repo root; do not commit):
  - `DEEPSEEK_API_KEY=...`
  - `DEEPSEEK_API_URL=https://api.deepseek.com`

- Build and run (manual commands; 推荐使用脚本 `scripts/server-deploy.sh`，避免旧版 `deploy.sh`):
  - `docker compose -f docker-compose.yml build --no-cache app`
  - `docker compose -f docker-compose.yml up -d mongo-primary mongo-secondary mongo-arbiter mongo-backup`
  - `docker compose -f docker-compose.yml up -d app`
  - Health: `curl http://localhost:5001/api/health`
  - Logs: `docker compose -f docker-compose.yml logs -f app`
  - Optional proxy: `docker compose -f docker-compose.yml --profile nginx up -d nginx`

- Ports:
  - App container `5000` → host `5001`. Use `http://localhost:5001` for checks and tests.

- E2E (production):
  - `ssh <prod-user>@<prod-host>` then run on the server:
    - `cd /path/to/storyapp`
    - `./scripts/dev/nodehere npx playwright install`
    - `./scripts/dev/nodehere npx playwright test -c playwright.prod.config.ts`
  - Do NOT run against local services to avoid confusing local smoke tests with production tests.

Note: Prefer these step-by-step commands or `scripts/server-deploy.sh`; legacy `deploy.sh` 已废弃。

## Testing & Troubleshooting
- E2E: Playwright (`scripts/dev/nodehere npm test`); install浏览器: `scripts/dev/nodehere npx playwright install`。
- Backend unit tests: `cd backend && ../scripts/dev/nodehere npm test`。
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
scripts/dev/nodehere node test-logging-system.js
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

# Language & Style
- 所有解释性输出与讨论，请使用「简体中文」。
