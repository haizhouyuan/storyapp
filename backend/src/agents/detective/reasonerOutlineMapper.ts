import type { DetectiveOutline } from '@storyapp/shared';

// 将 Reasoner/自由格式蓝图 映射为内部 DetectiveOutline 结构
// 并对时间线进行标准化（将 chapter 索引转换为 DayX HH:MM）
export function mapReasonerOutlineToDetectiveOutline(input: any): DetectiveOutline {
  const out: DetectiveOutline = {} as any;

  // centralTrick
  const cm = input?.central_miracle || input?.centralMiracle || input?.centralTrick || '';
  out.centralTrick = {
    summary: typeof cm === 'string' ? cm : String(cm || ''),
    mechanism: typeof input?.mechanism === 'string' ? input.mechanism : (typeof cm === 'string' ? cm : ''),
    fairnessNotes: Array.isArray(input?.fairnessNotes) ? input.fairnessNotes : [],
  };

  // characters
  const chars = Array.isArray(input?.characters) ? input.characters : [];
  out.characters = chars.map((c: any, idx: number) => ({
    name: String(c?.name || c?.id || `角色${idx + 1}`),
    role: String(c?.role || 'character'),
    motive: c?.motive ? String(c.motive) : undefined,
    secrets: Array.isArray(c?.secrets) ? c.secrets.map((s: any) => String(s)) : undefined,
  }));

  // acts / three_act_structure → acts
  if (Array.isArray(input?.acts)) {
    out.acts = input.acts.map((a: any, i: number) => ({
      act: Number(a?.act ?? (i + 1)),
      focus: String(a?.focus || a?.goal || ''),
      beats: Array.isArray(a?.beats)
        ? a.beats.map((b: any, j: number) => ({
            beat: Number(b?.beat ?? (j + 1)),
            summary: String(b?.summary || b?.purpose || ''),
            cluesRevealed: Array.isArray(b?.cluesRevealed) ? b.cluesRevealed.map((x: any) => String(x)) : undefined,
            redHerring: b?.redHerring ? String(b.redHerring) : undefined,
          }))
        : [
            { beat: 1, summary: String(a?.focus || '设谜') },
            { beat: 2, summary: '推进/冲突' },
          ],
    }));
  } else if (input?.three_act_structure) {
    const s = input.three_act_structure;
    out.acts = [
      { act: 1, focus: String(s?.act1 || s?.act_1 || '设谜'), beats: [{ beat: 1, summary: '引子/设谜' }, { beat: 2, summary: '发现线索' }] },
      { act: 2, focus: String(s?.act2 || s?.act_2 || '调查'), beats: [{ beat: 1, summary: '调查/实验' }, { beat: 2, summary: '反转/阻碍' }] },
      { act: 3, focus: String(s?.act3 || s?.act_3 || '揭晓'), beats: [{ beat: 1, summary: '复盘/揭晓' }, { beat: 2, summary: '善后' }] },
    ];
  } else {
    out.acts = [
      { act: 1, focus: '设谜', beats: [{ beat: 1, summary: '引子' }, { beat: 2, summary: '发现案情' }] },
      { act: 2, focus: '调查', beats: [{ beat: 1, summary: '搜集线索' }, { beat: 2, summary: '遭遇挫折' }] },
      { act: 3, focus: '揭晓', beats: [{ beat: 1, summary: '复盘' }, { beat: 2, summary: '结局' }] },
    ];
  }

  // clueMatrix / clue_matrix
  const cluesRaw = Array.isArray(input?.clueMatrix) ? input.clueMatrix : Array.isArray(input?.clue_matrix) ? input.clue_matrix : [];
  out.clueMatrix = cluesRaw.map((k: any) => {
    const chapterNo = typeof k?.chapter === 'number' ? k.chapter : undefined;
    const explicit = chapterNo ? [`Chapter ${chapterNo}`] : undefined;
    return {
      clue: String(k?.clue || k?.name || ''),
      surfaceMeaning: k?.surfaceMeaning ? String(k.surfaceMeaning) : undefined,
      realMeaning: k?.realMeaning ? String(k.realMeaning) : undefined,
      appearsAtAct: typeof k?.appearsAtAct === 'number' ? k.appearsAtAct : undefined,
      mustForeshadow: typeof k?.mustForeshadow === 'boolean' ? k.mustForeshadow : true,
      explicitForeshadowChapters: Array.isArray(k?.explicitForeshadowChapters)
        ? k.explicitForeshadowChapters.map((x: any) => String(x))
        : explicit,
    };
  });

  // timeline 标准化：支持 {event, chapter} 或已提供 {time, event}
  const tlRaw = Array.isArray(input?.timeline) ? input.timeline : [];
  out.timeline = tlRaw.map((t: any) => {
    if (t?.time) {
      return { time: String(t.time), event: String(t.event || '') };
    }
    const ch = typeof t?.chapter === 'number' ? t.chapter : 1;
    // 默认固定 20:00，满足 Schema 的 DayX HH:MM 格式
    return { time: `Day${ch} 20:00`, event: String(t?.event || '') };
  });

  // themes / logicChecklist（可选）
  out.themes = Array.isArray(input?.themes) ? input.themes.map((x: any) => String(x)) : ['风暴', '灯塔', '成长'];
  out.logicChecklist = Array.isArray(input?.logicChecklist) ? input.logicChecklist.map((x: any) => String(x)) : ['线索在揭露前已出现', '时间线前后一致'];

  // caseSetup（可选推导）
  if (!input?.caseSetup) {
    out.caseSetup = {
      victim: '（待定）',
      crimeScene: '灯塔',
      initialMystery: out.centralTrick?.summary || '回声的来源',
    };
  } else {
    out.caseSetup = {
      victim: String(input.caseSetup?.victim || '（待定）'),
      crimeScene: String(input.caseSetup?.crimeScene || '（待定）'),
      initialMystery: String(input.caseSetup?.initialMystery || out.centralTrick?.summary || ''),
    };
  }

  return out;
}
