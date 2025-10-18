# 风暴之夜的灯塔回声 · Reasoner 蓝图试跑（候选=2，力度=medium，章节目标=1200）

- 执行时间：2025-10-16
- 后端：本地 Express（PORT=8712），Mongo=127.0.0.1:27018（无认证）
- DeepSeek：reasoner + chat；超时 180s；重试拦截开启
- 目标：Plan(Reasoner) → Write(S3) → Edit(扩/缩) → Validate(规则)

## 创建项目
- project_id: 8be3bf88-7966-48ad-89f4-a9b5c4bea7e6
- title: 风暴之夜的灯塔回声
- constraints.reading_level: middle_grade

## Stage1 · 规划蓝图（Reasoner）
- 参数：useReasoner=true, candidates=2, effort=medium, wordsPerScene=1200
- 耗时：约 204s
- 结果（节选）：
```
{
  "central_miracle": "灯塔在风暴之夜发出神秘回声...",
  "characters": [ {"name":"Liam"}, {"name":"Sophia"}, {"name":"Old Man Finn"}, ... ],
  "three_act_structure": { "act1": "设谜...", "act2":"调查...", "act3":"揭示..." },
  "clue_matrix": [
    { "clue":"奇怪回声", "chapter":1 },
    { "clue":"Finn的回避", "chapter":2 },
    { "clue":"古老地图", "chapter":3 },
    { "clue":"天气记录", "chapter":4 },
    { "clue":"Echo的故事", "chapter":5 }
  ],
  "timeline": [
    { "event":"风暴预警发布", "chapter":1, "is_peak":false },
    { "event":"风暴达到高峰", "chapter":3, "is_peak":true },
    { "event":"冲突解决与社区和解", "chapter":5, "is_peak":false }
  ]
}
```

> 注：Reasoner 输出键名为 `central_miracle` / `clue_matrix` / `three_act_structure`，与校验器预期的 `centralTrick` / `clueMatrix` / `acts` 存在偏差（见 Stage4）。

## Stage2 · 逐章写作（scene_id=S3，words≈1200 期望）
- 参数：profile=strict, seed=42, targets.wordsPerScene=1200
- 耗时：23s
- 输出：
  - title: 风暴高峰与古老地图
  - wordCount: 443（未达目标）
  - 内容（片段）：
```
[CLUE: 古老地图 - 标记着回声的关键位置]
[CLUE: 奇怪回声 - 在风暴高峰时变得更强烈]
[CLUE: Finn的回避 - 他对地图来源含糊其辞]
```

## Stage3 · 编辑降级（篇幅调控）
- 参数：profile=strict, seed=42, targets.wordsPerScene=1200
- 耗时：99s
- 结果：
  - wordCount: 443（未显著扩写；篇幅调控提示未被充分遵守）
  - 语言指标（见 Stage4）：平均句长≈9.44，禁词=0，长句占比≈7.7%

## Stage4 · 快速校验（单章/最小草稿）
- outlineId: edd960c6-2fbf-42a5-bd44-09989ba96523
- 汇总：pass=1, warn=7, fail=0
- 规则明细：
  - clue-foreshadowing: warn（蓝图未按预期键名提供线索矩阵）
  - timeline-consistency: warn（时间线事件无标准时刻格式，如 DayX HH:MM）
  - chekhov-recovery: warn（缺少 mustForeshadow/章节数据）
  - red-herring-ratio: warn（章节未提供埋点元数据）
  - fairness-min-exposures: warn（无法计算）
  - timeline-from-text: warn（正文未解析出显式时刻）
  - device-feasibility: warn（机制关键词缺失：滑轮/风道/潮/共振，仅本例蓝图相关）
  - language-adaptation: pass（avgSentenceLen=9.44，禁词=0）

---

# 结论与两点反思

1) Schema/映射不一致导致校验偏高告警
- 现象：Reasoner 蓝图字段为 `central_miracle`/`clue_matrix`/`three_act_structure` 等，而校验器期望 `centralTrick`/`clueMatrix`/`acts`；时间线没有 `DayX HH:MM` 标准时刻，导致多条 warn。
- 优化方案：
  - 添加入库前的“蓝图 Mapper”（Reasoner→内部Schema），统一键名与结构；ajv 强校验并返回结构化错误。
  - Planner/Reasoner 提示词附上明确 JSON Schema 摘要（字段名与类型），并在 system 中强调“仅 JSON，禁止解释”。
  - 时间线增加格式示例与正则校验，不合规立即二次小调用修正。

2) 篇幅调控未生效（Editor 未扩写到目标≈1200）
- 现象：单章 443 字，Editor 说明“若 < 0.85×目标则扩写”，但实际未扩写。
- 优化方案：
  - 编辑改为“双段式”策略：
    - A) 先用 Writer-continue 生成“增补段落提纲（要点列表）”；
    - B) 再用 Editor-merge 将原文与增补段落合并，目标字数±15%。
  - 明确 target 为“至少 N 字”，并给最小/最大阈值，提供范例。
  - 添加程序侧兜底：若仍未达标，自动追加一轮“扩写重点（景物/动作/心理）”，直到进入区间。

---

# 建议的后续修复（即可落地）
- 后端（M1/M2 补强）
  - 蓝图 ajv Schema + `reasonerOutlineMapper.ts`：统一字段名并补齐缺省值。
  - 时间线标准化器：将 chapter 索引转换为 DayX 时刻或补全示例时刻。
  - Editor 篇幅控制：实现“二段式扩写合并”逻辑（失败自动重试≤2）。
- 前端
  - Plan 成功后在 Outline 面板展示“Schema 兼容性状态”（绿色/黄色提示）。
  - 快速校验卡片显示“可用”徽章（已实现标准：pass≥6, fail=0），并对未达标项提供“一键修复”触发。

---

# 附：原始接口回放（精简）
- POST /api/projects → 201：8be3bf88-7966-48ad-89f4-a9b5c4bea7e6
- POST /api/projects/:id/plan (reasoner) → outline（204s）
- POST /api/projects/:id/write?scene_id=S3 → 443字
- POST /api/projects/:id/edit?scene_id=S3 → 443字（未扩/缩）
- POST /api/projects/:id/validate → pass=1, warn=7, fail=0

