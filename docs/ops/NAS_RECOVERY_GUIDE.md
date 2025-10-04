# NAS 公网访问恢复指南

## 🎯 目标
通过向日葵远程到家里台式机，检查和恢复 NAS 的公网访问（SSH/9000端口）

## 📋 操作步骤清单

### 1️⃣ 检查内网 SSH 和服务

在台式机上打开 **PowerShell** 或 **WSL/终端**：

```powershell
# 测试内网 SSH 连接
ssh yuanhaizhou@192.168.1.7

# 测试内网 9000 端口服务
curl -I http://192.168.1.7:9000/

# 如果 curl 不可用，使用 PowerShell 替代
Invoke-WebRequest -Uri "http://192.168.1.7:9000/" -Method Head
```

**预期结果**：
- SSH 连接成功 ✅
- 9000 端口返回 200/302/403 → 服务正常
- 9000 端口返回 503 → 需要重启 NAS 上的应用

### 2️⃣ 确认家里公网 IP

```powershell
# 方法1：使用 nslookup
nslookup myip.opendns.com resolver1.opendns.com

# 方法2：使用 PowerShell
Invoke-RestMethod -Uri "https://ifconfig.me"

# 方法3：浏览器访问
# https://ifconfig.me
```

**对比检查**：
- 当前公网 IP 是否与域名 `fnos.dandanbaba.xyz` 解析的 `122.231.213.137` 一致
- 如果不一致，需要更新 DDNS 记录

### 3️⃣ 检查路由器 NAT 映射

1. **登录路由器管理界面**：
   - 浏览器访问：`http://192.168.1.1` 或运营商提供的管理地址
   - 用户名/密码：查看路由器背面标签

2. **查找端口转发配置**：
   - 路径：`高级设置` → `端口转发` / `虚拟服务器` / `NAT`
   - 或：`网络设置` → `端口映射`

3. **检查/添加规则**：
   ```
   规则1：外网 TCP 60022 → 内网 192.168.1.7:22
   规则2：外网 TCP 9000  → 内网 192.168.1.7:9000
   ```

4. **保存并重启**：
   - 保存配置
   - 重启路由器或重启 NAT 服务

### 4️⃣ 公网验证

在台式机上测试：

```powershell
# 测试新端口 SSH
ssh -p 60022 yuanhaizhou@122.231.213.137

# 测试 9000 端口
curl -I http://122.231.213.137:9000/

# PowerShell 替代
Test-NetConnection -ComputerName 122.231.213.137 -Port 60022
Test-NetConnection -ComputerName 122.231.213.137 -Port 9000
```

### 5️⃣ 长期兜底方案

#### A. 安装 Tailscale（推荐）

**在台式机上**：
```powershell
# Windows 安装
winget install Tailscale.Tailscale

# 或下载安装包
# https://tailscale.com/download/windows
```

**在 NAS 上**（通过 SSH 连接）：
```bash
# 安装 Tailscale
curl -fsSL https://tailscale.com/install.sh | sh

# 启动服务
sudo tailscale up

# 查看状态
tailscale status
```

#### B. 修改 NAS SSH 端口

在 NAS 上执行：

```bash
# 编辑 SSH 配置
sudo nano /etc/ssh/sshd_config

# 修改端口
Port 60022

# 重启 SSH 服务
sudo systemctl restart sshd

# 更新防火墙规则
sudo ufw allow 60022/tcp
sudo ufw reload

# 验证新端口
sudo netstat -tlnp | grep 60022
```

#### C. 创建健康监控脚本

在 NAS 上创建监控脚本：

```bash
# 创建脚本目录
mkdir -p ~/scripts

# 创建监控脚本
cat > ~/scripts/network_monitor.sh << 'EOF'
#!/bin/bash

# 配置
PUBLIC_IP="122.231.213.137"
DOMAIN="fnos.dandanbaba.xyz"
SSH_PORT="60022"
SERVICE_PORT="9000"
LOG_FILE="/var/log/network_monitor.log"

# 日志函数
log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" >> $LOG_FILE
}

# 检查公网 IP
check_public_ip() {
    CURRENT_IP=$(curl -s https://ifconfig.me)
    if [ "$CURRENT_IP" != "$PUBLIC_IP" ]; then
        log "WARNING: Public IP changed from $PUBLIC_IP to $CURRENT_IP"
        return 1
    fi
    return 0
}

# 检查端口连通性
check_port() {
    local port=$1
    local name=$2
    
    if nc -z $PUBLIC_IP $port 2>/dev/null; then
        log "OK: $name port $port is accessible"
        return 0
    else
        log "ERROR: $name port $port is not accessible"
        return 1
    fi
}

# 主检查流程
main() {
    log "Starting network health check"
    
    check_public_ip
    check_port $SSH_PORT "SSH"
    check_port $SERVICE_PORT "Service"
    
    log "Network health check completed"
}

main
EOF

# 设置执行权限
chmod +x ~/scripts/network_monitor.sh

# 添加到 crontab（每5分钟检查一次）
(crontab -l 2>/dev/null; echo "*/5 * * * * ~/scripts/network_monitor.sh") | crontab -
```

## 🔧 故障排除

### 常见问题

1. **SSH 连接被拒绝**：
   - 检查 SSH 服务状态：`sudo systemctl status sshd`
   - 检查防火墙：`sudo ufw status`
   - 检查端口监听：`sudo netstat -tlnp | grep ssh`

2. **9000 端口无响应**：
   - 检查服务状态：`sudo systemctl status minio`（如果是 MinIO）
   - 检查 Docker 容器：`docker ps`
   - 重启相关服务

3. **路由器配置问题**：
   - 确认内网 IP 正确
   - 检查端口范围设置
   - 尝试重启路由器

### 应急联系

如果所有方法都失败，可以通过以下方式联系：
- 向日葵远程控制
- 手机热点连接 NAS
- 联系网络运营商

## 📝 操作记录

请记录每次操作的执行时间和结果：

```
日期: ___________
操作: ___________
结果: ___________
备注: ___________
```

---

**注意**：执行任何网络配置前，请确保有备用访问方式，避免完全失去对设备的控制。
