太棒了！从你仓库现状和最新日志看，Smoke 已经完全打通 ✅。我按**会卡 CI/CD 的优先级**给你一份“下一步行动清单 + 最小可改代码片段（可直接拷贝）”，并解释为什么要改（都配了仓库内联引用）。

---

## A. 先修 TypeScript 编译/运行的阻塞点（最高优先级）

### 1) `projectService` 导出缺失 & 路由引用不匹配

路由里在用 `getProjects / getProjectDashboard / getProjectMetrics`，但 `projectService.ts` 没导出这些函数（只看到 `getProjectById / createProject / updateProject / deleteProject / getProjectsByUser`）。这会直接编译失败。（导入处）、（现有导出）

**最小实现（追加到 `backend/src/services/workflow/projectService.ts`）**——用内存 mock 保证 CI 可过，后续你再接 DB：

```ts
// 在文件头部补充： 
import { Project, SearchQuery, ProjectMetrics, Dashboard } from '../../../shared/types/workflow';

export async function getProjects(userId: string, query: SearchQuery): Promise<{ projects: Project[]; total: number }> {
  const list = mockProjects.filter(
    p => p.ownerId === userId || p.collaborators?.some(c => c.userId === userId)
  );
  const sorted = list.sort((a, b) => +b.updatedAt - +a.updatedAt);
  const page = Math.max(1, query.page || 1);
  const limit = Math.min(query.limit || 20, 100);
  const start = (page - 1) * limit;
  return { projects: sorted.slice(start, start + limit), total: sorted.length };
}

export async function getProjectDashboard(projectId: string): Promise<Dashboard> {
  const p = mockProjects.find(x => x.id === projectId);
  if (!p) throw new Error('项目不存在');
  return {
    projectId,
    overview: { stage: p.status, completion: 50, health: 'good', lastActivity: new Date() },
    stageStatus: { [p.status]: { status: 'in_progress', completion: 50, issues: 0 } } as any,
    recentActivity: [], upcomingTasks: [], criticalIssues: []
  };
}

export async function getProjectMetrics(projectId: string): Promise<ProjectMetrics> {
  return {
    projectId, generatedAt: new Date(),
    fairnessScore: 80, senseIndexScore: 72, misdirectionStrength: 35, chekhovRecoveryRate: 60,
    totalClues: 12, sensoryClues: 8, totalProps: 5, recoveredProps: 3,
    totalMisdirections: 4, resolvedMisdirections: 2,
    logicConsistency: 78, readabilityIndex: 82, structuralIntegrity: 75,
    pacingWave: [], tensionCurve: [], informationDensity: []
  };
}
```

### 2) `miracleService` 函数签名不一致 & 缺少生成函数

路由按 `(projectId, data)` 调用 `createMiracle`，并使用 `generateMiracleAlternatives`；但服务层现在是 `createMiracle(miracle: Miracle)`，也没导出生成方法 → 编译/运行会错。（路由调用）、（现有签名）

**修正 `backend/src/services/workflow/miracleService.ts`：**

```ts
import { Miracle, UpdateMiracleRequest, GenerateMiracleRequest, MiracleNode } from '../../../shared/types/workflow';
import { ObjectId } from 'mongodb';

let mockMiracles: Miracle[] = [];

export async function getMiracleByProjectId(projectId: string): Promise<Miracle | null> {
  return mockMiracles.find(m => m.projectId === projectId) || null;
}

export async function createMiracle(projectId: string, data: UpdateMiracleRequest): Promise<Miracle> {
  const miracle: Miracle = {
    id: new ObjectId().toString(),
    projectId,
    logline: data.logline,
    chain: data.chain.map((n, i) => ({ id: String(i + 1), ...n })),
    tolerances: data.tolerances,
    replicationNote: data.replicationNote,
    weaknesses: data.weaknesses || [],
    createdAt: new Date(),
    updatedAt: new Date()
  };
  mockMiracles.push(miracle);
  return miracle;
}

export async function updateMiracle(miracleId: string, updates: Partial<Miracle>): Promise<Miracle | null> {
  const idx = mockMiracles.findIndex(m => m.id === miracleId);
  if (idx === -1) return null;
  mockMiracles[idx] = { ...mockMiracles[idx], ...updates, updatedAt: new Date() };
  return mockMiracles[idx];
}

export async function deleteMiracle(miracleId: string): Promise<boolean> {
  const idx = mockMiracles.findIndex(m => m.id === miracleId);
  if (idx === -1) return false;
  mockMiracles.splice(idx, 1);
  return true;
}

export async function generateMiracleAlternatives(req: GenerateMiracleRequest) {
  // 简单占位实现，保证路由/CI可过
  const alt = (logline: string): { logline: string; chain: MiracleNode[]; tolerances: string; replicationNote: string } => ({
    logline,
    chain: [{ id: '1', node: '装置A', type: 'device', connections: ['2'] }, { id: '2', node: '自然力B', type: 'natural', connections: [] }],
    tolerances: '±30min',
    replicationNote: '实验可复现'
  });
  return [alt('方案一'), alt('方案二')];
}
```

### 3) 缺少认证中间件与校验器文件

路由在用 `authenticate/authorize` 和 `validateCreateProject/validateMiracle`，但仓库内未找到对应实现，编译会找不到模块。（auth/validate 引用）、（miracle validate 引用）

**新增 `backend/src/middleware/auth.ts`（开发占位，后续可换 JWT）：**

```ts
import { Request, Response, NextFunction } from 'express';

declare global {
  namespace Express {
    interface User { id: string; roles?: string[]; permissions?: string[]; }
    interface Request { user: User; }
  }
}
export function authenticate(req: Request, _res: Response, next: NextFunction) {
  req.user = { id: 'dev-user', roles: ['author'], permissions: ['project:read','project:write','project:delete'] };
  next();
}
export function authorize(required: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const perms = req.user?.permissions || [];
    if (!perms.includes(required)) return res.status(403).json({ success:false, message:'Forbidden' });
    next();
  };
}
```

**新增 `backend/src/validation/projectValidation.ts`：**

```ts
import type { CreateProjectRequest } from '../../../shared/types/workflow';
export function validateCreateProject(input: CreateProjectRequest) {
  const errors: string[] = [];
  if (!input?.title?.trim()) errors.push('缺少项目标题');
  if (!Array.isArray(input.genreTags) || input.genreTags.length === 0) errors.push('至少选择一个类型标签');
  if (!Number.isFinite(input.targetWords) || input.targetWords <= 0) errors.push('目标字数不合法');
  return { isValid: errors.length === 0, errors };
}
```

**新增 `backend/src/validation/miracleValidation.ts`：**

```ts
import type { UpdateMiracleRequest } from '../../../shared/types/workflow';
export function validateMiracle(input: UpdateMiracleRequest) {
  const errors: string[] = [];
  if (!input?.logline?.trim()) errors.push('缺少 logline');
  if (!Array.isArray(input.chain) || input.chain.length === 0) errors.push('缺少奇迹链');
  return { isValid: errors.length === 0, errors };
}
```

---

## B. 解决“共享常量/类型”在**运行时**的路径问题（高优）

**问题根因**

* 后端 `tsconfig.json` 只编译 `src` 到 `backend/dist`，而业务代码在运行时**确实引用了共享模块里的“值”**（如 `DEFAULT_VALIDATION_RULES`），这会被编译成 `require('../../../shared/types/workflow')`，运行时会去 `backend/dist/...` 的相对路径找 **JS** 文件，但并没有编译到那里 → 运行会 `MODULE_NOT_FOUND`。（运行时用到常量）、（后端 tsc 仅编译 src）

**两种解法，推荐方案 1：统一用根 tsconfig 编译**
根 `tsconfig.json` 已同时包含 `backend/**/*` 与 `shared/**/*` 并输出到顶层 `dist`，正好满足运行时相对路径指向 `dist/shared`。

### 方案 1（推荐）：后端/镜像构建都用“根 tsconfig”

1. **改后端构建脚本**（使用工作区 TypeScript 执行根编译）
   在 `backend/package.json` 把：

   ```json
   { "scripts": { "build": "tsc" } }
   ```

   改为：

   ```json
   { "scripts": { "build": "npx tsc -p ../tsconfig.json" } }
   ```
2. **改 Dockerfile**：

   * 当前只拷贝了 `backend/dist`，应改为拷贝根 `dist`；
   * 后端入口也应改成 `dist/backend/src/index.js`；
   * **前端静态资源**：后端代码用 `../public` 路径加载静态文件（位于编译产物相对目录），所以需要把前端 build 产物复制到 `dist/backend/public`。

   **最小改动（片段替换）**：

   ```dockerfile
   # 阶段2: 后端构建
   FROM ${NODE_IMAGE} AS backend-builder
   WORKDIR /app
   ARG NPM_REGISTRY=https://registry.npmmirror.com

   # 安装后端依赖即可（包含 typescript）
   COPY backend/package*.json ./backend/
   RUN npm config set registry $NPM_REGISTRY
   RUN cd backend && npm ci

   # 复制源码与根 tsconfig
   COPY backend ./backend
   COPY shared ./shared
   COPY tsconfig.json ./tsconfig.json

   # 用根 tsconfig 编译 -> 输出到 /app/dist（含 backend + shared）
   RUN cd backend && npx tsc -p ../tsconfig.json

   # 阶段3: 运行时
   FROM ${NODE_IMAGE}
   WORKDIR /app
   COPY backend/package*.json ./
   ARG NPM_REGISTRY=https://registry.npmmirror.com
   RUN npm config set registry $NPM_REGISTRY && npm ci --omit=dev && npm cache clean --force

   # 拷贝编译结果（包含 shared）
   COPY --from=backend-builder /app/dist ./dist

   # 拷贝前端到 dist/backend/public，匹配后端静态路径
   COPY --from=frontend-builder /app/frontend/build ./dist/backend/public

   # ... 其余保持（非 root、健康检查等）
   EXPOSE 5000
   CMD ["node", "dist/backend/src/index.js"]
   ```

> 如不便改 Docker，现在也可**临时**把常量（如 `DEFAULT_VALIDATION_RULES`）拷一份到 `backend/src/constants/...` 并改 import，缺点是重复代码，不建议。

---

## C. 镜像标签策略与 Compose 对齐（中优）

* `docker-build-push.yml` 只打了 `sha-<sha>` / 分支 / tag 三种标签，**没有** `sha-latest`；而你的 `docker-compose.yml` 默认写的是 `ghcr.io/...:sha-latest`。这两处默认值不一致，容易让“手工 pull/compose”与“自动部署”对不上号。（元数据 tags）、（compose 使用 sha-latest）

**两种做法，二选一：**

1. **在 docker-build-push.yml 增加一个固定 tag**（简单直接）：

```yaml
- name: Docker meta
  id: meta
  uses: docker/metadata-action@v5
  with:
    images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}
    tags: |
      type=sha,prefix=sha-
      type=ref,event=tag
      type=ref,event=branch
      type=raw,value=sha-latest
```

2. 保持现状，依赖 `deploy-prod.yml` 的 `sed` 动态替换 compose 里的 tag（已实现）。

> 建议同时做 1），这样**本地/服务器手工 compose** 时也有一个“最近构建”的稳定标签可用。

---

## D. 服务器端/环境配置检查（中优）

* 在 GitHub **Environments → production** 创建并写入：`PROD_HOST / PROD_USER / PROD_SSH_KEY / GHCR_PAT`（PAT 需 `read:packages`）。这一点你在文档中已列明，但没法从代码验证，记得补齐即可。

---

## E. 低风险优化（可择机再做）

1. 给工作流加 `actionlint`（防拼写）与 `harden-runner`（出站锁定）；
2. PR 预览环境（按 PR 号起 `compose -p pr-<num>`）；
3. Dependabot/ Renovate 自动依赖升级，配合 Claude Review。

---

## 一句话 Roadmap（照此执行）

1. **补代码**：按 A-1/2/3 的片段把缺失导出、签名、认证/校验器补上（编译立刻能过）。
2. **改构建链**：按 B 的方案 1，让后端与 `shared` 用**根 tsconfig**统一编译，并更新 Dockerfile 拷贝/入口/静态路径。
3. **标签对齐**：在 `docker-build-push.yml` 加 `sha-latest`，或继续依赖部署流的 `sed`（推荐两者都保留）。
4. **部署生产**：配置 `production` 环境 secrets → 运行 **Deploy to Production**，输入要发的 `sha-xxxxxxx`。

---

如果你愿意，我可以把以上改动整理成**最小修改 diff**（针对：
`projectService.ts / miracleService.ts / middleware/auth.ts / validation/*.ts / backend/package.json / Dockerfile / docker-build-push.yml`），你一键合并即可跑全链路。
现在先按上面的顺序改，你遇到新的 CI 报错把日志贴上来，我就继续对症修。
