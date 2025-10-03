# StoryApp 综合测试计划文档

**文档版本**: v1.0
**创建日期**: 2025-09-26
**维护团队**: StoryApp开发团队
**适用版本**: StoryApp v1.0+

---

## 📋 目录

1. [项目概述与测试目标](#1-项目概述与测试目标)
2. [测试策略与方法论](#2-测试策略与方法论)
3. [测试环境配置](#3-测试环境配置)
4. [核心测试场景A-G](#4-核心测试场景a-g)
5. [测试自动化框架](#5-测试自动化框架)
6. [性能与质量标准](#6-性能与质量标准)
7. [风险评估与缓解](#7-风险评估与缓解)
8. [执行计划与里程碑](#8-执行计划与里程碑)
9. [交付物与验收标准](#9-交付物与验收标准)
10. [附录：脚本与配置](#10-附录脚本与配置)

---

## 1. 项目概述与测试目标

### 1.1 项目背景

**StoryApp** 是一个基于AI技术的儿童睡前互动故事应用，采用React+Node.js全栈架构，集成DeepSeek AI服务，为3-12岁儿童提供个性化故事生成体验。

**技术栈**:
- 前端: React 18 + TypeScript + Tailwind CSS
- 后端: Node.js + Express + TypeScript
- 数据库: MongoDB 6.0
- AI服务: DeepSeek API (推理模式 + 快速模式)
- 容器化: Docker + Docker Compose
- 测试: Playwright + Jest + Supertest

### 1.2 测试目标

#### 1.2.1 功能性目标
- ✅ **核心API可用性**: 故事生成、保存、管理接口 99%+ 成功率
- ✅ **故事质量保证**: 内容长度≥500字，中文表达，儿童友好风格
- ✅ **双模式支持**: 渐进式生成 + 故事树模式完整验证
- ✅ **用户体验**: 前端响应式设计，交互流畅，异常友好提示

#### 1.2.2 非功能性目标
- ⚡ **性能指标**: API响应P95 < 12s，前端首屏 < 3s
- 🛡️ **稳定性**: 降级切换 < 5s，99.9%+ 可用性
- 📊 **可观测性**: 完整的监控指标、日志审计、健康检查
- 🚀 **交付质量**: CI/CD 100%通过，生产部署零故障

#### 1.2.3 业务连续性目标
- 🔄 **降级机制**: API Key失效时自动切换Mock模式
- 🚨 **异常处理**: 数据库断连、限流、超时的优雅处理
- 📈 **扩展性**: 支持并发用户，资源使用可控
- 🔒 **安全性**: 儿童内容安全，API密钥保护，输入验证

---

## 2. 测试策略与方法论

### 2.1 测试金字塔策略

```
        🔺 E2E Tests (20%)
       🔺🔺 Integration Tests (30%)
      🔺🔺🔺 Unit Tests (50%)
```

#### 单元测试层 (50%)
- **覆盖范围**: 核心业务逻辑、工具函数、数据模型
- **工具**: Jest + @types/jest
- **目标**: 代码覆盖率 > 80%，关键路径 > 95%
- **执行频率**: 每次提交

#### 集成测试层 (30%)
- **覆盖范围**: API接口、数据库交互、第三方服务
- **工具**: Supertest + MongoDB Memory Server
- **目标**: API契约验证，数据一致性检查
- **执行频率**: 每日构建

#### E2E测试层 (20%)
- **覆盖范围**: 用户完整业务流程、跨浏览器兼容性
- **工具**: Playwright + 多设备配置
- **目标**: 关键用户路径100%覆盖
- **执行频率**: 发布前验证

### 2.2 orchestrator A-G方法论

借鉴tmux-agent orchestrator的成功验证经验，采用A-G七大场景分类法：

| 场景 | 英文名称 | 中文名称 | 核心目标 |
|------|----------|----------|----------|
| **A** | Command Execution | 命令执行反馈 | 构建、测试、启动流程验证 |
| **B** | Core Business Flow | 故事生成链路 | 核心业务功能完整性 |
| **C** | Advanced Features | StoryTree高级模式 | 复杂功能与降级机制 |
| **D** | Management & Audit | 管理接口审计 | 后台管理与数据审计 |
| **E** | Exception Handling | 异常处理降级 | 容错能力与鲁棒性 |
| **F** | Deployment Pipeline | 部署运维流水线 | CI/CD与生产部署 |
| **G** | Monitoring & Alerting | 监控告警 | 可观测性与运维支撑 |

---

## 3. 测试环境配置

### 3.1 基础环境要求

#### 软件依赖版本表
| 软件 | 版本要求 | 用途 | 安装验证命令 |
|------|----------|------|--------------|
| Node.js | 20.x LTS | 运行时环境 | `node --version` |
| npm | ≥ 9.0 | 包管理 | `npm --version` |
| MongoDB | 6.0+ | 数据库 | `mongod --version` |
| Docker | 24.x+ | 容器化 | `docker --version` |
| Docker Compose | 2.x+ | 编排 | `docker compose version` |

#### 可选监控工具
| 工具 | 版本 | 用途 | 端口 |
|------|------|------|------|
| Prometheus | latest | 指标采集 | 9090 |
| Grafana | latest | 数据可视化 | 3001 |
| MongoDB Compass | latest | 数据库管理 | - |

### 3.2 环境变量配置

#### 开发环境 (`.env.development.local`)
```bash
# =================================
# StoryApp 开发环境配置
# =================================

# AI服务配置
DEEPSEEK_API_KEY=sk-your-real-api-key-here
DEEPSEEK_API_URL=https://api.deepseek.com
DEEPSEEK_MODEL_REASONING=deepseek-reasoner
DEEPSEEK_MODEL_FAST=deepseek-chat

# 数据库配置
MONGODB_URI=mongodb://localhost:27017/storyapp_dev
MONGODB_MAX_POOL_SIZE=10
MONGODB_MIN_POOL_SIZE=2

# 服务器配置
PORT=5000
NODE_ENV=development
FRONTEND_URL=http://localhost:3000
API_BASE_URL=http://localhost:5000

# 功能开关
ENABLE_STORY_TREE_MODE=true
ENABLE_ADVANCED_MODE=true
ENABLE_MOCK_FALLBACK=true

# 性能配置
STORY_GENERATION_TIMEOUT=30000
MAX_STORY_LENGTH=2000
MIN_STORY_LENGTH=500

# 限流配置 (开发环境放宽)
RATE_LIMIT_MAX_REQUESTS=1000
RATE_LIMIT_WINDOW_MS=60000

# 日志配置
LOG_LEVEL=debug
ENABLE_DETAILED_LOGGING=true
ENABLE_PERFORMANCE_MONITORING=true
ENABLE_REQUEST_LOGGING=true

# 安全配置
CORS_ORIGIN=http://localhost:3000
SESSION_SECRET=dev-session-secret-change-in-prod

# 监控配置
PROMETHEUS_METRICS_PORT=9090
HEALTH_CHECK_INTERVAL=30000
```

#### 测试环境 (`.env.test`)
```bash
# =================================
# StoryApp 测试环境配置
# =================================

# Mock模式 - API Key为空触发Mock降级
DEEPSEEK_API_KEY=""
DEEPSEEK_API_URL=http://localhost:8080/mock
ENABLE_MOCK_MODE=true

# 测试数据库
MONGODB_URI=mongodb://localhost:27017/storyapp_test
MONGODB_MAX_POOL_SIZE=5

# 服务配置
PORT=5001
NODE_ENV=test
FRONTEND_URL=http://localhost:3001

# 加速测试的配置
STORY_GENERATION_TIMEOUT=5000
RATE_LIMIT_MAX_REQUESTS=10000
RATE_LIMIT_WINDOW_MS=10000

# 测试专用配置
DISABLE_AUTH=true
SKIP_CONTENT_FILTER=false
ENABLE_TEST_ROUTES=true

# 日志配置 (测试环境精简)
LOG_LEVEL=warn
ENABLE_DETAILED_LOGGING=false
ENABLE_REQUEST_LOGGING=false
```

#### 生产环境 (`.env.production`)
```bash
# =================================
# StoryApp 生产环境配置
# =================================

# 从环境变量或秘钥管理系统加载
DEEPSEEK_API_KEY=${DEEPSEEK_API_KEY}
MONGODB_URI=${MONGODB_URI}
SESSION_SECRET=${SESSION_SECRET}

# 生产环境严格配置
NODE_ENV=production
PORT=5000

# 性能优化
MONGODB_MAX_POOL_SIZE=20
MONGODB_MIN_POOL_SIZE=5

# 限流保护
RATE_LIMIT_MAX_REQUESTS=100
RATE_LIMIT_WINDOW_MS=900000

# 安全配置
CORS_ORIGIN=${FRONTEND_URL}
HELMET_ENABLED=true
TRUST_PROXY=true

# 监控配置
ENABLE_DETAILED_LOGGING=false
ENABLE_PERFORMANCE_MONITORING=true
LOG_LEVEL=info

# 特性开关
ENABLE_ADMIN_ROUTES=false
ENABLE_DEBUG_ROUTES=false
```

### 3.3 Docker测试环境

#### docker-compose.test.yml
```yaml
version: '3.8'

services:
  # MongoDB 测试数据库
  mongo-test:
    image: mongo:6.0
    container_name: storyapp-mongo-test
    ports:
      - "27018:27017"
    environment:
      - MONGO_INITDB_DATABASE=storyapp_test
    volumes:
      - ./scripts/mongo-init.js:/docker-entrypoint-initdb.d/mongo-init.js:ro
      - mongo-test-data:/data/db
    command: mongod --quiet --logpath /dev/null

  # StoryApp后端服务
  app-test:
    build:
      context: .
      dockerfile: Dockerfile
      target: development
    container_name: storyapp-backend-test
    ports:
      - "5001:5000"
    environment:
      - NODE_ENV=test
      - MONGODB_URI=mongodb://mongo-test:27017/storyapp_test
      - DEEPSEEK_API_KEY=""  # 触发Mock模式
    depends_on:
      - mongo-test
    volumes:
      - .:/app
      - /app/node_modules
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:5000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  # Mock DeepSeek API服务
  mock-api:
    build:
      context: ./tests/mock-server
      dockerfile: Dockerfile
    container_name: storyapp-mock-api
    ports:
      - "8080:8080"
    environment:
      - PORT=8080
      - RESPONSE_DELAY=1000

volumes:
  mongo-test-data:
```

---

## 4. 核心测试场景A-G

### 4.1 Scenario A: 命令执行反馈测试 🔧

#### 4.1.1 测试目标
验证项目构建、测试、启动命令的完整性和环境准备的正确性

#### 4.1.2 测试步骤

**步骤1: 环境准备与依赖验证**
```bash
# 1.1 检查Node.js环境
node --version  # 期望: v20.x.x
npm --version   # 期望: ≥9.0.0

# 1.2 克隆项目并安装依赖
cd /home/yuanhaizhou/projects/storyapp
npm install     # 验证package.json依赖安装

# 1.3 验证Monorepo工作空间
npm run workspaces info
# 期望输出: frontend, backend, shared工作空间信息
```

**步骤2: 构建流程验证**
```bash
# 2.1 TypeScript编译检查
npm run type-check
# 验证: frontend, backend, shared无TypeScript错误

# 2.2 代码质量检查
npm run lint           # ESLint检查
npm run format:check   # Prettier格式检查

# 2.3 完整构建流程
npm run build:shared   # 共享库构建
npm run build:backend  # 后端构建
npm run build:frontend # 前端构建
npm run build:all      # 一键构建所有模块
```

**步骤3: 测试命令验证**
```bash
# 3.1 单元测试 (需要实现)
npm run -w backend test
npm run -w frontend test
npm run test:all

# 3.2 测试覆盖率报告
npm run test:coverage
# 期望: backend > 80%, frontend > 70%
```

**步骤4: 服务启动验证**
```bash
# 4.1 数据库启动
docker compose up -d mongo
# 验证: MongoDB在27017端口运行

# 4.2 后端服务启动
npm run dev:backend &
BACKEND_PID=$!

# 等待服务启动完成
sleep 10

# 4.3 健康检查验证
curl -f http://localhost:5000/api/health
curl -f http://localhost:5000/api/ready
curl -f http://localhost:5000/metrics

# 4.4 前端服务启动
npm run dev:frontend &
FRONTEND_PID=$!

# 等待前端编译完成
sleep 30

# 4.5 前端可访问性验证
curl -f http://localhost:3000
```

**步骤5: Docker环境验证**
```bash
# 5.1 Docker镜像构建
docker build -t storyapp:test .

# 5.2 容器启动测试
docker compose -f docker-compose.test.yml up -d

# 5.3 容器健康检查
docker compose -f docker-compose.test.yml ps
# 验证: 所有服务状态为healthy

# 5.4 容器内服务验证
docker exec storyapp-backend-test curl -f http://localhost:5000/api/health
```

#### 4.1.3 通过标准

| 检查项 | 通过标准 | 验证命令 |
|--------|----------|----------|
| **依赖安装** | npm install 零错误退出 | `echo $?` |
| **TypeScript编译** | 无编译错误，无类型警告 | `npm run type-check` |
| **代码质量** | ESLint零错误，Prettier格式一致 | `npm run lint && npm run format:check` |
| **构建成功** | 所有模块构建成功，产物完整 | `ls -la dist/ build/` |
| **服务端口** | 5000(后端), 3000(前端), 27017(MongoDB) | `netstat -tlnp \| grep -E "(5000\|3000\|27017)"` |
| **健康检查** | /health, /ready, /metrics返回200 | `curl -s -o /dev/null -w "%{http_code}" http://localhost:5000/api/health` |
| **前端访问** | 首页加载无Console错误 | 浏览器开发者工具检查 |
| **Docker构建** | 镜像构建成功，容器健康 | `docker images \| grep storyapp` |

#### 4.1.4 故障排查指南

**常见问题1: npm install失败**
```bash
# 诊断步骤
npm cache clean --force
rm -rf node_modules package-lock.json
npm install --verbose

# 检查Node.js版本兼容性
node --version
cat .nvmrc  # 如果存在
```

**常见问题2: TypeScript编译错误**
```bash
# 查看详细错误信息
npx tsc --noEmit --pretty

# 检查tsconfig.json配置
cat tsconfig.json
cat frontend/tsconfig.json
cat backend/tsconfig.json
```

**常见问题3: 端口占用**
```bash
# 查找占用进程
lsof -i :5000
lsof -i :3000
lsof -i :27017

# 终止占用进程
kill -9 <PID>
```

**常见问题4: Docker启动失败**
```bash
# 查看容器日志
docker compose -f docker-compose.test.yml logs app-test
docker compose -f docker-compose.test.yml logs mongo-test

# 检查资源使用
docker stats --no-stream
```

#### 4.1.5 记录输出

**构建日志示例**:
```
✅ Dependencies installed successfully
✅ TypeScript compilation: 0 errors, 0 warnings
✅ ESLint: 0 errors, 0 warnings
✅ Build completed: frontend (2.3MB), backend (1.8MB)
✅ Services started: backend:5000, frontend:3000, mongo:27017
✅ Health checks: /health ✓, /ready ✓, /metrics ✓
✅ Docker build: storyapp:test (245MB)
```

---

### 4.2 Scenario B: 故事生成链路验证测试 📚

#### 4.2.1 测试目标
验证核心故事生成功能在Mock模式和真实API模式下的完整性、质量标准和异常处理能力

#### 4.2.2 测试步骤

**步骤1: Mock模式故事生成测试**
```bash
# 1.1 启动Mock模式
export DEEPSEEK_API_KEY=""  # 空值触发Mock模式
npm run dev:backend

# 1.2 基础故事生成测试
curl -X POST http://localhost:5000/api/generate-story \
  -H "Content-Type: application/json" \
  -d '{
    "topic": "小兔子的太空冒险",
    "turnIndex": 0,
    "maxChoices": 3
  }' | jq '.'

# 1.3 续写故事测试
curl -X POST http://localhost:5000/api/generate-story \
  -H "Content-Type: application/json" \
  -d '{
    "topic": "小兔子的太空冒险",
    "currentStory": "小兔子乘坐火箭来到了月球上...",
    "selectedChoice": "探索月球洞穴",
    "turnIndex": 1,
    "maxChoices": 3
  }' | jq '.'

# 1.4 故事结尾生成测试
curl -X POST http://localhost:5000/api/generate-story \
  -H "Content-Type: application/json" \
  -d '{
    "topic": "小兔子的太空冒险",
    "currentStory": "...(完整故事内容)...",
    "selectedChoice": "返回地球",
    "turnIndex": 2,
    "forceEnding": true
  }' | jq '.'
```

**步骤2: 真实API模式测试**
```bash
# 2.1 配置真实API Key
export DEEPSEEK_API_KEY="sk-your-real-api-key"
export DEEPSEEK_API_URL="https://api.deepseek.com"

# 重启服务加载新配置
pkill -f "node.*backend"
npm run dev:backend &

# 2.2 验证API连接
curl -X POST http://localhost:5000/api/generate-story \
  -H "Content-Type: application/json" \
  -d '{
    "topic": "勇敢的小恐龙探索神秘洞穴",
    "turnIndex": 0
  }' \
  -w "\nResponse Time: %{time_total}s\nHTTP Code: %{http_code}\n"

# 2.3 并发请求测试
for i in {1..5}; do
  curl -X POST http://localhost:5000/api/generate-story \
    -H "Content-Type: application/json" \
    -d "{\"topic\": \"测试故事${i}\", \"turnIndex\": 0}" &
done
wait
```

**步骤3: 故事质量验证**
```bash
# 3.1 内容长度检查脚本
cat > validate_story_quality.js << 'EOF'
const axios = require('axios');

async function validateStoryQuality() {
  const response = await axios.post('http://localhost:5000/api/generate-story', {
    topic: '善良的小公主拯救魔法王国',
    turnIndex: 0
  });

  const story = response.data;

  // 验证故事结构
  console.log('🔍 故事质量验证:');
  console.log(`📝 故事内容长度: ${story.story?.length || 0} 字符`);
  console.log(`🎯 选择数量: ${story.choices?.length || 0} 个`);
  console.log(`⏱️  生成耗时: ${story.metadata?.phaseTimings?.total || 'N/A'}ms`);
  console.log(`🆔 追踪ID: ${story.metadata?.traceId || 'N/A'}`);

  // 质量检查
  const checks = {
    '长度达标': (story.story?.length || 0) >= 500,
    '选择合理': (story.choices?.length || 0) >= 2 && (story.choices?.length || 0) <= 4,
    '中文内容': /[\u4e00-\u9fa5]/.test(story.story || ''),
    '儿童友好': !/\b(暴力|死亡|恐怖)\b/.test(story.story || ''),
    '追踪ID存在': !!story.metadata?.traceId
  };

  Object.entries(checks).forEach(([check, passed]) => {
    console.log(`${passed ? '✅' : '❌'} ${check}`);
  });

  return Object.values(checks).every(Boolean);
}

validateStoryQuality().catch(console.error);
EOF

node validate_story_quality.js
```

**步骤4: 异常处理测试**
```bash
# 4.1 无效输入测试
echo "测试无效输入处理..."

# 空主题
curl -X POST http://localhost:5000/api/generate-story \
  -H "Content-Type: application/json" \
  -d '{"topic": "", "turnIndex": 0}' \
  -w "\nHTTP Code: %{http_code}\n"

# 超长主题
curl -X POST http://localhost:5000/api/generate-story \
  -H "Content-Type: application/json" \
  -d "{\"topic\": \"$('A'.repeat(1000))\", \"turnIndex\": 0}" \
  -w "\nHTTP Code: %{http_code}\n"

# 4.2 API超时模拟
# 临时修改超时配置进行测试
export STORY_GENERATION_TIMEOUT=1000  # 1秒超时
curl -X POST http://localhost:5000/api/generate-story \
  -H "Content-Type: application/json" \
  -d '{"topic": "复杂的多线程故事", "turnIndex": 0}' \
  -w "\nResponse Time: %{time_total}s\n"

# 4.3 API Key失效测试
export DEEPSEEK_API_KEY="invalid-key-12345"
curl -X POST http://localhost:5000/api/generate-story \
  -H "Content-Type: application/json" \
  -d '{"topic": "测试API失效降级", "turnIndex": 0}' \
  | jq '.metadata.mockMode'
```

**步骤5: 性能基线测试**
```bash
# 5.1 单请求性能测试
echo "📊 性能基线测试..."

# Mock模式性能
time curl -X POST http://localhost:5000/api/generate-story \
  -H "Content-Type: application/json" \
  -d '{"topic": "性能测试故事", "turnIndex": 0}' \
  -o /dev/null -s

# 5.2 并发性能测试 (使用ab工具)
ab -n 50 -c 5 -p story_payload.json -T application/json \
  http://localhost:5000/api/generate-story

# 创建测试载荷文件
echo '{"topic": "并发测试故事", "turnIndex": 0}' > story_payload.json

# 5.3 内存和CPU监控
echo "💻 系统资源监控..."
# 在后台启动监控
top -b -n1 | grep node
ps aux | grep node | grep -v grep
```

#### 4.2.3 通过标准

| 验证项目 | Mock模式标准 | 真实API模式标准 | 验证方法 |
|----------|--------------|-----------------|----------|
| **响应时间** | < 2秒 | < 12秒 (P95) | `time` 命令计时 |
| **故事长度** | ≥ 500字符 | ≥ 500字符 | 字符计数 |
| **选择数量** | 2-4个 | 2-4个 | `choices.length` |
| **中文内容** | 包含中文字符 | 包含中文字符 | 正则表达式检查 |
| **儿童适宜** | 无不当内容 | 无不当内容 | 关键词过滤 |
| **结构完整** | JSON格式正确 | JSON格式正确 | `jq` 解析测试 |
| **追踪信息** | 包含traceId | 包含traceId和phaseTimings | 元数据检查 |
| **异常处理** | 返回fallback内容 | 降级到Mock模式 | 错误场景测试 |

#### 4.2.4 记录输出示例

**Mock模式响应示例**:
```json
{
  "story": "小兔子乘坐着闪闪发光的火箭，穿过星空来到了神秘的月球...(总共527字符)",
  "choices": [
    "探索月球洞穴的秘密",
    "收集月球上的宝石",
    "寻找月球上的朋友"
  ],
  "isEnding": false,
  "metadata": {
    "traceId": "story_20250926_181205_abc123",
    "mockMode": true,
    "phaseTimings": {
      "generation": 145,
      "validation": 23,
      "total": 168
    },
    "turnIndex": 0,
    "topic": "小兔子的太空冒险"
  }
}
```

**性能测试结果示例**:
```
📊 Story Generation Performance Report
=====================================
🕐 Mock Mode Average: 0.15s
🕐 Real API P50: 3.2s, P95: 8.7s
📊 Concurrency Test: 5 concurrent users, 0 failures
💾 Memory Usage: ~45MB per request
🔄 Success Rate: 100% (Mock), 98% (Real API)
```

---

### 4.3 Scenario C: StoryTree模式与高级功能测试 🌳

#### 4.3.1 测试目标
验证故事树完整生成功能、高级模式特性以及降级机制的有效性

#### 4.3.2 测试步骤

**步骤1: 基础故事树生成测试**
```bash
# 1.1 基础模式故事树生成
echo "🌳 测试基础故事树模式..."

curl -X POST http://localhost:5000/api/generate-full-story \
  -H "Content-Type: application/json" \
  -d '{
    "topic": "魔法森林的秘密",
    "mode": "basic"
  }' \
  -w "\n⏱️ Response Time: %{time_total}s\n" \
  > story_tree_basic.json

# 1.2 验证故事树结构
cat > validate_story_tree.js << 'EOF'
const fs = require('fs');

function validateStoryTree(filename) {
  const data = JSON.parse(fs.readFileSync(filename, 'utf8'));
  const tree = data.storyTree || data;

  console.log(`🔍 验证故事树: ${filename}`);

  // 检查根节点
  if (!tree.root) {
    console.log('❌ 缺少根节点');
    return false;
  }

  // 递归验证节点结构
  function validateNode(node, depth = 0, path = 'root') {
    const prefix = '  '.repeat(depth);
    console.log(`${prefix}📍 ${path}: ${node.content?.substring(0, 50)}...`);

    const checks = {
      '内容存在': !!node.content,
      '长度达标': (node.content?.length || 0) >= 300,
      '选择合理': !node.choices || (node.choices.length >= 2 && node.choices.length <= 4)
    };

    Object.entries(checks).forEach(([check, passed]) => {
      console.log(`${prefix}${passed ? '✅' : '❌'} ${check}`);
    });

    // 递归检查子节点
    if (node.choices && !node.isEnding) {
      node.choices.forEach((choice, index) => {
        if (choice.nextNode) {
          validateNode(choice.nextNode, depth + 1, `${path}.${index}`);
        }
      });
    }

    return Object.values(checks).every(Boolean);
  }

  return validateNode(tree.root);
}

// 验证生成的故事树
validateStoryTree('story_tree_basic.json');
EOF

node validate_story_tree.js

# 1.3 计算故事树统计信息
jq -r '
  def count_nodes(node):
    1 + (
      if node.choices then
        [node.choices[] | select(.nextNode) | count_nodes(.nextNode)] | add // 0
      else 0 end
    );

  def count_endings(node):
    if node.isEnding then 1
    elif node.choices then
      [node.choices[] | select(.nextNode) | count_endings(.nextNode)] | add // 0
    else 0 end;

  "📊 故事树统计:",
  "🌳 总节点数: \(count_nodes(.storyTree.root))",
  "🎯 结局数量: \(count_endings(.storyTree.root))",
  "📏 最大深度: 3 (预期)"
' story_tree_basic.json
```

**步骤2: 高级模式测试**
```bash
# 2.1 高级模式故事树生成
echo "🚀 测试高级故事树模式..."

curl -X POST http://localhost:5000/api/generate-full-story \
  -H "Content-Type: application/json" \
  -d '{
    "topic": "星际探险家的奇幻之旅",
    "mode": "advanced",
    "advancedOptions": {
      "includeScientificElements": true,
      "educationalThemes": ["友谊", "勇气", "科学探索"],
      "complexityLevel": "high"
    }
  }' \
  -w "\n⏱️ Response Time: %{time_total}s\n" \
  > story_tree_advanced.json

# 2.2 对比基础模式和高级模式差异
echo "📋 模式对比分析..."
cat > compare_modes.js << 'EOF'
const fs = require('fs');

function analyzeStoryTree(filename, mode) {
  const data = JSON.parse(fs.readFileSync(filename, 'utf8'));
  const tree = data.storyTree || data;

  function analyzeNode(node) {
    const analysis = {
      contentLength: node.content?.length || 0,
      hasScientificElements: /科学|实验|发现|研究/.test(node.content || ''),
      hasEducationalContent: /友谊|勇气|帮助|学习/.test(node.content || ''),
      choiceCount: node.choices?.length || 0
    };

    if (node.choices && !node.isEnding) {
      const childAnalyses = node.choices
        .filter(choice => choice.nextNode)
        .map(choice => analyzeNode(choice.nextNode));

      analysis.totalNodes = 1 + childAnalyses.reduce((sum, child) => sum + child.totalNodes, 0);
      analysis.avgContentLength = childAnalyses.length > 0
        ? (analysis.contentLength + childAnalyses.reduce((sum, child) => sum + child.contentLength, 0)) / (childAnalyses.length + 1)
        : analysis.contentLength;
    } else {
      analysis.totalNodes = 1;
      analysis.avgContentLength = analysis.contentLength;
    }

    return analysis;
  }

  const analysis = analyzeNode(tree.root);

  console.log(`\n📊 ${mode}模式分析:`);
  console.log(`🌳 总节点数: ${analysis.totalNodes}`);
  console.log(`📝 平均内容长度: ${Math.round(analysis.avgContentLength)} 字符`);
  console.log(`🔬 科学元素: ${analysis.hasScientificElements ? '✅' : '❌'}`);
  console.log(`📚 教育内容: ${analysis.hasEducationalContent ? '✅' : '❌'}`);

  return analysis;
}

const basicAnalysis = analyzeStoryTree('story_tree_basic.json', '基础');
const advancedAnalysis = analyzeStoryTree('story_tree_advanced.json', '高级');

console.log('\n🔄 模式对比:');
console.log(`📈 内容丰富度提升: ${Math.round((advancedAnalysis.avgContentLength / basicAnalysis.avgContentLength - 1) * 100)}%`);
console.log(`🎯 节点数量差异: ${advancedAnalysis.totalNodes - basicAnalysis.totalNodes}`);
EOF

node compare_modes.js
```

**步骤3: 前端StoryTree界面测试**
```bash
# 3.1 启动前端服务
npm run dev:frontend &
sleep 15

# 3.2 使用Playwright进行E2E测试
cat > tests/story-tree-e2e.spec.js << 'EOF'
const { test, expect } = require('@playwright/test');

test.describe('StoryTree Mode E2E Tests', () => {
  test('完整故事树交互流程', async ({ page }) => {
    // 导航到故事树页面
    await page.goto('http://localhost:3000');
    await page.click('button:has-text("故事树模式")');

    // 输入故事主题
    await page.fill('input[placeholder*="主题"]', '勇敢的小熊猫');
    await page.click('button:has-text("开始生成")');

    // 等待故事树生成
    await page.waitForSelector('.story-tree-container', { timeout: 30000 });

    // 验证故事树结构
    const nodes = await page.locator('.story-node').count();
    expect(nodes).toBeGreaterThan(7); // 至少8个节点(2×2×2)

    // 测试节点交互
    await page.click('.story-node:first-child');
    await expect(page.locator('.story-content')).toBeVisible();

    // 选择第一个分支
    await page.click('.choice-button:first-child');
    await page.waitForTimeout(1000);

    // 验证路径高亮
    const highlightedNodes = await page.locator('.story-node.active').count();
    expect(highlightedNodes).toBeGreaterThan(0);

    // 继续选择直到结局
    for (let i = 0; i < 2; i++) {
      const choiceButtons = page.locator('.choice-button');
      const buttonCount = await choiceButtons.count();
      if (buttonCount > 0) {
        await choiceButtons.first().click();
        await page.waitForTimeout(1000);
      }
    }

    // 验证到达结局
    await expect(page.locator('.story-ending')).toBeVisible();

    // 测试重新开始功能
    await page.click('button:has-text("重新开始")');
    await expect(page.locator('.story-tree-container')).toBeVisible();
  });

  test('故事树模式降级处理', async ({ page }) => {
    // 模拟API错误场景
    await page.route('**/api/generate-full-story', route => {
      route.fulfill({
        status: 500,
        body: JSON.stringify({ error: 'API temporarily unavailable' })
      });
    });

    await page.goto('http://localhost:3000');
    await page.click('button:has-text("故事树模式")');
    await page.fill('input[placeholder*="主题"]', '降级测试故事');
    await page.click('button:has-text("开始生成")');

    // 验证降级提示
    await expect(page.locator('.degradation-notice')).toBeVisible();
    await expect(page.locator('text=切换到基础模式')).toBeVisible();
  });
});
EOF

# 运行Playwright测试
npx playwright test tests/story-tree-e2e.spec.js --headed
```

**步骤4: 降级机制测试**
```bash
# 4.1 API服务中断模拟
echo "🔧 测试故事树降级机制..."

# 临时设置无效API Key触发降级
export DEEPSEEK_API_KEY="invalid-key-for-degradation-test"

# 测试高级模式降级到基础模式
curl -X POST http://localhost:5000/api/generate-full-story \
  -H "Content-Type: application/json" \
  -d '{
    "topic": "降级测试故事",
    "mode": "advanced"
  }' | jq '{
    degraded: .metadata.degraded,
    actualMode: .metadata.actualMode,
    fallbackReason: .metadata.fallbackReason
  }'

# 4.2 超时降级测试
export STORY_GENERATION_TIMEOUT=2000  # 2秒超时
curl -X POST http://localhost:5000/api/generate-full-story \
  -H "Content-Type: application/json" \
  -d '{
    "topic": "复杂的多线程故事需要长时间生成",
    "mode": "advanced"
  }' \
  -w "\n⏱️ Total Time: %{time_total}s\n" | jq '.metadata'

# 4.3 部分失败处理测试
# 模拟故事树生成过程中部分节点失败的情况
curl -X POST http://localhost:5000/api/generate-full-story \
  -H "Content-Type: application/json" \
  -d '{
    "topic": "部分节点失败测试",
    "mode": "basic",
    "testOptions": {
      "simulatePartialFailure": true,
      "failureRate": 0.3
    }
  }' | jq '{
    totalNodes: (.storyTree | length),
    failedNodes: (.metadata.failures | length),
    fallbacksUsed: .metadata.fallbacksUsed
  }'
```

#### 4.3.3 通过标准

| 验证维度 | 基础模式标准 | 高级模式标准 | 降级标准 |
|----------|--------------|--------------|----------|
| **故事树结构** | 2×2×2完整树(8结局) | 2×2×2或更复杂结构 | 最少2×2×1结构 |
| **内容质量** | 每节点≥300字 | 每节点≥500字 | 降级后≥200字 |
| **生成时间** | < 15秒 | < 30秒 | < 10秒(降级) |
| **教育元素** | 基础道德教育 | 科学知识+品格培养 | 保持基础教育意义 |
| **前端展示** | 树状可视化正常 | 增强交互效果 | 降级提示清晰 |
| **异常处理** | 优雅降级 | 自动回退到基础模式 | 用户友好错误信息 |

#### 4.3.4 记录输出

**故事树结构示例**:
```json
{
  "storyTree": {
    "root": {
      "content": "在一个充满魔法的森林里，小精灵艾拉发现了一扇神秘的门...",
      "choices": [
        {
          "text": "推开神秘之门",
          "nextNode": {
            "content": "门后是一个闪闪发光的水晶洞穴...",
            "choices": [
              { "text": "收集水晶", "nextNode": {...} },
              { "text": "继续探索", "nextNode": {...} }
            ]
          }
        },
        {
          "text": "寻找其他路径",
          "nextNode": {
            "content": "艾拉沿着蜿蜒的小径走进了更深的森林...",
            "choices": [...]
          }
        }
      ]
    }
  },
  "metadata": {
    "mode": "advanced",
    "totalNodes": 15,
    "endings": 8,
    "generationTime": "23.4s",
    "educationalElements": ["科学探索", "友谊合作", "环境保护"]
  }
}
```

---

### 4.4 Scenario D: 管理接口与审计功能测试 📊

#### 4.4.1 测试目标
验证后台管理API的性能表现、数据审计完整性以及大数据量场景下的系统稳定性

#### 4.4.2 测试步骤

**步骤1: 管理接口基础功能测试**
```bash
# 1.1 系统统计接口测试
echo "📊 测试管理统计接口..."

curl -X GET "http://localhost:5000/api/admin/stats" \
  -H "Authorization: Bearer admin-token" \
  -w "\n⏱️ Response Time: %{time_total}s\n" | jq '{
    totalStories: .totalStories,
    todayStories: .todayStories,
    averageLength: .averageLength,
    topThemes: .topThemes
  }'

# 1.2 日志查询接口测试
echo "📋 测试日志查询接口..."

# 基础日志查询
curl -X GET "http://localhost:5000/api/admin/logs?page=1&limit=10" \
  -H "Authorization: Bearer admin-token" \
  -w "\n⏱️ Response Time: %{time_total}s\n" | jq '{
    total: .total,
    page: .page,
    count: (.logs | length)
  }'

# 日期范围查询
START_DATE=$(date -d "1 week ago" +%Y-%m-%d)
END_DATE=$(date +%Y-%m-%d)

curl -X GET "http://localhost:5000/api/admin/logs?startDate=${START_DATE}&endDate=${END_DATE}&level=error" \
  -H "Authorization: Bearer admin-token" \
  -w "\n⏱️ Response Time: %{time_total}s\n" | jq '.logs | length'

# 1.3 故事管理接口测试
echo "📚 测试故事管理接口..."

# 分页查询所有故事
curl -X GET "http://localhost:5000/api/admin/stories?page=1&limit=20&sortBy=created_at&order=desc" \
  -H "Authorization: Bearer admin-token" | jq '{
    total: .total,
    pages: .pages,
    stories: (.stories | length)
  }'

# 按主题筛选
curl -X GET "http://localhost:5000/api/admin/stories?theme=冒险&limit=5" \
  -H "Authorization: Bearer admin-token" | jq '.stories[].metadata.theme'
```

**步骤2: 性能压力测试**
```bash
# 2.1 准备测试数据
echo "🗄️ 准备大量测试数据..."

cat > generate_test_data.js << 'EOF'
const { MongoClient } = require('mongodb');

async function generateTestData() {
  const client = new MongoClient('mongodb://localhost:27017');
  await client.connect();
  const db = client.db('storyapp_test');
  const collection = db.collection('stories');

  // 生成1000条测试故事记录
  const stories = [];
  const themes = ['冒险', '科幻', '童话', '教育', '友谊'];

  for (let i = 0; i < 1000; i++) {
    const story = {
      title: `测试故事${i + 1}`,
      content: JSON.stringify({
        story: `这是第${i + 1}个测试故事内容...`.repeat(10),
        choices: [`选择A${i}`, `选择B${i}`, `选择C${i}`]
      }),
      created_at: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000),
      metadata: {
        theme: themes[i % themes.length],
        topic: `测试主题${i + 1}`,
        sessionId: `session-${Math.floor(i / 10)}`,
        userAgent: 'test-agent',
        responseTime: Math.floor(Math.random() * 5000) + 1000
      }
    };
    stories.push(story);
  }

  await collection.deleteMany({}); // 清空现有测试数据
  await collection.insertMany(stories);

  // 创建必要的索引
  await collection.createIndex({ created_at: -1 });
  await collection.createIndex({ 'metadata.theme': 1 });
  await collection.createIndex({ 'metadata.sessionId': 1 });
  await collection.createIndex({ title: 'text' });

  console.log(`✅ 已生成${stories.length}条测试数据`);
  await client.close();
}

generateTestData().catch(console.error);
EOF

node generate_test_data.js

# 2.2 管理接口性能测试
echo "⚡ 执行性能压力测试..."

# 统计接口并发测试
ab -n 100 -c 10 \
  -H "Authorization: Bearer admin-token" \
  http://localhost:5000/api/admin/stats

# 分页查询性能测试
ab -n 200 -c 20 \
  -H "Authorization: Bearer admin-token" \
  "http://localhost:5000/api/admin/stories?page=1&limit=50"

# 大数据量分页测试 (测试最后几页的性能)
for page in 1 10 20; do
  echo "📄 测试第${page}页性能..."
  time curl -X GET "http://localhost:5000/api/admin/stories?page=${page}&limit=50" \
    -H "Authorization: Bearer admin-token" \
    -o /dev/null -s
done
```

**步骤3: 数据导出与清理功能测试**
```bash
# 3.1 数据导出功能测试
echo "📤 测试数据导出功能..."

# JSON格式导出
curl -X GET "http://localhost:5000/api/admin/export?format=json&startDate=2025-09-01" \
  -H "Authorization: Bearer admin-token" \
  -o export_test.json

# 验证导出文件
echo "📋 验证导出数据..."
echo "导出记录数: $(jq '. | length' export_test.json)"
echo "文件大小: $(ls -lh export_test.json | awk '{print $5}')"

# CSV格式导出测试
curl -X GET "http://localhost:5000/api/admin/export?format=csv&limit=100" \
  -H "Authorization: Bearer admin-token" \
  -o export_test.csv

echo "CSV行数: $(wc -l < export_test.csv)"

# 3.2 数据清理功能测试
echo "🧹 测试数据清理功能..."

# 清理30天前的数据 (测试模式)
curl -X POST "http://localhost:5000/api/admin/cleanup" \
  -H "Authorization: Bearer admin-token" \
  -H "Content-Type: application/json" \
  -d '{
    "days": 30,
    "dryRun": true
  }' | jq '{
    toDelete: .toDelete,
    estimatedSize: .estimatedSize,
    dryRun: .dryRun
  }'

# 清理无效会话数据
curl -X POST "http://localhost:5000/api/admin/cleanup-sessions" \
  -H "Authorization: Bearer admin-token" \
  -d '{"dryRun": true}' | jq '.'
```

**步骤4: 数据库性能分析**
```bash
# 4.1 MongoDB索引使用分析
echo "🔍 分析数据库索引使用情况..."

cat > analyze_db_performance.js << 'EOF'
const { MongoClient } = require('mongodb');

async function analyzePerformance() {
  const client = new MongoClient('mongodb://localhost:27017');
  await client.connect();
  const db = client.db('storyapp_test');
  const collection = db.collection('stories');

  console.log('📊 数据库性能分析报告');
  console.log('='.repeat(40));

  // 1. 集合统计信息
  const stats = await db.command({ collStats: 'stories' });
  console.log(`📄 文档总数: ${stats.count}`);
  console.log(`💾 存储大小: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
  console.log(`📇 索引大小: ${(stats.totalIndexSize / 1024 / 1024).toFixed(2)} MB`);

  // 2. 索引列表
  const indexes = await collection.indexes();
  console.log('\n📇 索引列表:');
  indexes.forEach(index => {
    console.log(`  - ${index.name}: ${JSON.stringify(index.key)}`);
  });

  // 3. 查询性能测试
  console.log('\n⚡ 查询性能测试:');

  const queries = [
    { name: '按时间排序', query: {}, sort: { created_at: -1 }, limit: 20 },
    { name: '主题筛选', query: { 'metadata.theme': '冒险' }, limit: 20 },
    { name: '文本搜索', query: { $text: { $search: '测试' } }, limit: 20 },
    { name: '会话查询', query: { 'metadata.sessionId': 'session-1' } }
  ];

  for (const { name, query, sort, limit } of queries) {
    const start = Date.now();
    await collection.find(query).sort(sort || {}).limit(limit || 10).toArray();
    const duration = Date.now() - start;
    console.log(`  ${name}: ${duration}ms`);
  }

  // 4. 聚合查询性能
  console.log('\n📈 聚合查询性能:');

  const aggregations = [
    {
      name: '主题统计',
      pipeline: [
        { $group: { _id: '$metadata.theme', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]
    },
    {
      name: '每日创建数量',
      pipeline: [
        { $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$created_at' } },
          count: { $sum: 1 }
        }},
        { $sort: { '_id': -1 } },
        { $limit: 7 }
      ]
    }
  ];

  for (const { name, pipeline } of aggregations) {
    const start = Date.now();
    await collection.aggregate(pipeline).toArray();
    const duration = Date.now() - start;
    console.log(`  ${name}: ${duration}ms`);
  }

  await client.close();
}

analyzePerformance().catch(console.error);
EOF

node analyze_db_performance.js

# 4.2 慢查询分析
echo "🐌 检查慢查询..."

# 启用MongoDB慢查询分析
mongo storyapp_test --eval "
  db.setProfilingLevel(2, { slowms: 100 });
  print('✅ 慢查询分析已启用 (slowms: 100)');
"

# 执行一些查询操作后检查慢查询
sleep 5

mongo storyapp_test --eval "
  db.system.profile.find().limit(5).sort({ ts: -1 }).forEach(printjson);
"
```

#### 4.4.3 通过标准

| 性能指标 | 目标值 | 测试方法 | 验证命令 |
|----------|--------|----------|----------|
| **统计接口响应时间** | P95 < 2s | ab压力测试 | `ab -n 100 -c 10` |
| **分页查询性能** | P95 < 1s | 多页面测试 | `time curl` |
| **大数据量查询** | 1000条记录 < 3s | MongoDB聚合 | 性能分析脚本 |
| **数据导出速度** | 1MB/s | 文件导出测试 | 文件大小/耗时 |
| **索引命中率** | > 90% | MongoDB Profile | 慢查询分析 |
| **并发处理能力** | 20并发无错误 | 压力测试 | ab成功率 |

#### 4.4.4 记录输出

**性能测试报告示例**:
```
📊 管理接口性能测试报告
==============================
⏱️  统计接口: P50=0.3s, P95=0.8s, P99=1.2s
📄 分页查询: P50=0.2s, P95=0.6s, P99=1.1s
📤 数据导出: 1000条记录/2.3s (435条/s)
🔍 索引命中: 94% (6%扫描)
⚡ 并发处理: 20用户/0失败
💾 内存使用: 基线45MB → 峰值78MB
```

---

### 4.5 Scenario E: 异常处理与降级机制测试 🛡️

#### 4.5.1 测试目标
验证系统在各种异常情况下的鲁棒性、降级机制的有效性以及错误恢复能力

#### 4.5.2 测试步骤

**步骤1: 数据库连接异常测试**
```bash
# 1.1 MongoDB连接中断模拟
echo "🗄️ 测试数据库连接中断场景..."

# 记录正常状态
curl -s http://localhost:5000/api/health | jq '.database'
curl -s http://localhost:5000/api/ready | jq '.status'

# 停止MongoDB服务
docker stop storyapp-mongo-1 || sudo systemctl stop mongod

# 等待连接池检测到断开
sleep 10

# 测试健康检查响应
echo "🏥 检查健康状态 (数据库断开):"
curl -s http://localhost:5000/api/health | jq '{
  status: .status,
  database: .database,
  degraded: .degraded
}'

curl -s http://localhost:5000/api/ready | jq '{
  status: .status,
  checks: .checks
}'

# 测试API降级行为
echo "🔧 测试API降级行为:"
curl -X POST http://localhost:5000/api/generate-story \
  -H "Content-Type: application/json" \
  -d '{"topic": "数据库断开测试故事", "turnIndex": 0}' | jq '{
    story: (.story | length),
    degraded: .metadata.degraded,
    fallbackMode: .metadata.fallbackMode
  }'

# 尝试保存故事 (应该失败但优雅处理)
curl -X POST http://localhost:5000/api/save-story \
  -H "Content-Type: application/json" \
  -d '{
    "title": "测试故事",
    "content": "故事内容",
    "metadata": {"theme": "测试"}
  }' \
  -w "\nHTTP Code: %{http_code}\n" | jq '.error'

# 恢复MongoDB服务
docker start storyapp-mongo-1 || sudo systemctl start mongod
sleep 10

# 验证自动恢复
echo "🔄 验证服务自动恢复:"
curl -s http://localhost:5000/api/health | jq '.database'
```

**步骤2: AI API服务异常测试**
```bash
# 2.1 API Key无效测试
echo "🤖 测试AI API异常处理..."

# 保存原始API Key
ORIGINAL_KEY=$DEEPSEEK_API_KEY

# 设置无效API Key
export DEEPSEEK_API_KEY="invalid-key-12345"

# 重启后端服务加载新配置
pkill -f "node.*backend" && sleep 2
npm run dev:backend &
sleep 10

# 测试降级到Mock模式
echo "🎭 测试Mock模式降级:"
curl -X POST http://localhost:5000/api/generate-story \
  -H "Content-Type: application/json" \
  -d '{"topic": "API失效降级测试", "turnIndex": 0}' | jq '{
    mockMode: .metadata.mockMode,
    fallbackReason: .metadata.fallbackReason,
    storyLength: (.story | length)
  }'

# 2.2 API超时测试
echo "⏰ 测试API超时处理..."

# 临时设置极短超时时间
export STORY_GENERATION_TIMEOUT=1000  # 1秒

# 恢复有效API Key但保持短超时
export DEEPSEEK_API_KEY=$ORIGINAL_KEY

pkill -f "node.*backend" && sleep 2
npm run dev:backend &
sleep 10

# 测试超时降级
curl -X POST http://localhost:5000/api/generate-story \
  -H "Content-Type: application/json" \
  -d '{"topic": "超时测试-需要复杂推理的科学故事", "turnIndex": 0}' \
  -w "\nTotal Time: %{time_total}s\n" | jq '{
    timeout: .metadata.timeout,
    fallback: .metadata.fallback,
    responseTime: .metadata.responseTime
  }'

# 恢复正常配置
export STORY_GENERATION_TIMEOUT=30000
export DEEPSEEK_API_KEY=$ORIGINAL_KEY
```

**步骤3: 限流机制测试**
```bash
# 3.1 速率限制测试
echo "🚦 测试API限流机制..."

# 获取当前限流配置
curl -s http://localhost:5000/api/health | jq '.rateLimit'

# 快速发送请求触发限流
echo "🔥 快速发送请求触发限流..."
for i in {1..150}; do
  curl -X POST http://localhost:5000/api/generate-story \
    -H "Content-Type: application/json" \
    -d "{\"topic\": \"限流测试${i}\", \"turnIndex\": 0}" \
    -w "%{http_code} " \
    -o /dev/null -s &
done
wait

echo -e "\n"

# 检查限流状态
curl -s http://localhost:5000/metrics | grep rate_limit

# 单个请求验证限流响应
echo "🛑 验证限流响应:"
curl -X POST http://localhost:5000/api/generate-story \
  -H "Content-Type: application/json" \
  -d '{"topic": "限流后测试", "turnIndex": 0}' \
  -w "\nHTTP Code: %{http_code}\nHeaders: %{header_json}\n" | head -20

# 3.2 限流恢复测试
echo "⏳ 等待限流窗口重置..."
sleep 70  # 等待限流窗口重置 (假设窗口为60秒)

echo "🔄 测试限流自动恢复:"
curl -X POST http://localhost:5000/api/generate-story \
  -H "Content-Type: application/json" \
  -d '{"topic": "限流恢复测试", "turnIndex": 0}' \
  -w "\nHTTP Code: %{http_code}\n" | jq '.metadata.rateLimitStatus'
```

**步骤4: 内存和资源压力测试**
```bash
# 4.1 内存泄漏检测
echo "💾 内存泄漏和资源压力测试..."

# 记录初始内存使用
echo "📊 初始资源状态:"
ps aux | grep node | grep backend | awk '{print "CPU: " $3 "%, Memory: " $4 "%"}'
free -h

# 创建大量并发请求
echo "🔥 创建资源压力..."
cat > stress_test.js << 'EOF'
const axios = require('axios');

async function stressTest() {
  const promises = [];
  const startTime = Date.now();

  // 创建100个并发请求
  for (let i = 0; i < 100; i++) {
    const promise = axios.post('http://localhost:5000/api/generate-story', {
      topic: `压力测试故事 ${i}`,
      turnIndex: 0
    }).catch(err => ({ error: err.response?.status || err.message }));

    promises.push(promise);
  }

  const results = await Promise.all(promises);
  const endTime = Date.now();

  const successful = results.filter(r => !r.error).length;
  const errors = results.filter(r => r.error).length;

  console.log(`✅ 成功请求: ${successful}`);
  console.log(`❌ 失败请求: ${errors}`);
  console.log(`⏱️  总耗时: ${(endTime - startTime) / 1000}s`);
  console.log(`⚡ 平均响应时间: ${(endTime - startTime) / results.length}ms`);
}

stressTest().catch(console.error);
EOF

node stress_test.js

# 检查压力测试后的资源状态
sleep 5
echo "📊 压力测试后资源状态:"
ps aux | grep node | grep backend | awk '{print "CPU: " $3 "%, Memory: " $4 "%"}'
free -h

# 4.2 垃圾回收和内存清理验证
echo "🗑️ 触发垃圾回收..."
kill -USR1 $(pgrep -f "node.*backend")  # 触发Node.js内存dump (如果配置了)

# 等待GC
sleep 10

echo "📊 GC后资源状态:"
ps aux | grep node | grep backend | awk '{print "CPU: " $3 "%, Memory: " $4 "%"}'
```

**步骤5: 网络错误和重试机制测试**
```bash
# 5.1 网络连接错误模拟
echo "🌐 测试网络错误处理..."

# 使用iptables阻断外部API连接 (需要sudo权限)
# sudo iptables -A OUTPUT -d api.deepseek.com -j DROP

# 或者修改hosts文件模拟DNS解析失败
echo "127.0.0.1 api.deepseek.com" | sudo tee -a /etc/hosts

# 测试网络错误处理
curl -X POST http://localhost:5000/api/generate-story \
  -H "Content-Type: application/json" \
  -d '{"topic": "网络错误测试", "turnIndex": 0}' | jq '{
    networkError: .metadata.networkError,
    fallbackMode: .metadata.fallbackMode,
    retryAttempts: .metadata.retryAttempts
  }'

# 恢复网络配置
sudo sed -i '/api.deepseek.com/d' /etc/hosts
# sudo iptables -D OUTPUT -d api.deepseek.com -j DROP

# 5.2 重试机制验证
echo "🔄 验证重试机制..."

cat > test_retry_mechanism.js << 'EOF'
const axios = require('axios');

async function testRetryMechanism() {
  console.log('🔄 测试重试机制...');

  // 模拟间歇性网络错误的请求
  const response = await axios.post('http://localhost:5000/api/generate-story', {
    topic: '重试机制测试故事',
    turnIndex: 0,
    testOptions: {
      simulateIntermittentFailure: true,
      failureRate: 0.7  // 70%失败率测试重试
    }
  });

  console.log('📊 重试统计:');
  console.log(`🎯 最终成功: ${!!response.data.story}`);
  console.log(`🔄 重试次数: ${response.data.metadata?.retryCount || 0}`);
  console.log(`⏱️  总耗时: ${response.data.metadata?.totalTime || 'N/A'}ms`);
  console.log(`🛠️  降级触发: ${response.data.metadata?.fallbackTriggered || false}`);
}

testRetryMechanism().catch(console.error);
EOF

node test_retry_mechanism.js
```

#### 4.5.3 通过标准

| 异常场景 | 期望行为 | 验证标准 | 恢复时间 |
|----------|----------|----------|----------|
| **数据库断开** | 降级到只读模式 | /ready返回degraded状态 | < 30s自动检测 |
| **API Key无效** | 切换到Mock模式 | 返回fallback故事内容 | 立即切换 |
| **API超时** | 重试3次后降级 | timeout字段记录在metadata | < 5s降级决策 |
| **限流触发** | 返回429状态码 | 包含Retry-After头 | 按窗口自动恢复 |
| **内存压力** | 优雅降级性能 | 内存增长 < 100MB | GC后恢复 |
| **网络错误** | 自动重试机制 | 3次重试后Mock降级 | < 10s总耗时 |

#### 4.5.4 记录输出

**异常处理测试报告**:
```json
{
  "异常处理测试结果": {
    "数据库断开": {
      "检测时间": "8.3s",
      "降级状态": "degraded",
      "API可用性": "只读模式正常",
      "恢复时间": "12.1s"
    },
    "API服务异常": {
      "Mock降级": "✅ 立即生效",
      "故事质量": "✅ 保持标准",
      "用户体验": "✅ 无明显中断"
    },
    "限流机制": {
      "触发阈值": "100请求/分钟",
      "响应状态": "429 Too Many Requests",
      "恢复验证": "✅ 窗口重置后正常"
    },
    "资源压力": {
      "并发处理": "100并发/82成功",
      "内存峰值": "156MB (+65MB)",
      "GC恢复": "✅ 降至92MB"
    }
  }
}
```

---

### 4.6 Scenario F: 部署与运维流水线测试 🚀

#### 4.6.1 测试目标
验证CI/CD工作流程、Docker部署、生产环境配置以及运维脚本的完整性和可靠性

#### 4.6.2 测试步骤

**步骤1: CI/CD工作流验证**
```bash
# 1.1 本地CI流程模拟
echo "🔄 模拟CI/CD工作流程..."

# 代码质量检查
echo "📋 Step 1: 代码质量检查"
npm run lint 2>&1 | tee ci_lint.log
npm run type-check 2>&1 | tee ci_typecheck.log
npm run format:check 2>&1 | tee ci_format.log

# 单元测试执行
echo "🧪 Step 2: 单元测试"
npm run test:all 2>&1 | tee ci_test.log
npm run test:coverage 2>&1 | tee ci_coverage.log

# 构建验证
echo "🏗️ Step 3: 构建验证"
npm run build:all 2>&1 | tee ci_build.log

# E2E测试
echo "🎭 Step 4: E2E测试"
npm run test:e2e 2>&1 | tee ci_e2e.log

# 生成CI报告
cat > ci_report.json << EOF
{
  "timestamp": "$(date -Iseconds)",
  "commit": "$(git rev-parse HEAD)",
  "branch": "$(git branch --show-current)",
  "stages": {
    "lint": $([ -s ci_lint.log ] && echo "false" || echo "true"),
    "typecheck": $([ -s ci_typecheck.log ] && echo "false" || echo "true"),
    "format": $([ -s ci_format.log ] && echo "false" || echo "true"),
    "test": $(grep -q "Tests: .* passed" ci_test.log && echo "true" || echo "false"),
    "build": $(grep -q "Build completed" ci_build.log && echo "true" || echo "false"),
    "e2e": $(grep -q "All tests passed" ci_e2e.log && echo "true" || echo "false")
  },
  "coverage": $(grep -oP 'All files.*?(\d+\.\d+)' ci_coverage.log | tail -1 | grep -oP '\d+\.\d+' || echo "0")
}
EOF

echo "📊 CI流程结果:"
cat ci_report.json | jq '.'
```

**步骤2: Docker构建与部署测试**
```bash
# 2.1 多阶段Docker构建测试
echo "🐳 Docker构建测试..."

# 开发环境构建
docker build --target development -t storyapp:dev . 2>&1 | tee docker_dev.log

# 生产环境构建
docker build --target production -t storyapp:prod . 2>&1 | tee docker_prod.log

# 验证构建结果
echo "📊 Docker镜像信息:"
docker images | grep storyapp | awk '{print $1":"$2" "$7" "$6$7}'

# 2.2 容器启动测试
echo "🚀 容器启动测试..."

# 启动完整环境
docker compose -f docker-compose.prod.yml up -d 2>&1 | tee docker_startup.log

# 等待服务就绪
echo "⏳ 等待服务启动..."
for i in {1..30}; do
  if curl -f http://localhost:5000/api/health >/dev/null 2>&1; then
    echo "✅ 服务已就绪 (${i}s)"
    break
  fi
  sleep 1
done

# 容器健康检查
echo "🏥 容器健康状态:"
docker compose -f docker-compose.prod.yml ps
docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}"

# 2.3 生产环境验证测试
echo "🎯 生产环境功能验证..."

cat > production_smoke_test.js << 'EOF'
const axios = require('axios');

async function productionSmokeTest() {
  const baseURL = 'http://localhost:5000';
  const tests = [
    { name: '健康检查', url: '/api/health' },
    { name: '就绪检查', url: '/api/ready' },
    { name: '指标端点', url: '/metrics' },
    { name: 'API文档', url: '/api/docs' }
  ];

  console.log('🔍 生产环境冒烟测试...');

  for (const test of tests) {
    try {
      const start = Date.now();
      const response = await axios.get(`${baseURL}${test.url}`);
      const duration = Date.now() - start;
      console.log(`✅ ${test.name}: ${response.status} (${duration}ms)`);
    } catch (error) {
      console.log(`❌ ${test.name}: ${error.response?.status || error.message}`);
    }
  }

  // 核心功能测试
  try {
    const response = await axios.post(`${baseURL}/api/generate-story`, {
      topic: '生产环境测试故事',
      turnIndex: 0
    });
    console.log(`✅ 故事生成: 成功 (${response.data.story.length}字符)`);
  } catch (error) {
    console.log(`❌ 故事生成: ${error.response?.status || error.message}`);
  }
}

productionSmokeTest().catch(console.error);
EOF

node production_smoke_test.js
```

**步骤3: 环境配置和秘钥管理测试**
```bash
# 3.1 环境变量验证
echo "🔧 环境配置验证..."

# 检查必需的环境变量
cat > validate_env.js << 'EOF'
const requiredVars = [
  'NODE_ENV',
  'MONGODB_URI',
  'DEEPSEEK_API_KEY',
  'PORT'
];

const optionalVars = [
  'RATE_LIMIT_MAX_REQUESTS',
  'STORY_GENERATION_TIMEOUT',
  'LOG_LEVEL'
];

console.log('🔍 环境变量验证:');

requiredVars.forEach(varName => {
  const value = process.env[varName];
  if (value) {
    // 隐藏敏感信息
    const displayValue = varName.includes('KEY') || varName.includes('SECRET')
      ? `${value.substring(0, 8)}***`
      : value;
    console.log(`✅ ${varName}: ${displayValue}`);
  } else {
    console.log(`❌ ${varName}: 未设置`);
  }
});

console.log('\n📋 可选配置:');
optionalVars.forEach(varName => {
  const value = process.env[varName];
  if (value) {
    console.log(`✅ ${varName}: ${value}`);
  } else {
    console.log(`⚪ ${varName}: 使用默认值`);
  }
});
EOF

node validate_env.js

# 3.2 配置文件验证
echo "📄 配置文件完整性检查..."

# 检查必要的配置文件
CONFIG_FILES=(
  "package.json"
  "tsconfig.json"
  "docker-compose.yml"
  "docker-compose.prod.yml"
  "Dockerfile"
  ".env.example"
)

for file in "${CONFIG_FILES[@]}"; do
  if [ -f "$file" ]; then
    echo "✅ $file: 存在"
    # 验证JSON格式
    if [[ "$file" == *.json ]]; then
      if jq . "$file" >/dev/null 2>&1; then
        echo "  📋 JSON格式: 有效"
      else
        echo "  ❌ JSON格式: 无效"
      fi
    fi
  else
    echo "❌ $file: 缺失"
  fi
done
```

**步骤4: 备份与恢复测试**
```bash
# 4.1 数据备份测试
echo "💾 数据备份与恢复测试..."

# 创建测试数据
mongo storyapp --eval "
  db.stories.insertOne({
    title: '备份测试故事',
    content: JSON.stringify({story: '测试内容', choices: ['A', 'B']}),
    created_at: new Date(),
    metadata: {theme: '测试', backup_test: true}
  });
  print('✅ 测试数据已创建');
"

# 执行数据备份
mkdir -p backups
mongodump --db storyapp --out backups/$(date +%Y%m%d_%H%M%S) 2>&1 | tee backup.log

# 验证备份文件
BACKUP_DIR=$(ls -t backups/ | head -1)
echo "📦 备份文件:"
ls -la "backups/$BACKUP_DIR/storyapp/"

# 4.2 数据恢复测试
echo "🔄 数据恢复测试..."

# 备份当前数据
mongodump --db storyapp --out backups/before_restore

# 删除测试数据
mongo storyapp --eval "db.stories.deleteOne({title: '备份测试故事'})"

# 从备份恢复
mongorestore --db storyapp "backups/$BACKUP_DIR/storyapp" --drop

# 验证恢复结果
mongo storyapp --eval "
  const doc = db.stories.findOne({title: '备份测试故事'});
  if (doc) {
    print('✅ 数据恢复成功');
  } else {
    print('❌ 数据恢复失败');
  }
"
```

**步骤5: 监控和日志配置测试**
```bash
# 5.1 日志系统测试
echo "📝 日志系统测试..."

# 生成各种级别的日志
curl -X POST http://localhost:5000/api/test/log \
  -H "Content-Type: application/json" \
  -d '{"level": "info", "message": "部署测试日志"}' >/dev/null

# 检查日志输出
echo "📋 日志文件检查:"
if [ -f "logs/app.log" ]; then
  echo "✅ 应用日志: $(wc -l < logs/app.log) 行"
  tail -3 logs/app.log
else
  echo "⚪ 应用日志: 输出到控制台"
fi

# 5.2 监控指标测试
echo "📊 监控指标测试..."

# 获取Prometheus指标
curl -s http://localhost:5000/metrics > metrics_snapshot.txt

# 分析关键指标
echo "📈 关键指标快照:"
grep -E "(http_request_duration|story_generation|nodejs_heap)" metrics_snapshot.txt | head -10

# 验证自定义指标
echo "🎯 自定义指标验证:"
grep -E "(storyapp_|story_)" metrics_snapshot.txt | wc -l
```

#### 4.6.3 通过标准

| 部署阶段 | 验证项目 | 通过标准 | 验证方法 |
|----------|----------|----------|----------|
| **CI流程** | 代码质量检查 | 0错误，0警告 | lint, typecheck通过 |
| **构建阶段** | Docker镜像 | 构建成功，< 300MB | `docker images`检查 |
| **启动验证** | 服务就绪 | < 30s启动，健康检查通过 | 容器状态检查 |
| **功能验证** | 核心API | 故事生成成功 | 冒烟测试通过 |
| **配置管理** | 环境变量 | 必需变量完整，敏感信息保护 | 环境变量检查 |
| **数据安全** | 备份恢复 | 备份成功，恢复完整 | 数据一致性验证 |

#### 4.6.4 记录输出

**部署验证报告**:
```json
{
  "部署验证报告": {
    "时间戳": "2025-09-26T18:30:00Z",
    "Git信息": {
      "提交": "a1b2c3d",
      "分支": "main",
      "版本": "v1.0.0"
    },
    "CI流程": {
      "代码检查": "✅ 通过",
      "单元测试": "✅ 通过 (覆盖率: 85%)",
      "构建": "✅ 通过",
      "E2E测试": "✅ 通过"
    },
    "Docker部署": {
      "镜像大小": "245MB",
      "启动时间": "23s",
      "健康检查": "✅ 通过",
      "资源使用": "CPU: 12%, 内存: 128MB"
    },
    "生产验证": {
      "API可用性": "✅ 100%",
      "核心功能": "✅ 正常",
      "性能指标": "✅ 达标",
      "监控配置": "✅ 完整"
    }
  }
}
```

---

### 4.7 Scenario G: 监控告警与可观测性测试 📈

#### 4.7.1 测试目标
验证完整的可观测性系统，包括指标采集、日志审计、性能监控和告警机制的有效性

#### 4.7.2 测试步骤

**步骤1: Prometheus指标验证**
```bash
# 1.1 指标端点可访问性测试
echo "📊 Prometheus指标系统测试..."

# 基础指标验证
curl -s http://localhost:5000/metrics > prometheus_metrics.txt

echo "📋 指标端点状态:"
if [ -s prometheus_metrics.txt ]; then
  echo "✅ 指标端点可访问"
  echo "📏 指标数量: $(grep -c '^[^#]' prometheus_metrics.txt)"
else
  echo "❌ 指标端点不可访问"
  exit 1
fi

# 1.2 核心业务指标验证
echo "🎯 核心业务指标验证:"

BUSINESS_METRICS=(
  "storyapp_story_generation_total"
  "storyapp_story_generation_duration_seconds"
  "storyapp_story_generation_errors_total"
  "storyapp_api_requests_total"
  "storyapp_mock_mode_usage_total"
  "storyapp_database_operations_total"
)

for metric in "${BUSINESS_METRICS[@]}"; do
  if grep -q "^${metric}" prometheus_metrics.txt; then
    value=$(grep "^${metric}" prometheus_metrics.txt | head -1 | awk '{print $2}')
    echo "✅ $metric: $value"
  else
    echo "❌ $metric: 缺失"
  fi
done

# 1.3 系统资源指标验证
echo "💻 系统资源指标验证:"

SYSTEM_METRICS=(
  "nodejs_heap_size_used_bytes"
  "nodejs_heap_size_total_bytes"
  "process_cpu_user_seconds_total"
  "http_request_duration_seconds"
)

for metric in "${SYSTEM_METRICS[@]}"; do
  if grep -q "^${metric}" prometheus_metrics.txt; then
    echo "✅ $metric: 存在"
  else
    echo "❌ $metric: 缺失"
  fi
done
```

**步骤2: 指标数据完整性测试**
```bash
# 2.1 生成测试活动以产生指标数据
echo "🎬 生成测试活动..."

cat > generate_metrics_data.js << 'EOF'
const axios = require('axios');

async function generateMetricsData() {
  console.log('📈 生成指标测试数据...');

  const activities = [
    // 成功的故事生成请求
    { type: 'success', count: 10, topic: '成功测试故事' },
    // 失败的请求
    { type: 'error', count: 3, topic: '' },
    // Mock模式请求
    { type: 'mock', count: 5, topic: 'Mock模式测试', apiKey: '' }
  ];

  for (const activity of activities) {
    console.log(`🎯 执行${activity.type}测试 (${activity.count}次)`);

    // 临时设置API Key (用于Mock模式测试)
    if (activity.type === 'mock') {
      process.env.DEEPSEEK_API_KEY = '';
    } else {
      process.env.DEEPSEEK_API_KEY = 'sk-test-key';
    }

    const promises = [];
    for (let i = 0; i < activity.count; i++) {
      const promise = axios.post('http://localhost:5000/api/generate-story', {
        topic: activity.topic + ` ${i}`,
        turnIndex: 0
      }).catch(err => ({ error: true, status: err.response?.status }));

      promises.push(promise);
    }

    await Promise.all(promises);
    await new Promise(resolve => setTimeout(resolve, 1000)); // 间隔1秒
  }

  console.log('✅ 测试活动生成完成');
}

generateMetricsData().catch(console.error);
EOF

node generate_metrics_data.js

# 2.2 验证指标数据更新
sleep 5
curl -s http://localhost:5000/metrics > metrics_after_activity.txt

echo "📊 指标数据变化验证:"

# 比较活动前后的指标变化
cat > analyze_metrics_changes.js << 'EOF'
const fs = require('fs');

function parseMetrics(filename) {
  const content = fs.readFileSync(filename, 'utf8');
  const metrics = {};

  content.split('\n').forEach(line => {
    if (line.startsWith('storyapp_')) {
      const parts = line.split(' ');
      if (parts.length >= 2) {
        const name = parts[0];
        const value = parseFloat(parts[1]);
        if (!isNaN(value)) {
          metrics[name] = value;
        }
      }
    }
  });

  return metrics;
}

const beforeMetrics = parseMetrics('prometheus_metrics.txt');
const afterMetrics = parseMetrics('metrics_after_activity.txt');

console.log('📈 指标变化分析:');

Object.keys(afterMetrics).forEach(metric => {
  const before = beforeMetrics[metric] || 0;
  const after = afterMetrics[metric];
  const change = after - before;

  if (change > 0) {
    console.log(`📈 ${metric}: ${before} → ${after} (+${change})`);
  } else if (change < 0) {
    console.log(`📉 ${metric}: ${before} → ${after} (${change})`);
  }
});
EOF

node analyze_metrics_changes.js
```

**步骤3: 结构化日志验证**
```bash
# 3.1 日志格式和内容验证
echo "📝 结构化日志系统验证..."

# 生成各种类型的日志事件
curl -X POST http://localhost:5000/api/generate-story \
  -H "Content-Type: application/json" \
  -d '{"topic": "日志测试故事", "turnIndex": 0}' >/dev/null

# 检查日志输出格式
echo "📋 日志格式验证:"

# 从Docker容器获取日志
docker logs storyapp-backend-test --tail 20 > app_logs.txt 2>&1

# 验证日志结构
cat > validate_log_format.js << 'EOF'
const fs = require('fs');

function validateLogFormat() {
  if (!fs.existsSync('app_logs.txt')) {
    console.log('❌ 日志文件不存在');
    return;
  }

  const logs = fs.readFileSync('app_logs.txt', 'utf8').split('\n').filter(Boolean);
  console.log(`📄 日志条数: ${logs.length}`);

  const validLogs = logs.filter(log => {
    try {
      const parsed = JSON.parse(log);
      return parsed.timestamp && parsed.level && parsed.message;
    } catch {
      return false;
    }
  });

  console.log(`✅ 结构化日志: ${validLogs.length}/${logs.length}`);

  if (validLogs.length > 0) {
    const sample = JSON.parse(validLogs[0]);
    console.log('📋 日志样例:');
    console.log(`  时间戳: ${sample.timestamp}`);
    console.log(`  级别: ${sample.level}`);
    console.log(`  消息: ${sample.message.substring(0, 50)}...`);
    console.log(`  追踪ID: ${sample.traceId || 'N/A'}`);
  }

  // 检查不同日志级别
  const levels = validLogs.map(log => JSON.parse(log).level);
  const levelCounts = levels.reduce((acc, level) => {
    acc[level] = (acc[level] || 0) + 1;
    return acc;
  }, {});

  console.log('📊 日志级别分布:');
  Object.entries(levelCounts).forEach(([level, count]) => {
    console.log(`  ${level}: ${count}`);
  });
}

validateLogFormat();
EOF

node validate_log_format.js

# 3.2 日志审计功能测试
echo "🔍 日志审计功能测试..."

# 测试管理接口的日志查询
curl -X GET "http://localhost:5000/api/admin/logs?level=error&limit=10" \
  -H "Authorization: Bearer admin-token" | jq '{
    total: .total,
    errorCount: (.logs | length),
    recentErrors: [.logs[] | {timestamp: .timestamp, message: .message}]
  }'

# 测试日志导出功能
curl -X GET "http://localhost:5000/api/admin/logs/export?format=json&hours=24" \
  -H "Authorization: Bearer admin-token" \
  -o logs_export.json

echo "📤 日志导出验证:"
echo "导出记录数: $(jq '. | length' logs_export.json)"
echo "文件大小: $(ls -lh logs_export.json | awk '{print $5}')"
```

**步骤4: 告警机制测试**
```bash
# 4.1 告警规则配置验证
echo "🚨 告警机制测试..."

# 创建Prometheus告警规则文件
cat > alert_rules.yml << 'EOF'
groups:
  - name: storyapp_alerts
    rules:
      - alert: HighErrorRate
        expr: (rate(storyapp_story_generation_errors_total[5m]) / rate(storyapp_story_generation_total[5m])) > 0.1
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: "StoryApp error rate is high"
          description: "Error rate is {{ $value | humanizePercentage }}"

      - alert: HighLatency
        expr: histogram_quantile(0.95, rate(storyapp_story_generation_duration_seconds_bucket[5m])) > 15
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "StoryApp latency is high"
          description: "95th percentile latency is {{ $value }}s"

      - alert: ServiceDown
        expr: up{job="storyapp"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "StoryApp service is down"
EOF

echo "✅ 告警规则已配置"

# 4.2 人为触发告警条件
echo "🔥 触发告警条件测试..."

# 触发高错误率告警
echo "⚠️ 触发错误率告警..."
for i in {1..20}; do
  curl -X POST http://localhost:5000/api/generate-story \
    -H "Content-Type: application/json" \
    -d '{"topic": "", "turnIndex": 0}' >/dev/null 2>&1 &
done
wait

# 触发高延迟告警 (通过复杂请求)
echo "🐌 触发延迟告警..."
for i in {1..5}; do
  curl -X POST http://localhost:5000/api/generate-full-story \
    -H "Content-Type: application/json" \
    -d '{"topic": "非常复杂需要大量计算的科学探索故事包含多个分支", "mode": "advanced"}' >/dev/null 2>&1 &
done

# 等待指标更新
sleep 30
```

**步骤5: 性能监控和追踪**
```bash
# 5.1 性能监控数据验证
echo "📊 性能监控数据验证..."

# 获取性能指标快照
curl -s http://localhost:5000/metrics | grep -E "(duration|latency|rate)" > performance_metrics.txt

cat > analyze_performance_metrics.js << 'EOF'
const fs = require('fs');

function analyzePerformanceMetrics() {
  const content = fs.readFileSync('performance_metrics.txt', 'utf8');
  const lines = content.split('\n').filter(Boolean);

  console.log('📊 性能指标分析:');

  // 分析HTTP请求性能
  const httpDuration = lines.filter(line => line.includes('http_request_duration_seconds'));
  if (httpDuration.length > 0) {
    console.log('\n🌐 HTTP请求性能:');
    httpDuration.forEach(line => {
      const match = line.match(/le="([^"]+)"/);
      const value = line.split(' ')[1];
      if (match) {
        console.log(`  P${match[1]}: ${value} 请求`);
      }
    });
  }

  // 分析故事生成性能
  const storyDuration = lines.filter(line => line.includes('story_generation_duration'));
  if (storyDuration.length > 0) {
    console.log('\n📚 故事生成性能:');
    storyDuration.forEach(line => {
      const parts = line.split(' ');
      if (parts.length >= 2) {
        console.log(`  ${parts[0]}: ${parts[1]}`);
      }
    });
  }

  // 分析总体请求率
  const requestRate = lines.filter(line => line.includes('requests_total'));
  console.log('\n📈 请求统计:');
  requestRate.forEach(line => {
    const parts = line.split(' ');
    if (parts.length >= 2) {
      const metric = parts[0].replace(/_total$/, '');
      console.log(`  ${metric}: ${parts[1]} 次`);
    }
  });
}

analyzePerformanceMetrics();
EOF

node analyze_performance_metrics.js

# 5.2 分布式追踪验证
echo "🔍 请求追踪验证..."

# 发送带追踪的请求
TRACE_ID="trace_$(date +%s)_test"
curl -X POST http://localhost:5000/api/generate-story \
  -H "Content-Type: application/json" \
  -H "X-Trace-ID: $TRACE_ID" \
  -d '{"topic": "追踪测试故事", "turnIndex": 0}' | jq '.metadata.traceId'

# 在日志中查找追踪信息
echo "🔎 查找追踪记录:"
docker logs storyapp-backend-test 2>&1 | grep "$TRACE_ID" | head -3
```

#### 4.7.3 通过标准

| 监控维度 | 指标要求 | 验证标准 | 告警阈值 |
|----------|----------|----------|----------|
| **业务指标** | 故事生成成功率 | > 95% | < 90%告警 |
| **性能指标** | API响应时间P95 | < 12s | > 15s告警 |
| **系统指标** | 内存使用率 | < 80% | > 90%告警 |
| **错误率** | 5分钟错误率 | < 5% | > 10%告警 |
| **可用性** | 服务可用性 | > 99.9% | 1分钟不可达告警 |
| **日志完整性** | 结构化日志比例 | > 90% | 审计查询正常 |

#### 4.7.4 记录输出

**监控系统验证报告**:
```json
{
  "监控系统验证报告": {
    "时间戳": "2025-09-26T18:45:00Z",
    "Prometheus指标": {
      "端点状态": "✅ 可访问",
      "指标数量": 47,
      "业务指标": "✅ 完整 (6/6)",
      "系统指标": "✅ 完整 (4/4)"
    },
    "性能监控": {
      "HTTP请求P95": "2.3s",
      "故事生成P95": "8.7s",
      "错误率": "3.2%",
      "可用性": "99.8%"
    },
    "日志系统": {
      "结构化日志": "✅ 94%",
      "日志级别": "info(45), warn(8), error(3)",
      "审计查询": "✅ 正常",
      "导出功能": "✅ 正常"
    },
    "告警机制": {
      "规则配置": "✅ 完整",
      "告警测试": "✅ 触发正常",
      "通知渠道": "✅ 配置完成"
    },
    "追踪系统": {
      "请求追踪": "✅ 正常",
      "跨服务追踪": "✅ 支持",
      "日志关联": "✅ 完整"
    }
  }
}
```

---

## 5. 测试执行调度与自动化

### 5.1 测试执行频次规划

#### 开发阶段测试 (每次提交)
```bash
# 快速验证套件 (< 5分钟)
npm run test:quick

# 包含内容:
# - 代码格式和类型检查
# - 核心单元测试
# - 基础API测试
# - Docker构建验证
```

#### 集成测试 (每日构建)
```bash
# 完整测试套件 (< 30分钟)
npm run test:comprehensive

# 包含内容:
# - 场景A-C完整验证
# - 性能基线测试
# - 数据库集成测试
# - E2E核心流程
```

#### 发布前验证 (手动触发)
```bash
# 生产验收测试 (< 60分钟)
npm run test:production

# 包含内容:
# - 场景A-G全量验证
# - 压力测试和极限测试
# - 安全扫描
# - 生产环境部署验证
```

### 5.2 自动化测试框架

#### GitHub Actions工作流
```yaml
# .github/workflows/test-suite.yml
name: StoryApp Test Suite
on: [push, pull_request]

jobs:
  test-matrix:
    strategy:
      matrix:
        scenario: ['A', 'B', 'C', 'D', 'E', 'F', 'G']
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run Scenario ${{ matrix.scenario }}
        run: npm run test:scenario:${{ matrix.scenario }}
```

#### 本地测试命令
```bash
# 场景化测试命令
npm run test:scenario:A  # 命令执行反馈
npm run test:scenario:B  # 故事生成链路
npm run test:scenario:C  # StoryTree模式
npm run test:scenario:D  # 管理接口审计
npm run test:scenario:E  # 异常处理降级
npm run test:scenario:F  # 部署运维流水线
npm run test:scenario:G  # 监控告警系统
```

---

## 6. 快速开始指南

### 6.1 环境搭建 (5分钟)
```bash
# 1. 克隆项目
git clone <storyapp-repo>
cd storyapp

# 2. 安装依赖
npm install

# 3. 配置环境
cp .env.example .env.development.local
# 编辑 .env.development.local 添加你的 DEEPSEEK_API_KEY

# 4. 启动服务
docker compose up -d mongo
npm run dev:backend &
npm run dev:frontend &

# 5. 验证安装
npm run test:quick
```

### 6.2 核心测试命令
```bash
# 健康检查
curl http://localhost:5000/api/health

# 故事生成测试
curl -X POST http://localhost:5000/api/generate-story \
  -H "Content-Type: application/json" \
  -d '{"topic": "小兔子的冒险", "turnIndex": 0}'

# E2E测试
npm run test:e2e

# 性能测试
npm run test:performance
```

---

## 7. 故障排查手册

### 7.1 常见问题解决

| 问题 | 症状 | 解决方案 |
|------|------|----------|
| **API Key无效** | Mock模式启动 | 检查 `DEEPSEEK_API_KEY` 环境变量 |
| **数据库连接失败** | `/ready` 返回degraded | 确认MongoDB运行状态 |
| **端口占用** | 服务启动失败 | `lsof -i :5000` 查找占用进程 |
| **Docker构建失败** | 镜像构建错误 | 检查Docker资源和网络连接 |
| **E2E测试超时** | Playwright测试失败 | 增加超时时间或检查服务状态 |

### 7.2 日志调试
```bash
# 查看实时日志
docker logs -f storyapp-backend
docker logs -f storyapp-mongo

# 调试模式启动
DEBUG=storyapp:* npm run dev:backend

# 查看详细错误
npm run test:verbose
```

---

## 8. 总结

这份**StoryApp综合测试计划**基于orchestrator项目的成功验证经验，采用A-G场景分类法，为儿童故事AI应用提供了全面的质量保证框架。

### 🎯 核心优势
- **系统性覆盖**: 从基础功能到复杂场景的完整测试路径
- **实战验证**: 真实API + Mock降级双模式验证
- **自动化友好**: CI/CD集成和场景化测试命令
- **运维导向**: 生产环境部署和监控告警验证

### 📈 预期收益
- **质量提升**: 95%+ 功能覆盖率，< 5% 错误率
- **开发效率**: 快速验证和问题定位
- **生产就绪**: 完整的部署和运维支撑
- **用户体验**: 稳定可靠的儿童故事生成服务

### 🚀 实施建议
1. **渐进式实施**: 从场景A开始，逐步增加测试覆盖
2. **重点关注**: 故事生成质量(B/C)和异常处理(E)
3. **持续改进**: 根据测试结果不断优化配置和流程
4. **团队协作**: 确保开发和测试团队对测试标准的一致理解

---

**文档维护**: StoryApp开发团队  
**最后更新**: 2025-09-26  
**版本**: v1.0  
**适用范围**: StoryApp v1.0+

