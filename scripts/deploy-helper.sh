#!/bin/bash

# StoryApp 部署助手脚本
# 用于简化生产环境部署操作

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 日志函数
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 配置
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
COMPOSE_FILE="$PROJECT_ROOT/docker-compose.yml"
COMPOSE_PROD_FILE="$PROJECT_ROOT/docker-compose.prod.yml"
ENV_FILE="$PROJECT_ROOT/.env.prod"

# 检查必要文件
check_prerequisites() {
    log_info "检查部署前置条件..."
    
    local missing_files=()
    
    if [[ ! -f "$COMPOSE_FILE" ]]; then
        missing_files+=("docker-compose.yml")
    fi
    
    if [[ ! -f "$COMPOSE_PROD_FILE" ]]; then
        missing_files+=("docker-compose.prod.yml")
    fi
    
    if [[ ! -f "$ENV_FILE" ]]; then
        log_warning ".env.prod 文件不存在，请根据 .env.prod.example 创建"
        missing_files+=(".env.prod")
    fi
    
    if [[ ${#missing_files[@]} -gt 0 ]]; then
        log_error "缺少必要文件: ${missing_files[*]}"
        return 1
    fi
    
    # 检查Docker
    if ! command -v docker &> /dev/null; then
        log_error "Docker 未安装"
        return 1
    fi
    
    # 检查Docker Compose
    if ! docker compose version &> /dev/null; then
        log_error "Docker Compose 未安装或版本过低"
        return 1
    fi
    
    log_success "前置条件检查通过"
}

# 显示当前状态
show_status() {
    log_info "当前部署状态:"
    echo "----------------------------------------"
    
    if docker compose -f "$COMPOSE_FILE" -f "$COMPOSE_PROD_FILE" ps | grep -q "Up"; then
        docker compose -f "$COMPOSE_FILE" -f "$COMPOSE_PROD_FILE" ps
        echo "----------------------------------------"
        
        # 显示当前镜像
        log_info "当前运行的镜像:"
        docker inspect storyapp-app 2>/dev/null | jq -r '.[0].Config.Image' || echo "无法获取镜像信息"
        
        # 健康检查
        log_info "执行健康检查..."
        if curl -f -s http://localhost:5001/api/health > /dev/null; then
            log_success "应用健康检查通过"
        else
            log_warning "应用健康检查失败"
        fi
    else
        log_warning "没有运行的容器"
    fi
}

# 部署新版本
deploy() {
    local image_tag=${1:-"main"}
    local image_url="ghcr.io/haizhouyuan/storyapp:${image_tag}"
    
    log_info "开始部署新版本: $image_tag"
    
    # 备份当前状态
    local backup_dir="/tmp/storyapp_backup_$(date +%Y%m%d_%H%M%S)"
    mkdir -p "$backup_dir"
    
    if docker compose -f "$COMPOSE_FILE" -f "$COMPOSE_PROD_FILE" ps | grep -q "Up"; then
        log_info "备份当前状态到: $backup_dir"
        docker compose -f "$COMPOSE_FILE" -f "$COMPOSE_PROD_FILE" ps > "$backup_dir/containers.txt"
        docker inspect storyapp-app 2>/dev/null | jq -r '.[0].Config.Image' > "$backup_dir/current_image.txt" || echo "unknown" > "$backup_dir/current_image.txt"
    fi
    
    # 拉取新镜像
    log_info "拉取镜像: $image_url"
    docker pull "$image_url"
    
    # 设置环境变量
    export DOCKER_IMAGE="$image_url"
    
    # 停止旧服务
    log_info "停止旧版本服务..."
    docker compose -f "$COMPOSE_FILE" -f "$COMPOSE_PROD_FILE" stop app || true
    
    # 启动新服务
    log_info "启动新版本服务..."
    docker compose -f "$COMPOSE_FILE" -f "$COMPOSE_PROD_FILE" up -d app
    
    # 等待启动
    log_info "等待服务启动..."
    sleep 20
    
    # 健康检查
    log_info "执行健康检查..."
    local health_check_passed=false
    for i in {1..6}; do
        if curl -f -s http://localhost:5001/api/health > /dev/null; then
            log_success "健康检查通过 (尝试 $i)"
            health_check_passed=true
            break
        else
            log_warning "健康检查失败，等待重试... (尝试 $i/6)"
            sleep 10
        fi
    done
    
    if [[ "$health_check_passed" == false ]]; then
        log_error "部署失败：健康检查未通过"
        
        # 尝试回滚
        if [[ -f "$backup_dir/current_image.txt" ]]; then
            local previous_image=$(cat "$backup_dir/current_image.txt")
            if [[ "$previous_image" != "unknown" ]]; then
                log_info "尝试回滚到之前版本: $previous_image"
                export DOCKER_IMAGE="$previous_image"
                docker compose -f "$COMPOSE_FILE" -f "$COMPOSE_PROD_FILE" up -d app
                sleep 15
                if curl -f -s http://localhost:5001/api/health > /dev/null; then
                    log_success "已回滚到之前版本"
                else
                    log_error "回滚失败，需要手动处理"
                fi
            fi
        fi
        return 1
    fi
    
    log_success "部署完成！新版本: $image_tag"
    
    # 清理旧镜像
    log_info "清理旧镜像..."
    docker images --format "table {{.Repository}}:{{.Tag}}\t{{.CreatedAt}}" | \
        grep "ghcr.io/haizhouyuan/storyapp" | \
        tail -n +4 | \
        awk '{print $1}' | \
        xargs -r docker rmi 2>/dev/null || log_warning "清理旧镜像时出现警告"
}

# 回滚到指定版本
rollback() {
    local target_tag=${1}
    
    if [[ -z "$target_tag" ]]; then
        log_error "请指定回滚目标标签"
        return 1
    fi
    
    log_info "开始回滚到版本: $target_tag"
    deploy "$target_tag"
}

# 查看日志
show_logs() {
    local service=${1:-"app"}
    local lines=${2:-"100"}
    
    log_info "显示 $service 服务最近 $lines 行日志:"
    docker compose -f "$COMPOSE_FILE" -f "$COMPOSE_PROD_FILE" logs --tail="$lines" -f "$service"
}

# 执行维护模式
maintenance_mode() {
    local action=${1:-"status"}
    
    case "$action" in
        "on")
            log_info "启用维护模式..."
            docker compose -f "$COMPOSE_FILE" -f "$COMPOSE_PROD_FILE" stop app
            log_success "维护模式已启用，应用已停止"
            ;;
        "off")
            log_info "禁用维护模式..."
            docker compose -f "$COMPOSE_FILE" -f "$COMPOSE_PROD_FILE" up -d app
            log_success "维护模式已禁用，应用已启动"
            ;;
        "status")
            if docker compose -f "$COMPOSE_FILE" -f "$COMPOSE_PROD_FILE" ps app | grep -q "Up"; then
                log_info "维护模式: OFF (应用正在运行)"
            else
                log_info "维护模式: ON (应用已停止)"
            fi
            ;;
        *)
            log_error "未知的维护模式操作: $action"
            log_info "可用操作: on, off, status"
            return 1
            ;;
    esac
}

# 备份数据
backup_data() {
    local backup_dir="/root/backups/storyapp/$(date +%Y%m%d_%H%M%S)"
    
    log_info "创建数据备份到: $backup_dir"
    mkdir -p "$backup_dir"
    
    # 备份MongoDB数据
    if docker compose -f "$COMPOSE_FILE" -f "$COMPOSE_PROD_FILE" ps mongo | grep -q "Up"; then
        log_info "备份MongoDB数据..."
        docker compose -f "$COMPOSE_FILE" -f "$COMPOSE_PROD_FILE" exec -T mongo mongodump --out /backup
        docker cp storyapp-mongo:/backup "$backup_dir/mongodb"
        log_success "MongoDB备份完成"
    else
        log_warning "MongoDB容器未运行，跳过数据备份"
    fi
    
    # 备份配置文件
    log_info "备份配置文件..."
    cp "$ENV_FILE" "$backup_dir/env.backup" 2>/dev/null || log_warning "环境配置文件备份失败"
    cp "$COMPOSE_FILE" "$backup_dir/" 2>/dev/null || true
    cp "$COMPOSE_PROD_FILE" "$backup_dir/" 2>/dev/null || true
    
    log_success "备份完成: $backup_dir"
}

# 显示帮助信息
show_help() {
    echo "StoryApp 部署助手"
    echo ""
    echo "用法: $0 <命令> [参数]"
    echo ""
    echo "命令:"
    echo "  status                     显示当前部署状态"
    echo "  deploy [tag]              部署指定版本 (默认: main)"
    echo "  rollback <tag>            回滚到指定版本"
    echo "  logs [service] [lines]    查看服务日志 (默认: app, 100行)"
    echo "  maintenance <on|off>      维护模式开关"
    echo "  backup                    备份数据和配置"
    echo "  check                     检查部署前置条件"
    echo "  help                      显示此帮助信息"
    echo ""
    echo "示例:"
    echo "  $0 status                 # 查看当前状态"
    echo "  $0 deploy latest          # 部署最新版本"
    echo "  $0 rollback v1.0.0        # 回滚到v1.0.0"
    echo "  $0 logs app 50            # 查看app服务最近50行日志"
    echo "  $0 maintenance on         # 启用维护模式"
    echo "  $0 backup                 # 创建数据备份"
}

# 主函数
main() {
    local command=${1:-"help"}
    
    case "$command" in
        "status")
            check_prerequisites && show_status
            ;;
        "deploy")
            check_prerequisites && deploy "${2:-main}"
            ;;
        "rollback")
            check_prerequisites && rollback "$2"
            ;;
        "logs")
            show_logs "$2" "$3"
            ;;
        "maintenance")
            maintenance_mode "$2"
            ;;
        "backup")
            backup_data
            ;;
        "check")
            check_prerequisites
            ;;
        "help"|"--help"|"-h")
            show_help
            ;;
        *)
            log_error "未知命令: $command"
            show_help
            exit 1
            ;;
    esac
}

# 执行主函数
main "$@"