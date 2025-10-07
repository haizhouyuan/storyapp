#!/usr/bin/env bash
set -euo pipefail

# 本地完整服务启动脚本
# 用途：一键启动前后端服务（Backend PM2 + Frontend Nginx）

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$PROJECT_ROOT"

echo "=========================================="
echo "  StoryApp 本地服务启动"
echo "=========================================="
echo ""

# 启动后端
echo "【1/2】启动后端服务..."
bash scripts/dev/up-backend.sh
echo ""

# 启动前端
echo "【2/2】启动前端服务..."
bash scripts/dev/up-frontend.sh
echo ""

echo "=========================================="
echo "  ✅ 所有服务已启动"
echo "=========================================="
echo ""
echo "前端访问地址:"
echo "  - 本地: http://localhost:8081"
echo "  - 局域网: http://192.168.1.7:8081"
echo ""
echo "后端 API 地址:"
echo "  - 健康检查: http://localhost:5001/api/health"
echo "  - API 端点: http://localhost:5001/api"
echo ""
echo "管理命令:"
echo "  - PM2 状态: npx pm2 status"
echo "  - 后端日志: npx pm2 logs storyapp-backend"
echo "  - 前端日志: docker logs -f storyapp-nginx"
echo "  - 停止后端: npx pm2 stop storyapp-backend"
echo "  - 停止前端: docker rm -f storyapp-nginx"
echo ""
