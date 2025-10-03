#!/bin/bash

# 一键设置阿里云服务器免密登录
# 包含SSH密钥生成、公钥复制、配置文件设置

set -e

echo "🚀 一键设置阿里云服务器免密登录"
echo "=================================="
echo "服务器: 47.120.74.212"
echo "用户: root"
echo "项目路径: /root/projects/storyapp"
echo ""

# 检查必要的工具
echo "🔍 检查必要工具..."
if ! command -v ssh &> /dev/null; then
    echo "❌ SSH客户端未安装，请先安装OpenSSH"
    exit 1
fi

if ! command -v ssh-keygen &> /dev/null; then
    echo "❌ ssh-keygen未安装，请先安装OpenSSH"
    exit 1
fi

echo "✅ 必要工具检查完成"
echo ""

# 步骤1: 生成SSH密钥
echo "📝 步骤1: 生成SSH密钥"
echo "-------------------"
SSH_DIR="$HOME/.ssh"
SSH_KEY="$SSH_DIR/id_rsa"
SSH_PUB_KEY="$SSH_DIR/id_rsa.pub"

mkdir -p "$SSH_DIR"
chmod 700 "$SSH_DIR"

if [ ! -f "$SSH_KEY" ]; then
    echo "生成新的SSH密钥对..."
    ssh-keygen -t rsa -b 4096 -f "$SSH_KEY" -N "" -C "storyapp-$(date +%Y%m%d)"
    echo "✅ SSH密钥已生成"
else
    echo "✅ 使用现有SSH密钥: $SSH_KEY"
fi
echo ""

# 步骤2: 设置SSH配置
echo "⚙️  步骤2: 设置SSH配置"
echo "-------------------"
SSH_CONFIG="$HOME/.ssh/config"

if [ -f "$SSH_CONFIG" ] && grep -q "Host storyapp-server" "$SSH_CONFIG"; then
    echo "✅ SSH配置已存在"
else
    echo "添加SSH配置..."
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
    chmod 600 "$SSH_CONFIG"
    echo "✅ SSH配置已添加"
fi
echo ""

# 步骤3: 复制公钥到服务器
echo "📤 步骤3: 复制公钥到服务器"
echo "-----------------------"
echo "公钥内容:"
echo "----------------------------------------"
cat "$SSH_PUB_KEY"
echo "----------------------------------------"
echo ""

echo "🔄 尝试自动复制公钥到服务器..."
echo "注意: 这需要你输入服务器的root密码"

# 尝试复制公钥
if cat "$SSH_PUB_KEY" | ssh -o StrictHostKeyChecking=no root@47.120.74.212 "mkdir -p ~/.ssh && chmod 700 ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys" 2>/dev/null; then
    echo "✅ 公钥复制成功"
    
    # 测试免密登录
    echo ""
    echo "🧪 测试免密登录..."
    if ssh -o BatchMode=yes -o ConnectTimeout=10 storyapp-server "echo '免密登录测试成功 - $(date)'" 2>/dev/null; then
        echo "✅ 免密登录设置成功！"
        echo ""
        echo "🎉 设置完成！现在你可以使用以下命令:"
        echo "   ssh storyapp-server"
        echo "   # 或者"
        echo "   ssh root@47.120.74.212"
        echo ""
        echo "📁 项目路径: /root/projects/storyapp"
        echo "🐳 Docker命令: docker compose -f docker-compose.yml up -d"
    else
        echo "❌ 免密登录测试失败"
        echo "请检查服务器配置或手动复制公钥"
    fi
else
    echo "❌ 自动复制失败，请手动复制公钥"
    echo ""
    echo "📋 手动操作步骤:"
    echo "1. 复制上面的公钥内容"
    echo "2. 登录服务器: ssh root@47.120.74.212"
    echo "3. 执行以下命令:"
    echo "   mkdir -p ~/.ssh"
    echo "   chmod 700 ~/.ssh"
    echo "   echo '$(cat "$SSH_PUB_KEY")' >> ~/.ssh/authorized_keys"
    echo "   chmod 600 ~/.ssh/authorized_keys"
    echo "4. 退出服务器: exit"
    echo "5. 测试连接: ssh storyapp-server"
fi

echo ""
echo "📚 有用的命令:"
echo "   ssh storyapp-server                    # 连接服务器"
echo "   scp file storyapp-server:/path/        # 复制文件到服务器"
echo "   rsync -avz ./ storyapp-server:/root/projects/storyapp/  # 同步项目文件"
echo ""
echo "🔧 部署相关命令:"
echo "   ssh storyapp-server 'cd /root/projects/storyapp && docker compose -f docker-compose.yml up -d'"
echo "   ssh storyapp-server 'cd /root/projects/storyapp && docker compose -f docker-compose.yml logs -f'"
