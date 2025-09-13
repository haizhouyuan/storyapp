# 新项目部署检查清单

## 📋 部署前必检项目

### 1. 端口分配确认
```bash
# 检查端口占用情况
netstat -tlnp | grep :5011
netstat -tlnp | grep :5012
# ... 检查整个预分配范围

# 或使用脚本批量检查
for port in {5011..5020}; do
  if netstat -tlpn | grep ":$port " >/dev/null; then
    echo "⚠️ 端口 $port 已被占用"
  else
    echo "✅ 端口 $port 可用"
  fi
done
```

### 2. 资源评估
```bash
# 检查当前资源使用
docker stats --no-stream
free -h
df -h

# 检查StoryApp容器资源使用
docker inspect storyapp-app | jq '.[0].HostConfig.Memory'
docker inspect storyapp-mongo | jq '.[0].HostConfig.Memory'
```

### 3. 域名规划
- 检查DNS配置是否冲突
- 确认SSL证书申请计划
- 验证Nginx配置兼容性

### 4. 数据隔离确认
- 确保MongoDB数据库名不冲突
- 检查数据目录挂载点
- 验证备份策略独立性

## 🔧 推荐部署模板

### 新项目Docker Compose模板
```yaml
version: '3.8'

services:
  ${PROJECT_NAME}-app:
    image: your-project:latest
    ports:
      - "${ASSIGNED_PORT}:${INTERNAL_PORT}"
    environment:
      - NODE_ENV=production
      - PORT=${INTERNAL_PORT}
    deploy:
      resources:
        limits:
          cpus: '0.5'        # 根据需求调整
          memory: 512M       # 根据需求调整
        reservations:
          cpus: '0.25'
          memory: 256M
    restart: unless-stopped
    networks:
      - ${PROJECT_NAME}-network

  ${PROJECT_NAME}-db:
    image: mongo:6.0
    ports: []  # 生产环境不暴露数据库端口
    environment:
      MONGO_INITDB_ROOT_USERNAME: ${DB_USER}
      MONGO_INITDB_ROOT_PASSWORD: ${DB_PASS}
      MONGO_INITDB_DATABASE: ${PROJECT_NAME}
    volumes:
      - ${PROJECT_NAME}_data:/data/db
    deploy:
      resources:
        limits:
          cpus: '0.25'
          memory: 256M
        reservations:
          cpus: '0.1'
          memory: 128M
    restart: unless-stopped
    networks:
      - ${PROJECT_NAME}-network

volumes:
  ${PROJECT_NAME}_data:
    driver: local

networks:
  ${PROJECT_NAME}-network:
    driver: bridge
```

## 📊 资源分配建议

### 小型项目 (5011-5020端口范围)
- **CPU限制**: 0.5核
- **内存限制**: 512MB
- **数据库**: MongoDB 256MB

### 中型项目 (5021-5030端口范围)
- **CPU限制**: 1.0核  
- **内存限制**: 1GB
- **数据库**: MongoDB 512MB

### 大型项目 (5031-5040端口范围)
- **CPU限制**: 1.5核
- **内存限制**: 2GB
- **数据库**: PostgreSQL/MySQL 1GB

## 🚨 冲突预防机制

### 1. 项目命名规范
```bash
# 容器命名格式
${PROJECT_NAME}-app
${PROJECT_NAME}-db
${PROJECT_NAME}-cache

# 网络命名格式
${PROJECT_NAME}-network

# 数据卷命名格式
${PROJECT_NAME}_data
${PROJECT_NAME}_logs
```

### 2. 环境变量隔离
```bash
# 每个项目使用独立的.env文件
/root/projects/${PROJECT_NAME}/.env.prod
```

### 3. 监控脚本
```bash
#!/bin/bash
# /root/scripts/check-resources.sh

echo "=== 服务器资源使用情况 ==="
echo "CPU使用率:"
top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1

echo -e "\n内存使用情况:"
free -h

echo -e "\n磁盘使用情况:"
df -h /

echo -e "\n端口占用情况:"
netstat -tlnp | grep ":50[0-9][0-9]"

echo -e "\n容器资源使用:"
docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}"

echo -e "\n各项目端口分配:"
echo "StoryApp: 5001 (已使用)"
for port in {5011..5050}; do
  if netstat -tlpn | grep ":$port " >/dev/null; then
    echo "项目X: $port (已使用)"
  fi
done
```

## 📞 协调流程

### 新项目申请
1. **提交申请** - 填写项目信息模板
2. **资源评估** - 运行检查脚本确认可用资源  
3. **端口分配** - 分配端口范围并更新文档
4. **部署验证** - 按检查清单执行部署
5. **文档更新** - 更新 SERVER_RESOURCE_ALLOCATION.md

### 联系方式
- **资源冲突**: 检查本文档并协调
- **部署问题**: 查看项目日志
- **紧急情况**: 使用 `/root/scripts/emergency-stop.sh`

---

**创建时间**: 2025-09-13  
**维护人员**: 系统管理员