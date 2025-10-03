# 🚀 NAS 公网访问快速恢复指南

## 立即执行步骤（5分钟内完成）

### 第一步：在台式机上打开 PowerShell

```powershell
# 复制粘贴以下命令到 PowerShell 中执行

# 检查内网连接
Write-Host "=== 检查内网连接 ===" -ForegroundColor Green
Test-NetConnection -ComputerName 192.168.1.7 -Port 22
Test-NetConnection -ComputerName 192.168.1.7 -Port 9000

# 检查公网IP
Write-Host "=== 检查公网IP ===" -ForegroundColor Green
$currentIP = Invoke-RestMethod -Uri "https://ifconfig.me"
Write-Host "当前公网IP: $currentIP" -ForegroundColor Yellow
Write-Host "预期公网IP: 122.231.213.137" -ForegroundColor Yellow

# 测试公网端口
Write-Host "=== 测试公网端口 ===" -ForegroundColor Green
Test-NetConnection -ComputerName 122.231.213.137 -Port 60022
Test-NetConnection -ComputerName 122.231.213.137 -Port 9000
```

### 第二步：根据结果执行修复

**如果内网连接正常，但公网连接失败：**

1. **登录路由器**（浏览器访问 `http://192.168.1.1`）
2. **找到端口转发设置**
3. **添加/检查以下规则：**
   ```
   规则1: 外网 60022 → 内网 192.168.1.7:22
   规则2: 外网 9000  → 内网 192.168.1.7:9000
   ```
4. **保存并重启路由器**

**如果公网IP已变更：**

1. **更新DDNS记录**到新的公网IP
2. **等待5-30分钟**DNS传播

### 第三步：在NAS上修改SSH端口

通过向日葵连接NAS后，在终端执行：

```bash
# 修改SSH端口
sudo nano /etc/ssh/sshd_config
# 找到 #Port 22 这一行，改为：
# Port 60022

# 重启SSH服务
sudo systemctl restart sshd

# 更新防火墙
sudo ufw allow 60022/tcp
sudo ufw reload
```

### 第四步：验证修复结果

在台式机上再次执行：

```powershell
# 测试新端口
ssh -p 60022 yuanhaizhou@122.231.213.137

# 测试9000端口
Test-NetConnection -ComputerName 122.231.213.137 -Port 9000
```

## 🔧 应急方案：安装 Tailscale

如果上述方法都失败，安装Tailscale作为备用通道：

**在台式机上：**
1. 访问 https://tailscale.com/download/windows
2. 下载并安装
3. 登录账号

**在NAS上：**
```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
```

## 📞 需要帮助？

如果遇到问题，请告诉我：
1. PowerShell命令的执行结果
2. 路由器配置截图
3. 具体的错误信息

我会根据结果提供针对性的解决方案！
