#!/bin/bash

# SSH连接问题诊断脚本

echo "🔍 SSH连接问题诊断"
echo "=================="
echo ""

echo "1. 检查本地SSH密钥"
echo "-----------------"
echo "本地密钥文件:"
ls -la ~/.ssh/id_* 2>/dev/null || echo "未找到密钥文件"

echo ""
echo "2. 检查本地SSH配置"
echo "-----------------"
if [ -f ~/.ssh/config ]; then
    echo "SSH配置文件存在:"
    cat ~/.ssh/config
else
    echo "SSH配置文件不存在"
fi

echo ""
echo "3. 检查本地公钥内容"
echo "-----------------"
if [ -f ~/.ssh/id_rsa.pub ]; then
    echo "RSA公钥:"
    cat ~/.ssh/id_rsa.pub
else
    echo "RSA公钥不存在"
fi

if [ -f ~/.ssh/id_ed25519.pub ]; then
    echo ""
    echo "ED25519公钥:"
    cat ~/.ssh/id_ed25519.pub
else
    echo "ED25519公钥不存在"
fi

echo ""
echo "4. 测试不同密钥的连接"
echo "-------------------"

# 测试RSA密钥
if [ -f ~/.ssh/id_rsa ]; then
    echo "测试RSA密钥连接..."
    if ssh -o BatchMode=yes -o ConnectTimeout=5 -i ~/.ssh/id_rsa root@47.120.74.212 "echo 'RSA密钥连接成功'" 2>/dev/null; then
        echo "✅ RSA密钥可以连接"
    else
        echo "❌ RSA密钥无法连接"
    fi
fi

# 测试ED25519密钥
if [ -f ~/.ssh/id_ed25519 ]; then
    echo "测试ED25519密钥连接..."
    if ssh -o BatchMode=yes -o ConnectTimeout=5 -i ~/.ssh/id_ed25519 root@47.120.74.212 "echo 'ED25519密钥连接成功'" 2>/dev/null; then
        echo "✅ ED25519密钥可以连接"
    else
        echo "❌ ED25519密钥无法连接"
    fi
fi

echo ""
echo "5. 服务器端可能的问题"
echo "------------------"
echo "根据之前的输出，发现了以下可能的问题:"
echo ""
echo "问题1: 可能在错误的机器上执行了命令"
echo "   - 你显示的路径像是Windows本地机器，不是Linux服务器"
echo "   - 需要确认是否在正确的服务器上执行了SSH密钥设置"
echo ""
echo "问题2: authorized_keys文件中有重复或无效的密钥"
echo "   - 看到有很多重复的ed25519密钥"
echo "   - 可能需要清理authorized_keys文件"
echo ""
echo "问题3: 服务器SSH服务配置问题"
echo "   - 可能禁用了某些认证方式"
echo "   - 需要检查/etc/ssh/sshd_config"

echo ""
echo "6. 建议的解决步骤"
echo "---------------"
echo "1. 确认你确实是在阿里云服务器(47.120.74.212)上执行了SSH密钥设置"
echo "2. 如果不确定，重新通过阿里云控制台VNC连接到服务器"
echo "3. 在服务器上清理并重新设置authorized_keys文件"
echo "4. 验证服务器上的SSH服务配置"

echo ""
echo "🔧 快速修复命令 (在服务器上执行):"
echo "--------------------------------"
echo "# 备份现有的authorized_keys"
echo "cp ~/.ssh/authorized_keys ~/.ssh/authorized_keys.backup"
echo ""
echo "# 清理并重新添加正确的公钥"
echo "cat > ~/.ssh/authorized_keys << 'EOF'"
cat ~/.ssh/id_rsa.pub 2>/dev/null || echo "ssh-rsa [你的RSA公钥内容]"
echo "EOF"
echo ""
echo "chmod 600 ~/.ssh/authorized_keys"
