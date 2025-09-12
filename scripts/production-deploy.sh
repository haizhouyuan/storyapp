#!/bin/bash

# StoryApp 生产环境服务器部署脚本
# 支持完整的CI/CD流程

set -e

# 配置变量
SERVER_HOST="47.120.74.212"
SERVER_USER="root"
PROJECT_PATH="/root/projects/storyapp"
DOMAIN="storyapp.dandanbaba.xyz"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m'

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
    echo -e "${PURPLE}🚀 StoryApp 生产环境部署脚本${NC}"
    echo ""
    echo "用法: $0 [选项] [环境]"
    echo ""
    echo -e "${CYAN}环境选项:${NC}"
    echo "  staging     预发布环境部署"
    echo "  production  生产环境部署 (默认)"
    echo ""
    echo -e "${CYAN}操作选项:${NC}"
    echo "  -h, --help     显示帮助信息"
    echo "  --dry-run      模拟运行（不执行实际操作）"
    echo "  --skip-tests   跳过部署后测试"
    echo ""
    echo -e "${CYAN}示例:${NC}"
    echo "  $0                    # 生产环境部署"
    echo "  $0 staging            # 预发布环境部署"
    echo "  $0 --dry-run          # 模拟部署"
}

# 检查本地环境
check_local_environment() {
    log "检查本地环境..."
    
    # 检查是否在项目根目录
    if [[ ! -f "package.json" ]]; then
        log_error "请在项目根目录运行此脚本"
        exit 1
    fi
    
    # 检查部署脚本
    if [[ ! -f "scripts/deploy.sh" ]]; then
        log_error "未找到部署脚本: scripts/deploy.sh"
        exit 1
    fi
    
    # 检查环境配置文件
    local env=${1:-production}
    if [[ ! -f ".env.$env" ]]; then
        log_error "环境配置文件不存在: .env.$env"
        exit 1
    fi
    
    log_success "本地环境检查通过"
}

# 检查服务器连接
check_server_connection() {
    log "检查服务器连接..."
    
    if ssh -o ConnectTimeout=10 "$SERVER_USER@$SERVER_HOST" "echo '服务器连接正常'" &>/dev/null; then
        log_success "服务器连接正常"
    else
        log_error "无法连接到服务器: $SERVER_USER@$SERVER_HOST"
        log_info "请检查SSH配置和网络连接"
        exit 1
    fi
}

# 同步代码到服务器
sync_code_to_server() {
    log "同步代码到服务器..."
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY-RUN] 将同步代码到服务器"
        return 0
    fi
    
    # 创建项目目录
    ssh "$SERVER_USER@$SERVER_HOST" "mkdir -p $PROJECT_PATH"
    
    # 使用rsync同步代码
    rsync -avz --delete \
        --exclude 'node_modules' \
        --exclude '.git' \
        --exclude 'logs' \
        --exclude 'test-results' \
        --exclude 'playwright-report' \
        --exclude '.env*' \
        ./ "$SERVER_USER@$SERVER_HOST:$PROJECT_PATH/"
    
    log_success "代码同步完成"
}

# 部署到服务器
deploy_on_server() {
    local env=${1:-production}
    
    log "在服务器上部署 $env 环境..."
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY-RUN] 将在服务器上执行部署"
        return 0
    fi
    
    # 复制环境配置文件
    scp ".env.$env" "$SERVER_USER@$SERVER_HOST:$PROJECT_PATH/.env"
    
    # 在服务器上执行部署
    ssh "$SERVER_USER@$SERVER_HOST" << EOF
        cd $PROJECT_PATH
        log() { echo -e "\033[0;34m[\$(date +'%Y-%m-%d %H:%M:%S')]\033[0m \$1"; }
        log_success() { echo -e "\033[0;32m[\$(date +'%Y-%m-%d %H:%M:%S')] ✅ \$1\033[0m"; }
        log_error() { echo -e "\033[0;31m[\$(date +'%Y-%m-%d %H:%M:%S')] ❌ \$1\033[0m"; }
        
        log "开始服务器端部署..."
        
        # 给脚本添加执行权限
        chmod +x scripts/deploy.sh
        
        # 执行部署
        bash scripts/deploy.sh $env deploy
        
        if [ \$? -eq 0 ]; then
            log_success "服务器端部署完成"
        else
            log_error "服务器端部署失败"
            exit 1
        fi
EOF
    
    if [[ $? -eq 0 ]]; then
        log_success "服务器部署完成"
    else
        log_error "服务器部署失败"
        exit 1
    fi
}

# 健康检查
perform_health_check() {
    local env=${1:-production}
    local max_attempts=30
    local check_url=""
    
    case $env in
        "staging")
            check_url="http://$SERVER_HOST:5002/healthz"
            ;;
        "production")
            check_url="https://$DOMAIN/healthz"
            ;;
    esac
    
    log "执行健康检查: $check_url"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY-RUN] 将执行健康检查"
        return 0
    fi
    
    # 等待服务启动
    sleep 30
    
    for ((i=1; i<=max_attempts; i++)); do
        if curl -f -s "$check_url" > /dev/null 2>&1; then
            log_success "健康检查通过 ($i/$max_attempts)"
            return 0
        fi
        
        if [[ $i -eq $max_attempts ]]; then
            log_error "健康检查失败，已尝试 $max_attempts 次"
            return 1
        fi
        
        log "健康检查尝试 $i/$max_attempts 失败，等待10秒后重试..."
        sleep 10
    done
}

# 部署后测试
run_post_deploy_tests() {
    local env=${1:-production}
    
    if [[ "$SKIP_TESTS" == "true" ]]; then
        log_warning "跳过部署后测试"
        return 0
    fi
    
    log "执行部署后测试..."
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY-RUN] 将执行部署后测试"
        return 0
    fi
    
    case $env in
        "staging")
            TEST_URL="http://$SERVER_HOST:5002"
            ;;
        "production")
            TEST_URL="https://$DOMAIN"
            ;;
    esac
    
    # API基础测试
    if curl -f "$TEST_URL/api/health" > /dev/null 2>&1; then
        log_success "API健康检查测试通过"
    else
        log_error "API健康检查测试失败"
        return 1
    fi
    
    # 故事生成API测试（如果有API key）
    if curl -f -X POST "$TEST_URL/api/generate-story" \
        -H "Content-Type: application/json" \
        -d '{"topic":"测试故事","maxChoices":3}' > /dev/null 2>&1; then
        log_success "故事生成API测试通过"
    else
        log_warning "故事生成API测试失败（可能是API配置问题）"
    fi
    
    log_success "部署后测试完成"
}

# 显示部署结果
show_deployment_result() {
    local env=${1:-production}
    
    echo ""
    echo -e "${PURPLE}🎉 部署成功完成！${NC}"
    echo ""
    echo -e "${CYAN}📋 服务信息:${NC}"
    echo "  环境: $env"
    
    case $env in
        "staging")
            echo "  应用地址: http://$SERVER_HOST:5002"
            echo "  API地址: http://$SERVER_HOST:5002/api"
            echo "  健康检查: http://$SERVER_HOST:5002/healthz"
            ;;
        "production")
            echo "  应用地址: https://$DOMAIN"
            echo "  API地址: https://$DOMAIN/api"
            echo "  健康检查: https://$DOMAIN/healthz"
            ;;
    esac
    
    echo ""
    echo -e "${CYAN}📝 服务器管理命令:${NC}"
    echo "  查看服务状态: ssh $SERVER_USER@$SERVER_HOST 'cd $PROJECT_PATH && bash scripts/deploy.sh $env ps'"
    echo "  查看日志: ssh $SERVER_USER@$SERVER_HOST 'cd $PROJECT_PATH && bash scripts/deploy.sh $env logs'"
    echo "  重启服务: ssh $SERVER_USER@$SERVER_HOST 'cd $PROJECT_PATH && bash scripts/deploy.sh $env up'"
    echo ""
    echo -e "${GREEN}🚀 StoryApp已成功部署到$env环境！${NC}"
}

# 主函数
main() {
    local environment="production"
    local dry_run=false
    local skip_tests=false
    
    # 解析命令行参数
    while [[ $# -gt 0 ]]; do
        case $1 in
            -h|--help)
                show_help
                exit 0
                ;;
            --dry-run)
                DRY_RUN="true"
                dry_run=true
                shift
                ;;
            --skip-tests)
                SKIP_TESTS="true"
                skip_tests=true
                shift
                ;;
            staging|production)
                environment="$1"
                shift
                ;;
            *)
                log_error "未知选项: $1"
                show_help
                exit 1
                ;;
        esac
    done
    
    echo -e "${PURPLE}🚀 StoryApp 生产环境部署脚本${NC}"
    echo ""
    log "开始部署流程..."
    log "环境: $environment"
    if [[ "$dry_run" == "true" ]]; then
        log_info "模拟运行模式 (DRY-RUN)"
    fi
    if [[ "$skip_tests" == "true" ]]; then
        log_info "跳过部署后测试"
    fi
    echo ""
    
    # 执行部署流程
    check_local_environment "$environment"
    check_server_connection
    sync_code_to_server
    deploy_on_server "$environment"
    
    if perform_health_check "$environment"; then
        run_post_deploy_tests "$environment"
        show_deployment_result "$environment"
    else
        log_error "健康检查失败，请检查服务器日志"
        echo "服务器日志查看命令:"
        echo "  ssh $SERVER_USER@$SERVER_HOST 'cd $PROJECT_PATH && bash scripts/deploy.sh $environment logs'"
        exit 1
    fi
}

# 执行主函数
main "$@"