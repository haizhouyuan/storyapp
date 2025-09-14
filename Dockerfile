# 改进的Dockerfile - 适配NPM Workspaces
ARG NODE_IMAGE=node:20-alpine
ARG NPM_REGISTRY=https://registry.npmmirror.com

FROM ${NODE_IMAGE} AS builder
WORKDIR /app

# 设置npm镜像源
RUN npm config set registry $NPM_REGISTRY

# 复制根与子包的 package.json（让 npm 能解析 workspaces）
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
COPY shared/package.json shared/package.json

# 一次性安装整个 monorepo
RUN npm ci --workspaces

# 复制全量源码
COPY . .

# 构建前后端
RUN npm run -w shared build && \
    npm run -w frontend build && \
    npm run -w backend build

# 生产镜像
FROM ${NODE_IMAGE} AS production
WORKDIR /app

# 创建非root用户
RUN addgroup -g 1001 -S nodejs && \
    adduser -S storyapp -u 1001

# 复制package文件和安装生产依赖
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY shared/package.json shared/package.json

RUN npm config set registry $NPM_REGISTRY && \
    npm ci --omit=dev --workspaces && \
    npm cache clean --force

# 复制构建产物
COPY --from=builder /app/backend/dist ./backend/dist
COPY --from=builder /app/shared/dist ./shared/dist
COPY --from=builder /app/frontend/build ./frontend/build

# 切换到非root用户
USER storyapp

# 暴露端口
EXPOSE 5000

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:5000/healthz', (res) => process.exit(res.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

# 启动应用
CMD ["node", "backend/dist/index.js"]