import fs from 'fs';
import path from 'path';
import { DETECTIVE_MECHANISM_PRESETS, DetectiveMechanismPreset } from '@storyapp/shared';
import { runStage1Planning, runStage2Writing, runStage3Review } from '../src/agents/detective/stageRunner';
import { runStage4Validation } from '../src/agents/detective/validators';
import { enforceCluePolicy } from '../src/agents/detective/clueEnforcer';
import type { PromptBuildOptions } from '../src/agents/detective/promptBuilder';
import { mapReasonerOutlineToDetectiveOutline } from '../src/agents/detective/reasonerOutlineMapper';
import { createQuickOutline } from '../src/agents/detective/mockUtils';
import { planBlueprint } from '../src/engines/planner_llm';

interface ScriptOptions {
  topic: string;
  mechanism: DetectiveMechanismPreset;
  profile: 'strict' | 'balanced' | 'creative';
  seed?: string;
}

function parseArgs(argv: string[]): ScriptOptions {
  const topicParts: string[] = [];
  let mechanismId: string | undefined;
  let profile: ScriptOptions['profile'] = 'strict';
  let seed: string | undefined;

  argv.forEach((arg) => {
    if (arg.startsWith('--mechanism=')) {
      mechanismId = arg.split('=')[1];
    } else if (arg.startsWith('--profile=')) {
      const p = arg.split('=')[1] as ScriptOptions['profile'];
      if (p === 'strict' || p === 'balanced' || p === 'creative') {
        profile = p;
      }
    } else if (arg.startsWith('--seed=')) {
      seed = arg.split('=')[1];
    } else {
      topicParts.push(arg);
    }
  });

  const topic = topicParts.join(' ').trim() || '雾岚古堡的第八声';
  const mechanism = pickMechanism(mechanismId);
  return { topic, mechanism, profile, seed };
}

function pickMechanism(id?: string): DetectiveMechanismPreset {
  if (id) {
    const found = DETECTIVE_MECHANISM_PRESETS.find((preset) => preset.id === id);
    if (found) return found;
  }
  const index = Math.floor(Math.random() * DETECTIVE_MECHANISM_PRESETS.length);
  return DETECTIVE_MECHANISM_PRESETS[index];
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function renderChapterContent(chapter: any): string {
  const raw = String(chapter?.content ?? chapter?.text ?? '').replace(/\r\n/g, '\n');
  return raw
    .replace(/^【\[CLUE: .*?\]】.*$/gm, '')
    .replace(/【\[CLUE: .*?\]】/g, '')
    .replace(/\[CLUE: .*?\]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function toMinutes(label: string): number {
  const match = label.match(/^Day(\d+)\s+(\d{1,2}):(\d{2})$/);
  if (!match) return Number.MAX_SAFE_INTEGER;
  const day = Number(match[1]);
  const hour = Number(match[2]);
  const minute = Number(match[3]);
  return day * 24 * 60 + hour * 60 + minute;
}

function buildMockDraft(outline: any) {
  const clues: string[] = Array.isArray(outline?.clueMatrix)
    ? outline.clueMatrix.map((c: any) => String(c?.clue || '')).filter(Boolean)
    : [];
  const primaryClues = clues.slice(0, Math.max(3, Math.min(5, clues.length || 3)));
  const [clueA, clueB, clueC] = [primaryClues[0] || '钟表指针', primaryClues[1] || '秘密通道', primaryClues[2] || '被擦拭的灰尘'];
  const chapter1 = {
    title: 'Chapter 1',
    summary: '侦探抵达现场，察觉初始异常',
    content: `真实时间 19:30 的风暴夜，书院显得格外安静。侦探林墨刚踏入大厅便低声说：“馆长，${clueA} 显然被人调过。”陈明远皱眉答：“我刚才才校准，它怎么又偏了？”门口的管理员补充：“我注意到门外有${clueB}，像是拖动过重物。”林墨点头，“我们必须追问每个人当时在哪。”助手提醒：“我会记录所有人的行程。”馆长回应：“好，我会在19:45 再次检查。”林墨又叮嘱：“若有人离开，请立刻通知我。”管理员再次强调：“我会按照您的交代守在大门。”这些发现让他心中拉起警报。`,
    wordCount: 460,
    cluesEmbedded: [clueA, clueB],
    redHerringsEmbedded: [],
  };
  const chapter2 = {
    title: 'Chapter 2',
    summary: '逐步调查并重建时间线',
    content: `次日上午 20:50 的重访中，林墨与助手沿着书架检查。“你看，这里残留着${clueC}。”助手惊讶地说。林墨回答：“这说明有人在高潮前潜入。”他们询问嫌疑人。“我当时在钟塔听第二次钟声。”艾琳辩解。林墨立刻追问：“那你如何解释 ${clueA} 的错位？”詹姆斯插话：“我看到有人拖动箱子，可能留下了${clueB}。” 管家补充：“我听到风箱的声响。” 林墨命令：“请在21:00前把这些证词写成报告。”助手应声：“我会把所有细节记录在调查日志里。”多方证词让时间线逐渐清晰。`,
    wordCount: 470,
    cluesEmbedded: [clueC, clueA, clueB],
    redHerringsEmbedded: [],
  };
  const chapter3 = {
    title: 'Chapter 3',
    summary: '对峙凶手并还原机关',
    content: `夜晚 21:05，所有人被召集到大厅。林墨指着钟表说：“${clueA} 是凶手制造的不在场假象；${clueB} 说明他拖来了隐藏机关；${clueC} 则证明他亲手启动了滑轮。”嫌疑人惊呼：“你怎么知道？” 林墨沉稳回答：“因为每次钟声响起前，你总是离开座位。”另一位学生追问：“那么真正的机关在哪里？”林墨指向天花板：“正是上方的齿轮和发条，从一开始就藏在那里。”凶手慌乱地说：“我只是想拖延调查。”林墨严厉地回应：“但书院不容许这样的欺骗。”最终，凶手无力反驳，只能低声承认利用连动装置制造错觉。`,
    wordCount: 480,
    cluesEmbedded: [clueA, clueB, clueC],
    redHerringsEmbedded: [],
  };
  return {
    chapters: [chapter1, chapter2, chapter3],
    overallWordCount: chapter1.wordCount + chapter2.wordCount + chapter3.wordCount,
  };
}

function normalizeDraftStructure(rawDraft: any): { chapters: any[] } {
  if (rawDraft && Array.isArray(rawDraft.chapters)) {
    return rawDraft;
  }
  const chapterKeys = Object.keys(rawDraft || {}).filter((key) => /^chapter\d+$/i.test(key));
  if (chapterKeys.length === 0) {
    return { chapters: [] };
  }
  const chapters = chapterKeys
    .sort((a, b) => {
      const ai = Number.parseInt(a.replace(/\D/g, ''), 10);
      const bi = Number.parseInt(b.replace(/\D/g, ''), 10);
      return ai - bi;
    })
    .map((key, index) => {
      const chapter = rawDraft[key] || {};
      return {
        title: chapter.title || `Chapter ${index + 1}`,
        summary: chapter.summary || '',
        content: chapter.content || chapter.text || '',
        wordCount: chapter.words || chapter.wordCount || (chapter.content ? String(chapter.content).length : 0),
        cluesEmbedded: Array.isArray(chapter.cluesEmbedded) ? chapter.cluesEmbedded : [],
        redHerringsEmbedded: Array.isArray(chapter.redHerringsEmbedded) ? chapter.redHerringsEmbedded : [],
      };
    });
  return { chapters };
}

function simplifySentences(text: string): string {
  const raw = String(text || '').trim();
  if (!raw) return '';
  const sentences = raw
    .replace(/\s+/g, ' ')
    .replace(/[;；]/g, '，')
    .split(/[。！？!?]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const combined: string[] = [];
  sentences.forEach((sentence) => {
    if (sentence.length <= 28) {
      combined.push(`${sentence}。`);
      return;
    }
    let buffer = '';
    const fragments: string[] = [];
    sentence.split(/[,，、]/).forEach((fragment) => {
      const piece = fragment.trim();
      if (!piece) return;
      const candidate = buffer ? `${buffer}，${piece}` : piece;
      if (candidate.length > 26 && buffer) {
        fragments.push(`${buffer}。`);
        buffer = piece;
      } else {
        buffer = candidate;
      }
    });
    if (buffer) fragments.push(`${buffer}。`);
    combined.push(fragments.join(''));
  });
  return combined.join('');
}

function extractChapterTime(outline: any, chapterIndex: number): string | null {
  const label = `Chapter ${chapterIndex + 1}`;
  const events = Array.isArray(outline?.timeline) ? outline.timeline : [];
  const direct = events.find(
    (event: any) =>
      Array.isArray(event?.participants) && event.participants.some((p: string) => p === label),
  );
  if (direct?.time) {
    return String(direct.time);
  }
  if (events[chapterIndex]?.time) {
    return String(events[chapterIndex].time);
  }
  return null;
}

function formatTimeNarrative(rawTime: string | null): { hhmm: string; narrative: string } | null {
  if (!rawTime) return null;
  const match = rawTime.match(/^Day(\d+)\s+(\d{1,2}):(\d{2})$/i);
  if (!match) {
    const hhmm = rawTime.includes(':') ? rawTime : '';
    return hhmm
      ? { hhmm, narrative: `当时 ${hhmm}` }
      : null;
  }
  const day = Number.parseInt(match[1], 10);
  const hour = Number.parseInt(match[2], 10);
  const minute = match[3];
  const hhmm = `${match[2].padStart(2, '0')}:${minute}`;
  const period = (() => {
    if (hour >= 5 && hour < 8) return '清晨';
    if (hour >= 8 && hour < 12) return '上午';
    if (hour >= 12 && hour < 17) return '下午';
    if (hour >= 17 && hour < 21) return '傍晚';
    return '夜晚';
  })();
  const dayText = day > 1 ? `第${day}天` : '';
  return { hhmm, narrative: `${dayText}${period}${hour}点${minute === '00' ? '' : `${minute}分`}`.replace(/^\s+|\s+$/g, '') };
}

async function run(): Promise<void> {
  const { topic, mechanism, profile, seed } = parseArgs(process.argv.slice(2));
  console.log('🕵️ 主题：', topic);
  console.log(`🔧 使用机关预设：${mechanism.label}（关键词：${mechanism.keywords.join('、')}）`);

  const promptOpts: PromptBuildOptions = {
    profile,
    seed: seed || `${profile}-seed`,
    vars: {
      readingLevel: 'middle_grade',
      targets: { avgSentenceLen: 22, wordsPerScene: 1200 },
      cluePolicy: { ch1MinClues: 3, minExposures: 2 },
      misdirectionCap: 0.3,
      deviceKeywords: mechanism.keywords,
      mechanismId: mechanism.id,
    },
  };

  const useFastPlan = process.env.DETECTIVE_PLAN_FAST === '1' || process.env.DETECTIVE_USE_MOCK === '1';
  let outlineRaw: any;
  if (useFastPlan) {
    outlineRaw = createQuickOutline(topic);
  } else {
    const plannerResult = await planBlueprint(topic, {
      profile: promptOpts.profile,
      seed: promptOpts.seed,
      vars: promptOpts.vars,
      maxRetries: 2,
      strictSchema: true,
    });
    if (plannerResult.ok) {
      outlineRaw = plannerResult.outline as any;
    } else {
      outlineRaw = await runStage1Planning(topic, promptOpts);
    }
  }
  const outlineNormalized = mapReasonerOutlineToDetectiveOutline(outlineRaw as any);
  const outline: any = { ...outlineNormalized };
  if (!Array.isArray(outline.timeline)) {
    outline.timeline = [];
  }
  const supplementalTimes = [
    { time: 'Day1 19:45', event: '二次巡查' },
    { time: 'Day1 20:50', event: '调查证词' },
    { time: 'Day1 21:00', event: '整理证词' },
    { time: 'Day1 21:05', event: '揭示真相' },
  ];
  supplementalTimes.forEach((evt) => {
    if (!outline.timeline.some((existing: any) => existing?.time === evt.time)) {
      outline.timeline.push(evt);
    }
  });
  outline.timeline = outline.timeline
    .map((evt: any) => {
      if (typeof evt?.time === 'string' && evt.time.startsWith('Day')) return evt;
      const match = typeof evt?.time === 'string' && evt.time.match(/^(\d{1,2}):(\d{2})$/);
      if (match) {
        return { time: `Day1 ${match[0]}`, event: evt?.event || '' };
      }
      return evt;
    })
    .sort((a: any, b: any) => toMinutes(String(a?.time || 'Day1 00:00')) - toMinutes(String(b?.time || 'Day1 00:00')));
  if (!outline.centralTrick) {
    outline.centralTrick = {};
  }
  if (typeof outline.centralTrick.summary !== 'string' || !outline.centralTrick.summary.trim() || outline.centralTrick.summary === '[object Object]') {
    outline.centralTrick.summary = `${mechanism.label} 的机关布置`;
  }
  if (typeof outline.centralTrick.mechanism !== 'string' || !outline.centralTrick.mechanism.trim()) {
    outline.centralTrick.mechanism = `${mechanism.description}。关键词：${mechanism.keywords.join('、')}。`;
  }

  if (!Array.isArray(outline.clueMatrix)) {
    const candidates = Array.isArray(outline.clues) ? outline.clues : [];
    outline.clueMatrix = candidates.slice(0, 5).map((c: any, i: number) => ({
      clue: String(c?.clue || c?.name || `线索${i + 1}`),
      surfaceMeaning: String(c?.surfaceMeaning || c?.hint || ''),
      realMeaning: String(c?.realMeaning || ''),
      appearsAtAct: 1,
      mustForeshadow: true,
      explicitForeshadowChapters: ['Chapter 1', 'Chapter 2'],
    }));
  }
  const timelineRaw = Array.isArray(outline.timeline) ? outline.timeline : [];
  outline.timeline = timelineRaw.map((event: any, idx: number) => {
    const raw = String(event?.time || '');
    if (/^Day\d+\s+\d{1,2}:\d{2}$/i.test(raw)) {
      return event;
    }
    const hhmmMatch = raw.match(/(\d{1,2}:\d{2})/);
    const fallback = hhmmMatch ? hhmmMatch[1] : `20:${String(idx).padStart(2, '0')}`;
    return {
      time: `Day1 ${fallback}`,
      event: String(event?.event || event?.description || `事件${idx + 1}`),
      participants: event?.participants || [],
    };
  });

  console.log('\n📋 Stage1 Outline:');
  console.log(JSON.stringify(outline, null, 2));

  let draft: any;
  let review: any;
  if (useFastPlan) {
    draft = normalizeDraftStructure(buildMockDraft(outline));
    review = {
      approved: true,
      score: { logic: 85, fairness: 88, pacing: 80 },
      issues: [],
      suggestions: [],
      mustFixBeforePublish: [],
      contentWarnings: [],
    };
    console.log('\n📚 Stage2 Story Draft (mock):');
    console.log(JSON.stringify(draft, null, 2));
    console.log('\n🔍 Stage3 Review (mock):');
    console.log(JSON.stringify(review, null, 2));
  } else {
    const draftRaw = await runStage2Writing(outline, promptOpts);
    draft = normalizeDraftStructure(draftRaw);
    console.log('\n📚 Stage2 Story Draft (raw):');
    console.log(JSON.stringify(draftRaw, null, 2));
    console.log('\n📚 Stage2 Story Draft (normalized):');
    console.log(JSON.stringify(draft, null, 2));

    review = await runStage3Review(outline, draft, promptOpts);
    console.log('\n🔍 Stage3 Review:');
    console.log(JSON.stringify(review, null, 2));
  }

  const { draft: fixedDraft, outline: fixedOutline, changes } = enforceCluePolicy(outline as any, draft as any, {
    ch1MinClues: 3,
    minExposures: 2,
    ensureFinalRecovery: true,
    adjustOutlineExpectedChapters: true,
    maxRedHerringRatio: 0.3,
    maxRedHerringPerChapter: 2,
  });
  if (changes?.length) {
    console.log('\n🛠️ AutoFix Changes:');
    console.log(JSON.stringify(changes, null, 2));
  }

  const editedChapters = (fixedDraft?.chapters || []).map((chapter: any, index: number) => {
    const compact = simplifySentences(chapter.content || '');
    const timeRaw = extractChapterTime(fixedOutline || outline, index);
    const timeInfo = formatTimeNarrative(timeRaw);
    const content = timeInfo
      ? `(${timeInfo.hhmm}) ${timeInfo.narrative} ${compact}`.replace(/\s+/g, ' ').trim()
      : compact;
    return { ...chapter, content };
  });
  const editedDraft = { ...fixedDraft, chapters: editedChapters };

  const validation = runStage4Validation((fixedOutline || outline) as any, editedDraft as any);
  console.log('\n✅ Stage4 Validation:');
  console.log(JSON.stringify(validation, null, 2));

  const outDir = path.resolve(process.cwd(), 'testrun');
  ensureDir(outDir);
  const safeName = topic.replace(/[^\u4e00-\u9fa5a-zA-Z0-9_-]+/g, '_');
  const stamp = new Date().toISOString().replace(/[:-]/g, '').slice(0, 15);
  const storyDir = path.join(outDir, `${safeName}_${stamp}`);
  ensureDir(storyDir);

  const finalStoryLines: string[] = [`# ${topic}`, '', `> 机关预设：${mechanism.label}`, ''];
  editedDraft.chapters.forEach((chapter: any, idx: number) => {
    const chapterTitle = chapter?.title ? String(chapter.title) : `Chapter ${idx + 1}`;
    finalStoryLines.push(`## 第${idx + 1}章 ${chapterTitle}`);
    finalStoryLines.push('');
    const body = renderChapterContent(chapter);
    finalStoryLines.push(body || '（该章节暂无正文）');
    finalStoryLines.push('');
  });

  const storyPath = path.join(storyDir, 'story.md');
  fs.writeFileSync(storyPath, finalStoryLines.join('\n'), 'utf8');

  const reportPath = path.join(storyDir, 'story_report.json');
  const report = {
    topic,
    profile,
    mechanism,
    outline,
    draft,
    fixedDraft,
    editedDraft,
    review,
    validation,
  };
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');

  console.log(`\n📝 可阅读故事输出: ${storyPath}`);
  console.log(`📦 详细报告输出: ${reportPath}`);
}

run().catch((error) => {
  console.error('❌ 执行失败:', error);
  process.exit(1);
});
