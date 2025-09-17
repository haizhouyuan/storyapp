// 测试脚本：《雾岚古堡的第八声》验证引擎测试
// Test Script: Validation Engine Test with "The Eighth Bell of Misty Castle"

const { ValidationEngine } = require('./backend/src/validation/validationEngine');

// 模拟《雾岚古堡的第八声》项目数据
const mockProjectData = {
  project: {
    id: 'castle-eighth-bell',
    title: '雾岚古堡的第八声',
    genreTags: ['honkaku', 'gothic', 'locked_room'],
    themes: ['风', '光', '盐'],
    targetWords: 80000,
    status: 'pressure_test',
    createdAt: new Date(),
    updatedAt: new Date()
  },
  
  miracle: {
    id: 'miracle-1',
    projectId: 'castle-eighth-bell',
    logline: '古堡钟楼的第八声钟响竟然来自已被拆除的古钟',
    chain: [
      { id: '1', node: '涨潮', type: 'natural', connections: ['2'] },
      { id: '2', node: '水车转动', type: 'device', connections: ['3'] },
      { id: '3', node: '绳索收紧', type: 'device', connections: ['4'] },
      { id: '4', node: '暗室开启', type: 'device', connections: ['5'] },
      { id: '5', node: '古钟显现', type: 'device', connections: ['6'] },
      { id: '6', node: '音波共振', type: 'natural', connections: ['7'] },
      { id: '7', node: '幻听产生', type: 'psychological', connections: [] }
    ],
    tolerances: '机关可在±30分钟内正常工作，潮汐时间误差在可接受范围内',
    replicationNote: '已在相似古堡进行过小规模测试，证明机关可行',
    weaknesses: ['潮汐时间依赖性', '绳索老化风险', '音响效果受天气影响'],
    createdAt: new Date(),
    updatedAt: new Date()
  },
  
  clues: [
    {
      id: 'clue-1',
      projectId: 'castle-eighth-bell',
      desc: '古堡地下室发现的生锈齿轮',
      first: 'Ch2',
      surface: '可能是某种废弃机关的部件',
      truth: '水车传动系统的关键部件',
      recover: 'Ch7',
      senses: ['sight', 'touch'],
      supports: ['miracle_miracle-1'],
      reliability: 8,
      importance: 7,
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      id: 'clue-2', 
      projectId: 'castle-eighth-bell',
      desc: '钟楼墙壁上的神秘凿痕',
      first: 'Ch3',
      surface: '装修时留下的痕迹',
      truth: '隐藏古钟的安装痕迹',
      recover: '复盘',
      senses: ['视觉', '触觉'],
      supports: ['miracle_miracle-1'],
      reliability: 9,
      importance: 9,
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      id: 'clue-3',
      projectId: 'castle-eighth-bell', 
      desc: '管家的作息时间表',
      first: 'Ch1',
      surface: '普通的工作安排',
      truth: '完美的不在场证明安排',
      recover: 'Ch6',
      senses: ['sight'],
      supports: [],
      reliability: 6,
      importance: 8,
      createdAt: new Date(),
      updatedAt: new Date()
    }
  ],
  
  props: [
    {
      id: 'prop-1',
      projectId: 'castle-eighth-bell',
      name: '古老的怀表',
      description: '家族传承的银制怀表',
      chekhov: {
        introduce: 'Ch1',
        fire: 'Ch5', 
        recover: 'Ch8'
      },
      properties: { material: '银', condition: '良好', hasEngraving: true },
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      id: 'prop-2',
      projectId: 'castle-eighth-bell',
      name: '钟楼的钥匙',
      description: '生锈的古老钥匙',
      chekhov: {
        introduce: 'Ch2',
        fire: 'Ch7',
        recover: '' // 缺少回收，用于测试错误检测
      },
      properties: { material: '铁', condition: '生锈', hasUniqueCut: true },
      createdAt: new Date(),
      updatedAt: new Date()
    }
  ],
  
  scenes: [
    {
      id: 'scene-1',
      projectId: 'castle-eighth-bell',
      chapterNumber: 7,
      sceneNumber: 3,
      title: '钟楼的真相',
      purpose: '揭示核心机关',
      conflict: '主角面临时间压力',
      cluesRevealed: ['clue-1', 'clue-2'],
      cluesValidated: ['clue-3'],
      senseElements: {
        sight: '月光透过彩色玻璃窗洒在古老的机关上',
        sound: '齿轮转动的嘎吱声和潮水声',
        touch: '冰冷的金属表面和颤动的绳索'
      },
      hook: '第八声钟响即将到来',
      pacing: 9,
      tension: 10,
      pov: 'detective-1',
      importance: 9,
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      id: 'scene-2',
      projectId: 'castle-eighth-bell',
      chapterNumber: 8,
      sceneNumber: 1, 
      title: '复盘：古堡的秘密',
      purpose: '复盘整个案件',
      conflict: '解释所有谜题',
      cluesRevealed: [],
      cluesValidated: ['clue-1', 'clue-2', 'clue-3'],
      senseElements: {
        sight: '壁炉的火光照亮众人的面庞'
      },
      hook: '真相大白',
      pacing: 5,
      tension: 3,
      pov: 'detective-1',
      importance: 10,
      createdAt: new Date(),
      updatedAt: new Date()
    }
  ],
  
  misdirections: [
    {
      id: 'misd-1',
      projectId: 'castle-eighth-bell',
      type: 'character',
      description: '管家的可疑行为',
      targetClue: 'clue-3',
      falseInterpretation: '管家是主要嫌疑人',
      counterEvidence: ['scene-2'],
      strength: 7,
      resolved: true,
      createdAt: new Date(),
      updatedAt: new Date()
    }
  ],
  
  characters: [
    {
      id: 'detective-1',
      projectId: 'castle-eighth-bell',
      name: '艾德华·格林',
      role: '侦探',
      pov: true,
      motivation: '揭开古堡的秘密',
      secrets: [],
      timeline: [
        {
          time: '09:00',
          event: '到达古堡',
          location: '古堡正门',
          witnesses: ['butler-1'],
          evidence: []
        },
        {
          time: '21:00', 
          event: '发现钟楼机关',
          location: '钟楼暗室',
          witnesses: [],
          evidence: ['clue-1', 'clue-2']
        }
      ],
      relationships: [],
      createdAt: new Date(),
      updatedAt: new Date()
    }
  ],
  
  timeline: [
    {
      id: 'event-1',
      projectId: 'castle-eighth-bell',
      time: '21:00',
      event: '第八声钟响',
      location: '钟楼',
      characters: ['detective-1'],
      evidence: ['clue-1', 'clue-2'],
      visibility: 'public',
      leads: [],
      createdAt: new Date(),
      updatedAt: new Date()
    }
  ]
};

// 模拟服务数据注入
function setupMockData() {
  // 注入项目数据
  const projectService = require('./backend/src/services/workflow/projectService');
  projectService.createProject(mockProjectData.project);
  
  // 注入奇迹数据
  const miracleService = require('./backend/src/services/workflow/miracleService');
  miracleService.createMiracle(mockProjectData.miracle);
  
  // 注入线索数据
  const clueService = require('./backend/src/services/workflow/clueService');
  mockProjectData.clues.forEach(clue => clueService.createClue(clue));
  
  // 注入道具数据
  const propService = require('./backend/src/services/workflow/propService');
  mockProjectData.props.forEach(prop => propService.createProp(prop));
  
  // 注入场景数据
  const sceneService = require('./backend/src/services/workflow/sceneService');
  mockProjectData.scenes.forEach(scene => sceneService.createScene(scene));
  
  // 注入误导数据
  const misdirectionService = require('./backend/src/services/workflow/misdirectionService');
  mockProjectData.misdirections.forEach(misd => misdirectionService.createMisdirection(misd));
  
  // 注入角色数据
  const characterService = require('./backend/src/services/workflow/characterService');
  mockProjectData.characters.forEach(char => characterService.createCharacter(char));
  
  // 注入时间线数据
  const timelineService = require('./backend/src/services/workflow/timelineService');
  mockProjectData.timeline.forEach(event => timelineService.createTimelineEvent(event));
}

// 运行验证测试
async function runValidationTest() {
  try {
    console.log('🚀 开始测试故事创作工作流验证引擎...\n');
    
    // 设置测试数据
    setupMockData();
    console.log('✅ 测试数据注入完成\n');
    
    // 创建验证引擎实例
    const validator = new ValidationEngine();
    
    // 运行完整验证
    const results = await validator.validateProject('castle-eighth-bell');
    
    console.log('📊 验证结果汇总:');
    console.log(`总计运行 ${results.length} 个验证规则\n`);
    
    let totalErrors = 0;
    let totalWarnings = 0;
    let totalInfos = 0;
    
    // 输出每个规则的详细结果
    for (const result of results) {
      const rule = result.ruleId;
      const passed = result.passed ? '✅' : '❌';
      const score = result.score || 0;
      
      console.log(`${passed} ${rule} (得分: ${score}/100)`);
      
      if (result.violations.length > 0) {
        result.violations.forEach(violation => {
          const icon = violation.severity === 'error' ? '🔴' : 
                      violation.severity === 'warning' ? '🟡' : '🔵';
          console.log(`  ${icon} ${violation.description}`);
          if (violation.suggestion) {
            console.log(`    💡 ${violation.suggestion}`);
          }
          
          if (violation.severity === 'error') totalErrors++;
          else if (violation.severity === 'warning') totalWarnings++;
          else totalInfos++;
        });
      }
      console.log();
    }
    
    // 总体评估
    console.log('🎯 总体评估:');
    console.log(`错误 (Error): ${totalErrors}`);
    console.log(`警告 (Warning): ${totalWarnings}`);
    console.log(`信息 (Info): ${totalInfos}`);
    
    const overallScore = results.reduce((sum, r) => sum + (r.score || 0), 0) / results.length;
    console.log(`综合得分: ${overallScore.toFixed(1)}/100`);
    
    if (overallScore >= 80) {
      console.log('🏆 验证结果：优秀 - 故事工作流质量很高！');
    } else if (overallScore >= 60) {
      console.log('👍 验证结果：良好 - 有一些需要改进的地方');
    } else {
      console.log('⚠️ 验证结果：需要改进 - 发现多个问题需要解决');
    }
    
    console.log('\n✨ 验证引擎测试完成！');
    
  } catch (error) {
    console.error('❌ 验证测试失败:', error);
    console.error(error.stack);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  runValidationTest();
}

module.exports = { runValidationTest, mockProjectData };
