# Playwright MCP 启动指引（侦探故事工作流）

> 目的：确保在本地 `8701` 服务上运行 Playwright MCP 时，具备稳定的动作超时、禁止 Service Worker 干扰，并支持在浏览器上下文内安全地触发后端 API。

## 1. 推荐启动命令

```bash
npx @playwright/mcp@latest \
  --timeout-action=60000 \
  --timeout-navigation=120000 \
  --block-service-workers \
  --allowed-origins=http://127.0.0.1:8701 \
  --init-script="$(pwd)/scripts/mcp/init-api-bridge.js"
```

- `--timeout-action=60000`：将默认动作超时从 5 秒提高到 60 秒，避免 `browser_wait_for` 过早超时。
- `--timeout-navigation=120000`：为页面跳转与资源加载提供更充裕时间。
- `--block-service-workers`：禁用页面注册的 Service Worker，防止缓存导致的旧资源。
- `--allowed-origins`：显式允许访问本地 `8701` 服务，避免沙箱拦截。
- `--init-script`：注入 `window.__mcpApiPost` 辅助函数，通过 XHR 触发项目内的 JSON API。

## 2. 在浏览器上下文触发 API

注入脚本后，可在 `browser_evaluate` 中安全调用：

```ts
await browser_evaluate({
  function: () => window.__mcpApiPost(
    'http://127.0.0.1:8701/api/story-workflows',
    { topic: '北海孤岛的沉默号角', locale: 'zh-CN' }
  )
});
```

返回值格式：

```json
{ "status": 200, "body": "{...原始响应...}" }
```

**注意**：请在同一个上下文中先执行 `browser_navigate` 到目标站点，使得请求具备正确的 Cookie/鉴权上下文。

## 3. 与 Shell 脚本联动

若需要批量生成故事，建议采用“API 驱动 + 浏览器观测”的混合方式：

1. 使用 `curl` 或仓库内脚本（例如 `scripts/dev/run_workflows.sh`）调用后端流水线。
2. 使用 Playwright MCP 自动化页面，仅作界面验证、截图与状态监控。

这样可以规避 `browser_evaluate + fetch` 的序列化限制，同时保留 UI 侧的可视化确认能力。

## 4. Chrome DevTools MCP（可选）

若需要深入调试单页脚本，可配合 [Chrome DevTools MCP](https://github.com/ChromeDevTools/chrome-devtools-mcp)：

```bash
/path/to/chrome --remote-debugging-port=9224
chrome-devtools-mcp --browser-url=http://127.0.0.1:9224
```

Chrome DevTools MCP 的 `evaluate_script` 更贴近原生 CDP，在需要完整 DevTools 控制台时是不错的补充。

---

如需更多自动化案例，可参考 `testrun/` 目录下的脚本输出，并在执行前确保 `.env` 中的 DeepSeek API Key 有效。***
