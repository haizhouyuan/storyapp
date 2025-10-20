import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../config/database';
import { createLogger } from '../config/logger';
import { COLLECTIONS } from '../config/mongodb';
import { DETECTIVE_MECHANISM_PRESETS, type StoryProjectType as StoryProject } from '@storyapp/shared';
import { projectDocToRecord, StoryProjectDocument, StoryBlueprintDocument } from '../models/StoryProject';
import { validateSceneChapter } from '../utils/schemaValidator';
import { planBlueprint } from '../engines/planner_llm';
import { deepseekClient, DEEPSEEK_CONFIG } from '../config/deepseek';
import { scoreOutline } from '../agents/detective/validators/outlineScorer';
import { runStage1Planning, runSceneWriting, runSceneEditing } from '../agents/detective/stageRunner';
import { runStage4Validation } from '../agents/detective/validators';
import { enforceCluePolicy } from '../agents/detective/clueEnforcer';
import { compileToOutputs } from '../services/compileExporter';
import { createQuickOutline, synthMockChapter } from '../agents/detective/mockUtils';
import { mapReasonerOutlineToDetectiveOutline } from '../agents/detective/reasonerOutlineMapper';
import { harmonizeOutlineWithDraft } from '../agents/detective/outlineSync';
import { validateDetectiveOutline } from '../utils/schemaValidator';

const router = Router();
const logger = createLogger('routes:projects');

function normalizeMechanismKeywords(input: any): string[] {
  const raw = input?.deviceKeywords ?? input?.deviceVariant;
  if (Array.isArray(raw)) {
    return raw.map((value) => String(value).trim()).filter(Boolean);
  }
  if (typeof raw === 'string' && raw.trim()) {
    return raw
      .split(/[,，\/\s]+/)
      .map((value) => value.trim())
      .filter(Boolean);
  }
  return [];
}

// POST /api/projects - 创建项目
router.post('/', async (req, res) => {
  try {
    const { title, locale, protagonist, constraints } = req.body || {};
    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'title_required' });
    }
    const db = getDatabase();
    const now = new Date();
    const projectId = uuidv4();
    const doc: StoryProjectDocument = {
      projectId,
      title: title.trim(),
      locale,
      protagonist,
      constraints,
      status: 'INIT',
      createdAt: now,
      updatedAt: now,
    };
    await db.collection(COLLECTIONS.STORY_PROJECTS).insertOne(doc);
    const record: StoryProject = projectDocToRecord(doc);
    return res.json({ success: true, project: record });
  } catch (err: any) {
    logger.error({ err }, '创建项目失败');
    return res.status(500).json({ success: false, error: 'internal_error', message: String(err?.message || err) });
  }
});

// POST /api/projects/:projectId/plan - 生成蓝图（DetectiveOutline）
router.post('/:projectId/plan', async (req, res) => {
  const { projectId } = req.params as { projectId: string };
  const { topic, profile, seed, options } = req.body || {};
  try {
    const db = getDatabase();
    const proj = await db.collection(COLLECTIONS.STORY_PROJECTS).findOne({ projectId });
    if (!proj) return res.status(404).json({ success: false, error: 'project_not_found' });

    const effectiveTopic = typeof topic === 'string' && topic.trim().length > 0 ? topic.trim() : (proj.title || '侦探故事');
    const mechanismKeywords = normalizeMechanismKeywords(options);
    const mechanismPreset = typeof options?.mechanismId === 'string'
      ? DETECTIVE_MECHANISM_PRESETS.find((preset) => preset.id === options.mechanismId)
      : undefined;
    const deviceRealismHint =
      typeof options?.deviceRealismHint === 'string' && options.deviceRealismHint.trim()
        ? options.deviceRealismHint
        : mechanismPreset?.realismHint;
    const plannerVars = { ...(options || {}), deviceKeywords: mechanismKeywords, deviceRealismHint };

    let outline: any;
    const fast = process.env.DETECTIVE_PLAN_FAST === '1' || process.env.DETECTIVE_USE_MOCK === '1' || (options && options.fastMock === true);
    if (fast) {
      outline = createQuickOutline(effectiveTopic);
    } else {
      const useReasoner = !!(options && options.useReasoner);
      if (useReasoner) {
        const candidates = Math.max(1, Math.min(3, Number(options?.reasoner?.candidates || 2)));
        const effort: string = (options?.reasoner?.effort || 'medium');
        const prompts: string[] = [];
        for (let i = 0; i < candidates; i++) {
          const ctx = [
            '你是剧情规划器。内部推理后，仅输出 StoryBlueprint JSON（禁止解释）。',
            `主题：${effectiveTopic}`,
            `阅读级别：${options?.readingLevel || 'middle_grade'}；暴力级别：low；`,
            '输出必须包含：中心奇迹、角色≥6、三幕结构、线索矩阵（含 Chapter 1 铺垫）、时间线（含 DayX HH:MM 格式）。',
            mechanismKeywords.length
              ? `中心奇迹请围绕关键词：${mechanismKeywords.join('、')}，并确保描述其可行性与公平铺垫。`
              : '中心奇迹需设计独特、可行的机关（可结合机械、电磁、光影、化学等多种思路），并明确公平线索。',
            options?.targets?.wordsPerScene ? `每章字数目标：${options.targets.wordsPerScene}±15%。` : ''
          ].filter(Boolean).join('\n');
          prompts.push(ctx);
        }

        const results: any[] = [];
        for (const prompt of prompts) {
          try {
            const resp = await deepseekClient.post('/chat/completions', {
              model: DEEPSEEK_CONFIG.REASONER_MODEL,
              messages: [
                { role: 'system', content: '仅输出严格 JSON；如果需要思考，请在内部完成，禁止输出过程。' },
                { role: 'user', content: prompt },
              ],
              max_tokens: 6000,
              temperature: 0.3,
              stream: false,
              reasoning: { effort },
            });
            let content = resp?.data?.choices?.[0]?.message?.content || resp?.data?.choices?.[0]?.message?.reasoning_content || '';
            const cleaned = String(content).replace(/```json\s*|```/gi, '').trim();
            let obj: any;
            try { obj = JSON.parse(cleaned); } catch { obj = createQuickOutline(effectiveTopic); }
            results.push(obj);
          } catch (e) {
            results.push(createQuickOutline(effectiveTopic));
          }
        }
        let best = results[0]; let bestScore = -1;
        results.forEach((r) => { const sc = scoreOutline(r); if (sc.score > bestScore) { bestScore = sc.score; best = r; } });
        outline = best;
      } else {
        const result = await planBlueprint(effectiveTopic, { maxRetries: 1, strictSchema: true, profile, seed, vars: plannerVars });
        if (result.ok) {
          outline = result.outline as any;
        } else {
          try {
            const raw = await runStage1Planning(effectiveTopic, { profile, seed, vars: plannerVars });
            outline = { ...raw } as any;
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
            const tl: any = (outline as any).timeline;
            const arr = Array.isArray(tl) ? tl : (Array.isArray(tl?.events) ? tl.events : []);
            outline.timeline = (arr || []).map((e: any, idx: number) => {
              const t = String(e?.time || '').match(/^\d{1,2}:\d{2}$/) ? `Day1 ${e.time}` : (String(e?.time || '').startsWith('Day') ? e.time : `Day1 20:${String(idx).padStart(2,'0')}`);
              return { time: t, event: String(e?.event || e?.description || `事件${idx+1}`), participants: e?.participants || [] };
            });
          } catch (_err) {
            const fallback = createQuickOutline(effectiveTopic);
            if (mechanismKeywords.length) {
              const summary = `围绕 ${mechanismKeywords.join('、')} 设计的机关，需要读者留意公平线索。`;
              fallback.centralTrick = fallback.centralTrick || {};
              fallback.centralTrick.summary = summary;
              fallback.centralTrick.mechanism = `${summary} 关键要素包含：${mechanismKeywords.join('、')}。`;
            }
            outline = fallback as any;
          }
        }
      }
    }

    // 统一映射 & 严格校验
    const normalized = mapReasonerOutlineToDetectiveOutline(outline);
    const harmonized = harmonizeOutlineWithDraft(normalized, undefined, {
      ensureMechanismKeywords: true,
      mechanismKeywords,
    });
    const finalOutline = harmonized.outline;
    const schemaRes = validateDetectiveOutline(finalOutline);
    const schemaMeta: any = { valid: schemaRes.valid };
    if (!schemaRes.valid) schemaMeta.errors = (schemaRes as any).errors;

    const blueprintId = uuidv4();
    const now = new Date();
    const bp: StoryBlueprintDocument = {
      blueprintId,
      projectId,
      outline: finalOutline,
      createdAt: now,
      updatedAt: now,
    };
    await db.collection(COLLECTIONS.STORY_BLUEPRINTS).insertOne(bp);
    await db.collection(COLLECTIONS.STORY_PROJECTS).updateOne({ projectId }, { $set: { blueprint_id: blueprintId, updatedAt: now } });

    return res.json({ success: true, projectId, blueprintId, outline: finalOutline, schemaMeta });
  } catch (err: any) {
    logger.error({ err, projectId }, '规划蓝图失败');
    return res.status(500).json({ success: false, error: 'internal_error', message: String(err?.message || err) });
  }
});

// POST /api/projects/:projectId/write?scene_id=S3 - 逐章写作（不落库）
router.post('/:projectId/write', async (req, res) => {
  const { projectId } = req.params as { projectId: string };
  const sceneId = (req.query.scene_id as string) || '';
  const { profile, seed, options } = req.body || {};
  if (!sceneId) return res.status(400).json({ success: false, error: 'scene_id_required' });
  try {
    const db = getDatabase();
    const proj = await db.collection(COLLECTIONS.STORY_PROJECTS).findOne({ projectId });
    if (!proj) return res.status(404).json({ success: false, error: 'project_not_found' });
    const blueprintId = proj.blueprint_id;
    if (!blueprintId) return res.status(409).json({ success: false, error: 'no_blueprint' });
    const bp = await db.collection(COLLECTIONS.STORY_BLUEPRINTS).findOne({ blueprintId });
    if (!bp) return res.status(404).json({ success: false, error: 'blueprint_not_found' });

    // Fast mock path
    const fast = process.env.DETECTIVE_WRITE_FAST === '1' || process.env.DETECTIVE_USE_MOCK === '1' || (options && options.fastMock === true);
    if (fast) {
      const mock = synthMockChapter(sceneId, bp.outline as any);
      const computedWords = (mock.content || '').length;
      const title = (mock.title && String(mock.title).trim().length > 0) ? mock.title : `Scene ${sceneId}`;
      const chapterPayload = { scene_id: sceneId, title, summary: mock.summary, words: mock.wordCount || computedWords, text: mock.content, cluesEmbedded: mock.cluesEmbedded, redHerringsEmbedded: mock.redHerringsEmbedded } as any;
      const v = validateSceneChapter(chapterPayload);
      if (!v.valid) return res.status(502).json({ success: false, error: 'chapter_schema_invalid', details: v.errors, chapter: chapterPayload });
      const cleanedChapter = { title, summary: mock.summary, wordCount: chapterPayload.words, content: mock.content, cluesEmbedded: mock.cluesEmbedded, redHerringsEmbedded: mock.redHerringsEmbedded };
      return res.json({ success: true, scene_id: sceneId, chapter: cleanedChapter });
    }

    const { scene_id, chapter } = await runSceneWriting(bp.outline as any, sceneId, { profile, seed, vars: options });
    const computedWords = (chapter.content || '').length;
    const title = (chapter.title && String(chapter.title).trim().length > 0) ? chapter.title : `Scene ${sceneId}`;
    const chapterPayload = { scene_id, title, summary: chapter.summary, words: chapter.wordCount || computedWords, text: chapter.content, cluesEmbedded: chapter.cluesEmbedded, redHerringsEmbedded: chapter.redHerringsEmbedded } as any;
    const v = validateSceneChapter(chapterPayload);
    if (!v.valid) return res.status(502).json({ success: false, error: 'chapter_schema_invalid', details: v.errors, chapter: chapterPayload });

    const cleanedChapter = { title, summary: chapter.summary, wordCount: chapterPayload.words, content: chapter.content, cluesEmbedded: chapter.cluesEmbedded, redHerringsEmbedded: chapter.redHerringsEmbedded };
    return res.json({ success: true, scene_id, chapter: cleanedChapter });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: 'internal_error', message: String(err?.message || err) });
  }
});

// POST /api/projects/:projectId/edit?scene_id=S3 - 逐章编辑降级（不落库）
// 方式A：传入 body.chapter（{title,content,wordCount?,summary?}），直接编辑
// 方式B：仅传 scene_id，则先写作后编辑
router.post('/:projectId/edit', async (req, res) => {
  const { projectId } = req.params as { projectId: string };
  const sceneId = (req.query.scene_id as string) || '';
  const body = req.body || {};
  const { profile, seed, options } = body;
  try {
    const db = getDatabase();
    const proj = await db.collection(COLLECTIONS.STORY_PROJECTS).findOne({ projectId });
    if (!proj) return res.status(404).json({ success: false, error: 'project_not_found' });

    let chapter = body.chapter;
    if (!chapter) {
      if (!sceneId) return res.status(400).json({ success: false, error: 'scene_id_required_or_chapter' });
      const blueprintId = proj.blueprint_id;
      if (!blueprintId) return res.status(409).json({ success: false, error: 'no_blueprint' });
      const bp = await db.collection(COLLECTIONS.STORY_BLUEPRINTS).findOne({ blueprintId });
      if (!bp) return res.status(404).json({ success: false, error: 'blueprint_not_found' });

      // Fast mock for edit when source not provided
      const fast = process.env.DETECTIVE_EDIT_FAST === '1' || process.env.DETECTIVE_USE_MOCK === '1' || (options && options.fastMock === true);
      if (fast) {
        const mock = synthMockChapter(sceneId, bp.outline as any);
        const computedWords = (mock.content || '').length;
        const title = (mock.title && String(mock.title).trim().length > 0) ? mock.title : `Scene ${sceneId}`;
        const chapterPayload = { scene_id: sceneId, title, summary: mock.summary, words: mock.wordCount || computedWords, text: mock.content, cluesEmbedded: mock.cluesEmbedded, redHerringsEmbedded: mock.redHerringsEmbedded } as any;
        const v = validateSceneChapter(chapterPayload);
        if (!v.valid) return res.status(502).json({ success: false, error: 'chapter_schema_invalid', details: v.errors, chapter: chapterPayload });
        const cleanedEdited = { title, summary: mock.summary, wordCount: chapterPayload.words, content: mock.content, cluesEmbedded: mock.cluesEmbedded, redHerringsEmbedded: mock.redHerringsEmbedded };
        return res.json({ success: true, scene_id: sceneId, chapter: cleanedEdited });
      }

      const r = await runSceneWriting(bp.outline as any, sceneId, { profile, seed, vars: options });
      chapter = r.chapter;
    }

    const edited = await runSceneEditing(chapter, { profile, seed, vars: options });
    const computedWords = (edited.content || '').length;
    const title = (edited.title && String(edited.title).trim().length > 0) ? edited.title : (sceneId ? `Scene ${sceneId}` : 'SCENE');
    const chapterPayload = { scene_id: sceneId || 'SCENE', title, summary: edited.summary, words: edited.wordCount || computedWords, text: edited.content, cluesEmbedded: (edited as any).cluesEmbedded, redHerringsEmbedded: (edited as any).redHerringsEmbedded } as any;
    const v = validateSceneChapter(chapterPayload);
    if (!v.valid) return res.status(502).json({ success: false, error: 'chapter_schema_invalid', details: v.errors, chapter: chapterPayload });

    const cleanedEdited = { title, summary: edited.summary, wordCount: chapterPayload.words, content: edited.content, cluesEmbedded: (edited as any).cluesEmbedded, redHerringsEmbedded: (edited as any).redHerringsEmbedded };
    return res.json({ success: true, scene_id: sceneId || 'SCENE', chapter: cleanedEdited });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: 'internal_error', message: String(err?.message || err) });
  }
});

// POST /api/projects/:projectId/validate - 快速校验（基于单章或传入 draft）
router.post('/:projectId/validate', async (req, res) => {
  const { projectId } = req.params as { projectId: string };
  const { chapter, draft } = req.body || {};
  try {
    const db = getDatabase();
    const proj = await db.collection(COLLECTIONS.STORY_PROJECTS).findOne({ projectId });
    if (!proj) return res.status(404).json({ success: false, error: 'project_not_found' });
    const blueprintId = proj.blueprint_id;
    if (!blueprintId) return res.status(409).json({ success: false, error: 'no_blueprint' });
    const bp = await db.collection(COLLECTIONS.STORY_BLUEPRINTS).findOne({ blueprintId });
    if (!bp) return res.status(404).json({ success: false, error: 'blueprint_not_found' });

    const draftObj = draft || (chapter ? { chapters: [chapter] } : { chapters: [] });
    const report = runStage4Validation(bp.outline as any, draftObj as any, { outlineId: blueprintId });
    return res.json({ success: true, report });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: 'internal_error', message: String(err?.message || err) });
  }
});

// POST /api/projects/:projectId/autofix - 自动修订器
router.post('/:projectId/autofix', async (req, res) => {
  const { projectId } = req.params as { projectId: string };
  const body = req.body || {};
  const { draft, chapter, policy, updateOutlineExpected } = body;
  try {
    const db = getDatabase();
    const proj = await db.collection(COLLECTIONS.STORY_PROJECTS).findOne({ projectId });
    if (!proj) return res.status(404).json({ success: false, error: 'project_not_found' });
    const blueprintId = proj.blueprint_id;
    if (!blueprintId) return res.status(409).json({ success: false, error: 'no_blueprint' });
    const bp = await db.collection(COLLECTIONS.STORY_BLUEPRINTS).findOne({ blueprintId });
    if (!bp) return res.status(404).json({ success: false, error: 'blueprint_not_found' });

    // 允许传单章时构造最小草稿骨架：Chapter 1 / (给定章节) / Chapter 3
    let draftObj = draft as any;
    if (!draftObj && chapter) {
      draftObj = {
        chapters: [
          { title: 'Chapter 1', summary: '', content: '', wordCount: 0, cluesEmbedded: [], redHerringsEmbedded: [] },
          { title: (chapter.title || 'Chapter 2'), summary: (chapter.summary || ''), content: (chapter.content || ''), wordCount: (chapter.wordCount || 0), cluesEmbedded: (chapter.cluesEmbedded || []), redHerringsEmbedded: (chapter.redHerringsEmbedded || []) },
          { title: 'Chapter 3', summary: '', content: '', wordCount: 0, cluesEmbedded: [], redHerringsEmbedded: [] },
        ],
      };
    }
    if (!draftObj) return res.status(400).json({ success: false, error: 'draft_or_chapter_required' });

    const { draft: patchedDraft, outline: patchedOutline, changes } = enforceCluePolicy(bp.outline as any, draftObj, {
      ch1MinClues: (policy && typeof policy.ch1MinClues === 'number') ? policy.ch1MinClues : 2,
      minExposures: (policy && typeof policy.minExposures === 'number') ? policy.minExposures : 2,
      ensureFinalRecovery: true,
      adjustOutlineExpectedChapters: !!updateOutlineExpected,
      maxRedHerringRatio: (policy && typeof policy.maxRedHerringRatio === 'number') ? policy.maxRedHerringRatio : 0.3,
      maxRedHerringPerChapter: (policy && typeof policy.maxRedHerringPerChapter === 'number') ? policy.maxRedHerringPerChapter : 2,
    });

    const outlineSource = (patchedOutline as any) || (bp.outline as any);
    const harmonized = harmonizeOutlineWithDraft(outlineSource, patchedDraft, {
      ensureMechanismKeywords: true,
    });
    const finalOutline = harmonized.outline;

    if (updateOutlineExpected) {
      await db.collection(COLLECTIONS.STORY_BLUEPRINTS).updateOne(
        { blueprintId },
        { $set: { outline: finalOutline, updatedAt: new Date() } },
      );
    }

    return res.json({
      success: true,
      draft: patchedDraft,
      outline: finalOutline,
      outlineUpdated: !!updateOutlineExpected,
      changes,
      harmonizeMeta: harmonized.meta,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: 'internal_error', message: String(err?.message || err) });
  }
});

// POST /api/projects/:projectId/compile - 导出 HTML+互动包
router.post('/:projectId/compile', async (req, res) => {
  const { projectId } = req.params as { projectId: string };
  const format = String((req.query.format as string) || 'html+interactive');
  const { draft } = req.body || {};
  try {
    if (!draft || !Array.isArray(draft?.chapters)) {
      return res.status(400).json({ success: false, error: 'draft_required' });
    }
    const db = getDatabase();
    const proj = await db.collection(COLLECTIONS.STORY_PROJECTS).findOne({ projectId });
    if (!proj) return res.status(404).json({ success: false, error: 'project_not_found' });
    const blueprintId = proj.blueprint_id;
    if (!blueprintId) return res.status(409).json({ success: false, error: 'no_blueprint' });
    const bp = await db.collection(COLLECTIONS.STORY_BLUEPRINTS).findOne({ blueprintId });
    if (!bp) return res.status(404).json({ success: false, error: 'blueprint_not_found' });

    if (format !== 'html+interactive') return res.status(400).json({ success: false, error: 'unsupported_format' });

    const compiled = await compileToOutputs({
      projectId,
      title: (proj as any).title || '侦探故事',
      outline: bp.outline as any,
      draft: draft as any,
    });
    return res.json({ success: true, urls: compiled.urls, plainText: compiled.plainText });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: 'internal_error', message: String(err?.message || err) });
  }
});

export default router;
