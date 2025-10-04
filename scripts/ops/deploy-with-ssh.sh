#!/bin/bash

# 使用SSH免密登录部署到阿里云服务器
# 前提: 已设置好免密登录

set -e

echo "🚀 部署StoryApp到阿里云服务器"
echo "=============================="
echo "服务器: 47.120.74.212"
echo "项目路径: /root/projects/storyapp"
echo ""

# 检查SSH连接
echo "🔍 检查SSH连接..."
if ! ssh -o BatchMode=yes -o ConnectTimeout=5 storyapp-server "echo 'SSH连接正常'" 2>/dev/null; then
    echo "❌ SSH免密登录未设置或连接失败"
    echo "请先运行: ./scripts/setup-ssh-all.sh"
    exit 1
fi
echo "✅ SSH连接正常"
echo ""

# 检查本地环境
echo "🔍 检查本地环境..."
if [ ! -f "package.json" ]; then
    echo "❌ 请在项目根目录运行此脚本"
    exit 1
fi

if [ ! -f ".env" ]; then
    echo "⚠️  警告: 未找到.env文件"
    echo "请确保服务器上有正确的环境配置"
fi
echo "✅ 本地环境检查完成"
echo ""

# 选择部署模式
echo "📋 选择部署模式:"
echo "1) 完整部署 (构建+上传+重启)"
echo "2) 仅上传代码 (不重启服务)"
echo "3) 仅重启服务 (不更新代码)"
echo "4) 查看服务器状态"
echo "5) 查看服务器日志"
echo ""

read -p "请选择 (1-5): " -n 1 -r
echo ""

case $REPLY in
    1)
        echo "🚀 执行完整部署..."
        
        # 构建项目
        echo "📦 构建项目..."
        npm run build
        
        # 同步代码到服务器
        echo "📤 同步代码到服务器..."
        rsync -avz --delete \
            --exclude 'node_modules' \
            --exclude '.git' \
            --exclude 'playwright-report' \
            --exclude 'reports' \
            --exclude 'tmp-e2e' \
            --exclude '.env' \
            ./ storyapp-server:/root/projects/storyapp/
        
        # 在服务器上重启服务
        echo "🔄 重启服务器服务..."
        ssh storyapp-server "cd /root/projects/storyapp && docker compose -f docker-compose.yml down && docker compose -f docker-compose.yml up -d"
        
        echo "✅ 完整部署完成"
        ;;
        
    2)
        echo "📤 仅上传代码..."
        
        rsync -avz --delete \
            --exclude 'node_modules' \
            --exclude '.git' \
            --exclude 'playwright-report' \
            --exclude 'reports' \
            --exclude 'tmp-e2e' \
            --exclude '.env' \
            ./ storyapp-server:/root/projects/storyapp/
        
        echo "✅ 代码上传完成"
        ;;
        
    3)
        echo "🔄 仅重启服务..."
        
        ssh storyapp-server "cd /root/projects/storyapp && docker compose -f docker-compose.yml restart"
        
        echo "✅ 服务重启完成"
        ;;
        
    4)
        echo "📊 查看服务器状态..."
        
        ssh storyapp-server "cd /root/projects/storyapp && docker compose -f docker-compose.yml ps"
        
        echo ""
        echo "🔍 系统资源使用情况:"
        ssh storyapp-server "df -h && echo '---' && free -h && echo '---' && uptime"
        ;;
        
    5)
        echo "📋 查看服务器日志..."
        
        echo "选择日志类型:"
        echo "1) 应用日志 (最近50行)"
        echo "2) 应用日志 (实时跟踪)"
        echo "3) 系统日志"
        echo "4) Docker日志"
        echo ""
        
        read -p "请选择 (1-4): " -n 1 -r
        echo ""
        
        case $REPLY in
            1)
                ssh storyapp-server "cd /root/projects/storyapp && docker compose -f docker-compose.yml logs --tail=50 app"
                ;;
            2)
                echo "按 Ctrl+C 退出日志跟踪"
                ssh storyapp-server "cd /root/projects/storyapp && docker compose -f docker-compose.yml logs -f app"
                ;;
            3)
                ssh storyapp-server "journalctl -u docker --since '1 hour ago' | tail -50"
                ;;
            4)
                ssh storyapp-server "docker system df && echo '---' && docker images && echo '---' && docker ps -a"
                ;;
            *)
                echo "❌ 无效选择"
                ;;
        esac
        ;;
        
    *)
        echo "❌ 无效选择"
        exit 1
        ;;
esac

echo ""
echo "🎉 操作完成！"
echo ""
echo "📚 有用的后续命令:"
echo "   ssh storyapp-server                    # 连接服务器"
echo "   curl http://47.120.74.212:5001/api/health  # 检查服务健康状态"
echo "   ssh storyapp-server 'cd /root/projects/storyapp && docker compose -f docker-compose.yml logs -f'  # 查看实时日志"
