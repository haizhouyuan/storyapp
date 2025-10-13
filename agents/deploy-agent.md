# Deploy Agent - 部署子代理配置

## 🎯 代理职责
负责儿童故事应用的代码管理和生产环境部署工作流程

## 📋 工作流程

### 1. 代码管理流程
```
本地开发 → 提交到GitHub → 阿里云服务器拉取部署
```

### 2. 远程仓库配置
- **GitHub (origin)**: `https://github.com/haizhouyuan/storyapp.git`
- **服务器使用**: GitHub 仓库

## 🚀 部署命令

### 本地开发命令
```bash
# 推送代码（GitHub 单远程）
git push origin main
```

### 服务器部署命令
```bash
# 完整部署流程
./scripts/server-deploy.sh

# 或分步执行
git pull origin main
GHCR_TOKEN=xxxx ./scripts/server-deploy.sh   # 使用 GHCR 镜像（需要提前登录权限）
# 如需本地构建镜像，可执行
USE_GHCR=false ./scripts/server-deploy.sh
```

### 健康检查
```bash
# 检查服务状态
docker compose -f docker-compose.yml ps

# API健康检查
curl http://localhost:5001/api/health
```

## 🔧 工具脚本

### server-deploy.sh  
- 功能: 服务器端完整部署流程（支持 GHCR 或本地构建）
- 使用: `./scripts/server-deploy.sh`

## 📊 环境配置

### 本地开发环境 (.env)
```bash
DEEPSEEK_API_KEY=sk-e1e17a8f005340b39240591f709d71d4
MONGODB_URI=mongodb://localhost:27017
PORT=5000
NODE_ENV=development
```

### 生产环境 (服务器 .env)
```bash
DEEPSEEK_API_KEY=生产环境API密钥
MONGODB_URI=mongodb://mongo:27017/storyapp
PORT=5000
NODE_ENV=production
```

## 🚨 故障处理

### 常见问题
1. **推送权限错误**: 检查SSH密钥配置
2. **构建失败**: 检查node版本和依赖
3. **Docker启动失败**: 检查端口冲突和资源限制

### 紧急回滚
```bash
git reset --hard HEAD^  # 回退到上一个版本
USE_GHCR=${USE_GHCR:-true} ./scripts/server-deploy.sh
```

## 📞 监控和日志

```bash
# 查看应用日志
docker compose -f docker-compose.yml logs -f app

# 查看数据库日志  
docker compose -f docker-compose.yml logs -f mongo

# 监控资源使用
docker stats
```

## 🔄 自动化流程

### GitHub Actions (可选)
```yaml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
    - name: Deploy to Aliyun
      uses: appleboy/ssh-action@master
      with:
        host: ${{ secrets.ALIYUN_HOST }}
        username: ${{ secrets.ALIYUN_USER }}
        key: ${{ secrets.ALIYUN_SSH_KEY }}
        script: |
          cd /opt/storyapp
          ./scripts/server-deploy.sh
```

---

*最后更新: 2025-09-10*
*代理版本: 1.0.0*
