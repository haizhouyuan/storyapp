#!/bin/bash

# StoryApp 统一部署脚本
# 支持多环境部署：dev/test/staging/production
# 支持本地开发、CI/CD、服务器部署

set -e

# 脚本配置
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
PROJECT_NAME="storyapp"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# 日志函数
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] ✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] ⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ❌ $1${NC}"
}

log_info() {
    echo -e "${CYAN}[$(date +'%Y-%m-%d %H:%M:%S')] ℹ️  $1${NC}"
}

# 显示帮助信息
show_help() {
    echo -e "${PURPLE}🚀 StoryApp 多环境容器化部署脚本${NC}"
    echo ""
    echo "用法: $0 [选项] [环境] [操作]"
    echo ""
    echo -e "${CYAN}环境选项:${NC}"
    echo "  dev         本地开发环境 (热重载)"
    echo "  test        CI/CD测试环境 (自动化测试)"
    echo "  staging     预发布环境 (服务器测试)"
    echo "  production  生产环境 (正式部署)"
    echo ""
    echo -e "${CYAN}操作选项:${NC}"
    echo "  up          启动服务 (默认)"
    echo "  down        停止服务"
    echo "  build       重新构建镜像"
    echo "  logs        查看日志"
    echo "  ps          查看服务状态"
    echo "  clean       清理所有容器和镜像"
    echo "  test        运行测试"
    echo "  deploy      完整部署流程"
    echo ""
    echo -e "${CYAN}高级选项:${NC}"
    echo "  -h, --help     显示帮助信息"
    echo "  -v, --verbose  详细输出"
    echo "  --no-cache     构建时不使用缓存"
    echo "  --pull         构建前拉取最新基础镜像"
    echo "  --profile      启用特定profile（如nginx、monitoring）"
    echo ""
    echo -e "${CYAN}示例:${NC}"
    echo "  $0 dev                    # 启动开发环境"
    echo "  $0 production deploy      # 生产环境完整部署"
    echo "  $0 test --profile e2e     # 运行E2E测试"
    echo "  $0 staging up --pull      # 预发布环境部署（拉取最新镜像）"
    echo ""
    echo -e "${CYAN}环境配置文件:${NC}"
    echo "  .env.dev       开发环境配置"
    echo "  .env.test      测试环境配置" 
    echo "  .env.staging   预发布环境配置"
    echo "  .env.production 生产环境配置"
}

# 检查依赖
check_dependencies() {
    log "检查运行环境依赖..."
    
    # 检查Docker
    if ! command -v docker &> /dev/null; then
        log_error "Docker未安装，请先安装Docker"
        exit 1
    fi
    
    # 检查Docker Compose
    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null 2>&1; then
        log_error "Docker Compose未安装，请先安装Docker Compose"
        exit 1
    fi
    
    # 确定使用的compose命令
    if docker compose version &> /dev/null 2>&1; then
        COMPOSE_CMD="docker compose"
    else
        COMPOSE_CMD="docker-compose"
    fi
    
    # 检查Docker是否运行
    if ! docker info &> /dev/null; then
        log_error "Docker未运行，请启动Docker服务"
        exit 1
    fi
    
    log_success "运行环境检查通过"
}

# 环境配置映射
get_env_config() {
    local env=$1
    case $env in
        "dev"|"development")
            echo "dev"
            ;;
        "test"|"testing")
            echo "test"
            ;;
        "staging"|"stage")
            echo "staging"
            ;;
        "prod"|"production")
            echo "production"
            ;;
        *)
            log_error "无效的环境: $env"
            echo "支持的环境: dev, test, staging, production"
            exit 1
            ;;
    esac
}

# 获取compose文件
get_compose_files() {
    local env=$1
    local base_file="$PROJECT_ROOT/ops/compose/docker-compose.base.yml"
    local env_file="$PROJECT_ROOT/ops/compose/docker-compose.$env.yml"
    
    if [[ ! -f "$base_file" ]]; then
        log_error "基础配置文件不存在: $base_file"
        exit 1
    fi
    
    if [[ ! -f "$env_file" ]]; then
        log_error "环境配置文件不存在: $env_file"
        exit 1
    fi
    
    echo "-f $base_file -f $env_file"
}

# 检查环境配置
check_env_config() {
    local env=$1
    local env_file="$PROJECT_ROOT/.env.$env"
    
    # 检查环境变量文件
    if [[ -f "$env_file" ]]; then
        log_info "使用环境配置文件: $env_file"
        export $(cat "$env_file" | grep -v '^#' | xargs) 2>/dev/null || true
    else
        log_warning "环境配置文件不存在: $env_file"
    fi
    
    # 检查必要的环境变量
    if [[ "$env" == "production" ]] || [[ "$env" == "staging" ]]; then
        if [[ -z "$DEEPSEEK_API_KEY" ]]; then
            log_error "生产/预发布环境必须设置 DEEPSEEK_API_KEY"
            exit 1
        fi
        if [[ "$DEEPSEEK_API_KEY" == "your_deepseek_api_key_here" ]]; then
            log_error "请配置真实的 DEEPSEEK_API_KEY"
            exit 1
        fi
    fi
}

# 健康检查
health_check() {
    local env=$1
    local max_attempts=${2:-30}
    local check_url=""
    
    case $env in
        "dev")
            check_url="http://localhost:5000/healthz"
            ;;
        "test")
            check_url="http://localhost:5001/healthz"
            ;;
        "staging")
            check_url="http://localhost:5002/healthz"
            ;;
        "production")
            check_url="http://localhost/healthz"
            ;;
    esac
    
    log "健康检查: $check_url"
    
    for ((i=1; i<=max_attempts; i++)); do
        if curl -f -s "$check_url" > /dev/null 2>&1; then
            log_success "健康检查通过 ($i/$max_attempts)"
            return 0
        fi
        
        if [[ $i -eq $max_attempts ]]; then
            log_error "健康检查失败，已尝试 $max_attempts 次"
            return 1
        fi
        
        log "健康检查尝试 $i/$max_attempts 失败，等待5秒后重试..."
        sleep 5
    done
}

# 构建镜像
build_images() {
    local env=$1
    local compose_files=$2
    local build_args=""
    
    if [[ "$NO_CACHE" == "true" ]]; then
        build_args="$build_args --no-cache"
    fi
    
    if [[ "$PULL" == "true" ]]; then
        build_args="$build_args --pull"
    fi
    
    log "构建镜像 (环境: $env)"
    $COMPOSE_CMD $compose_files build $build_args
    
    log_success "镜像构建完成"
}

# 启动服务
start_services() {
    local env=$1
    local compose_files=$2
    local profile_args=""
    
    if [[ -n "$PROFILE" ]]; then
        profile_args="--profile $PROFILE"
    fi
    
    log "启动服务 (环境: $env)"
    $COMPOSE_CMD $compose_files up -d $profile_args
    
    # 等待服务启动
    sleep 10
    
    # 健康检查
    if health_check "$env"; then
        log_success "服务启动完成"
        show_service_info "$env"
    else
        log_error "服务启动失败"
        $COMPOSE_CMD $compose_files logs --tail=50
        exit 1
    fi
}

# 停止服务
stop_services() {
    local compose_files=$1
    
    log "停止服务..."
    $COMPOSE_CMD $compose_files down
    log_success "服务已停止"
}

# 查看日志
show_logs() {
    local compose_files=$1
    local service=${2:-""}
    
    if [[ -n "$service" ]]; then
        $COMPOSE_CMD $compose_files logs -f "$service"
    else
        $COMPOSE_CMD $compose_files logs -f
    fi
}

# 查看服务状态
show_status() {
    local compose_files=$1
    
    echo ""
    log_info "服务状态:"
    $COMPOSE_CMD $compose_files ps
    
    echo ""
    log_info "镜像信息:"
    docker images | grep -E "(storyapp|mongo|nginx)" | head -10
    
    echo ""
    log_info "网络信息:"
    docker network ls | grep storyapp || echo "无相关网络"
}

# 清理环境
clean_environment() {
    log "清理环境..."
    
    # 停止所有相关容器
    docker ps -a --filter name=storyapp --format "table {{.Names}}" | tail -n +2 | xargs -r docker stop
    docker ps -a --filter name=storyapp --format "table {{.Names}}" | tail -n +2 | xargs -r docker rm
    
    # 删除相关镜像
    docker images | grep storyapp | awk '{print $3}' | xargs -r docker rmi -f
    
    # 清理无用资源
    docker system prune -f --volumes
    
    log_success "环境清理完成"
}

# 运行测试
run_tests() {
    local env=$1
    local compose_files=$2
    
    case $env in
        "test")
            log "运行单元测试和集成测试..."
            $COMPOSE_CMD $compose_files --profile e2e up --abort-on-container-exit
            ;;
        "dev")
            log "运行开发环境测试..."
            npm run test
            ;;
        *)
            log_warning "当前环境不支持自动化测试"
            ;;
    esac
}

# 完整部署流程
full_deploy() {
    local env=$1
    local compose_files=$2
    
    log "开始完整部署流程 (环境: $env)"
    
    # 构建镜像
    build_images "$env" "$compose_files"
    
    # 启动服务
    start_services "$env" "$compose_files"
    
    # 运行测试（测试环境）
    if [[ "$env" == "test" ]]; then
        run_tests "$env" "$compose_files"
    fi
    
    log_success "部署完成!"
}

# 显示服务信息
show_service_info() {
    local env=$1
    
    echo ""
    echo -e "${PURPLE}🎉 部署成功完成！${NC}"
    echo ""
    echo -e "${CYAN}📋 服务信息:${NC}"
    echo "  环境: $env"
    
    case $env in
        "dev")
            echo "  应用地址: http://localhost:5000"
            echo "  API地址: http://localhost:5000/api"
            echo "  健康检查: http://localhost:5000/healthz"
            echo "  MongoDB: localhost:27017 (dev_user/dev_pass123)"
            ;;
        "test")
            echo "  应用地址: http://localhost:5001"
            echo "  API地址: http://localhost:5001/api"
            echo "  健康检查: http://localhost:5001/healthz"
            echo "  MongoDB: localhost:27018 (test_user/test_pass123)"
            ;;
        "staging")
            echo "  应用地址: http://localhost:5002"
            echo "  API地址: http://localhost:5002/api"
            echo "  健康检查: http://localhost:5002/healthz"
            echo "  Web地址: http://localhost:8080 (如果启用nginx)"
            ;;
        "production")
            echo "  应用地址: https://storyapp.dandanbaba.xyz"
            echo "  API地址: https://storyapp.dandanbaba.xyz/api"
            echo "  健康检查: https://storyapp.dandanbaba.xyz/healthz"
            ;;
    esac
    
    echo ""
    echo -e "${CYAN}📝 常用命令:${NC}"
    echo "  查看日志: $0 $env logs"
    echo "  查看状态: $0 $env ps"
    echo "  停止服务: $0 $env down"
    echo "  重启服务: $0 $env up"
}

# 主函数
main() {
    local environment=""
    local operation="up"
    local verbose=false
    
    # 解析命令行参数
    while [[ $# -gt 0 ]]; do
        case $1 in
            -h|--help)
                show_help
                exit 0
                ;;
            -v|--verbose)
                verbose=true
                set -x
                shift
                ;;
            --no-cache)
                NO_CACHE="true"
                shift
                ;;
            --pull)
                PULL="true"
                shift
                ;;
            --profile)
                PROFILE="$2"
                shift 2
                ;;
            dev|test|staging|production)
                environment=$(get_env_config "$1")
                shift
                ;;
            up|down|build|logs|ps|clean|test|deploy)
                operation="$1"
                shift
                ;;
            *)
                log_error "未知选项: $1"
                show_help
                exit 1
                ;;
        esac
    done
    
    # 默认环境
    if [[ -z "$environment" ]]; then
        environment="dev"
        log_info "未指定环境，使用默认环境: $environment"
    fi
    
    # 切换到项目根目录
    cd "$PROJECT_ROOT"
    
    log "StoryApp 部署脚本启动"
    log "环境: $environment, 操作: $operation"
    
    # 检查依赖
    check_dependencies
    
    # 检查环境配置
    check_env_config "$environment"
    
    # 获取compose文件
    local compose_files=$(get_compose_files "$environment")
    
    # 执行操作
    case $operation in
        "up")
            start_services "$environment" "$compose_files"
            ;;
        "down")
            stop_services "$compose_files"
            ;;
        "build")
            build_images "$environment" "$compose_files"
            ;;
        "logs")
            show_logs "$compose_files" "$2"
            ;;
        "ps")
            show_status "$compose_files"
            ;;
        "clean")
            clean_environment
            ;;
        "test")
            run_tests "$environment" "$compose_files"
            ;;
        "deploy")
            full_deploy "$environment" "$compose_files"
            ;;
        *)
            log_error "无效的操作: $operation"
            show_help
            exit 1
            ;;
    esac
}

# 执行主函数
main "$@"