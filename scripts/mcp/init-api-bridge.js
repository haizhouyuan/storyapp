/**
 * Playwright MCP init script 用于在浏览器上下文中注入安全的 API 调用桥，
 * 避免直接在 browser_evaluate 中调用 fetch 导致的序列化/权限问题。
 *
 * 使用方式：
 *   npx @playwright/mcp --init-script=$(pwd)/scripts/mcp/init-api-bridge.js ...
 *
 * 然后在脚本/聊天中：
 *   browser_evaluate(() => window.__mcpApiPost('/api/...', { foo: 'bar' }))
 */
(function injectApiBridge() {
  if (typeof window === 'undefined') return;
  if (window.__mcpApiPost) return;

  Object.defineProperty(window, '__mcpApiPost', {
    value: function __mcpApiPost(url, payload) {
      return new Promise((resolve, reject) => {
        try {
          const xhr = new XMLHttpRequest();
          xhr.open('POST', url, true);
          xhr.setRequestHeader('Content-Type', 'application/json');
          xhr.onreadystatechange = () => {
            if (xhr.readyState === XMLHttpRequest.DONE) {
              resolve({
                status: xhr.status,
                body: xhr.responseText,
              });
            }
          };
          xhr.onerror = (err) => reject(err);
          xhr.send(JSON.stringify(payload ?? {}));
        } catch (error) {
          reject(error);
        }
      });
    },
    writable: false,
    configurable: false,
  });
})();
