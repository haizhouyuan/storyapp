import type { DetectiveOutline } from '@storyapp/shared';

export function createQuickOutline(topic: string): DetectiveOutline {
  const rnd = <T>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];
  const devices = [
    { name: '镜面反射与视差错位', hooks: ['镜子', '光线', '角度'], clues: ['碎裂镜边', '异常反光', '倒影偏移'] },
    { name: '磁力暗门与隐匿锁舌', hooks: ['磁铁', '隐藏门闩', '铁屑'], clues: ['门缝铁粉', '桌角磁痕', '指南针偏转'] },
    { name: '双时钟错位的不在场', hooks: ['双表', '错时刻度', '指针'], clues: ['指针划痕', '不同走时', '报时不合'] },
    { name: '气压变化触发机关', hooks: ['密封管', '气压差', '阀门'], clues: ['玻璃雾气', '纸屑抖动', '门缝气流'] },
    { name: '绳索滑轮隐形替身', hooks: ['细线', '配重', '遮挡'], clues: ['线痕', '配重灰印', '天花吊点'] },
    { name: '化学显色与隐形墨', hooks: ['显色剂', '盐类', '温度'], clues: ['盐霜字迹', '温感痕', '试纸反应'] }
  ];
  const dev = rnd(devices);
  const allClues = Array.from(new Set(dev.clues.concat([
    '脚印缺口', '书页折角', '钥匙磨损', '灰尘被擦拭', '手套粉末', '地毯拖痕'
  ])));
  const pick = (n: number) => {
    const src = allClues.slice();
    const out: string[] = [];
    while (out.length < n && src.length) {
      out.push(src.splice(Math.floor(Math.random() * src.length), 1)[0]);
    }
    return out;
  };
  const keyClues = pick(4);

  const outline: any = {
    centralTrick: {
      summary: `${dev.name} 的可行诡计`,
      mechanism: `围绕 ${dev.hooks.join('、')} 组成的触发链条`,
      fairnessNotes: ['关键要素在前两章均有可观察线索']
    },
    caseSetup: {
      victim: '霍华德',
      crimeScene: rnd(['钟楼密室','展厅密室','图书室密室']),
      initialMystery: `${topic} · 不可能状况的初始悖论`
    },
    characters: [
      { name: '蛋蛋', role: 'detective', motive: '好奇与正义' },
      { name: '霍华德', role: 'victim' },
      { name: '艾琳', role: 'suspect', motive: '遗物纠纷' },
      { name: '詹姆斯', role: 'suspect', motive: '研究占有' },
      { name: '莉莉安', role: 'suspect', motive: '财务压力' },
      { name: '管家', role: 'witness' }
    ],
    acts: [
      { act: 1, focus: '设谜与发现', beats: [
        { beat: 1, summary: `${topic} · 开场与异常现象` },
        { beat: 2, summary: '发现尸体与空间封闭' }
      ]},
      { act: 2, focus: '调查与实验', beats: [
        { beat: 1, summary: `围绕「${dev.name}」的实验与排除` },
        { beat: 2, summary: '时间线复核与指证动机' }
      ]},
      { act: 3, focus: '复盘与揭晓', beats: [
        { beat: 1, summary: '复盘线索与揭示诡计' },
        { beat: 2, summary: '指认凶手与善后' }
      ]}
    ],
    clueMatrix: keyClues.map((c, i) => ({
      clue: c,
      surfaceMeaning: '表面解释',
      realMeaning: '真实指向',
      appearsAtAct: i < 2 ? 1 : 2,
      mustForeshadow: true,
      explicitForeshadowChapters: i < 2 ? ['Chapter 1'] : ['Chapter 1','Chapter 2']
    })),
    timeline: [
      { time: 'Day1 19:30', event: rnd(['宾客抵达','安保交接','灯光测试']) },
      { time: 'Day1 20:00', event: rnd(['异常声响','最后一次会面','灯光骤暗']) },
      { time: 'Day1 20:10', event: rnd(['发现尸体','房门再度上锁','人群混乱']) }
    ],
    themes: rnd([['成长','勇气'],['观察','逻辑'],['友谊','责任']]),
    logicChecklist: ['线索在揭露前已出现','时间线前后一致']
  };
  return outline as DetectiveOutline;
}

export function synthMockChapter(sceneId: string, outline: DetectiveOutline) {
  const clues = (outline as any)?.clueMatrix || [];
  const clueNames = clues.slice(0, 3).map((c: any) => c.clue);
  const times = (outline as any)?.timeline?.map((e: any) => e.time) || [];
  const title = `Scene ${sceneId} · 古堡调查`;
  const body = [
    `【${title}】`,
    `我和同伴在回廊里记录细节。`,
    `墙角留有[CLUE:${clueNames[0] || '线索一'}]，像是不经意的提示。`,
    `桌上压着[CLUE:${clueNames[1] || '线索二'}]，与 ${times[1] || 'Day1 20:00'} 的时间点相呼应。`,
    `扶手旁残留[CLUE:${clueNames[2] || '线索三'}]，让我意识到有人动过手脚。`,
    `这些看似普通的痕迹，将谜题一步步指向真相。`
  ].join('\n');
  return {
    title,
    summary: '调查现场与关键线索铺垫',
    wordCount: body.length,
    content: body,
    cluesEmbedded: clueNames.filter(Boolean),
    redHerringsEmbedded: [],
  };
}
