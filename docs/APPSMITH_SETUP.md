# Appsmith故事生成记录后台配置指南

## 🎯 概述

本文档详细说明如何使用Appsmith构建故事生成记录后台系统，实现对故事生成流程的全面监控和分析。

## 📋 前置条件

1. **Appsmith环境**：
   - 云端：访问 https://app.appsmith.com
   - 自托管：使用Docker部署

2. **后端API**：
   - 确保故事生成后端已启动：`http://localhost:5001`
   - 管理API端点可用：`http://localhost:5001/api/admin`

3. **数据库**：
   - MongoDB运行并包含`story_logs`集合
   - 数据库索引已正确创建

## 🚀 快速开始

### 第一步：创建Appsmith应用

1. 登录Appsmith
2. 点击"Create New" > "Application"
3. 命名为："Story Generation Admin"
4. 选择空白模板

### 第二步：配置数据源

#### MongoDB数据源配置

```javascript
{
  "name": "StoryDB",
  "pluginType": "MongoDB",
  "datasourceConfiguration": {
    "connection": {
      "mode": "READ_WRITE",
      "ssl": "DEFAULT",
      "host": "localhost",
      "port": "27017",
      "databaseName": "storyapp"
    },
    "authentication": {
      "databaseName": "storyapp",
      "username": "",
      "password": ""
    }
  }
}
```

#### REST API数据源配置

```javascript
{
  "name": "AdminAPI",
  "pluginType": "REST API",
  "datasourceConfiguration": {
    "url": "http://localhost:5001/api/admin",
    "headers": [
      {
        "key": "Content-Type",
        "value": "application/json"
      }
    ],
    "queryTimeout": "10000"
  }
}
```

## 📊 页面设计与实现

### 1. 仪表盘页面 (Dashboard)

#### 页面布局
```
┌─────────────────────────────────────────┐
│ 顶部导航栏                               │
├─────────────┬───────────────┬─────────────┤
│ 总会话数    │ 24h会话数     │ 成功率      │
├─────────────┼───────────────┼─────────────┤
│ 响应时间图表                │ 错误统计    │
├─────────────────────────────┼─────────────┤
│ 热门主题排行榜              │ 实时日志    │
└─────────────────────────────┴─────────────┘
```

#### 核心组件配置

**统计卡片组件**
```javascript
// API查询：getStats
{
  "query": "AdminAPI.get",
  "path": "/stats",
  "headers": {},
  "params": {}
}

// 卡片数据绑定
{
  "totalSessions": "{{getStats.data.data.overview.totalSessions}}",
  "sessionsLast24h": "{{getStats.data.data.overview.sessionsLast24h}}",
  "successRate": "{{Math.round(getStats.data.data.overview.successRate)}}%",
  "avgDuration": "{{Math.round(getStats.data.data.overview.avgDuration/1000)}}s"
}
```

**响应时间图表**
```javascript
// 图表配置
{
  "chartType": "LINE_CHART",
  "xAxisName": "时间",
  "yAxisName": "响应时间(秒)",
  "chartData": "{{getPerformanceData.data.data.timeline.map(item => ({
    x: item._id.date + ' ' + item._id.hour + ':00',
    y: Math.round(item.avgDuration / 1000)
  }))}}",
  "showDataPointLabel": true
}
```

### 2. 日志浏览页面 (Logs)

#### 筛选器组件
```javascript
// 时间范围选择器
{
  "widget": "DatePicker",
  "propertyName": "startDate",
  "defaultValue": "{{moment().subtract(7, 'days').format('YYYY-MM-DD')}}"
}

// 日志级别选择器
{
  "widget": "Select",
  "options": [
    {"label": "全部", "value": ""},
    {"label": "Info", "value": "info"},
    {"label": "Warn", "value": "warn"},
    {"label": "Error", "value": "error"},
    {"label": "Debug", "value": "debug"}
  ]
}

// 事件类型选择器
{
  "widget": "MultiSelect",
  "options": [
    {"label": "故事生成开始", "value": "story_generation_start"},
    {"label": "AI API调用", "value": "ai_api_response"},
    {"label": "JSON解析", "value": "json_parse_success"},
    {"label": "内容验证", "value": "content_validation"},
    {"label": "质量检查", "value": "quality_check"}
  ]
}
```

#### 日志表格组件
```javascript
// 日志查询
{
  "query": "AdminAPI.get",
  "path": "/logs",
  "params": {
    "page": "{{LogsTable.pageNo}}",
    "limit": "{{LogsTable.pageSize}}",
    "startDate": "{{StartDatePicker.selectedDate}}",
    "endDate": "{{EndDatePicker.selectedDate}}",
    "logLevel": "{{LogLevelSelect.selectedOptionValue}}",
    "eventType": "{{EventTypeSelect.selectedOptionValues.join(',')}}",
    "search": "{{SearchInput.text}}"
  }
}

// 表格配置
{
  "tableData": "{{getLogs.data.data.logs}}",
  "columns": [
    {
      "id": "timestamp",
      "label": "时间",
      "columnType": "text",
      "computedValue": "{{moment(currentRow.timestamp).format('MM-DD HH:mm:ss')}}"
    },
    {
      "id": "workflowId",
      "label": "Workflow",
      "columnType": "text",
      "computedValue": "{{currentRow.workflowId || currentRow.data?.workflowId || '-'}}"
    },
    {
      "id": "logLevel",
      "label": "级别",
      "columnType": "text",
      "cellBackground": "{{currentRow.logLevel === 'error' ? '#ff4d4f' : currentRow.logLevel === 'warn' ? '#faad14' : '#52c41a'}}"
    },
    {
      "id": "eventType",
      "label": "事件类型",
      "columnType": "text"
    },
    {
      "id": "message",
      "label": "消息",
      "columnType": "text"
    },
    {
      "id": "sessionId",
      "label": "会话ID",
      "columnType": "text",
      "computedValue": "{{currentRow.sessionId.substring(0, 8)}}"
    },
    {
      "id": "actions",
      "label": "操作",
      "columnType": "button",
      "buttonLabel": "详情",
      "onClick": "{{navigateTo('SessionDetail', {sessionId: currentRow.sessionId})}}"
    }
  ],
  "enablePagination": true,
  "enableSearch": false,
  "enableSort": true,
  "enableFilter": false
}
```

> **提示**：结合 `workflowId` 字段与新增的 `/api/story-workflows/:id/events`、`/api/tts/tasks/:storyId/latest` 接口，可以在 Appsmith 中打造“创作流程监控”面板，实时还原抽屉中的阶段与朗读事件。开发环境可使用 `/api/story-workflows/:id/test-events` 便捷注入测试数据。

### 3. 会话详情页面 (SessionDetail)

#### URL参数配置
```javascript
// 页面参数
{
  "sessionId": "{{appsmith.URL.queryParams.sessionId}}"
}
```

#### 会话信息卡片
```javascript
// 会话数据查询
{
  "query": "AdminAPI.get",
  "path": "/logs/{{appsmith.URL.queryParams.sessionId}}",
  "headers": {},
  "params": {}
}

// 会话统计显示
{
  "sessionId": "{{getSessionLogs.data.data.sessionStats.sessionId}}",
  "topic": "{{getSessionLogs.data.data.sessionStats.topic}}",
  "duration": "{{Math.round(getSessionLogs.data.data.sessionStats.duration/1000)}}秒",
  "totalLogs": "{{getSessionLogs.data.data.sessionStats.totalLogs}}",
  "errorCount": "{{getSessionLogs.data.data.sessionStats.errorCount}}",
  "apiCalls": "{{getSessionLogs.data.data.sessionStats.apiCalls}}"
}
```

#### 时间线组件
```javascript
// 时间线数据处理
{
  "timelineData": "{{getSessionLogs.data.data.logs.map(log => ({
    title: log.eventType,
    description: log.message,
    timestamp: moment(log.timestamp).format('HH:mm:ss.SSS'),
    level: log.logLevel,
    data: log.data,
    performance: log.performance
  }))}}",
  "itemTemplate": "{{currentItem.timestamp}} - {{currentItem.title}}: {{currentItem.description}}"
}
```

### 4. 性能分析页面 (Performance)

#### 性能图表配置
```javascript
// 性能数据查询
{
  "query": "AdminAPI.get",
  "path": "/performance",
  "params": {
    "days": "{{DaysSelect.selectedOptionValue || '7'}}"
  }
}

// 响应时间趋势图
{
  "chartType": "LINE_CHART",
  "xAxisName": "时间",
  "yAxisName": "响应时间(秒)",
  "chartData": "{{getPerformanceData.data.data.timeline.map(item => ({
    x: item._id.date + ' ' + String(item._id.hour).padStart(2, '0') + ':00',
    y: Math.round(item.avgDuration / 1000)
  }))}}",
  "allowScroll": true,
  "showDataPointLabel": false
}

// API调用量图
{
  "chartType": "COLUMN_CHART",
  "xAxisName": "时间",
  "yAxisName": "调用次数",
  "chartData": "{{getPerformanceData.data.data.timeline.map(item => ({
    x: item._id.date + ' ' + String(item._id.hour).padStart(2, '0') + ':00',
    y: item.apiCalls
  }))}}",
  "showDataPointLabel": true
}
```

### 5. 设置页面 (Settings)

#### 日志清理功能
```javascript
// 清理日志API调用
{
  "query": "AdminAPI.delete",
  "path": "/logs/cleanup",
  "body": {
    "days": "{{RetentionDaysInput.text || 30}}"
  },
  "onSuccess": "{{showAlert('日志清理完成', 'success')}}",
  "onError": "{{showAlert('清理失败: ' + deleteOldLogs.data.error, 'error')}}"
}

// 清理配置表单
{
  "retentionDays": {
    "widget": "Input",
    "inputType": "NUMBER",
    "defaultValue": "30",
    "label": "保留天数",
    "isRequired": true
  },
  "cleanupButton": {
    "widget": "Button",
    "text": "清理过期日志",
    "buttonStyle": "DANGER",
    "onClick": "{{deleteOldLogs.run()}}"
  }
}
```

## 🔧 高级配置

### 实时数据刷新
```javascript
// 定时器配置
{
  "interval": 30000, // 30秒刷新一次
  "callback": "{{getLogs.run(); getStats.run();}}"
}
```

### 数据过滤和搜索
```javascript
// 高级搜索配置
{
  "searchLogic": "{{LogsTable.tableData.filter(row => {
    const searchTerm = SearchInput.text.toLowerCase();
    return row.message.toLowerCase().includes(searchTerm) || 
           row.sessionId.includes(searchTerm) ||
           (row.data && row.data.topic && row.data.topic.toLowerCase().includes(searchTerm));
  })}}"
}
```

### 错误处理
```javascript
// API错误处理
{
  "onError": "{{
    console.error('API调用失败:', arguments[0]);
    showAlert('数据加载失败，请检查后端服务是否正常运行', 'error');
  }}"
}
```

## 📱 响应式设计

### 移动端适配
```javascript
// 移动端布局配置
{
  "breakpoints": {
    "mobile": "576px",
    "tablet": "768px",
    "desktop": "992px"
  },
  "mobileLayout": {
    "columns": 1,
    "hideColumns": ["sessionId", "data"],
    "compactView": true
  }
}
```

## 🚀 部署配置

### 环境变量设置
```javascript
// Appsmith环境配置
{
  "development": {
    "apiUrl": "http://localhost:5001/api/admin",
    "mongoUrl": "mongodb://localhost:27017/storyapp"
  },
  "production": {
    "apiUrl": "https://your-domain.com/api/admin",
    "mongoUrl": "mongodb://prod-server:27017/storyapp"
  }
}
```

### 应用导出/导入
1. 开发完成后，点击应用设置 > "Export Application"
2. 保存JSON配置文件到项目根目录：`appsmith-config.json`
3. 团队成员可通过"Import Application"导入配置

## 🔐 安全配置

### API认证
```javascript
// 添加认证头
{
  "headers": {
    "Authorization": "Bearer {{appsmith.store.authToken}}",
    "Content-Type": "application/json"
  }
}
```

### 权限控制
```javascript
// 基于角色的访问控制
{
  "adminOnly": "{{appsmith.user.roles.includes('admin')}}",
  "readOnly": "{{!appsmith.user.roles.includes('editor')}}"
}
```

## 📊 性能优化

### 查询优化
```javascript
// 分页查询
{
  "pageSize": 50,
  "lazyLoading": true,
  "cacheResults": true,
  "cacheTTL": 300000 // 5分钟缓存
}
```

### 数据压缩
```javascript
// 只获取必要字段
{
  "projection": {
    "data.originalResponse": 0, // 排除大字段
    "stackTrace": 0
  }
}
```

## 🐛 故障排除

### 常见问题

1. **连接超时**
   ```javascript
   // 增加超时时间
   {
     "timeout": "30000",
     "retryCount": 3
   }
   ```

2. **数据格式错误**
   ```javascript
   // 数据验证
   {
     "validator": "{{Array.isArray(getLogs.data.data.logs)}}",
     "fallback": "[]"
   }
   ```

3. **内存占用过高**
   ```javascript
   // 限制数据量
   {
     "maxRecords": 1000,
     "pagination": true
   }
   ```

## 📈 监控和分析

### 用户行为分析
```javascript
// 页面访问统计
{
  "pageViews": "{{appsmith.store.pageViews || 0}}",
  "trackPageView": "{{
    appsmith.store.pageViews = (appsmith.store.pageViews || 0) + 1;
    console.log('Page view tracked:', appsmith.URL.pathname);
  }}"
}
```

### 性能监控
```javascript
// API响应时间监控
{
  "apiPerformance": {
    "startTime": "{{Date.now()}}",
    "endTime": "{{Date.now()}}",
    "duration": "{{this.endTime - this.startTime}}"
  }
}
```

这个配置文档提供了完整的Appsmith应用搭建指南，你可以按照步骤创建一个功能完整的故事生成记录后台系统！
