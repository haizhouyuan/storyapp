# 2025-10-18 侦探工作流质量回归记录

本次回归在分支 `main` 上执行，旨在验证以下改动：

- Writer/Editor 提示强化（线索/动机/时间自然铺垫）
- 现实可行性说明管线（mechanism realism hint）
- AutoFix 对非必回收线索的补充说明
- Stage4 新增动机与时间标签校验
- Reader/导出移除显式机关提示，结尾改为侦探独白

## 测试命令

```bash
scripts/dev/nodehere npm run build:shared
scripts/dev/nodehere npm run build:backend
scripts/dev/nodehere npm run -w backend test
scripts/dev/nodehere npm run -w frontend type-check
scripts/dev/nodehere npx tsx backend/scripts/runStrictNoDb.ts "星海列车的隐形终点" --profile=strict --mechanism=optical-phantom --seed=story1b
scripts/dev/nodehere npx tsx backend/scripts/runStrictNoDb.ts "月影博物馆的玻璃迷局" --profile=strict --mechanism=clockwork-orchestrator --seed=story2b
scripts/dev/nodehere npx tsx backend/scripts/runStrictNoDb.ts "雨林学园的消失鼓声" --profile=strict --mechanism=botanical-clock --seed=story3e
```

## 验证结果

- 三个主题故事 Stage4 校验均为 `pass=10 / warn=0 / fail=0`，新增规则 `motive-foreshadowing` 与 `chapter-time-tags` 均为 `pass`
- 输出的 Markdown/HTML 不再包含 `> 机关预设` 行，结尾追加侦探独白总结真实机关及公平线索
- debug 视图仍可查看机关预设与现实提示，Reader 视图仅包含故事正文

## 后续观察

- 若新增机制需要更多现实提示，需在 `shared/src/constants/detectiveMechanisms.ts` 中补齐 `realismHint`
- 若 Playwright 回归出现超时，可酌情调高 `waitForWorkflow` 超时时间
