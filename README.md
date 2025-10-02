# 儿童睡前互动故事App

一个专为儿童设计的睡前互动故事应用，使用AI生成个性化故事内容，让孩子通过选择不同的情节分支来推动故事发展。

## 功能特色

- 🌟 **AI故事生成**: 使用DeepSeek API根据主题生成适合儿童的睡前故事
- 🎨 **儿童友好界面**: 柔和色彩、大按钮、可爱插画的童趣设计
- 🔄 **互动分支选择**: 每个故事节点提供3个选择，让孩子参与故事创作
- 💾 **故事收藏**: 保存喜欢的故事到"我的故事"，随时重温
- 🔊 **语音朗读链路**: 内置 Mock TTS Provider，支持语音设置、缓存与后续供应商接入
- 📱 **响应式设计**: 适配各种设备屏幕
- 🔐 **安全可靠**: 使用 GitHub Secrets 安全管理 API 密钥，完整的 CI/CD 流程

## 技术栈

- **前端**: React + TypeScript + Tailwind CSS + Framer Motion
- **后端**: Node.js + Express + TypeScript
- **数据库**: MongoDB (Docker Compose 内置)
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
cp .env.example .env

# 编辑根目录 .env 填入实际配置值
# - DEEPSEEK_API_KEY=your_deepseek_api_key_here
# - DEEPSEEK_API_URL=https://api.deepseek.com
```

### 3. 数据库与安全资产准备

```bash
# 首次运行：生成 TLS 证书与副本集 keyFile（输出至 config/mongo/*）
./scripts/mongo/setup-local-secrets.sh

# 启动 MongoDB 副本集及备份服务
docker compose up -d mongo-primary mongo-secondary mongo-arbiter mongo-backup

# 验证副本集角色（PRIMARY / SECONDARY / ARBITER）
docker compose exec mongo-primary \
  mongosh --tls --tlsCAFile /etc/mongo-tls/ca.pem \
  -u "$MONGO_ROOT_USER" -p "$MONGO_ROOT_PASS" \
  --authenticationDatabase admin \
  --eval "rs.status().members.map(m => m.stateStr + ' - ' + m.name)"

# 查看最新一次备份（可选）
docker compose exec mongo-backup ls -lt /backups | head
```

MongoDB 会在启动时自动创建集合与索引：
- 集合：`stories`、`story_logs`
- 索引：故事集合的创建时间、标题全文索引；日志集合的复合索引与 30 天 TTL

### 4. 启动开发服务器

```bash
# 同时启动前后端开发服务器
npm run dev

# 或分别启动
npm run dev:backend  # 后端: http://localhost:5001
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
- `DELETE /api/delete-story/:id` - 删除指定故事

### 语音服务
- `POST /api/tts` - 文本转语音（Mock Provider，返回音频 Data URL）
- `GET /api/tts/voices` - 查询可用音色及支持的语速/音调范围

> 详细配置及接入说明请见 `docs/tts/README.md`。

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

项目使用Docker Compose进行容器化部署，支持：
- 本地开发环境
- 云服务器部署（阿里云、腾讯云等）
- Docker容器编排

### 生产部署
```bash
# 构建并启动生产环境
docker compose -f docker-compose.yml build --no-cache app
docker compose -f docker-compose.yml up -d mongo-primary mongo-secondary mongo-arbiter mongo-backup
docker compose -f docker-compose.yml up -d app

# 健康检查
curl -fsS http://localhost:5001/api/health

# 副本集状态（建议使用独立运维账号）
docker compose exec mongo-primary mongosh --tls --tlsCAFile /etc/mongo-tls/ca.pem \
  -u "$MONGO_ROOT_USER" -p "$MONGO_ROOT_PASS" --authenticationDatabase admin \
  --eval "rs.status().members.map(m => ({ name: m.name, state: m.stateStr, health: m.health }))"

# 备份文件预览
docker compose exec mongo-backup ls -lt /backups | head
```

详细部署步骤请参考 `CLAUDE.md`，运维与备份手册见 `docs/MONGO_OPERATIONS.md`

## 贡献指南

欢迎提交Issue和Pull Request来改善这个项目！

## 许可证

MIT License
