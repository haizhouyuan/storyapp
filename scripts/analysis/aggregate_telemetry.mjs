#!/usr/bin/env node

/**
 * Aggregates stage metrics generated in reports/telemetry.
 *
 * Usage:
 *   scripts/dev/nodehere node scripts/analysis/aggregate_telemetry.mjs
 */

import { promises as fs } from 'fs';
import path from 'path';

const ROOT = process.cwd();
const METRIC_DIR = path.join(ROOT, 'reports', 'telemetry');
const OUTPUT_FILE = path.join(ROOT, 'reports', 'telemetry-summary.json');

async function loadTelemetryEntries() {
  try {
    const files = await fs.readdir(METRIC_DIR);
    const entries = [];
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const fullPath = path.join(METRIC_DIR, file);
      try {
        const raw = await fs.readFile(fullPath, 'utf8');
        const data = JSON.parse(raw);
        if (data && typeof data === 'object' && typeof data.stage === 'string') {
          entries.push({ ...data, file: fullPath });
        }
      } catch {
        // ignore broken entry
      }
    }
    return entries;
  } catch (error) {
    console.error('无法读取 telemetry 目录', error);
    return [];
  }
}

function summariseByStage(entries) {
  const summary = {};
  entries.forEach((entry) => {
    const stage = entry.stage;
    if (!summary[stage]) {
      summary[stage] = { count: 0, latest: null, snapshots: [] };
    }
    summary[stage].count += 1;
    summary[stage].snapshots.push(entry);
    if (
      !summary[stage].latest ||
      new Date(entry.generatedAt || 0).getTime() > new Date(summary[stage].latest.generatedAt || 0).getTime()
    ) {
      summary[stage].latest = entry;
    }
  });
  Object.values(summary).forEach((stageSummary) => {
    stageSummary.snapshots.sort(
      (a, b) => new Date(a.generatedAt || 0).getTime() - new Date(b.generatedAt || 0).getTime(),
    );
  });
  return summary;
}

async function main() {
  const entries = await loadTelemetryEntries();
  if (entries.length === 0) {
    console.log('未发现任何 telemetry 指标文件，请先运行工作流或检查 DETECTIVE_METRICS 配置。');
    return;
  }
  const summary = summariseByStage(entries);
  const report = {
    generatedAt: new Date().toISOString(),
    totalEntries: entries.length,
    stages: Object.keys(summary).map((stage) => ({
      stage,
      count: summary[stage].count,
      latestGeneratedAt: summary[stage].latest?.generatedAt ?? null,
      latestMetrics: summary[stage].latest?.metrics ?? null,
    })),
  };

  await fs.writeFile(OUTPUT_FILE, JSON.stringify(report, null, 2), 'utf8');
  console.log(`Telemetry 汇总已写入 ${path.relative(ROOT, OUTPUT_FILE)}`);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error('telemetry 汇总失败', error);
  process.exitCode = 1;
});
