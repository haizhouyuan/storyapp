明白了，这是 **Claude Code Action 在 PR 场景用 OIDC 换取 GitHub App Token 失败** 的经典首跑问题。核心报错：

> `Workflow validation failed. The workflow file must exist and have identical content to the version on the repository's default branch.`

意思是：要想用 OIDC 向官方 Claude GitHub App 换“应用安装 Token”，**这个工作流文件必须已存在于默认分支（main/master），而且内容与当前跑的完全一致**。首次在 PR 里“引入这个工作流文件”时，默认分支还没有它，自然校验失败 → 401。这是 GitHub 为了防止供应链注入的安全校验，并非你配置错了。([GitHub Docs][1])

下面给你两条等效修复路径（任选其一），外加“curl 401”的定位与最小化补丁。

---

# 方案 A（最快）：暂时绕开 OIDC 校验，直接传入 `github_token`

给 `anthropics/claude-code-action@v1` 传一个可用的 GitHub Token（内置 `GITHUB_TOKEN` 或你自建 PAT），Action 就**不会**再走 OIDC→App Token 交换，自然不会触发“默认分支同文件校验”。官方文档明确列出 `github_token` 是可选入参。([Anthropic][2])

**YAML 最小改动（建议同时补齐权限）：**

```yaml
jobs:
  claude:
    runs-on: ubuntu-latest
    permissions:
      contents: write          # 评论/PR 修改通常需要 write
      pull-requests: write
      issues: write
      actions: read
      id-token: write          # 若你仍要用到 OIDC，可保留；不用也行
    steps:
      - uses: actions/checkout@v4

      - name: Claude Code
        uses: anthropics/claude-code-action@v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}   # 你已有
          github_token: ${{ secrets.GITHUB_TOKEN }}             # 关键一行：绕开 OIDC 交换
          # 如果你用 OAuth/Bedrock/Vertex，请按文档换对应入参
```

> 注：`secrets.GITHUB_TOKEN` 是 GitHub 自动注入到每个 Job 的安装令牌（作用域限当前仓库），适合“写评论/开审查/改标签”等常见操作。若你的工作流需要跨库写入或触发后续工作流，可改成你自己的 Fine-grained PAT：`secrets.GH_PAT`。([GitHub Docs][3])

---

# 方案 B（规范）：先在默认分支“引导”同名同内容工作流，再跑 PR

1. 查默认分支名：

   ```bash
   gh repo view haizhouyuan/storyapp --json defaultBranchRef -q .defaultBranchRef.name
   ```
2. 切到默认分支，把 **完全相同** 的工作流文件放进去（路径也必须相同，例如 `.github/workflows/claude-code-review.yml`），提交并推送。

   ```bash
   git checkout <默认分支名>
   git pull
   mkdir -p .github/workflows
   # 确保内容与 PR 里的文件一字不差
   $EDITOR .github/workflows/claude-code-review.yml
   git add .github/workflows/claude-code-review.yml
   git commit -m "chore(ci): bootstrap claude code review workflow"
   git push
   ```
3. 回到你的 PR，重跑工作流。此时 OIDC→App Token 交换会通过。
   *如果仓库开启了默认分支保护、不允许直接推送*：临时开一个“仅含该工作流文件”的 PR 并 **强制允许合并**（首次合并会让 PR 上的该 Step 报错属正常，可在这一版临时加 `continue-on-error: true`，合并后再去掉）。([Zenn][4])

> 额外提示：如果你只想让 Claude 在“真正改代码”的 PR 跑，避免“只改工作流文件”的引导 PR 也去跑它，可以在触发器加 `paths` 过滤排除 `.github/workflows/**`。([KKGitHub Docs][5])

---

# 你日志里的第二个 401（`curl ... "Bad credentials"`）怎么回事？

这是**访问 GitHub REST API 的 Token 不对**（没带、带错、或带了 Anthropic Key）。在 Actions 里用 `curl` 访问 GitHub API 必须手动加 `Authorization: Bearer $GITHUB_TOKEN`（或你的 PAT）。放一个“自检 Step”，确保以后不再踩坑：

```yaml
- name: Sanity check GitHub token
  env:
    GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}   # 或 GH_PAT
  run: |
    set -e
    curl -sfL \
      -H "Authorization: Bearer $GH_TOKEN" \
      -H "Accept: application/vnd.github+json" \
      "https://api.github.com/repos/${{ github.repository }}" | jq .full_name
```

上面这段若返回你的仓库名，说明凭证无误；否则就是 401。官方文档也强调 `GITHUB_TOKEN` 的用法/权限模型。([GitHub Docs][3])

---

# 进阶与加固（可选但推荐）

* **首跑期“容错”**：仅在 PR 事件临时放宽一步，避免首个引导 PR 拉红：

  ```yaml
  - uses: anthropics/claude-code-action@v1
    continue-on-error: ${{ github.event_name == 'pull_request' }}
  ```

  待默认分支已有同内容工作流后，把这行删掉。
* **最小权限原则**：若使用 `github_token` 路线，请按实际需要下调 `permissions`，并在 `allowed_tools` 上做白名单限制（Action 支持）。([GitHub][6])
* **触发策略**：把 PR 触发限定为 `types: [opened, synchronize]`，避免评论噪声；评论驱动用 `issue_comment` + 触发词 `@claude`。([Anthropic][2])

---

## 一句话结论

* 你这次 401 是 \*\*OIDC→GitHub App Token 交换的“默认分支同文件校验”\*\*导致，**不是** Bun、缓存或 API Key 的问题。
* **最快**修法：给 Action 传 `github_token` 直接绕过 OIDC；**规范**修法：把同名同内容的工作流文件先落在默认分支再跑 PR。
* `curl` 的 401 是 **没正确带 GitHub Token**，按上面的自检 Step 修正即可。
  （以上做法均符合 Anthropic 官方 Action 文档与 GitHub 官方 Token/OIDC 行为说明。）([Anthropic][2])

需要我基于你当前 `*.yml` 发一份**可直接替换**的补丁吗？我可以“方案 A”与“方案 B”各给一版，保证合进去就绿。

[1]: https://docs.github.com/en/actions/security-for-github-actions/security-hardening-your-deployments/using-openid-connect-with-reusable-workflows?utm_source=chatgpt.com "Using OpenID Connect with reusable workflows - GitHub Docs"
[2]: https://docs.anthropic.com/en/docs/claude-code/github-actions?utm_source=chatgpt.com "Claude Code GitHub Actions - Anthropic"
[3]: https://docs.github.com/actions/security-for-github-actions/security-guides/automatic-token-authentication?utm_source=chatgpt.com "Automatic token authentication - GitHub Docs"
[4]: https://zenn.dev/yu_yukk_y/articles/ad7a2a80898a06?utm_source=chatgpt.com "Claude Code Actionをv1にアップグレードしました"
[5]: https://docs.kkgithub.com/de/actions/writing-workflows/workflow-syntax-for-github-actions?utm_source=chatgpt.com "Workflowsyntax für GitHub Actions - GitHub-Dokumentation"
[6]: https://github.com/anthropics/claude-code-base-action?utm_source=chatgpt.com "GitHub - anthropics/claude-code-base-action: This repo is a mirror of the contents of base-action in https://github.com/anthropics/claude-code-action."
