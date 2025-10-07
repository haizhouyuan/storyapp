# 单栈方案迁移指南

## 背景

之前的部署方案存在以下问题：

1. **npx serve 交互问题**：首次运行会提示安装，在后台运行时卡住
2. **就绪探测不可靠**：使用 `ss | grep ":8081 "` 匹配 IPv4/IPv6 格式不统一
3. **双 Codex 复杂性**：官方 Codex CLI + Claude Code 双栈，MCP 客户端依赖错误频发
4. **端口占用误判**：Docker 代理占用端口，`ss` 能看到但 `lsof` 查不到 PID

## 新方案：单栈稳定化

### 核心理念

> **Node 只负责构建，不负责对外服务**

- **前端**：Nginx 容器（Docker）托管静态资源，零交互
- **后端**：PM2 管理 Node.js 进程，崩溃自启
- **就绪探测**：统一使用 HTTP 探针（curl），不再依赖 `ss/grep`

### 技术栈

| 组件 | 技术方案 | 端口 | 管理方式 |
|------|----------|------|---------|
| 前端 | React + Nginx (Docker) | 8081 | `docker` 命令 |
| 后端 | Node.js + Express | 5001 | PM2 |
| 数据库 | MongoDB (Docker) | 27017 | docker compose |

---

## 迁移步骤

### 1. 停止旧服务（如有）

```bash
# 停止旧的 npx serve 进程
pkill -f "serve.*frontend/build" || true

# 停止 PM2 旧进程（如有）
npx pm2 delete all || true

# 停止旧的前端容器（如有）
docker rm -f storyapp-nginx 2>/dev/null || true
```

### 2. 清理双 Codex 配置（可选）

```bash
# 终止相关 tmux sessions
tmux ls 2>/dev/null | awk '/orchestrator|agent|codex|claude/i {print $1}' | sed 's/:$//' | xargs -r -n1 tmux kill-session -t

# 注释掉 AGENTS.md / MCP 配置中的无效客户端
# 或重新运行 `codex /init` 生成简化配置
```

### 3. 构建前后端代码

```bash
export PATH="/home/yuanhaizhou/projects/storyapp/.node/node-v20.15.0-linux-x64/bin:$PATH"

# 安装依赖
npm install

# 构建
PUBLIC_URL=/ npm run -w frontend build
npm run -w backend build
```

### 4. 启动新服务

```bash
# 一键启动（推荐）
npm run local:up

# 或分步启动
npm run local:be  # 后端 PM2
npm run local:fe  # 前端 Nginx
```

### 5. 验证服务

```bash
# 检查状态
npm run local:status

# 手动验证
curl http://localhost:5001/api/health  # 后端
curl http://localhost:8081              # 前端
curl http://localhost:8081/api/health   # API 代理
```

---

## 新增脚本说明

### 启动脚本

| 脚本 | npm 命令 | 功能 |
|------|----------|------|
| `scripts/dev/up-backend.sh` | `npm run local:be` | 启动后端（PM2） |
| `scripts/dev/up-frontend.sh` | `npm run local:fe` | 启动前端（Nginx） |
| `scripts/dev/local-up.sh` | `npm run local:up` | 一键启动全部 |
| `scripts/dev/status.sh` | `npm run local:status` | 状态检查 |

### 配置文件

| 文件 | 用途 |
|------|------|
| `nginx/conf/default.conf` | Nginx 配置（静态资源 + API 代理） |
| `scripts/dev/README.md` | 开发脚本详细说明 |
| `docs/DEPLOYMENT_LOCAL_NAS.md` | NAS 部署完整指南 |

---

## 关键改进点

### 1. 前端托管：npx serve → Nginx 容器

**问题**：
```bash
# 旧方案：npx serve 后台运行会卡住
nohup npx --no-install serve -s frontend/build -l 0.0.0.0:8081 &
# ❌ 首次运行会交互式提示安装，卡住整个流程
```

**解决**：
```bash
# 新方案：Nginx 容器，零交互
docker run -d --name storyapp-nginx \
  -p 8081:80 \
  -v "$PWD/frontend/build:/usr/share/nginx/html:ro" \
  -v "$PWD/nginx/conf:/etc/nginx/conf.d:ro" \
  --add-host=host.docker.internal:host-gateway \
  nginx:alpine
# ✅ 开箱即用，无交互提示
```

### 2. 就绪探测：ss/grep → HTTP 探针

**问题**：
```bash
# 旧方案：ss 输出格式不统一
timeout 30s bash -lc 'until ss -ltnp | grep -q ":8081 "; do sleep 0.5; done'
# ❌ IPv6 显示 :::8081，匹配不到 ":8081 "（带空格）
```

**解决**：
```bash
# 新方案：HTTP 探针
for i in {1..60}; do
  curl -fsS --max-time 1 http://127.0.0.1:8081 >/dev/null && { echo "✅ 就绪"; break; }
  sleep 0.5
done
# ✅ 明确验证 HTTP 服务可用，不依赖端口监听
```

### 3. 后端管理：手动 nohup → PM2

**问题**：
```bash
# 旧方案：手动后台运行
nohup node backend/dist/index.js > logs/backend.log 2>&1 &
# ❌ 崩溃后无自启，日志分散，难以管理
```

**解决**：
```bash
# 新方案：PM2 托管
npx pm2 start "node backend/dist/index.js" \
  --name storyapp-backend \
  --time \
  --max-memory-restart 500M
# ✅ 崩溃自启、日志集中、状态可视化
```

### 4. API 代理：前端直连 → Nginx 反向代理

**旧方案**：前端直接访问 `http://192.168.1.7:5001/api`，存在 CORS 问题

**新方案**：Nginx 配置反向代理
```nginx
location /api/ {
  proxy_pass http://host.docker.internal:5001/api/;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
}
```
✅ 前后端同域，无 CORS 问题

---

## 日常操作

### 启动服务
```bash
npm run local:up
```

### 查看状态
```bash
npm run local:status
```

### 查看日志
```bash
# 后端日志
npx pm2 logs storyapp-backend

# 前端日志
docker logs -f storyapp-nginx
```

### 重启服务
```bash
# 后端
npx pm2 restart storyapp-backend

# 前端
docker restart storyapp-nginx
```

### 停止服务
```bash
# 后端
npx pm2 stop storyapp-backend

# 前端
docker rm -f storyapp-nginx
```

### 代码更新
```bash
git pull origin master
npm install
npm run build
npx pm2 restart storyapp-backend
docker restart storyapp-nginx
npm run local:status
```

---

## 故障排查

### 端口冲突
```bash
# 检查端口占用
ss -ltn | grep -E ':(5001|8081|27017)\b'

# 修改端口（在启动脚本中调整）
# up-frontend.sh: -p 8082:80
# up-backend.sh: PORT=5002（需同步修改 .env）
```

### 后端无法启动
```bash
# 查看 PM2 日志
npx pm2 logs storyapp-backend --lines 200

# 检查环境变量
cat .env | grep -E 'DEEPSEEK|MONGODB'

# 检查 MongoDB
docker compose ps mongo-primary
```

### 前端 API 代理失败
```bash
# 检查 host.docker.internal
docker inspect storyapp-nginx | grep -A 5 ExtraHosts

# 如果没有，重建容器（确保 --add-host 参数）
docker rm -f storyapp-nginx
bash scripts/dev/up-frontend.sh
```

---

## PWA / HTTPS 注意事项

### 本地测试（localhost）
- ✅ `http://localhost:8081` 可以注册 Service Worker
- ✅ PWA 离线功能正常

### 局域网访问（非安全上下文）
- ❌ `http://192.168.1.7:8081` **不会**注册 Service Worker
- ❌ PWA 离线功能不可用

### 解决方案（手机端访问需要）
1. **使用 mkcert 生成自签证书**（推荐）
   - 生成本地 CA 和域名证书
   - 配置 Nginx TLS
   - 手机导入根证书

2. **使用 Caddy 自动 HTTPS**
   - 需要公网域名
   - 自动申请 Let's Encrypt 证书

详细配置步骤见 `docs/DEPLOYMENT_LOCAL_NAS.md`。

---

## 对比总结

| 特性 | 旧方案 | 新方案 |
|------|--------|--------|
| 前端托管 | npx serve | Nginx 容器 |
| 后端管理 | nohup | PM2 |
| 就绪探测 | ss/grep | HTTP 探针 |
| API 访问 | 跨域直连 | Nginx 代理 |
| 交互式提示 | ❌ 会卡住 | ✅ 零交互 |
| 崩溃自启 | ❌ 无 | ✅ PM2 自动 |
| 日志管理 | ❌ 分散 | ✅ 集中 |
| 生产就绪 | ❌ 仅开发 | ✅ 接近生产 |

---

## 相关文档

- [开发脚本 README](../scripts/dev/README.md)
- [NAS 本地部署指南](./DEPLOYMENT_LOCAL_NAS.md)
- [项目主 README](../README.md)
- [部署工作流](./DEPLOYMENT_WORKFLOW.md)

---

## 技术支持

如遇问题，请检查：
1. Node 路径是否正确（`export PATH=...`）
2. Docker 是否运行（`docker ps`）
3. 端口是否冲突（`ss -ltn`）
4. 环境变量是否完整（`.env` 文件）

详细故障排查见 [NAS 部署指南](./DEPLOYMENT_LOCAL_NAS.md#故障排查)。
