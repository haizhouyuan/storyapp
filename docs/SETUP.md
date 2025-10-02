# 儿童睡前故事App 安装和配置指南

## 快速开始

### 1. 环境要求

- **Node.js**: >= 16.0.0
- **npm**: >= 8.0.0
- **Git**: 最新版本
- **Docker**: 用于容器化部署
- **Docker Compose**: 用于MongoDB数据库

### 2. 项目安装

```bash
# 1. 克隆项目
git clone <your-repository-url>
cd storyapp

# 2. 安装所有依赖
npm run install:all

# 3. 配置环境变量
cp .env.example .env
# 前端环境变量是可选的
```

### 3. MongoDB 数据库配置

#### 3.1 生成 TLS 证书与 keyFile
```bash
./scripts/mongo/setup-local-secrets.sh
```
- 默认输出到 `config/mongo/tls` 与 `config/mongo/keyfile`，首次执行或证书轮换时运行。
- 证书及 keyFile 已加入 `.gitignore`，请妥善管理权限（推荐 400/600）。

#### 3.2 启动副本集容器
```bash
docker compose up -d mongo-primary mongo-secondary mongo-arbiter mongo-backup
```
- `mongo-primary`：主节点，负责写入。
- `mongo-secondary`：从节点，可用于读兼容与故障切换。
- `mongo-arbiter`：仲裁节点维持选举。
- `mongo-backup`：定时执行 `mongodump`，输出至 `config/mongo/backups`。

#### 3.3 验证服务状态
```bash
docker compose exec mongo-primary \
  mongosh --tls --tlsCAFile /etc/mongo-tls/ca.pem \
  -u "$MONGO_ROOT_USER" -p "$MONGO_ROOT_PASS" --authenticationDatabase admin \
  --eval "rs.status().members.map(m => ({ name: m.name, state: m.stateStr, health: m.health }))"

docker compose exec mongo-backup ls -lt /backups | head  # 备份列表
```
出现 `PRIMARY` / `SECONDARY` / `ARBITER` 即表示副本集就绪。

#### 3.4 客户端连接
- 副本集连接串示例：`mongodb://storyapp_app:StoryAppApp!234@storyapp-mongo-primary:27017,storyapp-mongo-secondary:27017/storyapp?replicaSet=storyapp-rs&authSource=admin&tls=true`
- TLS CA 路径：`./config/mongo/tls/ca.pem`
- 可选客户端证书：`./config/mongo/tls/client.pem`

#### 3.5 环境变量模板
```bash
MONGODB_URI=mongodb://storyapp_app:StoryAppApp!234@storyapp-mongo-primary:27017,storyapp-mongo-secondary:27017/storyapp?replicaSet=storyapp-rs&authSource=admin&retryWrites=true&w=majority&tls=true
MONGODB_DB_NAME=storyapp
MONGODB_TLS_CA_FILE=./config/mongo/tls/ca.pem
MONGODB_MAX_POOL_SIZE=50
MONGODB_MIN_POOL_SIZE=5
MONGODB_MAX_IDLE_TIME_MS=30000
MONGODB_CONNECT_TIMEOUT_MS=20000
MONGODB_SOCKET_TIMEOUT_MS=60000
MONGODB_SERVER_SELECTION_TIMEOUT_MS=30000
MONGODB_RETRY_WRITES=true
MONGODB_READ_PREFERENCE=primaryPreferred
```

### 4. 启动应用

#### 4.1 开发模式（推荐）
```bash
# 同时启动前后端开发服务器
npm run dev
```

这将启动：
- 后端服务器: http://localhost:5001
- 前端开发服务器: http://localhost:3000

#### 4.2 分别启动
```bash
# 启动后端
npm run dev:backend

# 启动前端（新终端）
npm run dev:frontend
```

### 5. 验证安装

1. **后端健康检查**
   ```bash
   curl http://localhost:5001/api/health
   ```
   
   应该返回：
   ```json
   {
     "status": "healthy",
     "checks": {
       "server": true,
       "database": true,
       "deepseek": true
     }
   }
   ```

2. **前端访问**
   - 打开浏览器访问 http://localhost:3000
   - 应该看到"睡前故事时间"欢迎界面

3. **功能测试**
   - 输入故事主题（如"小兔子的冒险"）
   - 点击"开始讲故事"
   - 验证能够生成故事内容

### 6. 运行测试

```bash
# 安装Playwright
npx playwright install

# 运行E2E测试（需要应用正在运行）
npm test
```

## 故障排除

### 常见问题

#### 1. 后端启动失败
**错误**: `MongoDB连接失败`
**解决**: 确保 MongoDB 副本集正在运行：`docker compose up -d mongo-primary mongo-secondary mongo-arbiter`

#### 2. DeepSeek API 调用失败
**错误**: `DeepSeek API调用失败`
**解决**: 
- 检查网络连接
- 确认 API Key 是否有效
- 查看 DeepSeek 服务状态

#### 3. 数据库连接失败
**错误**: `数据库服务暂时不可用`
**解决**:
- 检查 MongoDB 容器是否运行：`docker compose ps`
- 重新启动数据库：`docker compose restart mongo-primary` (必要时对 secondary/arbiter 同步执行)
- 检查端口是否被占用

#### 4. 前端白屏
**解决**:
- 检查浏览器控制台错误
- 确认后端服务是否运行
- 检查 CORS 配置

#### 5. 故事生成超时
**解决**:
- 检查网络连接
- DeepSeek API 可能响应较慢，可以等待更长时间
- 查看后端日志获取详细错误信息

### 开发者工具

#### 查看后端日志
```bash
cd backend
npm run dev
# 查看控制台输出
```

#### 数据库管理
```bash
# 进入MongoDB容器
docker compose exec mongo mongosh storyapp

# 查看所有故事
db.stories.find().pretty()

# 清空所有数据
db.stories.deleteMany({})
```

#### API 测试
```bash
# 测试故事生成
curl -X POST http://localhost:5001/api/generate-story \
  -H "Content-Type: application/json" \
  -d '{"topic": "测试故事"}'

# 测试故事列表
curl http://localhost:5001/api/get-stories
```

## 生产部署

### 环境变量配置
```bash
# 后端生产环境变量
NODE_ENV=production
PORT=5001
FRONTEND_URL=https://your-frontend-domain.com

# 生产环境MongoDB配置
MONGODB_URI=mongodb://your-production-mongo-host:27017/storyapp
```

### 构建和部署
```bash
# 构建前后端
npm run build

# 启动生产服务器
npm run start
```

### 推荐部署平台
- **全栈部署**: 阿里云、腾讯云ECS (Docker Compose)
- **前端**: Vercel, Netlify  
- **后端**: Railway, Render
- **数据库**: MongoDB Atlas 或自建 MongoDB

## 更多资源

- [React 文档](https://reactjs.org/docs/)
- [Express.js 文档](https://expressjs.com/)
- [MongoDB 文档](https://docs.mongodb.com/)
- [DeepSeek API 文档](https://platform.deepseek.com/api-docs/)
- [Playwright 测试指南](https://playwright.dev/docs/intro)

## 获取帮助

如果遇到问题：
1. 查看本文档的故障排除部分
2. 检查项目的 Issues 页面
3. 查看应用日志获取详细错误信息
4. 确认所有环境变量和依赖都正确配置