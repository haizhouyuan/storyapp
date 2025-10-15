import fs from 'fs';
import path from 'path';
import { resolvePromptProfile, PromptProfileName, PromptProfile } from './promptProfiles';

export interface PromptBuildOptions {
  profile?: PromptProfileName;
  seed?: number | string;
  vars?: Record<string, unknown>;
}

function readTemplate(file: string): string | null {
  const p1 = path.resolve(process.cwd(), 'backend/prompts/templates', file);
  const p2 = path.resolve(process.cwd(), 'prompts/templates', file);
  if (fs.existsSync(p1)) return fs.readFileSync(p1, 'utf8');
  if (fs.existsSync(p2)) return fs.readFileSync(p2, 'utf8');
  return null;
}

function get(obj: any, key: string): any {
  return key.split('.').reduce((acc, k) => (acc && acc[k] !== undefined ? acc[k] : undefined), obj);
}

function render(template: string, context: Record<string, any>): string {
  return template.replace(/\{\{\s*([\w\.]+)\s*\}\}/g, (_m, key) => {
    const val = get(context, key);
    return val === undefined || val === null ? '' : String(val);
  });
}

export function buildPlannerPrompt(topic: string, options?: PromptBuildOptions): { system: string; user: string; profile: PromptProfile } {
  const profile = resolvePromptProfile(options?.profile);
  const systemTpl = readTemplate('planner.system.hbs');
  const userTpl = readTemplate('planner.user.hbs');
  const system = systemTpl || '你是剧情规划器。仅输出严格 JSON。禁止解释。';
  const userBase = userTpl || [
    '主题：{{topic}}',
    '要求：仅 JSON；3幕结构；至少6个角色；线索需公平铺垫。',
    '中心奇迹关键词（至少包含其中若干）：{{profile.planner.enforceDeviceKeywords}}',
    'Chapter 1 必须出现关键线索：{{profile.planner.requireCh1Foreshadow}}',
    '时间线包含潮汐/风力峰值：{{profile.planner.includeTideOrWindPeakInTimeline}}'
  ].join('\n');
  const ctx = { topic, profile, seed: options?.seed, ...(options?.vars || {}) };
  return { system, user: render(userBase, ctx), profile };
}

export function buildWriterPrompt(outline: any, options?: PromptBuildOptions): { system: string; user: string; profile: PromptProfile } {
  const profile = resolvePromptProfile(options?.profile);
  const systemTpl = readTemplate('writer.system.hbs');
  const userTpl = readTemplate('writer.user.hbs');
  const system = systemTpl || '你是儿童向长篇小说写作引擎。只输出指定 JSON 字段。';
  // 支持从 vars 里读取目标字数（多种命名兼容）
  const vars = (options?.vars || {}) as Record<string, unknown>;
  const pick = (o: any, keys: string[]): any => {
    for (const k of keys) {
      const v = get(o, k);
      if (v !== undefined && v !== null && v !== '') return v;
    }
    return undefined;
  };
  const wordsTargetRaw = pick(vars, ['targets.wordsPerScene', 'targetWords', 'words']);
  const wordsTarget = typeof wordsTargetRaw === 'string' ? parseInt(wordsTargetRaw as string, 10) : (wordsTargetRaw as number | undefined);
  const wordsLine = wordsTarget && Number.isFinite(wordsTarget) && wordsTarget > 0
    ? `字数目标：${wordsTarget}±15%。`
    : '';

  const userBase = userTpl || [
    '大纲：\n{{outline}}',
    '句长目标：≤{{profile.writer.sentenceTarget}}，长句阈值：>{{profile.writer.longSentenceThreshold}} 拆分。',
    '第三章应包含对峙：{{profile.writer.includeInterrogationInFinal}}',
    'Chapter 1 需显式标注至少 {{profile.writer.chapter1CluesMinCount}} 个 [CLUE: ...]。',
    '设备可行性可观察钩子≥{{profile.writer.deviceHooksMinCount}}。',
    '{{wordsLine}}',
    '仅返回 JSON。'
  ].join('\n');
  const ctx = { outline: JSON.stringify(outline, null, 2), profile, seed: options?.seed, wordsLine, ...(vars) };
  return { system, user: render(userBase, ctx), profile };
}

export function buildEditorPrompt(options?: PromptBuildOptions): { system: string; user: string; profile: PromptProfile } {
  const profile = resolvePromptProfile(options?.profile);
  const systemTpl = readTemplate('editor.system.hbs');
  const userTpl = readTemplate('editor.user.hbs');
  const system = systemTpl || '你是分级编辑器。保持剧情不变，控制句长、词频，删除不当用词。只返回同结构 JSON。';
  // 读取目标字数（可选），用于扩写/压缩策略
  const vars = (options?.vars || {}) as Record<string, unknown>;
  const pick = (o: any, keys: string[]): any => {
    for (const k of keys) {
      const seg = k.split('.');
      let cur: any = o; let ok = true;
      for (const kk of seg) { if (cur && kk in cur) cur = (cur as any)[kk]; else { ok=false; break; } }
      if (ok && cur !== undefined && cur !== null && cur !== '') return cur;
    }
    return undefined;
  };
  const wordsTargetRaw = pick(vars, ['targets.wordsPerScene', 'targetWords', 'words']);
  const wordsTarget = typeof wordsTargetRaw === 'string' ? parseInt(wordsTargetRaw as string, 10) : (wordsTargetRaw as number | undefined);
  const minPct = 0.85, maxPct = 1.15;
  const lengthLine = wordsTarget && Number.isFinite(wordsTarget) && wordsTarget > 0
    ? `若当前字数 < ${Math.round(wordsTarget*minPct)} 则扩写至约 ${wordsTarget}±15%；若 > ${Math.round(wordsTarget*maxPct)} 则压缩至约 ${wordsTarget}±15%。`
    : '';

  const userBase = userTpl || [
    '阅读级别 middle_grade；去除可能引发噩梦的描写（血腥/细节化暴力）。',
    '规范标点：{{profile.editor.normalizePunctuation}}',
    '保持剧情不变，优先：拆长句、精炼冗词、替换不当词。',
    '{{lengthLine}}',
    '输入：章节 JSON（包含 scene_id,title,words,text）。',
    '输出：同结构 JSON（仅修订 text）。',
    '仅返回 JSON。'
] .join('\n');
  const ctx = { profile, lengthLine, ...(vars) };
  const user = (function(){
    // simple mustache-like rendering
    const renderStr = (tpl: string, context: Record<string, any>) => tpl.replace(/\{\{\s*([\w\.]+)\s*\}\}/g, (_m, key) => {
      const parts = key.split('.');
      let cur: any = context;
      for (const k of parts) { if (cur && k in cur) cur = cur[k]; else { cur=''; break; } }
      return String(cur ?? '');
    });
    return renderStr(userBase, ctx);
  })();
  return { system, user, profile };
}