#!/bin/bash

# 项目协调工具 - 管理多项目部署分配
# 使用方法: ./project-coordinator.sh <command> [options]

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 配置文件路径
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
ALLOCATION_FILE="$PROJECT_ROOT/docs/SERVER_RESOURCE_ALLOCATION.md"
PROJECTS_DB="/tmp/projects_allocation.json"

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

# 初始化项目数据库
init_db() {
    if [[ ! -f "$PROJECTS_DB" ]]; then
        cat > "$PROJECTS_DB" << 'EOF'
{
  "projects": {
    "storyapp": {
      "name": "StoryApp",
      "status": "active",
      "ports": "5001,27017",
      "port_range": "5001-5010",
      "domain": "storyapp.dandanbaba.xyz",
      "resources": {
        "cpu_limit": "1.0",
        "memory_limit": "1G",
        "cpu_reservation": "0.5",
        "memory_reservation": "512M"
      },
      "deploy_date": "2025-09-13",
      "maintainer": "系统管理员"
    }
  },
  "port_ranges": {
    "5001-5010": "storyapp",
    "5011-5020": "available",
    "5021-5030": "available", 
    "5031-5040": "available",
    "5041-5050": "available"
  },
  "domains": {
    "storyapp.dandanbaba.xyz": "storyapp",
    "project2.dandanbaba.xyz": "available",
    "project3.dandanbaba.xyz": "available",
    "api.dandanbaba.xyz": "available"
  }
}
EOF
        log_success "项目数据库已初始化"
    fi
}

# 显示当前分配状态
show_allocation() {
    init_db
    
    echo "========================================"
    echo "        当前项目分配状态"
    echo "========================================"
    echo ""
    
    log_info "项目列表:"
    echo "----------------------------------------"
    jq -r '.projects | to_entries[] | "项目: \(.key) | 状态: \(.value.status) | 端口: \(.value.ports) | 域名: \(.value.domain)"' "$PROJECTS_DB"
    echo ""
    
    log_info "端口范围分配:"
    echo "----------------------------------------"
    jq -r '.port_ranges | to_entries[] | "范围: \(.key) | 状态: \(.value)"' "$PROJECTS_DB"
    echo ""
    
    log_info "域名分配:"
    echo "----------------------------------------"
    jq -r '.domains | to_entries[] | "域名: \(.key) | 分配给: \(.value)"' "$PROJECTS_DB"
    echo ""
}

# 申请新项目
request_project() {
    local project_name="$1"
    local port_range="$2"
    local domain="$3"
    local cpu_limit="$4"
    local memory_limit="$5"
    
    if [[ -z "$project_name" || -z "$port_range" ]]; then
        log_error "使用方法: $0 request <项目名> <端口范围> [域名] [CPU限制] [内存限制]"
        echo "例子: $0 request myproject 5011-5020 myproject.dandanbaba.xyz 0.5 512M"
        return 1
    fi
    
    init_db
    
    # 检查端口范围是否可用
    local range_status=$(jq -r ".port_ranges[\"$port_range\"]" "$PROJECTS_DB")
    if [[ "$range_status" != "available" && "$range_status" != "null" ]]; then
        log_error "端口范围 $port_range 不可用，当前状态: $range_status"
        return 1
    fi
    
    # 检查域名是否可用
    if [[ -n "$domain" ]]; then
        local domain_status=$(jq -r ".domains[\"$domain\"]" "$PROJECTS_DB")
        if [[ "$domain_status" != "available" && "$domain_status" != "null" ]]; then
            log_error "域名 $domain 不可用，当前状态: $domain_status"
            return 1
        fi
    fi
    
    # 默认值
    cpu_limit=${cpu_limit:-"0.5"}
    memory_limit=${memory_limit:-"512M"}
    domain=${domain:-"${project_name}.dandanbaba.xyz"}
    
    # 更新数据库
    local temp_file=$(mktemp)
    jq ".projects[\"$project_name\"] = {
        \"name\": \"$project_name\",
        \"status\": \"requested\",
        \"ports\": \"pending\",
        \"port_range\": \"$port_range\",
        \"domain\": \"$domain\",
        \"resources\": {
            \"cpu_limit\": \"$cpu_limit\",
            \"memory_limit\": \"$memory_limit\",
            \"cpu_reservation\": \"$(echo "$cpu_limit" | sed 's/[^0-9.]//g' | awk '{print $1/2}' | head -c 3)\",
            \"memory_reservation\": \"$(echo "$memory_limit" | sed 's/[^0-9]//g' | awk '{print $1/2}')M\"
        },
        \"deploy_date\": \"$(date +%Y-%m-%d)\",
        \"maintainer\": \"待确认\"
    } | .port_ranges[\"$port_range\"] = \"$project_name\" | .domains[\"$domain\"] = \"$project_name\"" "$PROJECTS_DB" > "$temp_file"
    
    mv "$temp_file" "$PROJECTS_DB"
    
    log_success "项目 $project_name 申请已提交"
    echo "  - 端口范围: $port_range"
    echo "  - 域名: $domain"
    echo "  - CPU限制: $cpu_limit"
    echo "  - 内存限制: $memory_limit"
    echo ""
    echo "请运行以下命令完成部署:"
    echo "  1. $0 approve $project_name"
    echo "  2. 部署应用到服务器"
    echo "  3. $0 activate $project_name"
}

# 批准项目申请
approve_project() {
    local project_name="$1"
    
    if [[ -z "$project_name" ]]; then
        log_error "使用方法: $0 approve <项目名>"
        return 1
    fi
    
    init_db
    
    # 检查项目是否存在
    local project_exists=$(jq -r ".projects[\"$project_name\"]" "$PROJECTS_DB")
    if [[ "$project_exists" == "null" ]]; then
        log_error "项目 $project_name 不存在"
        return 1
    fi
    
    # 更新项目状态
    local temp_file=$(mktemp)
    jq ".projects[\"$project_name\"].status = \"approved\"" "$PROJECTS_DB" > "$temp_file"
    mv "$temp_file" "$PROJECTS_DB"
    
    log_success "项目 $project_name 已批准，可以开始部署"
    
    # 显示部署信息
    local port_range=$(jq -r ".projects[\"$project_name\"].port_range" "$PROJECTS_DB")
    local domain=$(jq -r ".projects[\"$project_name\"].domain" "$PROJECTS_DB")
    
    echo ""
    echo "部署信息:"
    echo "  - 项目名: $project_name"
    echo "  - 端口范围: $port_range"
    echo "  - 域名: $domain"
    echo "  - 项目目录: /root/projects/$project_name"
    echo ""
    echo "部署后请运行: $0 activate $project_name"
}

# 激活项目（部署完成后）
activate_project() {
    local project_name="$1"
    
    if [[ -z "$project_name" ]]; then
        log_error "使用方法: $0 activate <项目名>"
        return 1
    fi
    
    init_db
    
    # 更新项目状态
    local temp_file=$(mktemp)
    jq ".projects[\"$project_name\"].status = \"active\" | .projects[\"$project_name\"].deploy_date = \"$(date +%Y-%m-%d)\"" "$PROJECTS_DB" > "$temp_file"
    mv "$temp_file" "$PROJECTS_DB"
    
    log_success "项目 $project_name 已激活"
    
    # 更新 SERVER_RESOURCE_ALLOCATION.md
    update_allocation_doc
}

# 移除项目
remove_project() {
    local project_name="$1"
    
    if [[ -z "$project_name" ]]; then
        log_error "使用方法: $0 remove <项目名>"
        return 1
    fi
    
    init_db
    
    # 获取项目信息
    local port_range=$(jq -r ".projects[\"$project_name\"].port_range" "$PROJECTS_DB")
    local domain=$(jq -r ".projects[\"$project_name\"].domain" "$PROJECTS_DB")
    
    if [[ "$port_range" == "null" ]]; then
        log_error "项目 $project_name 不存在"
        return 1
    fi
    
    # 确认删除
    echo "确认删除项目 $project_name ？(y/N)"
    read -r confirmation
    if [[ "$confirmation" != "y" && "$confirmation" != "Y" ]]; then
        log_info "操作已取消"
        return 0
    fi
    
    # 移除项目并释放资源
    local temp_file=$(mktemp)
    jq "del(.projects[\"$project_name\"]) | .port_ranges[\"$port_range\"] = \"available\" | .domains[\"$domain\"] = \"available\"" "$PROJECTS_DB" > "$temp_file"
    mv "$temp_file" "$PROJECTS_DB"
    
    log_success "项目 $project_name 已移除，资源已释放"
    
    # 更新文档
    update_allocation_doc
}

# 更新分配文档
update_allocation_doc() {
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    log_info "更新资源分配文档: $timestamp"
    
    # 这里可以添加自动更新 SERVER_RESOURCE_ALLOCATION.md 的逻辑
    # 或者提醒管理员手动更新
    log_warning "请手动更新 docs/SERVER_RESOURCE_ALLOCATION.md 文档"
}

# 显示帮助信息
show_help() {
    echo "项目协调工具 - 多项目部署管理"
    echo ""
    echo "用法: $0 <命令> [参数]"
    echo ""
    echo "命令:"
    echo "  show                       显示当前分配状态"
    echo "  request <项目名> <端口范围> [域名] [CPU] [内存]  申请新项目"
    echo "  approve <项目名>           批准项目申请"
    echo "  activate <项目名>          激活已部署项目"
    echo "  remove <项目名>            移除项目"
    echo "  check                      检查服务器状态"
    echo "  help                       显示帮助信息"
    echo ""
    echo "示例:"
    echo "  $0 show"
    echo "  $0 request myapi 5011-5020 myapi.dandanbaba.xyz 0.5 512M"
    echo "  $0 approve myapi"
    echo "  $0 activate myapi"
    echo "  $0 remove oldproject"
    echo ""
}

# 主函数
main() {
    local command=${1:-"help"}
    
    case "$command" in
        "show")
            show_allocation
            ;;
        "request")
            request_project "$2" "$3" "$4" "$5" "$6"
            ;;
        "approve")
            approve_project "$2"
            ;;
        "activate")
            activate_project "$2"
            ;;
        "remove")
            remove_project "$2"
            ;;
        "check")
            if [[ -f "$SCRIPT_DIR/server-status-check.sh" ]]; then
                bash "$SCRIPT_DIR/server-status-check.sh"
            else
                log_error "服务器状态检查脚本不存在"
            fi
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