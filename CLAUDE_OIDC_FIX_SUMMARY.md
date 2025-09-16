# Claude Code Action OIDC 认证问题修复摘要

## 问题描述
Claude Code Action 在 GitHub Actions 中出现 401 错误，原因是 OIDC 换取 GitHub App Token 时的"默认分支同文件校验"失败。

## 核心问题
- **工作流验证失败**: `Workflow validation failed. The workflow file must exist and have identical content to the version on the repository's default branch.`
- **GitHub API 凭证错误**: `curl ... "Bad credentials"` - 访问 GitHub REST API 时没有正确的 Token

## 解决方案（已应用）

### 1. 绕过 OIDC 认证
在所有 Claude Code Action 使用中添加了 `github_token: ${{ secrets.GITHUB_TOKEN }}` 参数，直接使用 GitHub 内置 Token 而不是通过 OIDC 交换。

### 2. 改进权限配置
统一所有工作流的权限配置：
```yaml
permissions:
  contents: write          # 需要修改文件和创建PR
  pull-requests: write     # 需要写PR评论
  issues: write           # 需要创建/更新Issues
  actions: read           # 读取Actions状态
  id-token: write         # OIDC可选，现在使用github_token
```

### 3. 添加 GitHub API 凭证自检
在每个 Claude Code Action 之前添加验证步骤：
```yaml
- name: Sanity check GitHub token
  env:
    GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  run: |
    set -e
    curl -sfL \
      -H "Authorization: Bearer $GH_TOKEN" \
      -H "Accept: application/vnd.github+json" \
      "https://api.github.com/repos/${{ github.repository }}" | jq .full_name
```

## 修复的工作流文件
1. `.github/workflows/claude-mentions.yml`
2. `.github/workflows/claude-smoke.yml` 
3. `.github/workflows/claude-debug-api.yml`
4. `.github/workflows/claude-test-simple.yml`
5. `.github/workflows/test-claude-config.yml`

## 验证步骤
1. 提交这些修改到当前分支
2. 创建 PR 或合并到默认分支
3. 运行任意一个 Claude 工作流进行验证
4. 确认不再出现 401 错误

## 原理说明
- **GITHUB_TOKEN** 是 GitHub 自动为每个 job 提供的安装令牌，作用域限于当前仓库
- 添加 `github_token` 参数后，Claude Code Action 会直接使用这个 Token，不再尝试 OIDC → App Token 交换
- 这避免了"默认分支同文件校验"的问题，特别是在首次引入工作流时

## 参考
- 基于 temp.md 中的详细分析
- Anthropic Claude Code Action 官方文档
- GitHub Actions Token 认证文档

修复完成！🎉