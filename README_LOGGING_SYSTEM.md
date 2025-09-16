# 故事生成日志记录与Appsmith后台系统

## 🎯 系统概述

这是一个完整的故事生成流程监控系统，包含：
- **详细的日志记录模块** - 追踪每个步骤的执行过程
- **管理员API** - 提供数据查询和分析接口  
- **Appsmith可视化后台** - 直观的数据展示和监控界面

## 📦 新增功能

### 1. 详细日志记录系统 
- ✅ 会话级别跟踪（每个故事生成分配唯一ID）
- ✅ AI API调用详细记录（请求/响应/性能指标）
- ✅ JSON解析过程监控
- ✅ 内容验证和质量检查记录
- ✅ 数据库操作记录
- ✅ 错误堆栈追踪
- ✅ 性能指标收集（响应时间、Token使用量等）

### 2. 管理员API接口
- ✅ `GET /api/admin/logs` - 分页获取日志列表
- ✅ `GET /api/admin/logs/:sessionId` - 获取特定会话完整日志
- ✅ `GET /api/admin/stats` - 获取系统统计信息
- ✅ `GET /api/admin/performance` - 获取性能指标数据
- ✅ `GET /api/admin/sessions/active` - 获取活跃会话列表
- ✅ `POST /api/admin/logs/export` - 导出日志数据
- ✅ `DELETE /api/admin/logs/cleanup` - 清理过期日志

### 3. 数据库优化
- ✅ 新增`story_logs`集合
- ✅ 创建高效索引（sessionId, timestamp, eventType等）
- ✅ 自动过期策略（30天自动清理）
- ✅ 统计视图支持

## 🚀 快速启动

### 第一步：配置环境变量

复制并修改环境变量文件：
```bash
cp .env.example .env
```

在`.env`中添加或修改以下配置：
```bash
# 启用详细日志记录
ENABLE_DETAILED_LOGGING=true
ENABLE_DB_LOGGING=true
LOG_LEVEL=info
LOG_RETENTION_DAYS=30

# DeepSeek API密钥（必须配置）
DEEPSEEK_API_KEY=your_actual_api_key_here
```

### 第二步：启动后端服务

```bash
# 安装依赖
cd backend && npm install

# 启动开发服务器
npm run dev
```

服务启动后会自动：
- 连接MongoDB数据库
- 创建日志集合和索引
- 启动API服务（端口5001）

### 第三步：测试系统

运行测试脚本验证系统是否正常工作：
```bash
# 在项目根目录运行
node test-logging-system.js
```

期望输出：
```
🚀 开始测试故事生成日志记录系统...

🔍 测试1: 健康检查
✅ 健康检查通过

🔍 测试2: 故事生成（会创建详细日志）
✅ 故事生成成功

🔍 测试3: 管理员统计API  
✅ 统计数据获取成功

...

📊 测试结果: 7/7 通过
🎉 所有测试通过！日志记录系统工作正常。
```

## 📊 Appsmith后台搭建

### 方案一：导入现有配置

1. 登录Appsmith（云端或自托管）
2. 点击"Import Application"
3. 上传项目根目录的`appsmith-story-admin.json`文件
4. 修改数据源配置中的API地址

### 方案二：手动搭建

参考详细文档：`docs/APPSMITH_SETUP.md`

#### 数据源配置

**MongoDB数据源**：
```javascript
{
  host: "localhost",
  port: 27017,
  database: "storyapp"
}
```

**REST API数据源**：
```javascript
{
  baseURL: "http://localhost:5001/api/admin",
  headers: {
    "Content-Type": "application/json"
  }
}
```

#### 主要查询示例

**获取日志统计**：
```javascript
// 查询名称：getStats
// 方法：GET
// 路径：/stats
```

**获取日志列表**：
```javascript
// 查询名称：getLogs  
// 方法：GET
// 路径：/logs
// 参数：
{
  page: "{{LogsTable.pageNo}}",
  limit: "{{LogsTable.pageSize}}",
  logLevel: "{{LogLevelFilter.selectedOptionValue}}",
  startDate: "{{StartDatePicker.selectedDate}}"
}
```

## 📈 核心功能展示

### 1. 实时监控仪表盘
- 总会话数、24小时活跃数、成功率等关键指标
- 响应时间趋势图
- 错误类型分布图  
- 热门主题排行榜

### 2. 详细日志浏览
- 按时间、级别、事件类型筛选
- 会话级别的完整追踪
- 点击查看详细数据和性能指标
- 支持全文搜索

### 3. 性能分析
- API响应时间分析
- 不同模型性能对比
- Token使用量统计
- 时间序列性能趋势

### 4. 会话详情视图
- 单个故事生成的完整时间线
- 每个步骤的详细数据
- 性能瓶颈识别
- 错误诊断信息

## 🔍 日志记录详情

每个故事生成请求会创建一个唯一的会话ID，并记录以下事件：

### 故事生成流程
1. **session_start** - 会话开始
2. **story_generation_start** - 开始生成故事
3. **ai_api_request** - 准备调用AI API
4. **ai_api_response** - AI API响应成功
5. **json_parse_start** - 开始解析JSON
6. **json_parse_success** - JSON解析成功
7. **content_validation** - 内容验证
8. **quality_check** - 质量检查
9. **story_generation_complete** - 故事生成完成
10. **session_end** - 会话结束

### 保存故事流程
1. **session_start** - 保存会话开始
2. **db_save_start** - 开始数据库保存
3. **content_validation** - 文档验证
4. **db_save_success** - 保存成功
5. **session_end** - 会话结束

### 记录的数据类型
- **基础信息**：时间戳、会话ID、日志级别、事件类型、消息
- **业务数据**：主题、故事内容、选择选项、用户参数
- **性能指标**：开始时间、结束时间、持续时间、Token使用量、API调用次数
- **错误信息**：错误堆栈、错误类型、上下文信息

## 🛠️ 管理和维护

### 日志清理
```bash
# 手动清理30天前的日志
curl -X DELETE http://localhost:5001/api/admin/logs/cleanup \
  -H "Content-Type: application/json" \
  -d '{"days": 30}'
```

### 性能优化
- 数据库自动索引优化
- 分页查询避免大数据集
- 过期数据自动清理
- 查询结果缓存

### 监控告警
- 错误率过高时在Appsmith中设置告警
- 响应时间超阈值时发送通知  
- 系统资源使用监控

## 📚 相关文档

- `docs/APPSMITH_SETUP.md` - 详细的Appsmith配置指南
- `appsmith-story-admin.json` - 可导入的Appsmith应用配置
- `test-logging-system.js` - 系统测试脚本

## 🐛 故障排除

### 常见问题

1. **无法获取日志数据**
   - 检查MongoDB是否正常运行
   - 确认环境变量`ENABLE_DB_LOGGING=true`
   - 查看后端控制台是否有错误信息

2. **Appsmith连接失败**
   - 确认API地址配置正确
   - 检查网络连接和端口是否开放
   - 验证CORS配置是否允许Appsmith域名

3. **性能数据缺失**
   - 确保至少执行过一次故事生成
   - 检查数据库中是否有`story_logs`集合
   - 验证索引是否正确创建

### 调试技巧

1. **查看详细日志**：
   ```bash
   # 设置DEBUG级别
   LOG_LEVEL=debug npm run dev
   ```

2. **直接查询数据库**：
   ```javascript
   // MongoDB查询示例
   db.story_logs.find({}).sort({timestamp: -1}).limit(10)
   ```

3. **测试API端点**：
   ```bash
   # 测试统计接口
   curl http://localhost:5001/api/admin/stats
   
   # 测试日志接口
   curl "http://localhost:5001/api/admin/logs?limit=5"
   ```

## 🎉 总结

现在你拥有了一个功能完整的故事生成监控系统：

✅ **完整的数据跟踪** - 从输入到输出的每个步骤都有详细记录  
✅ **专业的API接口** - 标准化的数据查询和分析接口  
✅ **可视化管理后台** - 使用Appsmith构建的直观界面  
✅ **性能监控分析** - 深入了解系统瓶颈和优化方向  
✅ **质量改进指导** - 基于数据的故事质量提升建议  

这个系统将帮助你：
- 🔍 快速定位问题和错误
- 📊 了解用户使用模式  
- ⚡ 优化系统性能
- 📈 提升故事生成质量
- 💡 基于数据做出改进决策

开始使用吧！🚀