#!/bin/bash
# StoryApp 简化部署脚本
# 支持三端配置一致性验证

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'  
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 日志函数
log_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
log_success() { echo -e "${GREEN}✅ $1${NC}"; }
log_warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}"; }

# 显示帮助信息
show_help() {
    echo "StoryApp 简化部署脚本"
    echo ""
    echo "用法: $0 [ENVIRONMENT]"
    echo ""
    echo "环境选项:"
    echo "  dev     开发环境 (源码挂载 + 热更新)"
    echo "  ghcr    GHCR镜像验证环境"
    echo "  prod    生产环境"
    echo ""
    echo "示例:"
    echo "  $0 dev      # 启动开发环境"
    echo "  $0 ghcr     # 启动GHCR验证环境" 
    echo "  $0 prod     # 启动生产环境"
}

# 环境检查
check_requirements() {
    log_info "检查系统要求..."
    
    if ! command -v docker &> /dev/null; then
        log_error "Docker 未安装"
        exit 1
    fi
    
    if ! command -v docker-compose &> /dev/null; then
        log_error "Docker Compose 未安装"
        exit 1
    fi
    
    if [ ! -f ".env" ]; then
        log_warning ".env文件不存在，将使用默认配置"
        cp .env.example .env
    fi
    
    log_success "系统要求检查通过"
}

# 健康检查
health_check() {
    local port=$1
    local env_name=$2
    
    log_info "等待${env_name}环境启动..."
    sleep 10
    
    for i in {1..30}; do
        if curl -fsS "http://localhost:${port}/api/health" > /dev/null 2>&1; then
            log_success "${env_name}环境健康检查通过 (http://localhost:${port})"
            return 0
        fi
        sleep 2
    done
    
    log_error "${env_name}环境健康检查失败"
    return 1
}

# 部署函数
deploy_dev() {
    log_info "部署开发环境..."
    docker-compose -f docker-compose.yml -f docker-compose.dev.yml up -d
    health_check 5001 "开发"
}

deploy_ghcr() {
    log_info "部署GHCR镜像验证环境..."
    docker-compose -f docker-compose.yml -f docker-compose.ghcr.yml up -d  
    health_check 5002 "GHCR验证"
}

deploy_prod() {
    log_info "部署生产环境..."
    docker-compose -f docker-compose.yml up -d
    health_check 5000 "生产"
}

# 主逻辑
main() {
    local environment=${1:-""}
    
    if [ -z "$environment" ]; then
        show_help
        exit 1
    fi
    
    check_requirements
    
    case $environment in
        "dev")
            deploy_dev
            ;;
        "ghcr") 
            deploy_ghcr
            ;;
        "prod")
            deploy_prod
            ;;
        *)
            log_error "未知环境: $environment"
            show_help
            exit 1
            ;;
    esac
    
    log_success "部署完成！"
}

main "$@"