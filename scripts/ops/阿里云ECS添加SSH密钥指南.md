# 阿里云ECS添加SSH密钥指南

## 🔐 问题描述

服务器 `47.120.74.212` 已禁用密码登录，只允许SSH密钥认证。需要通过阿里云控制台添加SSH公钥。

## 🔑 你的SSH公钥

```
ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAACAQCTnNkbs+K/3SoOix5KCBiNL9hUGLkFOkRBeMVtangyDVvsu8FTfallIPBbz6J42yTfXEfv38/H/9XqMvPI/Z3NVYfpp+t+KusxjyzguP6cTovLpdslwRcsl/Ehte3YlJlZJs4LGCSPkcfh+A/bkAVyK+E1NE9QPIvR488co3thPsFaONUtOLGF0yrqe1L5XJlax2XajDbIe+Z9oQsZ3sJsmU48j7Ji0T9ba70pk88gqYfrU+vztOuqg8/tdLxElfWOwJ44LUp2iYr3+YblKNnpYFDUNfxHjEET2FlYv1yjjzPSVfnmbVUi3Vi1jbQrKk2PoRIG/nzDnulMI3SfIkzrksPjsL2ZNdVoem6hKs/aWAQSuZN8ik+y8SiDsiBbFXhJenfCTHS0s5bNssLVIJnTBE0BWfeRKm3dWpbbBr7EOMRdmlfeKHGQCVp5fl4Q9aWGGPLBGb2T3X0eHNlEGZ4mY05K/km1d3zIW3pycyoqgB5Njo+BlA5gyEp96AZ3f/4TZZPnExeNTadGmxBJEqlqMNJYUquH/3UHIy+oNtwsiYnXgJEsTugfpXFACey39yUf0cbsbS0ys9sydthGqAWyzEJmlIOBOmsYkA5Fxo4kxKS8pZGNrIcmfqxM9jqx3X4EDGMkJy5qskFqDngcrUX4OvH/qH9oJqnPFoV4P2paCw== storyapp-20250922
```

## 💻 方案一：阿里云ECS控制台（推荐）

### 步骤1：登录阿里云控制台
1. 访问 [阿里云控制台](https://ecs.console.aliyun.com)
2. 登录你的阿里云账户

### 步骤2：找到你的ECS实例
1. 在ECS控制台中，找到服务器 `47.120.74.212`
2. 记录实例ID和实例名称

### 步骤3：创建密钥对（如果没有）
1. 在左侧菜单中，点击 **网络与安全** > **密钥对**
2. 点击 **创建密钥对**
3. 选择 **导入已有密钥对**
4. 输入密钥对名称（例如：`storyapp-key`）
5. 将上面的公钥内容粘贴到 **公钥内容** 字段
6. 点击 **确定**

### 步骤4：绑定密钥对到实例
1. 返回 **实例列表**
2. 找到你的服务器实例
3. 点击 **更多** > **密钥对** > **绑定密钥对**
4. 选择刚才创建的密钥对
5. 点击 **确定**

### 步骤5：重启实例
1. 选择实例，点击 **重启**
2. 等待实例重启完成

## 🖥️ 方案二：VNC远程连接

### 步骤1：通过VNC连接
1. 在ECS控制台中，找到你的实例
2. 点击 **远程连接** > **VNC远程连接**
3. 输入VNC密码（首次使用需要设置）

### 步骤2：在服务器上执行命令
```bash
# 创建SSH目录
mkdir -p ~/.ssh
chmod 700 ~/.ssh

# 添加公钥（注意：复制完整的公钥内容）
cat > ~/.ssh/authorized_keys << 'EOF'
ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAACAQCTnNkbs+K/3SoOix5KCBiNL9hUGLkFOkRBeMVtangyDVvsu8FTfallIPBbz6J42yTfXEfv38/H/9XqMvPI/Z3NVYfpp+t+KusxjyzguP6cTovLpdslwRcsl/Ehte3YlJlZJs4LGCSPkcfh+A/bkAVyK+E1NE9QPIvR488co3thPsFaONUtOLGF0yrqe1L5XJlax2XajDbIe+Z9oQsZ3sJsmU48j7Ji0T9ba70pk88gqYfrU+vztOuqg8/tdLxElfWOwJ44LUp2iYr3+YblKNnpYFDUNfxHjEET2FlYv1yjjzPSVfnmbVUi3Vi1jbQrKk2PoRIG/nzDnulMI3SfIkzrksPjsL2ZNdVoem6hKs/aWAQSuZN8ik+y8SiDsiBbFXhJenfCTHS0s5bNssLVIJnTBE0BWfeRKm3dWpbbBr7EOMRdmlfeKHGQCVp5fl4Q9aWGGPLBGb2T3X0eHNlEGZ4mY05K/km1d3zIW3pycyoqgB5Njo+BlA5gyEp96AZ3f/4TZZPnExeNTadGmxBJEqlqMNJYUquH/3UHIy+oNtwsiYnXgJEsTugfpXFACey39yUf0cbsbS0ys9sydthGqAWyzEJmlIOBOmsYkA5Fxo4kxKS8pZGNrIcmfqxM9jqx3X4EDGMkJy5qskFqDngcrUX4OvH/qH9oJqnPFoV4P2paCw== storyapp-20250922
EOF

# 设置正确的权限
chmod 600 ~/.ssh/authorized_keys

# 验证设置
ls -la ~/.ssh/
cat ~/.ssh/authorized_keys
```

## 🔧 方案三：重置实例密码

如果上述方案都不可行，可以考虑重置实例：

### 步骤1：停止实例
1. 在ECS控制台选择实例
2. 点击 **停止**

### 步骤2：重置密码
1. 点击 **更多** > **密码/密钥** > **重置实例密码**
2. 设置新的root密码
3. 启动实例

### 步骤3：使用密码登录并设置密钥
```bash
# 使用新密码登录
ssh root@47.120.74.212

# 然后按方案二的步骤设置密钥
```

## ✅ 测试连接

设置完成后，测试连接：

```bash
# 测试连接
ssh storyapp-server

# 如果成功，应该看到服务器提示符
# 然后可以运行部署脚本
./scripts/deploy-with-ssh.sh
```

## 🔍 故障排除

### 连接仍然失败
```bash
# 详细调试信息
ssh -vvv root@47.120.74.212

# 检查本地密钥
ls -la ~/.ssh/

# 测试特定密钥
ssh -i ~/.ssh/id_rsa root@47.120.74.212
```

### 权限问题
确保服务器上的文件权限正确：
```bash
chmod 700 ~/.ssh
chmod 600 ~/.ssh/authorized_keys
```

### 检查SSH服务配置
```bash
# 在服务器上检查SSH配置
sudo cat /etc/ssh/sshd_config | grep -E "(PubkeyAuthentication|PasswordAuthentication|PermitRootLogin)"

# 重启SSH服务（如果修改了配置）
sudo systemctl restart sshd
```

## 📞 获取帮助

如果以上方案都无法解决问题：

1. **联系阿里云技术支持**
   - 提交工单说明无法SSH连接
   - 提供实例ID和错误信息

2. **检查安全组设置**
   - 确保22端口对你的IP开放
   - 检查防火墙规则

3. **查看系统日志**
   - 通过VNC连接查看SSH日志
   - `/var/log/auth.log` 或 `/var/log/secure`

## 🎯 下一步

设置成功后：
1. 使用 `ssh storyapp-server` 连接
2. 运行 `./scripts/deploy-with-ssh.sh` 部署项目
3. 检查服务状态：`curl http://47.120.74.212:5001/api/health`
