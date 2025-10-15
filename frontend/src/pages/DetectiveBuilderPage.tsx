import React from 'react';
import { createProject, planProject, getBlueprint, writeScene, editScene, autoFix, compileProject } from '../utils/detectiveApi';

type Profile = 'strict' | 'balanced' | 'creative';

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
  const [exportUrls, setExportUrls] = React.useState<{html:string;interactive:string}|null>(null);

  const [readingLevel, setReadingLevel] = React.useState('middle_grade');
  const [avgSentenceLen, setAvgSentenceLen] = React.useState(22);
  const [ch1MinClues, setCh1MinClues] = React.useState(2);
  const [minExposures, setMinExposures] = React.useState(2);
  const [misdirectionCap, setMisdirectionCap] = React.useState(0.3);
  const [randomMechanism, setRandomMechanism] = React.useState<boolean>(true);

  const optionsRef = React.useRef({
    readingLevel: 'middle_grade',
    targets: { avgSentenceLen: 22 },
    cluePolicy: { ch1MinClues: 2, minExposures: 2 },
    misdirectionCap: 0.3,
    randomMechanism: true,
  });
  function syncOptions() {
    optionsRef.current = {
      readingLevel,
      targets: { avgSentenceLen },
      cluePolicy: { ch1MinClues, minExposures },
      misdirectionCap,
      randomMechanism,
    };
  }

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
      setExportUrls(null);
    } catch (e: any) {
      setError(e?.message || '自动修订失败');
    } finally { setBusy(false); }
  }

  async function handleCompile() {
    if (!projectId || !draft) return;
    setBusy(true); setError(null);
    try {
      const data = await compileProject(projectId, draft, 'html+interactive');
      setExportUrls(data?.urls || null);
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
              <select value={readingLevel} onChange={e=>{ setReadingLevel(e.target.value); syncOptions(); }} className="mt-1 w-full border rounded px-3 py-2">
                <option value="middle_grade">middle_grade</option>
                <option value="early">early</option>
                <option value="ya">ya</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-sm font-medium">平均句长≤</label>
                <input type="number" value={avgSentenceLen} onChange={e=>{ setAvgSentenceLen(parseInt(e.target.value||'22',10)); syncOptions(); }} className="mt-1 w-full border rounded px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium">红鲱鱼上限</label>
                <input type="number" step="0.05" min="0" max="0.6" value={misdirectionCap} onChange={e=>{ setMisdirectionCap(parseFloat(e.target.value||'0.3')); syncOptions(); }} className="mt-1 w-full border rounded px-3 py-2" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-sm font-medium">Ch1最少线索数</label>
                <input type="number" value={ch1MinClues} onChange={e=>{ setCh1MinClues(parseInt(e.target.value||'2',10)); syncOptions(); }} className="mt-1 w-full border rounded px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium">线索曝光次数≥</label>
                <input type="number" value={minExposures} onChange={e=>{ setMinExposures(parseInt(e.target.value||'2',10)); syncOptions(); }} className="mt-1 w-full border rounded px-3 py-2" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">随机机制</label>
              <label className="inline-flex items-center mr-3 text-sm">
                <input type="checkbox" className="mr-1" checked={randomMechanism} onChange={e=>{ setRandomMechanism(e.target.checked); setTimeout(syncOptions,0); }} /> 启用
              </label>
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
          </div>

          <div className="md:col-span-2 space-y-6">
            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex items-center justify-between mb-2"><h2 className="font-semibold">蓝图 Outline</h2></div>
              <pre className="text-xs whitespace-pre-wrap overflow-auto max-h-96">{outline ? JSON.stringify(outline, null, 2) : '（尚未生成）'}</pre>
              <div className="mt-2">
                <QuickValidate projectId={projectId} chapter={chapter} draft={draft} />
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex items-center justify-between mb-2"><h2 className="font-semibold">章节 Chapter（写作/编辑结果）</h2></div>
              <pre className="text-xs whitespace-pre-wrap overflow-auto max-h-96">{chapter ? JSON.stringify(chapter, null, 2) : '（尚未写作/编辑）'}</pre>
              <div className="mt-2">
                <QuickValidate projectId={projectId} chapter={chapter} draft={draft} />
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex items-center justify-between mb-2"><h2 className="font-semibold">整稿 Draft（自动修订产物）</h2></div>
              <pre className="text-xs whitespace-pre-wrap overflow-auto max-h-96">{draft ? JSON.stringify(draft, null, 2) : '（未生成自动修订结果）'}</pre>
              <div className="mt-2">
                <QuickValidate projectId={projectId} draft={draft} />
              </div>
              {exportUrls && (
                <div className="mt-2 text-sm">
                  <div>导出完成：</div>
                  <div><a className="text-blue-600 underline" href={exportUrls.html} target="_blank" rel="noreferrer">预览 HTML</a></div>
                  <div><a className="text-blue-600 underline" href={exportUrls.interactive} target="_blank" rel="noreferrer">下载互动包 JSON</a></div>
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
  return (
    <div>
      <button disabled={!projectId||loading} onClick={run} className="bg-amber-600 text-white rounded px-3 py-2 disabled:opacity-50">快速校验</button>
      {report && (
        <div className="mt-2">
          <div className="text-sm mb-1">结果：pass={report?.summary?.pass||0} warn={report?.summary?.warn||0} fail={report?.summary?.fail||0}</div>
          <div className="flex flex-wrap gap-1">
            {(report.results||[]).map((r:any)=> (
              <div key={r.ruleId} className="border rounded px-2 py-1 text-xs">
                <b>{r.ruleId}</b> <StatusChip label={r.status} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
