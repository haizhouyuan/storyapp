# 多项目管理快速入门指南

## 🚀 快速使用

### 1. 检查服务器当前状态
```bash
# 在服务器上运行
./scripts/server-status-check.sh

# 保存报告到文件
./scripts/server-status-check.sh --save
```

### 2. 查看当前项目分配
```bash
./scripts/project-coordinator.sh show
```

### 3. 申请新项目部署
```bash
# 基本申请
./scripts/project-coordinator.sh request myapi 5011-5020

# 完整申请
./scripts/project-coordinator.sh request myapi 5011-5020 myapi.dandanbaba.xyz 0.5 512M
```

### 4. 批准并部署
```bash
# 批准申请
./scripts/project-coordinator.sh approve myapi

# 部署应用（手动或CI/CD）
# ... 部署过程 ...

# 激活项目
./scripts/project-coordinator.sh activate myapi
```

## 📋 StoryApp 当前占用资源

### 端口分配
- **5001**: StoryApp Backend API
- **27017**: MongoDB 数据库
- **80/443**: Nginx 反向代理

### 预留端口范围
- **5011-5020**: 项目2（可用）
- **5021-5030**: 项目3（可用）
- **5031-5040**: 项目4（可用）
- **5041-5050**: 项目5（可用）

### 资源限制
```yaml
StoryApp App:
  CPU: 最大1.0核, 保留0.5核
  内存: 最大1GB, 保留512MB

StoryApp MongoDB:
  CPU: 最大0.5核, 保留0.25核
  内存: 最大512MB, 保留256MB
```

## 🎯 推荐部署流程

### 小型项目 (推荐配置)
```bash
# 申请资源
./scripts/project-coordinator.sh request smallapp 5011-5020 smallapp.dandanbaba.xyz 0.5 512M

# 创建项目目录
mkdir -p /root/projects/smallapp
cd /root/projects/smallapp

# 创建 docker-compose.yml
cat > docker-compose.yml << 'EOF'
version: '3.8'
services:
  smallapp-app:
    image: your-app:latest
    ports:
      - "5011:5000"
    environment:
      - NODE_ENV=production
      - PORT=5000
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 512M
        reservations:
          cpus: '0.25'
          memory: 256M
    restart: unless-stopped

  smallapp-db:
    image: mongo:6.0
    environment:
      MONGO_INITDB_ROOT_USERNAME: admin
      MONGO_INITDB_ROOT_PASSWORD: ${DB_PASSWORD}
      MONGO_INITDB_DATABASE: smallapp
    volumes:
      - smallapp_data:/data/db
    deploy:
      resources:
        limits:
          cpus: '0.25'
          memory: 256M
    restart: unless-stopped

volumes:
  smallapp_data:
EOF

# 部署
docker compose up -d

# 激活项目
./scripts/project-coordinator.sh activate smallapp
```

### 中型项目 (扩展配置)
```bash
./scripts/project-coordinator.sh request mediumapp 5021-5030 mediumapp.dandanbaba.xyz 1.0 1G
```

### 大型项目 (高配置)
```bash
./scripts/project-coordinator.sh request largeapp 5031-5040 largeapp.dandanbaba.xyz 1.5 2G
```

## 🔧 Nginx 反向代理配置

为新项目添加域名反向代理：

```nginx
# /etc/nginx/sites-available/项目名.dandanbaba.xyz
server {
    listen 80;
    server_name 项目名.dandanbaba.xyz;
    
    location / {
        proxy_pass http://localhost:项目端口;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# 启用配置
sudo ln -s /etc/nginx/sites-available/项目名.dandanbaba.xyz /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## 🚨 注意事项

### 部署前必检
1. **端口冲突检查**: `netstat -tlnp | grep :端口号`
2. **资源使用检查**: `docker stats --no-stream`
3. **磁盘空间检查**: `df -h`
4. **内存可用检查**: `free -h`

### 资源预留原则
- 为系统保留至少20%的CPU和内存
- 每个项目必须设置资源限制
- 避免超量分配资源

### 数据隔离要求
- 每个项目使用独立数据库
- 项目间不共享敏感数据
- 定期备份重要数据

## 📞 协调和支持

### 遇到冲突时
1. 运行 `./scripts/server-status-check.sh` 了解当前状况
2. 使用 `./scripts/project-coordinator.sh show` 查看分配
3. 协调端口和资源重新分配
4. 更新 `docs/SERVER_RESOURCE_ALLOCATION.md`

### 紧急情况处理
```bash
# 停止所有项目（紧急情况）
for project in storyapp project2 project3; do
    cd /root/projects/$project 2>/dev/null && docker compose down || true
done

# 快速重启 StoryApp
cd /root/projects/storyapp
./scripts/deploy-helper.sh status
```

### 联系方式
- **部署冲突**: 检查本文档
- **资源不足**: 优化现有项目或升级服务器
- **技术问题**: 查看项目日志和监控

---

*更新时间: 2025-09-13*  
*维护人员: 系统管理员*