# Staging 部署工作流 Runbook

适用仓库：`haizhouyuan/storyapp`  
默认分支：`master`

目标：保证 staging 部署可以稳定被触发（网页 / CLI / REST），并在 GitHub Actions 中保持可观测和可回滚。

---

## 0. TL;DR

- **优先操作**：使用 `workflow_dispatch` 或 `repository_dispatch` 调用 Composite Action 执行部署。
- **已知问题**：当手动/兜底壳工作流通过 `uses: …reusable.yml` 调用 reusable workflow 时，GitHub 会出现 0 秒失败、无 job 的异常（平台端调度缺陷）。
- **短期建议**：立刻将部署逻辑封装为 Composite Action，并让壳工作流使用 steps 调用；随后准备最小复现材料提交 GitHub Support。

---

## 1. 当前架构与文件

### 1.1 三段式结构（建议）

- `.github/workflows/staging-deploy.reusable.yml`  → 使用 `workflow_call` 封装部署逻辑（镜像构建、推送、SSH 部署等）。
- `.github/workflows/staging-deploy.manual.yml`   → 手动触发壳，理想情况下用 `workflow_dispatch` 调用上述 reusable。
- `.github/workflows/staging-deploy.auto.yml`     → 监听 CI 成功后，自动调用 reusable。
- `.github/workflows/staging-deploy.repo-dispatch.yml` → 接受 `repository_dispatch` 事件，提供 CLI/REST 兜底。

> 目前：只要壳工作流使用 `uses: …reusable.yml` 调用阶段，`workflow_dispatch` / `repository_dispatch` 会立即 0 秒失败（无 job）。建议改用 Composite Action（见 §3）。

### 1.2 密钥与变量约定

| 类型             | 用途                              |
| ---------------- | --------------------------------- |
| `GHCR_PAT`       | GHCR 登录/推送镜像（可选）        |
| `STAGING_HOST`   | 远程主机 (`user@host` 或 host)    |
| `STAGING_USER`   | SSH 用户（若主机中未包含用户）    |
| `STAGING_SSH_KEY`| SSH 私钥内容                      |
| `STAGING_BASE_URL` | 健康检查/前端部署可选 URL       |
| `STAGING_MONGO_URI / STAGING_DEEPSEEK_API_KEY` | 应用运行所需环境变量 |

> 可在仓库或 environment secrets 中配置，具体部署脚本会读取这些值。

---

## 2. 触发方式

### 2.1 网页端（推荐给非命令行使用者）

GitHub → Actions → `Deploy to Staging (manual)` → Run workflow → 选择 branch/sha。

### 2.2 CLI：`workflow_dispatch`

```bash
# 触发手动壳
gh workflow run ".github/workflows/staging-deploy.manual.yml" --ref master -f branch=master

# 查看运行状态或日志
gh run watch
```

### 2.3 CLI 兜底：`repository_dispatch`

```bash
# 触发 staging 部署（以 master 分支为例）
gh api repos/haizhouyuan/storyapp/dispatches \
  -X POST \
  -H "Accept: application/vnd.github+json" \
  -f event_type=staging-deploy \
  -f client_payload[branch]=master

# 指定某个提交
gh api repos/haizhouyuan/storyapp/dispatches \
  -X POST \
  -H "Accept: application/vnd.github+json" \
  -f event_type=staging-deploy \
  -f client_payload[branch]=master \
  -f client_payload[sha]=<commit-sha>

gh run watch
```

> 当壳工作流采用 `uses: …reusable.yml` 时，这两种方式仍可能遭遇 0 秒失败。建议参考 §3 改用 Composite Action。

---

## 3. 立即可用替代方案：Composite Action

将部署逻辑改为 Composite Action，由壳工作流（手动/自动/兜底）以 steps 调用，避免 `workflow_call` 的调度异常。

### 3.1 新建 `.github/actions/staging-deploy/action.yml`

```yaml
name: staging-deploy
runs:
  using: composite
  steps:
    # 1. 解析参数
    - id: meta
      shell: bash
      env:
        IN_BRANCH: ${{ inputs.branch }}
        IN_SHA:    ${{ inputs.sha }}
        IN_IMAGE:  ${{ inputs.image }}
      run: |
        set -euo pipefail
        TAG="${IN_SHA:-$IN_BRANCH}"
        IMAGE="${IN_IMAGE:-ghcr.io/${{ github.repository }}/storyapp}"
        echo "tag=$TAG"     >> "$GITHUB_OUTPUT"
        echo "image=$IMAGE" >> "$GITHUB_OUTPUT"

    # 2. 可选：登录 GHCR
    - shell: bash
      env:
        GHCR_PAT: ${{ env.GHCR_PAT }}
      run: |
        if [[ -n "${GHCR_PAT:-}" ]]; then
          echo "$GHCR_PAT" | docker login ghcr.io -u "${{ github.actor }}" --password-stdin
        else
          echo "Skip GHCR login"
        fi

    # 3. 构建镜像
    - shell: bash
      env:
        IMAGE: ${{ steps.meta.outputs.image }}
        TAG:   ${{ steps.meta.outputs.tag }}
      run: |
        DOCKER_BUILDKIT=1 docker build -t "${IMAGE}:${TAG}" .

    # 4. 推送镜像（可选）
    - shell: bash
      env:
        IMAGE:    ${{ steps.meta.outputs.image }}
        TAG:      ${{ steps.meta.outputs.tag }}
        GHCR_PAT: ${{ env.GHCR_PAT }}
      run: |
        if [[ -n "${GHCR_PAT:-}" ]]; then
          docker push "${IMAGE}:${TAG}"
        else
          echo "Skip push"
        fi

    # 5. SSH 部署（可选）
    - shell: bash
      env:
        STAGING_HOST:    ${{ env.STAGING_HOST }}
        STAGING_USER:    ${{ env.STAGING_USER }}
        STAGING_SSH_KEY: ${{ env.STAGING_SSH_KEY }}
        IMAGE:           ${{ steps.meta.outputs.image }}
        TAG:             ${{ steps.meta.outputs.tag }}
        GHCR_PAT:        ${{ env.GHCR_PAT }}
        ACTOR:           ${{ github.actor }}
      run: |
        if [[ -z "${STAGING_SSH_KEY:-}" || -z "${STAGING_HOST:-}" ]]; then
          echo "Skip SSH deploy"
          exit 0
        fi
        mkdir -p ~/.ssh && chmod 700 ~/.ssh
        echo "$STAGING_SSH_KEY" > ~/.ssh/id_ed25519 && chmod 600 ~/.ssh/id_ed25519
        TARGET="${STAGING_USER:+$STAGING_USER@}$STAGING_HOST"
        ssh -o StrictHostKeyChecking=no "$TARGET" 'command -v docker >/dev/null'
        if [[ -n "${GHCR_PAT:-}" ]]; then
          ssh -o StrictHostKeyChecking=no "$TARGET" \
            "echo '${GHCR_PAT}' | docker login ghcr.io -u '${ACTOR}' --password-stdin"
        fi
        ssh -o StrictHostKeyChecking=no "$TARGET" bash -s <<'RMT'
          set -euo pipefail
          IMAGE="${IMAGE}:${TAG}"
          docker pull "$IMAGE" || true
          docker stop storyapp || true
          docker rm   storyapp || true
          docker run -d --name storyapp -p 8080:8080 "$IMAGE"
          docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}' | sed -n '1,2p'
RMT
```

> Secrets 由壳工作流以 `env:` 注入，如 `GHCR_PAT`、`STAGING_HOST`、`STAGING_SSH_KEY` 等。

### 3.2 手动壳示例

```yaml
name: Deploy to Staging (manual)

on:
  workflow_dispatch:
    inputs:
      branch:
        default: master
      sha:
        required: false

jobs:
  deploy:
    runs-on: ubuntu-latest
    concurrency:
      group: staging-${{ inputs.sha != '' && inputs.sha || inputs.branch }}
      cancel-in-progress: false
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ inputs.sha != '' && inputs.sha || inputs.branch }}

      - uses: ./.github/actions/staging-deploy
        with:
          branch: ${{ inputs.branch }}
          sha:    ${{ inputs.sha }}
        env:
          GHCR_PAT:            ${{ secrets.GHCR_PAT }}
          STAGING_HOST:        ${{ secrets.STAGING_HOST }}
          STAGING_USER:        ${{ secrets.STAGING_USER }}
          STAGING_SSH_KEY:     ${{ secrets.STAGING_SSH_KEY }}
          STAGING_BASE_URL:    ${{ secrets.STAGING_BASE_URL }}
          STAGING_MONGO_URI:   ${{ secrets.STAGING_MONGO_URI }}
          STAGING_DEEPSEEK_API_KEY: ${{ secrets.STAGING_DEEPSEEK_API_KEY }}
```

### 3.3 自动壳与兜底壳

同样使用 steps 调用 Composite Action，传入 branch/sha。

> 采纳 Composite Action 后，所有触发方式都会进入 job/step 日志，便于定位失败、也能更好地在 Support 面前说明行为。

---

## 4. 已知问题（目前结构下）

- `_tmp_dispatch_check.yml`（纯 steps）与 `z-staging-manual.yml`（仅 echo）可被 `workflow_dispatch` 正常触发。
- 一旦壳工作流 job 使用 `uses: …reusable.yml`（无论本地路径或 repo@ref），即出现 0 秒失败、无 job/日志。`repository_dispatch` 也受同样影响。
- 该现象起因是 GitHub 后端对 reusable workflow 的调度失败，目前未有官方声明；故建议改用 Composite Action 或向 Support 提交问题。

Run 对照：
- 成功：17890917064（纯 steps）
- 失败：17890924619、17890713726、17890847489、17892970371（含 uses）

---

## 5. Support 工单模板

**标题**：`workflow_dispatch`/`repository_dispatch` 调用 reusable workflow 时 0 秒失败（无 job/日志），纯 steps 正常

**复现步骤**：
1. `.github/workflows/z-staging-manual.yml`（仅 echo/纯 steps）→ `gh workflow run` 成功。
2. 同文件仅将 job 照搬为 `uses: haizhouyuan/storyapp/.github/workflows/staging-deploy.reusable.yml@master` → 0 秒失败（无 job/日志）。
3. `_tmp_dispatch_check.yml` 可触发，说明仓库权限/分支/令牌正常。

**请求**：确认是否存在 reusable workflow 调度缺陷，或指出 YAML/解析规则导致事件被忽略。

附带资料：
- 成功 run ID：17890917064；失败 run ID：17890924619 等。
- `gh workflow view <manual_id> --yaml` 前 200 行。
- `gh api repos/.../actions/workflows/<id>` JSON（含 `state/path/updated_at`）。
- `actionlint` 输出。

---

## 6. 质量与安全建议

- 在 CI 中引入 `actionlint`，及时发现 YAML/表达式错误。
- 使用最小权限：若仅拉取镜像，可去掉 `packages: write`。
- 并发组：`concurrency.group: staging-${branch/sha}` 避免多次部署互相干扰。
- 回滚策略：保留上一版本镜像 tag；失败时快速切回。

---

## 7. 里程碑与后续

| 时间 | 调整 | 结果 |
| ---- | ---- | ---- |
| 2025-09-21 | 三段式结构 + reusable | 触发仍 0 秒失败 |
| 2025-09-21 | 改用 Composite Action（推荐） | 可稳定 CLI/UI 触发 |
| 2025-09-21 | repository_dispatch 兜底 | CLI/REST 触发无 workflow_dispatch 依赖 |
| TBD | Support 工单 | 等待官方确认/修复 |

若需进一步拆分/回退旧结构，请保留 `z-staging-manual.yml` 作为对照用例。

