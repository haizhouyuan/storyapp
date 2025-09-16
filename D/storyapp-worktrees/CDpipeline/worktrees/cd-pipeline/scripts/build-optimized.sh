#!/bin/bash
# Docker优化构建脚本 - 支持缓存和多阶段构建

set -e

# 配置
IMAGE_NAME="${IMAGE_NAME:-storyapp}"
BUILD_CONTEXT="${BUILD_CONTEXT:-.}"
DOCKERFILE="${DOCKERFILE:-Dockerfile.optimized}"
REGISTRY="${REGISTRY:-}"
TAG="${TAG:-latest}"
BUILDER_TAG="${BUILDER_TAG:-builder}"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log() {
    echo -e "${GREEN}[BUILD]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

# 检查Docker和BuildKit
check_prerequisites() {
    log "检查构建环境..."
    
    if ! command -v docker &> /dev/null; then
        error "Docker未安装或不在PATH中"
        exit 1
    fi
    
    # 启用BuildKit
    export DOCKER_BUILDKIT=1
    export COMPOSE_DOCKER_CLI_BUILD=1
    
    # 检查BuildKit支持
    if ! docker buildx version &> /dev/null; then
        warn "BuildKit不可用，将使用传统构建方式"
        BUILDKIT_AVAILABLE=false
    else
        info "BuildKit可用，启用高级缓存功能"
        BUILDKIT_AVAILABLE=true
    fi
}

# 清理构建缓存
clean_cache() {
    log "清理Docker构建缓存..."
    docker system prune -f --volumes
    docker builder prune -f
}

# 构建镜像
build_image() {
    log "开始构建Docker镜像..."
    
    # 基础构建参数
    BUILD_ARGS=(
        "--file" "$DOCKERFILE"
        "--tag" "${IMAGE_NAME}:${TAG}"
    )
    
    # 如果有registry，添加完整标签
    if [ -n "$REGISTRY" ]; then
        BUILD_ARGS+=("--tag" "${REGISTRY}/${IMAGE_NAME}:${TAG}")
    fi
    
    # BuildKit优化构建
    if [ "$BUILDKIT_AVAILABLE" = true ]; then
        log "使用BuildKit进行优化构建..."
        
        # 缓存配置
        CACHE_FROM="type=local,src=/tmp/.buildx-cache"
        CACHE_TO="type=local,dest=/tmp/.buildx-cache-new,mode=max"
        
        # 创建缓存目录
        mkdir -p /tmp/.buildx-cache
        
        # 使用buildx构建
        docker buildx build \
            --cache-from "$CACHE_FROM" \
            --cache-to "$CACHE_TO" \
            --platform linux/amd64 \
            --load \
            "${BUILD_ARGS[@]}" \
            "$BUILD_CONTEXT"
        
        # 替换缓存（避免缓存无限增长）
        rm -rf /tmp/.buildx-cache
        mv /tmp/.buildx-cache-new /tmp/.buildx-cache || true
        
    else
        log "使用传统Docker构建..."
        
        # 传统构建，使用镜像缓存
        BUILD_ARGS+=("--cache-from" "${IMAGE_NAME}:${TAG}")
        BUILD_ARGS+=("--cache-from" "${IMAGE_NAME}:${BUILDER_TAG}")
        
        docker build "${BUILD_ARGS[@]}" "$BUILD_CONTEXT"
    fi
}

# 构建统计
show_build_stats() {
    log "构建统计信息:"
    
    # 镜像大小
    local image_size=$(docker images "${IMAGE_NAME}:${TAG}" --format "table {{.Size}}" | tail -n +2)
    info "最终镜像大小: $image_size"
    
    # 镜像层数
    local layers=$(docker history "${IMAGE_NAME}:${TAG}" --quiet | wc -l)
    info "镜像层数: $layers"
    
    # 构建时间
    info "构建完成时间: $(date)"
}

# 运行构建测试
test_build() {
    log "测试构建的镜像..."
    
    # 创建临时容器进行健康检查
    local container_id=$(docker run -d \
        --name "${IMAGE_NAME}-test" \
        --env NODE_ENV=production \
        --env DEEPSEEK_API_KEY=test-key \
        --env MONGODB_URI=mongodb://localhost:27017/test \
        "${IMAGE_NAME}:${TAG}")
    
    # 等待容器启动
    sleep 10
    
    # 检查容器状态
    if docker ps --filter "id=$container_id" --filter "status=running" | grep -q "$container_id"; then
        log "✅ 镜像构建成功，容器运行正常"
    else
        error "❌ 容器启动失败"
        docker logs "$container_id"
        docker rm -f "$container_id" || true
        exit 1
    fi
    
    # 清理测试容器
    docker rm -f "$container_id" || true
}

# 推送镜像
push_image() {
    if [ -n "$REGISTRY" ]; then
        log "推送镜像到仓库: ${REGISTRY}/${IMAGE_NAME}:${TAG}"
        docker push "${REGISTRY}/${IMAGE_NAME}:${TAG}"
    else
        info "未配置仓库，跳过推送"
    fi
}

# 主函数
main() {
    log "Docker优化构建脚本启动"
    log "镜像名称: ${IMAGE_NAME}:${TAG}"
    log "Dockerfile: $DOCKERFILE"
    
    # 解析命令行参数
    while [[ $# -gt 0 ]]; do
        case $1 in
            --clean)
                clean_cache
                shift
                ;;
            --test)
                TEST_BUILD=true
                shift
                ;;
            --push)
                PUSH_IMAGE=true
                shift
                ;;
            --registry)
                REGISTRY="$2"
                shift 2
                ;;
            --tag)
                TAG="$2"
                shift 2
                ;;
            --help)
                echo "用法: $0 [选项]"
                echo "选项:"
                echo "  --clean          清理构建缓存"
                echo "  --test           构建后测试镜像"
                echo "  --push           推送到仓库"
                echo "  --registry REG   指定仓库地址"
                echo "  --tag TAG        指定镜像标签"
                echo "  --help           显示帮助信息"
                exit 0
                ;;
            *)
                error "未知参数: $1"
                exit 1
                ;;
        esac
    done
    
    # 执行构建流程
    check_prerequisites
    build_image
    show_build_stats
    
    # 可选步骤
    if [ "$TEST_BUILD" = true ]; then
        test_build
    fi
    
    if [ "$PUSH_IMAGE" = true ]; then
        push_image
    fi
    
    log "🎉 构建完成！"
    log "使用以下命令运行容器:"
    log "docker run -d -p 5001:5000 --name storyapp ${IMAGE_NAME}:${TAG}"
}

# 错误处理
trap 'error "构建过程中发生错误，退出代码: $?"' ERR

# 运行主函数
main "$@"