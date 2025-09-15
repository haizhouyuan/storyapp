# CD 流水线开发计划（feat/cd-pipeline）

## 目标

- 基于现有 Docker 多阶段构建 + Compose 基座/override，落地一条从主干构建镜像 → 预览验证 → 生产发版（可回滚）的企业级 CD 流水线。
- 与仓库现有能力严格对齐：健康检查 `/healthz` 与 `/api/health`、Jest 单测、Playwright E2E、Dockerfile 与 docker-compose.ci.yml、生产端口 `5001→5000` 映射。

## 范围（Scope）

- 新增：`docker-compose.prod.yml` 最小覆盖（绑定镜像 tag、端口），不改动基座公共配置。
- 新增：`.github/workflows/docker-build-push.yml`（构建、Trivy 扫描、推送 GHCR）。
- 新增：`.github/workflows/deploy-prod.yml`（workflow_dispatch，受 Environment "production" 保护，SSH 到 47.120.74.212 拉取并滚动升级，失败自动回滚）。
- 沿用：`.github/workflows/ci.yml`（质量门）与 `deploy-staging.yml`（预览验证），不做破坏性调整。
- 文档：在 `docs/` 下补充 CI/CD 指南与回滚手册，更新 `DEPLOYMENT_DOCKER.md` 链接。

不在本次范围：应用功能改造、数据库结构变更、大规模脚本重构。

## 产出（Deliverables）

1. 生产可用的 GHCR 镜像：`ghcr.io/haizhouyuan/storyapp:<TAG>`（`sha-xxxx`、`branch-xxx`、`<semver>`）。
2. 工作流：
   - `docker-build-push.yml`：push 主干/打 tag → 构建、扫描、推送、多 tag。
   - `deploy-prod.yml`：手动触发，参数 `image_tag`；审批后 SSH 部署；失败回滚。
3. `docker-compose.prod.yml`：覆盖 `app.image` 与 `ports`，复用基座健康检查与依赖。
4. 文档：`docs/CI_CD_PIPELINE.md`（新增）与 `DEPLOYMENT_DOCKER.md` 更新。

## 步骤（Tasks）

1) 基线与分支
- [x] 从 `origin/master` 新建分支 `feat/cd-pipeline`（已完成，worktree: `worktrees/cd-pipeline`）。

2) 生产 Compose 覆盖
- [ ] 新增 `docker-compose.prod.yml`：
  - `app.image=ghcr.io/haizhouyuan/storyapp:${APP_TAG}`
  - `ports: ["5001:5000"]`
  - 其余保持基座默认（健康检查 `/healthz` 等）。

3) 镜像构建与推送
- [ ] 新增 `.github/workflows/docker-build-push.yml`：
  - 触发：push 到 master/main、tags。
  - 步骤：`checkout` → `setup-node` → `docker build` → Trivy 扫描（高危失败）→ 多 tag（`sha`、`branch`、`latest`/`sha-latest` 可选）→ 推送 GHCR。

4) 生产部署
- [ ] 新增 `.github/workflows/deploy-prod.yml`：
  - 触发：`workflow_dispatch` 输入 `image_tag`（默认 `sha-latest`）。
  - 环境：`production`（需要审批与 secrets）。
  - 步骤：
    1. 使用 `appleboy/ssh-action` 登录 `root@47.120.74.212`；
    2. `docker login ghcr.io`（使用 `GHCR_PAT` 与 `GH_USER`）；
    3. `APP_TAG=<tag> docker compose -f docker-compose.yml -f docker-compose.prod.yml pull app`；
    4. `docker compose -f docker-compose.yml up -d mongo`；
    5. `APP_TAG=<tag> docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d app`；
    6. 健康检查循环 `curl -f http://localhost:5001/healthz`；
    7. 写入 `.deploy/last_tag` 记录当前 tag；
    8. （可选）执行生产 Playwright 冒烟 `npx playwright test -c playwright.prod.config.ts`；失败则回滚。

5) 文档与可观测性
- [ ] 新增 `docs/CI_CD_PIPELINE.md`，梳理触发、闸门、Secrets、回滚、常见故障。
- [ ] 更新 `DEPLOYMENT_DOCKER.md`：加入使用 `docker-compose.prod.yml` 的建议命令与健康检查。

6) 验证（Acceptance）
- [ ] CI 通过：`.github/workflows/ci.yml` 单测+E2E 全绿。
- [ ] GHCR 镜像存在：`ghcr.io/haizhouyuan/storyapp:sha-<short>` 可拉取。
- [ ] 生产部署成功：`/healthz` 与 `/api/health` 返回 `200` 且 `status=healthy`。
- [ ] 生产冒烟通过：`playwright.prod.config.ts` 关键路径全绿。

## Secrets 与 Environments

- Repository/Org Secrets：
  - `GHCR_PAT`：GitHub Personal Access Token（packages:read, write）。
  - （可选）`TRIVY_TOKEN` 用于私有镜像扫描。
- Environment `production`：
  - `PROD_HOST=47.120.74.212`
  - `PROD_USER=root`
  - `PROD_SSH_KEY`（SSH 私钥）
  - `GH_USER`（用于 `docker login ghcr.io`）

服务器（不入库）：`/root/projects/storyapp/.env` 持有：`DEEPSEEK_API_KEY`、`MONGODB_URI` 等。

## 回滚策略

1. 失败自动回滚：部署脚本若健康检查或冒烟失败，则读取 `.deploy/last_tag` 切换回旧镜像：
   ```bash
   PREV=$(cat .deploy/last_tag)
   APP_TAG=$PREV docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d app
   ```
2. 手动回滚：在 Actions 手动执行 `deploy-prod.yml`，传入 `image_tag=<previous_tag>`。

## 风险与缓解

- 构建时间增加 → 使用 Node 20-alpine、多阶段 cache、npm ci；Trivy 可配置忽略低级别漏洞。
- 生产健康检查误判 → 双端点 `/healthz` 与 `/api/health`，容器级 HEALTHCHECK 与工作流级轮询。
- 网络抖动导致 Playwright 误报 → 生产冒烟默认重试 2 次，仅阻断关键失败。

## 时间预估

- Day 1：新增 `docker-compose.prod.yml`、`docker-build-push.yml`；本地验证镜像可用；Trivy 配置。
- Day 2：`deploy-prod.yml` SSH 部署、健康检查、记录 tag、回滚；文档完善、联调一次完整链路。

## 验收清单（Checklist）

- [ ] master push 后自动产出 GHCR 镜像，Trivy 通过。
- [ ] 手动触发生产部署按指定 tag 发布成功。
- [ ] 失败可自动回滚且记录清晰。
- [ ] 文档清晰：开发/运维可独立完成一次发布与回滚演练。

