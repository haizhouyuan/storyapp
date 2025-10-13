# 代码管理和部署工作流程

## 📋 代码管理流程

### 1. 远程仓库配置
- **GitHub (唯一远程仓库)**: `https://github.com/haizhouyuan/storyapp.git`

### 2. 本地开发流程
```bash
# 1. 从GitHub拉取最新代码
git pull origin main

# 2. 创建新功能分支
git checkout -b feature/your-feature-name

# 3. 开发完成后提交到本地
git add .
git commit -m "feat: 描述你的功能"

# 4. 推送到GitHub
git push origin feature/your-feature-name

# 5. 创建Pull Request到GitHub main分支
# (在GitHub界面上操作)
```

### 3. 推送流程（本地 → GitHub）
```bash
# 推送到 GitHub（单远程）
git push origin main
```

### 4. 阿里云服务器部署流程
```bash
# 1. SSH登录到阿里云服务器
ssh root@your-server-ip

# 2. 进入项目目录
cd /opt/storyapp

# 3. 从GitHub拉取最新代码
git pull origin main

# 4. 部署（推荐脚本方式，默认使用 GHCR 镜像）
GHCR_TOKEN=xxxx ./scripts/server-deploy.sh

# 5. 如需本地构建镜像，可执行
USE_GHCR=false ./scripts/server-deploy.sh

# 6. 验证部署状态
docker compose -f docker-compose.yml ps
```

## 🚀 自动化部署脚本

### 服务器部署脚本 (`scripts/server-deploy.sh`)
- 自动执行 `git fetch` / `git pull`（当前分支）
- 支持两种模式：
  - `USE_GHCR=true`（默认）：拉取 GHCR 镜像并根据 `APP_TAG` 启动
  - `USE_GHCR=false`：本地构建镜像后再启动
- 使用 `docker compose` 启停服务并等待健康检查

```bash
# 默认使用 GHCR 镜像（需要先导出 GHCR_TOKEN / GHCR_USERNAME）
GHCR_TOKEN=xxxx ./scripts/server-deploy.sh

# 如需本地构建镜像
USE_GHCR=false ./scripts/server-deploy.sh
```

## 🔧 Git配置优化

### 添加git别名
```bash
# 添加到 ~/.gitconfig 或项目 .git/config
git config alias.po 'push origin main'
git config alias.plo 'pull origin main'
```

### 常用命令
```bash
# 推送到远程主分支
git po

# 从远程主分支拉取
git plo

# 查看远程仓库状态
git remote -v

# 查看分支跟踪关系
git branch -vv
```

## 📊 分支策略

- **main**: 主分支，保持稳定，用于生产部署
- **develop**: 开发分支，集成功能
- **feature/***: 功能开发分支
- **hotfix/***: 紧急修复分支

## 🔐 环境变量管理

### 本地开发环境 (.env)
```bash
# 后端配置
DEEPSEEK_API_KEY=your_local_api_key
MONGODB_URI=mongodb://localhost:27017
PORT=5000

# 前端配置  
REACT_APP_API_URL=http://localhost:5000/api
```

### 生产环境 (服务器上的 .env)
```bash
# 后端配置
DEEPSEEK_API_KEY=your_production_api_key
MONGODB_URI=mongodb://mongo:27017/storyapp
PORT=5000
NODE_ENV=production

# Docker相关
DOCKER_REGISTRY=your-registry
```

## 🚨 故障排除

### 常见问题
1. **推送权限问题**: 检查SSH密钥配置
2. **代码冲突**: 先拉取再推送
3. **Docker构建失败**: 检查网络和依赖

### 紧急回滚
```bash
# 回滚到上一个版本
git reset --hard HEAD^
USE_GHCR=${USE_GHCR:-true} ./scripts/server-deploy.sh
```

## 📞 联系方式

- **GitHub Issues**: 功能请求和bug报告
- **服务器SSH**: 直接登录服务器处理紧急问题

---

*最后更新: 2025-09-10*
