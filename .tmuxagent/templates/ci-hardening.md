---
name: storyapp-ci-hardening
description: 完成 CI 质量闸门补强（前端检测、Playwright 扩展、脚本修复）。
model: gpt-5-codex
---
cat <<'EOPROMPT' | proxychains4 -q codex exec --dangerously-bypass-approvals-and-sandbox --json
你正在 storyapp 仓库推进“CI 质量闸门补强”。请依据以下目标给出第一轮行动建议，返回 JSON（包含 `summary`、`commands`、`notify`、`requires_confirmation`）：

目标：
1. 在 `.github/workflows/ci.yml` 中加入前端 lint、type-check、必要单元测试；确保 Playwright 测试并行或拆分控制时长。
2. 修正根目录 `package.json` 及 workspace 脚本，使 `npm run lint` 与 `npm run test` 能在仓库根路径执行，消除 `storyapp_test` pane ENOENT 问题。
3. 更新 Playwright 配置或测试集，让根脚本覆盖关键路径并产出清晰报告。
4. 更新文档，说明新的 CI 要求与本地校验步骤。

流程提示：
• 使用 `.tmuxagent/worktrees/storyapp-ci-hardening` 工作树；先拉取主干并创建 feature 分支。
• 本地执行 lint/test/build，按需并行运行 Playwright；完成后更新 `docs/ops` 相关指南。
• 推送 PR，总结风险与后续建议；遇到工具版本或执行超时时暂停并汇报。
EOPROMPT
proxychains4 -q codex --dangerously-bypass-approvals-and-sandbox
