# PWA 实现评估报告

## 1. 评估摘要
- **当前状态**：前端仍是标准 CRA + CRACO 单页应用，未启用任何渐进式 Web 应用（PWA）能力；缺少 manifest、Service Worker、离线/缓存策略与安装体验。
- **总体结论**：需要引入完整的 PWA 基础设施并改造部署流程，才能满足离线浏览、安装到桌面、推送能力等需求。
- **优先级建议**：
  1. 建立基础设施（manifest、图标、Service Worker 注册）
  2. 通过 Workbox/自定义策略实现缓存与离线
  3. 扩展到后台同步、推送与 Lighthouse 质量门控
  4. 更新 CI/CD 与文档，确保部署环境支持 HTTPS 和正确的 SW 版本管理

## 2. 现状调研
| 模块 | 现状 | 证据 |
| --- | --- | --- |
| Manifest | 不存在 `manifest.json`、`link rel="manifest"` | `find frontend -name 'manifest*.json'` 空；`frontend/public/index.html` 未引入 manifest |
| Service Worker | 无 SW 文件与注册逻辑 | `frontend/src/index.tsx` 未注册；仓库无 `service-worker.ts`/`worker` 文件 |
| 资源缓存 | 依赖浏览器默认缓存，无离线兜底 | 无相关实现 |
| 图标与启动画面 | 仅有 favicon，缺少多尺寸 App icon、maskable 图标、启动画面 | `frontend/public` 目录仅 `index.html` |
| 构建支持 | CRACO 未配置 PWA 构建；Webpack 无 Workbox 插件 | `frontend/craco.config.js` 无 PWA 逻辑 |
| 部署支持 | 后端容器提供静态文件，但未声明 `service-worker.js` 缓存策略；生产/staging 均使用 Nginx 代理，需要额外配置 | `docker-compose.ghcr.yml`、`nginx/conf.d` |
| 监测 | CI 未运行 Lighthouse/PWA 审计；部署后无法自动验证 | `ci.yml`、`playwright` 用例均未覆盖 |

## 3. 差距与风险
1. **安装体验缺失**：无 manifest 与 HTTPS 环境下的 SW，浏览器无法触发 “添加到主屏幕” 提示。
2. **离线/弱网能力不足**：故事播放、分支选择在离线状态全部失效，易导致儿童用户体验极差。
3. **版本更新不可控**：SW 缺失导致浏览器缓存逻辑不可控。上线静态文件后，旧资源无法被强制失效。
4. **回退机制缺失**：即便引入 SW，也需设计缓存更新策略（skipWaiting、clientsClaim），否则可能出现白屏或旧版本停留。
5. **安规要求**：PWA 常与推送、后台同步等敏感权限结合，需要增加用户授权提示、防滥用审计以及日志监控。

## 4. 建议改造方案
### 4.1 基础设施
- 创建 `frontend/public/manifest.json`，含名称、主题色、`start_url`、`display: standalone`、`scope`、`orientation` 等字段。
- 准备多尺寸图标与 maskable 图标（192/512/1024），放置于 `frontend/public/icons/`。
- 在 `frontend/public/index.html` 中新增：
  - `<link rel="manifest" href="%PUBLIC_URL%/manifest.json">`
  - `<link rel="apple-touch-icon" ...>`、`mask-icon`
  - 适当的 `meta`（`theme-color`、`apple-mobile-web-app-status-bar-style` 已存在，可保留）

### 4.2 Service Worker 与缓存策略
- 新建 `frontend/src/serviceWorkerRegistration.ts`（或 `service-worker.ts`）并在 `index.tsx` 调用注册。
- 使用 Workbox（`workbox-webpack-plugin`）在生产构建时生成 SW：
  - `precache`：Shell 资源、字体、关键页面。
  - `runtime caching`：对 `/api` 请求使用 `NetworkFirst`（带超时和离线回退）、对静态媒体使用 `CacheFirst`。
  - `background sync`：缓存失败的故事提交，在恢复网络后重试（需后端幂等）。
- 为 AI 生成的互动内容设计 IndexedDB 离线存储，允许用户在无网时继续阅读已生成的片段。

### 4.3 安装与 UX
- 实现自定义 `beforeinstallprompt` 事件处理，提供显式“安装应用”按钮。
- 在安装/更新阶段向用户说明缓存策略、如何手动刷新。
- 记录 install/uninstall 事件到后端日志，便于监控。

### 4.4 CI/CD 支持
- 构建阶段：
  - 在 `craco.config.js` 中引入 `WorkboxWebpackPlugin.InjectManifest`（或 CRA 默认 `GenerateSW`）。
  - 确保 `.env` 配置 `PUBLIC_URL`，避免 SW 作用域异常。
- 测试与验证：
  - 新增 Lighthouse CLI 步骤（`lighthouse-ci` 或 `@lhci/cli`）检查 PWA 指标（installable、offline ready、best practices）。
  - Playwright 增加测试：模拟离线状态访问故事播放页，验证界面兜底提示。
- 部署阶段：
  - Nginx 配置 `Cache-Control: no-cache` 针对 `service-worker.js`，并允许 JS/JSON 静态资源设较长缓存。
  - CI 在发布后调用 `navigator.serviceWorker.getRegistrations()` 的清理脚本或提示用户刷新。

### 4.5 后端配合
- 提供 `/api/healthz`、`/api/get-story/:id` 的离线缓存策略说明，与前端对齐。
- 如需推送通知，配置 Web Push（VAPID key）与订阅 API。
- 在 Mongo 中记录 PWA 相关遥测（安装量、离线访问次数）。

## 5. 实施路线图
1. **迭代一（基础）**
   - 完成 manifest、图标、Service Worker 注册。
   - 通过 Workbox 实现静态资源 precache + API 基础缓存。
   - 更新部署脚本，验证在 staging 上可被安装。
2. **迭代二（离线体验）**
   - IndexedDB/CacheStorage 故事片段缓存。
   - 离线模式的 UI 提示与回退流程。
   - Playwright 离线测试 + Lighthouse 80 分以上门槛。
3. **迭代三（高级能力）**
   - 背景同步、推送通知、Badge（如有必要）。
   - 监控：埋点、Appsmith dashboard 展示安装/离线指标。
   - 灰度发布策略，保证 SW 更新安全。

## 6. 依赖与风险
- **技术依赖**：Workbox、IndexedDB 库（可选 Dexie）、Lighthouse CI、webpack 插件、Nginx 配置权限。
- **风险点**：
  - SW 更新失控可能导致白屏；需设计 `skipWaiting` + `clientsClaim` 并提供手动刷新按钮。
  - 离线缓存的故事内容需注意隐私与空间占用，提供清理机制。
  - 需要 HTTPS 才能启用 PWA；staging/production 必须启用 TLS。
  - 推送通知须符合未成年人隐私要求，避免收集敏感数据。

## 7. 验收标准
- `chrome://inspect/#service-workers` 可看到注册成功，应用可离线访问主要页面。
- Lighthouse PWA 分数 ≥ 90，Installable、Fast & Reliable 均为绿色。
- Playwright 离线脚本通过，且 story 浏览在断网情况下给出友好提示。
- Appsmith 监控面板展示 PWA 关键指标（安装数、离线访问量、SW 版本）。

## 8. 后续工作
- 编写《PWA 运维手册》说明 SW 升级流程。
- 在 `docs/` 中补充 PWA 方案章节，指导产品/设计提供图标与安装文案。
- 持续跟踪移动端设备兼容性（iOS 设备的限制、Android Chrome 的安装流程）。

---
*报告生成时间：2025-09-22 09:12:23 UTC*
