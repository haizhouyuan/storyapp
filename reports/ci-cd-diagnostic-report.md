# CI/CD 流水线现状诊断报告

## 背景
- 调查范围：`.github/workflows/ci.yml`、`deploy-prod.yml`、`deploy-staging.yml`、`docker-compose*.yml`、`scripts/ci/seed-test-data.js` 以及相关 Docker/部署脚本。
- 代码基线：工作分支 `fix-pr37-conflicts`，最新提交 `6707b1b`，未合并入 `origin/master`。

## 关键发现

### 阻塞级问题（原状）
- `.github/workflows/deploy-prod.yml:63` 使用 `ssh << 'EOF'`，导致在远程主机内无法访问 GitHub Actions 注入的所有机密变量（`GITHUB_TOKEN`、`DEEPSEEK_API_KEY`、`MONGO_USER`/`MONGO_PASS`、`IMAGE_TAG` 等），产生的 `.env` 与登录流程全部失效，部署必然失败。（✅ 已在本次改动中改为先生成 `deploy.env` 并使用未加引号的 `<<EOF`，保障机密正常注入）
- `.github/workflows/deploy-prod.yml:95` 仅执行 `docker compose up -d`，但 `docker-compose.yml:41` 说明镜像在 override 文件中声明；缺少 `-f docker-compose.ghcr.yml` 或显式 `image`，`app` 服务无有效镜像或 build 指令，导致部署无法启动。（✅ 本次改动已统一使用 `docker-compose.yml` + `docker-compose.ghcr.yml`）

### 主要问题
- `.github/workflows/deploy-staging.yml:72` 在 Actions runner 本地构建并启动临时 `docker compose`，没有使用 `STAGING_HOST` 等机密，也没有真正对外暴露服务；PR 评论返回的 `https://staging-*.storyapp.dandanbaba.xyz` 仅为占位链接。
- `.github/workflows/deploy-staging.yml:228` 调用 `repos.createDeploymentStatus` 时硬编码 `deployment_id: 0`，`workflow_run` 事件不包含部署对象，请求会返回 404 进而破坏作业结尾步骤。
- `.github/workflows/deploy-staging.yml:172` PR 评论宣称可访问的 staging 环境，但实际上服务仅在 runner 的 `localhost` 上存在，会误导评审流程。

### 次要问题
- `.github/workflows/ci.yml:94` 写入 `.env.ci` 后未在后续 compose 或脚本中加载，文件处于闲置状态。（✅ 已改为写入 `.env`，利用 docker compose 默认加载机制）
- `.github/workflows/ci.yml:198` 汇总作业下载 artifact 时未处理缺失场景，一旦前序作业在上传工件前失败，这里会再次失败导致缺乏最终摘要。

## 当前分支与远程 master 同步状态
- `git rev-list --left-right --count origin/master...HEAD` 输出 `0\t3`，表明当前分支领先 master 3 个提交。
- 未合并的提交：
  1. `6707b1b` – `resolve(pr37): fix admin.ts merge conflicts with consistent multi-select filtering`
  2. `41f292f` – `fix(admin): export endpoint supports multi eventType like list endpoint`
  3. `2662c2b` – `feat(backend): Appsmith logs filters (multi eventType, includeStackTrace) + tests`
- `git status -sb` 显示工作树存在大量未提交改动，同样尚未与远程 master 对齐。

## 建议动作
1. ✅ **修复生产部署脚本（已完成）**：通过本次提交落地 `deploy.env` + `docker compose -f docker-compose.yml -f docker-compose.ghcr.yml` + GHCR 登录容错。
2. **重构 staging 流程（未处理）**：明确目标（真实预发或仅本地冒烟）。若要提供可访问环境，应通过 SSH 部署到实际主机；若仅做冒烟测试，应移除虚假链接与 GitHub Deployments API 调用。
3. ✅ **整理 CI 小问题（已完成）**：CI 环境文件改为 `.env` 并在 artifact 下载步骤启用 `if-no-files-found: ignore`。
4. **合并计划**：修复流水线后整理当前分支与未提交改动，通过 PR 同步至 master，避免后续再次偏离主干。

## 附注
- 本报告生成时间：`2025-09-18 02:28:04 UTC`
- 生成者：Codex（GPT-5）
