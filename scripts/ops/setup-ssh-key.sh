#!/bin/bash

# 设置阿里云服务器免密登录脚本
# 服务器: 47.120.74.212
# 用户: root

set -e

echo "🔑 设置阿里云服务器免密登录"
echo "服务器: 47.120.74.212"
echo "用户: root"
echo ""

# 检查是否已有SSH密钥
SSH_DIR="$HOME/.ssh"
SSH_KEY="$SSH_DIR/id_rsa"
SSH_PUB_KEY="$SSH_DIR/id_rsa.pub"

# 创建.ssh目录（如果不存在）
mkdir -p "$SSH_DIR"
chmod 700 "$SSH_DIR"

# 检查是否已有SSH密钥
if [ ! -f "$SSH_KEY" ]; then
    echo "📝 生成新的SSH密钥对..."
    ssh-keygen -t rsa -b 4096 -f "$SSH_KEY" -N "" -C "storyapp-$(date +%Y%m%d)"
    echo "✅ SSH密钥已生成"
else
    echo "✅ 发现现有SSH密钥: $SSH_KEY"
fi

# 显示公钥内容
echo ""
echo "🔑 你的公钥内容:"
echo "----------------------------------------"
cat "$SSH_PUB_KEY"
echo "----------------------------------------"
echo ""

# 提示用户手动复制公钥到服务器
echo "📋 请按以下步骤操作:"
echo "1. 复制上面的公钥内容"
echo "2. 登录到服务器: ssh root@47.120.74.212"
echo "3. 在服务器上执行以下命令:"
echo ""
echo "   mkdir -p ~/.ssh"
echo "   chmod 700 ~/.ssh"
echo "   echo '$(cat "$SSH_PUB_KEY")' >> ~/.ssh/authorized_keys"
echo "   chmod 600 ~/.ssh/authorized_keys"
echo ""

# 询问是否自动尝试复制公钥
read -p "🤖 是否尝试自动复制公钥到服务器? (y/N): " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "🚀 尝试自动复制公钥到服务器..."
    
    # 尝试使用ssh-copy-id
    if command -v ssh-copy-id &> /dev/null; then
        echo "使用 ssh-copy-id 复制公钥..."
        ssh-copy-id -i "$SSH_PUB_KEY" root@47.120.74.212
    else
        echo "ssh-copy-id 不可用，尝试手动复制..."
        cat "$SSH_PUB_KEY" | ssh root@47.120.74.212 "mkdir -p ~/.ssh && chmod 700 ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
    fi
    
    echo "✅ 公钥复制完成"
    
    # 测试免密登录
    echo ""
    echo "🧪 测试免密登录..."
    if ssh -o BatchMode=yes -o ConnectTimeout=5 root@47.120.74.212 "echo '免密登录测试成功'" 2>/dev/null; then
        echo "✅ 免密登录设置成功！"
        echo ""
        echo "🎉 现在你可以使用以下命令免密登录:"
        echo "   ssh root@47.120.74.212"
    else
        echo "❌ 免密登录测试失败，请检查服务器配置"
        echo "可能需要手动配置服务器端的 authorized_keys 文件"
    fi
else
    echo "📝 请手动完成公钥复制步骤"
fi

echo ""
echo "📚 其他有用的SSH配置:"
echo "   在 ~/.ssh/config 中添加以下配置可以简化连接:"
echo ""
echo "   Host storyapp-server"
echo "       HostName 47.120.74.212"
echo "       User root"
echo "       IdentityFile ~/.ssh/id_rsa"
echo "       ServerAliveInterval 60"
echo "       ServerAliveCountMax 3"
echo ""
echo "   配置后可以使用: ssh storyapp-server"
