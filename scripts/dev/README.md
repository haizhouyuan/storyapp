# 本地开发与部署脚本

本目录包含 NAS 本地部署和开发使用的脚本，采用**单栈稳定化方案**：

- **前端**：Nginx 容器（Docker）托管静态资源
- **后端**：PM2 管理 Node.js 进程
- **优势**：零交互、稳定可靠、避免 npx serve 的交互陷阱

---

## 快速开始

### 一键启动所有服务
```bash
npm run local:up
```

### 查看服务状态
```bash
npm run local:status
```

---

## 脚本说明

### 1. `up-backend.sh` - 后端启动
**功能**：
- 自动检查并构建后端代码（如需要）
- 使用 PM2 启动/重启 Node.js 进程
- 执行健康检查确保服务就绪
- 配置崩溃自启和内存限制（500MB）

**使用**：
```bash
npm run local:be
# 或
bash scripts/dev/up-backend.sh
```

**管理命令**：
```bash
npx pm2 status              # 查看进程状态
npx pm2 logs storyapp-backend  # 查看日志
npx pm2 restart storyapp-backend  # 重启
npx pm2 stop storyapp-backend    # 停止
```

---

### 2. `up-frontend.sh` - 前端启动
**功能**：
- 自动检查并构建前端代码（如需要）
- 启动 Nginx 容器托管静态资源
- 配置 API 反向代理到后端
- 使用 HTTP 探针进行就绪检测

**使用**：
```bash
npm run local:fe
# 或
bash scripts/dev/up-frontend.sh
```

**管理命令**：
```bash
docker logs -f storyapp-nginx  # 查看日志
docker restart storyapp-nginx  # 重启
docker rm -f storyapp-nginx    # 停止并删除
```

---

### 3. `local-up.sh` - 完整启动
**功能**：
- 依次启动后端和前端服务
- 输出访问地址和管理命令

**使用**：
```bash
npm run local:up
# 或
bash scripts/dev/local-up.sh
```

---

### 4. `status.sh` - 状态检查
**功能**：
- 检查后端 PM2 进程状态
- 检查前端 Nginx 容器状态
- 验证 HTTP 响应和 API 代理
- 输出访问地址

**使用**：
```bash
npm run local:status
# 或
bash scripts/dev/status.sh
```

**示例输出**：
```
==========================================
  StoryApp 服务状态检查
==========================================

【后端服务】PM2 进程
  ✅ http://localhost:5001/api/health - OK

【前端服务】Nginx 容器
  ✅ http://localhost:8081 - OK
  ✅ http://localhost:8081/api/health - OK

==========================================
  访问地址
==========================================
前端: http://localhost:8081 (局域网: http://192.168.1.7:8081)
后端: http://localhost:5001/api
```

---

## 访问地址

| 服务 | 本地地址 | 局域网地址 |
|------|----------|------------|
| 前端应用 | http://localhost:8081 | http://192.168.1.7:8081 |
| 后端 API | http://localhost:5001/api | http://192.168.1.7:5001/api |
| 健康检查 | http://localhost:5001/api/health | http://192.168.1.7:5001/api/health |

---

## 端口说明

| 端口 | 服务 | 备注 |
|------|------|------|
| 5001 | 后端 Node.js | PM2 管理 |
| 8081 | 前端 Nginx | Docker 容器 |
| 27017 | MongoDB | Docker Compose |

如端口冲突，可在脚本中修改端口映射。

---

## 故障排查

### 后端启动失败
```bash
# 查看详细日志
npx pm2 logs storyapp-backend --lines 200

# 检查环境变量
cat .env

# 检查 MongoDB
docker compose ps mongo-primary

# 手动测试
export PATH="/path/to/.node/node-v20.15.0-linux-x64/bin:$PATH"
node backend/dist/index.js
```

### 前端启动失败
```bash
# 查看容器日志
docker logs storyapp-nginx

# 检查构建产物
ls -lh frontend/build/

# 检查端口占用
ss -ltn | grep ':8081\b'
```

### API 代理不通
```bash
# 检查 Nginx 配置
cat nginx/conf/default.conf

# 检查 host.docker.internal
docker inspect storyapp-nginx | grep -A 5 ExtraHosts

# 重建容器（确保 --add-host 参数）
docker rm -f storyapp-nginx
bash scripts/dev/up-frontend.sh
```

---

## 代码更新流程

```bash
# 1. 拉取代码
git pull origin master

# 2. 安装依赖
npm install

# 3. 构建
npm run build

# 4. 重启服务
npx pm2 restart storyapp-backend
docker restart storyapp-nginx

# 5. 验证
npm run local:status
```

---

## 与传统方案对比

| 特性 | 传统方案 (npx serve) | 新方案 (Nginx + PM2) |
|------|---------------------|---------------------|
| 交互式提示 | ❌ 首次使用会卡住 | ✅ 零交互 |
| 就绪探测 | ❌ ss/grep 不可靠 | ✅ HTTP 探针 |
| 崩溃自启 | ❌ 需手动重启 | ✅ PM2 自动重启 |
| 日志管理 | ❌ 分散在文件 | ✅ PM2/Docker 集中 |
| API 代理 | ❌ CORS 跨域问题 | ✅ Nginx 原生支持 |
| 生产就绪 | ❌ 仅适合开发 | ✅ 接近生产环境 |

---

## 相关文档

- [NAS 本地部署完整指南](../../docs/DEPLOYMENT_LOCAL_NAS.md)
- [项目 README](../../README.md)
- [部署工作流](../../docs/DEPLOYMENT_WORKFLOW.md)

---

## 技术栈

- **前端托管**：Nginx Alpine (Docker)
- **后端进程管理**：PM2
- **数据库**：MongoDB (Docker Compose)
- **Node 版本**：v20.15.0（项目内置）
