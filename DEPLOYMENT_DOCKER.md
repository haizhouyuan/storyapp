# Docker容器化生产部署指南

## 🎯 概述

本文档提供完整的Docker容器化部署流程，包括日志记录系统的容器化配置和测试。

## 📋 前置条件

### 服务器要求
- **操作系统**: Ubuntu 20.04+ 或 CentOS 7+
- **内存**: 最少 2GB，推荐 4GB+
- **磁盘**: 最少 10GB 可用空间
- **CPU**: 最少 1 核心，推荐 2 核心+
- **网络**: 稳定的互联网连接

### 软件要求
- Docker 20.10+
- Docker Compose 2.0+
- Git
- 防火墙配置（开放端口 80, 443, 5001）

## 🚀 部署步骤

### 第一步：连接服务器并准备环境

```bash
# 连接到生产服务器
ssh root@47.120.74.212

# 检查Docker安装
docker --version
docker-compose --version

# 如果未安装，执行安装
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# 安装Docker Compose
curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose
```

### 第二步：拉取最新代码

```bash
# 进入项目目录
cd /root/projects/storyapp

# 拉取最新代码
git pull origin master
# 或从Gitee拉取
git pull gitee master

# 检查项目文件
ls -la
```

### 第三步：配置生产环境变量

```bash
# 创建生产环境配置文件
cat > .env << 'EOF'
# DeepSeek API配置（必须替换真实密钥）
DEEPSEEK_API_KEY=your_real_deepseek_api_key
DEEPSEEK_API_URL=https://api.deepseek.com

# MongoDB配置
MONGODB_URI=mongodb://mongo:27017/storyapp
MONGODB_DB_NAME=storyapp

# 应用配置
NODE_ENV=production
PORT=5000

# 日志配置
ENABLE_DB_LOGGING=true
ENABLE_FILE_LOGGING=false
LOG_LEVEL=info
LOG_RETENTION_DAYS=30
EOF

# 设置文件权限
chmod 600 .env

# 验证配置
cat .env
```

### 第四步：使用自动化部署脚本

```bash
# 给部署脚本执行权限
chmod +x scripts/deploy-production.sh

# 运行自动化部署
./scripts/deploy-production.sh
```

### 第五步：手动部署（如果脚本失败）

```bash
# 1. 停止旧服务
docker-compose down --remove-orphans

# 2. 清理旧镜像
docker image prune -f

# 3. 构建新镜像
docker-compose build --no-cache app

# 4. 启动MongoDB
docker-compose up -d mongo

# 5. 等待MongoDB就绪
sleep 30

# 6. 启动应用
docker-compose up -d app

# 7. 检查服务状态
docker-compose ps
```

## 🔍 验证部署

### 基础健康检查

```bash
# 检查容器状态
docker-compose ps

# 检查健康状态
curl -s http://localhost:5001/api/health | jq '.'

# 检查应用日志
docker-compose logs -f app
```

### 运行完整测试

```bash
# 运行生产环境测试脚本
node test-production-logging.js

# 或运行原始测试脚本
node test-logging-system.js
```

### 测试管理API

```bash
# 测试统计API
curl -s http://localhost:5001/api/admin/stats | jq '.'

# 测试日志API
curl -s "http://localhost:5001/api/admin/logs?limit=5" | jq '.'

# 测试性能API
curl -s http://localhost:5001/api/admin/performance | jq '.'
```

## 🛠️ 容器管理命令

### 常用操作

```bash
# 查看所有容器状态
docker-compose ps

# 查看实时日志
docker-compose logs -f app
docker-compose logs -f mongo

# 重启应用
docker-compose restart app

# 进入容器调试
docker exec -it storyapp_prod sh

# 查看资源使用
docker stats storyapp_prod storyapp_mongo

# 停止所有服务
docker-compose down

# 停止并删除数据卷（谨慎使用）
docker-compose down -v
```

### 故障排除

```bash
# 查看详细日志
docker-compose logs --tail=100 app

# 检查容器内部
docker exec -it storyapp_prod sh
ls -la /app
cat /app/package.json

# 检查网络连接
docker network ls
docker network inspect storyapp_storyapp

# 重建并重启
docker-compose down
docker-compose build --no-cache app
docker-compose up -d
```

## 🌐 配置Nginx反向代理

### 创建Nginx配置

```bash
# 创建站点配置
cat > /etc/nginx/sites-available/storyapp.dandanbaba.xyz << 'EOF'
server {
    listen 80;
    server_name storyapp.dandanbaba.xyz;
    
    # 重定向到HTTPS（如果有SSL证书）
    # return 301 https://$server_name$request_uri;
    
    location / {
        proxy_pass http://localhost:5001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # 超时配置
        proxy_connect_timeout 30s;
        proxy_send_timeout 30s;
        proxy_read_timeout 30s;
    }
    
    # 健康检查端点
    location /api/health {
        proxy_pass http://localhost:5001/api/health;
        access_log off;
    }
    
    # 静态文件缓存
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
        proxy_pass http://localhost:5001;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
EOF

# 启用站点
ln -sf /etc/nginx/sites-available/storyapp.dandanbaba.xyz /etc/nginx/sites-enabled/

# 测试配置
nginx -t

# 重载Nginx
systemctl reload nginx
```

### 验证Nginx配置

```bash
# 测试本地访问
curl -H "Host: storyapp.dandanbaba.xyz" http://localhost/api/health

# 如果域名已解析，测试域名访问
curl http://storyapp.dandanbaba.xyz/api/health
```

## 📊 监控和维护

### 设置监控

```bash
# 创建监控脚本
cat > /root/scripts/monitor-storyapp.sh << 'EOF'
#!/bin/bash

echo "=== Story App Health Check ===="
echo "Time: $(date)"

# 检查容器状态
echo -e "\n🐳 Container Status:"
docker-compose -f /root/projects/storyapp/docker-compose.yml ps

# 检查服务健康
echo -e "\n🏥 Service Health:"
curl -s http://localhost:5001/api/health | jq -r '.status // "unhealthy"'

# 检查资源使用
echo -e "\n📊 Resource Usage:"
docker stats --no-stream storyapp_prod storyapp_mongo

# 检查日志错误
echo -e "\n❌ Recent Errors:"
docker-compose -f /root/projects/storyapp/docker-compose.yml logs --tail=10 app | grep -i error || echo "No recent errors"

echo "================================"
EOF

chmod +x /root/scripts/monitor-storyapp.sh

# 设置定时监控（可选）
# echo "*/5 * * * * /root/scripts/monitor-storyapp.sh >> /var/log/storyapp-monitor.log 2>&1" | crontab -
```

### 备份策略

```bash
# 创建备份脚本
cat > /root/scripts/backup-storyapp.sh << 'EOF'
#!/bin/bash

BACKUP_DIR="/root/backups/storyapp"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

# 备份MongoDB数据
docker exec storyapp_mongo mongodump --db storyapp --out /tmp/backup_$DATE
docker cp storyapp_mongo:/tmp/backup_$DATE $BACKUP_DIR/mongo_$DATE

# 备份应用日志
docker cp storyapp_prod:/app/logs $BACKUP_DIR/logs_$DATE

# 压缩备份
cd $BACKUP_DIR
tar -czf backup_$DATE.tar.gz mongo_$DATE logs_$DATE
rm -rf mongo_$DATE logs_$DATE

echo "Backup completed: $BACKUP_DIR/backup_$DATE.tar.gz"
EOF

chmod +x /root/scripts/backup-storyapp.sh
```

## 🚨 故障恢复

### 常见问题解决

1. **容器启动失败**
   ```bash
   # 检查日志
   docker-compose logs app
   
   # 重建镜像
   docker-compose build --no-cache app
   docker-compose up -d app
   ```

2. **数据库连接失败**
   ```bash
   # 检查MongoDB状态
   docker-compose logs mongo
   
   # 重启MongoDB
   docker-compose restart mongo
   ```

3. **磁盘空间不足**
   ```bash
   # 清理Docker资源
   docker system prune -f
   docker volume prune -f
   
   # 清理日志
   docker-compose exec app find /app/logs -name "*.log" -mtime +7 -delete
   ```

4. **内存不足**
   ```bash
   # 查看内存使用
   free -h
   docker stats
   
   # 重启应用释放内存
   docker-compose restart app
   ```

## 📈 性能优化

### 容器资源限制

```yaml
# 在docker-compose.yml中添加资源限制
services:
  app:
    deploy:
      resources:
        limits:
          memory: 1G
          cpus: '1.0'
        reservations:
          memory: 512M
          cpus: '0.5'
```

### 日志轮转

```bash
# 配置Docker日志轮转
cat > /etc/docker/daemon.json << 'EOF'
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
EOF

systemctl restart docker
```

## 🔗 相关链接

- [项目仓库](https://github.com/haizhouyuan/storyapp)
- [Appsmith配置指南](./docs/APPSMITH_SETUP.md)
- [API文档](./docs/API.md)
- [故障排除指南](./docs/TROUBLESHOOTING.md)

## 📞 联系支持

如果在部署过程中遇到问题：

1. 检查 `production-test-report.md` 测试报告
2. 查看容器日志：`docker-compose logs -f app`
3. 运行健康检查：`curl http://localhost:5001/api/health`
4. 联系开发团队提供支持