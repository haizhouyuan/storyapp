# 改进的Dockerfile - 适配NPM Workspaces
ARG NODE_IMAGE=node:20-alpine3.20
ARG NPM_REGISTRY=https://registry.npmmirror.com

FROM ${NODE_IMAGE} AS builder
WORKDIR /app

# 设置npm镜像源
RUN npm install -g npm@10.9.3 \
  && npm config set registry $NPM_REGISTRY

# 复制根与子包的 package.json（让 npm 能解析 workspaces）
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
COPY shared/package.json shared/package.json

# 一次性安装整个 monorepo
RUN npm ci --workspaces

# 复制全量源码
COPY . .

# 构建前后端 - 添加详细调试信息
RUN echo "=== Building shared package ===" && \
    cd shared && \
    pwd && \
    ls -la && \
    echo "=== Running TypeScript compiler directly ===" && \
    npx tsc -p tsconfig.build.json && \
    echo "=== After compilation ===" && \
    ls -la && \
    echo "=== Checking if dist directory exists ===" && \
    (ls -la dist/ || echo "dist directory not found") && \
    cd .. && \
    echo "=== Contents of shared directory ===" && \
    find shared/ -type f -name "*.js" -o -name "*.d.ts" | head -20 && \
    echo "=== Building frontend ===" && \
    npm run -w frontend build && \
    echo "=== Building backend ===" && \
    npm run -w backend build

# 生产镜像
FROM ${NODE_IMAGE} AS production
WORKDIR /app

# 创建非root用户
RUN addgroup -g 1001 -S nodejs && \
    adduser -S storyapp -u 1001

# 升级npm以获取最新安全修复
RUN npm install -g npm@10.9.3

# 复制package文件和安装生产依赖
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY shared/package.json shared/package.json

RUN npm config set registry $NPM_REGISTRY && \
    npm ci --omit=dev --workspaces && \
    npm cache clean --force

# 复制构建产物
COPY --from=builder /app/backend/dist ./dist/backend
COPY --from=builder /app/shared/dist ./dist/shared
# 复制根目录config文件夹（backend依赖）
COPY --from=builder /app/config ./config
# 将前端构建产物复制到后端可服务的目录
RUN mkdir -p ./dist/backend/public
COPY --from=builder /app/frontend/build ./dist/backend/public
# 确保运行时代码能解析到 workspace 依赖
RUN ln -s /app/backend/node_modules /app/dist/backend/node_modules || true
# 为历史逻辑保留软链接，兼容 ../public 与 ./public 两种查找方式
RUN ln -s /app/dist/backend/public /app/dist/public || true

# 切换到非root用户
USER storyapp

# 暴露端口
EXPOSE 5000

# 健康检查 - 改进版本，更好的错误处理和超时控制
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "const http=require('http');const req=http.get('http://127.0.0.1:5000/healthz',(res)=>{let data='';res.on('data',chunk=>data+=chunk);res.on('end',()=>{try{const result=JSON.parse(data);process.exit(res.statusCode===200&&result.status==='healthy'?0:1)}catch{process.exit(res.statusCode===200?0:1)}})});req.on('error',()=>process.exit(1));req.setTimeout(2000,()=>{req.destroy();process.exit(1)})"

# 启动应用
CMD ["node", "dist/backend/index.js"]
