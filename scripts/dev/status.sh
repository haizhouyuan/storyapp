#!/usr/bin/env bash
set -euo pipefail

# 服务状态检查脚本
# 用途：快速检查前后端服务运行状态

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$PROJECT_ROOT"

echo "=========================================="
echo "  StoryApp 服务状态检查"
echo "=========================================="
echo ""

# 后端状态
echo "【后端服务】PM2 进程"
if npx --yes pm2 describe storyapp-backend >/dev/null 2>&1; then
  npx --yes pm2 status | grep -A 1 "storyapp-backend" || npx --yes pm2 status
  echo ""
  echo "健康检查："
  if curl -fsS --max-time 2 http://localhost:5001/api/health >/dev/null 2>&1; then
    echo "  ✅ http://localhost:5001/api/health - OK"
  else
    echo "  ❌ http://localhost:5001/api/health - 失败"
  fi
else
  echo "  ⚠️  后端服务未运行（PM2）"
fi
echo ""

# 前端状态
echo "【前端服务】Nginx 容器"
if docker ps --filter name=storyapp-nginx --format "{{.Names}}" | grep -q storyapp-nginx; then
  docker ps --filter name=storyapp-nginx --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
  echo ""
  echo "HTTP 响应："
  if curl -fsS --max-time 2 http://localhost:8081 >/dev/null 2>&1; then
    echo "  ✅ http://localhost:8081 - OK"
  else
    echo "  ❌ http://localhost:8081 - 失败"
  fi
  echo ""
  echo "API 代理："
  if curl -fsS --max-time 2 http://localhost:8081/api/health >/dev/null 2>&1; then
    echo "  ✅ http://localhost:8081/api/health - OK"
  else
    echo "  ❌ http://localhost:8081/api/health - 失败"
  fi
else
  echo "  ⚠️  前端容器未运行"
fi
echo ""

echo "=========================================="
echo "  访问地址"
echo "=========================================="
echo "前端: http://localhost:8081 (局域网: http://192.168.1.7:8081)"
echo "后端: http://localhost:5001/api"
echo ""
