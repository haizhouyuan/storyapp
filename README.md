# 儿童睡前互动故事App

一个专为儿童设计的睡前互动故事应用，使用AI生成个性化故事内容，让孩子通过选择不同的情节分支来推动故事发展。

## 功能特色

- 🌟 **AI故事生成**: 使用DeepSeek API根据主题生成适合儿童的睡前故事
- 🎨 **儿童友好界面**: 柔和色彩、大按钮、可爱插画的童趣设计
- 🔄 **互动分支选择**: 每个故事节点提供3个选择，让孩子参与故事创作
- 💾 **故事收藏**: 保存喜欢的故事到"我的故事"，随时重温
- 🔊 **语音播放**: 预留语音朗读功能接口
- 📱 **响应式设计**: 适配各种设备屏幕

## 技术栈

- **前端**: React + TypeScript + Tailwind CSS + Framer Motion
- **后端**: Node.js + Express + TypeScript
- **数据库**: Supabase PostgreSQL
- **AI服务**: DeepSeek API
- **测试**: Playwright MCP

## 快速开始

### 1. 环境准备

```bash
# 克隆项目
git clone <your-repo-url>
cd storyapp

# 安装所有依赖
npm run install:all
```

### 2. 环境配置

```bash
# 复制环境变量文件
cp .env.example backend/.env

# 编辑 backend/.env 填入实际配置值
# - DeepSeek API Key: sk-e1e17a8f005340b39240591f709d71d4
# - Supabase 项目配置
```

### 3. 数据库设置

在Supabase控制台执行以下SQL创建stories表：

```sql
CREATE TABLE stories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_stories_created_at ON stories(created_at DESC);
```

### 4. 启动开发服务器

```bash
# 同时启动前后端开发服务器
npm run dev

# 或分别启动
npm run dev:backend  # 后端: http://localhost:5000
npm run dev:frontend # 前端: http://localhost:3000
```

### 5. 运行测试

```bash
# 运行Playwright端到端测试
npm test
```

## 项目结构

```
storyapp/
├── frontend/           # React前端应用
│   ├── src/
│   │   ├── components/ # 可复用组件
│   │   ├── pages/      # 页面组件
│   │   ├── types/      # 类型定义
│   │   └── utils/      # 工具函数
├── backend/            # Express后端API
│   ├── src/
│   │   ├── routes/     # API路由
│   │   ├── services/   # 业务逻辑
│   │   └── config/     # 配置文件
├── shared/            # 共享类型定义
├── playwright-mcp/    # 测试框架
└── docs/             # 项目文档
```

## API接口

### 故事生成
- `POST /api/generate-story` - 根据主题生成故事片段和分支选择

### 故事管理  
- `POST /api/save-story` - 保存完整故事
- `GET /api/get-stories` - 获取已保存故事列表
- `GET /api/get-story/:id` - 获取单个故事详情

### 语音服务（占位）
- `GET /api/tts` - 文本转语音（待实现）

## 设计原则

### 儿童友好性
- 大按钮设计，防止误触
- 柔和配色，保护视力
- 简洁界面，避免干扰
- 无登录设计，降低使用门槛

### 安全考虑
- 开放访问，无需用户认证
- API密钥安全存储
- 速率限制防止滥用
- 内容过滤确保适合儿童

## 部署说明

项目设计适配Figma Make/Supabase无服务器环境，支持一键部署到：
- Vercel
- Netlify  
- Supabase Functions

详细部署步骤请参考 `docs/deployment.md`

## 贡献指南

欢迎提交Issue和Pull Request来改善这个项目！

## 许可证

MIT License