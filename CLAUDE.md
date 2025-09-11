# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

这是一个儿童睡前互动故事应用，使用AI生成个性化故事内容，让孩子通过选择不同的情节分支来推动故事发展。

### 技术栈
- **前端**: React + TypeScript + Tailwind CSS + Framer Motion
- **后端**: Node.js + Express + TypeScript
- **数据库**: MongoDB（通过 Docker Compose 内置 `mongo` 服务）
- **AI服务**: DeepSeek API
- **测试**: Playwright E2E测试
- **监控**: 详细日志记录系统 + Appsmith可视化后台

## 开发命令

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

## 项目结构

```
storyapp/
├── frontend/           # React前端应用
│   ├── src/
│   │   ├── components/ # 可复用组件 (Button, LoadingSpinner, StoryCard)
│   │   ├── pages/      # 页面组件 (HomePage, StoryPage, EndPage, MyStoriesPage)
│   │   ├── utils/      # 工具函数 (API调用, 本地存储, 辅助函数)
│   │   └── index.tsx   # 应用入口
│   └── package.json    # React应用配置
├── backend/            # Express后端API
│   ├── src/
│   │   ├── config/     # 配置文件 (数据库, DeepSeek API, 数据库初始化)
│   │   ├── routes/     # API路由 (stories, health, admin)
│   │   ├── services/   # 业务逻辑 (故事生成服务)
│   │   ├── utils/      # 工具函数 (日志记录系统)
│   │   └── types/      # TypeScript类型定义
│   └── package.json    # Express应用配置
├── shared/             # 共享类型定义 (包含日志和管理API类型)
├── tests/              # Playwright E2E测试
├── docs/               # 项目文档 (包含Appsmith配置指南)
├── appsmith-story-admin.json  # Appsmith应用配置文件
├── test-logging-system.js     # 日志系统测试脚本
├── README_LOGGING_SYSTEM.md   # 日志系统使用说明
└── playwright.config.ts       # 测试配置
```

## API接口

### 核心接口
- `POST /api/generate-story` - AI故事生成
- `POST /api/save-story` - 保存故事到数据库
- `GET /api/get-stories` - 获取故事列表
- `GET /api/get-story/:id` - 获取单个故事详情
- `GET /api/health` - 健康检查
- `GET /api/tts` - 语音接口占位

### 管理后台API（新增）
- `GET /api/admin/stats` - 获取系统统计数据
- `GET /api/admin/logs` - 获取分页日志数据
- `GET /api/admin/performance` - 获取性能指标
- `GET /api/admin/sessions/active` - 获取活跃会话
- `GET /api/admin/logs/:sessionId` - 获取特定会话日志
- `POST /api/admin/logs/export` - 导出日志数据
- `DELETE /api/admin/logs/cleanup` - 清理过期日志

### 管理员API接口 (新增)
- `GET /api/admin/stats` - 获取系统统计信息
- `GET /api/admin/logs` - 获取日志列表 (支持分页、筛选)
- `GET /api/admin/logs/:sessionId` - 获取特定会话完整日志
- `GET /api/admin/performance` - 获取性能指标数据
- `GET /api/admin/sessions/active` - 获取活跃会话列表
- `POST /api/admin/logs/export` - 导出日志数据 (JSON/CSV)
- `DELETE /api/admin/logs/cleanup` - 清理过期日志

### 环境变量配置

后端（根目录 `.env`，供 Docker Compose 读取）
```bash
# DeepSeek API配置（必须）
DEEPSEEK_API_KEY=your_deepseek_api_key
DEEPSEEK_API_URL=https://api.deepseek.com

# MongoDB（通常使用 Compose 默认值即可）
# MONGODB_URI=mongodb://mongo:27017/storyapp
# MONGODB_DB_NAME=storyapp

# 日志记录配置（新增）
ENABLE_DETAILED_LOGGING=true
ENABLE_DB_LOGGING=true
LOG_LEVEL=info
LOG_RETENTION_DAYS=30
```

前端（仅本地联调需要）
```bash
REACT_APP_API_URL=http://localhost:5001/api
REACT_APP_VERSION=1.0.0
REACT_APP_DEBUG=true
```

## 数据库结构（MongoDB）

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

## 开发注意事项

1. **儿童友好设计**: 所有UI组件必须符合儿童使用习惯（大按钮、圆角设计、柔和色彩）
2. **API安全**: 使用速率限制和输入验证防止滥用
3. **错误处理**: 提供友好的中文错误提示
4. **响应式设计**: 确保在移动设备和桌面设备上都能良好显示
5. **无障碍性**: 支持键盘导航和屏幕阅读器

## 测试策略

- **E2E测试**: 使用Playwright测试完整用户流程
- **API测试**: 验证后端接口功能
- **UI测试**: 检查界面交互和响应式设计
- **错误处理测试**: 验证网络失败等异常场景

## 部署信息

### 代码管理和部署流程

#### 📋 远程仓库配置
- **GitHub (主要开发)**: `https://github.com/haizhouyuan/storyapp.git`
- **Gitee (生产部署)**: `https://gitee.com/yuanhaizhou123/storyapp.git`

#### 🔐 阿里云连接方式与项目路径
- SSH 登录：`ssh root@47.120.74.212`
- 项目绝对路径：`/root/projects/storyapp`

#### 🧭 代码管理流程（务必遵守）
```bash
# 提交采用 Conventional Commits
git add -A
git commit -m "feat(backend): implement POST /api/generate-story"

# 双仓库推送（推荐使用脚本，也可手动）
./scripts/push-to-all.sh
# 或者手动（当前分支）：
git push origin $(git branch --show-current)
git push gitee $(git branch --show-current)
```

#### 🌐 生产环境域名和服务配置
- **生产域名**: `https://storyapp.dandanbaba.xyz`
- **服务端口**: 5001 (内部)
- **代理配置**: Nginx反向代理到localhost:5001
- **SSL配置**: 待配置HTTPS证书

#### 🚀 分步部署（推荐，逐条命令执行）
```bash
# 0) 服务器准备
# 在仓库根目录创建 .env，仅包含必要密钥（勿提交到仓库）
cat > .env << 'EOF'
DEEPSEEK_API_KEY=your_deepseek_key
DEEPSEEK_API_URL=https://api.deepseek.com
MONGODB_URI=mongodb://localhost:27017
MONGODB_DB_NAME=storyapp
PORT=5001
NODE_ENV=production
EOF

# 1) 构建镜像（只构建 app）
docker compose -f docker-compose.yml build --no-cache app

# 2) 启动数据库
docker compose -f docker-compose.yml up -d mongo
docker compose -f docker-compose.yml ps
# 可观察日志确保 healthy
docker compose -f docker-compose.yml logs -f mongo

# 3) 启动应用（端口映射：容器5000 → 主机5001）
docker compose -f docker-compose.yml up -d app
docker compose -f docker-compose.yml logs -f app

# 4) 启动后端服务（非Docker方式，推荐生产环境）
cd backend && npm run dev  # 或使用 pm2 进行进程管理

# 5) 配置Nginx反向代理到域名
# Nginx配置文件：/etc/nginx/sites-available/storyapp.dandanbaba.xyz
sudo systemctl reload nginx

# 6) 健康检查
curl -fsS http://localhost:5001/api/health           # 本地检查
curl -fsS http://storyapp.dandanbaba.xyz/api/health  # 域名检查

# 7) 常用运维
pm2 restart storyapp          # 重启应用（如使用pm2）
pm2 logs storyapp            # 查看日志
systemctl status nginx       # 检查Nginx状态
```

端口说明：容器内应用监听 `5000`，对外暴露为主机 `5001`，健康检查、E2E 和手工测试均使用 `http://localhost:5001`。

#### ✅ 生产环境端到端业务验证（不使用假数据）
```bash
# 安装 Playwright 浏览器依赖（仅第一次）
npx playwright install

# 注意：务必通过 SSH 到生产服务器上执行生产验证，避免本地误判为生产
ssh <prod-user>@<prod-host>
  cd /path/to/storyapp
  npx playwright test -c playwright.prod.config.ts

# 手工 API 验证（DeepSeek 必须配置正确）：

# 1) 生成故事片段（在生产服务器上执行）
# 本地API测试
curl -fsS -X POST http://localhost:5001/api/generate-story \
  -H 'Content-Type: application/json' \
  -d '{"topic":"宇航员小熊","maxChoices":6}'

# 域名API测试
curl -fsS -X POST http://storyapp.dandanbaba.xyz/api/generate-story \
  -H 'Content-Type: application/json' \
  -d '{"topic":"宇航员小熊","maxChoices":6}'

# 2) 保存故事（把上一步返回的片段包成 content 文本或JSON字符串）
curl -fsS -X POST http://storyapp.dandanbaba.xyz/api/save-story \
  -H 'Content-Type: application/json' \
  -d '{"title":"宇航员小熊的冒险","content":"{\\"storySegment\\":\\"...\\"}"}'

# 3) 获取列表/详情
curl -fsS http://storyapp.dandanbaba.xyz/api/get-stories
curl -fsS http://storyapp.dandanbaba.xyz/api/get-story/<id>
```

注意：`generateFullStoryTreeService` 仅在缺失 `DEEPSEEK_API_KEY` 时回退到模拟数据。生产验证必须设置真实密钥，严禁走模拟路径。

### 详细部署文档
更多细节参见 `docs/DEPLOYMENT_WORKFLOW.md` 与 `agents/deploy-agent.md`。本文件以“逐条命令执行”为准，不再推荐批处理式 `deploy.sh`。

### 生产环境配置
- 设置 `NODE_ENV=production`
- 使用生产环境API密钥
- Docker容器化部署
- 配置监控和日志记录

## 故障排除

常见问题请参考 `docs/SETUP.md`，包含：
- 环境变量配置问题
- 数据库连接失败
- DeepSeek API调用失败
- 前端构建问题

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

### 使用说明
详细使用说明请参考：`README_LOGGING_SYSTEM.md`

## 代码规范

- 使用TypeScript确保类型安全
- 遵循React和Express最佳实践
- 使用中文注释和文档
- 保持组件和函数的单一职责原则
- 使用语义化的commit消息
