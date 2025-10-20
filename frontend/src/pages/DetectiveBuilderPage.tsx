import React from 'react';
import { DETECTIVE_MECHANISM_PRESETS } from '@storyapp/shared';
import { createProject, planProject, getBlueprint, writeScene, editScene, autoFix, compileProject } from '../utils/detectiveApi';
import { draftToPlainText } from '../utils/storyFormatting';

type Profile = 'strict' | 'balanced' | 'creative';

const PRESETS = [
  {
    label: '标准剧本',
    values: {
      avgSentenceLen: 22,
      misdirectionCap: 0.3,
      dialoguesMin: 6,
      sensoryHooks: 2,
      themeAnchors: '海雾,潮声,古塔,星光,秘密',
      wordsPerScene: 1200,
      ch1MinClues: 3,
      minExposures: 2,
    },
  },
  {
    label: '情绪强化',
    values: {
      avgSentenceLen: 22,
      misdirectionCap: 0.25,
      dialoguesMin: 8,
      sensoryHooks: 4,
      themeAnchors: '心跳,雨声,微光,拥抱,勇气',
      wordsPerScene: 1300,
      ch1MinClues: 3,
      minExposures: 2,
    },
  },
  {
    label: '推理焦点',
    values: {
      avgSentenceLen: 21,
      misdirectionCap: 0.2,
      dialoguesMin: 7,
      sensoryHooks: 2,
      themeAnchors: '证据,推理,时间线,真相,伏笔',
      wordsPerScene: 1100,
      ch1MinClues: 4,
      minExposures: 3,
    },
  },
];

const CUSTOM_MECHANISM_ID = 'custom';
const INITIAL_MECHANISM = DETECTIVE_MECHANISM_PRESETS[0];

export default function DetectiveBuilderPage() {
  const [topic, setTopic] = React.useState('雾岚古堡的第八声');
  const [profile, setProfile] = React.useState<Profile>('balanced');
  const [seed, setSeed] = React.useState('seed-demo');
  const [projectId, setProjectId] = React.useState<string | null>(null);
  const [blueprintId, setBlueprintId] = React.useState<string | null>(null);
  const [outline, setOutline] = React.useState<any>(null);
  const [sceneId, setSceneId] = React.useState('S3');
  const [chapter, setChapter] = React.useState<any>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState<any>(null);
  const [compiledOutput, setCompiledOutput] = React.useState<{ plainText: string; urls: { html: string; interactive: string; plain: string } } | null>(null);
  const [viewMode, setViewMode] = React.useState<'reader'|'debug'>('reader');

  const [readingLevel, setReadingLevel] = React.useState('middle_grade');
  const [avgSentenceLen, setAvgSentenceLen] = React.useState(22);
  const [wordsPerScene, setWordsPerScene] = React.useState<number>(1200);
  const [ch1MinClues, setCh1MinClues] = React.useState(2);
  const [minExposures, setMinExposures] = React.useState(2);
  const [misdirectionCap, setMisdirectionCap] = React.useState(0.3);
  const [dialoguesMin, setDialoguesMin] = React.useState(6);
  const [sensoryHooks, setSensoryHooks] = React.useState(2);
  const [themeAnchors, setThemeAnchors] = React.useState('海雾,潮声,古塔,星光,秘密');
  const [mechanismId, setMechanismId] = React.useState<string>(INITIAL_MECHANISM?.id ?? '');
  const [customMechanismInput, setCustomMechanismInput] = React.useState('');
  const [useReasoner, setUseReasoner] = React.useState<boolean>(true);
  const [reasonerCandidates, setReasonerCandidates] = React.useState<number>(2);
  const [reasonerEffort, setReasonerEffort] = React.useState<'low'|'medium'|'high'>('medium');

  const selectedMechanism = React.useMemo(() => (
    mechanismId === CUSTOM_MECHANISM_ID
      ? null
      : DETECTIVE_MECHANISM_PRESETS.find((item) => item.id === mechanismId) || null
  ), [mechanismId]);

  const draftPlainText = React.useMemo(() => draftToPlainText(draft), [draft]);

  const storyPreview = compiledOutput?.plainText || draftPlainText;

  const applyPreset = (presetValues: (typeof PRESETS)[number]['values']) => {
    setAvgSentenceLen(presetValues.avgSentenceLen);
    setMisdirectionCap(presetValues.misdirectionCap);
    setDialoguesMin(presetValues.dialoguesMin);
    setSensoryHooks(presetValues.sensoryHooks);
    setThemeAnchors(presetValues.themeAnchors);
    setWordsPerScene(presetValues.wordsPerScene);
    setCh1MinClues(presetValues.ch1MinClues);
    setMinExposures(presetValues.minExposures);
  };

  const optionsRef = React.useRef({
    readingLevel: 'middle_grade',
    targets: { avgSentenceLen: 22, wordsPerScene: 1200 },
    cluePolicy: { ch1MinClues: 2, minExposures: 2 },
    misdirectionCap: 0.3,
    writer: { dialoguesMin: 6, sensoryHooks: 2, themeAnchors: ['海雾','潮声','古塔','星光','秘密'] },
    deviceKeywords: INITIAL_MECHANISM ? INITIAL_MECHANISM.keywords : [],
    deviceRealismHint: INITIAL_MECHANISM?.realismHint ?? '请描述该机关的现实原理（动力来源、材料或可以参考的装置）。',
    mechanismId: INITIAL_MECHANISM?.id,
    mechanismLabel: INITIAL_MECHANISM?.label,
    useReasoner: true,
    reasoner: { candidates: 2, effort: 'medium', judge: 'rules' },
  });
  React.useEffect(() => {
    const anchors = themeAnchors.split(',').map((t) => t.trim()).filter(Boolean);
    const preset = mechanismId === CUSTOM_MECHANISM_ID ? null : selectedMechanism;
    const keywords = mechanismId === CUSTOM_MECHANISM_ID
      ? customMechanismInput.split(/[,，、\s]+/).map((k) => k.trim()).filter(Boolean)
      : (preset?.keywords ?? []);
    const realismHint = mechanismId === CUSTOM_MECHANISM_ID
      ? '请描述该机关的现实原理（动力来源、材料或可以参考的装置）。'
      : (preset?.realismHint ?? '');
    optionsRef.current = {
      readingLevel,
      targets: { avgSentenceLen, wordsPerScene },
      cluePolicy: { ch1MinClues, minExposures },
      misdirectionCap,
      writer: { dialoguesMin, sensoryHooks, themeAnchors: anchors },
      deviceKeywords: keywords,
      deviceRealismHint: realismHint,
      mechanismId,
      mechanismLabel: preset?.label ?? '自定义关键词',
      useReasoner,
      reasoner: { candidates: reasonerCandidates, effort: reasonerEffort, judge: 'rules' },
    };
  }, [
    readingLevel,
    avgSentenceLen,
    wordsPerScene,
    ch1MinClues,
    minExposures,
    misdirectionCap,
    dialoguesMin,
    sensoryHooks,
    themeAnchors,
    mechanismId,
    customMechanismInput,
    selectedMechanism,
    useReasoner,
    reasonerCandidates,
    reasonerEffort,
  ]);

  async function handlePlan() {
    setError(null); setBusy(true);
    try {
      // 1) Create project when needed
      let pid = projectId;
      if (!pid) {
        const created = await createProject(topic);
        pid = created?.project?.project_id;
        setProjectId(pid || null);
      }
      if (!pid) throw new Error('项目创建失败');

      // 2) Plan blueprint
      const planned = await planProject(pid, { topic, profile, seed, options: optionsRef.current });
      setBlueprintId(planned?.blueprintId || null);
      setOutline(planned?.outline || null);
    } catch (e: any) {
      setError(e?.message || '生成蓝图失败');
    } finally {
      setBusy(false);
    }
  }

  async function handleFetchBlueprint() {
    if (!blueprintId) return;
    setError(null); setBusy(true);
    try {
      const data = await getBlueprint(blueprintId);
      setOutline(data?.outline || null);
    } catch (e: any) {
      setError(e?.message || '获取蓝图失败');
    } finally {
      setBusy(false);
    }
  }

  async function handleWrite() {
    if (!projectId) return;
    setError(null); setBusy(true);
    try {
      const data = await writeScene(projectId, sceneId, { profile, seed, options: optionsRef.current });
      setChapter(data?.chapter || null);
    } catch (e: any) {
      setError(e?.message || '写作失败');
    } finally { setBusy(false); }
  }

  async function handleEdit() {
    if (!projectId) return;
    setError(null); setBusy(true);
    try {
      const data = await editScene(projectId, chapter ? undefined : sceneId, chapter || undefined, { profile, seed, options: optionsRef.current });
      setChapter(data?.chapter || null);
    } catch (e: any) {
      setError(e?.message || '编辑失败');
    } finally { setBusy(false); }
  }

  async function handleAutoFix() {
    if (!projectId) return;
    setError(null); setBusy(true);
    try {
      const policy = { ch1MinClues, minExposures };
      const payload: any = draft ? { draft, policy, updateOutlineExpected: true } : { chapter, policy, updateOutlineExpected: true };
      const data = await autoFix(projectId, payload);
      setDraft(data?.draft || null);
      if (data?.outline) {
        setOutline(data.outline);
      }
      setCompiledOutput(null);
    } catch (e: any) {
      setError(e?.message || '自动修订失败');
    } finally { setBusy(false); }
  }

  async function handleCompile() {
    if (!projectId || !draft) return;
    setBusy(true); setError(null);
    try {
      const data = await compileProject(projectId, draft, 'html+interactive');
      setCompiledOutput(data || null);
      setViewMode('reader');
    } catch (e:any) {
      setError(e?.message||'导出失败');
    } finally { setBusy(false); }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <div className="max-w-6xl mx-auto py-10 px-4">
        <h1 className="text-2xl font-bold mb-6">侦探故事工作室（新UI）</h1>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-1 bg-white rounded-lg shadow p-4 space-y-4">
            <div>
              <label className="block text-sm font-medium">主题</label>
              <input value={topic} onChange={e=>setTopic(e.target.value)} className="mt-1 w-full border rounded px-3 py-2" placeholder="例如：雾岚古堡的第八声" />
            </div>
            <div>
              <label className="block text-sm font-medium">Profile</label>
              <select value={profile} onChange={e=>setProfile(e.target.value as Profile)} className="mt-1 w-full border rounded px-3 py-2">
                <option value="strict">strict（严格达标）</option>
                <option value="balanced">balanced（平衡）</option>
                <option value="creative">creative（创意）</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium">Seed（可选）</label>
              <input value={seed} onChange={e=>setSeed(e.target.value)} className="mt-1 w-full border rounded px-3 py-2" />
            </div>
            <div>
              <label className="block text-sm font-medium">阅读级别</label>
              <select value={readingLevel} onChange={e=> setReadingLevel(e.target.value)} className="mt-1 w-full border rounded px-3 py-2">
                <option value="middle_grade">middle_grade</option>
                <option value="early">early</option>
                <option value="ya">ya</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-sm font-medium">平均句长≤</label>
                <input type="number" value={avgSentenceLen} onChange={e=> setAvgSentenceLen(parseInt(e.target.value||'22',10))} className="mt-1 w-full border rounded px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium">红鲱鱼上限</label>
                <input type="number" step="0.05" min="0" max="0.6" value={misdirectionCap} onChange={e=> setMisdirectionCap(parseFloat(e.target.value||'0.3'))} className="mt-1 w-full border rounded px-3 py-2" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-sm font-medium">对白最少轮次</label>
                <input type="number" min={0} value={dialoguesMin} onChange={e=> setDialoguesMin(Math.max(0, parseInt(e.target.value||'6',10)))} className="mt-1 w-full border rounded px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium">感官描写≥</label>
                <input type="number" min={0} value={sensoryHooks} onChange={e=> setSensoryHooks(Math.max(0, parseInt(e.target.value||'2',10)))} className="mt-1 w-full border rounded px-3 py-2" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium">主题锚点（逗号分隔）</label>
              <input value={themeAnchors} onChange={e=> setThemeAnchors(e.target.value)} className="mt-1 w-full border rounded px-3 py-2" placeholder="例如：风,潮,钟声" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">参数预设</label>
              <div className="flex flex-wrap gap-2">
                {PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => applyPreset(preset.values)}
                    className="px-3 py-1 rounded border border-slate-300 text-sm hover:bg-slate-100"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium">章节字数目标</label>
              <input type="number" value={wordsPerScene} onChange={e=> setWordsPerScene(parseInt(e.target.value||'1200',10))} className="mt-1 w-full border rounded px-3 py-2" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-sm font-medium">Ch1最少线索数</label>
                <input type="number" value={ch1MinClues} onChange={e=> setCh1MinClues(parseInt(e.target.value||'2',10))} className="mt-1 w-full border rounded px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium">线索曝光次数≥</label>
                <input type="number" value={minExposures} onChange={e=> setMinExposures(parseInt(e.target.value||'2',10))} className="mt-1 w-full border rounded px-3 py-2" />
              </div>
            </div>
            <div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">机关预设</label>
              <select
                value={mechanismId || CUSTOM_MECHANISM_ID}
                onChange={(e) => setMechanismId(e.target.value)}
                className="mt-1 w-full border rounded px-3 py-2"
              >
                {DETECTIVE_MECHANISM_PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label}
                  </option>
                ))}
                <option value={CUSTOM_MECHANISM_ID}>自定义关键词</option>
              </select>
              {mechanismId === CUSTOM_MECHANISM_ID ? (
                <textarea
                  className="mt-2 w-full border rounded px-3 py-2 text-sm"
                  rows={2}
                  value={customMechanismInput}
                  onChange={(e) => setCustomMechanismInput(e.target.value)}
                  placeholder="例如：镜面,折射,光线（用逗号或空格分隔）"
                />
              ) : (
                <p className="text-xs text-slate-500 mt-1">
                  关键词：{selectedMechanism?.keywords.join('、') || '（无）'}
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Reasoner（蓝图阶段）</label>
              <label className="inline-flex items-center mr-3 text-sm">
                <input type="checkbox" className="mr-1" checked={useReasoner} onChange={e=> setUseReasoner(e.target.checked)} /> 使用 Reasoner
              </label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                <div>
                  <label className="block text-xs text-slate-600">候选数(1-3)</label>
                  <input type="number" min={1} max={3} value={reasonerCandidates} onChange={e=> setReasonerCandidates(Math.max(1,Math.min(3, parseInt(e.target.value||'2',10))))} className="mt-1 w-full border rounded px-3 py-2" />
                </div>
                <div>
                  <label className="block text-xs text-slate-600">力度</label>
                  <select value={reasonerEffort} onChange={e=> setReasonerEffort(e.target.value as any)} className="mt-1 w-full border rounded px-3 py-2">
                    <option value="low">low</option>
                    <option value="medium">medium</option>
                    <option value="high">high</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={handlePlan} disabled={busy} className="bg-blue-600 text-white rounded px-4 py-2 disabled:opacity-50">生成蓝图</button>
              {blueprintId && <button onClick={handleFetchBlueprint} className="bg-slate-200 rounded px-3 py-2">刷新蓝图</button>}
            </div>
            {error && <div className="text-red-600 text-sm">{error}</div>}
            <div className="text-xs text-slate-500">项目ID：{projectId || '-'}</div>
            <div className="text-xs text-slate-500">蓝图ID：{blueprintId || '-'}</div>
            <hr/>
            <div>
              <label className="block text-sm font-medium">scene_id</label>
              <input value={sceneId} onChange={e=>setSceneId(e.target.value)} className="mt-1 w-full border rounded px-3 py-2" placeholder="S3" />
              <div className="flex gap-2 mt-2">
                <button onClick={handleWrite} disabled={busy || !projectId} className="bg-emerald-600 text-white rounded px-3 py-2 disabled:opacity-50">写作该章</button>
                <button onClick={handleEdit} disabled={busy || !projectId} className="bg-violet-600 text-white rounded px-3 py-2 disabled:opacity-50">编辑降级</button>
                <button onClick={handleAutoFix} disabled={busy || !projectId || (!chapter && !draft)} className="bg-amber-700 text-white rounded px-3 py-2 disabled:opacity-50">自动修订器</button>
                <button onClick={handleCompile} disabled={busy || !projectId || !draft} className="bg-slate-700 text-white rounded px-3 py-2 disabled:opacity-50">导出 HTML+互动包</button>
              </div>
            </div>
            <div>
            </div>
          </div>

          <div className="md:col-span-2 space-y-6">
            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex items-center justify-between mb-2"><h2 className="font-semibold">蓝图 Outline</h2></div>
              <pre className="text-xs whitespace-pre-wrap overflow-auto max-h-96">{outline ? JSON.stringify(outline, null, 2) : '（尚未生成）'}</pre>
              <div className="mt-2">
                <QuickValidate projectId={projectId} chapter={chapter} draft={draft} />
              </div>
            </div>
            <div>
            </div>

            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex items-center justify-between mb-2"><h2 className="font-semibold">章节 Chapter（写作/编辑结果）</h2></div>
              <pre className="text-xs whitespace-pre-wrap overflow-auto max-h-96">{chapter ? JSON.stringify(chapter, null, 2) : '（尚未写作/编辑）'}</pre>
              <div className="mt-2">
                <QuickValidate projectId={projectId} chapter={chapter} draft={draft} />
              </div>
            </div>
            <div>
            </div>

            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex items-center justify-between mb-2">
                <h2 className="font-semibold">整稿</h2>
                <div className="inline-flex rounded-full border border-slate-200 overflow-hidden text-xs">
                  <button
                    type="button"
                    onClick={() => setViewMode('reader')}
                    className={`px-3 py-1 ${viewMode === 'reader' ? 'bg-slate-800 text-white' : 'text-slate-600'}`}
                  >阅读模式</button>
                  <button
                    type="button"
                    onClick={() => setViewMode('debug')}
                    className={`px-3 py-1 ${viewMode === 'debug' ? 'bg-slate-800 text-white' : 'text-slate-600'}`}
                  >调试模式</button>
                </div>
              </div>
              {viewMode === 'reader' ? (
                <div className="text-sm whitespace-pre-wrap leading-7 overflow-auto max-h-96 bg-slate-50 border border-slate-200 rounded p-3">
                  {storyPreview ? storyPreview : '（暂无整稿，请先写作或导出）'}
                </div>
              ) : (
                <>
                  <div className="text-xs text-slate-500 mb-2">
                    <div>机关预设：{optionsRef.current.mechanismLabel || '未指定'}</div>
                    {optionsRef.current.deviceRealismHint && (
                      <div>现实说明：{optionsRef.current.deviceRealismHint}</div>
                    )}
                  </div>
                  <pre className="text-xs whitespace-pre-wrap overflow-auto max-h-96">{draft ? JSON.stringify(draft, null, 2) : '（未生成自动修订结果）'}</pre>
                </>
              )}
              <div className="mt-2">
                <QuickValidate projectId={projectId} draft={draft} />
              </div>
              {compiledOutput && (
                <div className="mt-2 text-sm space-y-1">
                  <div>导出完成：</div>
                  <div><a className="text-blue-600 underline" href={compiledOutput.urls.plain} target="_blank" rel="noreferrer">下载纯文本</a></div>
                  <div><a className="text-blue-600 underline" href={compiledOutput.urls.html} target="_blank" rel="noreferrer">预览 HTML</a></div>
                  <div><a className="text-blue-600 underline" href={compiledOutput.urls.interactive} target="_blank" rel="noreferrer">下载互动包 JSON</a></div>
                </div>
              )}
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}

function StatusChip({label}:{label:string}){
  const color = label==='pass'?'bg-green-100 text-green-600':label==='warn'?'bg-yellow-100 text-yellow-700':'bg-red-100 text-red-600';
  return <span className={`inline-block px-2 py-1 rounded text-xs mr-2 ${color}`}>{label}</span>;
}

function QuickValidate({ projectId, chapter, draft }:{ projectId: string|null, chapter?: any, draft?: any }){
  const [report, setReport] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(false);
  const [fixing, setFixing] = React.useState(false);
  const [fixedReport, setFixedReport] = React.useState<any>(null);
  async function run(){
    if(!projectId){ return; }
    setLoading(true);
    try{
      const body: any = draft ? { draft } : (chapter ? { chapter } : {});
      const res = await fetch((process.env.REACT_APP_API_URL||'') + `/api/projects/${projectId}/validate`,{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
      const data = await res.json();
      if(!res.ok) throw new Error(data?.error||res.statusText);
      setReport(data?.report || null);
    }catch(e:any){
      alert(e?.message||'校验失败');
    }finally{ setLoading(false); }
  }
  async function fix(){
    if(!projectId){ return; }
    setFixing(true);
    try{
      const body: any = draft ? { draft } : (chapter ? { chapter } : null);
      if(!body){ alert('无可修订内容'); setFixing(false); return; }
      body.policy = { ch1MinClues: 2, minExposures: 2 };
      body.updateOutlineExpected = true;
      const res = await fetch((process.env.REACT_APP_API_URL||'') + `/api/projects/${projectId}/autofix`,{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
      const data = await res.json();
      if(!res.ok) throw new Error(data?.error||res.statusText);
      const res2 = await fetch((process.env.REACT_APP_API_URL||'') + `/api/projects/${projectId}/validate`,{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ draft: data?.draft }) });
      const data2 = await res2.json();
      if(res2.ok){ setFixedReport(data2?.report || null); } else { setFixedReport(null); }
    }catch(e:any){
      alert(e?.message||'自动修订失败');
    }finally{ setFixing(false); }
  }
  return (
    <div>
      <button disabled={!projectId||loading} onClick={run} className="bg-amber-600 text-white rounded px-3 py-2 disabled:opacity-50 mr-2">快速校验</button>
      <button disabled={!projectId||fixing||(!draft && !chapter)} onClick={fix} className="bg-emerald-700 text-white rounded px-3 py-2 disabled:opacity-50">一键修复</button>
      {report && (
        <div className="mt-2">
          <div className="text-sm mb-1">结果：pass={report?.summary?.pass||0} warn={report?.summary?.warn||0} fail={report?.summary?.fail||0}</div>
          {draft && (report?.summary?.pass||0) >= 6 && (report?.summary?.fail||0) === 0 && (
            <div className="text-green-700 bg-green-50 border border-green-200 inline-block px-2 py-1 rounded text-xs mb-2">
              已达成可用标准 ✅
            </div>
          )}
          <div className="flex flex-wrap gap-1">
            {(report.results||[]).map((r:any)=> (
              <div key={r.ruleId} className="border rounded px-2 py-1 text-xs">
                <b>{r.ruleId}</b> <StatusChip label={r.status} />
              </div>
            ))}
          </div>
          {fixedReport && (
            <div className="mt-3 border-t pt-2">
              <div className="text-sm">修订后结果：pass={fixedReport?.summary?.pass||0} warn={fixedReport?.summary?.warn||0} fail={fixedReport?.summary?.fail||0}</div>
              <div className="flex flex-wrap gap-1">
                {(fixedReport.results||[]).map((r:any)=> (
                  <div key={r.ruleId} className="border rounded px-2 py-1 text-xs">
                    <b>{r.ruleId}</b> <StatusChip label={r.status} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
