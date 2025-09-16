# 集中化配置管理系统

这是StoryApp项目的集中化环境配置管理系统，确保所有环境变量只在一处加载，避免重复和冲突。

## 核心特性

- ✅ **统一加载**: 所有环境变量在`env-loader.js`中集中加载
- ✅ **优先级管理**: 支持多层级环境文件，自动处理覆盖优先级
- ✅ **类型安全**: 提供TypeScript友好的配置对象
- ✅ **环境隔离**: 不同环境使用不同的配置文件
- ✅ **验证机制**: 自动验证必需的环境变量
- ✅ **默认值**: 为所有配置项提供合理的默认值

## 文件结构

```
config/
├── env-loader.js       # 核心配置加载器
└── README.md          # 本文档

项目根目录/
├── .env               # 主环境配置文件
├── .env.local         # 本地覆盖配置（不提交到Git）
├── .env.development   # 开发环境专用
├── .env.test          # 测试环境专用
├── .env.production    # 生产环境专用
└── .env.example       # 环境变量模板
```

## 环境文件优先级

加载顺序（后加载的会覆盖先加载的）：

1. `.env` - 基础配置
2. `.env.local` - 本地覆盖（不提交Git）
3. `.env.${NODE_ENV}` - 环境特定配置
4. `.env.${NODE_ENV}.local` - 环境特定的本地覆盖

## 使用方法

### 1. 在后端代码中使用

```javascript
// 旧方式（已弃用）
import dotenv from 'dotenv';
dotenv.config();
const apiKey = process.env.DEEPSEEK_API_KEY;

// 新方式（推荐）
const { getTypedConfig } = require('../../config/env-loader');
const config = getTypedConfig();
const apiKey = config.api.deepseek.apiKey;
```

### 2. 配置对象结构

```javascript
const config = {
  server: {
    port: 5000,
    host: '0.0.0.0',
    nodeEnv: 'development',
    frontendUrl: 'http://localhost:3000'
  },
  database: {
    uri: 'mongodb://localhost:27017',
    name: 'storyapp'
  },
  api: {
    deepseek: {
      apiKey: 'sk-xxxxx',
      apiUrl: 'https://api.deepseek.com'
    }
  },
  logging: {
    level: 'info',
    enableDbLogging: true,
    enableDetailedLogging: true,
    retentionDays: 30
  },
  rateLimit: {
    windowMs: 900000,
    max: 100
  },
  frontend: {
    apiUrl: 'http://localhost:5000/api',
    version: '1.0.0',
    debug: true
  }
};
```

### 3. 环境变量验证

系统会自动验证以下必需变量：

**生产环境必需**:
- `DEEPSEEK_API_KEY`
- `MONGODB_URI`

**开发环境推荐**:
- `DEEPSEEK_API_KEY`

**测试环境**:
- 无必需变量（可使用Mock数据）

### 4. 调试配置

```bash
# 查看当前配置加载情况
node config/env-loader.js

# 输出示例：
🔧 环境配置加载器
====================

📁 加载的文件:
  .env (24 vars)
  .env.development (3 vars)

⚙️ 类型化配置:
{
  "server": {
    "port": 5000,
    "host": "0.0.0.0",
    "nodeEnv": "development",
    "frontendUrl": "http://localhost:3000"
  },
  "api": {
    "deepseek": {
      "apiKey": "[HIDDEN]",
      "apiUrl": "https://api.deepseek.com"
    }
  }
}

✅ 配置加载时间: 2024-01-01T10:00:00.000Z
```

## 迁移指南

### 从旧配置系统迁移

1. **删除重复的dotenv加载**:
   ```javascript
   // 删除这些行
   import dotenv from 'dotenv';
   dotenv.config();
   ```

2. **使用集中化配置**:
   ```javascript
   // 添加这些行
   const { getTypedConfig } = require('../../config/env-loader');
   const config = getTypedConfig();
   ```

3. **更新环境变量引用**:
   ```javascript
   // 旧方式
   const port = process.env.PORT || '5000';
   
   // 新方式
   const port = config.server.port;
   ```

### 更新现有文件

已经更新为使用集中化配置的文件：
- ✅ `backend/src/config/index.ts`
- ✅ `backend/src/config/deepseek.ts`
- ✅ `backend/src/config/mongodb.ts`

待更新的文件（如需要）：
- `backend/src/utils/logger.ts`
- `backend/src/config/initializeDatabase.ts`
- `backend/src/middleware/observability.ts`

## 最佳实践

### 1. 环境文件管理

```bash
# 永远不要提交包含敏感信息的文件
echo ".env.local" >> .gitignore
echo ".env.*.local" >> .gitignore

# 生产环境使用环境特定文件
cp .env.example .env.production
# 编辑 .env.production 填入生产环境值
```

### 2. 本地开发配置

```bash
# 创建本地覆盖文件
cp .env.example .env.local

# 在 .env.local 中设置个人开发配置
# 例如：不同的数据库端口、API密钥等
```

### 3. CI/CD环境

```yaml
# GitHub Actions 示例
env:
  NODE_ENV: test
  DEEPSEEK_API_KEY: sk-test-dummy
  MONGODB_URI: mongodb://root:pass123@mongo:27017/storyapp?authSource=admin
```

### 4. Docker环境

```dockerfile
# 在Dockerfile中，环境变量会自动从compose文件传入
# 无需额外配置
```

## 故障排除

### 常见问题

1. **配置未加载**
   ```bash
   # 检查文件是否存在
   ls -la .env*
   
   # 检查配置加载情况
   node config/env-loader.js
   ```

2. **环境变量冲突**
   ```bash
   # 查看环境变量来源
   NODE_ENV=development node config/env-loader.js
   ```

3. **类型错误**
   ```javascript
   // 确保使用正确的配置路径
   const config = getTypedConfig();
   console.log(config.server.port); // 数字类型
   console.log(process.env.PORT);   // 字符串类型
   ```

### 调试命令

```bash
# 查看所有环境变量
printenv | grep -E "(PORT|MONGODB|DEEPSEEK|NODE_ENV)"

# 测试配置加载
node -e "console.log(require('./config/env-loader').getTypedConfig())"

# 检查文件优先级
NODE_ENV=test node config/env-loader.js
```

## 安全注意事项

1. **敏感信息保护**:
   - 永远不要在代码中硬编码API密钥
   - 使用`.env.local`文件存储本地敏感配置
   - 确保`.env.local`在`.gitignore`中

2. **生产环境**:
   - 使用环境变量注入而非文件存储敏感信息
   - 定期轮换API密钥
   - 监控配置访问日志

3. **开发环境**:
   - 使用测试用的API密钥
   - 定期清理开发环境中的敏感数据

## 更新日志

- **v1.0.0** (2024-01-01): 初始版本，支持基础配置集中化
- **v1.1.0** (当前): 添加类型安全、验证机制和详细文档