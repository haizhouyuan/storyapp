# 🚀 StoryApp CI/CD 自动化流水线使用指南

本指南介绍如何使用完整的「本地测过→自动开PR→AI评审→测试/部署→循环修复」流水线。

## 📋 流水线概览

### 🔄 完整流程
```mermaid
graph TD
    A[本地开发] --> B[本地自检脚本]
    B --> C[自动创建PR]
    C --> D[CI/CD 构建测试]
    C --> E[AI 自动评审]
    D --> F[自动部署测试环境]
    E --> G[手动评论修复]
    G --> H[自动修复推送]
    H --> I[重新触发CI]
    I --> J[合并到主分支]
```

## 🛠️ 使用方法

### 1️⃣ 本地开发完成后

```bash
# 赋予脚本执行权限（首次使用）
chmod +x scripts/prepr.sh

# 运行本地自检并自动创建PR
./scripts/prepr.sh

# 自定义分支和PR信息
./scripts/prepr.sh "feature/my-awesome-feature" "master" "feat: 添加新功能"
```

**脚本功能**：
- ✅ 启动与CI相同的Docker测试环境
- ✅ 运行完整的E2E测试套件
- ✅ 自动生成PR描述
- ✅ 创建并推送分支
- ✅ 自动开启PR

### 2️⃣ AI自动评审

PR创建后，**Claude Code**会自动：
- 📋 分析代码质量、安全性、性能
- 🎯 检查儿童应用特殊要求（COPPA合规）
- 📊 提供详细评审报告和改进建议
- ⭐ 给出评分和合并建议

### 3️⃣ 自动部署测试环境

CI测试通过后，系统会：
- 🚀 自动部署到测试环境
- 🔗 在PR中评论提供测试链接
- 🧪 运行部署验证测试
- 📋 更新部署状态

**测试环境访问**：
- 地址格式：`https://staging-{branch-name}.storyapp.dandanbaba.xyz`
- 健康检查：`{测试环境}/healthz`
- API测试：`{测试环境}/api/health`

### 4️⃣ 评论触发自动修复

遇到问题时，在PR中评论以下指令之一：
```bash
/claude fix    # Claude智能修复
/auto fix      # 自动修复
/fix           # 通用修复指令
```

**修复流程**：
- 🔍 诊断构建、测试、代码规范问题
- 🔧 自动应用ESLint和类型修复
- 🧪 验证修复后测试通过
- 📝 自动提交并推送修复
- 🔄 触发新一轮CI测试

## 🎛️ 工作流配置

### 主要工作流文件

| 文件 | 功能 | 触发条件 |
|------|------|----------|
| `ci.yml` | 构建+测试 | push, pull_request |
| `pr-auto-review.yml` | AI评审 | PR opened/sync |
| `deploy-staging.yml` | 测试环境部署 | CI成功后 |
| `auto-fix.yml` | 评论修复 | 特定评论 |
| `claude-mentions.yml` | @claude响应 | issue_comment |

### 环境变量配置

需要在GitHub仓库设置中配置：

```bash
# 必需密钥
ANTHROPIC_API_KEY=sk-ant-...          # Claude API密钥
DEEPSEEK_API_KEY=sk-...               # DeepSeek API密钥

# 部署相关（可选）
STAGING_HOST=your-staging-server.com
STAGING_USER=deploy-user
STAGING_SSH_KEY=-----BEGIN PRIVATE KEY-----
```

## 📊 监控和调试

### 查看工作流状态
- **GitHub Actions页面**：查看所有工作流执行状态
- **PR检查**：在PR页面查看CI状态
- **部署日志**：点击工作流链接查看详细日志

### 常见问题解决

#### 1. 本地自检脚本失败
```bash
# 检查Docker环境
docker --version
docker compose --version

# 检查端口占用
netstat -tlnp | grep :5001
netstat -tlnp | grep :27017

# 手动清理
docker compose -f docker-compose.ci.yml down -v
```

#### 2. CI测试失败
- 检查GitHub Actions日志
- 本地运行相同的命令复现问题
- 使用 `/claude fix` 评论自动修复

#### 3. 部署失败
- 检查环境变量配置
- 验证测试环境网络连通性
- 查看deploy-staging.yml工作流日志

#### 4. AI评审无响应
- 检查ANTHROPIC_API_KEY是否配置正确
- 查看pr-auto-review.yml工作流状态
- 备用评审系统会自动接管

## 🔧 高级配置

### 自定义本地自检脚本

编辑 `scripts/prepr.sh` 可以：
- 调整测试超时时间
- 添加自定义检查步骤
- 修改PR描述模板
- 配置分支命名规则

### 环境隔离部署

每个PR分支会部署到独立的测试环境：
```bash
# 分支：feature/user-auth
# 测试环境：https://staging-feature-user-auth.storyapp.dandanbaba.xyz

# 分支：bugfix/login-issue  
# 测试环境：https://staging-bugfix-login-issue.storyapp.dandanbaba.xyz
```

### Merge Queue集成（可选）

启用GitHub Merge Queue：
1. 仓库设置 → Branches → 添加分支保护规则
2. 启用 "Require merge queue"
3. CI工作流已包含 `merge_group` 触发器

## 📈 最佳实践

### 开发工作流建议

1. **功能分支开发**
   ```bash
   git checkout -b feature/story-sharing
   # 开发代码...
   ./scripts/prepr.sh  # 自动测试并创建PR
   ```

2. **修复问题**
   - 查看AI评审建议
   - 使用 `/claude fix` 自动修复
   - 手动修复复杂问题

3. **测试验证**
   - 等待测试环境部署完成
   - 使用提供的测试链接验证功能
   - 在测试环境运行端到端测试

4. **代码合并**
   - CI全部通过 ✅
   - AI评审评分 ≥ 7/10 ⭐
   - 至少一名维护者审核 👤
   - 测试环境验证通过 🧪

### 性能优化

- 本地缓存Docker镜像减少构建时间
- 并行运行前后端测试
- 增量部署减少测试环境更新时间
- 智能跳过无关文件变更的工作流

## 🤝 贡献指南

改进CI/CD流水线：
1. 在 `feature/ci-improvement-xxx` 分支开发
2. 使用相同的自动化流程测试
3. 更新本文档说明新功能
4. 通过AI评审和人工审核

---

## 🎯 总结

这套CI/CD流水线实现了：
- ✅ **零配置启动**：一个脚本解决本地测试+PR创建
- 🤖 **AI智能评审**：自动发现问题并给出建议
- 🚀 **自动化部署**：每个PR都有独立测试环境  
- 🔄 **循环修复**：评论触发自动修复并重测
- 📊 **全程监控**：每个步骤都有状态反馈

通过这套流水线，开发效率提升的同时保证了代码质量和部署安全。

*🤖 如有问题，可以在任何PR中使用 `@claude` 提及获得帮助！*