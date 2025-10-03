---
name: storyapp-tts-delivery
description: 实现 AI 故事朗读（TTS）全链路。
model: gpt-5-codex
---
cat <<'EOF' | proxychains4 -q codex exec --dangerously-bypass-approvals-and-sandbox --json
你正在 storyapp 项目的 `storyapp-tts-delivery` 工作树中推进“完成 TTS 链路上线”。请分阶段安排任务：

目标：
1. 评估首批 TTS 供应商（科大讯飞、阿里云、百度、微软 Edge-TTS），明确环境变量与限流策略。
2. 后端：在 `backend/` 新增 `TtsService`，实现 `/api/tts` 的真实音频生成（缓存、日志、错误处理、速率限制）。
3. 前端：在故事互动页接入语音播放 hook（播放/暂停/状态反馈），允许切换声音与语速，并兼容离线降级方案。
4. 测试：补充 Jest 单元测试、Playwright 流程（验证按钮状态与音频返回），更新生产巡检脚本。
5. 文档与监控：更新 README/docs，记录 TTS 配置步骤；在 Appsmith 或监控面板标注 TTS 调用指标。

工作流：
• 使用 `.tmuxagent/worktrees/storyapp-tts-delivery` 工作树；先用 mock 响应贯通前端，再替换真实服务。
• 每完成关键里程碑（mock → 真服务 → 缓存 → 测试）需总结并写入 agent 状态。
• 若遇到费用、合规或供应商限制，暂停并向 orchestrator 汇报。

请输出 JSON，说明当前优先事项、第一步建议命令以及需要收集的验证点。
EOF

proxychains4 -q codex --dangerously-bypass-approvals-and-sandbox
