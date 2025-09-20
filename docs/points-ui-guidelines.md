# 积分主题界面规范（Points HUD）

本规范用于指导首页积分化主题在整个前端的统一落地。目标是在重构其他页面前明确视觉与交互基线，避免“child-*”旧样式与新体系混用，确保儿童友好、温柔陪伴的体验保持一致。

## 1. 视觉基线

### 1.1 色彩
- **核心色**：`points.primary`（活力绿色，用于主 CTAs、选中态、进度条）。
- **辅助色**：`points.secondary`（蓝色，用于次级 CTA 和高亮状态）、`points.accent`（蓝色柔化版，用于徽章/提示）。
- **状态色**：`points.success | warning | danger`，与 Tailwind `bg-points-*`、`text-points-*` 搭配。
- **表面与边框**：`points.surface`（基础卡片）、`points.surface-elevated`（浮层）、`points.border`、`points.border-strong`。
- **文本色**：`points.text` / `points.text-strong` / `points.text-muted` / `points.text-inverse`。
- **渐变**：`bg-points-hero`, `bg-points-surface-glass`, `bg-points-magenta-wave`；用于大背景、卡片高亮区块。

> 所有色值均来自 `frontend/src/theme/points-tokens.css`，通过 CSS 变量暴露，Tailwind 已在 `tailwind.config.js` 中映射至 `points.*` 命名空间。

### 1.2 字体与字号
- 全站字体：`font-quicksand` 或 `font-nunito`（Tailwind 自动注入）。
- 建议字号梯度（以 Tailwind 原生单位）：
  | 语义 | Tailwind 类 | 说明 |
  | --- | --- | --- |
  | 标题 1 | `text-4xl font-semibold` | 首页主标题、结束页祝贺语 |
  | 标题 2 | `text-3xl font-semibold` | 页面主标题（“我的故事”等） |
  | 标题 3 | `text-2xl font-semibold` | 模块小标题、统计项标题 |
  | 正文大 | `text-lg` | 说明文字、鼓励语 |
  | 正文中 | `text-base` | 默认段落文本 |
  | 正文小 | `text-sm text-points-text-muted` | 标注、辅助说明 |
  | 标签字 | `text-xs font-semibold` | 徽章、标识信息 |

> 旧的 `text-child-*`、`font-child` 类需要在重构过程中逐步删除，统一改用上述 Tailwind 类或封装的组件 props。

### 1.3 间距与圆角
- 圆角统一使用 `rounded-points-sm|md|lg|xl|pill`；按钮使用 `rounded-points-pill`，卡片使用 `rounded-points-lg`。
- 推荐间距：
  | 场景 | Tailwind 建议 |
  | --- | --- |
  | 页面内外边距 | `px-5 sm:px-8`, `py-12` 等响应式组合 |
  | 卡片 padding | `p-6` 或 `p-8`（桌面端）|
  | 卡片栅格间距 | `gap-4` / `gap-6` |
  | 模块垂直间距 | `space-y-6` / `space-y-8` |
- 可按需扩展 `spacing.points-*`，但优先使用原生 Tailwind 间距，降低学习成本。

### 1.4 阴影与动效
- 阴影：优先使用 `shadow-points-soft`、`shadow-points-pressed`，必要时搭配 `hover:shadow-xl`。
- 动效策略：
  - 进入/离开：`framer-motion` 的 `spring` 或 `tween`，阻尼柔和（如 stiffness 100, damping 15）。
  - 漂浮/呼吸：`animation-float-soft`、`animation-pulse-celebrate`。
  - 悬停：`whileHover={{ scale: 1.02 }}`、`hover:-translate-y-0.5` 等细微反馈。
- 交互动效务必保持“轻柔、耐看”，避免过度弹跳。

## 2. 组件体系（可复用资源）

| 组件 | 位置 | 用途 | 说明 |
| --- | --- | --- | --- |
| `PointsCard` | `src/components/points/PointsCard.tsx` | 卡片容器 | 支持图标、徽章、页脚、多种 variant |
| `PointsBadge` | `src/components/points/PointsBadge.tsx` | 胶囊徽章 | `variant=neutral` 可做提示，primary 用于关键标签 |
| `PointsTabs` | `src/components/points/PointsTabs.tsx` | 模式切换标签 | 支持 icon、描述文案 |
| `PointsProgress` | `src/components/points/PointsProgress.tsx` | 进度条 | 适用于故事进度、积分成长 |
| `PointsToaster` | `src/components/points/PointsToaster.tsx` | toast 样式统一 | 全局放置于 `App.tsx` 已生效 |
| `Button` | `src/components/Button.tsx` | CTA | 需在重构中统一 variant 配色（避免 `child-*` 渐变）|
| `StoryCard` | `src/components/StoryCard.tsx` | 我的故事列表项 | 将在重构中迁移到 `PointsCard` 风格 |
| `LoadingSpinner` | `src/components/LoadingSpinner.tsx` | 加载反馈 | 需要替换 `child-*` 样式 |

后续新增基础：
- `PointsPageShell`：包裹页级布局（背景渐变、顶部导航、内容容器）。
- `PointsSection`：模块化卡片/分组标题。
- `PointsStatCard`：纵向统计卡（数字 + 标签 + 图标）。
- `PointsModal`：模态框统一外观，封装圆角、阴影、关闭按钮。

## 3. 旧样式迁移

| Legacy 类 | 目标替换 | 备注 |
| --- | --- | --- |
| `bg-gradient-to-br from-child-*` | `bg-white`, `PointsCard` variant, 或 `bg-points-hero` | 视场景采用卡片或渐变面板 |
| `text-child-4xl/3xl/...` | 对应 `text-4xl` / `text-3xl` 等 | 同时搭配 `font-semibold` / `font-bold` |
| `font-child` | `font-quicksand` 或 `font-nunito` | 通过统一 `body` 字体后可去除 |
| `p-child-*`, `m-child-*`, `gap-child-*` | Tailwind 原生 spacing（`p-6`, `gap-6` 等） | 依据视觉稿重新对齐 |
| `rounded-child*`, `shadow-child*` | `rounded-points-*`, `shadow-points-*` | 结合组件封装 |
| `bg-child-*`, `text-child-*` | `bg-points-*`, `text-points-*` 或 Tailwind neutral palette | 

迁移策略：
1. 页面骨架先替换背景、字体、主容器（利用 `PointsPageShell`）。
2. 模块内部改造时，引入 `PointsCard/Badge/Tabs` 等组件，删除 `child-*` 辅助类。
3. 检查 `StoryCard`, `LoadingSpinner` 等组件，将其样式更新为积分主题，避免旧类继续外溢。
4. 最终搜索 `child-` 关键字确认清理完毕。

## 4. 布局模式模板

1. **信息首页（HomePage 已实现）**
   - 顶部辅助信息条 + CTA。
   - 核心卡片内含徽章、标题、说明、输入框、Tabs、功能介绍卡。
   - 背景使用 `bg-[rgb(var(--points-hud-bg))]` + 居中容器。

2. **互动流程页（Story / StoryTree）**
   - 顶部固定导航（返回主页、标题、进度）。
   - 内容区划分为：故事卡片 + 选择列表（使用卡片/按钮）。
   - 背景可使用 `PointsPageShell` 提供轻渐变，避免早期 `child-*` 渐变混乱。

3. **数据列表页（MyStories）**
   - 顶部导航 + 页面标题 + 顶部操作（搜索、新建）。
   - 列表使用 `PointsCard` 或 `PointsStatCard` 栅格布局。
   - Modal 统一使用 `PointsModal`。

4. **庆祝/摘要页（EndPage）**
   - 主题插画 + 统计卡 + 操作按钮列。
   - 背景可通过 `PointsPageShell` + `animation-pulse-celebrate` 点缀。

## 5. 动效与反馈准则

- **选择按钮**：`whileHover={{ scale: 1.02 }}` + `whileTap={{ scale: 0.98 }}`，并配合 `PointsBadge` 或数字标签。
- **Toast**：依赖 `PointsToaster`，避免各页面自定义样式。
- **加载状态**：`LoadingSpinner` 统一语句、颜色，保留柔和渐变。
- **背景装饰**：使用低饱和气泡/星星动画，数量控制在 6~10，避免分散注意力。

## 6. 可访问性

- 所有交互组件保持 `points-focus` 焦点态。
- 文字与背景对比度 ≥ 4.5：1；`text-points-text-muted` 仅用于 14px 以上文字。
- 动画提供偏好处理：尊重 `prefers-reduced-motion`（后续组件实现时需考虑）。

## 7. 实施清单

1. **基础设施**：新建 `PointsPageShell` 等组件，完善 Storybook/示例（待建）。
2. **组件迁移**：Button/LoadingSpinner/StoryCard 去除 `child-*` 类，改用积分 token。
3. **页面重构**：按照“我的故事 → 故事互动 → 故事树 → 结束页”顺序迁移。
4. **样式收尾**：`grep "child-" frontend/src` 直至无匹配；更新 Playwright 选择器（如 data-testid 保持）。
5. **文档维护**：本规范随重构进度更新，记录新增组件与 token。

---

> 附注：若后续需要积分体系视觉元素（积分爆炸、排行榜等），可在此规范基础上扩展统计组件与徽章风格，但务必沿用 `points.*` token，保持一致性。
