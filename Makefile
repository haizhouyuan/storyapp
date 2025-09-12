# StoryApp Makefile - ultrathink 一键化操作
# 三种场景的标准操作指令封装

.PHONY: help setup clean logs ps health
.DEFAULT_GOAL := help

# ===== 环境初始化 =====
setup: ## 初始化项目环境
	@echo "🚀 初始化 StoryApp 环境..."
	cp .env.example .env
	@echo "✅ .env 文件已创建，请填入真实的 API 密钥"
	@echo "📝 编辑 .env 中的 DEEPSEEK_API_KEY"

# ===== A) 本地开发模式 =====
dev: ## 启动本地开发环境（源码热更新）
	@echo "🔧 启动开发环境（源码挂载 + 热更新）..."
	docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build

dev-logs: ## 查看开发环境日志
	docker compose -f docker-compose.yml -f docker-compose.dev.yml logs -f --tail=200 app

dev-down: ## 停止开发环境
	docker compose -f docker-compose.yml -f docker-compose.dev.yml down -v

# ===== B) GHCR镜像验证模式 =====
ghcr: ## 启动GHCR镜像验证环境（与生产一致）
	@echo "📦 启动GHCR镜像验证（与生产环境一致）..."
	@echo "🔑 登录GHCR..."
	docker login ghcr.io
	docker compose -f docker-compose.yml -f docker-compose.ghcr.yml pull
	docker compose -f docker-compose.yml -f docker-compose.ghcr.yml up -d

ghcr-logs: ## 查看GHCR环境日志  
	docker compose -f docker-compose.yml -f docker-compose.ghcr.yml logs -f --tail=200 app

ghcr-down: ## 停止GHCR环境
	docker compose -f docker-compose.yml -f docker-compose.ghcr.yml down -v

# ===== C) 生产部署模式 =====
prod-pull: ## 拉取指定标签的生产镜像
	@echo "📥 拉取生产镜像 APP_TAG=$(APP_TAG)..."
	APP_TAG=$(APP_TAG) docker compose -f docker-compose.yml -f docker-compose.ghcr.yml pull

prod-deploy: ## 部署到生产环境
	@echo "🚀 部署到生产环境..."
	APP_TAG=$(APP_TAG) docker compose -f docker-compose.yml -f docker-compose.ghcr.yml up -d --remove-orphans
	docker image prune -f

# ===== 通用操作 =====
logs: ## 查看应用日志
	docker compose logs -f --tail=200 app

ps: ## 查看容器状态
	docker compose ps

health: ## 健康检查
	@echo "🔍 检查服务健康状态..."
	@curl -fsS http://localhost:$${APP_PORT:-5000}/healthz || echo "❌ 标准健康检查失败"
	@curl -fsS http://localhost:$${APP_PORT:-5000}/api/health || echo "❌ 兼容性健康检查失败"

down: ## 停止所有服务
	docker compose down -v

clean: ## 清理未使用的Docker资源
	docker system prune -f
	docker volume prune -f

# ===== 开发工具 =====
mongo-shell: ## 连接到MongoDB shell
	docker compose exec mongo mongosh -u $${MONGO_USER:-root} -p $${MONGO_PASS:-pass123} $${MONGO_DB:-storyapp}

app-shell: ## 连接到应用容器shell
	docker compose exec app sh

# ===== 测试相关 =====
test: ## 运行端到端测试
	@echo "🧪 运行 Playwright E2E 测试..."
	npm test

smoke: ## 快速冒烟测试
	@echo "💨 执行冒烟测试..."
	@curl -fsS http://localhost:$${APP_PORT:-5000}/healthz
	@echo "✅ 冒烟测试通过"

# ===== 镜像管理 =====
build: ## 构建本地镜像
	docker build -t storyapp:latest \
		--build-arg NODE_IMAGE=$${NODE_IMAGE:-node:18-alpine} \
		--build-arg NPM_REGISTRY=$${NPM_REGISTRY:-https://registry.npmmirror.com} \
		.

push: ## 推送到GHCR（需要先构建和标记）
	@echo "📤 推送镜像到 GHCR..."
	docker tag storyapp:latest ghcr.io/haizhouyuan/storyapp:$${APP_TAG:-latest}
	docker push ghcr.io/haizhouyuan/storyapp:$${APP_TAG:-latest}

# ===== 帮助信息 =====
help: ## 显示帮助信息
	@echo "StoryApp Makefile - ultrathink 一键化操作"
	@echo ""
	@echo "📋 可用命令："
	@echo ""
	@echo "🔧 开发环境："
	@echo "  setup     - 初始化项目环境"
	@echo "  dev       - 启动开发环境（热更新）"
	@echo "  dev-logs  - 查看开发日志" 
	@echo "  dev-down  - 停止开发环境"
	@echo ""
	@echo "📦 GHCR验证："
	@echo "  ghcr      - 启动GHCR镜像验证"
	@echo "  ghcr-logs - 查看GHCR日志"
	@echo "  ghcr-down - 停止GHCR环境"
	@echo ""
	@echo "🚀 生产部署："
	@echo "  prod-pull - 拉取生产镜像 APP_TAG=sha-xxx"
	@echo "  prod-deploy - 部署到生产环境"
	@echo ""
	@echo "🛠️ 通用工具："
	@echo "  logs      - 查看应用日志"
	@echo "  ps        - 查看容器状态"  
	@echo "  health    - 健康检查"
	@echo "  down      - 停止所有服务"
	@echo "  clean     - 清理Docker资源"
	@echo ""
	@echo "📝 示例用法："
	@echo "  make setup              # 首次初始化"
	@echo "  make dev                # 开发调试"
	@echo "  make ghcr               # 验证GHCR镜像"
	@echo "  APP_TAG=sha-abc123 make prod-deploy  # 生产部署"