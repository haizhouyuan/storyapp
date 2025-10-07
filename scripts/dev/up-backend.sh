#!/usr/bin/env bash
set -euo pipefail

# 后端 PM2 启动脚本
# 用途：使用 PM2 管理后端 Node 进程，支持崩溃自启、日志集中

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$PROJECT_ROOT"

# 设置 Node 路径
export PATH="/home/yuanhaizhou/projects/storyapp/.node/node-v20.15.0-linux-x64/bin:$PATH"

echo "==> 1. 检查后端构建产物"
if [ ! -d "backend/dist" ]; then
  echo "  backend/dist 不存在，开始构建..."
  npm install
  npm run -w backend build
else
  echo "  ✅ backend/dist 已存在"
fi

echo "==> 2. 启动/重启后端服务（PM2）"
# 检查是否已有运行的实例
if npx --yes pm2 describe storyapp-backend >/dev/null 2>&1; then
  echo "  重启现有实例..."
  npx --yes pm2 restart storyapp-backend
else
  echo "  启动新实例..."
  npx --yes pm2 start "node backend/dist/index.js" \
    --name storyapp-backend \
    --time \
    --max-memory-restart 500M
fi

# 保存 PM2 配置
npx --yes pm2 save

echo "==> 3. 等待服务就绪（健康检查）"
for i in {1..60}; do
  if curl -fsS --max-time 1 http://127.0.0.1:5001/api/health >/dev/null 2>&1; then
    echo "  ✅ 后端就绪"
    break
  fi
  sleep 0.5
done

# 最终验证
if ! curl -fsS --max-time 1 http://127.0.0.1:5001/api/health >/dev/null 2>&1; then
  echo "  ❌ 后端未能在 30s 内启动成功，日志如下："
  npx --yes pm2 logs storyapp-backend --lines 100 --nostream
  exit 1
fi

echo ""
echo "✅ 后端服务已启动"
echo "   健康检查: http://localhost:5001/api/health"
echo "   API 端点: http://localhost:5001/api"
echo ""
echo "查看状态: npx pm2 status"
echo "查看日志: npx pm2 logs storyapp-backend"
echo "停止服务: npx pm2 stop storyapp-backend"
