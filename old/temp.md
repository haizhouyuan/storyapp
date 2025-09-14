结合你仓库现状，落地一条「本地测过→自动开 PR→AI 评审→测试/部署→循环修复」流水线

你的 storyapp 仓库已经有这些工作流：

CI（构建+单测+E2E）：触发 push/pull_request/workflow_dispatch；含 Fast checks 与 Deep tests（Playwright + docker compose） 两阶段。

ci

 

ci

 

ci

AI 评审（Claude Code）：codex-review.yml & pr-auto-review.yml 都会在 PR 打开/同步时跑并回帖。建议保留一个，避免双机器人重复评论。

codex-review

 

pr-auto-review

@claude 提及响应：监听 issue_comment 的 @claude，用来对话/辅助。

claude-mentions

 

claude-mentions

基于此，我给你最小增量的实现方案（含脚本+YAML），三步走：

Step 0（本地）：容器化自检通过 → 自动开 PR

WSL 友好脚本（放到 scripts/prepr.sh），本地先起 CI 同款的 compose，跑一轮 E2E，再用 gh 开 PR。PR 描述可让 Codex CLI 生成（非交互 exec 模式）。

#!/usr/bin/env bash
set -euo pipefail

BR=${1:-"feature/auto-pr-$(date +%Y%m%d-%H%M)"}
BASE=${2:-"master"}   # 或 main
TITLE=${3:-"chore: 本地容器自检通过，提交 PR 进入 AI 评审与集成测试"}

# 1) 本地 E2E：与 CI 同步
docker compose -f docker-compose.ci.yml up -d --build
trap 'docker compose -f docker-compose.ci.yml down -v' EXIT
timeout 120 bash -c 'until docker compose -f docker-compose.ci.yml ps | grep -E "(mongo|app).*healthy"; do sleep 5; done'
npm ci
npx playwright install --with-deps
npm test

# 2) 生成 PR 描述（用 Codex）
# 需要先 npm i -g @openai/codex && 已登录或设置 OPENAI_API_KEY
codex exec '从最近一次提交起，扫描本分支变更与测试日志，生成中文 PR 描述（含变更列表/风险/测试要点），输出到 pr-body.md'

# 3) 创建分支 & 推送 & 开 PR
git checkout -b "$BR"
git push -u origin "$BR"
gh pr create -B "$BASE" -H "$BR" -t "$TITLE" -F pr-body.md


Codex CLI 的 exec 非交互自动模式已官方支持，Windows 建议在 WSL 下运行；可用 --model 或 /model 指令选模型。
developers.openai.com
+1

Step 1（云端）：PR 打开 → CI + AI 评审

你现有 CI 已覆盖 pull_request，且 E2E 阶段仅在非草稿 PR 跑，非常合理。

ci


AI 评审已配好 Anthropic Claude Code Action，官方教程与 action 仓库都齐全。若要统一：保留 pr-auto-review.yml，关闭 codex-review.yml，或反之（避免双评审）。
Anthropic
+1

Step 2（云端）：CI 成功 → 自动部署到测试环境（staging）

新增一个 deploy-staging-on-ci-success.yml，用 workflow_run 监听 CI 工作流完成；只在 CI 成功 + 事件来自 pull_request 时部署。部署内容按你的实际方式（K8s/SSH/容器服务/GHCR）替换示例步骤。

name: Deploy to Staging on CI success

on:
  workflow_run:
    workflows: ["CI"]            # 对应你 ci.yml 的 name: CI
    types: [completed]

jobs:
  deploy:
    if: >
      ${{
        github.event.workflow_run.conclusion == 'success' &&
        github.event.workflow_run.event == 'pull_request'
      }}
    runs-on: ubuntu-latest
    permissions:
      contents: read
      actions: read
      deployments: write
    environment:
      name: staging
      url: ${{ steps.deploy.outputs.url }}

    steps:
      - name: Checkout PR commit
        uses: actions/checkout@v4
        with:
          # 签出触发 CI 的那次提交
          ref: ${{ github.event.workflow_run.head_sha }}

      # 如需跨工作流取构建产物，可下载指定 run 的 artifact（v4 支持 run-id）
      - name: Download build artifacts (optional)
        uses: actions/download-artifact@v4
        with:
          run-id: ${{ github.event.workflow_run.id }}
          # name/pattern 按你的 CI 上传名称调整

      - name: Deploy to staging
        id: deploy
        run: |
          # TODO: 替换成你的部署命令（示例：SSH/Helm/compose up/推镜像等）
          echo "url=https://staging.example.com/${{ github.event.workflow_run.head_branch }}" >> $GITHUB_OUTPUT


workflow_run 的结论/分支信息可从 github.event.workflow_run.* 读取，常见做法是只在 conclusion == 'success' 时继续。
GitHub

Step 3（云端）：评论触发自动修复（Codex），推回 PR 触发重测

给出一个“评论即修复”的机器人工作流：当维护者评论 /codex fix 时，Codex 在 PR 分支上尝试修复并 push；push 将触发你的 CI 重新测试。

由于 GITHUB_TOKEN 的事件不会再触发其他工作流，我们这里用 PAT 或 GitHub App token（如 CI_PAT）进行 push，以保证后续 CI 会被触发。
GitHub Docs

name: Codex Autofix on Comment

on:
  issue_comment:
    types: [created]

jobs:
  codex-autofix:
    # 仅在 PR 下的评论，且评论者为成员/所有者，且包含指令时运行
    if: >
      ${{ github.event.issue.pull_request &&
          contains('OWNER,MEMBER,COLLABORATOR', github.event.comment.author_association) &&
          contains(github.event.comment.body, '/codex fix') }}
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write

    steps:
      - name: Checkout PR HEAD (unsafe code must NOT use secrets)
        uses: actions/checkout@v4
        with:
          # 以引用方式签出 PR head（无需额外 API）
          ref: refs/pull/${{ github.event.issue.number }}/head

      - name: Setup Node & Codex CLI
        uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm i -g @openai/codex

      - name: Let Codex attempt an autofix and push
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          GH_TOKEN: ${{ secrets.CI_PAT }}   # PAT/APP token，确保 push 能触发后续工作流
        run: |
          # 非交互自动模式：跑测→修→提交→推送
          codex exec --full-auto "
            先运行：npm ci && npm run build --if-present && npm test；
            若失败：定位失败根因，修改代码与测试，提交信息为 'codex: autofix'；
            再次运行测试直至通过或给出失败原因；最后 push 到当前分支。"

Step 4（可选）：接入 Merge Queue

若你准备启用 GitHub Merge Queue，把 CI 里的触发加上 merge_group，以便 PR 入队后同样跑必须检查：

on:
  pull_request:
  merge_group:


否则入队会因缺少检查而无法推进。
GitHub Docs

Step 5（可选）：复用工作流与安全加固

把“构建+单测+E2E”做成 workflow_call 的复用工作流（比如 reusable-tests.yml），PR/合并队列/发布流程都用同一个“源”。
GitHub Docs

公共仓库里需要避免在 pull_request_target 上执行不可信代码；若必须用它（例如想安全写入评论/标签并用到机密），只做“读 diff / 回帖”，不要 npm install/docker build/执行脚本。详见官方安全指南与实践。
GitHub Security Lab

四、把 Claude Code 与 Codex 融入流水线的具体建议

Claude Code（GitHub Action）：你已经在用 anthropics/claude-code-action@v1，它支持在 PR 场景做结构化评审、跟进进度、响应 @claude，按照官方指引设置 ANTHROPIC_API_KEY/BASE_URL 即可。
Anthropic
+1

Codex（CLI/云端）：

本地：用 codex exec 生成 PR 描述、辅助修复；Windows 建议在 WSL 下使用。
developers.openai.com

云端：像上面“评论自动修复”那样在 Action 中安装 @openai/codex 并执行 codex exec --full-auto，用 PAT 进行 push 触发 CI。

另外，Codex 近期更新也加强了 PR 自动评审（@codex at PR）与 IDE/终端一体化。如果你想和 Claude 并存，可用 标签 控制触发（如 AI:codex 只跑 Codex 评审）