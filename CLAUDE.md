# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

这是一个儿童睡前互动故事应用，使用AI生成个性化故事内容，让孩子通过选择不同的情节分支来推动故事发展。

### 技术栈
- **前端**: React + TypeScript + Tailwind CSS + Framer Motion
- **后端**: Node.js + Express + TypeScript
- **数据库**: Supabase PostgreSQL
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

**后端 (.env)**
```bash
# DeepSeek API配置
DEEPSEEK_API_KEY=your_deepseek_api_key
DEEPSEEK_API_URL=https://api.deepseek.com

# Supabase配置
SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_KEY=your_supabase_service_role_key

# 服务器配置
PORT=5000
NODE_ENV=development
FRONTEND_URL=http://localhost:3000
```

**前端 (.env)**
```bash
REACT_APP_API_URL=http://localhost:5000/api
REACT_APP_VERSION=1.0.0
REACT_APP_DEBUG=true
```

## 数据库结构

### stories表
```sql
CREATE TABLE stories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,  -- JSON格式存储完整故事内容
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

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

#### 🚀 部署工作流程
```bash
# 1. 本地开发 → 提交到GitHub
# 2. 双推送到Gitee
./scripts/push-to-all.sh

# 3. 阿里云服务器拉取部署
./scripts/server-deploy.sh
```

#### 🔧 部署命令
```bash
# 一键双推送
git pa  # 或 ./scripts/push-to-all.sh

# 服务器部署
./scripts/server-deploy.sh

# Docker部署
./deploy.sh --rebuild production

# 健康检查
./deploy.sh --status
curl http://localhost:5001/api/health
```

### 详细部署文档
请参考 `docs/DEPLOYMENT_WORKFLOW.md` 和 `agents/deploy-agent.md`

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