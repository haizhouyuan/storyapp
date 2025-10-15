import { runStage1Planning, runStage2Writing, runStage3Review } from '../src/agents/detective/stageRunner';
import { runStage4Validation } from '../src/agents/detective/validators';
import { enforceCluePolicy } from '../src/agents/detective/clueEnforcer';
import type { PromptBuildOptions } from '../src/agents/detective/promptBuilder';

async function run(): Promise<void> {
  const topic = process.argv.slice(2).join(' ') || '雾岚古堡的第八声';
  console.log('🕵️ 主题（strict）：', topic);

  const promptOpts: PromptBuildOptions = {
    profile: 'strict',
    seed: 'strict-seed',
    vars: {
      readingLevel: 'middle_grade',
      targets: { avgSentenceLen: 22 },
      cluePolicy: { ch1MinClues: 3, minExposures: 2 },
      misdirectionCap: 0.3,
      deviceVariant: ['风道','潮汐','共振','滑轮'],
    },
  };

  const outlineRaw = await runStage1Planning(topic + '（风道/滑轮/潮汐/共振，Chapter1 铺垫，时间线用 DayX HH:MM）');
  const outline: any = { ...outlineRaw };
  if (!Array.isArray(outline.clueMatrix)) {
    const candidates = Array.isArray(outline.clues) ? outline.clues : [];
    outline.clueMatrix = candidates.slice(0, 5).map((c: any, i: number) => ({
      clue: String(c?.clue || c?.name || `线索${i + 1}`),
      surfaceMeaning: String(c?.surfaceMeaning || c?.hint || ''),
      realMeaning: String(c?.realMeaning || ''),
      appearsAtAct: 1,
      mustForeshadow: true,
      explicitForeshadowChapters: ['Chapter 1','Chapter 2'],
    }));
  }
  const tl = (outline as any).timeline;
  const arr = Array.isArray(tl) ? tl : (Array.isArray(tl?.events) ? tl.events : []);
  outline.timeline = (arr || []).map((e: any, idx: number) => {
    const t = String(e?.time || '').match(/^\d{1,2}:\d{2}$/) ? `Day1 ${e.time}` : (String(e?.time || '').startsWith('Day') ? e.time : `Day1 20:${String(idx).padStart(2,'0')}`);
    return { time: t, event: String(e?.event || e?.description || `事件${idx+1}`), participants: e?.participants || [] };
  });
  console.log('\n📋 Stage1 Outline:');
  console.log(JSON.stringify(outline, null, 2));

  const draft = await runStage2Writing(outline, promptOpts);
  console.log('\n📚 Stage2 Story Draft (raw):');
  console.log(JSON.stringify(draft, null, 2));

  const review = await runStage3Review(outline, draft, promptOpts);
  console.log('\n🔍 Stage3 Review:');
  console.log(JSON.stringify(review, null, 2));

  // 自动修订：强制 Chapter 1 铺垫 & 结局回收 & 曝光次数
  const { draft: fixedDraft, outline: fixedOutline, changes } = enforceCluePolicy(outline as any, draft as any, {
    ch1MinClues: 3,
    minExposures: 2,
    ensureFinalRecovery: true,
    adjustOutlineExpectedChapters: true,
  });
  if (changes?.length) {
    console.log('\n🛠️ AutoFix Changes:');
    console.log(JSON.stringify(changes, null, 2));
  }

  function simplify(text: string): string {
    const raw = String(text || '');
    if (!raw.trim()) return raw;
    const parts = raw
      .replace(/\s+/g, ' ')
      .replace(/[;；]/g, '，')
      .split(/[。！？!?]/)
      .map(s => s.trim())
      .filter(Boolean);
    const out: string[] = [];
    for (const s of parts) {
      if (s.length <= 26) { out.push(s + '。'); continue; }
      const chunks: string[] = [];
      let buf = '';
      for (const ch of s) {
        buf += ch;
        if (buf.length >= 14 && /[，,、\s]/.test(ch)) {
          chunks.push(buf.trim());
          buf = '';
        }
      }
      if (buf.trim()) chunks.push(buf.trim());
      out.push(chunks.join('。') + '。');
    }
    return out.join('');
  }

  const hhmmList: string[] = ((outline.timeline as any[]) || [])
    .map((e: any) => String(e?.time || '').split(' ').pop())
    .filter((t) => /^\d{1,2}:\d{2}$/.test(t as string)) as string[];

  const editedDraft = { ...fixedDraft, chapters: (fixedDraft as any).chapters.map((c: any, i: number) => { const time = hhmmList[i % Math.max(1, hhmmList.length)] || "20:00"; const txt = simplify(c.content); const injected = `（${time}）` + txt; return { ...c, content: injected }; }) } as any;

  const validation = runStage4Validation((fixedOutline || outline) as any, editedDraft as any);
  console.log('\n✅ Stage4 Validation (strict+autofix):');
  console.log(JSON.stringify(validation, null, 2));
}

run().catch((error) => {
  console.error('❌ 执行失败:', error);
  process.exit(1);
});
