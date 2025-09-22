# Staging 部署工作流 Runbook

适用仓库：`haizhouyuan/storyapp`  
默认分支：`master`

目标：让 staging 环境在 CI 通过后自动部署，同时保留一个简单的网页按钮用于人工触发，无需再折腾 CLI/REST。

---

## 0. TL;DR
- CI（`CI/CD Pipeline`）在 `master`/`main` 上成功结束后，会自动触发 `Deploy to Staging` 工作流完成镜像构建与远程部署。
- 需要临时重发时，直接在 GitHub Actions 页面点击 `Run workflow`（同一个工作流提供 `workflow_dispatch` 输入）。
- 复用的部署脚本已经改为 Composite Action，部署逻辑只保留一份，日后维护更轻松。

---

## 1. 目录结构 & 关键文件

| 位置 | 作用 |
| --- | --- |
| `.github/workflows/staging-deploy.auto.yml` | 唯一的 staging 部署工作流，既监听 `workflow_run`（自动），也支持 `workflow_dispatch`（网页手动）。|
| `.github/actions/staging-deploy/action.yml` | Composite Action，聚合镜像构建 / 推送 / SSH 部署逻辑。|

> 旧的 `manual/repo-dispatch/_tmp` 等工作流已移除，避免重复维护或触发混乱。

---

## 2. 自动部署流程

1. `CI/CD Pipeline` 成功运行在 `push` 事件（目标分支为 `master/main`）上。
2. `staging-deploy.auto.yml` 收到 `workflow_run` 事件后：
   - 先检查 `STAGING_HOST`、`STAGING_SSH_KEY` 是否配置；缺失则输出 warning 并退出（`exit 78`，不视为失败）。
   - Checkout 对应的 `head_sha`，确保部署源码与 CI 测试版本一致。
   - 调用 Composite Action 构建镜像、可选推送到 GHCR，并通过 SSH 在 staging 主机上拉起容器。
3. 部署日志会显示在同一个 workflow run 中，便于追踪。

---

## 3. 手动触发（网页按钮）

1. 进入仓库 → Actions → `Deploy to Staging`。
2. 右上角点击 `Run workflow`，可按需填写分支或具体 SHA（默认 `master`）。
3. 工作流将执行与自动部署相同的步骤。

> 手动模式下若检测到 `STAGING_HOST` / `STAGING_SSH_KEY` 缺失，会直接报错并终止，提示运维补充环境变量。

---

## 4. 必需的 Secrets / Variables

| 名称 | 用途 |
| --- | --- |
| `STAGING_HOST` | 目标主机（`user@host` 或 `host`，结合 `STAGING_USER` 使用） |
| `STAGING_USER` | SSH 用户（可选，若 `STAGING_HOST` 已包含账号可省略） |
| `STAGING_SSH_KEY` | 私钥内容（建议 ED25519） |
| `GHCR_PAT` | 登录 GHCR（可选，未配置时跳过 `docker push`） |
| `STAGING_BASE_URL` / `STAGING_MONGO_URI` / `STAGING_DEEPSEEK_API_KEY` | 应用运行所需的环境配置（按需） |

> Secrets 建议统一维护在 `staging` Environment 中，工作流会自动读取。

---

## 5. 常见问题排查

| 症状 | 处理建议 |
| --- | --- |
| 工作流直接跳过（Skipped） | 检查 CI 是否在 `push` 到 `master/main` 上成功，或确认 conclusion 是否为 `success`。|
| 提示缺少 staging secrets | 到 GitHub → Settings → Environments → staging，补齐 `STAGING_HOST`、`STAGING_SSH_KEY` 等。|
| SSH 步骤失败 | 确认主机可达、密钥权限正确，日志会打印失败命令以便重试。|
| 需要回滚 | 重新在 `Run workflow` 输入框内指定想部署的旧 `SHA`，点击运行即可。|

---

## 6. 维护建议

- 发布前可用 `actionlint` 检查工作流语法：`docker run --rm -v "$PWD":/work -w /work rhysd/actionlint:latest`。
- Composite Action 中的部署逻辑如需改动，务必在 staging 上验证后再推广到 production。 
- 若后续希望新增生产部署，只需基于当前结构复制一个工作流（监听合适事件），并复用同一个 Composite Action。 

