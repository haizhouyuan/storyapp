# NAS 公网访问恢复自动化脚本

## Windows PowerShell 脚本 (在台式机上运行)

```powershell
# NAS_Recovery_Script.ps1
# 在台式机上以管理员权限运行此脚本

param(
    [string]$NAS_IP = "192.168.1.7",
    [string]$NAS_USER = "yuanhaizhou",
    [string]$PUBLIC_IP = "122.231.213.137",
    [string]$DOMAIN = "fnos.dandanbaba.xyz",
    [int]$SSH_PORT = 60022,
    [int]$SERVICE_PORT = 9000
)

# 设置控制台编码
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "=== NAS 公网访问恢复脚本 ===" -ForegroundColor Green
Write-Host "开始时间: $(Get-Date)" -ForegroundColor Yellow

# 1. 检查内网连接
Write-Host "`n1️⃣ 检查内网连接..." -ForegroundColor Cyan

# 检查内网 SSH
Write-Host "测试内网 SSH 连接..." -ForegroundColor White
try {
    $sshTest = Test-NetConnection -ComputerName $NAS_IP -Port 22 -WarningAction SilentlyContinue
    if ($sshTest.TcpTestSucceeded) {
        Write-Host "✅ 内网 SSH (22端口) 连接正常" -ForegroundColor Green
    } else {
        Write-Host "❌ 内网 SSH (22端口) 连接失败" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ SSH 测试出错: $($_.Exception.Message)" -ForegroundColor Red
}

# 检查内网 9000 端口
Write-Host "测试内网 9000 端口服务..." -ForegroundColor White
try {
    $serviceTest = Test-NetConnection -ComputerName $NAS_IP -Port $SERVICE_PORT -WarningAction SilentlyContinue
    if ($serviceTest.TcpTestSucceeded) {
        Write-Host "✅ 内网 9000 端口服务正常" -ForegroundColor Green
    } else {
        Write-Host "❌ 内网 9000 端口服务异常" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ 9000端口测试出错: $($_.Exception.Message)" -ForegroundColor Red
}

# 2. 检查公网 IP
Write-Host "`n2️⃣ 检查公网 IP..." -ForegroundColor Cyan

try {
    $currentPublicIP = Invoke-RestMethod -Uri "https://ifconfig.me" -TimeoutSec 10
    Write-Host "当前公网 IP: $currentPublicIP" -ForegroundColor White
    
    if ($currentPublicIP -eq $PUBLIC_IP) {
        Write-Host "✅ 公网 IP 与域名解析一致" -ForegroundColor Green
    } else {
        Write-Host "⚠️  公网 IP 已变更，需要更新 DDNS" -ForegroundColor Yellow
        Write-Host "   域名解析: $PUBLIC_IP" -ForegroundColor White
        Write-Host "   当前公网: $currentPublicIP" -ForegroundColor White
    }
} catch {
    Write-Host "❌ 无法获取公网 IP: $($_.Exception.Message)" -ForegroundColor Red
}

# 3. 测试公网端口
Write-Host "`n3️⃣ 测试公网端口访问..." -ForegroundColor Cyan

# 测试公网 SSH
Write-Host "测试公网 SSH 连接..." -ForegroundColor White
try {
    $publicSSHTest = Test-NetConnection -ComputerName $PUBLIC_IP -Port $SSH_PORT -WarningAction SilentlyContinue
    if ($publicSSHTest.TcpTestSucceeded) {
        Write-Host "✅ 公网 SSH ($SSH_PORT端口) 连接正常" -ForegroundColor Green
    } else {
        Write-Host "❌ 公网 SSH ($SSH_PORT端口) 连接失败" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ 公网 SSH 测试出错: $($_.Exception.Message)" -ForegroundColor Red
}

# 测试公网 9000 端口
Write-Host "测试公网 9000 端口服务..." -ForegroundColor White
try {
    $publicServiceTest = Test-NetConnection -ComputerName $PUBLIC_IP -Port $SERVICE_PORT -WarningAction SilentlyContinue
    if ($publicServiceTest.TcpTestSucceeded) {
        Write-Host "✅ 公网 9000 端口服务正常" -ForegroundColor Green
    } else {
        Write-Host "❌ 公网 9000 端口服务异常" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ 公网 9000端口测试出错: $($_.Exception.Message)" -ForegroundColor Red
}

# 4. 测试域名解析
Write-Host "`n4️⃣ 测试域名解析..." -ForegroundColor Cyan

try {
    $dnsResult = Resolve-DnsName -Name $DOMAIN -ErrorAction Stop
    $resolvedIP = $dnsResult[0].IPAddress
    Write-Host "域名 $DOMAIN 解析到: $resolvedIP" -ForegroundColor White
    
    if ($resolvedIP -eq $PUBLIC_IP) {
        Write-Host "✅ 域名解析正确" -ForegroundColor Green
    } else {
        Write-Host "⚠️  域名解析与预期不符" -ForegroundColor Yellow
    }
} catch {
    Write-Host "❌ 域名解析失败: $($_.Exception.Message)" -ForegroundColor Red
}

# 5. 生成诊断报告
Write-Host "`n5️⃣ 生成诊断报告..." -ForegroundColor Cyan

$report = @"
=== NAS 公网访问诊断报告 ===
检查时间: $(Get-Date)
NAS 内网 IP: $NAS_IP
预期公网 IP: $PUBLIC_IP
域名: $DOMAIN

内网连接状态:
- SSH (22端口): $(if ($sshTest.TcpTestSucceeded) { "正常" } else { "异常" })
- 服务 (9000端口): $(if ($serviceTest.TcpTestSucceeded) { "正常" } else { "异常" })

公网连接状态:
- SSH ($SSH_PORT端口): $(if ($publicSSHTest.TcpTestSucceeded) { "正常" } else { "异常" })
- 服务 (9000端口): $(if ($publicServiceTest.TcpTestSucceeded) { "正常" } else { "异常" })

网络信息:
- 当前公网 IP: $currentPublicIP
- 域名解析 IP: $resolvedIP

建议操作:
"@

Write-Host $report -ForegroundColor White

# 6. 提供修复建议
Write-Host "`n6️⃣ 修复建议..." -ForegroundColor Cyan

if (-not $publicSSHTest.TcpTestSucceeded) {
    Write-Host "🔧 SSH 端口问题修复建议:" -ForegroundColor Yellow
    Write-Host "   1. 检查路由器端口转发: 外网 $SSH_PORT → 内网 $NAS_IP:22" -ForegroundColor White
    Write-Host "   2. 确认 NAS SSH 服务运行: sudo systemctl status sshd" -ForegroundColor White
    Write-Host "   3. 检查防火墙规则: sudo ufw status" -ForegroundColor White
}

if (-not $publicServiceTest.TcpTestSucceeded) {
    Write-Host "🔧 9000端口问题修复建议:" -ForegroundColor Yellow
    Write-Host "   1. 检查路由器端口转发: 外网 9000 → 内网 $NAS_IP:9000" -ForegroundColor White
    Write-Host "   2. 确认服务运行状态: sudo systemctl status minio" -ForegroundColor White
    Write-Host "   3. 检查 Docker 容器: docker ps" -ForegroundColor White
}

if ($currentPublicIP -ne $PUBLIC_IP) {
    Write-Host "🔧 IP 变更处理建议:" -ForegroundColor Yellow
    Write-Host "   1. 更新 DDNS 记录到新 IP: $currentPublicIP" -ForegroundColor White
    Write-Host "   2. 等待 DNS 传播 (通常 5-30 分钟)" -ForegroundColor White
}

Write-Host "`n=== 脚本执行完成 ===" -ForegroundColor Green
Write-Host "结束时间: $(Get-Date)" -ForegroundColor Yellow

# 保存报告到文件
$report | Out-File -FilePath "NAS_Diagnostic_Report_$(Get-Date -Format 'yyyyMMdd_HHmmss').txt" -Encoding UTF8
Write-Host "`n诊断报告已保存到: NAS_Diagnostic_Report_$(Get-Date -Format 'yyyyMMdd_HHmmss').txt" -ForegroundColor Green
```

## Linux Bash 脚本 (在 NAS 上运行)

```bash
#!/bin/bash
# NAS_SSH_Port_Change.sh
# 在 NAS 上运行此脚本来修改 SSH 端口

set -e

NAS_USER="yuanhaizhou"
NEW_SSH_PORT="60022"
OLD_SSH_PORT="22"

echo "=== NAS SSH 端口修改脚本 ==="
echo "开始时间: $(date)"

# 1. 备份原始配置
echo "1️⃣ 备份 SSH 配置文件..."
sudo cp /etc/ssh/sshd_config /etc/ssh/sshd_config.backup.$(date +%Y%m%d_%H%M%S)
echo "✅ SSH 配置已备份"

# 2. 修改 SSH 端口
echo "2️⃣ 修改 SSH 端口到 $NEW_SSH_PORT..."
sudo sed -i "s/#Port 22/Port $NEW_SSH_PORT/" /etc/ssh/sshd_config
sudo sed -i "s/Port 22/Port $NEW_SSH_PORT/" /etc/ssh/sshd_config

# 确保端口配置存在
if ! grep -q "^Port $NEW_SSH_PORT" /etc/ssh/sshd_config; then
    echo "Port $NEW_SSH_PORT" | sudo tee -a /etc/ssh/sshd_config
fi

echo "✅ SSH 端口已修改为 $NEW_SSH_PORT"

# 3. 更新防火墙规则
echo "3️⃣ 更新防火墙规则..."
sudo ufw allow $NEW_SSH_PORT/tcp
sudo ufw reload
echo "✅ 防火墙规则已更新"

# 4. 测试配置
echo "4️⃣ 测试 SSH 配置..."
sudo sshd -t
if [ $? -eq 0 ]; then
    echo "✅ SSH 配置语法正确"
else
    echo "❌ SSH 配置有误，恢复备份..."
    sudo cp /etc/ssh/sshd_config.backup.$(date +%Y%m%d_%H%M%S) /etc/ssh/sshd_config
    exit 1
fi

# 5. 重启 SSH 服务
echo "5️⃣ 重启 SSH 服务..."
sudo systemctl restart sshd
sudo systemctl status sshd --no-pager

if [ $? -eq 0 ]; then
    echo "✅ SSH 服务重启成功"
else
    echo "❌ SSH 服务重启失败"
    exit 1
fi

# 6. 验证新端口
echo "6️⃣ 验证新端口..."
sleep 2
if netstat -tlnp | grep -q ":$NEW_SSH_PORT "; then
    echo "✅ SSH 服务正在监听端口 $NEW_SSH_PORT"
else
    echo "❌ SSH 服务未在端口 $NEW_SSH_PORT 监听"
fi

echo ""
echo "=== 修改完成 ==="
echo "结束时间: $(date)"
echo ""
echo "🔧 后续操作建议:"
echo "1. 在路由器中添加端口转发: 外网 $NEW_SSH_PORT → 内网 $(hostname -I | awk '{print $1}'):$NEW_SSH_PORT"
echo "2. 测试新端口连接: ssh -p $NEW_SSH_PORT $NAS_USER@$(hostname -I | awk '{print $1}')"
echo "3. 确认连接正常后，可以关闭旧端口 22 的防火墙规则"
```

## Tailscale 安装脚本

```bash
#!/bin/bash
# Tailscale_Install.sh
# 在台式机和 NAS 上都运行此脚本

echo "=== Tailscale 安装脚本 ==="

# 检测操作系统
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    echo "检测到 Linux 系统"
    
    # 安装 Tailscale
    curl -fsSL https://tailscale.com/install.sh | sh
    
    # 启动 Tailscale
    sudo tailscale up
    
    # 显示状态
    tailscale status
    
elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "win32" ]]; then
    echo "检测到 Windows 系统"
    echo "请手动下载并安装 Tailscale:"
    echo "https://tailscale.com/download/windows"
    
else
    echo "不支持的操作系统: $OSTYPE"
    exit 1
fi

echo "✅ Tailscale 安装完成"
echo "请登录同一账号以建立连接"
```

## 使用方法

1. **在台式机上**：
   ```powershell
   # 以管理员身份运行 PowerShell
   Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
   .\NAS_Recovery_Script.ps1
   ```

2. **在 NAS 上**：
   ```bash
   chmod +x NAS_SSH_Port_Change.sh
   ./NAS_SSH_Port_Change.sh
   ```

3. **安装 Tailscale**：
   ```bash
   chmod +x Tailscale_Install.sh
   ./Tailscale_Install.sh
   ```

这些脚本会自动执行所有检查和修复步骤，并生成详细的诊断报告。您只需要在相应的设备上运行即可！
