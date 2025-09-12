# GitHub Actions: Claude/Anthropic Secrets Setup

本指南帮助你为 GitHub Actions 配置 Claude Code（Anthropic）所需的密钥，避免工作流因缺少密钥而失败。

## 必需的 Secrets

- `ANTHROPIC_API_KEY`（必需）: 从 Anthropic 控制台获取的 API Key，形如 `sk-ant-...`
- `ANTHROPIC_BASE_URL`（可选）: 自定义网关地址（默认 `https://api.anthropic.com`）

## 配置步骤

1) 打开仓库 Settings → Secrets and variables → Actions
2) 点击 “New repository secret”，添加以下条目：

```
ANTHROPIC_API_KEY=sk-ant-********************************
ANTHROPIC_BASE_URL=https://api.anthropic.com   # 可选
```

3) 保存后即可。

## 验证配置

方式一：运行内置测试工作流（推荐）

- Actions → 选择 “Test Claude Code Configuration” → Run workflow
- 该工作流会尝试调用 Claude Code Action 并校验连接

方式二：触发 Smoke/Test 工作流

- Actions → 选择 “Claude Smoke Check” 或 “Simple Claude Test” → Run workflow

方式三：从命令行复跑失败工作流（可选）

```
gh run rerun <run-id>
```

## 失败时的表现与自诊断

- @claude 提及响应工作流：
  - 无密钥时会在相应 Issue 下自动评论，提示如何配置
- PR 安全审查工作流：
  - 无密钥时会在 PR 中自动评论提示，并提前失败，避免误导性错误

常见报错：

```
Error: Environment variable validation failed:
- Either ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN is required when using direct Anthropic API.
```

解决：按本文档添加 `ANTHROPIC_API_KEY` 即可。

## 可选：使用 OAuth Token（企业场景）

- 某些环境可使用 `CLAUDE_CODE_OAUTH_TOKEN` 作为替代；本项目默认使用 `ANTHROPIC_API_KEY`。

## 排查清单

- [ ] Secrets 名称正确无误（大小写一致）
- [ ] 不是添加到了 Environment，而是 Repository Secrets（除生产部署外）
- [ ] 没有多余空格/换行
- [ ] Base URL 如无特别需求可不填

## 关联文档

- `.github/workflows/claude-mentions.yml`
- `.github/workflows/pr-security-review.yml`
- `.github/workflows/claude-smoke.yml`
- `.github/workflows/claude-test-simple.yml`

