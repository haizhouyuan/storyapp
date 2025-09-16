# GitHub Actions配置指南 - Claude Code 官方版

本项目使用 **Anthropic 官方 Claude Code GitHub Actions** 来实现AI辅助的开发工作流。包含以下工作流：

## 1. CI/CD Pipeline (`ci.yml`)

### 功能
- 在push和PR时自动运行
- 执行后端、前端和E2E测试
- 构建项目
- 支持Node.js多版本测试 (18.x, 20.x)

### 配置要求
无需额外配置，使用默认的`GITHUB_TOKEN`即可。

## 2. PR安全和质量审查 (`pr-security-review.yml`)

### 功能
- PR打开/更新时自动触发安全和质量审查
- 使用官方 `anthropics/claude-code-action@v1`
- 针对儿童应用的专门安全检查（COPPA合规、内容过滤等）
- 自动运行测试并分析失败原因
- 提供具体的修复建议和代码示例

## 3. @claude提及响应 (`claude-mentions.yml`)

### 功能
- 在PR/Issue中提及@claude时自动响应
- 智能检测任务类型并执行相应操作
- 支持代码实现、Bug修复、文档更新等
- 专门的故事创作工作流辅助

## 4. 定时维护 (`nightly-maintenance.yml`)

### 功能
- 每日自动执行项目维护任务
- 依赖安全更新和漏洞修复
- 代码质量分析和改进
- 文档同步和维护报告生成
## 配置要求

### 必需的GitHub Secrets

在GitHub仓库设置中添加以下Secrets：

#### Claude API配置
```
Secret name: CLAUDE_API_KEY
Secret value: sk-ant-oat01-57f027a37c449b83f63c88257a9d44033f2d83164b1e0a2c04d04f12766e8c45
```

#### GAC平台中转配置
```
Secret name: ANTHROPIC_BASE_URL
Secret value: https://gaccode.com/claudecode
```

> 🔑 **重要**: 本项目已配置为GAC平台的Claude Code中转服务，支持在GitHub Actions中使用Claude Code的所有功能。
   ```

#### 如何设置GitHub Secrets

1. 进入GitHub仓库页面
2. 点击 **Settings** 标签
3. 在左侧菜单中选择 **Secrets and variables** → **Actions**
4. 点击 **New repository secret**
5. 输入Secret名称和值
6. 点击 **Add secret**

#### 获取API密钥

**Claude API (GAC平台):**
1. 访问 [GAC Claude Code平台](https://gaccode.com/claudecode)
2. 注册/登录账户  
3. 创建新的API密钥（格式：`sk-ant-oat01-xxxxxxx`）
4. 复制密钥并添加到GitHub Secrets

**Claude API (官方):**
1. 访问 [Anthropic Console](https://console.anthropic.com/)
2. 注册/登录账户
3. 创建新的API密钥
4. 复制密钥并添加到GitHub Secrets

**OpenAI API:**
1. 访问 [OpenAI API Keys](https://platform.openai.com/api-keys)
2. 注册/登录账户
3. 创建新的API密钥
4. 复制密钥并添加到GitHub Secrets

## 使用方法

### 手动触发AI Bug Fix

1. 进入GitHub仓库的 **Actions** 标签
2. 选择 **AI Bug Fix** 工作流
3. 点击 **Run workflow**
4. 选择AI提供商 (Claude/OpenAI)
5. 输入bug描述
6. (可选) 指定目标文件列表
7. 点击 **Run workflow**

### 通过Issue触发AI Bug Fix

1. 创建一个新的Issue描述bug
2. 给Issue添加 `ai-fix` 标签
3. 工作流将自动触发并分析Issue内容

## 工作流程

### AI Bug Fix流程

1. **代码检出**: 获取最新代码
2. **环境设置**: 安装Node.js和依赖
3. **测试运行**: 执行所有测试，记录失败信息
4. **代码分析**: 分析项目结构和测试失败原因
5. **AI修复**: 调用Claude/OpenAI API生成修复方案
6. **应用修复**: 自动应用AI生成的代码更改
7. **验证修复**: 重新运行测试确保修复有效
8. **创建PR**: 自动创建包含修复的Pull Request

### 注意事项

⚠️ **重要提醒**:
- AI生成的修复需要人工审查
- 不要盲目合并AI生成的PR
- 建议在本地测试修复后的代码
- 对于关键功能，进行额外的手动测试

### 支持的文件类型

AI修复工作流支持以下文件类型：
- TypeScript (.ts, .tsx)
- JavaScript (.js, .jsx)
- 测试文件 (.test.ts, .spec.ts等)

## 故障排除

### 常见问题

1. **API密钥错误**
   - 确保在GitHub Secrets中正确设置了API密钥
   - 验证API密钥是否有效且未过期

2. **工作流失败**
   - 检查GitHub Actions日志中的错误信息
   - 确保所有依赖正确安装

3. **AI修复不准确**
   - 提供更详细的bug描述
   - 指定具体的目标文件范围
   - 手动审查和调整AI生成的修复

### 成本考虑

- Claude API: 按token计费
- OpenAI API: 按token计费
- 建议监控API使用情况避免意外费用

## 扩展功能

可以根据需要扩展工作流：
- 添加更多AI提供商支持
- 集成代码质量检查工具
- 添加自动部署功能
- 集成Slack/Teams通知

## 贡献

如果你有改进建议，请创建Issue或Pull Request。