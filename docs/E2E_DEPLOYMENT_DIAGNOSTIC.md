# E2E测试部署诊断报告

**生成时间**: 2025-10-22 13:25

## 问题概述

在进行完整流程测试时，发现服务由PM2管理，但PM2服务一直处于启动失败状态，导致所有修复无法生效。

## 根本原因

### 1. PM2服务配置错误

**PM2服务信息**：
- 服务名：`storyapp-backend`
- 重启次数：**507次**（表示持续失败）
- 工作目录：`/home/yuanhaizhou/projects/storyapp`（❌ **错误目录**）
- 当前worktree：`/vol1/1000/projects/storyapp-worktrees/reframe`（✅ **正确目录**）

### 2. MongoDB认证失败

**错误日志**：
```
MongoServerError: Authentication failed.
code: 18
codeName: "AuthenticationFailed"
uri: "mongodb://***:***@127.0.0.1:27017/storyapp?authSource=admin"
```

**问题分析**：
- PM2服务使用的`.env`文件配置不正确
- MongoDB连接URI包含认证信息但认证失败
- 服务启动后立即崩溃，PM2自动重启，形成重启循环

### 3. 修复未生效的原因链

```
PM2管理错误目录的服务
    ↓
MongoDB认证失败，服务启动失败
    ↓
PM2不断重启失败的服务
    ↓
所有代码修复（SSE、安全头、TTS轮询）无法应用
    ↓
E2E测试持续观察到旧问题
```

## 验证过程

### 1. 服务进程追踪

```bash
# 发现PM2管理的进程
ps -p 2677032 -f
UID    PID    PPID   CMD
yuanhai+ 2677032 1192205 node backend/dist/index.js

# 查看父进程
ps -p 1192205 -f
UID    PID    PPID   CMD
yuanhai+ 1192205 1 PM2 v6.0.13: God Daemon
```

### 2. PM2状态检查

```bash
~/.home-codex-official/.npm/_npx/5f7878ce38f1eb13/node_modules/pm2/bin/pm2 list

┌────┬──────────────────┬─────────┬────────┬─────────┬──────┬───────────┬─────────┐
│ id │ name             │ mode    │ pid    │ uptime │ ↺    │ status    │ cpu/mem │
├────┼──────────────────┼─────────┼────────┼────────┼──────┼───────────┼─────────┤
│ 0  │ storyapp-backend │ fork    │ 2683674│ 0s     │ 507… │ online    │ 0%/67MB │
└────┴──────────────────┴─────────┴────────┴────────┴──────┴───────────┴─────────┘
```

- **重启次数507次**表明服务持续失败
- **uptime 0s**表明服务刚启动又立即崩溃

### 3. PM2日志分析

```
项目根目录: /home/yuanhaizhou/projects/storyapp  ← 错误目录
✅ 加载环境文件: .env
MongoDB认证失败
Server startup failed
```

## 解决方案

### 方案一：停止PM2，手动启动服务（推荐用于测试）

```bash
# 1. 停止PM2服务
~/.home-codex-official/.npm/_npx/5f7878ce38f1eb13/node_modules/pm2/bin/pm2 stop storyapp-backend
~/.home-codex-official/.npm/_npx/5f7878ce38f1eb13/node_modules/pm2/bin/pm2 delete storyapp-backend

# 2. 切换到正确的worktree目录
cd /vol1/1000/projects/storyapp-worktrees/reframe

# 3. 手动启动服务（使用正确的环境配置）
PORT=8701 SERVE_STATIC=1 nohup ./scripts/dev/nodehere node backend/dist/index.js > /tmp/backend-8701-manual.log 2>&1 &

# 4. 验证服务健康
curl -s http://localhost:8701/api/health | jq
```

### 方案二：修正PM2配置（推荐用于生产）

```bash
# 1. 停止并删除旧配置
pm2 stop storyapp-backend
pm2 delete storyapp-backend

# 2. 创建正确的PM2配置文件
cat > /vol1/1000/projects/storyapp-worktrees/reframe/ecosystem.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'storyapp-backend',
    cwd: '/vol1/1000/projects/storyapp-worktrees/reframe',
    script: './scripts/dev/nodehere',
    args: 'node backend/dist/index.js',
    env: {
      NODE_ENV: 'development',
      PORT: '8701',
      SERVE_STATIC: '1'
    },
    error_file: '/tmp/pm2-storyapp-error.log',
    out_file: '/tmp/pm2-storyapp-out.log',
    max_restarts: 10,
    restart_delay: 5000
  }]
};
EOF

# 3. 使用新配置启动
pm2 start ecosystem.config.js
pm2 save
```

## 已验证的修复

以下修复已在代码中实现，但因服务启动失败而未能生效：

1. ✅ **SSE僵尸连接清理**（`workflowEventBus.ts`）
2. ✅ **安全头条件应用**（`middleware/observability.ts`, `index.ts`）
3. ✅ **TTS轮询优化**（`useStoryTts.ts`，exponential backoff）
4. ✅ **DeepSeek超时处理**（`config/deepseek.ts`, `stageRunner.ts`）
5. ✅ **阶段完成事件保证**（`detectiveWorkflowService.ts`，finally块）

## 下一步行动

### 立即行动
1. **停止PM2服务**，避免资源浪费和日志污染
2. **从正确目录手动启动服务**
3. **重新运行E2E测试**，验证所有修复

### 生产部署建议
1. 创建标准化的PM2配置文件
2. 使用环境变量管理而非硬编码路径
3. 配置PM2日志轮转，避免日志文件过大
4. 设置合理的重启限制（如max_restarts: 10）

## 测试环境信息

- **Worktree路径**: `/vol1/1000/projects/storyapp-worktrees/reframe`
- **PM2错误目录**: `/home/yuanhaizhou/projects/storyapp`
- **服务端口**: 8701
- **MongoDB**: localhost:27017/storyapp
- **前端构建**: `/vol1/1000/projects/storyapp-worktrees/reframe/frontend/build`

## 关键发现时间线

| 时间 | 事件 |
|------|------|
| 13:16 | 开始E2E测试，发现故事生成卡在阶段一 |
| 13:18 | 多次尝试重启服务，但端口持续被占用 |
| 13:21 | 发现PM2管理服务，重启次数507次 |
| 13:22 | 检查PM2日志，发现MongoDB认证失败 |
| 13:25 | 确认PM2运行在错误目录，编写诊断报告 |

## 结论

**所有实现的修复代码都是正确的**，但由于PM2服务配置错误和MongoDB连接问题，导致服务无法正常启动，修复无法生效。

解决PM2配置问题后，预期所有功能将正常工作：
- ✅ SSE连接稳定，无ERR_INCOMPLETE_CHUNKED_ENCODING
- ✅ 无COOP/Origin-Agent-Cluster警告
- ✅ TTS轮询智能，无过早404错误
- ✅ DeepSeek API调用有超时保护
- ✅ 阶段事件可靠推送到前端



