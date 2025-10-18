import type { DetectiveOutline } from '@storyapp/shared';
import { DETECTIVE_MECHANISM_GROUPS } from '@storyapp/shared';

export type OutlineScore = {
  score: number; // 0..1
  factors: Record<string, number>;
  notes?: string[];
};

function safeArray<T = any>(v: any): T[] { return Array.isArray(v) ? v as T[] : []; }

function hasForeshadowInCh1(outline: any): boolean {
  const cm = safeArray(outline?.clueMatrix);
  if (cm.length === 0) return false;
  let ok = 0; let total = 0;
  for (const c of cm) {
    if (!c) continue;
    total++;
    const ex = safeArray<string>(c.explicitForeshadowChapters);
    if (ex.some(x => /chapter\s*1/i.test(String(x)))) ok++;
  }
  return ok >= Math.min(2, Math.ceil(total * 0.5));
}

function timelineLooksConsistent(outline: any): boolean {
  const tl = outline?.timeline;
  const arr = Array.isArray(tl) ? tl : (Array.isArray(tl?.events) ? tl.events : []);
  if (!arr || arr.length < 2) return true;
  // 简易检查：time 字段存在 & 事件数量≥2
  return arr.every((e: any) => e && (e.time || e.t));
}

const DEVICE_HOOKS = Array.from(
  new Set(
    Object.values(DETECTIVE_MECHANISM_GROUPS)
      .flatMap((cfg) => cfg.requires),
  ),
);

function hasDeviceHooks(outline: any): number {
  const mech = String(outline?.centralTrick?.mechanism || (outline as any)?.central_device?.mechanism || '');
  let hit = 0;
  for (const hook of DEVICE_HOOKS) {
    if (mech.includes(hook)) {
      hit += 1;
    }
  }
  return Math.min(hit / 3, 1); // 最多计到 1
}

export function scoreOutline(outline: DetectiveOutline): OutlineScore {
  const notes: string[] = [];
  const characters = safeArray((outline as any)?.characters || (outline as any)?.cast);
  const acts = safeArray((outline as any)?.acts);
  const cm = safeArray((outline as any)?.clueMatrix || (outline as any)?.clues);

  const f_char = Math.min(characters.length / 6, 1);
  if (f_char < 1) notes.push('角色少于6');

  const f_acts = Math.min(acts.length / 3, 1);
  if (f_acts < 1) notes.push('幕数少于3');

  const f_clues = Math.min(cm.length / 4, 1);
  if (f_clues < 1) notes.push('线索少于4');

  const f_foreshadow = hasForeshadowInCh1(outline) ? 1 : 0;
  if (!f_foreshadow) notes.push('Chapter1 铺垫不足');

  const f_timeline = timelineLooksConsistent(outline) ? 1 : 0.7;
  const f_device = hasDeviceHooks(outline);

  // 加权：角色/幕/线索(0.4)，铺垫(0.2)，时间线(0.2)，可行性钩子(0.2)
  const structure = (f_char + f_acts + f_clues) / 3;
  const score = 0.4 * structure + 0.2 * f_foreshadow + 0.2 * f_timeline + 0.2 * f_device;
  return {
    score: Number(score.toFixed(3)),
    factors: { structure, f_char, f_acts, f_clues, f_foreshadow, f_timeline, f_device },
    notes,
  };
}
