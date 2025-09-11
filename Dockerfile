# 多阶段构建Dockerfile - 前后端统一部署

# 阶段1: 前端构建
FROM node:18-alpine AS frontend-builder
WORKDIR /app

# 安装前端依赖
COPY frontend/package*.json ./frontend/
RUN cd frontend && npm ci --legacy-peer-deps

# 复制前端源码和共享类型
COPY frontend ./frontend
COPY shared ./shared

# 构建前端
RUN cd frontend && npm run build

# 阶段2: 后端构建
FROM node:18-alpine AS backend-builder
WORKDIR /app

# 安装后端依赖
COPY backend/package*.json ./backend/
RUN cd backend && npm ci

# 复制后端源码和共享类型
COPY backend ./backend
COPY shared ./shared

# 构建后端
RUN cd backend && npm run build

# 阶段3: 生产运行时
FROM node:18-alpine

# 创建应用目录和用户
WORKDIR /app
RUN addgroup -g 1001 -S nodejs && \
    adduser -S storyapp -u 1001

# 复制后端package.json并安装生产依赖
COPY backend/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# 复制构建结果
COPY --from=backend-builder /app/backend/dist ./dist
COPY --from=frontend-builder /app/frontend/build ./public

# 创建必要的目录
RUN mkdir -p logs uploads && \
    chown -R storyapp:nodejs /app

# 安装额外的生产依赖
RUN npm install axios

# 切换到非root用户
USER storyapp

# 设置环境变量
ENV NODE_ENV=production \
    PORT=5000

# 暴露端口
EXPOSE 5000

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:5000/api/health', (res) => process.exit(res.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

# 启动应用
CMD ["node", "dist/index.js"]