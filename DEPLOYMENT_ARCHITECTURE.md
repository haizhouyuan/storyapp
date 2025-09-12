# StoryApp 容器化部署架构设计

## 🎯 目标架构

### 三层部署架构
```
本地开发环境 ←→ 预发布环境 ←→ 生产环境
     ↓              ↓            ↓
 Docker Compose → Docker Compose → Kubernetes/Docker Swarm
```

### 环境矩阵
| 环境 | 配置文件 | 用途 | 数据库 | 端口 |
|------|----------|------|--------|------|
| 开发 | docker-compose.dev.yml | 本地开发调试 | 内存MongoDB | 3000, 5000 |
| 测试 | docker-compose.test.yml | CI/CD测试 | 临时MongoDB | 3001, 5001 |
| 预发布 | docker-compose.staging.yml | 服务器预发布 | 生产MongoDB | 3002, 5002 |
| 生产 | docker-compose.prod.yml | 生产部署 | 生产MongoDB | 80, 443 |

## 🏗️ 容器化策略

### 多阶段构建优化
1. **基础镜像统一**: node:18-alpine
2. **构建缓存策略**: 分层构建，最小化重复构建
3. **安全优化**: 非root用户，最小权限原则

### 服务发现和负载均衡
- **开发环境**: 直接端口映射
- **生产环境**: Nginx反向代理 + 健康检查

### 数据持久化
- **MongoDB**: 数据卷持久化
- **日志**: 集中化日志收集
- **上传文件**: 共享存储卷

## 🚀 部署流水线

### 本地开发流程
```bash
npm run docker:dev     # 启动开发环境
npm run docker:test    # 运行容器化测试
npm run docker:clean   # 清理环境
```

### CI/CD流程
```yaml
触发条件: Push to main/master
步骤:
1. 代码检查 (lint, type-check)
2. 单元测试
3. 构建Docker镜像
4. 容器化集成测试
5. 部署到预发布环境
6. E2E测试验证
7. 部署到生产环境 (手动确认)
```

### 服务器部署流程
```bash
# 一键部署命令
./scripts/deploy.sh production

# 支持的操作
- 蓝绿部署
- 滚动更新
- 回滚操作
- 健康检查
```

## 🔧 技术实现

### Docker配置结构
```
ops/
├── docker/
│   ├── Dockerfile.frontend
│   ├── Dockerfile.backend
│   └── Dockerfile.nginx
├── compose/
│   ├── docker-compose.base.yml      # 基础配置
│   ├── docker-compose.dev.yml       # 开发环境覆盖
│   ├── docker-compose.test.yml      # 测试环境覆盖
│   ├── docker-compose.staging.yml   # 预发布环境覆盖
│   └── docker-compose.prod.yml      # 生产环境覆盖
└── nginx/
    ├── nginx.conf
    └── conf.d/
        ├── development.conf
        ├── staging.conf
        └── production.conf
```

### 环境变量管理
```
.env.example           # 模板文件
.env.local            # 本地开发配置（不提交）
.env.test             # 测试环境配置
.env.staging          # 预发布环境配置
.env.production       # 生产环境配置（服务器）
```

## 📊 监控和可观测性

### 健康检查端点
- `/healthz` - 应用健康状态
- `/readiness` - 就绪状态检查
- `/metrics` - Prometheus指标

### 日志收集
- 应用日志: JSON格式，结构化输出
- 访问日志: Nginx访问日志
- 错误日志: 错误堆栈和上下文

### 性能监控
- 响应时间监控
- 资源使用率监控
- 业务指标监控

## 🔐 安全配置

### 镜像安全
- 基础镜像漏洞扫描
- 最小权限原则
- 多阶段构建减少攻击面

### 网络安全
- 内部服务网络隔离
- HTTPS强制跳转
- 安全头配置

### 数据安全
- 敏感数据环境变量化
- 数据库连接加密
- 日志脱敏处理