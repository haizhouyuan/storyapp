#!/bin/bash

# SSH连接测试脚本
# 测试到阿里云服务器的连接

set -e

echo "🔍 SSH连接测试"
echo "=============="
echo "服务器: 47.120.74.212"
echo "用户: root"
echo ""

# 基本连接测试
echo "📡 基本连接测试..."
if ssh -o BatchMode=yes -o ConnectTimeout=10 storyapp-server "echo 'SSH连接成功 - $(date)'" 2>/dev/null; then
    echo "✅ SSH免密登录成功！"
    
    # 获取服务器信息
    echo ""
    echo "🖥️ 服务器信息:"
    ssh storyapp-server "echo '系统信息:' && uname -a && echo '磁盘使用:' && df -h / && echo '内存使用:' && free -h"
    
    # 检查项目目录
    echo ""
    echo "📁 检查项目目录:"
    if ssh storyapp-server "[ -d /root/projects/storyapp ]"; then
        echo "✅ 项目目录存在"
        ssh storyapp-server "ls -la /root/projects/storyapp/ | head -10"
    else
        echo "❌ 项目目录不存在，需要首次部署"
        echo "建议运行: ./scripts/deploy-with-ssh.sh"
    fi
    
    # 检查Docker状态
    echo ""
    echo "🐳 检查Docker状态:"
    if ssh storyapp-server "command -v docker >/dev/null 2>&1"; then
        echo "✅ Docker已安装"
        ssh storyapp-server "docker --version && docker compose version"
        
        # 检查正在运行的容器
        echo ""
        echo "📦 运行中的容器:"
        ssh storyapp-server "docker ps" || echo "没有运行中的容器"
    else
        echo "❌ Docker未安装"
    fi
    
    # 检查服务端口
    echo ""
    echo "🌐 检查服务端口:"
    if ssh storyapp-server "netstat -tlnp 2>/dev/null | grep ':500[01]' || ss -tlnp | grep ':500[01]'"; then
        echo "✅ 发现端口5000/5001在监听"
    else
        echo "❌ 端口5000/5001未在监听，服务可能未启动"
    fi
    
    # 测试API健康检查
    echo ""
    echo "🏥 测试API健康检查:"
    if ssh storyapp-server "curl -s http://localhost:5001/api/health" 2>/dev/null; then
        echo "✅ API健康检查成功"
    else
        echo "❌ API健康检查失败，服务可能未运行"
    fi
    
    echo ""
    echo "🎉 连接测试完成！"
    echo ""
    echo "📚 后续操作:"
    echo "   ssh storyapp-server                    # 连接服务器"
    echo "   ./scripts/deploy-with-ssh.sh           # 部署项目"
    echo "   curl http://47.120.74.212:5001/api/health  # 测试API"
    
else
    echo "❌ SSH连接失败"
    echo ""
    echo "🔧 故障排除步骤:"
    echo "1. 检查是否已在阿里云控制台添加SSH密钥"
    echo "2. 确认实例已重启（如果是通过控制台添加密钥）"
    echo "3. 检查网络连接和防火墙设置"
    echo "4. 运行详细调试: ssh -vvv root@47.120.74.212"
    echo ""
    echo "📋 参考文档:"
    echo "   ./scripts/阿里云ECS添加SSH密钥指南.md"
    echo "   ./scripts/setup-ssh-keyonly.sh"
    
    # 显示当前可用的密钥
    echo ""
    echo "🔑 本地SSH密钥:"
    ls -la ~/.ssh/id_* 2>/dev/null || echo "未找到SSH密钥文件"
    
    # 提供公钥内容
    if [ -f ~/.ssh/id_rsa.pub ]; then
        echo ""
        echo "📋 你的公钥内容（需要添加到服务器）:"
        echo "----------------------------------------"
        cat ~/.ssh/id_rsa.pub
        echo "----------------------------------------"
    fi
    
    exit 1
fi
