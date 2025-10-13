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

# 4. 安装依赖（如果需要）
npm run install:all

# 5. 构建生产版本
npm run build

# 6. 使用Docker重新部署
./deploy.sh --rebuild production

# 7. 验证部署状态
./deploy.sh --status
```

## 🚀 自动化部署脚本

### 服务器部署脚本 (`scripts/server-deploy.sh`)
```bash
#!/bin/bash
# 阿里云服务器部署脚本

echo "🚀 开始服务器部署..."

# 检查当前目录
if [ ! -f "package.json" ]; then
    echo "❌ 请在项目根目录运行此脚本"
    exit 1
fi

# 从GitHub拉取最新代码
echo "📥 从GitHub拉取最新代码..."
git pull origin main

# 安装依赖
echo "📦 安装依赖..."
npm run install:all

# 构建生产版本
echo "🔨 构建生产版本..."
npm run build

# Docker部署
echo "🐳 使用Docker部署..."
./deploy.sh --rebuild production

# 健康检查
echo "🏥 进行健康检查..."
sleep 10
./deploy.sh --status

echo "🎉 部署完成！"
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
./deploy.sh --rebuild production
```

## 📞 联系方式

- **GitHub Issues**: 功能请求和bug报告
- **服务器SSH**: 直接登录服务器处理紧急问题

---

*最后更新: 2025-09-10*
