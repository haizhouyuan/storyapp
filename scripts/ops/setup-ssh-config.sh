#!/bin/bash

# 设置SSH配置文件脚本
# 简化阿里云服务器连接

set -e

echo "⚙️  设置SSH配置文件"
echo ""

SSH_CONFIG="$HOME/.ssh/config"
SSH_DIR="$HOME/.ssh"

# 确保.ssh目录存在
mkdir -p "$SSH_DIR"
chmod 700 "$SSH_DIR"

# 检查是否已有配置文件
if [ -f "$SSH_CONFIG" ]; then
    echo "📄 发现现有SSH配置文件: $SSH_CONFIG"
    
    # 检查是否已有storyapp-server配置
    if grep -q "Host storyapp-server" "$SSH_CONFIG"; then
        echo "✅ 已存在 storyapp-server 配置"
        echo ""
        echo "当前配置:"
        grep -A 10 "Host storyapp-server" "$SSH_CONFIG" || true
    else
        echo "➕ 添加 storyapp-server 配置到现有文件"
        cat >> "$SSH_CONFIG" << 'EOF'

# StoryApp 阿里云服务器配置
Host storyapp-server
    HostName 47.120.74.212
    User root
    IdentityFile ~/.ssh/id_rsa
    ServerAliveInterval 60
    ServerAliveCountMax 3
    StrictHostKeyChecking no
    UserKnownHostsFile /dev/null
EOF
        echo "✅ 配置已添加"
    fi
else
    echo "📝 创建新的SSH配置文件"
    cat > "$SSH_CONFIG" << 'EOF'
# SSH配置文件
# 用于简化服务器连接

# StoryApp 阿里云服务器配置
Host storyapp-server
    HostName 47.120.74.212
    User root
    IdentityFile ~/.ssh/id_rsa
    ServerAliveInterval 60
    ServerAliveCountMax 3
    StrictHostKeyChecking no
    UserKnownHostsFile /dev/null
EOF
    echo "✅ SSH配置文件已创建"
fi

# 设置正确的权限
chmod 600 "$SSH_CONFIG"

echo ""
echo "🎉 SSH配置完成！"
echo ""
echo "现在你可以使用以下简化命令连接服务器:"
echo "   ssh storyapp-server"
echo ""
echo "或者使用完整命令:"
echo "   ssh root@47.120.74.212"
echo ""
echo "📋 配置说明:"
echo "   - ServerAliveInterval: 每60秒发送保活包"
echo "   - ServerAliveCountMax: 最多3次保活失败"
echo "   - StrictHostKeyChecking: 跳过主机密钥检查"
echo "   - UserKnownHostsFile: 不保存主机密钥"
