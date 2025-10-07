# NAS 本地部署指南

本文档描述如何在 NAS（或任何 Linux 服务器）上部署 StoryApp，采用**稳定化单栈方案**：

- **前端**：Nginx 容器（Docker）托管静态资源
- **后端**：PM2 管理 Node.js 进程
- **数据库**：MongoDB（Docker 或本地安装）

这套方案彻底避免了 `npx serve` 的交互问题和端口探测误判，实现零交互、开箱即用的稳定部署。

---

## 前置要求

### 1. 系统环境
- Linux 系统（已在 NAS Linux 6.6.38 上测试）
- Docker 已安装并运行
- 至少 2GB 可用内存

### 2. 必需软件
```bash
# Node.js 20+ (项目内已包含 .node/node-v20.15.0-linux-x64)
export PATH="/home/yuanhaizhou/projects/storyapp/.node/node-v20.15.0-linux-x64/bin:$PATH"

# Docker（用于 Nginx 和 MongoDB）
docker --version  # 确保能正常运行

# 验证 Docker 权限
docker ps  # 如果失败，需要将用户加入 docker 组或使用 sudo
```

### 3. 端口占用检查
```bash
# 确保以下端口未被占用
ss -ltn | grep -E ':(5001|8081|27017)\b'

# 如果有冲突，可在启动脚本中修改端口映射
```

---

## 快速启动

### 一键启动全部服务
```bash
cd /home/yuanhaizhou/projects/storyapp
npm run local:up
```

这将自动：
1. 检查并构建前后端代码
2. 启动后端 Node 服务（PM2）
3. 启动前端 Nginx 容器
4. 执行健康检查
5. 输出访问地址和管理命令

---

## 分步启动（按需使用）

### 1. 仅启动后端
```bash
npm run local:be

# 或直接运行脚本
bash scripts/dev/up-backend.sh
```

**功能说明**：
- 自动检查 `backend/dist` 是否存在，不存在则构建
- 使用 PM2 启动/重启 Node 进程
- 健康检查 `http://localhost:5001/api/health`
- 支持崩溃自动重启、内存限制（500MB）

**管理命令**：
```bash
npx pm2 status              # 查看进程状态
npx pm2 logs storyapp-backend  # 查看日志
npx pm2 restart storyapp-backend  # 重启服务
npx pm2 stop storyapp-backend    # 停止服务
```

### 2. 仅启动前端
```bash
npm run local:fe

# 或直接运行脚本
bash scripts/dev/up-frontend.sh
```

**功能说明**：
- 自动检查 `frontend/build` 是否存在，不存在则构建
- 启动 Nginx 容器，映射端口 8081
- 使用 HTTP 探针进行就绪检测（避免 ss/grep 误判）
- 自动配置 API 反向代理到后端

**管理命令**：
```bash
docker logs -f storyapp-nginx  # 查看日志
docker restart storyapp-nginx  # 重启容器
docker rm -f storyapp-nginx    # 停止并删除容器
```

---

## 访问地址

### 前端访问
- **本地访问**：`http://localhost:8081`
- **局域网访问**：`http://192.168.1.7:8081`（替换为实际 NAS IP）

### 后端 API
- **健康检查**：`http://localhost:5001/api/health`
- **API 端点**：`http://localhost:5001/api`

---

## MongoDB 数据库配置

### 使用 Docker Compose 启动 MongoDB
```bash
cd /home/yuanhaizhou/projects/storyapp
docker compose up -d mongo-primary mongo-secondary mongo-arbiter
docker compose ps  # 确认服务状态
```

### 配置环境变量
确保根目录有 `.env` 文件（不要提交到仓库）：
```bash
cat > .env <<'EOF'
DEEPSEEK_API_KEY=your_deepseek_api_key_here
DEEPSEEK_API_URL=https://api.deepseek.com
MONGODB_URI=mongodb://localhost:27017
MONGODB_DB_NAME=storyapp
PORT=5001
NODE_ENV=production
EOF
```

---

## PWA 和 HTTPS 配置

### 本地 PWA 测试（仅 localhost）
```bash
# 在本机浏览器访问（Service Worker 会注册）
http://localhost:8081
```

### 局域网 HTTPS（手机访问需要）
Service Worker 要求 **HTTPS 或 localhost**。局域网 IP（如 `http://192.168.1.7:8081`）不会注册 SW。

**解决方案**：
1. **使用 mkcert 生成自签证书**（推荐）
   ```bash
   # 安装 mkcert
   # 生成本地 CA 证书
   # 为 NAS IP/域名签发证书
   # 配置 Nginx 使用 TLS
   ```

2. **使用 Caddy 自动 HTTPS**（适合有公网域名）
   ```bash
   # Caddy 可自动申请 Let's Encrypt 证书
   ```

详细配置步骤待补充（需要时可单独提供）。

---

## 故障排查

### 前端容器无法启动
```bash
# 检查端口占用
ss -ltn | grep ':8081\b'
sudo ss -ltnp | grep ':8081\b'  # 查看占用进程（root）

# 检查 Docker 日志
docker logs storyapp-nginx

# 检查构建产物
ls -lh frontend/build/
```

### 后端服务无法启动
```bash
# 检查 PM2 日志
npx pm2 logs storyapp-backend --lines 200

# 检查环境变量
cat .env

# 检查 MongoDB 连接
docker compose ps mongo-primary
curl http://localhost:5001/api/health
```

### 端口冲突
```bash
# 8081 被占用，改用 8082
# 编辑 scripts/dev/up-frontend.sh：
# 将 -p 8081:80 改为 -p 8082:80
# 同步修改健康检查 URL
```

### API 代理失败
```bash
# Nginx 容器内无法访问 host.docker.internal
# 检查 Docker 网络配置
docker inspect storyapp-nginx | grep -A 10 ExtraHosts

# 如果没有 host.docker.internal，手动添加：
docker rm -f storyapp-nginx
docker run -d --name storyapp-nginx \
  -p 8081:80 \
  --add-host=host.docker.internal:host-gateway \
  ...
```

---

## 生产环境优化建议

### 1. 使用 systemd 管理（替代 PM2）
适合长期稳定运行，系统级守护进程：
```bash
# 创建 systemd --user 服务
# 配置开机自启
# 统一日志管理
```

### 2. 配置域名和 SSL
```bash
# 使用 Nginx 作为主代理（非容器）
# 配置 Let's Encrypt 证书
# 启用 HTTP/2 和 HTTPS
```

### 3. 数据库备份
```bash
# 定时备份 MongoDB
docker compose up -d mongo-backup
# 配置 cron 定时任务
```

---

## 代码更新流程

```bash
# 1. 拉取最新代码
git pull origin master

# 2. 安装新依赖（如有）
npm install

# 3. 重新构建
PUBLIC_URL=/ npm run -w frontend build
npm run -w backend build

# 4. 重启服务
npx pm2 restart storyapp-backend
docker restart storyapp-nginx

# 5. 验证
curl -fsS http://localhost:5001/api/health
curl -fsS http://localhost:8081
```

---

## 常见问题（FAQ）

**Q: 为什么不用 npx serve？**
A: `npx serve` 在后台运行时会有交互式提示（首次下载），且就绪探测不可靠。Nginx 容器零交互、更稳定。

**Q: 为什么选择 PM2？**
A: PM2 提供崩溃自启、日志集中、零停机重启等特性，适合开发和小规模生产环境。

**Q: 能否在 macOS/Windows 上使用？**
A: 可以，但需调整脚本中的路径和 Docker 配置。主要测试环境为 Linux。

**Q: 如何启用 PWA 离线功能？**
A: 必须使用 HTTPS 或 localhost。局域网访问需配置自签证书（mkcert）或使用 Caddy。

---

## 附录：完整技术栈

| 组件 | 技术 | 端口 | 管理方式 |
|------|------|------|---------|
| 前端 | React + Nginx (Docker) | 8081 | docker commands |
| 后端 | Node.js + Express | 5001 | PM2 |
| 数据库 | MongoDB (Docker) | 27017 | docker compose |
| AI API | DeepSeek | - | .env 配置 |

---

## 相关文档

- [项目 README](../README.md)
- [部署工作流](./DEPLOYMENT_WORKFLOW.md)
- [Appsmith 配置](./APPSMITH_SETUP.md)
- [日志系统说明](../README_LOGGING_SYSTEM.md)
