---
name: storyapp-deploy-resilience
description: 提升 Staging/Production 部署可靠性并加入观测。
model: gpt-5-codex
---
目标：
1. 修复 `.github/actions/staging-deploy/action.yml` 的 YAML 解析错误，保证 Staging 自动部署可用。
2. 优化生产部署流程：采用滚动/热更新（例如 `docker compose up --detach --wait`）、保留上一版本镜像、记录部署元数据以便回滚。
3. 增加健康检查与轻量冒烟测试（可调用 Playwright/HTTP 检查），并把结果回写到 PR 或监控面板。
4. 梳理凭据策略，确保 GHCR_PAT / docker login 不暴露临时 token；在部署主机清理过期凭据。
5. 更新相关文档（部署指南、故障处理手册）。
行动规范：
• 创建独立分支并在 `.tmuxagent/worktrees/deploy-resilience` 工作树内操作。
• 所有脚本改动需本地演练（可用 staging 模拟环境），再提交 PR。
• 如果涉及停机窗口或外部依赖，请先向 orchestrator 汇报确认。
