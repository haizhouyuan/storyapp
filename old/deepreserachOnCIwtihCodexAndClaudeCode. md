Skip to content
Open sidebar
You said:
github actions workflow 都能怎么触发，workflow 之间可以相互触发像钩子一类的功能吗，我现在想本地容器测试通过后就发pr，然后剩下的pr评审部署测试，修复再评审直到通过的所有流程都用codex和claudecode完成。你看看如何实现，我已经有很多workflow了，你看一下我已经开启了connector。
ChatGPT said:

Thought for 1m 42s
好的！我先把两个问题讲清楚，然后给你一套「本地容器测过→自动开 PR→AI 评审→部署到测试→循环修复直到通过→合并」的落地方案（直接给可用 YAML 和脚本），同时结合你仓库里现有的 workflows 做增量改造。

一、GitHub Actions workflow 都能怎么触发？
常用触发源（on:）分几大类——下面每点后都附上官方要点：

源代码事件

push、pull_request、pull_request_target、merge_group（配合 Merge Queue）。

merge_group 专门给合并队列用，要求把它也写进 CI，否则进队列后不会跑必须检查。
GitHub Docs

pull_request_target 在基仓上下文里跑、可用机密/写权限，但要严格避免签出并执行来 PR 的不可信代码（否则“pwn request”风险，通常用它做评论/打标签这类只读分析）。
GitHub Docs
+2
GitHub Security Lab
+2

协作互动事件

issues、issue_comment、pull_request_review、pull_request_review_comment 等（可用 types: 精确到 opened/edited/submitted 等）。
GitHub Docs
+1

手动&外部触发

workflow_dispatch（手点或 API/CLI 触发，可带 inputs）

repository_dispatch（外部系统/脚本发事件到仓库，携带自定义 payload）。
GitHub Docs

工作流级联/复用

workflow_run（当某个 workflow 完成/请求 时再触发另一个）

workflow_call（可复用工作流，被“调用”像函数，支持 inputs/secrets）。
GitHub
+1

定时与其他

schedule（cron）、release、registry_package、page_build 等。
GitHub Docs

关键规则：用 GITHUB_TOKEN 在工作流 A 里产生的事件（比如 push/label），默认不会触发其它工作流（避免递归炸库）；若你确实要“工作流触发工作流”，需改用 PAT 或 GitHub App token。
GitHub Docs

二、workflow 之间能当“钩子”互相触发吗？
可以，主流有三招：

workflow_run：A 跑完（types: [completed]），自动拉起 B；B 里可根据 github.event.workflow_run.conclusion 做分支（仅在 A 成功才继续）。
GitHub

workflow_call：把通用阶段（如构建+测试）做成“可复用 workflow”，由不同工作流通过 jobs.<id>.uses: ./.github/workflows/reusable.yml 直接调用，规范、可传参/机密。
GitHub Docs

repository_dispatch/workflow_dispatch：外部脚本或 bot（比如 Codex/Claude）在合适时机主动触发。
GitHub Docs

安全提醒：公共仓库对 pull_request_target 要格外小心，不要在它里头执行 PR 分支的脚本（npm install、docker build 等），只做读/评论类动作即可。
GitHub Security Lab

三、结合你仓库现状，落地一条「本地测过→自动开 PR→AI 评审→测试/部署→循环修复」流水线
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

另外，Codex 近期更新也加强了 PR 自动评审（@codex at PR）与 IDE/终端一体化。如果你想和 Claude 并存，可用 标签 控制触发（如 AI:codex 只跑 Codex 评审）。
IT Pro

五、你仓库当前配置的小优化清单
避免双评审：codex-review.yml 与 pr-auto-review.yml 作用重叠，建议只留一个，或以 path filters/label 分流（否则 PR 下会有两条机器人长评）。
codex-review

 
pr-auto-review


CI 触发已覆盖：你的 CI 同时监听 push/pull_request/workflow_dispatch，并带并发防抖（concurrency），这点很好，保留即可。
ci


E2E 启动：deep-tests 用 docker-compose.ci.yml 拉起服务并等待 healthy，再装浏览器跑 Playwright，做法标准；可考虑把 compose 健康检查时限从 120s 提升到 180s，减少偶发 flakiness。
ci


Q&A 速答
我能在一个工作流里 push 触发另一个工作流吗？
默认用 GITHUB_TOKEN 不会触发（防止递归）。要触发请用 PAT 或 GitHub App token。
GitHub Docs

工作流“像钩子”那样串起来的最佳姿势？
workflow_run（串连 A→B）、workflow_call（复用步骤）、repository_dispatch（外部/机器人触发），三件套。
GitHub
+1

Merge Queue 要做什么改动？
CI 里加上 merge_group 触发，否则入队不跑检查。
GitHub Docs

如果你愿意，我可以把上面的 YAML 和脚本直接按你仓库目录结构打包成 PR（用我们这套“Step 0”脚本跑一遍就能开 PR）。另外，你已经开了仓库连接器，我这边看到的文件位置与触发条件如下，供你复核：

.github/workflows/ci.yml：触发与分阶段配置见 L3–L13、L18–L29、L69–L76。
ci

 
ci

 
ci


.github/workflows/codex-review.yml：PR 打开/同步触发，带 use_sticky_comment。
codex-review

 
codex-review


.github/workflows/pr-auto-review.yml：PR 打开/同步触发，结构化中文审查模板。
pr-auto-review

 
pr-auto-review


.github/workflows/claude-mentions.yml：监听 issue_comment 的 @claude。
claude-mentions

 
claude-mentions


需要我把 deploy-staging-on-ci-success.yml 和 “评论自动修复”的工作流直接生成成两个文件给你吗？我可以按你现在的 docker-compose.ci.yml 假设先放一个 SSH/compose 的最小可运行版本。


Sources
You said:
我是chatgpt PRo，我也希望充分利用codex的CI能力，现在codex cli已经自己动触发pr评审了，有没有更多能力可以用的
ChatGPT said:

Thought for 1m 8s
当然有！你已经把 Codex CLI 的 PR 评审 跑起来了（太棒），在此基础上还能把 Codex 的「云端任务、环境、AGENTS.md 约定」和 CLI 的 exec 脚本化能力串进整条 CI/CD 流水线，做到从“失败定位→补测→自动修复→重新验收→发布说明/图谱/体检”全闭环。下面给你一套“直接可用”的增强清单 + 可拷贝 YAML 模板。

你还可以启用的 10 项 Codex 能力（CI 友好）
失败日志 → 自动修复（Autofix on failure）
CI 任一 Job 失败时，触发“Codex 修复”工作流：读取失败日志、最小化变更修复、补上缺失测试、推回同分支，再触发 CI 重跑。CLI 可用非交互模式 codex exec "fix the CI failure" 完成这件事。
OpenAI Help Center

智能补测（Test authoring for touched files）
在 PR 打开/同步时由 Codex 自动生成/完善受影响文件的单测/端测，再跑一次 Playwright/Vitest。命令同样走 codex exec 非交互。
OpenAI Help Center

PR 风险与校验清单生成
PR 打开时，让 Codex 产出“变更影响面+风险点+回归点+回滚方案”的结构化 Markdown，直接回帖或写入 PR_PLAN.md 作为审查模板。CLI 模式即可。
OpenAI Help Center

在 GitHub 内用 @codex review 让 Codex 参与评审（云端）
在 ChatGPT 的 Codex 设置里对仓库启用 “Code review”，随后在 PR 里评论 @codex review 即可触发云端容器跑完整评审流程，并以常规 Code Review 的形式回到 PR。
developers.openai.com

小点睛：这条不依赖你的 Runner 资源，适合大仓并发审查；启用路径见 Codex Cloud 文档（先在 chatgpt.com/codex 连接 GitHub）。
developers.openai.com

把 AGENTS.md 纳入仓库规范（让代理“按你说的做”）
在仓库根目录写明「怎么安装、怎么测、Lint/格式化规则、合并前必跑命令」。多数代理（含 Codex）会优先读取并自动执行你列出的测试/校验命令，大幅降低走偏风险。支持分层（子包放自己的 AGENTS.md，近者优先）。
agents.md

Codex Cloud 自定义环境 & 依赖预热
为云端任务配置“环境”：设置 Node/Python/Go 版本、预装依赖/工具、维护脚本、缓存策略；默认 codex-universal 基础镜像已带常见语言与包，可用环境变量定版本（如 CODEX_ENV_NODE_VERSION=20/22）。
developers.openai.com
+1

安全上网白名单
云端任务默认禁网；确需联网（如装依赖/拉私服），可以在环境里严格白名单域名+HTTP 方法（仅 GET/HEAD/OPTIONS），降低注入/外传风险。
developers.openai.com

失败 Job 的“二次意见”
即便不让它改代码，也可用 Codex 读取构建/测试日志给出“定位报告+最小复现脚本+修复草案”，由人类确认后手推修复。
OpenAI Help Center

发布说明 / 变更日志 / 架构图自动产出
在合并或打 tag 时，让 Codex 汇总 conventional commits / PR 描述，生成 CHANGELOG.md 与“端到端时序/依赖关系的 Mermaid 图”并上传为构建产物。
OpenAI Help Center

PR 内一键转云端任务
PR 里 @codex <任意任务>（非 review）会以 PR 上下文开一个云端 Task（背景执行、可并行），例如“为本 PR 生成 E2E 试验场景并给出覆盖率差距”。
developers.openai.com

贴士：你是 ChatGPT Pro，可直接用“Sign in with ChatGPT”登录 Codex CLI/IDE，官方建议在 macOS/Linux 使用；Windows 目前建议在 WSL 跑。
OpenAI Help Center
+1

直接可用的 GitHub Actions 模板（拷走即用）
安全要点：用 GITHUB_TOKEN 发起的 push 不会触发下游工作流；如需“改完→推回→自动重测”，请用 PAT/GitHub App 写权限 Token（例如 secrets.CI_PAT）。
PR 安全：在公共仓库避免在 pull_request_target 上执行不可信分支代码（只做读/评论）。

A. CI 失败自动修复（workflow_run 监听 CI）
name: Codex Autofix when CI fails
on:
  workflow_run:
    workflows: ["CI"]   # 这里填你的主 CI workflow 名称
    types: [completed]

jobs:
  autofix:
    if: ${{ github.event.workflow_run.conclusion == 'failure' && github.event.workflow_run.event == 'pull_request' }}
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
    steps:
      - name: Checkout failing commit
        uses: actions/checkout@v4
        with:
          ref: ${{ github.event.workflow_run.head_sha }}

      - name: Setup Node & Codex CLI
        uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm i -g @openai/codex

      - name: Autofix with Codex and push
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}  # 或走 Sign in 流水线生成的凭据
          GH_TOKEN: ${{ secrets.CI_PAT }}                # 必须用 PAT 以便 push 触发 CI
        run: |
          # 喂给 Codex 你仓库的“怎样跑测”规则（见下方 AGENTS.md）
          echo "看 ./.github/workflows、AGENTS.md、package.json 的 scripts，先跑测试再修复。" > codex-plan.md
          codex exec "
            读取 codex-plan.md 和最近一次 CI 失败日志（在 artifacts 或 ./test-results）；
            先执行：pnpm i || npm ci；再执行：npm run lint --if-present && npm test；
            若失败：定位根因，最小化修改并补足必要测试，提交信息 'codex: autofix'；
            通过后 push 回当前分支。"
B. PR 智能补测（changed files → 生成/完善测试）
name: Codex Write/Improve Tests for PR
on:
  pull_request:
    types: [opened, synchronize, ready_for_review]

jobs:
  write-tests:
    if: ${{ !github.event.pull_request.draft }}
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ github.event.pull_request.head.sha }}

      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm i -g @openai/codex

      - name: Generate/Improve tests with Codex
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          GH_TOKEN: ${{ secrets.CI_PAT }}
        run: |
          codex exec "
            基于 diff（git diff origin/${{ github.base_ref }}...HEAD）列出受影响源文件；
            对每个源文件生成/完善对应测试（Vitest/Playwright），保持现有测试风格；
            本地执行 npm test 通过后，提交 'codex: add/upgrade tests' 并 push。"
C. PR 风险与回归点清单（评论/文件双通道）
name: Codex Risk & Test Plan
on:
  pull_request:
    types: [opened, synchronize]

jobs:
  risk-plan:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm i -g @openai/codex

      - name: Generate plan
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
        run: |
          codex exec "
            读取 PR diff 与 package.json scripts；
            产出：变更摘要、影响面、风险点、回归范围、回滚方案、需新增用例列表；
            将结果保存到 PR_PLAN.md 并作为评论贴到 PR。"
D. 在 PR 里“@codex review”（云端启用法）
先在 chatgpt.com/codex 绑定 GitHub 并在 Codex 设置中为仓库开启 Code review。

之后在 PR 评论里发：@codex review。Codex 会在云端容器拉代码、跑你配置的测试/校验并以常规代码评审形式回到 PR。
developers.openai.com
+1

建议把下面的 AGENTS.md 放进仓库根目录（并按子包做分层）
有了它，Codex（含云端任务）会遵循你的安装/测试/规范并自动执行关键命令。
agents.md

# AGENTS.md（storyapp 示例）

## 安装与启动
- Node: 20（或 22）
- 安装：`pnpm i`（无 pnpm 则用 `npm ci`）
- Dev：`pnpm dev`
- 构建：`pnpm build`
- E2E：`pnpm playwright install --with-deps && pnpm e2e`
- 单测：`pnpm test`
- Lint：`pnpm lint --max-warnings=0 && pnpm format:check`

## CI 要求
- PR 必须通过：Lint、单测、E2E（docker-compose.ci.yml）
- 修改以下目录时需要新增/更新测试：
  `apps/web/src/**`, `packages/api/src/**`

## 代码风格
- TypeScript 严格模式；单引号、无分号；提交前必须 `pnpm lint && pnpm test`

## 额外注意
- Playwright 使用无头模式；CI 下 `CI=true`
- Docker Compose 健康检查最长 180s，重试间隔 5s
用 Codex Cloud 环境 提速与降险（可选但很香）
在 Codex 设置里为仓库配置环境：

指定语言版本（如 CODEX_ENV_NODE_VERSION=20），预装工具（Vitest/Playwright/ESLint），写入 Setup/Maintenance 脚本与缓存策略。
developers.openai.com
+1

默认 codex-universal 镜像已带多语言/工具，支持 12 小时缓存复用；变更 Setup/变量/密钥会自动失效缓存。
developers.openai.com

联网策略：仅在 Setup 阶段全网开；Agent 阶段默认断网，如需访问内网/私有源，请精确配置域名白名单和允许的 HTTP 方法（常配 GET/HEAD/OPTIONS）。
developers.openai.com

Windows/本地最佳实践（配合你现在的流程）
Windows 请用 WSL 跑 Codex CLI（官方建议），减少路径/权限/依赖差异；codex exec 与你现有的 WSL+Docker+Playwright 一致。
OpenAI Help Center

你是 ChatGPT Pro，可直接 Sign in with ChatGPT 登录 Codex（免 API Key 折腾，额度与订阅绑定）。
OpenAI Help Center
+1

小结：怎么把它们拼到你的现有线
保留你现有的 CI（构建/单测/E2E、并发防抖），在其之上新增三件套：

workflow_run → Autofix（A 模板）

PR 补测（B 模板）

PR 风险计划（C 模板）

需要“云端评审/并行跑活”的 PR，用 @codex review 触发（D）。
developers.openai.com

补上 AGENTS.md（根 + 子包），把你的“如何安装/如何测/合入门槛”写清楚，Codex 会按它来。
agents.md

若要“改完即触发后续工作流”，请用 PAT/App Token push，避免 GITHUB_TOKEN 的默认抑制。

云端跑活时，建议配置 Codex Cloud 环境（语言版本、依赖、缓存、联网白名单）。
developers.openai.com
+1

如果你愿意，我可以根据你 repo 的真实目录把上面 A/B/C 三个 workflow 和一个 AGENTS.md 最小模板直接按你 Monorepo/前后端子包落盘（保持与 docker-compose.ci.yml 对齐）。
要不要我直接给出这四个文件的仓库相对路径和最终内容？

You said:
看文档结合我的代码库给我最佳的下一步建议
ChatGPT said:
你希望 Codex 在 CI/CD 中扮演什么样的角色来配合你的代码库？比如：

是否希望 Codex 在 CI 失败时自动修复并推送？

是否希望 PR 打开时 Codex 自动生成测试、风险清单？

是否希望合并时由 Codex 自动产出发布说明或架构图？

你是否已经配置了 AGENTS.md（或是否希望我帮你写一个）？

你的主要语言和工具栈（例如 Node.js + pnpm + Vitest + Playwright）是否需要特别说明或适配 Codex？

请明确你希望重点推进哪些方向，我会结合你代码库和 Codex 文档给出下一步最佳建议。

You said:
1. 是的，codex来修复，claudecode来评审修复是否有问题，如果没问题就放行。2.  是的，开pr和更新pr，claudecode和codex分别独立完整代码评审，然后codex修复和自动测试通过后提交claudecode评审并给出放行意见，codex根据意见执行。我本地开发容器测试通过就会发PR，然后就会触发上述工作流。3， 是的，4.。 我代码库里面有了不一定合适5. 你看看代码库。另外我也已经在codex上创建了环境
ChatGPT said:
明白了，我将基于你当前的 storyapp 仓库结构、已有工作流配置，以及你在 Codex 上已启用的环境，设计一条完整的 Dev → PR → Codex 修复 + Claude 审查 → 测试通过 → Claude 放行 → Codex 合并与发布说明生成 的自动化 CI/CD 流程，并明确两者职责划分、流程衔接机制、YAML/CLI 脚本建议及环境配置规范。

我会尽快整理出完整建议与实现草案给你。

Research completed in 7m · 11 sources · 19 searches
构建 Codex 与 ClaudeCode 协同的智能 PR 流水线

End-to-End AI-Driven CI/CD Pipeline Design for storyapp
In this design, we integrate GitHub Actions workflows with Codex (OpenAI/AI agent) and ClaudeCode (Anthropic) to automate the entire CI/CD process. The pipeline covers everything from local testing and PR creation to AI code review, automatic fixes on test failure, and final merge with release documentation. Below we outline each stage, including the workflow files involved, the triggers, required environment variables, security considerations, and how to update existing workflows/AGENTS.md for this AI-driven process.
1. Automated PR Creation After Local Tests Pass
Trigger & Workflow: After a developer runs local container tests (e.g. via Docker Compose and npm test) and all tests pass, the changes are pushed to the repository. On push to a feature branch (non-main), we configure the CI workflow to automatically open a Pull Request targeting main. We can achieve this by extending the existing CI workflow (.github/workflows/ci.yml)
GitHub
 with a job that runs on successful completion of tests for branch pushes (excluding main). For example:
CI Workflow (ci.yml) – Already triggers on every push to any branch and on PRs
GitHub
. We add a final job (e.g., open-pr) that runs if the workflow was triggered by a branch push (not a PR) and all test jobs succeeded. This job will use the GitHub API or CLI to create a PR. It should have permission pull-requests: write (added in the workflow permissions) to create the PR.
Codex CLI Instruction: No AI is needed just to open the PR – this is a straightforward scripting step. We can use GitHub CLI in a run step, for example:
- name: Create Pull Request
  if: ${{ github.event_name == 'push' && github.ref != 'refs/heads/main' && success() }}
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  run: gh pr create --title "Auto PR: ${GITHUB_REF#refs/heads/}" --body "This PR was opened automatically after all local tests passed." --base main --head ${GITHUB_REF#refs/heads/}
This will open a PR from the current branch to main once tests pass. (Alternatively, we could use actions/github-script to call the Octokit API to create a PR.) Environment Variables: This step relies on the built-in GITHUB_TOKEN (with pull_requests: write permission) to authenticate the PR creation. No external AI keys required here. Security Policies: We ensure this auto-PR creation only runs for branches in the same repo (for forked contributions, the GITHUB_TOKEN is read-only and the step will be skipped). We might restrict by actor if necessary (e.g., only repository members trigger it). Also, use a clear PR title and body (no sensitive info). Following the repo’s PR guidelines
GitHub
, the commit messages should use Conventional Commit format (e.g. “feat: ...” or “fix: ...”), which will carry into the PR title or can be templated in the body.
2. Dual Independent AI Code Reviews on PR Open/Update
Once the PR is opened (whether manually or by the above automation), two parallel code review workflows kick off – one branded as “Codex” and one as “ClaudeCode”. Both use Anthropic’s Claude (or similar LLMs) under the hood but with different prompts/personas to provide independent perspectives. The user has already configured a ClaudeCode auto-review workflow; we will run both in parallel for thorough review. Trigger: Both workflows trigger on the Pull Request event (types: opened, reopened, synchronized – i.e., new commits – and ready_for_review)
GitHub
. They are scoped to PRs targeting the main branch (as configured in the Claude workflow)
GitHub
.
Workflow A: Codex Review (.github/workflows/codex-review.yml) – This workflow represents an “Automated Review Assistant (Codex)”. It uses the anthropics/claude-code-action@v1 to post an AI-generated review comment on the PR
GitHub
. The prompt for Codex is tailored to focus on code quality and best practices:
Codex Prompt (Chinese): Instruct the AI to review the PR focusing on:
Code quality & maintainability (TypeScript types, module boundaries, error handling)
Security (input validation, use of secrets, dependency risks)
Performance (frontend rendering efficiency, backend DB/query hotspots)
Testing (adequacy of unit/E2E tests, suggest any additional tests)
Children’s app compliance (COPPA, content filtering, parental controls)
Output: Provide feedback in Chinese, in a single PR comment with bullet points marked 🔴 (critical issues), 🟡 (suggestions), 🟢 (good points). Mention specific files/lines with issues, give actionable improvement advice or examples, and finally a merge recommendation (“block”, “neutral”, or “approve”) with a brief rationale
GitHub
GitHub
.
The Codex review workflow ensures it doesn’t run on draft PRs (if: !github.event.pull_request.draft)
GitHub
. It also defines a concurrency group per PR (codex-${{ github.ref }}) to avoid overlapping runs on the same PR
GitHub
 (auto-cancelling previous review runs if a new commit arrives). This workflow requires access to post comments, so we set permissions: pull-requests: write, issues: write for the job
GitHub
. It uses the Claude API via the secrets ANTHROPIC_API_KEY and ANTHROPIC_BASE_URL (if using a custom proxy) for authentication
GitHub
.
Workflow B: ClaudeCode Review (.github/workflows/pr-auto-review.yml) – This is the official Claude Code review process already in place. It likewise triggers on PR open/update (for main branch PRs)
GitHub
. It uses the same anthropics/claude-code-action@v1 but with a more structured prompt and output format. The prompt asks Claude to do a comprehensive code review covering similar points (code quality, security, performance, testing) plus any StoryApp-specific checks (e.g. feature completeness, API security, MongoDB query usage, React best practices)
GitHub
GitHub
. It explicitly reminds the AI about children’s app requirements (COPPA compliance, content safety)
GitHub
. ClaudeCode is instructed to output a formatted review report in Chinese, for example:
### 📋 代码评审报告

**PR概述**: _Summary of changes..._

#### 🔴 严重问题
- ... (or "无" if none)

#### 🟡 建议改进
- ... (or "无")

#### 🟢 良好实践
- ... (good aspects or "无")

**📊 评审评分**: X/10 分  
**✅ 建议状态**: 批准/需要修改/拒绝  
**💬 总体建议**: _Overall comments..._

*🤖 本评审由Claude Code自动生成 | 时间: ...*
The workflow ensures the comment follows this template strictly
GitHub
GitHub
. It also uses use_sticky_comment: true and track_progress: true so that if the workflow re-runs, it edits the same comment rather than adding multiples
GitHub
. Like Codex, it only runs on non-draft PRs
GitHub
 and uses secrets for Claude API access
GitHub
. It sets appropriate permissions (contents read, PR/issue write, id-token if needed)
GitHub
. Additionally, this workflow has steps to ensure reliability: for example, an “ensure-response” job that checks if Claude’s comment was posted and if not, posts a fallback message
GitHub
GitHub
, so that the PR is never without a review comment. It also logs the review status for visibility
GitHub
.
Environment Variables: Both review jobs need the Anthropic API Key and possibly a Base URL. According to the project’s setup, ANTHROPIC_API_KEY is stored in GitHub Secrets, and ANTHROPIC_BASE_URL is set to the GAC platform proxy endpoint
GitHub
. We pass these either via with: parameters or (as the team discovered) via environment variables to avoid warnings (Claude Action v1 doesn’t officially support anthropic_base_url as input)
GitHub
. For example, in the final fix they chose to supply the API key in both with and env for redundancy
GitHub
, and put the base URL in env. We will follow that optimized approach to ensure the action authenticates properly without OIDC issues
GitHub
. Security Policies: Both workflows adhere to least privilege:
They use the repository’s GITHUB_TOKEN (scoped to the repo) rather than any external credentials for GitHub operations
GitHub
. The final OIDC fix report confirms that using the default github_token with write access to PRs is the stable solution
GitHub
GitHub
.
Secrets (Claude API keys) are never printed in logs. The action will error if keys are missing or invalid, but the team even added a sanity check step to validate the GitHub token without exposing it
GitHub
.
Reviews on PRs from forks: By default, GitHub does not expose secrets to workflows on forked PRs. This means the Claude/Codex review actions will not run for external contributions (to avoid leaking API keys). That’s acceptable for security – maintainers would handle those PRs manually or could choose to run the action manually with appropriate safeguards. We assume most PRs in this project come from internal branches (given the user’s workflow). If needed, we could add an if: to ensure the PR is from the same repo (github.event.pull_request.head.repo.full_name == github.repository) before running the AI reviews, to be explicit.
AGENTS.md Updates: In AGENTS.md, we should document these dual review roles. For example:
Explain that “Codex” acts as an automated reviewer focusing on code quality/maintainability, security, etc., giving suggestions with severity labels (🔴🟡🟢) and a merge recommendation.
Explain that “ClaudeCode” provides a structured review report with a score and explicit status (approve/needs changes/reject).
Emphasize that both should remain objective, avoid bias, and not reveal any secret keys or internal URLs in their feedback (just assess the code and content).
We might also add that they should not conflict with each other’s advice in trivial ways – if they do differ, maintainers will see both viewpoints. Each operates independently, which is by design.
By having two independent AI reviews, we get a more robust code review process on each PR open/update. The PR author can see both comments: one more free-form with line-specific suggestions (Codex) and one a formal report with a checklist and score (ClaudeCode).
3. Continuous Integration (CI) with Automated AI Fix on Failure
In parallel with the AI reviews, the standard CI pipeline runs for the PR. The CI workflow (ci.yml) is already set up to run on pull_request events and on pushes
GitHub
. It covers building and testing of the application across backend, frontend, and end-to-end tests:
The CI has a “fast-checks” job for build and unit tests (runs on Node 20, installs dependencies with npm ci, builds shared, backend, frontend, then starts a MongoDB service container for tests, and runs backend Jest tests)
GitHub
GitHub
GitHub
.
If the PR is not a draft, it triggers the “deep-tests” job for full integration tests: it uses Docker Compose to bring up the app and DB in a CI environment (docker-compose.ci.yml), waits for health checks, installs Playwright browsers, then runs the Playwright E2E tests
GitHub
GitHub
. The Playwright HTML report is uploaded as an artifact for debugging if needed
GitHub
. (This aligns with the documented test commands in CLAUDE.md, where they show how to run containerized tests
GitHub
.)
If all tests pass, great – the CI succeeds. But if any test fails (unit or E2E), we want Codex (the AI agent) to automatically attempt to fix the issues and push a commit to the PR. This automates the bug-fix loop that would normally require a human. Here’s how we design the AI Auto-Fix step: Trigger for Auto-Fix: We use a separate workflow, say ai-auto-fix.yml, that runs on a CI failure. We can leverage the workflow_run trigger: it can listen for the “CI” workflow to complete. For example:
on:
  workflow_run:
    workflows: ["CI"]  # Name of the CI workflow
    types: [completed]
Within this, we add a condition to only run if the CI workflow failed (github.event.workflow_run.conclusion == 'failure') and if it was for a PR (we can check github.event.workflow_run.event == 'pull_request'). We also ensure the PR is from our repo (not a fork) so that secrets are available for AI. This gating prevents unauthorized code from external forks from triggering our AI fix with secrets. AI Fix Job Steps: The auto-fix job will do the following (following the “AI Bug Fix流程” that was outlined in the project docs
GitHub
, but now fully automated):
Checkout Code: Use actions/checkout to get the PR’s code at the failing commit
GitHub
.
Setup Environment: Install Node (use actions/setup-node) and any needed dependencies. Possibly run npm ci for both backend and frontend to ensure we can build/test. (The CI already did build/test, but running tests again in this workflow helps gather failure info.)
Run Tests to Collect Failures: Execute the same test suite to reproduce the failure. For example:
Run npm run build and npm test (which runs Playwright E2E by default) or run backend tests separately if needed. We might reuse the docker-compose for a consistent environment. This step should be allowed to fail without stopping the workflow (continue-on-error: true), so we can capture the error output.
Capture logs or test reports. We can direct test output to a file or parse the console output. This provides the error messages, stack traces, or failing test names to feed into the AI.
Analyze & Prompt AI (Codex) for Fix: Now we invoke the AI to generate a fix. We have two provider options:
Anthropic Claude: Since we already use Claude for reviews, we could also prompt Claude to suggest code changes. Claude is good at following complex instructions and code context. We would provide it with a prompt that includes a summary of failing tests (e.g., “Test X expected Y but got Z at file.js line 123”), possibly the relevant code snippets (the functions or lines that failed), and ask for a patch.
OpenAI Codex/GPT-4: The term “Codex” might imply using OpenAI’s code model. The project has support for OpenAI API as well
GitHub
. We can choose the best model for code fixes (GPT-4 can produce reliable code fixes). The user has an OpenAI API key secret presumably. In the workflow we can offer a choice or just use one.
For automation, we might use an existing GitHub Action or CLI to interface with the AI. Since the project already uses Claude via the claude-code-action, one approach is to use a separate instance of it in “diff” mode if supported (though the Claude action mainly writes comments, not code to repo). Alternatively, use actions/github-script to call the OpenAI API directly (writing a small NodeJS snippet with OpenAI SDK) or use a community action for OpenAI. To keep it straightforward, assume we call the OpenAI API:
Prepare a prompt like:
“The following tests are failing:\n<include test errors and relevant code context>. Please propose code changes (in diff or clear list form) to fix the failures. Only output the changes to make, no extra explanation.”
The AI’s response could be a unified diff or instructions. Ideally, we ask for a diff format so we can apply it programmatically. (If using GPT-4, instruct it to output markdown-formatted diff for each file.)
Apply the Fix to Code: Take the AI’s suggested changes and apply them. This could be done by:
If the AI provided a unified diff, save it to a file and use UNIX patch: git apply patch.diff.
If it provided pseudo-code or instructions, we might need a more sophisticated parser. However, since we control the prompt, we can ask for a diff or at least code blocks we can replace. We should double-check the changes don’t introduce new issues or break formatting.
After applying, run git diff to see the changes, and add those to the commit.
Commit and Push the Fix: Use Git config with an bot identity (e.g., an account or just the GITHUB_TOKEN which can push to the branch if it’s in the same repo). Commit message should follow Conventional Commits, e.g. "fix(e2e): AI fix for failing tests" or similar
GitHub
. Pushing the commit will update the PR. The CI workflow (and the review workflows) will automatically be triggered again by this push.
Verify the Fix (Re-run tests): (This could be optional in the fix workflow since the CI will run anyway on the pushed commit. But to be safe, we can run tests again within the fix workflow before pushing.)
If we run tests again in this job and they are still failing, we know the AI’s first fix didn’t work. We might then choose to repeat the AI fix step with more context or bail out. To avoid an infinite loop, we likely limit to one attempt, or maybe two at most, then leave the rest to human if it fails multiple times.
If tests pass locally in the fix workflow, it’s a good sign. We push the commit, and the upstream CI will also run and should pass.
Environment Variables: The auto-fix workflow will need access to AI API keys. If using Claude via the same action, we use ANTHROPIC_API_KEY; if using OpenAI, we need an OPENAI_API_KEY secret configured (the README guides adding OpenAI API key in secrets
GitHub
). We must ensure these secrets are available – by default, workflow_run events do have access to secrets as long as the original event (pull_request) is from the same repo (which we’ve ensured). Also, the Node environment for running tests might need environment variables (e.g., test database URL). The CI already uses a MongoDB service; in the fix job, we can reuse the same Docker Compose for consistency. For example, set MONGODB_URI for tests (point it at localhost or a compose service if we spin one up). We should also include any necessary env (like NODE_ENV=test) similar to CI
GitHub
. Security Policies:
Scoped Secrets: The AI keys are kept in GitHub Secrets. We use them only in this workflow and do not log the raw values. Any AI responses (which might include code) should be reviewed – we should avoid the AI printing out large chunks of secrets or config. In our prompt, we won’t provide secrets, only code and error messages, so that’s safe.
Permission to Push: The GITHUB_TOKEN has default push permissions to the repo. However, if branch protection is enabled on main (not sure if feature branches are protected), pushing to a PR branch is usually fine. We should ensure the token is allowed to push to that branch; since the PR branch is user-created, it typically is. If needed, we might use a PAT with repo scope stored as a secret for pushing, but likely unnecessary.
Controlled Invocation: Only trigger auto-fix for trusted code. Because secrets are involved, this runs only for PRs within the repo. If an external fork’s PR fails CI, we do not run auto-fix (to prevent exposing AI API keys). Maintainers would have to manually handle those.
AI Guardrails: In AGENTS.md we should add guidance for Codex when doing auto-fix. For example:
“When automatically fixing tests, make minimal necessary changes. Do not refactor unrelated code. Ensure all tests pass locally before committing. Follow coding style and project guidelines (lint, formatting, etc.).”
We should also instruct the agent to use existing functions or patterns rather than introducing new dependencies for a quick fix, unless absolutely needed.
Emphasize safe fixes: e.g., if a test expectation is wrong rather than the code, the AI might suggest updating the test – which could be valid. But we should prefer to fix the code to meet the test unless the test is clearly incorrect. These nuances can be noted in AGENTS.md for the AI’s reference.
By implementing this auto-fix workflow, the pipeline becomes self-healing: CI failures trigger an AI fix attempt. This aligns with the user’s request that “if CI fails Codex automatically fixes and re-tests”. The documented AI bug fix steps
GitHub
 are essentially automated, eliminating the need for a developer to manually debug immediately.
4. Iterative Cycle: Re-Testing and Re-Review after Fixes
When Codex’s fix is pushed to the PR branch, it kicks off the cycle again for that PR:
The CI workflow will re-run on the updated commit. Ideally, the tests are now green (if the AI fix was successful). If, by chance, tests fail again, the auto-fix workflow could trigger again. (It might be wise to allow only one loop or we risk an AI loop. We can include a condition like github.run_attempt == 1 in the auto-fix trigger to only auto-fix on the first failure, so that it doesn’t keep retrying endlessly. This was a pattern used to avoid infinite loops in Claude Action as well
GitHub
.)
The AI review workflows (Codex review and ClaudeCode review) will trigger again on the PR synchronize event (any push updates the PR)
GitHub
GitHub
. Because we enabled use_sticky_comment:true, each will edit their previous comment with updated analysis rather than creating new comments. This means the AI reviews will now evaluate the PR including the new fixes:
If the fix resolved the issues, the AI comments might change status from “needs changes” to “approve” (for ClaudeCode’s 建议状态 field, it might change from "需要修改" to "批准"). The Codex reviewer might remove previous 🔴 issues or mark them resolved and lean toward approving if no new issues are found.
If the fix introduced new problems or still fails some criteria, the AI reviews will flag them. In practice, since CI is now passing, most critical issues should be resolved, so likely the AI reviews will be satisfied.
This iterative loop can repeat if necessary (though ideally just once). The developer can monitor the PR: they will see that after their initial push, the AI might have pushed 1-2 additional commits to fix tests, and the AI reviews update accordingly. The pipeline basically acts as an autonomous developer+reviewer team that brings the PR to a mergeable state. Note: We must ensure that multiple concurrent pushes don’t mess up the process:
If the human developer pushes another commit while Codex is working, our concurrency controls in workflows help. The CI uses concurrency by workflow+ref, so it cancels previous CI runs on that branch
GitHub
. The Codex review also cancels its prior run on new commit
GitHub
. The Claude review’s ensure-response logic handles any cases of missing comment. So things should stabilize after the last push.
The auto-fix workflow, using workflow_run, triggers per CI run completion. If a developer’s manual commit fixes the issue before Codex, then CI might succeed and the auto-fix (which triggers only on failure) simply won’t run. There’s no harm in that – the pipeline would proceed normally.
AGENTS.md: It’s worth adding a note for the Claude reviewer agent: that after an AI fix commit, some issues may already be resolved, so it should focus on any remaining problems. It should not keep demanding the same change if it sees it was fixed. (Claude’s analysis of diff might help; though the action likely provides the full PR diff context automatically.) Typically, the Claude Code action diff-checks might highlight recent changes. We trust the action to feed the PR’s latest state. Just ensure in AGENTS.md that Claude’s review should always reflect the latest code and test status (which it will, since it runs after CI and we can even supply test results summary in the prompt if desired). At this stage, we now have a PR where:
CI is green (tests passing),
Codex and ClaudeCode have given their reviews. Ideally they are positive (or at worst neutral) since the issues were fixed.
This leads to the final stage: merging and release artifacts.
5. Automatic Merge & Release Documentation Generation
When the PR is fully approved (implicitly by the AI reviews) and tests are passing, we want Codex to automatically merge the PR and generate release notes/artifacts like the CHANGELOG, architecture diagram, and risk list. Merge Trigger/Condition: We need to programmatically determine that “review passes.” Since we have two AI review comments, we should ensure neither is flagging blocking issues:
The ClaudeCode review comment includes a "建议状态" field with values “批准” (approve), “需要修改” (needs changes), or “拒绝” (reject)
GitHub
. We can parse this comment via the GitHub API.
The Codex review comment likely ends with a merge recommendation (“approve” or “block”)
GitHub
.
Additionally, we ensure the CI status is success (which we know by this point).
We might also consider requiring a minimum review score (Claude’s 评分 out of 10). If the score is very low, maybe we hold off. But since this is automated, the simplest check is the textual recommendation.
Implementing Auto-Merge: There are a couple ways:
Add a step in an existing workflow after reviews to handle merging. For example, in the Claude review workflow, after posting the comment and summary, we could add a job that depends on the review job and checks the content of the comment. However, the Claude workflow doesn’t inherently know about the Codex comment. Similarly, Codex workflow doesn’t know about Claude’s.
A better approach is a dedicated merge workflow that triggers on PR events or on a schedule to check merge criteria. A simple way: trigger on the PR labeled event. We could have the AI label the PR when it approves (though the current action doesn’t add labels, only comments). Alternatively, trigger on workflow_run of the review workflow completion. For example, once the Claude review workflow completes, we start a “merge-check” job that reads both comments.
One design: Use the Claude review workflow’s summary job. The Claude auto-review (pr-auto-review.yml) has a final job review-summary that currently just logs a status message
GitHub
. We can extend or follow that with a step to attempt auto-merge:
It can call the GitHub API to fetch the PR comments (similar to how ensure-response did)
GitHub
, filter for the Codex and Claude bot comments, and parse them. For example, search for “建议状态: 批准” and “approve” keywords.
Or simpler: require that Claude’s 建议状态 == 批准 (since Claude’s criteria is quite comprehensive). If Claude says "批准", we consider the PR approved. (We might also ensure Codex didn’t explicitly say “block”. If Codex had major concerns, it likely would have said block.)
Then verify CI status. We can either trust that CI is done (since auto-fix wouldn’t run if CI was already success). But for safety, check that the latest commit status is success (GitHub provides status or check-runs API).
If all good, use an API call to merge the PR. We can use octokit.rest.pulls.merge via github-script, or invoke gh pr merge. For a clean history, probably a squash merge or rebase merge could be chosen; but the user did not specify, so a normal merge commit is fine or squash to keep one commit. We’ll assume a merge commit.
Example using github-script to merge:
- name: Merge PR
  if: ${{ steps.analysis.outputs.can_merge == 'true' }}
  uses: actions/github-script@v7
  with:
    script: |
      await github.rest.pulls.merge({
        owner: context.repo.owner,
        repo: context.repo.repo,
        pull_number: ${context.issue.number},
        merge_method: 'squash'
      });
We must ensure the GitHub token has the right to merge. If branch protection requires e.g. 1 approving human review, our bots’ comments might not count. If branch protection is in place, this auto-merge could be blocked. Since the current process was manual merge
GitHub
, they might not have branch protection enforced yet (their next-step suggestions included adding branch protection)
GitHub
. For now, we assume the action can merge (the GITHUB_TOKEN of a workflow run triggered by a repository write member will have push/merge rights). We should run this in the main repository context (not from a fork). After this step, the PR is merged into main 🎉. This triggers any workflows on push to main. Generating Release Artifacts (CHANGELOG, Diagram, Risks): Once merged, we need to produce the release notes. We have a few options:
On merge (still within the PR workflow): We could continue the job after the merge API call to gather info and create artifacts.
On push to main: The repository already has a Docker build workflow on push to master
GitHub
. We can create another workflow or extend an existing one to generate release documentation whenever something is merged to main.
A convenient approach is to use the GitHub Releases feature to publish release notes. Possibly we tie it to version tags. The CICD setup doc suggests automating release notes on tagging
GitHub
. We could integrate with that:
Use Conventional Commit messages from all commits in the PR to build a CHANGELOG entry (since the user follows Conventional Commits
GitHub
, we can categorize features, fixes, etc. automatically).
However, if we merge every PR individually, we might not tag every single PR as a release. Perhaps the user wants a release per PR. If so, we can auto-increment a version or use date-based versioning.
To keep it simple, we can generate the release content now and either:
Create a draft GitHub Release named after this PR (or bump version) with the content.
Or commit a CHANGELOG.md update to the repo.
Given the request explicitly mentions generating 发布说明 (release notes) including changelog, diagram, risks, we should make these easily visible. Let’s outline what each contains and how to generate them via Codex:
CHANGELOG: Summarize the changes in this PR. We have context like PR title, description, and commit messages. Codex can combine these to produce a concise list of changes. For example, if commit messages were conventional, list each as a bullet under categories (Features, Fixes, etc.). If not, just summarize in a paragraph. This can be in Chinese if the project documentation is Chinese. (Likely yes, since internal docs are Chinese.)
Architecture Diagram: Use AI to describe or illustrate the updated architecture. Since generating an actual image automatically is tricky, we can have Codex output a Mermaid diagram code or textual diagram:
E.g., a Mermaid flowchart or sequence diagram showing components (Frontend, Backend, Database, External API). The prompt could be: “Update the high-level architecture diagram of the system, in Mermaid syntax, highlighting any new component or changes introduced by this PR. If no major arch change, still present the overall architecture for completeness.”
Mermaid code in the release notes can render on GitHub (Mermaid is supported in markdown). Alternatively, Codex could output an ASCII art diagram or a textual description of the architecture if Mermaid is not desired.
Another option: if there was already an architecture image in docs, we could attempt to update it, but that’s complex. We stick to generating a new diagram snippet.
Risk List: Ask Codex to enumerate potential risks or things to watch out for after this change is deployed. For example:
Performance hotspots (e.g., “the new image processing might use more memory”),
Security implications (e.g., “added dependency X, ensure it’s trusted”),
Known limitations or edge cases not covered.
If the PR is small, risk list might be short or generic (“No major risks – all changes are internal refactors.”). That’s fine.
This essentially acts as a mini post-merge review from the AI focusing on deployment and maintenance concerns (very useful for release managers).
Codex CLI for Release Notes: We can implement this in a workflow (perhaps triggered on push to main). For instance, a release-notes job that runs after merge:
Use actions/checkout to get the latest main.
Use actions/github-script or a custom script to gather data: PR title/body (from the merge commit message or by calling GitHub API to get the merged PR details), commit list in the PR, etc.
Construct a prompt for the OpenAI API (Codex/GPT-4) like:
*“You are an AI Release Notes Assistant. We just merged a pull request into the main branch. Here are the details: [PR title/description, list of commits].
Summarize the changes in a CHANGELOG section (in Chinese) using bullet points.
Provide an Architecture section: give a high-level architecture diagram or description in Mermaid markdown if appropriate.
Provide a Risk Assessment section: list any potential risks or important things to note about this release (performance, security, etc.).”*
Get the AI’s response and then either:
Use the GitHub API to create a new Release with this content (perhaps tag the commit with a version like v1.0.X if versioning is in place; or use the PR number as an identifier). The release notes field will contain the markdown from AI (which can include the diagram and lists).
Also, possibly commit the changelog: e.g., append to a CHANGELOG.md file and commit. The architecture diagram and risk list could be included in a markdown file in docs/ (since .github/workflows/ci.yml ignores docs/** on push
GitHub
, adding docs won’t retrigger CI). For persistent record, adding to the repo is nice; but it does create an extra commit on main for every PR merge. If that’s acceptable, we can do it. Alternatively, rely on GitHub Releases as the source of truth for release notes.
The user explicitly said “生成 CHANGELOG、架构图、风险清单等发布物 (generate CHANGELOG, architecture diagram, risk list and other release artifacts).” This suggests these might be assembled into release documentation. A GitHub Release page is a logical place. However, it might also be intended to store in the repo for reference. We could do both (generate in release, and commit a copy in docs). Environment & Security: To generate release notes, we again use the AI API keys. Since this runs on push to main (a trusted context), secrets are available. No user input here, just code and commit info, so prompt injection isn’t a concern. We must ensure the AI doesn’t hallucinate incorrect details – providing it with the actual commit diff or PR body helps accuracy. Also, verify the architecture diagram syntax (Mermaid) is correct, or it might not render – possibly have a step to lint the Mermaid (there are CLI tools) or just trust the AI if the architecture is simple. AGENTS.md Updates: In AGENTS.md, add a section for Release Artifact Generation guidelines for Codex:
The AI should be instructed to follow a standard format for release notes: e.g. “## Changelog”, “## Architecture”, “## Risks” sections.
It should keep the language concise and factual. If writing in Chinese (since the project docs are largely Chinese), maintain a professional tone.
For the architecture diagram, note that it should be high-level (don’t try to include every file, just major components) and accurately reflect any new modules or integration introduced by the PR.
For risks, instruct the agent to think like a reviewer: any security implications, performance concerns, edge cases, or things that need monitoring post-deployment should be listed.
Also, ensure the agent does not reveal sensitive info (like internal server IPs or keys) in release notes. Only discuss what's relevant from the code changes.
Finally, after this step, the PR is merged, a new release notes is generated, and the CI/CD pipeline for that change is essentially complete. The Docker build workflow (already existing) will pick up the new commit on main and build/push the container image to GHCR
GitHub
GitHub
. A maintainer can then trigger the deployment workflow manually to push to production when ready (unless we automate that too in the future).
6. Optimizing Workflows & Documentation (AGENTS.md)
To implement the above, we should refine some existing workflow files and the AGENTS.md guidelines:
CI Workflow (ci.yml): Add the PR auto-create job at the end on success. Also, ensure that the CI jobs have appropriate conditions (we might skip E2E on pushes to non-main to save time, but since we want full test before PR, we kept it manual local. However, in our case we are running tests on push anyway then PR again – a bit redundant. We could decide to run full tests only on PR to avoid double load. But the user specifically said local tests pass then PR, so likely the push is after they've run tests locally. We can keep CI on push to do at least a quick check or just trust local and directly PR. It might be simpler to trigger PR creation immediately on push (assuming the developer only pushes after passing tests). For safety, we used CI to gate it though.) Also, if there are any lint or type-check steps to add (the CICD_SETUP.md mentioned lint/typecheck gates
GitHub
), we should include those before tests and also feed failures to AI fix if needed (though AI fix focusing on test failures primarily; lint issues could also be auto-fixed with a formatter or simple suggestions).
Codex Review Workflow: We might rename it or comment in it that it uses Claude under the hood (to avoid confusion, since it’s called Codex but uses claude-code-action). No functional change needed besides making sure the prompt stays up-to-date with project focus. Given we now have a separate Claude review, we might tweak Codex’s prompt to avoid too much overlap. For example, let Codex focus more on maintainability/testing and Claude on security/compliance, etc. But some redundancy is fine (two opinions on same areas).
ClaudeCode Review Workflow: It’s quite elaborate already. Ensure the anthropic_base_url handling is only via env (to avoid warning)
GitHub
. The final verification report suggests removing the unsupported input to clean up warnings
GitHub
. We implement that. Also, the continue-on-error: ... trick they used
GitHub
 could be kept or adjusted. (They set Claude step to continue-on-error on first run attempt so that if Claude fails, it doesn’t block CI – it posts fallback instead. That’s fine.)
Auto-Fix Workflow: This is new; we will document it clearly. Key points: only runs on our CI failure for PRs, uses secrets for AI, and pushes commits. We will note in the workflow file comments that it implements the steps from AI Bug Fix in the docs
GitHub
.
Merge/Release Workflow: We might integrate this with the Claude review workflow as mentioned. Or implement a small separate workflow triggered on push to main (to handle release notes after every merge). Either approach, clearly comment what it does. Perhaps a separate .github/workflows/release-notes.yml triggered on push to main (filtering out dependabot or docs changes if needed):
Trigger: on: push: branches: [main].
Condition: maybe only trigger when the push is a merge commit from a PR (we can detect commit message contains “Merge pull request”).
Steps: checkout, collect PR info via GitHub API (the commit or PR number might be in the commit message), generate notes with AI, publish notes (commit or release).
This decouples it from PR context and ensures it runs in an environment where the code is final.
AGENTS.md: Update this file to reflect:
Codex (OpenAI) Agent: roles in auto-fixing and merging. Provide instructions for how it should handle code changes (as discussed, minimal changes, test focus, commit message conventions). Also guidelines for generating release docs (structure, accuracy, no leaking secrets).
Claude Code Agent: clarify its role is solely review; ensure it doesn’t attempt to make code changes. It should focus on identifying issues. Also mention that its approval will be used to gate auto-merge, so it should only approve if truly no major issues remain. This might entail instructing Claude to treat any test failure or critical security issue as a “拒绝” or “needs changes”, and only give “批准” if code is production-ready. (The prompt already leans that way by asking for block/approve at end
GitHub
 and a score.)
Perhaps add a note that both agents should remain respectful and professional in comments (they do, since prompt is formal).
Keep existing content about keeping changes small, respecting structure
GitHub
, since that’s relevant for AI as well (AI should not refactor whole codebase in an auto-fix).
If any environment-specific instructions for AI (like “don’t reveal API keys”, or “if something about DeepSeek API appears, note it”), include those.
Summary: With the above changes, the CI/CD pipeline becomes fully automated:
A developer’s push triggers CI and automatically opens a PR if tests passed.
Opening a PR triggers both Codex and ClaudeCode AI reviews independently
GitHub
GitHub
, as well as the CI tests on the PR.
If CI fails, an AI fix workflow activates to correct the code and push a commit
GitHub
. The PR is updated and CI runs again.
Each update triggers the AI reviews again, providing iterative feedback until no critical issues remain.
Once CI is green and AI reviews signal approval, the pipeline automatically merges the PR. Codex then generates the release artifacts: updating the CHANGELOG and producing an architecture diagram and risk assessment for the release (e.g., via a Release note or commit).
The Docker image build workflow picks up the new main commit and builds/deploys as configured (continuing the CD process)
GitHub
.
This end-to-end pipeline fulfills the user’s requirements. It leverages the existing workflows (CI, Claude review) and adds the missing pieces (auto PR, auto-fix, auto-merge, and release note generation) in a cohesive manner. The result is a highly automated CI/CD system where AI agents assist at each stage: code review, test failure fixing, and even documenting the release. Human oversight is still important (one should monitor AI commits and reviews), but the heavy lifting is automated, accelerating the development workflow. Sources:
StoryApp CI workflow (build/tests)
GitHub
GitHub
Codex review workflow (Claude-based, PR trigger, prompt with 🔴🟡🟢 and merge suggestion)
GitHub
GitHub
ClaudeCode auto-review workflow (PR trigger, structured review report template)
GitHub
GitHub
Project docs – AI bug fix flow and CI/CD overview
GitHub
GitHub
Final fix report – Claude action integration and best practices (token usage, env vars, continue-on-error)
GitHub
GitHub
Repository guidelines (commit conventions, PR requirements)
GitHub
 and environment configuration for AI
GitHub
.

Sources


未选择任何文件未选择任何文件

End-to-End AI-Driven CI/CD Pipeline Design for storyapp
In this design, we integrate GitHub Actions workflows with Codex (OpenAI/AI agent) and ClaudeCode (Anthropic) to automate the entire CI/CD process. The pipeline covers everything from local testing and PR creation to AI code review, automatic fixes on test failure, and final merge with release documentation. Below we outline each stage, including the workflow files involved, the triggers, required environment variables, security considerations, and how to update existing workflows/AGENTS.md for this AI-driven process.
1. Automated PR Creation After Local Tests Pass
Trigger & Workflow: After a developer runs local container tests (e.g. via Docker Compose and npm test) and all tests pass, the changes are pushed to the repository. On push to a feature branch (non-main), we configure the CI workflow to automatically open a Pull Request targeting main. We can achieve this by extending the existing CI workflow (.github/workflows/ci.yml)
GitHub
 with a job that runs on successful completion of tests for branch pushes (excluding main). For example:
CI Workflow (ci.yml) – Already triggers on every push to any branch and on PRs
GitHub
. We add a final job (e.g., open-pr) that runs if the workflow was triggered by a branch push (not a PR) and all test jobs succeeded. This job will use the GitHub API or CLI to create a PR. It should have permission pull-requests: write (added in the workflow permissions) to create the PR.
Codex CLI Instruction: No AI is needed just to open the PR – this is a straightforward scripting step. We can use GitHub CLI in a run step, for example:
- name: Create Pull Request
  if: ${{ github.event_name == 'push' && github.ref != 'refs/heads/main' && success() }}
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  run: gh pr create --title "Auto PR: ${GITHUB_REF#refs/heads/}" --body "This PR was opened automatically after all local tests passed." --base main --head ${GITHUB_REF#refs/heads/}
This will open a PR from the current branch to main once tests pass. (Alternatively, we could use actions/github-script to call the Octokit API to create a PR.) Environment Variables: This step relies on the built-in GITHUB_TOKEN (with pull_requests: write permission) to authenticate the PR creation. No external AI keys required here. Security Policies: We ensure this auto-PR creation only runs for branches in the same repo (for forked contributions, the GITHUB_TOKEN is read-only and the step will be skipped). We might restrict by actor if necessary (e.g., only repository members trigger it). Also, use a clear PR title and body (no sensitive info). Following the repo’s PR guidelines
GitHub
, the commit messages should use Conventional Commit format (e.g. “feat: ...” or “fix: ...”), which will carry into the PR title or can be templated in the body.
2. Dual Independent AI Code Reviews on PR Open/Update
Once the PR is opened (whether manually or by the above automation), two parallel code review workflows kick off – one branded as “Codex” and one as “ClaudeCode”. Both use Anthropic’s Claude (or similar LLMs) under the hood but with different prompts/personas to provide independent perspectives. The user has already configured a ClaudeCode auto-review workflow; we will run both in parallel for thorough review. Trigger: Both workflows trigger on the Pull Request event (types: opened, reopened, synchronized – i.e., new commits – and ready_for_review)
GitHub
. They are scoped to PRs targeting the main branch (as configured in the Claude workflow)
GitHub
.
Workflow A: Codex Review (.github/workflows/codex-review.yml) – This workflow represents an “Automated Review Assistant (Codex)”. It uses the anthropics/claude-code-action@v1 to post an AI-generated review comment on the PR
GitHub
. The prompt for Codex is tailored to focus on code quality and best practices:
Codex Prompt (Chinese): Instruct the AI to review the PR focusing on:
Code quality & maintainability (TypeScript types, module boundaries, error handling)
Security (input validation, use of secrets, dependency risks)
Performance (frontend rendering efficiency, backend DB/query hotspots)
Testing (adequacy of unit/E2E tests, suggest any additional tests)
Children’s app compliance (COPPA, content filtering, parental controls)
Output: Provide feedback in Chinese, in a single PR comment with bullet points marked 🔴 (critical issues), 🟡 (suggestions), 🟢 (good points). Mention specific files/lines with issues, give actionable improvement advice or examples, and finally a merge recommendation (“block”, “neutral”, or “approve”) with a brief rationale
GitHub
GitHub
.
The Codex review workflow ensures it doesn’t run on draft PRs (if: !github.event.pull_request.draft)
GitHub
. It also defines a concurrency group per PR (codex-${{ github.ref }}) to avoid overlapping runs on the same PR
GitHub
 (auto-cancelling previous review runs if a new commit arrives). This workflow requires access to post comments, so we set permissions: pull-requests: write, issues: write for the job
GitHub
. It uses the Claude API via the secrets ANTHROPIC_API_KEY and ANTHROPIC_BASE_URL (if using a custom proxy) for authentication
GitHub
.
Workflow B: ClaudeCode Review (.github/workflows/pr-auto-review.yml) – This is the official Claude Code review process already in place. It likewise triggers on PR open/update (for main branch PRs)
GitHub
. It uses the same anthropics/claude-code-action@v1 but with a more structured prompt and output format. The prompt asks Claude to do a comprehensive code review covering similar points (code quality, security, performance, testing) plus any StoryApp-specific checks (e.g. feature completeness, API security, MongoDB query usage, React best practices)
GitHub
GitHub
. It explicitly reminds the AI about children’s app requirements (COPPA compliance, content safety)
GitHub
. ClaudeCode is instructed to output a formatted review report in Chinese, for example:
### 📋 代码评审报告

**PR概述**: _Summary of changes..._

#### 🔴 严重问题
- ... (or "无" if none)

#### 🟡 建议改进
- ... (or "无")

#### 🟢 良好实践
- ... (good aspects or "无")

**📊 评审评分**: X/10 分  
**✅ 建议状态**: 批准/需要修改/拒绝  
**💬 总体建议**: _Overall comments..._

*🤖 本评审由Claude Code自动生成 | 时间: ...*
The workflow ensures the comment follows this template strictly
GitHub
GitHub
. It also uses use_sticky_comment: true and track_progress: true so that if the workflow re-runs, it edits the same comment rather than adding multiples
GitHub
. Like Codex, it only runs on non-draft PRs
GitHub
 and uses secrets for Claude API access
GitHub
. It sets appropriate permissions (contents read, PR/issue write, id-token if needed)
GitHub
. Additionally, this workflow has steps to ensure reliability: for example, an “ensure-response” job that checks if Claude’s comment was posted and if not, posts a fallback message
GitHub
GitHub
, so that the PR is never without a review comment. It also logs the review status for visibility
GitHub
.
Environment Variables: Both review jobs need the Anthropic API Key and possibly a Base URL. According to the project’s setup, ANTHROPIC_API_KEY is stored in GitHub Secrets, and ANTHROPIC_BASE_URL is set to the GAC platform proxy endpoint
GitHub
. We pass these either via with: parameters or (as the team discovered) via environment variables to avoid warnings (Claude Action v1 doesn’t officially support anthropic_base_url as input)
GitHub
. For example, in the final fix they chose to supply the API key in both with and env for redundancy
GitHub
, and put the base URL in env. We will follow that optimized approach to ensure the action authenticates properly without OIDC issues
GitHub
. Security Policies: Both workflows adhere to least privilege:
They use the repository’s GITHUB_TOKEN (scoped to the repo) rather than any external credentials for GitHub operations
GitHub
. The final OIDC fix report confirms that using the default github_token with write access to PRs is the stable solution
GitHub
GitHub
.
Secrets (Claude API keys) are never printed in logs. The action will error if keys are missing or invalid, but the team even added a sanity check step to validate the GitHub token without exposing it
GitHub
.
Reviews on PRs from forks: By default, GitHub does not expose secrets to workflows on forked PRs. This means the Claude/Codex review actions will not run for external contributions (to avoid leaking API keys). That’s acceptable for security – maintainers would handle those PRs manually or could choose to run the action manually with appropriate safeguards. We assume most PRs in this project come from internal branches (given the user’s workflow). If needed, we could add an if: to ensure the PR is from the same repo (github.event.pull_request.head.repo.full_name == github.repository) before running the AI reviews, to be explicit.
AGENTS.md Updates: In AGENTS.md, we should document these dual review roles. For example:
Explain that “Codex” acts as an automated reviewer focusing on code quality/maintainability, security, etc., giving suggestions with severity labels (🔴🟡🟢) and a merge recommendation.
Explain that “ClaudeCode” provides a structured review report with a score and explicit status (approve/needs changes/reject).
Emphasize that both should remain objective, avoid bias, and not reveal any secret keys or internal URLs in their feedback (just assess the code and content).
We might also add that they should not conflict with each other’s advice in trivial ways – if they do differ, maintainers will see both viewpoints. Each operates independently, which is by design.
By having two independent AI reviews, we get a more robust code review process on each PR open/update. The PR author can see both comments: one more free-form with line-specific suggestions (Codex) and one a formal report with a checklist and score (ClaudeCode).
3. Continuous Integration (CI) with Automated AI Fix on Failure
In parallel with the AI reviews, the standard CI pipeline runs for the PR. The CI workflow (ci.yml) is already set up to run on pull_request events and on pushes
GitHub
. It covers building and testing of the application across backend, frontend, and end-to-end tests:
The CI has a “fast-checks” job for build and unit tests (runs on Node 20, installs dependencies with npm ci, builds shared, backend, frontend, then starts a MongoDB service container for tests, and runs backend Jest tests)
GitHub
GitHub
GitHub
.
If the PR is not a draft, it triggers the “deep-tests” job for full integration tests: it uses Docker Compose to bring up the app and DB in a CI environment (docker-compose.ci.yml), waits for health checks, installs Playwright browsers, then runs the Playwright E2E tests
GitHub
GitHub
. The Playwright HTML report is uploaded as an artifact for debugging if needed
GitHub
. (This aligns with the documented test commands in CLAUDE.md, where they show how to run containerized tests
GitHub
.)
If all tests pass, great – the CI succeeds. But if any test fails (unit or E2E), we want Codex (the AI agent) to automatically attempt to fix the issues and push a commit to the PR. This automates the bug-fix loop that would normally require a human. Here’s how we design the AI Auto-Fix step: Trigger for Auto-Fix: We use a separate workflow, say ai-auto-fix.yml, that runs on a CI failure. We can leverage the workflow_run trigger: it can listen for the “CI” workflow to complete. For example:
on:
  workflow_run:
    workflows: ["CI"]  # Name of the CI workflow
    types: [completed]
Within this, we add a condition to only run if the CI workflow failed (github.event.workflow_run.conclusion == 'failure') and if it was for a PR (we can check github.event.workflow_run.event == 'pull_request'). We also ensure the PR is from our repo (not a fork) so that secrets are available for AI. This gating prevents unauthorized code from external forks from triggering our AI fix with secrets. AI Fix Job Steps: The auto-fix job will do the following (following the “AI Bug Fix流程” that was outlined in the project docs
GitHub
, but now fully automated):
Checkout Code: Use actions/checkout to get the PR’s code at the failing commit
GitHub
.
Setup Environment: Install Node (use actions/setup-node) and any needed dependencies. Possibly run npm ci for both backend and frontend to ensure we can build/test. (The CI already did build/test, but running tests again in this workflow helps gather failure info.)
Run Tests to Collect Failures: Execute the same test suite to reproduce the failure. For example:
Run npm run build and npm test (which runs Playwright E2E by default) or run backend tests separately if needed. We might reuse the docker-compose for a consistent environment. This step should be allowed to fail without stopping the workflow (continue-on-error: true), so we can capture the error output.
Capture logs or test reports. We can direct test output to a file or parse the console output. This provides the error messages, stack traces, or failing test names to feed into the AI.
Analyze & Prompt AI (Codex) for Fix: Now we invoke the AI to generate a fix. We have two provider options:
Anthropic Claude: Since we already use Claude for reviews, we could also prompt Claude to suggest code changes. Claude is good at following complex instructions and code context. We would provide it with a prompt that includes a summary of failing tests (e.g., “Test X expected Y but got Z at file.js line 123”), possibly the relevant code snippets (the functions or lines that failed), and ask for a patch.
OpenAI Codex/GPT-4: The term “Codex” might imply using OpenAI’s code model. The project has support for OpenAI API as well
GitHub
. We can choose the best model for code fixes (GPT-4 can produce reliable code fixes). The user has an OpenAI API key secret presumably. In the workflow we can offer a choice or just use one.
For automation, we might use an existing GitHub Action or CLI to interface with the AI. Since the project already uses Claude via the claude-code-action, one approach is to use a separate instance of it in “diff” mode if supported (though the Claude action mainly writes comments, not code to repo). Alternatively, use actions/github-script to call the OpenAI API directly (writing a small NodeJS snippet with OpenAI SDK) or use a community action for OpenAI. To keep it straightforward, assume we call the OpenAI API:
Prepare a prompt like:
“The following tests are failing:\n<include test errors and relevant code context>. Please propose code changes (in diff or clear list form) to fix the failures. Only output the changes to make, no extra explanation.”
The AI’s response could be a unified diff or instructions. Ideally, we ask for a diff format so we can apply it programmatically. (If using GPT-4, instruct it to output markdown-formatted diff for each file.)
Apply the Fix to Code: Take the AI’s suggested changes and apply them. This could be done by:
If the AI provided a unified diff, save it to a file and use UNIX patch: git apply patch.diff.
If it provided pseudo-code or instructions, we might need a more sophisticated parser. However, since we control the prompt, we can ask for a diff or at least code blocks we can replace. We should double-check the changes don’t introduce new issues or break formatting.
After applying, run git diff to see the changes, and add those to the commit.
Commit and Push the Fix: Use Git config with an bot identity (e.g., an account or just the GITHUB_TOKEN which can push to the branch if it’s in the same repo). Commit message should follow Conventional Commits, e.g. "fix(e2e): AI fix for failing tests" or similar
GitHub
. Pushing the commit will update the PR. The CI workflow (and the review workflows) will automatically be triggered again by this push.
Verify the Fix (Re-run tests): (This could be optional in the fix workflow since the CI will run anyway on the pushed commit. But to be safe, we can run tests again within the fix workflow before pushing.)
If we run tests again in this job and they are still failing, we know the AI’s first fix didn’t work. We might then choose to repeat the AI fix step with more context or bail out. To avoid an infinite loop, we likely limit to one attempt, or maybe two at most, then leave the rest to human if it fails multiple times.
If tests pass locally in the fix workflow, it’s a good sign. We push the commit, and the upstream CI will also run and should pass.
Environment Variables: The auto-fix workflow will need access to AI API keys. If using Claude via the same action, we use ANTHROPIC_API_KEY; if using OpenAI, we need an OPENAI_API_KEY secret configured (the README guides adding OpenAI API key in secrets
GitHub
). We must ensure these secrets are available – by default, workflow_run events do have access to secrets as long as the original event (pull_request) is from the same repo (which we’ve ensured). Also, the Node environment for running tests might need environment variables (e.g., test database URL). The CI already uses a MongoDB service; in the fix job, we can reuse the same Docker Compose for consistency. For example, set MONGODB_URI for tests (point it at localhost or a compose service if we spin one up). We should also include any necessary env (like NODE_ENV=test) similar to CI
GitHub
. Security Policies:
Scoped Secrets: The AI keys are kept in GitHub Secrets. We use them only in this workflow and do not log the raw values. Any AI responses (which might include code) should be reviewed – we should avoid the AI printing out large chunks of secrets or config. In our prompt, we won’t provide secrets, only code and error messages, so that’s safe.
Permission to Push: The GITHUB_TOKEN has default push permissions to the repo. However, if branch protection is enabled on main (not sure if feature branches are protected), pushing to a PR branch is usually fine. We should ensure the token is allowed to push to that branch; since the PR branch is user-created, it typically is. If needed, we might use a PAT with repo scope stored as a secret for pushing, but likely unnecessary.
Controlled Invocation: Only trigger auto-fix for trusted code. Because secrets are involved, this runs only for PRs within the repo. If an external fork’s PR fails CI, we do not run auto-fix (to prevent exposing AI API keys). Maintainers would have to manually handle those.
AI Guardrails: In AGENTS.md we should add guidance for Codex when doing auto-fix. For example:
“When automatically fixing tests, make minimal necessary changes. Do not refactor unrelated code. Ensure all tests pass locally before committing. Follow coding style and project guidelines (lint, formatting, etc.).”
We should also instruct the agent to use existing functions or patterns rather than introducing new dependencies for a quick fix, unless absolutely needed.
Emphasize safe fixes: e.g., if a test expectation is wrong rather than the code, the AI might suggest updating the test – which could be valid. But we should prefer to fix the code to meet the test unless the test is clearly incorrect. These nuances can be noted in AGENTS.md for the AI’s reference.
By implementing this auto-fix workflow, the pipeline becomes self-healing: CI failures trigger an AI fix attempt. This aligns with the user’s request that “if CI fails Codex automatically fixes and re-tests”. The documented AI bug fix steps
GitHub
 are essentially automated, eliminating the need for a developer to manually debug immediately.
4. Iterative Cycle: Re-Testing and Re-Review after Fixes
When Codex’s fix is pushed to the PR branch, it kicks off the cycle again for that PR:
The CI workflow will re-run on the updated commit. Ideally, the tests are now green (if the AI fix was successful). If, by chance, tests fail again, the auto-fix workflow could trigger again. (It might be wise to allow only one loop or we risk an AI loop. We can include a condition like github.run_attempt == 1 in the auto-fix trigger to only auto-fix on the first failure, so that it doesn’t keep retrying endlessly. This was a pattern used to avoid infinite loops in Claude Action as well
GitHub
.)
The AI review workflows (Codex review and ClaudeCode review) will trigger again on the PR synchronize event (any push updates the PR)
GitHub
GitHub
. Because we enabled use_sticky_comment:true, each will edit their previous comment with updated analysis rather than creating new comments. This means the AI reviews will now evaluate the PR including the new fixes:
If the fix resolved the issues, the AI comments might change status from “needs changes” to “approve” (for ClaudeCode’s 建议状态 field, it might change from "需要修改" to "批准"). The Codex reviewer might remove previous 🔴 issues or mark them resolved and lean toward approving if no new issues are found.
If the fix introduced new problems or still fails some criteria, the AI reviews will flag them. In practice, since CI is now passing, most critical issues should be resolved, so likely the AI reviews will be satisfied.
This iterative loop can repeat if necessary (though ideally just once). The developer can monitor the PR: they will see that after their initial push, the AI might have pushed 1-2 additional commits to fix tests, and the AI reviews update accordingly. The pipeline basically acts as an autonomous developer+reviewer team that brings the PR to a mergeable state. Note: We must ensure that multiple concurrent pushes don’t mess up the process:
If the human developer pushes another commit while Codex is working, our concurrency controls in workflows help. The CI uses concurrency by workflow+ref, so it cancels previous CI runs on that branch
GitHub
. The Codex review also cancels its prior run on new commit
GitHub
. The Claude review’s ensure-response logic handles any cases of missing comment. So things should stabilize after the last push.
The auto-fix workflow, using workflow_run, triggers per CI run completion. If a developer’s manual commit fixes the issue before Codex, then CI might succeed and the auto-fix (which triggers only on failure) simply won’t run. There’s no harm in that – the pipeline would proceed normally.
AGENTS.md: It’s worth adding a note for the Claude reviewer agent: that after an AI fix commit, some issues may already be resolved, so it should focus on any remaining problems. It should not keep demanding the same change if it sees it was fixed. (Claude’s analysis of diff might help; though the action likely provides the full PR diff context automatically.) Typically, the Claude Code action diff-checks might highlight recent changes. We trust the action to feed the PR’s latest state. Just ensure in AGENTS.md that Claude’s review should always reflect the latest code and test status (which it will, since it runs after CI and we can even supply test results summary in the prompt if desired). At this stage, we now have a PR where:
CI is green (tests passing),
Codex and ClaudeCode have given their reviews. Ideally they are positive (or at worst neutral) since the issues were fixed.
This leads to the final stage: merging and release artifacts.
5. Automatic Merge & Release Documentation Generation
When the PR is fully approved (implicitly by the AI reviews) and tests are passing, we want Codex to automatically merge the PR and generate release notes/artifacts like the CHANGELOG, architecture diagram, and risk list. Merge Trigger/Condition: We need to programmatically determine that “review passes.” Since we have two AI review comments, we should ensure neither is flagging blocking issues:
The ClaudeCode review comment includes a "建议状态" field with values “批准” (approve), “需要修改” (needs changes), or “拒绝” (reject)
GitHub
. We can parse this comment via the GitHub API.
The Codex review comment likely ends with a merge recommendation (“approve” or “block”)
GitHub
.
Additionally, we ensure the CI status is success (which we know by this point).
We might also consider requiring a minimum review score (Claude’s 评分 out of 10). If the score is very low, maybe we hold off. But since this is automated, the simplest check is the textual recommendation.
Implementing Auto-Merge: There are a couple ways:
Add a step in an existing workflow after reviews to handle merging. For example, in the Claude review workflow, after posting the comment and summary, we could add a job that depends on the review job and checks the content of the comment. However, the Claude workflow doesn’t inherently know about the Codex comment. Similarly, Codex workflow doesn’t know about Claude’s.
A better approach is a dedicated merge workflow that triggers on PR events or on a schedule to check merge criteria. A simple way: trigger on the PR labeled event. We could have the AI label the PR when it approves (though the current action doesn’t add labels, only comments). Alternatively, trigger on workflow_run of the review workflow completion. For example, once the Claude review workflow completes, we start a “merge-check” job that reads both comments.
One design: Use the Claude review workflow’s summary job. The Claude auto-review (pr-auto-review.yml) has a final job review-summary that currently just logs a status message
GitHub
. We can extend or follow that with a step to attempt auto-merge:
It can call the GitHub API to fetch the PR comments (similar to how ensure-response did)
GitHub
, filter for the Codex and Claude bot comments, and parse them. For example, search for “建议状态: 批准” and “approve” keywords.
Or simpler: require that Claude’s 建议状态 == 批准 (since Claude’s criteria is quite comprehensive). If Claude says "批准", we consider the PR approved. (We might also ensure Codex didn’t explicitly say “block”. If Codex had major concerns, it likely would have said block.)
Then verify CI status. We can either trust that CI is done (since auto-fix wouldn’t run if CI was already success). But for safety, check that the latest commit status is success (GitHub provides status or check-runs API).
If all good, use an API call to merge the PR. We can use octokit.rest.pulls.merge via github-script, or invoke gh pr merge. For a clean history, probably a squash merge or rebase merge could be chosen; but the user did not specify, so a normal merge commit is fine or squash to keep one commit. We’ll assume a merge commit.
Example using github-script to merge:
- name: Merge PR
  if: ${{ steps.analysis.outputs.can_merge == 'true' }}
  uses: actions/github-script@v7
  with:
    script: |
      await github.rest.pulls.merge({
        owner: context.repo.owner,
        repo: context.repo.repo,
        pull_number: ${context.issue.number},
        merge_method: 'squash'
      });
We must ensure the GitHub token has the right to merge. If branch protection requires e.g. 1 approving human review, our bots’ comments might not count. If branch protection is in place, this auto-merge could be blocked. Since the current process was manual merge
GitHub
, they might not have branch protection enforced yet (their next-step suggestions included adding branch protection)
GitHub
. For now, we assume the action can merge (the GITHUB_TOKEN of a workflow run triggered by a repository write member will have push/merge rights). We should run this in the main repository context (not from a fork). After this step, the PR is merged into main 🎉. This triggers any workflows on push to main. Generating Release Artifacts (CHANGELOG, Diagram, Risks): Once merged, we need to produce the release notes. We have a few options:
On merge (still within the PR workflow): We could continue the job after the merge API call to gather info and create artifacts.
On push to main: The repository already has a Docker build workflow on push to master
GitHub
. We can create another workflow or extend an existing one to generate release documentation whenever something is merged to main.
A convenient approach is to use the GitHub Releases feature to publish release notes. Possibly we tie it to version tags. The CICD setup doc suggests automating release notes on tagging
GitHub
. We could integrate with that:
Use Conventional Commit messages from all commits in the PR to build a CHANGELOG entry (since the user follows Conventional Commits
GitHub
, we can categorize features, fixes, etc. automatically).
However, if we merge every PR individually, we might not tag every single PR as a release. Perhaps the user wants a release per PR. If so, we can auto-increment a version or use date-based versioning.
To keep it simple, we can generate the release content now and either:
Create a draft GitHub Release named after this PR (or bump version) with the content.
Or commit a CHANGELOG.md update to the repo.
Given the request explicitly mentions generating 发布说明 (release notes) including changelog, diagram, risks, we should make these easily visible. Let’s outline what each contains and how to generate them via Codex:
CHANGELOG: Summarize the changes in this PR. We have context like PR title, description, and commit messages. Codex can combine these to produce a concise list of changes. For example, if commit messages were conventional, list each as a bullet under categories (Features, Fixes, etc.). If not, just summarize in a paragraph. This can be in Chinese if the project documentation is Chinese. (Likely yes, since internal docs are Chinese.)
Architecture Diagram: Use AI to describe or illustrate the updated architecture. Since generating an actual image automatically is tricky, we can have Codex output a Mermaid diagram code or textual diagram:
E.g., a Mermaid flowchart or sequence diagram showing components (Frontend, Backend, Database, External API). The prompt could be: “Update the high-level architecture diagram of the system, in Mermaid syntax, highlighting any new component or changes introduced by this PR. If no major arch change, still present the overall architecture for completeness.”
Mermaid code in the release notes can render on GitHub (Mermaid is supported in markdown). Alternatively, Codex could output an ASCII art diagram or a textual description of the architecture if Mermaid is not desired.
Another option: if there was already an architecture image in docs, we could attempt to update it, but that’s complex. We stick to generating a new diagram snippet.
Risk List: Ask Codex to enumerate potential risks or things to watch out for after this change is deployed. For example:
Performance hotspots (e.g., “the new image processing might use more memory”),
Security implications (e.g., “added dependency X, ensure it’s trusted”),
Known limitations or edge cases not covered.
If the PR is small, risk list might be short or generic (“No major risks – all changes are internal refactors.”). That’s fine.
This essentially acts as a mini post-merge review from the AI focusing on deployment and maintenance concerns (very useful for release managers).
Codex CLI for Release Notes: We can implement this in a workflow (perhaps triggered on push to main). For instance, a release-notes job that runs after merge:
Use actions/checkout to get the latest main.
Use actions/github-script or a custom script to gather data: PR title/body (from the merge commit message or by calling GitHub API to get the merged PR details), commit list in the PR, etc.
Construct a prompt for the OpenAI API (Codex/GPT-4) like:
*“You are an AI Release Notes Assistant. We just merged a pull request into the main branch. Here are the details: [PR title/description, list of commits].
Summarize the changes in a CHANGELOG section (in Chinese) using bullet points.
Provide an Architecture section: give a high-level architecture diagram or description in Mermaid markdown if appropriate.
Provide a Risk Assessment section: list any potential risks or important things to note about this release (performance, security, etc.).”*
Get the AI’s response and then either:
Use the GitHub API to create a new Release with this content (perhaps tag the commit with a version like v1.0.X if versioning is in place; or use the PR number as an identifier). The release notes field will contain the markdown from AI (which can include the diagram and lists).
Also, possibly commit the changelog: e.g., append to a CHANGELOG.md file and commit. The architecture diagram and risk list could be included in a markdown file in docs/ (since .github/workflows/ci.yml ignores docs/** on push
GitHub
, adding docs won’t retrigger CI). For persistent record, adding to the repo is nice; but it does create an extra commit on main for every PR merge. If that’s acceptable, we can do it. Alternatively, rely on GitHub Releases as the source of truth for release notes.
The user explicitly said “生成 CHANGELOG、架构图、风险清单等发布物 (generate CHANGELOG, architecture diagram, risk list and other release artifacts).” This suggests these might be assembled into release documentation. A GitHub Release page is a logical place. However, it might also be intended to store in the repo for reference. We could do both (generate in release, and commit a copy in docs). Environment & Security: To generate release notes, we again use the AI API keys. Since this runs on push to main (a trusted context), secrets are available. No user input here, just code and commit info, so prompt injection isn’t a concern. We must ensure the AI doesn’t hallucinate incorrect details – providing it with the actual commit diff or PR body helps accuracy. Also, verify the architecture diagram syntax (Mermaid) is correct, or it might not render – possibly have a step to lint the Mermaid (there are CLI tools) or just trust the AI if the architecture is simple. AGENTS.md Updates: In AGENTS.md, add a section for Release Artifact Generation guidelines for Codex:
The AI should be instructed to follow a standard format for release notes: e.g. “## Changelog”, “## Architecture”, “## Risks” sections.
It should keep the language concise and factual. If writing in Chinese (since the project docs are largely Chinese), maintain a professional tone.
For the architecture diagram, note that it should be high-level (don’t try to include every file, just major components) and accurately reflect any new modules or integration introduced by the PR.
For risks, instruct the agent to think like a reviewer: any security implications, performance concerns, edge cases, or things that need monitoring post-deployment should be listed.
Also, ensure the agent does not reveal sensitive info (like internal server IPs or keys) in release notes. Only discuss what's relevant from the code changes.
Finally, after this step, the PR is merged, a new release notes is generated, and the CI/CD pipeline for that change is essentially complete. The Docker build workflow (already existing) will pick up the new commit on main and build/push the container image to GHCR
GitHub
GitHub
. A maintainer can then trigger the deployment workflow manually to push to production when ready (unless we automate that too in the future).
6. Optimizing Workflows & Documentation (AGENTS.md)
To implement the above, we should refine some existing workflow files and the AGENTS.md guidelines:
CI Workflow (ci.yml): Add the PR auto-create job at the end on success. Also, ensure that the CI jobs have appropriate conditions (we might skip E2E on pushes to non-main to save time, but since we want full test before PR, we kept it manual local. However, in our case we are running tests on push anyway then PR again – a bit redundant. We could decide to run full tests only on PR to avoid double load. But the user specifically said local tests pass then PR, so likely the push is after they've run tests locally. We can keep CI on push to do at least a quick check or just trust local and directly PR. It might be simpler to trigger PR creation immediately on push (assuming the developer only pushes after passing tests). For safety, we used CI to gate it though.) Also, if there are any lint or type-check steps to add (the CICD_SETUP.md mentioned lint/typecheck gates
GitHub
), we should include those before tests and also feed failures to AI fix if needed (though AI fix focusing on test failures primarily; lint issues could also be auto-fixed with a formatter or simple suggestions).
Codex Review Workflow: We might rename it or comment in it that it uses Claude under the hood (to avoid confusion, since it’s called Codex but uses claude-code-action). No functional change needed besides making sure the prompt stays up-to-date with project focus. Given we now have a separate Claude review, we might tweak Codex’s prompt to avoid too much overlap. For example, let Codex focus more on maintainability/testing and Claude on security/compliance, etc. But some redundancy is fine (two opinions on same areas).
ClaudeCode Review Workflow: It’s quite elaborate already. Ensure the anthropic_base_url handling is only via env (to avoid warning)
GitHub
. The final verification report suggests removing the unsupported input to clean up warnings
GitHub
. We implement that. Also, the continue-on-error: ... trick they used
GitHub
 could be kept or adjusted. (They set Claude step to continue-on-error on first run attempt so that if Claude fails, it doesn’t block CI – it posts fallback instead. That’s fine.)
Auto-Fix Workflow: This is new; we will document it clearly. Key points: only runs on our CI failure for PRs, uses secrets for AI, and pushes commits. We will note in the workflow file comments that it implements the steps from AI Bug Fix in the docs
GitHub
.
Merge/Release Workflow: We might integrate this with the Claude review workflow as mentioned. Or implement a small separate workflow triggered on push to main (to handle release notes after every merge). Either approach, clearly comment what it does. Perhaps a separate .github/workflows/release-notes.yml triggered on push to main (filtering out dependabot or docs changes if needed):
Trigger: on: push: branches: [main].
Condition: maybe only trigger when the push is a merge commit from a PR (we can detect commit message contains “Merge pull request”).
Steps: checkout, collect PR info via GitHub API (the commit or PR number might be in the commit message), generate notes with AI, publish notes (commit or release).
This decouples it from PR context and ensures it runs in an environment where the code is final.
AGENTS.md: Update this file to reflect:
Codex (OpenAI) Agent: roles in auto-fixing and merging. Provide instructions for how it should handle code changes (as discussed, minimal changes, test focus, commit message conventions). Also guidelines for generating release docs (structure, accuracy, no leaking secrets).
Claude Code Agent: clarify its role is solely review; ensure it doesn’t attempt to make code changes. It should focus on identifying issues. Also mention that its approval will be used to gate auto-merge, so it should only approve if truly no major issues remain. This might entail instructing Claude to treat any test failure or critical security issue as a “拒绝” or “needs changes”, and only give “批准” if code is production-ready. (The prompt already leans that way by asking for block/approve at end
GitHub
 and a score.)
Perhaps add a note that both agents should remain respectful and professional in comments (they do, since prompt is formal).
Keep existing content about keeping changes small, respecting structure
GitHub
, since that’s relevant for AI as well (AI should not refactor whole codebase in an auto-fix).
If any environment-specific instructions for AI (like “don’t reveal API keys”, or “if something about DeepSeek API appears, note it”), include those.
Summary: With the above changes, the CI/CD pipeline becomes fully automated:
A developer’s push triggers CI and automatically opens a PR if tests passed.
Opening a PR triggers both Codex and ClaudeCode AI reviews independently
GitHub
GitHub
, as well as the CI tests on the PR.
If CI fails, an AI fix workflow activates to correct the code and push a commit
GitHub
. The PR is updated and CI runs again.
Each update triggers the AI reviews again, providing iterative feedback until no critical issues remain.
Once CI is green and AI reviews signal approval, the pipeline automatically merges the PR. Codex then generates the release artifacts: updating the CHANGELOG and producing an architecture diagram and risk assessment for the release (e.g., via a Release note or commit).
The Docker image build workflow picks up the new main commit and builds/deploys as configured (continuing the CD process)
GitHub
.
This end-to-end pipeline fulfills the user’s requirements. It leverages the existing workflows (CI, Claude review) and adds the missing pieces (auto PR, auto-fix, auto-merge, and release note generation) in a cohesive manner. The result is a highly automated CI/CD system where AI agents assist at each stage: code review, test failure fixing, and even documenting the release. Human oversight is still important (one should monitor AI commits and reviews), but the heavy lifting is automated, accelerating the development workflow. Sources:
StoryApp CI workflow (build/tests)
GitHub
GitHub
Codex review workflow (Claude-based, PR trigger, prompt with 🔴🟡🟢 and merge suggestion)
GitHub
GitHub
ClaudeCode auto-review workflow (PR trigger, structured review report template)
GitHub
GitHub
Project docs – AI bug fix flow and CI/CD overview
GitHub
GitHub
Final fix report – Claude action integration and best practices (token usage, env vars, continue-on-error)
GitHub
GitHub
Repository guidelines (commit conventions, PR requirements)
GitHub
 and environment configuration for AI
GitHub
.
Citations
GitHub
ci.yml

https://github.com/haizhouyuan/storyapp/blob/5b735eb8225842d2ab1b2ff9639a1f635c79dae9/.github/workflows/ci.yml#L3-L11
GitHub
AGENTS.md

https://github.com/haizhouyuan/storyapp/blob/5b735eb8225842d2ab1b2ff9639a1f635c79dae9/AGENTS.md#L80-L88
GitHub
codex-review.yml

https://github.com/haizhouyuan/storyapp/blob/5b735eb8225842d2ab1b2ff9639a1f635c79dae9/.github/workflows/codex-review.yml#L3-L11
GitHub
pr-auto-review.yml

https://github.com/haizhouyuan/storyapp/blob/5b735eb8225842d2ab1b2ff9639a1f635c79dae9/.github/workflows/pr-auto-review.yml#L3-L11
GitHub
codex-review.yml

https://github.com/haizhouyuan/storyapp/blob/5b735eb8225842d2ab1b2ff9639a1f635c79dae9/.github/workflows/codex-review.yml#L34-L42
GitHub
codex-review.yml

https://github.com/haizhouyuan/storyapp/blob/5b735eb8225842d2ab1b2ff9639a1f635c79dae9/.github/workflows/codex-review.yml#L40-L48
GitHub
codex-review.yml

https://github.com/haizhouyuan/storyapp/blob/5b735eb8225842d2ab1b2ff9639a1f635c79dae9/.github/workflows/codex-review.yml#L50-L54
GitHub
codex-review.yml

https://github.com/haizhouyuan/storyapp/blob/5b735eb8225842d2ab1b2ff9639a1f635c79dae9/.github/workflows/codex-review.yml#L14-L22
GitHub
codex-review.yml

https://github.com/haizhouyuan/storyapp/blob/5b735eb8225842d2ab1b2ff9639a1f635c79dae9/.github/workflows/codex-review.yml#L7-L14
GitHub
codex-review.yml

https://github.com/haizhouyuan/storyapp/blob/5b735eb8225842d2ab1b2ff9639a1f635c79dae9/.github/workflows/codex-review.yml#L16-L24
GitHub
codex-review.yml

https://github.com/haizhouyuan/storyapp/blob/5b735eb8225842d2ab1b2ff9639a1f635c79dae9/.github/workflows/codex-review.yml#L20-L27
GitHub
pr-auto-review.yml

https://github.com/haizhouyuan/storyapp/blob/5b735eb8225842d2ab1b2ff9639a1f635c79dae9/.github/workflows/pr-auto-review.yml#L44-L53
GitHub
pr-auto-review.yml

https://github.com/haizhouyuan/storyapp/blob/5b735eb8225842d2ab1b2ff9639a1f635c79dae9/.github/workflows/pr-auto-review.yml#L56-L64
GitHub
pr-auto-review.yml

https://github.com/haizhouyuan/storyapp/blob/5b735eb8225842d2ab1b2ff9639a1f635c79dae9/.github/workflows/pr-auto-review.yml#L50-L58
GitHub
pr-auto-review.yml

https://github.com/haizhouyuan/storyapp/blob/5b735eb8225842d2ab1b2ff9639a1f635c79dae9/.github/workflows/pr-auto-review.yml#L66-L75
GitHub
pr-auto-review.yml

https://github.com/haizhouyuan/storyapp/blob/5b735eb8225842d2ab1b2ff9639a1f635c79dae9/.github/workflows/pr-auto-review.yml#L76-L84
GitHub
pr-auto-review.yml

https://github.com/haizhouyuan/storyapp/blob/5b735eb8225842d2ab1b2ff9639a1f635c79dae9/.github/workflows/pr-auto-review.yml#L34-L42
GitHub
pr-auto-review.yml

https://github.com/haizhouyuan/storyapp/blob/5b735eb8225842d2ab1b2ff9639a1f635c79dae9/.github/workflows/pr-auto-review.yml#L16-L24
GitHub
pr-auto-review.yml

https://github.com/haizhouyuan/storyapp/blob/5b735eb8225842d2ab1b2ff9639a1f635c79dae9/.github/workflows/pr-auto-review.yml#L22-L29
GitHub
pr-auto-review.yml

https://github.com/haizhouyuan/storyapp/blob/5b735eb8225842d2ab1b2ff9639a1f635c79dae9/.github/workflows/pr-auto-review.yml#L8-L16
GitHub
pr-auto-review.yml

https://github.com/haizhouyuan/storyapp/blob/5b735eb8225842d2ab1b2ff9639a1f635c79dae9/.github/workflows/pr-auto-review.yml#L107-L116
GitHub
pr-auto-review.yml

https://github.com/haizhouyuan/storyapp/blob/5b735eb8225842d2ab1b2ff9639a1f635c79dae9/.github/workflows/pr-auto-review.yml#L126-L134
GitHub
pr-auto-review.yml

https://github.com/haizhouyuan/storyapp/blob/5b735eb8225842d2ab1b2ff9639a1f635c79dae9/.github/workflows/pr-auto-review.yml#L160-L168
GitHub
README.md

https://github.com/haizhouyuan/storyapp/blob/5b735eb8225842d2ab1b2ff9639a1f635c79dae9/.github/README.md#L46-L55
GitHub
FINAL_VERIFICATION_REPORT.md

https://github.com/haizhouyuan/storyapp/blob/5b735eb8225842d2ab1b2ff9639a1f635c79dae9/FINAL_VERIFICATION_REPORT.md#L116-L124
GitHub
FINAL_VERIFICATION_REPORT.md

https://github.com/haizhouyuan/storyapp/blob/5b735eb8225842d2ab1b2ff9639a1f635c79dae9/FINAL_VERIFICATION_REPORT.md#L84-L93
GitHub
FINAL_VERIFICATION_REPORT.md

https://github.com/haizhouyuan/storyapp/blob/5b735eb8225842d2ab1b2ff9639a1f635c79dae9/FINAL_VERIFICATION_REPORT.md#L84-L92
GitHub
FINAL_VERIFICATION_REPORT.md

https://github.com/haizhouyuan/storyapp/blob/5b735eb8225842d2ab1b2ff9639a1f635c79dae9/FINAL_VERIFICATION_REPORT.md#L16-L24
GitHub
FINAL_VERIFICATION_REPORT.md

https://github.com/haizhouyuan/storyapp/blob/5b735eb8225842d2ab1b2ff9639a1f635c79dae9/FINAL_VERIFICATION_REPORT.md#L100-L109
GitHub
ci.yml

https://github.com/haizhouyuan/storyapp/blob/5b735eb8225842d2ab1b2ff9639a1f635c79dae9/.github/workflows/ci.yml#L36-L44
GitHub
ci.yml

https://github.com/haizhouyuan/storyapp/blob/5b735eb8225842d2ab1b2ff9639a1f635c79dae9/.github/workflows/ci.yml#L48-L56
GitHub
ci.yml

https://github.com/haizhouyuan/storyapp/blob/5b735eb8225842d2ab1b2ff9639a1f635c79dae9/.github/workflows/ci.yml#L61-L69
GitHub
ci.yml

https://github.com/haizhouyuan/storyapp/blob/5b735eb8225842d2ab1b2ff9639a1f635c79dae9/.github/workflows/ci.yml#L88-L97
GitHub
ci.yml

https://github.com/haizhouyuan/storyapp/blob/5b735eb8225842d2ab1b2ff9639a1f635c79dae9/.github/workflows/ci.yml#L100-L108
GitHub
ci.yml

https://github.com/haizhouyuan/storyapp/blob/5b735eb8225842d2ab1b2ff9639a1f635c79dae9/.github/workflows/ci.yml#L106-L114
GitHub
CLAUDE.md

https://github.com/haizhouyuan/storyapp/blob/5b735eb8225842d2ab1b2ff9639a1f635c79dae9/CLAUDE.md#L86-L94
GitHub
README.md

https://github.com/haizhouyuan/storyapp/blob/5b735eb8225842d2ab1b2ff9639a1f635c79dae9/.github/README.md#L112-L120
GitHub
README.md

https://github.com/haizhouyuan/storyapp/blob/5b735eb8225842d2ab1b2ff9639a1f635c79dae9/.github/README.md#L112-L115
GitHub
README.md

https://github.com/haizhouyuan/storyapp/blob/5b735eb8225842d2ab1b2ff9639a1f635c79dae9/.github/README.md#L84-L88
GitHub
FINAL_VERIFICATION_REPORT.md

https://github.com/haizhouyuan/storyapp/blob/5b735eb8225842d2ab1b2ff9639a1f635c79dae9/FINAL_VERIFICATION_REPORT.md#L94-L101
GitHub
ci.yml

https://github.com/haizhouyuan/storyapp/blob/5b735eb8225842d2ab1b2ff9639a1f635c79dae9/.github/workflows/ci.yml#L14-L17
GitHub
pr-auto-review.yml

https://github.com/haizhouyuan/storyapp/blob/5b735eb8225842d2ab1b2ff9639a1f635c79dae9/.github/workflows/pr-auto-review.yml#L76-L79
GitHub
pr-auto-review.yml

https://github.com/haizhouyuan/storyapp/blob/5b735eb8225842d2ab1b2ff9639a1f635c79dae9/.github/workflows/pr-auto-review.yml#L160-L169
GitHub
pr-auto-review.yml

https://github.com/haizhouyuan/storyapp/blob/5b735eb8225842d2ab1b2ff9639a1f635c79dae9/.github/workflows/pr-auto-review.yml#L112-L120
GitHub
CICD_SETUP.md

https://github.com/haizhouyuan/storyapp/blob/5b735eb8225842d2ab1b2ff9639a1f635c79dae9/CICD_SETUP.md#L59-L67
GitHub
CICD_SETUP.md

https://github.com/haizhouyuan/storyapp/blob/5b735eb8225842d2ab1b2ff9639a1f635c79dae9/CICD_SETUP.md#L94-L100
GitHub
CICD_SETUP.md

https://github.com/haizhouyuan/storyapp/blob/5b735eb8225842d2ab1b2ff9639a1f635c79dae9/CICD_SETUP.md#L20-L28
GitHub
ci.yml

https://github.com/haizhouyuan/storyapp/blob/5b735eb8225842d2ab1b2ff9639a1f635c79dae9/.github/workflows/ci.yml#L6-L14
GitHub
CICD_SETUP.md

https://github.com/haizhouyuan/storyapp/blob/5b735eb8225842d2ab1b2ff9639a1f635c79dae9/CICD_SETUP.md#L64-L67
GitHub
CICD_SETUP.md

https://github.com/haizhouyuan/storyapp/blob/5b735eb8225842d2ab1b2ff9639a1f635c79dae9/CICD_SETUP.md#L14-L18
GitHub
FINAL_VERIFICATION_REPORT.md

https://github.com/haizhouyuan/storyapp/blob/5b735eb8225842d2ab1b2ff9639a1f635c79dae9/FINAL_VERIFICATION_REPORT.md#L120-L124
GitHub
AGENTS.md

https://github.com/haizhouyuan/storyapp/blob/5b735eb8225842d2ab1b2ff9639a1f635c79dae9/AGENTS.md#L95-L99
GitHub
FINAL_VERIFICATION_REPORT.md

https://github.com/haizhouyuan/storyapp/blob/5b735eb8225842d2ab1b2ff9639a1f635c79dae9/FINAL_VERIFICATION_REPORT.md#L32-L40
All Sources

github