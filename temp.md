太棒了！恭喜你把整套 CI/CD 跑通并做了集成测试 ✅
下面我基于你当前的技术栈与上线流程，给出一份**工程级“下一步改进清单”**（含可直接落地的代码/配置片段）。优先级从高到低排列，尽量做到“改动最小、收益最大”。

---

# A. “shared 类型/常量”工程化（高优先）

> 你之前用“复制一份本地类型定义”解决了路径问题，短期能过编译，但后期会**产生漂移**。建议把 `shared` 抽成一个 workspace 包，彻底解决“编译产物可寻址 + 类型单一真源”。

**1) 顶层 `package.json` 启用 workspaces**

```json
{
  "private": true,
  "workspaces": ["backend", "frontend", "shared"]
}
```

**2) `shared/package.json`（纯 TS 常量/类型包）**

```json
{
  "name": "@storyapp/shared",
  "version": "0.1.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "files": ["dist"],
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "clean": "rimraf dist"
  },
  "devDependencies": {
    "typescript": "^5.8.3"
  }
}
```

**3) `shared/tsconfig.build.json`**

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "composite": true,
    "outDir": "dist",
    "declaration": true,
    "emitDeclarationOnly": false
  },
  "include": ["src/**/*"]
}
```

**4) 顶层 `tsconfig.base.json` + 路径别名**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "sourceMap": true,
    "resolveJsonModule": true,
    "rootDir": ".",
    "baseUrl": ".",
    "paths": {
      "@shared/*": ["shared/src/*"]
    }
  }
}
```

**5) backend 引用统一改为：**

```ts
import { DEFAULT_VALIDATION_RULES } from '@shared/constants/validation';
```

**6) 构建顺序（本地/CI 都一致）**

```bash
npm run -w @storyapp/shared build
npm run -w backend build
```

**7) Docker 多阶段构建补充（在“后端构建”阶段把 shared 一起编译并拷入运行镜像）**

```dockerfile
# --- build shared ---
FROM node:20-alpine AS shared-builder
WORKDIR /repo
COPY package.json package-lock.json ./
COPY shared ./shared
RUN npm ci --omit=dev=false
RUN npm run -w @storyapp/shared build

# --- build backend ---
FROM node:20-alpine AS backend-builder
WORKDIR /repo
COPY package.json package-lock.json ./
COPY backend ./backend
RUN npm ci --omit=dev=false
# 注意：把 shared 的 dist 也带进来，供后端编译/运行
COPY --from=shared-builder /repo/shared/dist ./node_modules/@storyapp/shared/dist
RUN npm run -w backend build

# --- runtime ---
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=backend-builder /repo/backend/dist ./dist
COPY --from=shared-builder  /repo/shared/dist  ./node_modules/@storyapp/shared/dist
CMD ["node","dist/src/index.js"]
```

> 好处：**单一真源、零复制、运行时可寻址、TS/JS 同步**。后续新增校验规则/常量，不需要到处同步。

---

# B. API 层“可观测性 + 健康度 + 限流”（高优先）

在生产环境排障、定位问题必须有**结构化日志、指标、健康检查**。

**1) 结构化日志（pino）+ 请求 ID 贯穿**

```ts
// backend/src/app.ts
import express from 'express';
import pino from 'pino';
import pinoHttp from 'pino-http';
import { v4 as uuid } from 'uuid';

const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });

const app = express();
app.use((req, _res, next) => { (req as any).id = uuid(); next(); });
app.use(pinoHttp({ logger, customProps: (req) => ({ reqId: (req as any).id }) }));
export default app;
```

**2) Prometheus 指标（prom-client）**

```ts
// backend/src/metrics.ts
import client from 'prom-client';
client.collectDefaultMetrics({ prefix: 'storyapp_' });
export const httpReqDur = new client.Histogram({
  name: 'storyapp_http_duration_seconds',
  help: 'HTTP latency',
  labelNames: ['method','route','code'],
  buckets: [0.05,0.1,0.2,0.5,1,2,5]
});
```

```ts
// app.ts 注册
import { httpReqDur } from './metrics';
app.use((req,res,next)=>{
  const end = httpReqDur.startTimer({ method: req.method, route: req.path });
  res.on('finish', ()=> end({ code: res.statusCode }));
  next();
});
app.get('/healthz', (_req, res)=> res.json({ ok: true, ts: Date.now() }));
app.get('/metrics', async (_req, res)=>{
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
});
```

**3) 安全中间件**

```ts
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import mongoSanitize from 'express-mongo-sanitize';
import xss from 'xss-clean';

app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(',') ?? '*', credentials: true }));
app.use(rateLimit({ windowMs: 60_000, max: 600 }));
app.use(mongoSanitize());
app.use(xss());
```

---

# C. 路由/Service 契约“自解释”：OpenAPI + Zod（中高）

> 让前后端、CI、文档“共用同一份契约”，减少灰区。

**做法 A（Zod → OpenAPI）**

* 使用 `zod` 定义请求/响应 schema；
* 用 `zod-to-openapi` 生成 `openapi.json`；
* 加 `express-openapi-validator` 做运行时校验；
* 在 CI 加一步“同步生成并上传 artifact”。

**示例（片段）**

```ts
import { z } from 'zod';
export const CreateProjectReq = z.object({
  title: z.string().min(1),
  genreTags: z.array(z.string()).nonempty(),
  targetWords: z.number().int().positive()
});
export type CreateProjectReq = z.infer<typeof CreateProjectReq>;
```

---

# D. 数据层：索引与约束（中高）

假设你使用 MongoDB 原生或 Mongoose，建议把“常用查询”加索引，并用迁移工具（如 migrate-mongo）管理。

**1) 典型索引**

```js
// projects collection
db.projects.createIndex({ ownerId: 1, updatedAt: -1 });
db.projects.createIndex({ 'collaborators.userId': 1 });
db.projects.createIndex({ title: 'text' });

// miracles collection
db.miracles.createIndex({ projectId: 1 }, { unique: true });
```

**2) 迁移脚手架**

```bash
npm i -D migrate-mongo
npx migrate-mongo init
npx migrate-mongo create add-indexes-20250912
```

在 CI 增加“生成环境跳过、Staging 执行”的安全策略；生产用“人工批准 + 回滚脚本”。

---

# E. 测试金字塔补齐（中）

你已经有 CI 质量门，建议补齐 **Supertest E2E** 与 **契约测试**：

**1) E2E 样例**

```ts
import request from 'supertest';
import app from '../src/app';

describe('health', ()=>{
  it('GET /healthz', async ()=>{
    const res = await request(app).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  })
})
```

**2) GitHub Actions 增强**

* 为 E2E 起一个 `services: mongodb`（actions 自带服务容器）；
* Playwright E2E（如果你要做前端端到端），跑完上传 HTML 报告 artifact。

---

# F. 安全扫描 & 依赖策略（中）

你现在把 Trivy设为非阻塞。如果要“主干更稳”，可以：

* **main/master 分支**：CRITICAL/HIGH **阻断**；
* 其它分支：仅告警。

**Trivy 条件化示例**

```yaml
- name: Trivy scan image
  uses: aquasecurity/trivy-action@0.24.0
  with:
    image-ref: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:sha-${{ github.sha }}
    format: table
    exit-code: ${{ github.ref_name == 'master' && '1' || '0' }}
    severity: CRITICAL,HIGH
```

**依赖更新**

* 加 Renovate（更灵活）或 Dependabot；
* 配一个轻量规则：仅 minor/patch 自动提 PR，由 Claude Review 先行审查。

---

# G. 部署与回滚体验（中）

**1) GHCR tag 策略**
你已引入 `sha-latest`，建议同时保留：`<semver>` / `sha-<shortsha>` / `sha-latest` 三轨，以便**随时回滚**。

**2) 蓝绿/预览环境**
Compose 层可以这样做：`app_blue` 与 `app_green` 两个 service，Nginx upstream 指向当前活跃颜色；部署时切换标签 + 健康检查通过后**原子切换** upstream。

**Nginx upstream 片段**

```nginx
upstream storyapp {
    server app_blue:5000 max_fails=3 fail_timeout=10s;
    # 或根据环境变量渲染，部署时写入 active=blue/green
}
```

---

# H. 运行时健壮性（中）

* 在 Node 启动脚本加：

  * `NODE_OPTIONS="--enable-source-maps"`（便于定位错误行）
  * `--unhandled-rejections=strict`（CI/生产 fail-fast）
* 进程守护：容器里由 Docker/Compose 管理重启策略即可（`restart: always` + 健康检查失败自动重启）。

---

# I. 开发体验与治理（可选但推荐）

* **actionlint**：给工作流专门跑一次；
* **commitlint + husky**：规范 commit message → 自动生成 ChangeLog（release-please / changesets）；
* **Sentry/ErrLog**：接入错误上报；
* **gitleaks**：Secrets 泄露扫描（阻断 PR）。

---

## 小结（你现在可以直接做的 5 步）

1. 把 `shared` 升级为 workspace 包，删掉“复制型类型定义”，后端/镜像按上面的方式引用与构建。
2. 在后端加 **pino 日志 + Prometheus 指标 + /healthz**，Compose 增加健康检查。
3. 用 Zod 定义请求/响应，生成 OpenAPI；在 CI 上传 `openapi.json`。
4. 补 MongoDB 关键索引，并引入 migrate-mongo 管理迁移。
5. `docker-build-push.yml` 中 Trivy 对主干阻断，其它分支警告；加 Renovate/Dependabot。

如果你把当前的 `Dockerfile`、`package.json（root/backend/shared）` 贴出来，我可以给你**最小 diff**，做到“零心智负担”升级到 workspace + 根 tsconfig 的方案；也可以给你一份现成的 **Nginx 蓝绿切换配置** 和 **预览环境工作流**。
