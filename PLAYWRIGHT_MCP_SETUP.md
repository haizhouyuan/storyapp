# PlaywrightMCP 安装和配置指南

## 安装状态
✅ PlaywrightMCP 已成功安装到你的系统中！

## 配置文件
- **Warp配置**: `C:\Users\admin\.warp\mcp_servers.json`
- **项目配置**: `D:\storyapp\.mcp.json`

## 使用方法

### 1. 在Warp终端中使用
Warp应该自动识别MCP服务器配置。你可以在Warp的Agent模式中使用Playwright功能。

### 2. 手动启动MCP服务器
```powershell
# 使用全局安装的版本
mcp-server-playwright --headless --isolated

# 或使用npx
npx @playwright/mcp@latest --headless --isolated
```

### 3. 项目中的可用脚本
```powershell
# 测试MCP服务器
node test-mcp.js

# 运行项目的Playwright测试
npm test

# 运行MCP相关测试
npm run test:mcp
```

## 配置选项
当前配置包括以下选项：
- `--headless`: 无头模式运行浏览器
- `--isolated`: 保持浏览器配置文件在内存中
- `--timeout-navigation 60000`: 导航超时60秒
- `--timeout-action 8000`: 操作超时8秒
- `--image-responses omit`: 省略图片响应

## 故障排除

如果PlaywrightMCP无法被识别：

1. 确保Warp已重启
2. 检查配置文件是否正确
3. 验证Node.js和npm版本
4. 运行测试脚本确认安装

## 更多信息
- [Playwright MCP 官方文档](https://github.com/microsoft/playwright-mcp)
- [MCP协议规范](https://spec.modelcontextprotocol.io/)
