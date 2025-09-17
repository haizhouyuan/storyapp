#!/bin/bash

# 生产环境Docker容器化部署脚本
# 用于阿里云服务器自动化部署

set -e  # 遇到错误立即退出

echo "🚀 开始生产环境Docker容器化部署..."

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 打印带颜色的消息
print_status() {
    echo -e "${BLUE}📍 $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# 检查必要的环境
check_environment() {
    print_status "检查部署环境..."
    
    # 检查Docker
    if ! command -v docker &> /dev/null; then
        print_error "Docker未安装，请先安装Docker"
        exit 1
    fi
    
    # 检查Docker Compose
    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        print_error "Docker Compose未安装，请先安装Docker Compose"
        exit 1
    fi
    
    # 检查.env文件
    if [ ! -f .env ]; then
        print_warning ".env文件不存在，创建默认配置..."
        cat > .env << 'EOF'
# DeepSeek API配置
DEEPSEEK_API_KEY=your_deepseek_api_key
DEEPSEEK_API_URL=https://api.deepseek.com

# MongoDB配置
MONGODB_URI=mongodb://mongo:27017/storyapp
MONGODB_DB_NAME=storyapp

# 应用配置
NODE_ENV=production
PORT=5000

# 日志配置
ENABLE_DB_LOGGING=true
LOG_LEVEL=info
LOG_RETENTION_DAYS=30
EOF
        print_warning "请编辑.env文件配置真实的DEEPSEEK_API_KEY"
    fi
    
    print_success "环境检查完成"
}

# 清理旧容器和镜像
cleanup_old_deployment() {
    print_status "清理旧的部署..."
    
    # 停止并删除旧容器
    docker-compose down --remove-orphans || true
    
    # 删除悬挂的镜像
    docker image prune -f || true
    
    print_success "旧部署清理完成"
}

# 构建新镜像
build_images() {
    print_status "构建Docker镜像..."
    
    # 构建应用镜像
    docker-compose build --no-cache app
    
    print_success "镜像构建完成"
}

# 启动服务
start_services() {
    print_status "启动Docker服务..."
    
    # 首先启动MongoDB
    print_status "启动MongoDB..."
    docker-compose up -d mongo
    
    # 等待MongoDB就绪
    print_status "等待MongoDB就绪..."
    timeout=60
    while [ $timeout -gt 0 ]; do
        if docker-compose exec -T mongo mongosh --eval "db.adminCommand('ping')" > /dev/null 2>&1; then
            print_success "MongoDB就绪"
            break
        fi
        sleep 2
        timeout=$((timeout - 2))
    done
    
    if [ $timeout -le 0 ]; then
        print_error "MongoDB启动超时"
        exit 1
    fi
    
    # 启动应用服务
    print_status "启动应用服务..."
    docker-compose up -d app
    
    print_success "服务启动完成"
}

# 验证部署
verify_deployment() {
    print_status "验证部署状态..."
    
    # 等待应用就绪
    print_status "等待应用服务就绪..."
    timeout=60
    while [ $timeout -gt 0 ]; do
        if curl -sf http://localhost:5001/api/health > /dev/null 2>&1; then
            print_success "应用服务就绪"
            break
        fi
        sleep 2
        timeout=$((timeout - 2))
    done
    
    if [ $timeout -le 0 ]; then
        print_error "应用服务启动超时"
        docker-compose logs app
        exit 1
    fi
    
    # 显示服务状态
    print_status "服务状态："
    docker-compose ps
    
    # 测试健康检查
    print_status "执行健康检查..."
    health_response=$(curl -s http://localhost:5001/api/health)
    if echo "$health_response" | grep -q '"status":"healthy"'; then
        print_success "健康检查通过"
        echo "$health_response" | jq '.' 2>/dev/null || echo "$health_response"
    else
        print_error "健康检查失败"
        echo "$health_response"
    fi
    
    print_success "部署验证完成"
}

# 运行日志系统测试
test_logging_system() {
    print_status "测试日志记录系统..."
    
    # 创建测试脚本的Docker版本
    cat > test-logging-docker.js << 'EOF'
const axios = require('axios');

const BASE_URL = 'http://localhost:5001/api';
const ADMIN_URL = 'http://localhost:5001/api/admin';

async function runTests() {
    console.log('\x1b[36m🚀 开始测试Docker容器中的日志记录系统...\x1b[0m\n');
    
    let passedTests = 0;
    let totalTests = 5;
    
    // 测试1: 健康检查
    try {
        console.log('\x1b[34m🔍 测试1: 健康检查\x1b[0m');
        const response = await axios.get(`${BASE_URL}/health`);
        if (response.data.status === 'healthy') {
            console.log('\x1b[32m✅ 健康检查通过\x1b[0m');
            passedTests++;
        }
    } catch (error) {
        console.log('\x1b[31m❌ 健康检查失败\x1b[0m');
    }
    
    // 测试2: 故事保存（会创建日志）
    try {
        console.log('\x1b[34m🔍 测试2: 故事保存\x1b[0m');
        const response = await axios.post(`${BASE_URL}/save-story`, {
            title: `Docker测试故事 - ${new Date().toLocaleString()}`,
            content: JSON.stringify({
                storySegment: "这是Docker容器中的测试故事片段",
                choices: ["选择1", "选择2", "选择3"],
                isEnding: false
            })
        });
        if (response.data.success) {
            console.log('\x1b[32m✅ 故事保存成功\x1b[0m');
            passedTests++;
        }
    } catch (error) {
        console.log('\x1b[31m❌ 故事保存失败\x1b[0m');
    }
    
    // 等待日志写入
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // 测试3: 管理员统计API
    try {
        console.log('\x1b[34m🔍 测试3: 管理员统计API\x1b[0m');
        const response = await axios.get(`${ADMIN_URL}/stats`);
        if (response.data.overview) {
            console.log('\x1b[32m✅ 统计数据获取成功\x1b[0m');
            console.log(`总会话数: ${response.data.overview.totalSessions}`);
            passedTests++;
        }
    } catch (error) {
        console.log('\x1b[31m❌ 统计API测试失败\x1b[0m');
    }
    
    // 测试4: 管理员日志API
    try {
        console.log('\x1b[34m🔍 测试4: 管理员日志API\x1b[0m');
        const response = await axios.get(`${ADMIN_URL}/logs?limit=5`);
        if (response.data.logs && response.data.logs.length > 0) {
            console.log('\x1b[32m✅ 日志数据获取成功\x1b[0m');
            console.log(`获取日志数量: ${response.data.logs.length}`);
            passedTests++;
        }
    } catch (error) {
        console.log('\x1b[31m❌ 日志API测试失败\x1b[0m');
    }
    
    // 测试5: 性能指标API
    try {
        console.log('\x1b[34m🔍 测试5: 性能指标API\x1b[0m');
        const response = await axios.get(`${ADMIN_URL}/performance`);
        if (response.data.timeline !== undefined) {
            console.log('\x1b[32m✅ 性能数据获取成功\x1b[0m');
            passedTests++;
        }
    } catch (error) {
        console.log('\x1b[31m❌ 性能API测试失败\x1b[0m');
    }
    
    // 测试结果
    console.log(`\n\x1b[36m📊 Docker容器测试结果: ${passedTests}/${totalTests} 通过\x1b[0m`);
    
    if (passedTests === totalTests) {
        console.log('\x1b[32m🎉 所有测试通过！Docker容器部署成功！\x1b[0m');
    } else {
        console.log('\x1b[33m⚠️  部分测试失败，请检查容器日志\x1b[0m');
    }
}

runTests().catch(console.error);
EOF
    
    # 在容器中安装axios并运行测试
    if docker exec storyapp_prod npm list axios > /dev/null 2>&1; then
        echo "axios已安装"
    else
        print_status "在容器中安装axios..."
        docker exec storyapp_prod npm install axios
    fi
    
    # 运行测试
    docker exec storyapp_prod node -e "$(cat test-logging-docker.js)"
    
    # 清理临时文件
    rm -f test-logging-docker.js
    
    print_success "日志系统测试完成"
}

# 显示部署信息
show_deployment_info() {
    print_success "🎉 Docker容器化部署完成！"
    
    echo
    print_status "🔗 服务访问地址："
    echo "  • 健康检查: http://localhost:5001/api/health"
    echo "  • 管理后台API: http://localhost:5001/api/admin"
    echo "  • 故事API: http://localhost:5001/api"
    
    echo
    print_status "🛠️  常用命令："
    echo "  • 查看服务状态: docker-compose ps"
    echo "  • 查看应用日志: docker-compose logs -f app"
    echo "  • 查看数据库日志: docker-compose logs -f mongo"
    echo "  • 重启应用: docker-compose restart app"
    echo "  • 停止所有服务: docker-compose down"
    
    echo
    print_status "📊 日志记录系统："
    echo "  • 测试脚本: node test-logging-system.js"
    echo "  • Appsmith配置: appsmith-story-admin.json"
    echo "  • 详细文档: docs/APPSMITH_SETUP.md"
}

# 主函数
main() {
    cd "$(dirname "$0")/.."  # 切换到项目根目录
    
    check_environment
    cleanup_old_deployment
    build_images
    start_services
    verify_deployment
    test_logging_system
    show_deployment_info
}

# 捕获错误并清理
trap 'print_error "部署失败！"; docker-compose logs app; exit 1' ERR

# 运行主函数
main "$@"