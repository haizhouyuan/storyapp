#!/bin/bash

# 设置SSH公钥后的测试脚本

echo "🧪 SSH密钥设置后的连接测试"
echo "=========================="
echo ""

echo "等待你在服务器上完成SSH密钥设置..."
echo "请确保已在服务器上执行了所有命令"
echo ""

read -p "已完成服务器端设置？(y/N): " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "🔍 开始测试连接..."
    echo ""
    
    # 测试1: 基本连接
    echo "测试1: 基本SSH连接"
    if ssh -o BatchMode=yes -o ConnectTimeout=10 storyapp-server "echo 'SSH免密登录成功!'" 2>/dev/null; then
        echo "✅ SSH免密登录成功!"
        
        # 测试2: 获取服务器信息
        echo ""
        echo "测试2: 获取服务器信息"
        ssh storyapp-server "echo '主机名:' && hostname && echo '系统版本:' && cat /etc/os-release | grep PRETTY_NAME"
        
        # 测试3: 检查项目目录
        echo ""
        echo "测试3: 检查项目目录"
        if ssh storyapp-server "[ -d /root/projects/storyapp ]"; then
            echo "✅ 项目目录已存在"
            ssh storyapp-server "ls -la /root/projects/storyapp/ | head -5"
        else
            echo "❌ 项目目录不存在，需要创建"
            ssh storyapp-server "mkdir -p /root/projects/storyapp && echo '项目目录已创建'"
        fi
        
        # 测试4: 检查Docker
        echo ""
        echo "测试4: 检查Docker状态"
        if ssh storyapp-server "command -v docker >/dev/null 2>&1"; then
            echo "✅ Docker已安装"
            ssh storyapp-server "docker --version"
        else
            echo "⚠️  Docker未安装或不在PATH中"
        fi
        
        echo ""
        echo "🎉 所有测试完成！"
        echo ""
        echo "📚 接下来可以："
        echo "1. 连接服务器: ssh storyapp-server"
        echo "2. 部署项目: ./scripts/deploy-with-ssh.sh"
        echo "3. 同步代码: rsync -avz --delete ./ storyapp-server:/root/projects/storyapp/"
        
    else
        echo "❌ SSH连接仍然失败"
        echo ""
        echo "🔧 请检查："
        echo "1. 确认在服务器上正确执行了所有命令"
        echo "2. 检查文件权限: chmod 700 ~/.ssh && chmod 600 ~/.ssh/authorized_keys"
        echo "3. 检查公钥内容是否完整"
        echo ""
        echo "🔍 调试命令:"
        echo "ssh -vvv root@47.120.74.212"
    fi
else
    echo "请先在服务器上完成SSH密钥设置"
    echo ""
    echo "📋 需要在服务器上执行的命令:"
    echo "1. mkdir -p ~/.ssh && chmod 700 ~/.ssh"
    echo "2. 添加公钥到 authorized_keys 文件"
    echo "3. chmod 600 ~/.ssh/authorized_keys"
    echo ""
    echo "详细步骤请参考: ./scripts/server-setup-commands.sh"
fi
