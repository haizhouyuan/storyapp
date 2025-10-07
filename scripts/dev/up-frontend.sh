#!/usr/bin/env bash
set -euo pipefail

# 前端容器化启动脚本（Nginx）
# 用途：启动 Nginx 容器托管前端静态资源，彻底避免 npx serve 的交互问题

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$PROJECT_ROOT"

# 设置 Node 路径
export PATH="/home/yuanhaizhou/projects/storyapp/.node/node-v20.15.0-linux-x64/bin:$PATH"

echo "==> 1. 检查前端构建产物"
if [ ! -d "frontend/build" ]; then
  echo "  frontend/build 不存在，开始构建..."
  npm install
  PUBLIC_URL=/ npm run -w frontend build
else
  echo "  ✅ frontend/build 已存在"
fi

echo "==> 2. 停止旧的前端容器"
docker rm -f storyapp-nginx 2>/dev/null || true

echo "==> 3. 启动 Nginx 容器（端口 8081）"
docker run -d --name storyapp-nginx \
  -p 8081:80 \
  -v "$PWD/frontend/build:/usr/share/nginx/html:ro" \
  -v "$PWD/nginx/conf:/etc/nginx/conf.d:ro" \
  --add-host=host.docker.internal:host-gateway \
  nginx:alpine

echo "==> 4. 等待服务就绪（HTTP 探针）"
for i in {1..60}; do
  if curl -fsS --max-time 1 http://127.0.0.1:8081 >/dev/null 2>&1; then
    echo "  ✅ Nginx 就绪"
    break
  fi
  sleep 0.5
done

# 最终验证
if ! curl -fsS --max-time 1 http://127.0.0.1:8081 >/dev/null 2>&1; then
  echo "  ❌ Nginx 未能在 30s 内启动成功，日志如下："
  docker logs --tail=200 storyapp-nginx
  exit 1
fi

echo ""
echo "✅ 前端服务已启动"
echo "   本地访问: http://localhost:8081"
echo "   局域网访问: http://192.168.1.7:8081"
echo ""
echo "查看日志: docker logs -f storyapp-nginx"
echo "停止服务: docker rm -f storyapp-nginx"
