#!/bin/bash

# 在真正的阿里云服务器(47.120.74.212)上执行的命令
# 警告：请确保你已经通过VNC或其他方式登录到正确的服务器！

echo "===== 在阿里云服务器上执行以下命令 ====="
echo ""
echo "# 1. 首先确认你在正确的服务器上"
echo "echo '当前主机名:'"
echo "hostname"
echo "echo '当前IP地址:'"
echo "hostname -I | grep -o '47\.120\.74\.212' || echo '警告：不在目标服务器上！'"
echo ""

echo "# 2. 创建SSH目录"
echo "mkdir -p ~/.ssh"
echo "chmod 700 ~/.ssh"
echo ""

echo "# 3. 清理并设置authorized_keys文件"
echo "cat > ~/.ssh/authorized_keys << 'EOF'"
echo "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAACAQCTnNkbs+K/3SoOix5KCBiNL9hUGLkFOkRBeMVtangyDVvsu8FTfallIPBbz6J42yTfXEfv38/H/9XqMvPI/Z3NVYfpp+t+KusxjyzguP6cTovLpdslwRcsl/Ehte3YlJlZJs4LGCSPkcfh+A/bkAVyK+E1NE9QPIvR488co3thPsFaONUtOLGF0yrqe1L5XJlax2XajDbIe+Z9oQsZ3sJsmU48j7Ji0T9ba70pk88gqYfrU+vztOuqg8/tdLxElfWOwJ44LUp2iYr3+YblKNnpYFDUNfxHjEET2FlYv1yjjzPSVfnmbVUi3Vi1jbQrKk2PoRIG/nzDnulMI3SfIkzrksPjsL2ZNdVoem6hKs/aWAQSuZN8ik+y8SiDsiBbFXhJenfCTHS0s5bNssLVIJnTBE0BWfeRKm3dWpbbBr7EOMRdmlfeKHGQCVp5fl4Q9aWGGPLBGb2T3X0eHNlEGZ4mY05K/km1d3zIW3pycyoqgB5Njo+BlA5gyEp96AZ3f/4TZZPnExeNTadGmxBJEqlqMNJYUquH/3UHIy+oNtwsiYnXgJEsTugfpXFACey39yUf0cbsbS0ys9sydthGqAWyzEJmlIOBOmsYkA5Fxo4kxKS8pZGNrIcmfqxM9jqx3X4EDGMkJy5qskFqDngcrUX4OvH/qH9oJqnPFoV4P2paCw== storyapp-20250922"
echo "EOF"
echo ""

echo "# 4. 设置正确的权限"
echo "chmod 600 ~/.ssh/authorized_keys"
echo ""

echo "# 5. 验证设置"
echo "echo '验证SSH目录:'"
echo "ls -la ~/.ssh/"
echo "echo '验证公钥内容:'"
echo "cat ~/.ssh/authorized_keys"
echo "echo '确认服务器信息:'"
echo "echo \"主机名: \$(hostname)\""
echo "echo \"IP地址: \$(hostname -I)\""
echo ""

echo "===== 命令结束 ====="
