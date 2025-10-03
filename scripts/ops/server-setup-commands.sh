#!/bin/bash

# 在服务器上执行的SSH密钥设置命令
# 请在服务器终端中逐行执行以下命令

echo "在服务器上设置SSH公钥的正确命令："
echo "=================================="
echo ""

echo "# 1. 创建SSH目录（如果不存在）"
echo "mkdir -p ~/.ssh"
echo "chmod 700 ~/.ssh"
echo ""

echo "# 2. 添加公钥到authorized_keys文件"
echo "cat >> ~/.ssh/authorized_keys << 'EOF'"
echo "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAACAQCTnNkbs+K/3SoOix5KCBiNL9hUGLkFOkRBeMVtangyDVvsu8FTfallIPBbz6J42yTfXEfv38/H/9XqMvPI/Z3NVYfpp+t+KusxjyzguP6cTovLpdslwRcsl/Ehte3YlJlZJs4LGCSPkcfh+A/bkAVyK+E1NE9QPIvR488co3thPsFaONUtOLGF0yrqe1L5XJlax2XajDbIe+Z9oQsZ3sJsmU48j7Ji0T9ba70pk88gqYfrU+vztOuqg8/tdLxElfWOwJ44LUp2iYr3+YblKNnpYFDUNfxHjEET2FlYv1yjjzPSVfnmbVUi3Vi1jbQrKk2PoRIG/nzDnulMI3SfIkzrksPjsL2ZNdVoem6hKs/aWAQSuZN8ik+y8SiDsiBbFXhJenfCTHS0s5bNssLVIJnTBE0BWfeRKm3dWpbbBr7EOMRdmlfeKHGQCVp5fl4Q9aWGGPLBGb2T3X0eHNlEGZ4mY05K/km1d3zIW3pycyoqgB5Njo+BlA5gyEp96AZ3f/4TZZPnExeNTadGmxBJEqlqMNJYUquH/3UHIy+oNtwsiYnXgJEsTugfpXFACey39yUf0cbsbS0ys9sydthGqAWyzEJmlIOBOmsYkA5Fxo4kxKS8pZGNrIcmfqxM9jqx3X4EDGMkJy5qskFqDngcrUX4OvH/qH9oJqnPFoV4P2paCw== storyapp-20250922"
echo "EOF"
echo ""

echo "# 3. 设置正确的权限"
echo "chmod 600 ~/.ssh/authorized_keys"
echo ""

echo "# 4. 验证设置"
echo "ls -la ~/.ssh/"
echo "cat ~/.ssh/authorized_keys"
echo ""

echo "# 5. 检查SSH服务配置（可选）"
echo "grep -E '(PubkeyAuthentication|PasswordAuthentication|PermitRootLogin)' /etc/ssh/sshd_config"
