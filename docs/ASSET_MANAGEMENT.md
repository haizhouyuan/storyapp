# 图片与调试资源管理规范

为避免截图与调试资产散落在仓库各处，统一以下规则：

## 1. 资源分类
- **产品资源**：应用运行必需的图片、图标等，放置在 `frontend/src/assets/` 或 `frontend/public/`，按功能子目录划分。
- **文档配图**：用于文档、报告的截图或示意图，统一放在 `docs/media/` 下：
  - `docs/media/playwright/`：Playwright 或 MCP 相关示例截图。
  - `docs/media/debug/`：临时调试截图，经验证后需要长期保留。
  - `docs/media/archive/`：历史截图或低频引用的材料。
- **一次性调试输出**：临时观察用截图、导出的二进制产物不提交仓库；保留时请挪入上述目录再提交。

## 2. 命名与版本控制
- 文件名使用小写短横线风格，包含场景与时间点，例如 `story-generation-success.png`。
- 更新截图时保留旧版本仅在确有对比价值时放入 `archive`，否则替换原文件。
- 所有新增图片在 PR 中简述用途及对应文档位置，确保评审可追溯。

## 3. 临时产物处理
- Playwright 运行产生的 `.playwright-mcp/` 目录、根目录 `debug-*.png` 已加入 `.gitignore`，避免误提交。
- 若需要分享临时调试结果，请将文件移动到 `docs/media/debug/` 后再提交。

## 4. 现场处理
- 本次已将 `.playwright-mcp` 与根目录调试截图迁移至 `docs/media/` 对应子目录。
- 清理后的目录结构配合 `.gitignore` 可保持工作区整洁，后续依此执行即可。

如需新增类别，可在 `docs/media/` 下创建子目录并在此文档补充说明。
