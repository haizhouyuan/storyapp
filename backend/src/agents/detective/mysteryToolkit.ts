import { randomUUID } from 'crypto';
import type {
  DetectiveMechanismPreset,
  MysteryContract,
  MysteryContractClause,
  MysteryPatternProfile,
  MysteryPatternTrick,
} from '@storyapp/shared';

const CONTRACT_VERSION = 'mc.v1';

const BASE_CLAUSES: MysteryContractClause[] = [
  {
    id: 'fair-play-visible-clues',
    title: '关键线索需提前呈现',
    description: '所有破案所需的核心线索必须在揭示前以文本显式展示，禁止靠侦探内心独白或隐形知识推进。',
    category: 'fair_play',
  },
  {
    id: 'fair-play-no-new-culprit',
    title: '真凶不得末章登场',
    description: '禁止在最终揭示阶段突然引入此前未正式出现的角色作为真凶。',
    category: 'fair_play',
  },
  {
    id: 'narrative-demonstration',
    title: '收束需包含演示或复盘',
    description: '结尾必须通过聚众复盘（波洛式）或实验演示（福尔摩斯式）逐条解释线索与推理。',
    category: 'narrative',
  },
  {
    id: 'pov-watsonization',
    title: '侦探推理延迟披露',
    description: '采用华生/搭档叙述视角，侦探的关键推断先以线索描写铺垫，真相只在揭示环节完全阐明。',
    category: 'pov',
  },
  {
    id: 'spoiler-balanced-mmo',
    title: '嫌疑人需具备竞争性解释',
    description: '至少两名嫌疑人在动机、手段、机会三轴上保持竞争张力，直到关键线索出现才被排除。',
    category: 'spoiler_control',
  },
];

const BASE_OBSERVABLES = [
  '线索→推论→结论链路需可逆推',
  '时间线必须能与章节锚点对应',
  '至少一条红鲱鱼用于误导推理方向',
];

const BASE_ENFORCEMENT_NOTES = [
  '违反公平原则的章节需在 Stage3 标记为 must-fix',
  '若演示环节缺失，Stage4 自动生成揭示脚本时须补足',
];

const PATTERN_LIBRARY: MysteryPatternProfile[] = [
  {
    id: 'locked-room-clockwork',
    label: '时序锁定密室',
    synopsis: '利用机械或时间差制造表面密室，真实出口通过机关或延迟触发释放。',
    trickSet: [
      {
        id: 'delayed-trigger',
        label: '延迟触发',
        description: '利用发条、化学或温差延迟实现杀人或开锁动作。',
        requiredObservables: ['提前埋设装置的细节描写', '受害者死亡时间存在误差'],
        verificationHints: ['在结尾演示机关运作', '提供实验佐证延迟机制'],
      },
      {
        id: 'secondary-exit',
        label: '隐蔽出口',
        description: '现场存在未被注意到的二级通道或暗门，被机关触发短暂开启。',
        requiredObservables: ['空间结构提示', '有物理痕迹指向暗门/机关'],
        verificationHints: ['让侦探重现打开暗门', '线索指明关门声/痕迹'],
      },
    ],
    structuralBeats: [
      'Chapter 1：密室发现 + 初始误导',
      'Chapter 2：嫌疑人证言与矛盾建立',
      'Chapter 3：机关破绽显现 + 复盘实验',
    ],
    constraints: [
      '必须设置至少一次时间线错觉',
      '暗门或机关需在前文通过环境描写可被读者察觉',
    ],
    detectorHints: [
      '注意受害者周围的机械或钟表道具',
      '观察证言中的时间表述误差'],
    compatibleMechanisms: ['clockwork', 'thermal-trigger', 'remote-mechanism'],
    version: 'mp.v1',
  },
  {
    id: 'alibi-collapse',
    label: '不在场反转',
    synopsis: '通过对时间线细节的再检验推翻看似牢固的不在场证明。',
    trickSet: [
      {
        id: 'clock-misdirection',
        label: '时间偏移',
        description: '利用调表、录音或心理暗示制造时间误差，让证人误记关键时间。',
        requiredObservables: ['时间提示反复出现', '存在可被调节的时间道具'],
        verificationHints: ['侦探在结尾展示调表过程', '证词对照表显示矛盾'],
      },
      {
        id: 'proxy-action',
        label: '代理行动',
        description: '真凶通过委托、自动装置或远程触发完成犯罪。',
        requiredObservables: ['出现可远程操作的物件', '嫌疑人与道具存在隐秘联系'],
        verificationHints: ['揭示真凶掌控代理手段的证据', '提供排除其他嫌疑人的关键信息'],
      },
    ],
    structuralBeats: [
      'Chapter 1：呈现铁证般的不在场证明',
      'Chapter 2：证词比对与矛盾累积',
      'Chapter 3：拆解误差 + 揭露代理手段',
    ],
    constraints: ['至少两名嫌疑人共享同一貌似充分的不在场理由'],
    detectorHints: ['关注对时间的重复描述', '检查证词之间的细微差别'],
    compatibleMechanisms: ['remote-mechanism', 'clockwork', 'psychological', 'electro-magnetic'],
    version: 'mp.v1',
  },
  {
    id: 'psychological-duel',
    label: '心理对决闭环',
    synopsis: '通过心理画像与人际网络冲突揭示真凶，强调人性矛盾。',
    trickSet: [
      {
        id: 'behavioral-loop',
        label: '行为循环',
        description: '利用角色固有习惯或心理弱点制造破绽。',
        requiredObservables: ['反复描写角色习惯', '出现心理暗示或情绪触发器'],
        verificationHints: ['侦探在揭示时引用行为统计或心理证据'],
      },
      {
        id: 'closed-circle-pressure',
        label: '闭环压力',
        description: '通过封闭的人际关系网让每个成员都有理由隐瞒真相，真凶利用矛盾操控局面。',
        requiredObservables: ['明确的人际冲突描述', '有意的群体对峙场景'],
        verificationHints: ['波洛式聚众揭示，逐一拆穿隐藏动机'],
      },
    ],
    structuralBeats: [
      'Chapter 1：建立群体矛盾与公共秘密',
      'Chapter 2：揭开心理弱点与相互制衡',
      'Chapter 3：聚众揭示 + 人性反转',
    ],
    constraints: ['至少描写三场心理博弈或盘问'],
    detectorHints: ['留意角色口头禅与情绪失控瞬间'],
    compatibleMechanisms: ['psychological', 'acoustic-resonance', 'botanical'],
    version: 'mp.v1',
  },
];

export interface MysteryFoundation {
  contract: MysteryContract;
  pattern: MysteryPatternProfile;
  promptSnippet: string;
}

function cloneContract(): MysteryContract {
  return {
    id: `contract-${randomUUID()}`,
    title: '福尔摩斯/波洛黄金时代创作契约',
    detectiveCode: 'Holmes-Poirot Fair Play',
    summary: '遵循公平线索展示与秩序化收束，确保读者可凭文本完成推理。',
    clauses: BASE_CLAUSES.map((clause) => ({ ...clause })),
    observables: [...BASE_OBSERVABLES],
    enforcementNotes: [...BASE_ENFORCEMENT_NOTES],
    references: [
      'Van Dine Rules #1-#5',
      "Knox's Decalogue",
      'Holmes Demonstration Principle',
      'Poirot Method & Order Doctrine',
    ],
    version: CONTRACT_VERSION,
  };
}

function pickPatternForMechanism(mechanism?: DetectiveMechanismPreset): MysteryPatternProfile {
  const group = mechanism?.validatorGroup;
  const compatible = PATTERN_LIBRARY.filter((pattern) =>
    !pattern.compatibleMechanisms || (group && pattern.compatibleMechanisms.includes(group))
  );
  const source = compatible.length > 0 ? compatible : PATTERN_LIBRARY;
  const index = Math.floor(Math.random() * source.length);
  const chosen = source[index];
  return {
    ...chosen,
    trickSet: chosen.trickSet.map((trick) => ({ ...trick })),
    structuralBeats: chosen.structuralBeats ? [...chosen.structuralBeats] : undefined,
    constraints: chosen.constraints ? [...chosen.constraints] : undefined,
    detectorHints: chosen.detectorHints ? [...chosen.detectorHints] : undefined,
    compatibleMechanisms: chosen.compatibleMechanisms ? [...chosen.compatibleMechanisms] : undefined,
  };
}

function summarizeClauses(clauses: MysteryContractClause[]): string {
  return clauses
    .map((clause, index) => `${index + 1}. ${clause.title}：${clause.description}`)
    .join('\n');
}

function summarizeTricks(tricks: MysteryPatternTrick[]): string {
  return tricks
    .map((trick: MysteryPatternTrick, index) => `${index + 1}. ${trick.label} — ${trick.description}`)
    .join('\n');
}

export function prepareMysteryContract(mechanism?: DetectiveMechanismPreset): MysteryContract {
  const contract = cloneContract();
  if (mechanism?.label) {
    contract.summary = `${contract.summary} 本案机关类型：${mechanism.label}。`;
    contract.enforcementNotes = [
      ...(contract.enforcementNotes ?? []),
      `确保所有与「${mechanism.label}」机关相关的关键线索至少埋设两次。`,
    ];
  }
  return contract;
}

export function selectMysteryPattern(mechanism?: DetectiveMechanismPreset): MysteryPatternProfile {
  return pickPatternForMechanism(mechanism);
}

export function buildMysteryFoundation(mechanism?: DetectiveMechanismPreset): MysteryFoundation {
  const contract = prepareMysteryContract(mechanism);
  const pattern = selectMysteryPattern(mechanism);
  const clauseSummary = summarizeClauses(contract.clauses);
  const trickSummary = summarizeTricks(pattern.trickSet);
  const structuralHints = pattern.structuralBeats?.length
    ? `结构建议：\n- ${pattern.structuralBeats.join('\n- ')}`
    : '';
  const constraints = pattern.constraints?.length
    ? `约束：${pattern.constraints.join('；')}`
    : '';
  const promptSnippet = [
    `Mystery Contract《${contract.title}》：${contract.summary}`,
    clauseSummary,
    `诡计模式《${pattern.label}》：${pattern.synopsis}`,
    `推荐诡计：\n${trickSummary}`,
    structuralHints,
    constraints,
  ]
    .filter((segment) => segment && segment.trim().length > 0)
    .join('\n\n');

  return {
    contract,
    pattern,
    promptSnippet,
  };
}
