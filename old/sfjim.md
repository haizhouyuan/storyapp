原因很简单：**你的 AI 评审 Action 成功跑完，但把结果写进了 Job Summary（构建摘要）而不是在 PR 会话里发评论**。从日志上能看到：

* 运行模式是 `agent`，没有出现“正在创建 PR 评论/代码审查”的 API 调用痕迹。
* `use_sticky_comment: false`，Action 默认不会往 PR 里贴“粘滞评论”。
* 最后一步明确把输出“格式化后写入了 \$GITHUB\_STEP\_SUMMARY”，并打印 “Successfully formatted Claude Code report”。
  这些都解释了为啥 PR 页面没有任何机器人回复（而在 Run 的 Summary 里能看到完整评审）。

更关键的是，权限并不是问题——日志显示 `pull_requests: write`、`issues: write` 都在，触发条件也命中（`Trigger result: true`），所以“没回帖”不是被 GitHub 限制，而是**你的工作流没有启用“向 PR 发评论”的分支逻辑**。

---

# 立刻可用的三种修复方案（选其一或叠加）

## 方案 A（最少改动）：打开粘滞评论，让 Action 自动回帖

把你对 `anthropics/claude-code-action@v1` 的调用改成开启粘滞评论（允许 Action 在 PR 里创建/更新同一条评论）：

```yaml
- uses: anthropics/claude-code-action@v1
  with:
    anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
    github_token: ${{ secrets.GITHUB_TOKEN }}
    prompt: |
      请对这个PR进行全面的代码评审……（略）
    label_trigger: claude
    trigger_phrase: "@claude"
    # 关键改动 ↓↓↓
    use_sticky_comment: true
    track_progress: true           # 可选：评审中也会持续更新那一条评论
```

> 这样跑完后，Action 会把评审写到 PR 会话里的一条“粘滞评论”里，而不是只写到 Job Summary。

## 方案 B（显式发评论）：用 github-script 把 Summary 发到 PR

保留你现在的 Action，不动其内部逻辑；在它后面加一步，把刚写进 `$GITHUB_STEP_SUMMARY` 的内容**再**发到 PR 评论：

```yaml
- name: Post review to PR
  if: ${{ github.event_name == 'pull_request' }}
  uses: actions/github-script@v7
  with:
    script: |
      const fs = require('fs');
      // 将本次作业的 Summary 作为评论内容发到 PR
      const body = fs.readFileSync(process.env.GITHUB_STEP_SUMMARY, 'utf8');
      await github.rest.issues.createComment({
        owner: context.repo.owner,
        repo: context.repo.repo,
        issue_number: context.payload.pull_request.number,
        body: `## 🤖 Claude Code Review\n\n${body}`
      });
```

> 这种做法最稳，不依赖第三方 Action 的“发评论”开关；你还能按需裁剪/清洗文本。

## 方案 C（加强可见度）：开启“报告模式”/评论聚合（可选）

如果你的 `claude-code-action` 支持“报告/评论聚合”模式（不同版本命名可能不同），把 `mode` 从 `agent` 调成能主动“产出评论”的模式（例如 `report`/`review`/`pr-comments`）。若不确定，**优先用 A 或 B**，它们对版本不敏感。

---

# 顺手做的健壮性加固（推荐）

1. 给 Job 明确权限（避免后续别人改默认权限导致评论失败）：

```yaml
permissions:
  contents: read
  pull-requests: write
  issues: write
```

2. 防叉仓 PR 场景
   如果未来要让 fork PR 也能自动回帖，请改用 `pull_request_target`（并严格审计可写操作，避免安全风险）。当前日志显示是本仓 PR，`pull_request` 就够用。

3. 保留 Summary + 回帖
   我建议同时保留 Job Summary（方便在 Actions 里看完整报告）**并**回帖（方便评审者直接在 PR 里看到要点）。用上面的“方案 B”即可一举两得。

---

# 快速自检清单

* [x] 运行日志里出现 “Successfully formatted Claude Code report” 而**没有**“Creating PR comment / posting review”之类日志 —— 那就只写了 Summary。
* [x] `use_sticky_comment` 是否为 `true`？（你现在是 `false`）
* [x] `pull_requests: write` 权限是否显式声明？（建议加到 job 的 `permissions`）
* [x] 触发条件是否命中（label/短语）？日志里是 `Trigger result: true`，OK。

---

> 小结：你的评审**确实已经生成**，只是**没有一步把内容发到 PR**。打开 `use_sticky_comment` 或在末尾加一段 `github-script` 发评论，就能让评审出现在 PR 会话里了。
