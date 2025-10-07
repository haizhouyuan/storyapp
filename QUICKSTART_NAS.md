# StoryApp NAS 快速启动指南

## 一键启动

```bash
cd /home/yuanhaizhou/projects/storyapp
npm run local:up
```

访问地址：
- **前端**：http://192.168.1.7:8081
- **后端 API**：http://192.168.1.7:5001/api

---

## 常用命令

```bash
# 启动服务
npm run local:up      # 启动全部（后端 + 前端）
npm run local:be      # 仅启动后端
npm run local:fe      # 仅启动前端

# 查看状态
npm run local:status  # 一键检查所有服务

# 后端管理（PM2）
npx pm2 status              # 进程状态
npx pm2 logs storyapp-backend  # 查看日志
npx pm2 restart storyapp-backend  # 重启
npx pm2 stop storyapp-backend    # 停止

# 前端管理（Docker）
docker logs -f storyapp-nginx  # 查看日志
docker restart storyapp-nginx  # 重启
docker rm -f storyapp-nginx    # 停止

# 代码更新
git pull origin master
npm install
npm run build
npx pm2 restart storyapp-backend
docker restart storyapp-nginx
```

---

## 服务架构

| 组件 | 技术 | 端口 | 管理方式 |
|------|------|------|---------|
| 前端 | React + Nginx (Docker) | 8081 | `docker` |
| 后端 | Node.js + PM2 | 5001 | `npx pm2` |
| 数据库 | MongoDB (Docker) | 27017 | `docker compose` |

---

## 快速故障排查

### 服务无法访问

```bash
# 1. 检查服务状态
npm run local:status

# 2. 查看后端日志
npx pm2 logs storyapp-backend --lines 50

# 3. 查看前端日志
docker logs --tail=50 storyapp-nginx

# 4. 检查端口占用
ss -ltn | grep -E ':(5001|8081)\b'
```

### 端口冲突

```bash
# 查找占用进程
sudo ss -ltnp | grep ':8081\b'

# 修改端口（编辑启动脚本）
vim scripts/dev/up-frontend.sh  # 改 -p 8082:80
vim scripts/dev/up-backend.sh   # 改 PORT=5002
```

### 数据库连接失败

```bash
# 启动 MongoDB
docker compose up -d mongo-primary mongo-secondary mongo-arbiter

# 检查状态
docker compose ps

# 查看日志
docker compose logs mongo-primary
```

---

## PWA 离线功能

- ✅ **本地访问**（localhost）：Service Worker 正常
- ❌ **局域网访问**（192.168.1.7）：需 HTTPS

**解决方案**：配置 mkcert 自签证书（详见完整文档）

---

## 详细文档

- [NAS 完整部署指南](docs/DEPLOYMENT_LOCAL_NAS.md)
- [开发脚本说明](scripts/dev/README.md)
- [单栈迁移指南](docs/SINGLE_STACK_MIGRATION.md)
- [项目主 README](README.md)

---

## 技术栈

```
前端：React + TypeScript + Tailwind CSS + Framer Motion
后端：Node.js + Express + TypeScript
数据库：MongoDB 副本集
AI：DeepSeek API
托管：Nginx (Docker) + PM2
```

---

**需要帮助？** 查看 [故障排查文档](docs/DEPLOYMENT_LOCAL_NAS.md#故障排查)
