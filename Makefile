# StoryApp Docker Compose 简化命令
# 标准化的容器化部署工作流

.PHONY: help up-dev up-ghcr up-prod down clean logs health

# 默认目标 - 显示帮助信息
help:
	@echo "StoryApp Docker Compose 管理命令:"
	@echo ""
	@echo "  make up-dev     启动开发环境 (源码挂载 + 热更新)"
	@echo "  make up-ghcr    启动GHCR镜像验证环境"
	@echo "  make up-prod    启动生产环境"
	@echo "  make down       停止所有服务"
	@echo "  make logs       查看服务日志"
	@echo "  make health     检查服务健康状态"
	@echo "  make clean      清理未使用的容器和镜像"

# 开发环境 - 源码挂载 + 热更新
up-dev:
	@echo "🚀 启动开发环境 (端口5001)..."
	docker-compose -f docker-compose.yml -f docker-compose.dev.yml up -d
	@echo "✅ 开发环境已启动: http://localhost:5001"

# GHCR镜像验证环境
up-ghcr:
	@echo "🔍 启动GHCR镜像验证环境 (端口5002)..."
	docker-compose -f docker-compose.yml -f docker-compose.ghcr.yml up -d
	@echo "✅ GHCR验证环境已启动: http://localhost:5002"

# 生产环境
up-prod:
	@echo "🌐 启动生产环境 (端口5000)..."
	docker-compose -f docker-compose.yml up -d
	@echo "✅ 生产环境已启动: http://localhost:5000"

# 停止所有服务
down:
	@echo "⏹️  停止所有服务..."
	docker-compose -f docker-compose.yml -f docker-compose.dev.yml -f docker-compose.ghcr.yml down

# 查看服务日志
logs:
	docker-compose logs -f

# 健康检查
health:
	@echo "🔍 检查服务健康状态..."
	@curl -fsS http://localhost:5001/api/health 2>/dev/null && echo "✅ 开发环境健康" || echo "❌ 开发环境不可用"
	@curl -fsS http://localhost:5002/api/health 2>/dev/null && echo "✅ GHCR环境健康" || echo "❌ GHCR环境不可用"
	@curl -fsS http://localhost:5000/api/health 2>/dev/null && echo "✅ 生产环境健康" || echo "❌ 生产环境不可用"

# 清理未使用的容器和镜像
clean:
	@echo "🧹 清理未使用的容器和镜像..."
	docker system prune -f
	docker container prune -f
	@echo "✅ 清理完成"