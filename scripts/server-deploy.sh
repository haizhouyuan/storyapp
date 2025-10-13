#!/usr/bin/env bash
set -euo pipefail

# 儿童故事应用 - 服务器部署脚本
# 与 GitHub Actions 保持一致的 Docker Compose 部署流程
#
# 可选环境变量：
#   USE_GHCR=true|false    # 是否使用 GHCR 镜像（默认 true）
#   APP_TAG=latest         # 使用的镜像标签，在 USE_GHCR=true 时生效
#   GHCR_USERNAME=...      # docker login 用户名（未提供时使用当前 git 用户）
#   GHCR_TOKEN=...         # docker login 令牌

echo "🚀 儿童故事应用 - 开始服务器部署流程..."

if ! command -v docker &>/dev/null; then
  echo "❌ 必须先安装 Docker 才能部署"
  exit 1
fi

if ! command -v docker compose &>/dev/null; then
  echo "❌ 当前环境未安装 docker compose v2，请安装后重试"
  exit 1
fi

if [ ! -f "package.json" ]; then
  echo "❌ 当前目录不是项目根目录，请 cd 到仓库根目录执行"
  exit 1
fi

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "❌ 当前目录不是 git 仓库，请检查仓库状态"
  exit 1
fi

echo "🔍 拉取最新代码..."
CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
git fetch origin --prune
git pull --ff-only origin "$CURRENT_BRANCH"

COMPOSE_FILES=(-f docker-compose.yml)
USE_GHCR="${USE_GHCR:-true}"
APP_TAG="${APP_TAG:-latest}"

if [ "$USE_GHCR" = "true" ] && [ -f "docker-compose.ghcr.yml" ]; then
  echo "📦 使用 GHCR 镜像部署，标签: ${APP_TAG}"
  COMPOSE_FILES+=(-f docker-compose.ghcr.yml)
  GHCR_USER="${GHCR_USERNAME:-${GHCR_USER:-${GH_USERNAME:-$(git config user.name || echo "storyapp")}}}"
  if [ -n "${GHCR_TOKEN:-}" ]; then
    echo "🔑 登录 GHCR..."
    printf '%s' "$GHCR_TOKEN" | docker login ghcr.io -u "$GHCR_USER" --password-stdin
  else
    echo "⚠️ 未设置 GHCR_TOKEN，跳过 docker login（若镜像为私有将导致拉取失败）"
  fi
  export APP_TAG
else
  if [ -f "docker-compose.optimized.yml" ]; then
    COMPOSE_FILES+=(-f docker-compose.optimized.yml)
  fi
  echo "🔨 本地构建应用镜像..."
  if ! docker compose "${COMPOSE_FILES[@]}" build app; then
    echo "❌ 构建失败，请确认 docker-compose.optimized.yml 定义了 app 的 build 配置"
    exit 1
  fi
fi

echo "🧹 清理残留容器（若存在）..."
docker compose "${COMPOSE_FILES[@]}" down --remove-orphans || true

echo "🐳 启动服务..."
docker compose "${COMPOSE_FILES[@]}" up -d

echo "⏳ 等待应用通过健康检查..."
HEALTH_ENDPOINT="http://localhost:5000/api/health"
if [ -n "${PORT:-}" ]; then
  HEALTH_ENDPOINT="http://localhost:${PORT}/api/health"
fi

for _ in {1..30}; do
  if curl -fsS "${HEALTH_ENDPOINT}" >/dev/null 2>&1; then
    echo "✅ 部署成功，服务健康"
    echo "🌐 访问地址: ${HEALTH_ENDPOINT%/api/health}"
    exit 0
  fi
  sleep 5
done

echo "❌ 健康检查超时，请查看日志: docker compose ${COMPOSE_FILES[*]} logs app"
docker compose "${COMPOSE_FILES[@]}" logs app
exit 1
