#!/bin/bash

# 服务器状态检查脚本
# 用于其他项目部署前快速了解资源情况

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

echo "========================================"
echo "        服务器资源状态检查报告"
echo "========================================"
echo "检查时间: $(date '+%Y-%m-%d %H:%M:%S')"
echo ""

# 1. 系统基本信息
log_info "1. 系统基本信息"
echo "----------------------------------------"
echo "操作系统: $(uname -s)"
echo "内核版本: $(uname -r)"
echo "架构: $(uname -m)"
echo "主机名: $(hostname)"
echo "运行时间: $(uptime -p 2>/dev/null || uptime)"
echo ""

# 2. CPU 使用情况
log_info "2. CPU 使用情况"
echo "----------------------------------------"
CPU_CORES=$(nproc)
CPU_USAGE=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1 2>/dev/null || echo "无法获取")
echo "CPU 核心数: $CPU_CORES"
echo "当前 CPU 使用率: $CPU_USAGE%"

if command -v lscpu &> /dev/null; then
    echo "CPU 型号: $(lscpu | grep 'Model name' | awk -F: '{print $2}' | xargs)"
fi
echo ""

# 3. 内存使用情况  
log_info "3. 内存使用情况"
echo "----------------------------------------"
if command -v free &> /dev/null; then
    free -h
    echo ""
    TOTAL_MEM=$(free -m | awk 'NR==2{printf "%.0f", $2}')
    USED_MEM=$(free -m | awk 'NR==2{printf "%.0f", $3}')
    MEM_USAGE_PERCENT=$(echo "scale=1; $USED_MEM/$TOTAL_MEM*100" | bc 2>/dev/null || echo "0")
    echo "内存使用率: ${MEM_USAGE_PERCENT}%"
else
    log_warning "无法获取内存信息"
fi
echo ""

# 4. 磁盘使用情况
log_info "4. 磁盘使用情况"
echo "----------------------------------------"
df -h | head -n 1
df -h | grep -E "^/dev/" | head -5
echo ""

# 5. 端口占用情况
log_info "5. 端口占用情况"
echo "----------------------------------------"
echo "StoryApp 相关端口:"
echo "  - 5001 (Backend): $(netstat -tlpn 2>/dev/null | grep ':5001 ' && echo '已占用' || echo '未占用')"
echo "  - 27017 (MongoDB): $(netstat -tlpn 2>/dev/null | grep ':27017 ' && echo '已占用' || echo '未占用')"
echo "  - 80 (HTTP): $(netstat -tlpn 2>/dev/null | grep ':80 ' && echo '已占用' || echo '未占用')"
echo "  - 443 (HTTPS): $(netstat -tlpn 2>/dev/null | grep ':443 ' && echo '已占用' || echo '未占用')"
echo ""

echo "预留端口范围检查:"
AVAILABLE_PORTS=()
OCCUPIED_PORTS=()

for range_start in 5011 5021 5031 5041; do
    range_end=$((range_start + 9))
    echo "  端口范围 $range_start-$range_end:"
    
    for port in $(seq $range_start $range_end); do
        if netstat -tlpn 2>/dev/null | grep ":$port " >/dev/null; then
            OCCUPIED_PORTS+=($port)
            echo "    $port: 已占用"
        else
            AVAILABLE_PORTS+=($port)
        fi
    done
    
    if [ ${#OCCUPIED_PORTS[@]} -eq 0 ]; then
        log_success "    该范围完全可用"
    fi
    echo ""
done

# 6. Docker 状态
log_info "6. Docker 容器状态"
echo "----------------------------------------"
if command -v docker &> /dev/null; then
    if docker ps &> /dev/null; then
        echo "运行中的容器:"
        docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
        echo ""
        
        echo "容器资源使用情况:"
        docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}" 2>/dev/null || log_warning "无法获取容器资源信息"
    else
        log_warning "Docker 未运行或无权限访问"
    fi
else
    log_warning "Docker 未安装"
fi
echo ""

# 7. 资源分配建议
log_info "7. 新项目资源分配建议"
echo "----------------------------------------"
if [ ${#AVAILABLE_PORTS[@]} -gt 0 ]; then
    log_success "可用端口数量: ${#AVAILABLE_PORTS[@]}"
    echo "推荐分配:"
    
    if [ ${#AVAILABLE_PORTS[@]} -ge 10 ]; then
        echo "  - 小型项目: 可分配端口 5011-5020"
    fi
    
    if [ ${#AVAILABLE_PORTS[@]} -ge 20 ]; then
        echo "  - 中型项目: 可分配端口 5021-5030"  
    fi
    
    if [ ${#AVAILABLE_PORTS[@]} -ge 30 ]; then
        echo "  - 大型项目: 可分配端口 5031-5040"
    fi
else
    log_error "没有可用端口，需要重新规划或清理现有项目"
fi

# 资源建议
if [ -n "$TOTAL_MEM" ] && [ "$TOTAL_MEM" -gt 0 ]; then
    AVAILABLE_MEM=$((TOTAL_MEM - USED_MEM))
    echo ""
    echo "内存分配建议:"
    echo "  - 当前可用内存: ${AVAILABLE_MEM}MB"
    
    if [ "$AVAILABLE_MEM" -gt 2000 ]; then
        echo "  - 可支持大型项目 (2GB内存需求)"
    elif [ "$AVAILABLE_MEM" -gt 1000 ]; then
        echo "  - 可支持中型项目 (1GB内存需求)"
    elif [ "$AVAILABLE_MEM" -gt 500 ]; then
        echo "  - 可支持小型项目 (512MB内存需求)"
    else
        log_warning "  - 可用内存不足，建议优化现有项目或增加内存"
    fi
fi
echo ""

# 8. 下一步操作建议
log_info "8. 下一步操作建议"
echo "----------------------------------------"
echo "部署新项目前请:"
echo "1. 根据以上信息选择合适的端口范围"
echo "2. 评估资源需求是否在可用范围内"  
echo "3. 参考 docs/NEW_PROJECT_DEPLOYMENT_CHECKLIST.md"
echo "4. 更新 docs/SERVER_RESOURCE_ALLOCATION.md"
echo ""

echo "========================================"
echo "           检查完成"
echo "========================================"

# 可选：将报告保存到文件
if [ "$1" = "--save" ]; then
    REPORT_FILE="/tmp/server_status_$(date +%Y%m%d_%H%M%S).txt"
    echo "正在保存报告到: $REPORT_FILE"
    $0 > "$REPORT_FILE" 2>&1
    log_success "报告已保存到: $REPORT_FILE"
fi