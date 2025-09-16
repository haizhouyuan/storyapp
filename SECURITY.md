# 安全规范 - API Key 管理指南

## 🔐 API Key 安全原则

### 1. 绝对禁止硬编码
- ❌ **禁止**：在任何代码文件中硬编码API key
- ❌ **禁止**：在配置文件中提交真实API key到代码仓库
- ❌ **禁止**：在日志中记录API key信息
- ❌ **禁止**：在错误消息中暴露API key

### 2. 环境变量管理
- ✅ **推荐**：使用环境变量 `DEEPSEEK_API_KEY`
- ✅ **推荐**：在`.env`文件中本地配置（不提交到仓库）
- ✅ **推荐**：使用`.env.example`作为配置模板

### 3. 生产环境安全
- ✅ **必须**：使用GitHub Secrets管理API key
- ✅ **必须**：定期轮换API key（建议每月一次）
- ✅ **必须**：监控API key使用情况和异常调用

## 🛠️ 技术实现

### 智能Mock模式
系统实现了智能降级机制：
```typescript
function shouldUseMockMode(): boolean {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  const nodeEnv = process.env.NODE_ENV;
  
  // 测试环境且无有效API key时使用mock
  if (nodeEnv === 'test' && !isValidApiKey(apiKey)) {
    return true;
  }
  
  // API key无效时使用mock
  if (!isValidApiKey(apiKey)) {
    console.warn('⚠️  DeepSeek API Key无效，使用mock模式');
    return true;
  }
  
  return false;
}
```

### API Key验证
```typescript
function isValidApiKey(apiKey: string | undefined): boolean {
  return !!(apiKey && 
    apiKey !== 'your_deepseek_api_key_here' && 
    apiKey.trim().length > 0 &&
    !apiKey.includes('placeholder') &&
    !apiKey.includes('example') &&
    apiKey.startsWith('sk-') &&
    apiKey.length > 20);
}
```

## 🌐 不同环境配置

### 开发环境
```bash
# .env (本地开发，不提交)
DEEPSEEK_API_KEY=sk-your-development-key
NODE_ENV=development
```

### 测试环境
```bash
# 可以不配置API key，系统会自动使用mock模式
NODE_ENV=test
# DEEPSEEK_API_KEY=  # 可选，不配置则使用mock
```

### 生产环境
```bash
# 通过GitHub Secrets或云服务密钥管理
DEEPSEEK_API_KEY=${{ secrets.DEEPSEEK_API_KEY }}
NODE_ENV=production
```

## 📋 GitHub Secrets 配置步骤

1. **访问仓库设置**
   ```
   Repository → Settings → Secrets and variables → Actions
   ```

2. **添加新Secret**
   ```
   Name: DEEPSEEK_API_KEY
   Value: sk-your-actual-api-key
   ```

3. **在CI/CD中使用**
   ```yaml
   env:
     DEEPSEEK_API_KEY: ${{ secrets.DEEPSEEK_API_KEY }}
   ```

## 🚨 安全事件响应

### 如果API Key泄露
1. **立即撤销**：在DeepSeek控制台撤销暴露的API key
2. **生成新key**：创建新的API key替代
3. **更新配置**：在所有环境中更新为新的API key
4. **审查影响**：检查API调用记录和费用使用情况
5. **加强监控**：临时增加API使用监控频率

### 紧急联系信息
- 技术负责人：[联系方式]
- 安全团队：[联系方式]
- 第三方服务商：DeepSeek技术支持

## ✅ 安全检查清单

- [ ] 所有代码文件中无硬编码API key
- [ ] `.env`文件已加入`.gitignore`
- [ ] 生产环境使用GitHub Secrets
- [ ] 设置了API key轮换提醒
- [ ] 配置了异常使用监控
- [ ] 团队成员了解安全规范
- [ ] 定期进行安全审计

## 📚 相关文档
- [GitHub Secrets文档](https://docs.github.com/en/actions/security-guides/encrypted-secrets)
- [DeepSeek API文档](https://api.deepseek.com)
- [环境变量最佳实践](./docs/ENVIRONMENT_SETUP.md)

---
**⚠️ 重要提醒**：API key是敏感信息，任何人都不应该通过非安全渠道（如聊天、邮件、文档）分享API key。始终通过安全的密钥管理系统传递敏感信息。