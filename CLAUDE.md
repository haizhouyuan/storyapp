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
│   │   ├── config/     # 配置文件 (数据库, DeepSeek API)
│   │   ├── routes/     # API路由 (stories, health)
│   │   ├── services/   # 业务逻辑 (故事生成服务)
│   │   └── types/      # TypeScript类型定义
│   └── package.json    # Express应用配置
├── shared/             # 共享类型定义
├── tests/              # Playwright E2E测试
├── docs/               # 项目文档
└── playwright.config.ts # 测试配置
```

## API接口

### 核心接口
- `POST /api/generate-story` - AI故事生成
- `POST /api/save-story` - 保存故事到数据库
- `GET /api/get-stories` - 获取故事列表
- `GET /api/get-story/:id` - 获取单个故事详情
- `GET /api/health` - 健康检查
- `GET /api/tts` - 语音接口占位

### 环境变量配置

后端（根目录 `.env`，供 Docker Compose 读取）
```bash
# DeepSeek API配置（必须）
DEEPSEEK_API_KEY=your_deepseek_api_key
DEEPSEEK_API_URL=https://api.deepseek.com

# MongoDB（通常使用 Compose 默认值即可）
# MONGODB_URI=mongodb://mongo:27017/storyapp
# MONGODB_DB_NAME=storyapp
```

前端（仅本地联调需要）
```bash
REACT_APP_API_URL=http://localhost:5001/api
REACT_APP_VERSION=1.0.0
REACT_APP_DEBUG=true
```

## 数据库结构（MongoDB）

集合：`stories`
- `_id: ObjectId`
- `title: string`（必填）
- `content: string`（必填，通常为包含 `storySegment`/`choices` 的 JSON 字符串）
- `created_at: Date`
- `updated_at: Date`

启动时初始化索引：
- `created_at` 降序索引（列表排序）
- `title` 文本索引（全文搜索）

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

## 代码规范

- 使用TypeScript确保类型安全
- 遵循React和Express最佳实践
- 使用中文注释和文档
- 保持组件和函数的单一职责原则
- 使用语义化的commit消息
