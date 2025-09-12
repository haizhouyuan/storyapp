结论先给：
你的目标是“一套镜像/Compose既能本地起、也能在 GitHub 上验、还方便远程 ECS 快速部署”。这需要**三个入口**（dev/ghcr/prod）和**一套公共 Compose 基座**。如果你仓库里已经有 `Dockerfile`、`docker-compose.yml`、`docker-build-push.yml`、`deploy-prod.yml`，那只差**两个小文件**和**若干小改动**就能把三种场景打通：

* `docker-compose.dev.yml`（本地开发：源码挂载 + 热更新）
* `docker-compose.ghcr.yml`（本地/测试用 GHCR 镜像：与生产同镜像）
* 统一 `.env.example`（本地/服务器通用变量模版）
* （可选）`Makefile` 或 `npm scripts` 封装常用命令

下面我给你**最小落地方案**（直接拷贝/按需改路径即可）+ **一步步操作指令**。如果你仓库已有同名文件，就把“差异段”对齐即可。

---

## 一、基座：`docker-compose.yml`（公共栈）

> 只放“所有环境都用”的内容：网络、卷、服务骨架、健康检查。镜像/命令之类放在 override 里区分。

```yaml
# docker-compose.yml
name: storyapp
services:
  app:
    container_name: storyapp-app
    # 镜像或 build 在 override 里指定
    env_file:
      - .env
    depends_on:
      mongo:
        condition: service_healthy
    healthcheck:
      test: ["CMD-SHELL", "node -e \"fetch('http://127.0.0.1:' + (process.env.PORT||5000) + '/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))\""]
      interval: 15s
      timeout: 5s
      retries: 10
    restart: unless-stopped
    ports:
      - "${APP_PORT:-5000}:5000"   # 对外端口，按需修改
    networks: [appnet]

  mongo:
    image: mongo:6
    container_name: storyapp-mongo
    command: ["--wiredTigerCacheSizeGB", "1"]
    environment:
      MONGO_INITDB_ROOT_USERNAME: ${MONGO_USER:-root}
      MONGO_INITDB_ROOT_PASSWORD: ${MONGO_PASS:-pass}
    volumes:
      - mongo_data:/data/db
    healthcheck:
      test: ["CMD-SHELL", "mongosh --quiet --eval 'db.runCommand({ ping: 1 }).ok' | grep 1"]
      interval: 10s
      timeout: 5s
      retries: 12
    restart: unless-stopped
    networks: [appnet]

  # 可选：Nginx 反代（生产/测试同栈使用）
  nginx:
    image: nginx:1.27-alpine
    container_name: storyapp-nginx
    depends_on:
      app:
        condition: service_healthy
    volumes:
      - ./ops/nginx/conf.d:/etc/nginx/conf.d:ro
    ports:
      - "${WEB_PORT:-80}:80"
    restart: unless-stopped
    networks: [appnet]

volumes:
  mongo_data:

networks:
  appnet:
```

> nginx 的 `ops/nginx/conf.d/default.conf` 示例见文末附录。

---

## 二、本地开发 override：`docker-compose.dev.yml`

> 目标：**不依赖 GHCR**，直接在本地 build，挂载源码 + nodemon 热更新，调试最快。

```yaml
# docker-compose.dev.yml
services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
      args:
        NPM_REGISTRY: ${NPM_REGISTRY:-https://registry.npmmirror.com}
    environment:
      NODE_ENV: development
    command: npm run dev    # 你的开发命令（例如 nodemon）
    volumes:
      - ./backend:/app/backend
      - ./shared:/app/shared
      - /app/node_modules
      - /app/backend/node_modules
```

> 如果你的仓库不是这种结构，请把 `volumes` 的路径改为你的源码目录。

---

## 三、GHCR 镜像 override：`docker-compose.ghcr.yml`

> 目标：**在本地/测试机复现生产镜像**（无需编译），彻底验证“镜像即生产”。

```yaml
# docker-compose.ghcr.yml
services:
  app:
    image: ghcr.io/haizhouyuan/storyapp:${APP_TAG:-sha-latest}
    environment:
      NODE_ENV: production
    command: ["node","dist/src/index.js"]  # 按你的镜像入口调整
```

> 你在 CI 已产出 `sha-<commit>` 和 `sha-latest`；本地验证时只需 `APP_TAG=sha-latest` 即可。

---

## 四、环境变量模版：`.env.example`

> 统一项目与服务器的配置口径，一键复制：

```dotenv
# 应用
PORT=5000
APP_PORT=5000
CORS_ORIGIN=*

# Mongo
MONGO_USER=root
MONGO_PASS=pass
MONGO_HOST=mongo
MONGO_PORT=27017
MONGO_DB=storyapp
MONGO_URI=mongodb://root:pass@mongo:27017/storyapp?authSource=admin

# （可选）国内 npm 源
NPM_REGISTRY=https://registry.npmmirror.com

# GHCR 镜像标签（用于 docker-compose.ghcr.yml）
APP_TAG=sha-latest
```

> 首次使用：`cp .env.example .env`，按需修改。

---

## 五、（可选）`Makefile` 或 npm scripts（一键化）

```Makefile
up-dev:
\tdocker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
down:
\tdocker compose down -v
logs:
\tdocker compose logs -f --tail=200 app
up-ghcr:
\tdocker compose -f docker-compose.yml -f docker-compose.ghcr.yml pull
\tdocker compose -f docker-compose.yml -f docker-compose.ghcr.yml up -d
ps:
\tdocker compose ps
```

---

## 六、三种场景的**标准操作指令**

### A) 本地开发（最快验证，源码热更新）

```bash
cp .env.example .env
# 如需国内源：export NPM_REGISTRY=https://registry.npmmirror.com
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
docker compose logs -f app
# 停止并清理
docker compose down -v
```

### B) 本地 / 测试机用 GHCR 镜像验证（与生产一致）

```bash
cp .env.example .env
export APP_TAG=sha-latest       # 或某次构建出的 sha-<commit>
docker login ghcr.io
docker compose -f docker-compose.yml -f docker-compose.ghcr.yml pull
docker compose -f docker-compose.yml -f docker-compose.ghcr.yml up -d
docker compose logs -f app
```

### C) 远程 ECS 快速部署（与你的 `deploy-prod.yml` 对齐）

> 服务器上准备：Docker / Compose、项目目录 `/root/projects/storyapp`、同仓库的 `.env` 与 Compose 文件。

```bash
# 1) 首次准备
mkdir -p /root/projects/storyapp && cd /root/projects/storyapp
# 登录 GHCR（使用 read:packages PAT）
echo "<GHCR_PAT>" | docker login ghcr.io -u <your_github_name> --password-stdin

# 2) 放置文件（如果已由 CI 同步可跳过）
# 将仓库里的 docker-compose.yml、docker-compose.ghcr.yml、.env 下发到该目录

# 3) 部署（与 deploy-prod.yml 一致）
export APP_TAG=sha-<commit>     # 或 sha-latest
docker compose -f docker-compose.yml -f docker-compose.ghcr.yml pull
docker compose -f docker-compose.yml -f docker-compose.ghcr.yml up -d --remove-orphans
docker image prune -f
```

> 你在 GitHub Actions 的 `deploy-prod.yml` 已支持传入 tag 并自动替换；上面的手工流程是它的“等价本地版”。

---

## 七、你的代码库**还差什么？**

按你目标，要做到“三端一致”，最常见短板与补齐如下：

1. **缺 `docker-compose.dev.yml`** → 我已给模板（源码挂载 + dev 命令）。
2. **缺 `docker-compose.ghcr.yml`** → 我已给模板（标签化镜像）。
3. **`.env.example` 不统一** → 我已给不依赖私密的模版；GitHub/服务器 `.env` 直接复制再补密钥即可。
4. **健康检查** → 基座已加 `/healthz`，配合 Nginx/Compose 保障滚动/蓝绿时序。
5. **Nginx 配置**（如你要 80/443 对外） → 见附录；生产建议加 `health_check` 与 `proxy_read_timeout`。
6. **一键命令** → 建议加 Makefile 或 npm scripts，避免记忆 compose 组合参数。
7. **本地 Actions 预演**（可选） → 如果你要离线预演 CI，可研究 `nektos/act`，不过国内拉镜像较慢，通常直接推分支走 GitHub 更稳。

---

## 八、与 CI/CD 的“闭环验证”建议（很重要）

1. **CI 构建成功后**，在本地跑：

```bash
APP_TAG=sha-<同一次构建的 tag> \
docker compose -f docker-compose.yml -f docker-compose.ghcr.yml up -d
```

> 确认“构建出来的镜像”在你机器上也能跑，排除“只在 CI 能跑”。

2. **部署前自检**（Smoke）

* 你已有 `Claude Smoke Check`；建议再补一个 `compose smoke`：在 GH Actions 用 `services: mongo` 启一个最小 app（或用 `docker compose` 的 `--dry-run`）。
* 也可把 **Trivy** 对 `master` 设为阻断、对其它分支只告警（你已实现/或按需开启）。

---

## 九、常见坑与“现成修法”

* **镜像标签不统一** → CI 加 `sha-latest`，Compose/服务器统一用 `${APP_TAG}` 变量（上面已给）。
* **国内构建慢** → Dockerfile/Compose 传 `NPM_REGISTRY`，Node 层面 `npm config set registry $NPM_REGISTRY`；拉取基础镜像可配镜像站（如 USTC、阿里云）。
* **Mongo 权限/连通问题** → 用 `MONGO_URI` 单一入口；服务健康检查基于 `healthz`；`depends_on` 使用 `service_healthy`。
* **日志定位** → 容器加 `--enable-source-maps`（Node），pino 做结构化日志；Compose `docker compose logs -f app`。
* **SSL** → Nginx 容器绑定 `/etc/letsencrypt` 或使用 Caddy（更省事），这里先不展开。

---

## 附录：Nginx 反代示例（`ops/nginx/conf.d/default.conf`）

```nginx
server {
  listen 80;
  server_name _;

  # 健康检查端点
  location /healthz {
    proxy_pass http://app:5000/healthz;
  }

  location / {
    proxy_read_timeout 60s;
    proxy_connect_timeout 5s;
    proxy_send_timeout 60s;

    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    proxy_pass http://app:5000;
  }
}
```

---

### 你可以现在就做的 3 步

1. 把上面的三个文件落到仓库：`docker-compose.dev.yml`、`docker-compose.ghcr.yml`、`.env.example`（和可选 Makefile）。
2. 本地跑一遍 **A）开发模式** 和 **B）GHCR 镜像模式**，确认都能启动。
3. 远程服务器按 **C）** 指令部署一次（或直接用你的 `deploy-prod.yml` 手动触发传入 tag）。

如果你把当前的 `Dockerfile`、`docker-compose.yml` 贴过来，我可以给你**最小修改 diff**，把上述方案完全贴合你的目录结构与启动脚本（做到复制即用）。
