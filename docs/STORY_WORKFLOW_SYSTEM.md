# 故事创作工作流系统 (Story Creation Workflow System)

## 系统概述

这是一个专为推理小说（特别是本格推理）设计的标准化创作工作流系统。它将复杂的推理小说创作过程分解为10个可执行、可校验、可协作的阶段，从灵感到成品实现全流程管理。

## 核心价值

1. **标准化创作流程** - 将经验性的创作过程转化为可重复的工作流
2. **自动化质量校验** - 通过逻辑引擎确保推理小说的公平性和逻辑严密性  
3. **智能创作辅助** - 集成LLM提供创作建议和自动生成功能
4. **多人协作支持** - 支持不同角色的权限管理和协作流程
5. **数据驱动优化** - 通过仪表盘和指标持续改进创作质量

## 十阶段工作流程

### Stage 0: 立项 (Project Init)
- **输入**: 类型、目标读者、字数、主题意象
- **产出**: 项目卡、成功标准(DoD)
- **Gate**: DoD明确、资源估算完成

### Stage 1: 核心奇迹 (Center Miracle)
- **输入**: 一句话悬念(logline)
- **产出**: 中心诡计蓝图（自然力+工程装置+心理学）
- **Gate**: 诡计可被复现，原理合理

### Stage 2: 道具清单 & 线索经济学 (Chekhov List)
- **产出**: 道具/机关/场景/人物清单，线索预算表
- **Gate**: 所有关键结论都有潜在线索支撑

### Stage 3: 结构搭建 (三幕九节拍)
- **产出**: 节拍表、章节大纲
- **Gate**: 每幕有推进性事件，每章末有钩子

### Stage 4: 线索矩阵 & 时间-空间双轴
- **产出**: 线索矩阵表、时间线、空间图
- **Gate**: 不可能情形站不住脚，时空不打架

### Stage 5: 误导设计 & 公平性十戒审查
- **产出**: 误导五件套清单、公平性审表
- **Gate**: 关键线索已对读者公开

### Stage 6: 场景卡片 (Scene Cards) 编写
- **产出**: 每场景的目的、冲突、证据、情绪节拍、出口钩子
- **Gate**: 场景间因果链明确，叙述视角自洽

### Stage 7: 复盘章 & 证据回收
- **产出**: 复盘稿、证据逐一回收对照表
- **Gate**: 每个疑点有回应，无遗落线索

### Stage 8: 压力测试 (Logic Tests)
- **产出**: 角色换位测试、简化路径测试、公平性测试
- **Gate**: 三项测试通过率≥85%

### Stage 9: 语言打磨 & 节奏优化
- **产出**: 风格校准、信息密度控制
- **Gate**: 可读性评分达标，章节节拍波形平衡

### Stage 10: 发布与复盘 (Postmortem)
- **产出**: 读后调查、指标复盘、模板迭代
- **Gate**: 知识库归档，形成系列资产

## 核心数据模型

### 项目 (Project)
```typescript
interface Project {
  id: string;
  title: string;
  series?: string;
  genreTags: string[];
  themes: string[];
  targetWords: number;
  dod: string[];
  status: WorkflowStage;
  createdAt: Date;
  updatedAt: Date;
}
```

### 中心奇迹 (Miracle)
```typescript
interface Miracle {
  id: string;
  projectId: string;
  logline: string;
  chain: MiracleNode[];
  tolerances: string;
  replicationNote: string;
}

interface MiracleNode {
  node: string;
  type: 'natural' | 'device' | 'psychological';
}
```

### 实体管理 (Entities)
```typescript
interface Character {
  id: string;
  name: string;
  role: string;
  pov?: boolean;
}

interface Prop {
  id: string;
  name: string;
  chekhov: {
    introduce: string;
    fire: string;
    recover: string;
  };
}

interface Space {
  id: string;
  name: string;
  layers: string[];
}
```

### 线索矩阵 (Clues)
```typescript
interface Clue {
  id: string;
  desc: string;
  first: string; // 首次出现章节
  surface: string; // 表层含义
  truth: string; // 真相功能
  recover: string; // 回收位置
  senses: SenseType[];
}

type SenseType = 'sight' | 'sound' | 'touch' | 'smell' | 'taste' | 'intellect';
```

## 自动化校验规则

### 1. 公平线索时序
```typescript
// ∀结论C，∃线索集合S，使得 S.firstAppearance < C.revealPoint 且 |S| ≥ 2
function validateFairness(conclusions: Conclusion[], clues: Clue[]): boolean {
  return conclusions.every(conclusion => {
    const supportingClues = clues.filter(clue => 
      clue.truth === conclusion.id && 
      clue.first < conclusion.revealPoint
    );
    return supportingClues.length >= 2;
  });
}
```

### 2. Chekhov回收
```typescript
// ∀prop，引入→起效→回收 均存在
function validateChekhov(props: Prop[]): ValidationResult {
  const violations = props.filter(prop => 
    !prop.chekhov.introduce || 
    !prop.chekhov.fire || 
    !prop.chekhov.recover
  );
  return {
    passed: violations.length === 0,
    violations
  };
}
```

### 3. 时空一致性
```typescript
// 同一角色在t1~t2间的移动距离 ≤ 空间图允许的最短路径
function validateSpatialConsistency(
  timeline: TimelineEvent[], 
  spaceMap: SpaceMap
): boolean {
  // 实现角色移动路径验证逻辑
}
```

## LLM协助提示词

### 中心诡计生成
```
请基于【类型=本格/哥特/少年视角】与【主题意象=风/光/盐】生成3套中心诡计蓝图。每套包含触发源、传动链、弱点/容差、可复现实验。限制：传动链≤6节点，必须含自然力×1与人为装置×1。
```

### 线索矩阵对齐
```
根据当前节拍表与中心诡计，生成线索矩阵（表层/真义/五感），控制每条线索最多2个作用，并标注首次出现章与回收章。
```

### 误导设计
```
给出与当前线索相匹配的5种误导方案，并为每个误导配套'反证场景'，确保公平性。
```

## 协作角色分工

| 角色 | 权限 | 职责 |
|------|------|------|
| 主笔 (Author) | 场景卡、语言风格 | 创作主要内容和文风把控 |
| 逻辑官 (Logic Keeper) | 时空轴、测试用例、校验 | 确保逻辑严密性 |
| 线索官 (Clue Master) | 线索矩阵、回收表 | 管理线索的布局和回收 |
| 编辑 (Editor) | 节奏、可读性 | 整体结构和可读性优化 |
| 敏感性读者 (SR) | 伦理、角色形象 | 内容审核和形象把控 |

## 仪表盘指标

### 核心KPI
1. **公平性通过率** - 自动校验规则覆盖度
2. **线索可感指数** - 五感线索/总线索比例  
3. **误导强度** - 误导占比与反证覆盖率
4. **节奏波形** - 每章信息量/冲突强度分布
5. **Chekhov回收率** - 道具完整回收比例

### 质量评估
- 逻辑一致性评分
- 可读性指数
- 读者参与度预测
- 结构完整性检查

## 技术架构

### 后端技术栈
- **框架**: Node.js + Express + TypeScript
- **数据库**: MongoDB (文档存储) + Redis (缓存)
- **AI集成**: DeepSeek API
- **校验引擎**: 自研逻辑验证引擎

### 前端技术栈  
- **框架**: React + TypeScript + Zustand
- **UI组件**: Tailwind CSS + Headless UI
- **可视化**: D3.js (关系图) + Recharts (仪表盘)
- **白板**: Fabric.js 或 Konva.js

### 三大核心画布
1. **流程看板** - Stage 0~10列 + Gate旗标
2. **侦探板(白板)** - 节点关系图，支持拖拽
3. **时空面板** - 时间轴 + 平面/剖面图

## API设计概览

```typescript
// 项目管理
POST /api/projects
GET /api/projects/:id
PUT /api/projects/:id
DELETE /api/projects/:id

// 工作流阶段
POST /api/projects/:id/stages/:stage
GET /api/projects/:id/stages/:stage
PUT /api/projects/:id/stages/:stage

// 中心奇迹
POST /api/projects/:id/miracle
GET /api/projects/:id/miracle
PUT /api/projects/:id/miracle

// 线索管理
POST /api/projects/:id/clues
GET /api/projects/:id/clues
PUT /api/projects/:id/clues/:clueId
DELETE /api/projects/:id/clues/:clueId

// 校验测试
POST /api/projects/:id/tests/run
GET /api/projects/:id/tests/results

// 仪表盘
GET /api/projects/:id/dashboard
GET /api/projects/:id/metrics

// AI协助
POST /api/ai/generate-miracle
POST /api/ai/generate-clues  
POST /api/ai/validate-logic
```

## 示例: 《雾岚古堡的第八声》

### 中心诡计
- **触发**: 潮汐 (22:30前后)
- **链路**: 潮涨→水车→风轮G-8→风道滑轮→细铜丝→门闩/钟槌
- **弱点**: 潮差过大→击打过重；润滑不足→无法拉起门闩

### 关键线索
1. **cl1**: 七声后细"嘤" - 表层"诅咒"，真义"手杖簧片共振"
2. **cl2**: 门缝铜丝屑 - 表层"不明纤维"，真义"退火铜丝传动"  
3. **cl3**: 地板盐霜字 - 表层"遗言"，真义"盐雾揭字"

### 时间线
- 19:00 鸣钟+共振定位
- 22:30 潮涨触发一次"哐"
- 22:40 受害者靠近→失足/撞击
- 22:50 闩被丝拉开→伪密室完成

## 实施路线图

### Phase 1: 基础框架 (2周)
- [ ] 数据模型设计和MongoDB集合创建
- [ ] 基础API框架搭建
- [ ] 前端项目初始化和路由配置
- [ ] 用户认证和权限系统

### Phase 2: 核心工作流 (3周)  
- [ ] 项目创建和Stage 0-2实现
- [ ] 中心奇迹和线索矩阵功能
- [ ] 基础校验引擎
- [ ] 流程看板界面

### Phase 3: 高级功能 (3周)
- [ ] 侦探板白板功能
- [ ] 时空面板和可视化
- [ ] LLM集成和AI协助
- [ ] 高级校验规则

### Phase 4: 协作和优化 (2周)
- [ ] 多用户协作功能
- [ ] 角色权限系统
- [ ] 仪表盘和指标统计
- [ ] 性能优化和用户体验提升

### Phase 5: 示例和文档 (1周)
- [ ] 《雾岚古堡的第八声》完整示例
- [ ] 用户文档和教程
- [ ] API文档和开发指南
- [ ] 系统测试和质量保证

## 成功标准

1. **功能完整性** - 10个阶段全部实现，校验规则覆盖90%以上
2. **用户体验** - 界面直观易用，操作流畅，学习成本低
3. **系统性能** - 响应时间<2s，支持100+并发用户
4. **质量保证** - 自动测试覆盖率80%以上，无重大bug
5. **示例验证** - 至少一个完整项目示例验证工作流有效性

---

*此文档将随着开发进程持续更新*
