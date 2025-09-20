# 积分主题 Storybook / 截图整理计划

为方便设计比对与后续宣传，建议对积分主题关键页面与组件制作可复用的 Storybook 展示或静态截图。以下为推荐安排：

## 1. 组件 Storybook 建议

| 类别 | 组件 | 建议故事 | 备注 |
| --- | --- | --- | --- |
| 布局 | `PointsPageShell` | 展示含 topBar、header、footer 的不同组合 | 提供背景变化（hud / hero / magenta）示例 |
| 布局 | `PointsSection` | `layout="card"`、`layout="plain"`、携带 actions/description | 对比卡片与纯容器样式 |
| 数据卡片 | `PointsStatCard` | 常规、带趋势（up/down/neutral）三个变体 | 展示图标/无图标切换 |
| 反馈 | `PointsModal` | 基础模态、带长内容滚动 | 演示关闭按钮与键盘焦点 |
| 元件 | `PointsBadge`, `PointsProgress`, `Button` | 常用 variant、size 组合 | Button 已存在，可补 `Points` 主题配色示例 |

实施建议：
1. 在 `frontend/.storybook/` 下初始化 Storybook（`npx storybook init`），选择 React + TypeScript 模板。
2. 每个组件单独创建 `*.stories.tsx`，遵循“Docs + Controls”模式，方便设计/产品调参。
3. 集成 `@storybook/addon-a11y` 与 `addon-interactions`，便于无障碍与交互演示。
4. 在 CI 中配置 `npm run storybook:build` 输出静态文件，供 Appsmith 或文档站点引用。

## 2. 页面截图清单

建议使用 Playwright `page.screenshot` 或 Storybook `stories` 生成 PNG：
- 首页（探索模式 & 故事树模式 tab）
- 我的故事列表页（有数据 / 空状态）
- 互动故事页（章节展示 + 选择按钮）
- 故事树页（节点展示 + 选择按钮）
- 结局页（保存按钮、统计卡）

截图步骤：
1. 启动前后端（需要 Mongo & DeepSeek Mock）。
2. 在 Playwright 测试中，补充一步 `await page.screenshot({ path: 'screens/points-home.png', fullPage: true })` 等，并通过 `npm run test:snapshots` 输出。
3. 将截图存放在 `docs/assets/ui/`（git 仓库）或设计云盘，并在 README/规范文档中引用。

## 3. 资源同步
- 更新 `docs/points-ui-guidelines.md`，在后记中附上 Storybook 地址与截图链接。
- 若引入 Storybook，建议在 `package.json` 中添加脚本：
  ```json
  {
    "scripts": {
      "storybook": "start-storybook -p 6006",
      "build-storybook": "build-storybook"
    }
  }
  ```
- 可以在 Appsmith 后台嵌入 Storybook 静态站点，让运营/客服查看 UI 状态。

## 4. 依赖与环境
- Playwright 截图需确保 `chromium` 安装完毕（已通过 `npx playwright install` 处理）。
- Storybook 需要 Node >= 18；当前项目满足要求。
- 若要自动发布，考虑使用 GitHub Actions 触发 `build-storybook` + 部署至 GitHub Pages/Gitee Pages。

---
> 产出物：
> 1. Storybook 基础配置 + 组件演示。
> 2. `docs/assets/ui/` 目录下的页面截图。
> 3. 更新文档的引用说明。
