# CI/CD Pipeline Setup Documentation

## 🎉 完成状态

✅ **Claude Action smoke test**: 成功通过  
✅ **Secret统一配置**: 所有工作流使用`ANTHROPIC_API_KEY`  
✅ **完整CI/CD流水线**: 已部署并运行  
✅ **Docker镜像构建**: 自动推送到GHCR  

## 📋 工作流概览

### 1. CI Quality Gates (`.github/workflows/ci.yml`)
**触发条件**: 每个Pull Request  
**功能**:
- ✨ **多级质量检查**: Lint、TypeCheck、单元测试、构建验证
- 🎯 **前后端分离支持**: 分别处理`backend/`和`frontend/`目录
- 🚀 **E2E测试**: Playwright自动化测试
- 🤖 **Claude智能审查**: AI代码质量和安全审查
- 📊 **测试报告**: 自动生成和上传覆盖率报告

### 2. Docker Build & Push (`.github/workflows/docker-build-push.yml`)
**触发条件**: push到master分支或git tag  
**功能**:
- 🐳 **自动构建**: 多阶段Docker构建优化
- 📦 **GHCR推送**: 推送到GitHub Container Registry
- 🔍 **漏洞扫描**: Trivy安全扫描，高危漏洞直接失败
- 🏷️ **智能标签**: SHA、分支、tag多重标签策略

### 3. Production Deployment (`.github/workflows/deploy-prod.yml`)
**触发条件**: 手动触发 (workflow_dispatch)  
**功能**:
- 🚀 **一键部署**: SSH登入ECS，拉取最新镜像并部署
- 🔐 **安全认证**: 使用GitHub Environment保护生产secrets
- 🔄 **无停机更新**: docker-compose rolling update
- 🧹 **资源清理**: 自动清理旧镜像节省空间

## 🔧 关键配置

### Repository Secrets (已配置)
- `ANTHROPIC_API_KEY`: Claude API密钥
- `ANTHROPIC_BASE_URL`: Claude网关URL (可选)

### GitHub Environment: production (需要配置)
在GitHub仓库Settings → Environments → New environment创建`production`环境，并配置：

- `PROD_HOST`: 生产服务器IP (例: `47.120.74.212`)
- `PROD_USER`: SSH用户名 (例: `root`)
- `PROD_SSH_KEY`: SSH私钥字符串
- `GHCR_PAT`: GitHub Personal Access Token (权限: `read:packages`)

### Docker配置
- **生产镜像**: `ghcr.io/haizhouyuan/storyapp:latest`
- **多阶段构建**: 前端(React) → 后端(Node.js) → 生产运行时
- **健康检查**: 自动监控应用状态
- **非root用户**: 安全最佳实践

## 📊 工作流程图

```
PR Created → CI Quality Gates → Claude Review → Manual Merge
     ↓                ↓              ↓              ↓
  [Lint/Test]    [E2E Tests]   [AI Review]   [Approved]
     ↓
Push to master → Docker Build → Vulnerability Scan → GHCR Push
     ↓                ↓              ↓              ↓
[Auto Trigger]  [Multi-stage]  [Trivy Scan]  [Image Ready]
     ↓
Manual Deploy → SSH to ECS → Pull Image → Rolling Update
     ↓              ↓          ↓           ↓
[workflow_dispatch] [Login] [docker pull] [Zero Downtime]
```

## 🚀 使用指南

### 开发工作流
1. **创建PR** → 自动触发CI质量检查
2. **查看Claude评审** → AI代码安全和质量建议
3. **修复问题并推送** → CI重新运行
4. **Merge后** → 自动构建Docker镜像

### 本地CI校验清单
- `npm run verify`：一次性执行前端 lint、全量 type-check 以及后端/前端单元测试。
- `npm run test:e2e`：运行 Playwright 全量 E2E，用于复现 CI 结果（CI 环境仅跑桌面端，`workers=3` 并行加速）。
- `npm run lint:frontend:fix`：如需自动修复常见 ESLint 问题再提交。

> ✅ CI 会在 `unit-tests` 作业中执行 `npm run lint`、`npm run type-check`、`npm run test:unit`，并在 `e2e-tests` 作业中执行 `npm run test:e2e`。确保在提交前通过上述脚本，可以显著减少流水线反复。

### 部署工作流
1. **访问Actions页面** → 选择"Deploy to Production"
2. **点击Run workflow** → 输入要部署的镜像tag (默认最新)
3. **确认部署** → SSH自动登入服务器并更新

### 监控和排错
- **CI失败**: 查看Actions日志，重点关注lint/test输出
- **Docker构建失败**: 检查Dockerfile和依赖安装
- **漏洞扫描失败**: 更新基础镜像或依赖包版本
- **部署失败**: 检查SSH连接和服务器docker环境

## 🔄 下一步增强 (可选)

- [ ] **预览环境**: 每个PR自动部署临时环境
- [ ] **自动发布**: git tag自动生成release notes
- [ ] **依赖更新**: Renovate/Dependabot自动依赖更新
- [ ] **分支保护**: 要求CI通过才能合并
- [ ] **Slack通知**: 部署成功/失败通知

---

🎊 **恭喜！你的项目已经拥有企业级CI/CD管道！**
