#!/bin/bash

# 故事应用一键部署脚本
# 支持多环境部署：dev/staging/production

set -e

# 配置变量
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_NAME="storyapp"
DOCKER_COMPOSE_FILE="docker-compose.yml"
LOG_FILE="$SCRIPT_DIR/logs/deploy.log"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 日志函数
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

log_success() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] ✅ $1${NC}" | tee -a "$LOG_FILE"
}

log_error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ❌ $1${NC}" | tee -a "$LOG_FILE"
}

log_warning() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] ⚠️ $1${NC}" | tee -a "$LOG_FILE"
}

# 显示帮助信息
show_help() {
    echo "故事应用部署脚本"
    echo ""
    echo "用法: $0 [选项] [环境]"
    echo ""
    echo "环境:"
    echo "  dev         开发环境部署"
    echo "  staging     预发布环境部署"  
    echo "  production  生产环境部署 (默认)"
    echo ""
    echo "选项:"
    echo "  -h, --help     显示帮助信息"
    echo "  -c, --clean    清理所有容器和镜像"
    echo "  -r, --rebuild  强制重新构建镜像"
    echo "  -l, --logs     查看应用日志"
    echo "  -s, --status   检查服务状态"
    echo ""
    echo "示例:"
    echo "  $0                    # 生产环境部署"
    echo "  $0 dev                # 开发环境部署"
    echo "  $0 --rebuild          # 强制重建并部署"
    echo "  $0 --status           # 检查服务状态"
}

# 检查Docker环境
check_docker() {
    if ! command -v docker &> /dev/null; then
        log_error "Docker未安装，请先安装Docker"
        exit 1
    fi

    if ! docker info &> /dev/null; then
        log_error "Docker未运行，请启动Docker服务"
        exit 1
    fi

    if ! command -v docker-compose &> /dev/null; then
        log_error "Docker Compose未安装，请先安装Docker Compose"
        exit 1
    fi
}

# 检查环境变量
check_env() {
    if [ ! -f ".env" ]; then
        log_error "缺少.env文件，请创建并配置环境变量"
        exit 1
    fi

    if ! grep -q "DEEPSEEK_API_KEY" .env || grep -q "your-api-key-here" .env; then
        log_warning "请确保DEEPSEEK_API_KEY已正确配置"
    fi
}

# 创建必要目录
setup_directories() {
    log "创建必要目录..."
    mkdir -p logs uploads certs
    chmod 755 logs uploads
}

# 健康检查
health_check() {
    local url=$1
    local service_name=$2
    local max_attempts=${3:-30}
    local attempt=1
    
    log "检查 $service_name 健康状态..."
    
    while [ $attempt -le $max_attempts ]; do
        if curl -f -s "$url" > /dev/null 2>&1; then
            log_success "$service_name 健康检查通过"
            return 0
        fi
        
        log "健康检查尝试 $attempt/$max_attempts 失败，等待5秒..."
        sleep 5
        ((attempt++))
    done
    
    log_error "$service_name 健康检查失败"
    return 1
}

# 部署函数
deploy() {
    local environment=${1:-production}
    local compose_file="docker-compose.yml"
    local rebuild_flag=""
    
    case $environment in
        "dev")
            compose_file="docker-compose.dev.yml"
            ;;
        "staging")
            compose_file="docker-compose.yml"
            ;;
        "production")
            compose_file="docker-compose.yml"
            ;;
        *)
            log_error "无效的环境: $environment"
            exit 1
            ;;
    esac
    
    if [ "$REBUILD" == "true" ]; then
        rebuild_flag="--build --force-recreate"
    fi
    
    log "开始部署到 $environment 环境..."
    log "使用配置文件: $compose_file"
    
    # 拉取最新镜像
    log "拉取基础镜像..."
    docker-compose -f "$compose_file" pull mongo nginx 2>/dev/null || true
    
    # 构建并启动服务
    log "构建并启动服务..."
    docker-compose -f "$compose_file" up -d $rebuild_flag
    
    # 等待服务启动
    sleep 10
    
    # 健康检查
    if health_check "http://localhost:5000/api/health" "应用服务"; then
        log_success "部署完成！"
        show_deployment_info "$environment"
    else
        log_error "部署失败，请检查日志"
        docker-compose -f "$compose_file" logs --tail=50
        exit 1
    fi
}

# 显示部署信息
show_deployment_info() {
    local environment=$1
    echo ""
    echo "🎉 部署成功完成！"
    echo ""
    echo "📋 服务信息："
    echo "  环境: $environment"
    echo "  应用地址: http://localhost:5000"
    echo "  API健康检查: http://localhost:5000/api/health"
    
    if [ "$environment" == "production" ]; then
        echo "  MongoDB: localhost:27017"
        echo "  Nginx (如果启用): http://localhost:80"
    fi
    
    echo ""
    echo "📝 常用命令："
    echo "  查看日志: docker-compose logs -f"
    echo "  停止服务: docker-compose down"
    echo "  重启服务: docker-compose restart"
    echo "  查看状态: docker-compose ps"
}

# 清理函数
clean_deployment() {
    log "清理所有容器和镜像..."
    
    # 停止所有相关容器
    docker-compose -f docker-compose.yml down -v --remove-orphans 2>/dev/null || true
    docker-compose -f docker-compose.dev.yml down -v --remove-orphans 2>/dev/null || true
    
    # 删除相关镜像
    docker images | grep storyapp | awk '{print $3}' | xargs -r docker rmi -f
    
    # 清理无用的镜像和容器
    docker system prune -f
    
    log_success "清理完成"
}

# 查看服务状态
check_status() {
    echo "🔍 检查服务状态..."
    echo ""
    
    # 检查容器状态
    echo "📦 容器状态："
    docker ps -a --filter name=storyapp --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
    echo ""
    
    # 检查镜像
    echo "🖼️ 相关镜像："
    docker images | grep -E "(storyapp|mongo|nginx)" | head -10
    echo ""
    
    # 检查网络
    echo "🌐 网络状态："
    docker network ls | grep storyapp || echo "无相关网络"
    echo ""
    
    # 健康检查
    if curl -f -s http://localhost:5000/api/health > /dev/null 2>&1; then
        log_success "应用服务运行正常"
    else
        log_error "应用服务不可访问"
    fi
}

# 查看日志
show_logs() {
    local service=${1:-app}
    echo "📋 查看 $service 服务日志..."
    docker-compose logs -f "$service"
}

# 主函数
main() {
    # 确保日志目录存在
    mkdir -p logs
    
    # 解析命令行参数
    while [[ $# -gt 0 ]]; do
        case $1 in
            -h|--help)
                show_help
                exit 0
                ;;
            -c|--clean)
                check_docker
                clean_deployment
                exit 0
                ;;
            -r|--rebuild)
                REBUILD="true"
                shift
                ;;
            -l|--logs)
                show_logs "$2"
                exit 0
                ;;
            -s|--status)
                check_status
                exit 0
                ;;
            dev|staging|production)
                ENVIRONMENT="$1"
                shift
                ;;
            *)
                log_error "未知选项: $1"
                show_help
                exit 1
                ;;
        esac
    done
    
    # 设置默认环境
    ENVIRONMENT=${ENVIRONMENT:-production}
    
    # 执行部署流程
    log "开始 $PROJECT_NAME 部署流程..."
    
    check_docker
    check_env
    setup_directories
    deploy "$ENVIRONMENT"
}

# 执行主函数
main "$@"