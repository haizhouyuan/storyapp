#!/bin/bash

# 针对禁用密码登录服务器的SSH密钥设置脚本
# 服务器: 47.120.74.212 (禁用密码登录)

set -e

echo "🔐 服务器禁用密码登录的SSH密钥设置"
echo "=================================="
echo "服务器: 47.120.74.212"
echo "用户: root"
echo "注意: 服务器已禁用密码登录，只允许密钥认证"
echo ""

SSH_DIR="$HOME/.ssh"
SSH_KEY="$SSH_DIR/id_rsa"
SSH_PUB_KEY="$SSH_DIR/id_rsa.pub"

# 检查现有密钥
if [ -f "$SSH_KEY" ]; then
    echo "✅ 发现现有SSH密钥: $SSH_KEY"
else
    echo "❌ 未找到SSH密钥，请先生成"
    echo "运行: ssh-keygen -t rsa -b 4096"
    exit 1
fi

echo ""
echo "🔑 你的公钥内容:"
echo "=================================================="
cat "$SSH_PUB_KEY"
echo "=================================================="
echo ""

echo "📋 解决方案选项:"
echo ""
echo "方案1: 通过服务器提供商控制台添加SSH密钥"
echo "----------------------------------------"
echo "1. 登录阿里云ECS控制台"
echo "2. 找到你的服务器实例"
echo "3. 在'密钥对'或'SSH密钥'部分添加上面的公钥"
echo "4. 重启服务器实例（如果需要）"
echo ""

echo "方案2: 通过服务器的Web控制台或VNC"
echo "------------------------------------"
echo "1. 通过阿里云控制台的VNC连接到服务器"
echo "2. 在服务器上手动执行以下命令:"
echo "   mkdir -p ~/.ssh"
echo "   chmod 700 ~/.ssh"
echo "   cat > ~/.ssh/authorized_keys << 'EOF'"
cat "$SSH_PUB_KEY"
echo "   EOF"
echo "   chmod 600 ~/.ssh/authorized_keys"
echo ""

echo "方案3: 如果你有其他可以访问的服务器账户"
echo "---------------------------------------"
echo "1. 使用其他账户登录服务器"
echo "2. 切换到root用户或使用sudo"
echo "3. 执行上述密钥设置命令"
echo ""

echo "方案4: 通过云服务商的实例重置功能"
echo "--------------------------------"
echo "1. 在阿里云控制台重置实例"
echo "2. 在重置过程中添加SSH密钥"
echo "3. 重新部署应用"
echo ""

echo "方案5: 检查是否有备用的SSH密钥"
echo "-----------------------------"
echo "检查是否已经有其他密钥可以使用:"

# 检查其他可能的密钥
for key_type in ed25519 ecdsa dsa; do
    if [ -f "$SSH_DIR/id_$key_type" ]; then
        echo "发现 $key_type 密钥: $SSH_DIR/id_$key_type"
        echo "尝试使用此密钥连接..."
        if ssh -o BatchMode=yes -o ConnectTimeout=5 -i "$SSH_DIR/id_$key_type" root@47.120.74.212 "echo '连接成功'" 2>/dev/null; then
            echo "✅ $key_type 密钥可以连接！"
            echo "将使用此密钥配置SSH config"
            
            # 更新SSH配置使用此密钥
            if [ -f "$SSH_DIR/config" ]; then
                sed -i.bak "s|IdentityFile.*|IdentityFile ~/.ssh/id_$key_type|" "$SSH_DIR/config"
            fi
            
            echo "现在可以使用: ssh storyapp-server"
            exit 0
        else
            echo "❌ $key_type 密钥无法连接"
        fi
    fi
done

echo ""
echo "⚠️  如果上述方案都不可行，建议联系服务器管理员或阿里云技术支持"
echo ""

# 提供一些有用的检查命令
echo "🔍 故障排除命令:"
echo "--------------"
echo "# 检查SSH连接详细信息"
echo "ssh -vvv root@47.120.74.212"
echo ""
echo "# 检查本地SSH密钥"
echo "ls -la ~/.ssh/"
echo ""
echo "# 测试不同的密钥文件"
echo "ssh -i ~/.ssh/id_ed25519 root@47.120.74.212"
echo "ssh -i ~/.ssh/id_rsa root@47.120.74.212"
echo ""

# 创建一个备用的连接测试脚本
cat > "$SSH_DIR/../test-ssh-connection.sh" << 'EOF'
#!/bin/bash
echo "测试SSH连接到 47.120.74.212..."

for key in ~/.ssh/id_*; do
    if [[ -f "$key" && ! "$key" =~ \.pub$ ]]; then
        echo "测试密钥: $key"
        if ssh -o BatchMode=yes -o ConnectTimeout=5 -i "$key" root@47.120.74.212 "echo '连接成功'" 2>/dev/null; then
            echo "✅ $key 可以连接！"
            echo "可以使用: ssh -i $key root@47.120.74.212"
        else
            echo "❌ $key 无法连接"
        fi
    fi
done
EOF

chmod +x "$SSH_DIR/../test-ssh-connection.sh"

echo "📝 已创建连接测试脚本: ~/test-ssh-connection.sh"
echo "运行此脚本可以测试所有可用的SSH密钥"
