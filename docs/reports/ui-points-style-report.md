# UI 开发迁移至 Points 风格方案报告

## 1. 目标与范围
- 将 GitHub 项目 `haizhouyuan/points` 的 Duolingo 式 UI 设计体系（高饱和配色、超圆角、游戏化动效）迁移并适配到当前故事应用前端。
- 本报告仅提供策略、阶段计划与风险评估，不包含任何实现代码。
- 关注对象：前端 React/Tailwind 样式层、组件层与页面装配层；后端仅在需要新增 UI 数据时做接口配合。

## 2. Points 项目 UI 设计拆解
### 2.1 设计语言
- **主题色系**：`src/styles/globals.css` 中定义 Duolingo 风格变量（绿色/橙色/蓝色）和温暖灰中性色板，利用 CSS 自定义属性统一。
- **形状与质感**：广泛使用 `--radius-pill`、玻璃拟态背景、渐变与柔和阴影，突出游戏化氛围。
- **字体与排版**：在 Tailwind v4 生成的 `index.css` 里，字重、字号、行高通过 tokens 统一，支持大字号标题与色彩渐变文字。

### 2.2 组件体系
- **基础控件**：`src/components/ui` 目录提供 shadcn 组件（Button、Card、Tabs、Progress、Badge、Toast 等），结合 lucide-react 图标和自定义工具类。
- **复合组件**：如 `PointsHeader.tsx`、`RewardCard.tsx`、`HabitTracker.tsx` 等，将渐变背景、图标、进度条、徽章整合为沉浸式模块。
- **动效和反馈**：`CelebrationEffect.tsx`、`StreakSystem.tsx` 使用 `motion/react` 与 `sonner` 构建庆祝动画、toast 提醒和 streak 机制。

### 2.3 布局模式
- `App.tsx` 通过 Tabs 分隔学生/家长视图，页面内层层嵌套 Card 与网格，营造信息密集但仍清晰的仪表盘体验。

## 3. 当前项目前端现状
- **技术栈**：React 18 + CRA（craco）+ Tailwind v3 + Framer Motion；组件库极简，仅 `Button/StoryCard/LoadingSpinner`。
- **主题**：`frontend/src/index.css` 以紫蓝渐变为主，缺少统一的配色 tokens 与设计系统；多为自定义类和局部样式。
- **页面结构**：`HomePage`, `StoryPage`, `StoryTreePage` 等各自维护布局缺乏共享 UI 模块，交互反馈较基础。

## 4. 迁移整体策略
1. **设计对齐**：与产品/UI 确认故事应用是否接受 Duolingo 风格，明确主色替换方案及角色视图需求（儿童、家长）。
2. **设计系统落地**：
   - 评估 Tailwind v4 升级可行性；若风险较大，则在 v3 的 `tailwind.config.js` 中手动扩展颜色/半径/间距 tokens，并额外引入 `tokens.css`。
   - 调整全局背景、字体和 focus 样式以匹配 Points 气质，同时保留儿童友好元素。
3. **组件层构建**：
   - 引入或仿制 shadcn 组件（Button、Card、Tabs、Progress、Badge、Toast、Dialog）。
   - 与现有组件接口对齐，重写样式与状态反馈；统一图标库（推荐 lucide-react）。
4. **复合模块适配**：
   - Story Progress Header（借鉴 PointsHeader）
   - 可视化故事进度卡片（RewardCard/HabitTracker 模式）
   - Story Tree 视图（SkillTree 风格）
   - 家长监控面板（ParentDashboard/AnalyticsDashboard）
5. **动效与反馈**：使用 Framer Motion 构建庆祝动画、节点过渡，整合 toast/通知流。
6. **页面级整合**：重构首页/故事页/故事树页布局，按阶段逐步替换，必要时设置 feature flag 以回滚。
7. **文档与验证**：更新设计文档、Storybook 或 UI 指南，并规划 Playwright 视觉回归测试。

## 5. 分阶段计划
| 阶段 | 时间 | 关键产出 |
| --- | --- | --- |
| 调研 & 对齐 | 第 1 周 | persona 与场景映射文档、UI Style tiles、Tailwind 升级评估报告 |
| 设计系统搭建 | 第 2 周 | tokens 配置、Tailwind/全局样式 PoC、图标策略 |
| 基础组件落地 | 第 3 周 | shadcn 组件骨架、主题按钮与卡片、toast 体系 |
| 复合模块设计 | 第 4 周 | Story Progress Header、故事选择卡、故事树草稿交互稿 |
| 页面整合 & 动效 | 第 5~6 周 | 重构页面布局、动效脚本、可访问性调整 |
| 验证 & 文档 | 第 7 周 | UI 回归测试计划、视觉对比截图、迁移 runbook |

## 6. 风险与缓解
- **Tailwind 版本差异**：升级到 v4 可能影响构建链路；提前在独立分支验证，若不可行则回退到 token backport 方案。
- **Bundle 体积增长**：shadcn 组件与动画可能增加体积；通过按需导入、lazy loading 控制。
- **设计一致性**：Duolingo 风格可能与现有品牌冲突；在执行前提供主题变体预览并征得确认。
- **开发节奏**：需要协调后端以提供新的统计数据；提前列出 API 依赖。

## 7. 验证与交付清单
- 设计 tokens 与组件库文档（Markdown 或 Storybook）。
- 页面原型/截图对照（旧版 vs. 新版）。
- Playwright E2E/UI 冒烟测试计划（含视觉回归截图/trace）。
- 迁移 runbook：包含配置改动、依赖列表、回滚步骤。

## 8. 后续建议
- 在开发阶段引入设计评审频率（每阶段一次），确保视觉落差及时修正。
- 建议建立 UI 主题切换机制，后续可支持节日主题或视障模式。
- 考虑在 App 内引入引导动画与奖励系统，加强与 Points 风格一致的游戏化体验。

