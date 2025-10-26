#!/usr/bin/env node

/**
 * Stage0 helper script.
 *
 * Scans storage/exports for workflow artifacts and collects basic metrics
 * (clue density, timeline events, suspect counts, etc.). The script is
 * tolerant to missing fields so it can run before the new Blueprint schema
 * is fully in place.
 *
 * Usage:
 *   scripts/dev/nodehere node scripts/analysis/compute_complexity_baseline.mjs
 */

import { promises as fs } from 'fs';
import path from 'path';

const ROOT = process.cwd();
const EXPORTS_DIR = path.join(ROOT, 'storage', 'exports');
const OUTPUT_PATH = path.join(ROOT, 'reports', 'complexity-baseline-stage0.json');

function countChapters(markdown) {
  if (!markdown) return null;
  const lines = markdown.split(/\r?\n/);
  const headingPattern = /^(#{2,3}\s+)|^(第[一二三四五六七八九十百千]+章)/;
  let count = 0;
  for (const line of lines) {
    if (headingPattern.test(line.trim())) {
      count += 1;
    }
  }
  return count > 0 ? count : null;
}

async function safeReadJson(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function safeReadText(filePath) {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return null;
  }
}

function roleLooksLikeSuspect(role = '') {
  const normalized = String(role).toLowerCase();
  return (
    normalized.includes('suspect') ||
    normalized.includes('嫌疑') ||
    normalized.includes('嫌疑人') ||
    normalized.includes('嫌犯')
  );
}

function calcStats(values) {
  if (!values.length) return null;
  const sum = values.reduce((acc, v) => acc + v, 0);
  const avg = sum / values.length;
  const min = Math.min(...values);
  const max = Math.max(...values);
  return {
    count: values.length,
    average: Number(avg.toFixed(3)),
    min,
    max,
  };
}

async function main() {
  let entries;
  try {
    entries = await fs.readdir(EXPORTS_DIR, { withFileTypes: true });
  } catch (err) {
    console.error('无法读取 storage/exports 目录，请确认 Stage0 有可用样本。', err);
    process.exitCode = 1;
    return;
  }

  const results = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dirPath = path.join(EXPORTS_DIR, entry.name);
    const interactive = await safeReadJson(path.join(dirPath, 'interactive.json'));
    const storyText = await safeReadText(path.join(dirPath, 'story.txt'));

    const clues = interactive?.interactive_pack?.clue_matrix ?? [];
    const timeline = interactive?.interactive_pack?.timeline_view ?? [];
    const cast = interactive?.interactive_pack?.cast_cards ?? [];

    const chapterCount = countChapters(storyText);
    const clueCount = Array.isArray(clues) ? clues.length : null;
    const timelineCount = Array.isArray(timeline) ? timeline.length : null;
    const suspectCount = Array.isArray(cast)
      ? cast.filter((card) => roleLooksLikeSuspect(card.role)).length
      : null;

    const clueDensity =
      clueCount !== null && chapterCount !== null && chapterCount > 0
        ? Number((clueCount / chapterCount).toFixed(3))
        : null;

    const sample = {
      workflow: entry.name,
      hasInteractive: Boolean(interactive),
      chapterCount,
      clueCount,
      clueDensity,
      timelineCount,
      suspectCount,
      notes: [],
    };

    if (!interactive) {
      sample.notes.push('缺少 interactive.json');
    } else {
      if (clueCount === null) sample.notes.push('缺少 clue_matrix');
      if (timelineCount === null) sample.notes.push('缺少 timeline_view');
      if (suspectCount === null) sample.notes.push('缺少 cast_cards');
    }
    if (chapterCount === null) {
      sample.notes.push('无法识别章节数量（story.txt 不存在或缺少章节标题）');
    }

    results.push(sample);
  }

  const metrics = {
    clueDensity: calcStats(results.flatMap((item) => (item.clueDensity !== null ? [item.clueDensity] : []))),
    clueCount: calcStats(results.flatMap((item) => (item.clueCount !== null ? [item.clueCount] : []))),
    timelineCount: calcStats(results.flatMap((item) => (item.timelineCount !== null ? [item.timelineCount] : []))),
    chapterCount: calcStats(results.flatMap((item) => (item.chapterCount !== null ? [item.chapterCount] : []))),
    suspectCount: calcStats(results.flatMap((item) => (item.suspectCount !== null ? [item.suspectCount] : []))),
  };

  const report = {
    generatedAt: new Date().toISOString(),
    sampleCount: results.length,
    metrics,
    samples: results,
  };

  await fs.writeFile(OUTPUT_PATH, JSON.stringify(report, null, 2), 'utf8');
  console.log(`Stage0 基准统计已写入 ${path.relative(ROOT, OUTPUT_PATH)}`);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error('Stage0 脚本执行失败', err);
  process.exitCode = 1;
});
