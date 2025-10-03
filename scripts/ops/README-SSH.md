# SSH免密登录设置指南

本指南将帮助你设置到阿里云服务器的免密登录，简化部署和服务器管理。

## 服务器信息

- **服务器地址**: 47.120.74.212
- **用户名**: root
- **项目路径**: /root/projects/storyapp

## 快速开始

### 一键设置（推荐）

```bash
# 运行一键设置脚本
./scripts/setup-ssh-all.sh
```

这个脚本会：
1. 生成SSH密钥对（如果不存在）
2. 设置SSH配置文件
3. 尝试自动复制公钥到服务器
4. 测试免密登录

### 手动设置

如果自动复制失败，请按以下步骤手动操作：

1. **复制公钥内容**（从脚本输出中复制）
2. **登录服务器**：
   ```bash
   ssh root@47.120.74.212
   ```
3. **在服务器上执行**：
   ```bash
   mkdir -p ~/.ssh
   chmod 700 ~/.ssh
   echo '你的公钥内容' >> ~/.ssh/authorized_keys
   chmod 600 ~/.ssh/authorized_keys
   ```
4. **退出服务器**：
   ```bash
   exit
   ```
5. **测试连接**：
   ```bash
   ssh storyapp-server
   ```

## 脚本说明

### 1. setup-ssh-key.sh
- 生成SSH密钥对
- 显示公钥内容
- 提供手动复制指导

### 2. setup-ssh-config.sh
- 设置SSH配置文件
- 创建 `storyapp-server` 别名
- 配置连接参数

### 3. setup-ssh-all.sh
- 一键完成所有设置
- 自动测试连接
- 提供完整的使用指导

### 4. deploy-with-ssh.sh
- 使用免密登录部署项目
- 支持多种部署模式
- 提供服务器管理功能

## 使用方法

### 连接服务器

```bash
# 使用别名（推荐）
ssh storyapp-server

# 使用完整地址
ssh root@47.120.74.212
```

### 部署项目

```bash
# 运行部署脚本
./scripts/deploy-with-ssh.sh
```

部署选项：
1. **完整部署** - 构建+上传+重启
2. **仅上传代码** - 不重启服务
3. **仅重启服务** - 不更新代码
4. **查看服务器状态**
5. **查看服务器日志**

### 文件同步

```bash
# 同步整个项目
rsync -avz --delete \
    --exclude 'node_modules' \
    --exclude '.git' \
    ./ storyapp-server:/root/projects/storyapp/

# 复制单个文件
scp file.txt storyapp-server:/root/projects/storyapp/
```

### 服务器管理

```bash
# 查看Docker状态
ssh storyapp-server 'cd /root/projects/storyapp && docker compose -f docker-compose.yml ps'

# 查看应用日志
ssh storyapp-server 'cd /root/projects/storyapp && docker compose -f docker-compose.yml logs -f app'

# 重启服务
ssh storyapp-server 'cd /root/projects/storyapp && docker compose -f docker-compose.yml restart'

# 查看系统资源
ssh storyapp-server 'df -h && free -h && uptime'
```

## SSH配置说明

配置文件位置：`~/.ssh/config`

```bash
Host storyapp-server
    HostName 47.120.74.212
    User root
    IdentityFile ~/.ssh/id_rsa
    ServerAliveInterval 60      # 每60秒发送保活包
    ServerAliveCountMax 3       # 最多3次保活失败
    StrictHostKeyChecking no    # 跳过主机密钥检查
    UserKnownHostsFile /dev/null # 不保存主机密钥
```

## 故障排除

### 连接被拒绝

1. 检查服务器是否运行
2. 确认IP地址和端口正确
3. 检查防火墙设置

### 免密登录失败

1. 确认公钥已正确复制到服务器
2. 检查文件权限：
   ```bash
   chmod 700 ~/.ssh
   chmod 600 ~/.ssh/authorized_keys
   ```
3. 检查SSH服务配置

### 权限问题

```bash
# 修复SSH目录权限
chmod 700 ~/.ssh
chmod 600 ~/.ssh/id_rsa
chmod 644 ~/.ssh/id_rsa.pub
chmod 600 ~/.ssh/config
```

## 安全建议

1. **定期更新SSH密钥**
2. **使用强密码保护私钥**
3. **限制SSH访问IP**
4. **定期检查服务器日志**
5. **保持系统和软件更新**

## 常用命令速查

```bash
# 连接
ssh storyapp-server

# 部署
./scripts/deploy-with-ssh.sh

# 同步代码
rsync -avz --delete ./ storyapp-server:/root/projects/storyapp/

# 查看状态
ssh storyapp-server 'cd /root/projects/storyapp && docker compose -f docker-compose.yml ps'

# 查看日志
ssh storyapp-server 'cd /root/projects/storyapp && docker compose -f docker-compose.yml logs -f'

# 重启服务
ssh storyapp-server 'cd /root/projects/storyapp && docker compose -f docker-compose.yml restart'
```

## 支持

如果遇到问题，请检查：
1. 网络连接
2. 服务器状态
3. SSH配置
4. 文件权限

更多帮助请参考项目文档或联系管理员。
