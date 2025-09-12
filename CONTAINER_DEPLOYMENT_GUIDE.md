# StoryApp 容器化部署完整指南

## 🎯 概述

本项目实现了完整的容器化部署方案，支持从本地开发到生产环境的无缝迁移，以及全自动化的CI/CD流程。

### 特性
- ✅ 多环境支持（开发/测试/预发布/生产）
- ✅ 统一的部署接口
- ✅ Docker多阶段构建优化
- ✅ Nginx反向代理和SSL支持
- ✅ 健康检查和监控
- ✅ GitHub Actions CI/CD集成
- ✅ 蓝绿部署支持

## 🏗️ 架构设计

### 部署架构矩阵

| 环境 | 端口 | 配置文件 | 数据库 | 域名/访问地址 |
|------|------|----------|--------|---------------|
| 开发(dev) | 5000 | .env.dev | dev_user/dev_pass123 | http://localhost:5000 |
| 测试(test) | 5001 | .env.test | 内存数据库 | http://localhost:5001 |
| 预发布(staging) | 5002 | .env.staging | staging_user/staging_pass123 | http://localhost:5002 |
| 生产(production) | 80/443 | .env.production | 生产数据库 | https://storyapp.dandanbaba.xyz |

### 文件结构

```
storyapp/
├── ops/                          # 容器化运维配置
│   ├── compose/                  # Docker Compose配置
│   │   ├── docker-compose.base.yml      # 基础配置
│   │   ├── docker-compose.dev.yml       # 开发环境覆盖
│   │   ├── docker-compose.test.yml      # 测试环境覆盖
│   │   ├── docker-compose.staging.yml   # 预发布环境覆盖
│   │   └── docker-compose.prod.yml      # 生产环境覆盖
│   ├── nginx/                    # Nginx配置
│   │   ├── nginx.conf           # 主配置文件
│   │   └── conf.d/              # 环境特定配置
│   │       ├── development.conf
│   │       ├── staging.conf
│   │       └── production.conf
│   └── docker/                   # Docker相关文件
│       └── Dockerfile.e2e       # E2E测试容器
├── scripts/                      # 部署脚本
│   ├── deploy.sh               # 统一部署脚本
│   └── production-deploy.sh    # 生产服务器部署脚本
├── .env.dev                     # 开发环境变量
├── .env.test                    # 测试环境变量
├── .env.staging                 # 预发布环境变量
├── .env.production              # 生产环境变量
└── .github/workflows/           # GitHub Actions工作流
    └── docker-ci-cd.yml        # CI/CD流水线
```

## 🚀 快速开始

### 1. 本地开发环境

```bash
# 启动开发环境
npm run docker:dev

# 或者使用脚本
bash scripts/deploy.sh dev up

# 查看服务状态
npm run docker:dev:logs

# 停止服务
npm run docker:dev:down
```

### 2. 测试环境

```bash
# 启动测试环境
npm run docker:test

# 运行E2E测试
npm run docker:test:e2e

# 使用脚本完整部署
bash scripts/deploy.sh test deploy
```

### 3. 预发布环境

```bash
# 启动预发布环境
npm run docker:staging

# 启用Nginx代理
npm run docker:staging:nginx

# 完整部署流程
bash scripts/deploy.sh staging deploy
```

### 4. 生产环境

```bash
# 本地到生产服务器部署
bash scripts/production-deploy.sh production

# 服务器上的部署
bash scripts/deploy.sh production deploy
```

## 📋 环境配置

### 必需的环境变量

每个环境都需要配置对应的`.env.[环境名]`文件：

```bash
# .env.production 示例
NODE_ENV=production
MONGO_USER=prod_admin
MONGO_PASS=your_strong_password
DEEPSEEK_API_KEY=your_production_api_key
DOMAIN=storyapp.dandanbaba.xyz
```

### 重要配置说明

1. **DEEPSEEK_API_KEY**: 生产和预发布环境必须设置真实API密钥
2. **数据库密码**: 生产环境务必使用强密码
3. **域名配置**: 生产环境需要配置正确的域名
4. **SSL证书**: 生产环境需要配置SSL证书路径

## 🔧 部署脚本详解

### 统一部署脚本 (scripts/deploy.sh)

```bash
# 基本用法
./scripts/deploy.sh [环境] [操作] [选项]

# 环境: dev, test, staging, production
# 操作: up, down, build, logs, ps, clean, test, deploy
# 选项: --no-cache, --pull, --profile

# 示例
./scripts/deploy.sh dev up                    # 启动开发环境
./scripts/deploy.sh production deploy --pull  # 生产部署（拉取最新镜像）
./scripts/deploy.sh test --profile e2e        # 运行E2E测试
```

### 生产服务器部署脚本 (scripts/production-deploy.sh)

```bash
# 基本用法
./scripts/production-deploy.sh [环境] [选项]

# 选项
--dry-run      # 模拟运行
--skip-tests   # 跳过部署后测试

# 示例
./scripts/production-deploy.sh production     # 生产环境部署
./scripts/production-deploy.sh staging        # 预发布环境部署
./scripts/production-deploy.sh --dry-run      # 模拟运行
```

## 🔄 CI/CD 流程

GitHub Actions自动化流程包括：

### 触发条件
- Push到master/main分支
- Pull Request
- 打标签(v*)

### 流水线阶段

1. **代码质量检查**
   - 代码规范检查（ESLint）
   - 类型检查（TypeScript）
   - 单元测试

2. **Docker构建和测试**
   - 多环境Docker镜像构建
   - 容器启动测试
   - 基本API测试

3. **E2E测试**
   - 完整业务流程测试
   - Playwright自动化测试

4. **镜像推送**
   - 推送到GitHub Container Registry
   - 支持多架构（amd64/arm64）

5. **自动部署**
   - 预发布环境自动部署
   - 生产环境手动确认部署

## 🖥️ 服务器部署

### 服务器环境准备

1. **安装Docker和Docker Compose**
```bash
# 在服务器上执行
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh
sudo usermod -aG docker $USER

# 安装Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/download/v2.24.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
```

2. **创建项目目录**
```bash
mkdir -p /root/projects/storyapp
```

3. **配置环境变量**
```bash
# 在服务器上创建 .env 文件
cd /root/projects/storyapp
cat > .env << EOF
NODE_ENV=production
MONGO_USER=prod_admin
MONGO_PASS=your_strong_password
DEEPSEEK_API_KEY=your_production_api_key
DOMAIN=storyapp.dandanbaba.xyz
EOF
```

### 部署流程

1. **从本地部署到服务器**
```bash
# 在本地项目根目录执行
bash scripts/production-deploy.sh production
```

2. **直接在服务器上部署**
```bash
# SSH到服务器
ssh root@47.120.74.212
cd /root/projects/storyapp

# 拉取最新代码
git pull origin feat/complete-containerization

# 执行部署
bash scripts/deploy.sh production deploy
```

### 服务器管理命令

```bash
# 查看服务状态
bash scripts/deploy.sh production ps

# 查看日志
bash scripts/deploy.sh production logs

# 重启服务
bash scripts/deploy.sh production up

# 停止服务
bash scripts/deploy.sh production down

# 清理环境
bash scripts/deploy.sh production clean
```

## 🔍 监控和调试

### 健康检查端点

- 应用健康检查: `/healthz`
- API健康检查: `/api/health`
- Nginx健康检查: `/nginx-health`

### 日志查看

```bash
# 查看所有服务日志
docker-compose logs -f

# 查看特定服务日志
docker-compose logs -f app
docker-compose logs -f mongo
docker-compose logs -f nginx

# 查看最近的日志
docker-compose logs --tail=100 app
```

### 常见问题排查

1. **容器启动失败**
```bash
# 查看容器状态
docker ps -a
# 查看构建日志
docker-compose build --no-cache app
```

2. **健康检查失败**
```bash
# 手动测试健康检查端点
curl http://localhost:5000/healthz
# 查看应用日志
docker-compose logs app
```

3. **数据库连接问题**
```bash
# 检查MongoDB状态
docker-compose exec mongo mongosh --eval "db.runCommand({ping:1})"
# 查看数据库日志
docker-compose logs mongo
```

## 🎯 最佳实践

### 环境隔离
- 每个环境使用独立的数据库
- 环境配置文件严格分离
- 生产环境使用强密码和SSL

### 安全配置
- 生产环境不暴露数据库端口
- 使用非root用户运行容器
- 定期更新基础镜像和依赖

### 性能优化
- 使用Docker多阶段构建减少镜像大小
- 配置Nginx缓存和压缩
- 数据库连接池和索引优化

### 监控告警
- 配置健康检查
- 设置资源限制
- 日志收集和分析

## 🔚 总结

这套容器化部署方案实现了：

1. **开发效率**: 本地Docker环境与生产环境一致
2. **部署安全**: 多重健康检查和回滚机制
3. **运维简化**: 统一的部署接口和自动化脚本
4. **扩展性**: 支持蓝绿部署和水平扩展
5. **可观测性**: 完整的日志和监控体系

通过这套方案，可以实现真正的"一次构建，到处运行"，大大提高了开发和运维效率。