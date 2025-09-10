# 儿童睡前故事App 安装和配置指南

## 快速开始

### 1. 环境要求

- **Node.js**: >= 16.0.0
- **npm**: >= 8.0.0
- **Git**: 最新版本
- **Supabase 账户**: 用于数据库服务

### 2. 项目安装

```bash
# 1. 克隆项目
git clone <your-repository-url>
cd storyapp

# 2. 安装所有依赖
npm run install:all

# 3. 配置环境变量
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

### 3. Supabase 数据库配置

#### 3.1 创建 Supabase 项目
1. 访问 [supabase.com](https://supabase.com)
2. 创建新项目
3. 记录以下信息：
   - Project URL
   - Anon Key
   - Service Role Key

#### 3.2 创建数据库表
在 Supabase SQL 编辑器中执行以下SQL：

```sql
-- 创建stories表
CREATE TABLE stories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 创建索引优化查询性能
CREATE INDEX idx_stories_created_at ON stories(created_at DESC);

-- 创建更新时间触发器
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_stories_updated_at 
  BEFORE UPDATE ON stories 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();
```

#### 3.3 配置环境变量
编辑 `backend/.env` 文件：

```bash
# Supabase配置
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_KEY=your_service_role_key

# DeepSeek API配置（已配置）
DEEPSEEK_API_KEY=sk-e1e17a8f005340b39240591f709d71d4
DEEPSEEK_API_URL=https://api.deepseek.com

# 服务器配置
PORT=5000
NODE_ENV=development
FRONTEND_URL=http://localhost:3000
```

### 4. 启动应用

#### 4.1 开发模式（推荐）
```bash
# 同时启动前后端开发服务器
npm run dev
```

这将启动：
- 后端服务器: http://localhost:5000
- 前端开发服务器: http://localhost:3000

#### 4.2 分别启动
```bash
# 启动后端
npm run dev:backend

# 启动前端（新终端）
npm run dev:frontend
```

### 5. 验证安装

1. **后端健康检查**
   ```bash
   curl http://localhost:5000/api/health
   ```
   
   应该返回：
   ```json
   {
     "status": "healthy",
     "checks": {
       "server": true,
       "database": true,
       "deepseek": true
     }
   }
   ```

2. **前端访问**
   - 打开浏览器访问 http://localhost:3000
   - 应该看到"睡前故事时间"欢迎界面

3. **功能测试**
   - 输入故事主题（如"小兔子的冒险"）
   - 点击"开始讲故事"
   - 验证能够生成故事内容

### 6. 运行测试

```bash
# 安装Playwright
npx playwright install

# 运行E2E测试（需要应用正在运行）
npm test
```

## 故障排除

### 常见问题

#### 1. 后端启动失败
**错误**: `缺少必要的Supabase环境变量`
**解决**: 确保 `backend/.env` 中配置了正确的 Supabase 信息

#### 2. DeepSeek API 调用失败
**错误**: `DeepSeek API调用失败`
**解决**: 
- 检查网络连接
- 确认 API Key 是否有效
- 查看 DeepSeek 服务状态

#### 3. 数据库连接失败
**错误**: `数据库服务暂时不可用`
**解决**:
- 检查 Supabase 项目是否正常运行
- 确认数据库表是否已创建
- 验证环境变量配置

#### 4. 前端白屏
**解决**:
- 检查浏览器控制台错误
- 确认后端服务是否运行
- 检查 CORS 配置

#### 5. 故事生成超时
**解决**:
- 检查网络连接
- DeepSeek API 可能响应较慢，可以等待更长时间
- 查看后端日志获取详细错误信息

### 开发者工具

#### 查看后端日志
```bash
cd backend
npm run dev
# 查看控制台输出
```

#### 数据库管理
- 访问 Supabase 控制台
- 使用 Table Editor 查看和编辑数据
- 使用 SQL Editor 执行查询

#### API 测试
```bash
# 测试故事生成
curl -X POST http://localhost:5000/api/generate-story \
  -H "Content-Type: application/json" \
  -d '{"topic": "测试故事"}'

# 测试故事列表
curl http://localhost:5000/api/get-stories
```

## 生产部署

### 环境变量配置
```bash
# 后端生产环境变量
NODE_ENV=production
PORT=5000
FRONTEND_URL=https://your-frontend-domain.com

# 确保使用生产数据库
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your_production_service_key
```

### 构建和部署
```bash
# 构建前后端
npm run build

# 启动生产服务器
npm run start
```

### 推荐部署平台
- **前端**: Vercel, Netlify, AWS S3 + CloudFront
- **后端**: Railway, Render, AWS Lambda + API Gateway
- **数据库**: Supabase (已配置)

## 更多资源

- [React 文档](https://reactjs.org/docs/)
- [Express.js 文档](https://expressjs.com/)
- [Supabase 文档](https://supabase.com/docs)
- [DeepSeek API 文档](https://platform.deepseek.com/api-docs/)
- [Playwright 测试指南](https://playwright.dev/docs/intro)

## 获取帮助

如果遇到问题：
1. 查看本文档的故障排除部分
2. 检查项目的 Issues 页面
3. 查看应用日志获取详细错误信息
4. 确认所有环境变量和依赖都正确配置