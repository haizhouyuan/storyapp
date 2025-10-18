export interface DetectiveMechanismPreset {
  id: string;
  label: string;
  description: string;
  keywords: string[];
  validatorGroup:
    | 'remote-mechanism'
    | 'optical-illusion'
    | 'clockwork'
    | 'pressure-trigger'
    | 'electro-magnetic'
    | 'chemical-delay'
    | 'acoustic-resonance'
    | 'thermal-trigger'
    | 'psychological'
    | 'botanical';
}

export type DetectiveMechanismGroup = DetectiveMechanismPreset['validatorGroup'];

export const DETECTIVE_MECHANISM_PRESETS: DetectiveMechanismPreset[] = [
  {
    id: 'clockwork-orchestrator',
    label: '钟表齿轮连动机关',
    description: '通过钟表齿轮、发条与联动杆件构建延时或同步触发的机械机关。',
    keywords: ['齿轮', '发条', '钟表', '联动'],
    validatorGroup: 'clockwork',
  },
  {
    id: 'optical-phantom',
    label: '光影镜像错觉机关',
    description: '利用镜面、折射、投影等光学手段制造目击错觉或伪造不在场证明。',
    keywords: ['镜面', '折射', '投影', '光线'],
    validatorGroup: 'optical-illusion',
  },
  {
    id: 'pressure-siphon',
    label: '压力与管道触发机关',
    description: '借助蒸汽、气压或液压差异，通过阀门与管道系统触发远程行动。',
    keywords: ['压力', '蒸汽', '管道', '阀门'],
    validatorGroup: 'pressure-trigger',
  },
  {
    id: 'electro-magnetic-web',
    label: '电磁感应机关',
    description: '利用线圈、电流与磁场变化，实现隐蔽的吸附、脱扣或触发动作。',
    keywords: ['电磁', '磁场', '线圈', '电流'],
    validatorGroup: 'electro-magnetic',
  },
  {
    id: 'chemical-latency',
    label: '化学缓释机关',
    description: '通过药剂、缓释材料或氧化反应制造延时触发或伪装现象。',
    keywords: ['药剂', '缓释', '化学', '溶剂'],
    validatorGroup: 'chemical-delay',
  },
  {
    id: 'acoustic-resonator',
    label: '声学共振迷局',
    description: '利用隐蔽的音叉、共鸣腔与管道制造定向声波或回声，伪造目击证词。',
    keywords: ['共鸣', '声波', '音叉', '回声'],
    validatorGroup: 'acoustic-resonance',
  },
  {
    id: 'thermal-switch',
    label: '温差触发机关',
    description: '通过金属热胀冷缩、易熔合金或蜡封，实现延迟开锁或断绳等动作。',
    keywords: ['温度', '熔点', '金属', '蜡封'],
    validatorGroup: 'thermal-trigger',
  },
  {
    id: 'psychological-misdirect',
    label: '心理暗示操控',
    description: '借助角色心理弱点、暗示或催眠记录引导错误判断，形成假不在场证明。',
    keywords: ['心理', '暗示', '记忆', '习惯'],
    validatorGroup: 'psychological',
  },
  {
    id: 'botanical-clock',
    label: '植物生长计时机关',
    description: '利用含羞草、藤蔓或花粉等植物生物钟制造时间差与证据误导。',
    keywords: ['植物', '藤蔓', '花粉', '含羞草'],
    validatorGroup: 'botanical',
  },
  {
    id: 'remote-lever-network',
    label: '远程杠杆联动机关',
    description: '利用绳索、杠杆、配重与隐藏通道实现远程触发或伪装密室。',
    keywords: ['杠杆', '配重', '滑轮', '绳索'],
    validatorGroup: 'remote-mechanism',
  },
];

export const DETECTIVE_MECHANISM_GROUPS: Record<DetectiveMechanismGroup, { triggers: string[]; requires: string[] }> = {
  'remote-mechanism': {
    triggers: ['远程', '密室', '自动', '遥控', '杠杆', '配重', '滑轮', '绳索', '暗道', '联动'],
    requires: ['杠杆', '配重', '滑轮', '绳索', '机关', '联动'],
  },
  'clockwork': {
    triggers: ['钟', '钟表', '齿轮', '发条', '联动', '齿条', '拨针'],
    requires: ['齿轮', '发条', '联动'],
  },
  'optical-illusion': {
    triggers: ['镜', '镜面', '折射', '投影', '光线', '幻影', '影像'],
    requires: ['镜', '光', '折射'],
  },
  'pressure-trigger': {
    triggers: ['压力', '气压', '水压', '蒸汽', '管道', '阀门', '虹吸'],
    requires: ['压力', '管道', '阀', '差压'],
  },
  'electro-magnetic': {
    triggers: ['电磁', '磁场', '线圈', '电流', '电路', '通电'],
    requires: ['电磁', '线圈', '电流'],
  },
  'chemical-delay': {
    triggers: ['化学', '药剂', '缓释', '氧化', '催化', '材料', '反应'],
    requires: ['化学', '药剂', '缓释'],
  },
  'acoustic-resonance': {
    triggers: ['声音', '回声', '共鸣', '音叉', '广播', '音道'],
    requires: ['声音', '共鸣', '音'],
  },
  'thermal-trigger': {
    triggers: ['温度', '热', '熔点', '蜡', '冰', '冷却', '加热'],
    requires: ['温度', '热', '熔', '金属'],
  },
  'psychological': {
    triggers: ['心理', '暗示', '记忆', '催眠', '情绪', '错觉'],
    requires: ['心理', '暗示', '记忆'],
  },
  'botanical': {
    triggers: ['植物', '藤蔓', '花粉', '种子', '生长', '树'],
    requires: ['植物', '生长', '花粉'],
  },
};
