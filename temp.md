看日志与截图，**失败的根因有两个**：

1. **鉴权变量缺失** → Action 明确报错：
   `Either ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN is required`
   说明 Runner 环境里**没有**读到 `ANTHROPIC_API_KEY`（或你选择的 `CLAUDE_CODE_OAUTH_TOKEN`）。

2. **未 checkout 导致 git 128** → 还有一条：`/usr/bin/git failed with exit code 128`，通常是**没有先执行 `actions/checkout@v4`**，Action 在配置 Git 远端时找不到 `.git`。

下面给你**一次性修好**的做法（直接覆盖你现在的 smoke 工作流即可）。

---

## ✅ 最小可用修复版：`.github/workflows/claude-smoke.yml`

> 要点：**(A)** Job 级 `env` 注入密钥；**(B)** 先 `checkout`；**(C)** 如走 GAC，附带 `ANTHROPIC_BASE_URL`；**(D)** 自检步骤不打印密钥值，仅判断是否存在。

```yaml
name: Claude Smoke Check
on:
  workflow_dispatch:

permissions:
  contents: read
  pull-requests: write

jobs:
  smoke:
    runs-on: ubuntu-latest

    # ❶ 把密钥放在 Job 级 env，确保子进程也能读到
    env:
      # 必填：直接连 Anthropic 或你用的 GAC 网关的 key（形如 sk-ant-...）
      ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}

      # 可选：如果你走 GAC/自建网关才需要（例如 https://gaccode.com/claudecode）
      ANTHROPIC_BASE_URL: ${{ secrets.ANTHROPIC_BASE_URL }}

      # 可选：部分 CLI 版本也识别这个变量名，做个兼容
      CLAUDE_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}

      # 【可选另一路】如果你不用 API Key，而是走 Claude 的 OAuth，
      # 就把下行注释去掉，并在 Secrets 里提供对应 token
      # CLAUDE_CODE_OAUTH_TOKEN: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}

    steps:
      # ❷ 必须先 checkout，否则后续 action 配置 git 会报 128
      - uses: actions/checkout@v4

      # ❸ 自检：不打印密钥，只判断是否存在
      - name: Assert secrets presence (no value printed)
        run: |
          test -n "$ANTHROPIC_API_KEY" || (echo "❌ Missing ANTHROPIC_API_KEY" && exit 1)
          echo "✅ ANTHROPIC_API_KEY present"
          if [ -n "$CLAUDE_CODE_OAUTH_TOKEN" ]; then echo "ℹ️ OAuth token present"; fi
          echo "ℹ️ BASE_URL: ${ANTHROPIC_BASE_URL:+set}${ANTHROPIC_BASE_URL:-not-set}"

      # ❹ （仅 GAC/自建网关需要）预批准“自定义 API Key”交互
      - name: Pre-approve custom API key (for gateway)
        if: env.ANTHROPIC_BASE_URL != ''
        run: |
          (cat ~/.claude.json 2>/dev/null || echo 'null') \
            | jq --arg key "${ANTHROPIC_API_KEY: -20}" \
                 '(. // {}) | .customApiKeyResponses.approved |= ([.[]?, $key] | unique)' \
            > ~/.claude.json.tmp && mv ~/.claude.json.tmp ~/.claude.json

      # ❺ 实际调用（不改代码，不开 PR，只验证连通）
      - name: Run Claude Action (dry-run)
        uses: anthropics/claude-code-action@v1
        with:
          task: "prompt"
          prompt: "只输出：Smoke OK（不要修改任何文件，不要开 PR）"
          allow_edits: false
          create_prs: false
```

---

## 必过清单（逐项核对）

* **Secrets 放对位置**：Settings → *Secrets and variables* → **Actions** → **Repository secrets**

  * 名称必须是：`ANTHROPIC_API_KEY`（大小写完全一致）。
  * 走 GAC/自建网关再加：`ANTHROPIC_BASE_URL`（值是你的网关地址）。
  * **不要**放在 *Variables*、*Dependabot* 或 *Codespaces*。
* **如果你把密钥放在 Environment**：在 job 上加 `environment: <名字>`；否则拿不到。
* **已添加 `actions/checkout@v4`**：避免 git 128。
* **只走一种鉴权**即可：

  * 直接 API Key：`ANTHROPIC_API_KEY`（推荐，最简单）；
  * 或 OAuth：`CLAUDE_CODE_OAUTH_TOKEN`。

  > 你截图报的是“direct Anthropic API 需要 key/token”，说明当前走的是直连分支，但没读到 key。
* 组织/仓库 **Actions 权限**：建议 *Read and write permissions*，勾选 *Allow GitHub Actions to create and approve pull requests*（与本次 401 无关，但后续需要评论/改文件时会用到）。

---

## 仍然报错时的两步快速定位

1. **看自检步骤输出**

   * 看到 `✅ ANTHROPIC_API_KEY present` 才代表 Runner 成功读到密钥。否则就回到 Secrets 新建/改名。
2. **把 Key 从 job 级 env 改为 step 级 env（对比试验）**

   * 仍失败多半是 **Secret 名不对** 或 **配置在 Environment 但 job 没指定 environment**。

---

## 下一步：把 PR 审查工作流也修成可用

等 smoke 通过后，把你用于 PR 审查的 yml 开头几行改成同样的结构（**加 checkout、把密钥放到 job 级 env**）。示例仅列关键部分：

```yaml
name: PR Security & Quality Review (Claude)

on:
  pull_request:
    types: [opened, synchronize, reopened]

permissions:
  contents: read
  pull-requests: write

jobs:
  review:
    runs-on: ubuntu-latest
    env:
      ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
      ANTHROPIC_BASE_URL: ${{ secrets.ANTHROPIC_BASE_URL }}
    steps:
      - uses: actions/checkout@v4
      - name: Claude Review
        uses: anthropics/claude-code-action@v1
        with:
          task: "review"
          review_scope: "diff"
          post_inline_comments: true
          fail_on_high_risk: true
```

---

把你现在仓库里的 `claude-smoke.yml` / `pr-security-review.yml` 原文贴上来也行，我给你**最小修改 diff**（保留你的触发器与命名），确保一次就过。
