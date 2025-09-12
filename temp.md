太好了！从你贴的日志看——

* **Smoke 已经完全打通**：`apiKeySource: ANTHROPIC_API_KEY` 且模型返回 `Smoke OK` ✅
* 末尾只有一个**非致命告警**：`fatal: No url found for submodule path 'playwright-mcp' in .gitmodules`（Checkout 的 post-run 清理时触发，稍后给修法）

下面给你一个**按优先级落地的 CI/CD 方案**，直接抄用即可；我也把关键 YAML 都给好，合并后就能跑。

---

## 0) 立即收尾的两件小事

1. **清理 submodule 警告**（仓库根目录执行）

```bash
# 若 repo 中误有目录但不是子模块，先移除缓存登记
git rm --cached -r playwright-mcp || true
# 清理可能残留的 submodule 元数据
rm -rf .git/modules/playwright-mcp
# 如果存在 .gitmodules 里关于它的配置条目，删掉该 section
git config -f .gitmodules --remove-section submodule.playwright-mcp || true
git add -A
git commit -m "chore: remove leftover submodule config for playwright-mcp"
```

> 这个告警不影响流水线成功，但每次 run 都看到会心烦，建议清掉。

2. **Secrets 命名统一**
   仓库的 Actions Secrets **只保留**：`ANTHROPIC_API_KEY`（必填）和 `ANTHROPIC_BASE_URL`（仅走网关时）。所有工作流统一用这两个名字（你刚才已改对）。

---

## 1) PR 质量门（Lint/Typecheck/Test/Build + Claude Review）

目标：**所有 PR 必须过质量门**才可合并；Claude 做安全/质量审查，Jest/Vitest 做单测，TS 做类型检查。

> 假设你的 Node 版本 20；如用 pnpm 就把 `npm ci` 改成 `pnpm i --frozen-lockfile`。

**`.github/workflows/ci.yml`**

```yaml
name: CI (Lint · Typecheck · Test · Build)
on:
  pull_request:
    types: [opened, synchronize, reopened]

permissions:
  contents: read
  pull-requests: write
  id-token: write

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  ci:
    runs-on: ubuntu-latest
    env:
      # 仅当单测/构建需要访问第三方时再加
      NODE_ENV: test
    steps:
      - uses: actions/checkout@v4

      - name: Use Node 20 with caching
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - name: Install deps
        run: npm ci --prefer-offline --no-audit --no-fund

      - name: Lint
        run: npm run lint --if-present

      - name: Typecheck
        run: npm run typecheck --if-present || npx tsc -p . --noEmit

      - name: Unit Test
        run: npm test --if-present -- --ci --reporters=default --reporters=jest-junit
        env:
          JEST_JUNIT_OUTPUT: junit.xml

      - name: Build (ensure compilable)
        run: npm run build --if-present

      - name: Upload test reports (optional)
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: test-reports
          path: |
            junit.xml
            coverage/**
  claude_review:
    needs: ci
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
      id-token: write
    env:
      ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
      ANTHROPIC_BASE_URL: ${{ secrets.ANTHROPIC_BASE_URL }}
    steps:
      - uses: actions/checkout@v4
      - name: Claude Code Review
        uses: anthropics/claude-code-action@v1
        env: # 再加一层 step 级 env 保险
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          ANTHROPIC_BASE_URL: ${{ secrets.ANTHROPIC_BASE_URL }}
        with:
          task: review
          review_scope: diff
          post_inline_comments: true
          fail_on_high_risk: true
          allow_paths: "src/**,frontend/**,backend/**,apps/**,packages/**"
          ignore_paths: "dist/**,**/*.md,**/pnpm-lock.yaml"
```

> 你已把 Smoke 打通，这个 review job 基本即插即用。

---

## 2) 构建并推送镜像（GHCR）+ 漏洞扫描

目标：**主干分支/打 tag** 时自动构建镜像推到 GHCR，并用 Trivy 做镜像漏洞扫描（高危直接 fail）。

先准备两个 Dockerfile（如已存在可跳过）：

**`Dockerfile`（Node 服务）**

```dockerfile
# --- build stage ---
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev=false
COPY . .
RUN npm run build --if-present

# --- runtime stage ---
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app ./
RUN npm ci --omit=dev
EXPOSE 3000
CMD ["npm","start"]
```

> 如果你的前端是独立 React/Vite 项目，建议单独维护 `frontend/Dockerfile`，build 后用 nginx 托管静态文件；这里先给通用后端示例。

**`.github/workflows/docker-build-push.yml`**

```yaml
name: Build & Push Docker (GHCR) + Scan
on:
  push:
    branches: [master, main]
    tags: ["v*.*.*"]

permissions:
  contents: read
  packages: write  # 推送 GHCR 需要
  id-token: write

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }} # ghcr.io/<owner>/<repo>

jobs:
  build-push:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up QEMU (optional for multi-arch)
        uses: docker/setup-qemu-action@v3

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Login to GHCR
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Docker meta
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}
          tags: |
            type=sha,prefix=sha-
            type=ref,event=tag
            type=ref,event=branch

      - name: Build & Push
        uses: docker/build-push-action@v5
        with:
          context: .
          file: ./Dockerfile
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

  scan:
    needs: build-push
    runs-on: ubuntu-latest
    steps:
      - name: Trivy scan image
        uses: aquasecurity/trivy-action@0.24.0
        with:
          image-ref: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:sha-${{ github.sha }}
          format: table
          exit-code: 1
          vuln-type: "os,library"
          severity: "CRITICAL,HIGH"
```

---

## 3) 一键部署到生产（Aliyun ECS / Docker Compose）

目标：在 GitHub 上手动触发或合并主干后，**SSH 登入你的 ECS** 拉取最新 GHCR 镜像并 `docker compose up -d`。

需要准备 **Environment: production**，并在其中配置 secrets：

* `PROD_HOST`（例如 `47.120.74.212`）
* `PROD_USER`（例如 `root`）
* `PROD_SSH_KEY`（私钥字符串，注意去掉密码或使用 `appleboy/ssh-action` 的 `key` 字段）
* `GHCR_PAT`（**个人 PAT**，最小权限 `read:packages`，用来在你的服务器上 `docker login ghcr.io`；服务器上不能用 GitHub Actions 的 `GITHUB_TOKEN`）

**服务器侧**：确保 `docker`、`docker compose` 已安装，`docker-compose.yml` 正确引用 GHCR 镜像标签（例如 `image: ghcr.io/haizhouyuan/storyapp:sha-<sha>`）。

**`.github/workflows/deploy-prod.yml`**

```yaml
name: Deploy to Production (ECS)
on:
  workflow_dispatch:
    inputs:
      tag:
        description: "Image tag to deploy (e.g., sha-xxxxxxxx)"
        required: true
        default: sha-${{ github.sha }}

permissions:
  contents: read
  id-token: write

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production   # 走环境审批 & 拿环境 secrets
    steps:
      - uses: actions/checkout@v4

      - name: SSH into ECS & deploy
        uses: appleboy/ssh-action@v1.2.0
        with:
          host: ${{ secrets.PROD_HOST }}
          username: ${{ secrets.PROD_USER }}
          key: ${{ secrets.PROD_SSH_KEY }}
          script: |
            set -e
            echo "== Login GHCR =="
            echo ${{ secrets.GHCR_PAT }} | docker login ghcr.io -u ${{ github.actor }} --password-stdin

            cd /root/projects/storyapp  # 按你的服务器目录修改
            sed -i 's|\(image:\s*ghcr\.io/.*/storyapp:\).*|\1${{ github.event.inputs.tag }}|' docker-compose.yml

            docker compose pull
            docker compose up -d --remove-orphans
            docker image prune -f

            echo "Deployed tag: ${{ github.event.inputs.tag }}"
```

> 如果你用多服务（web/api/mongo），在 `docker-compose.yml` 里给 `app` 服务统一换 tag；也可以把 tag 作为 compose 的 `.env` 变量传入。

---

## 4) 可选增强

* **预览环境**：每个 PR 自动部署一套 `docker compose -p pr-<num>` 的临时环境（带随机端口或子域），合并后自动销毁。
* **E2E 测试（Playwright）**：Smoke 成功已连接 Playwright MCP；可以在 CI 增加最小 E2E：启动服务 → 跑 `npx playwright test` → 生成报告。
* **配置守护**：把 `.github/workflows` 加 `actionlint`（你之前用过），防止 YAML 拼写问题；
* **依赖更新机器人**：Renovate（推荐）或 Dependabot；配合 Claude 自动审查更新 PR。
* **自动发布**：打 tag 后用 `ncipollo/release-action` 生成 release notes，并附上构建产物（如前端静态包）。
* **分支保护**：开启 “Require status checks to pass before merging”，把 `CI` 与 `Claude Review` 两个 job 勾上。

---

## 5) 你的现状小结 & 行动清单

* ✅ **Smoke**：已通；Claude API Key 读取正常
* ⚠️ **子模块告警**：按“0) 小事”一键清理
* 🧱 **下一步**：

  1. 合并 `ci.yml`（PR 质量门）；
  2. 合并 `docker-build-push.yml`（构建/推送/扫描）；
  3. 在 **Environments** 新建 `production`，配置 `PROD_HOST/PROD_USER/PROD_SSH_KEY/GHCR_PAT`；
  4. 合并 `deploy-prod.yml`，手动触发一次部署；
  5. 若需要，补 E2E、预览环境与自动发布。

如果你愿意，把你当前的 `docker-compose.yml` 和项目目录结构（`frontend/`、`backend/` 是否分离）贴一下，我再把 **Dockerfile/Compose 与 Build\&Deploy 工作流**完全对齐到你的目录与启动脚本，做到**零改动可部署**。
