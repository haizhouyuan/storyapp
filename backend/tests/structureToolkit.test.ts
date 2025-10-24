import { assertPlantPayoffCompleteness, planDenouement } from '../src/agents/detective/structureToolkit';
import type {
  ClueGraph,
  DetectiveOutline,
  DetectiveStoryDraft,
  Stage3AnalysisSnapshot,
  FairPlayReport,
} from '@storyapp/shared';
import {
  computeFairPlayGate,
  computeComplexityGate,
  computeHypothesisGate,
} from '../src/services/detectiveWorkflowService';

const sampleOutline: DetectiveOutline = {
  centralTrick: {
    summary: '通过定时机械导致滴水延迟触发陷阱',
    mechanism: '机械机关 + 延时落锤',
    fairnessNotes: ['需要在结尾做小实验复现机关'],
  },
  characters: [
    { name: '秦川', role: 'detective' },
    { name: '林岚', role: 'sidekick' },
    { name: '张华', role: 'suspect', motive: '遗产争夺', motiveKeywords: ['遗产'] },
    { name: '刘芳', role: 'suspect', motive: '复仇', motiveKeywords: ['复仇'] },
  ],
};

const sampleDraft: DetectiveStoryDraft = {
  chapters: [
    { title: '第一章', summary: '', content: '案发现场出现滴水声，张华神情慌乱。' },
    {
      title: '第二章',
      summary: '',
      content: '刘芳描述遗产争执，侦探记录檐角滴水的间隔与发条设定一致的细节。',
    },
    {
      title: '第三章',
      summary: '',
      content:
        '聚众揭示中，侦探复现檐角滴水的间隔与发条设定一致的机关，并指出张华的袖口残留润滑油，证明其设定延迟。',
    },
  ],
};

const sampleGraph: ClueGraph = {
  nodes: [
    {
      id: 'c:1-1',
      kind: 'clue',
      text: '檐角滴水的间隔与发条设定一致',
      visibleBeforeDenouement: true,
      type: 'true',
    },
    {
      id: 'c:2-1',
      kind: 'clue',
      text: '张华的袖口残留润滑油',
      visibleBeforeDenouement: true,
      type: 'true',
    },
    {
      id: 'i:1',
      kind: 'inference',
      text: '只有熟悉发条机关的人才能设定滴水延迟',
      visibleBeforeDenouement: true,
    },
    {
      id: 'd:final',
      kind: 'denouement',
      text: '通过复现滴水机关证明张华设定了发条延迟',
      visibleBeforeDenouement: false,
    },
  ],
  edges: [
    { from: 'c:1-1', to: 'i:1' },
    { from: 'c:2-1', to: 'i:1' },
    { from: 'i:1', to: 'd:final' },
  ],
};

describe('structureToolkit', () => {
  test('assertPlantPayoffCompleteness returns empty when payoffs present', () => {
    const issues = assertPlantPayoffCompleteness(sampleGraph, sampleDraft);
    expect(issues).toHaveLength(0);
  });

  test('assertPlantPayoffCompleteness identifies missing payoff', () => {
    const draftMissing: DetectiveStoryDraft = {
      chapters: [
        { title: '第一章', summary: '', content: '案发现场出现滴水声。' },
        { title: '第二章', summary: '', content: '刘芳描述遗产争执。' },
        {
          title: '第三章',
          summary: '',
          content: '聚众揭示时未再提滴水机关，只凭口供定案。',
        },
      ],
    };
    const issues = assertPlantPayoffCompleteness(sampleGraph, draftMissing);
    expect(issues).not.toHaveLength(0);
    expect(issues[0]).toMatch(/线索/);
  });

  test('planDenouement generates recap bullets and elimination order', () => {
    const script = planDenouement(sampleOutline, sampleDraft, sampleGraph);
    expect(script.recapBullets.length).toBeGreaterThan(0);
    expect(script.eliminationOrder.map((item) => item.suspect)).toEqual(
      expect.arrayContaining(['张华', '刘芳']),
    );
    expect(script.finalContradiction).toContain('滴水');
    expect(['experiment', 'psychology', 'mechanism']).toContain(script.lastPush);
  });
});

describe('validation gates', () => {
  test('computeFairPlayGate flags unsupported inferences', () => {
    const report: FairPlayReport = {
      unsupportedInferences: ['i:missing'],
      orphanClues: [],
      economyScore: 0.5,
    };
    const gate = computeFairPlayGate(report, { autoFixAttempted: false });
    expect(gate.verdict).toBe('warn');
    expect(gate.reason).toMatch(/推论/);
    expect(gate.nextAction).toBe('auto_patch');
  });

  test('computeFairPlayGate passes when all inferences supported', () => {
    const report: FairPlayReport = {
      unsupportedInferences: [],
      orphanClues: ['c:unused'],
      economyScore: 0.8,
    };
    const gate = computeFairPlayGate(report, { autoFixAttempted: true });
    expect(gate.verdict).toBe('warn');
    expect(gate.nextAction).toBe('notify');
  });

  test('computeHypothesisGate warns when confidence gap is small', () => {
    const analysis: Stage3AnalysisSnapshot = {
      hypotheses: {
        candidates: [
          { suspect: '张华', confidence: 0.55, evidence: ['线索A'] },
          { suspect: '刘芳', confidence: 0.45, evidence: ['线索B'] },
        ],
      },
    };
    const gate = computeHypothesisGate(analysis);
    expect(gate.verdict).toBe('warn');
    expect(gate.metrics?.confidenceGap).toBeCloseTo(0.1);
  });

  test('computeComplexityGate requires two strong competitors and sufficient gap', () => {
    const baseline: Stage3AnalysisSnapshot = {
      hypotheses: {
        candidates: [
          { suspect: '张华', confidence: 0.75, evidence: ['线索A'] },
          { suspect: '刘芳', confidence: 0.25, evidence: ['线索B'] },
          { suspect: '陈伟', confidence: 0.2, evidence: ['线索C'] },
        ],
      },
    };
    const gateWarn = computeComplexityGate(baseline);
    expect(gateWarn.verdict).toBe('warn');

    const stronger: Stage3AnalysisSnapshot = {
      hypotheses: {
        candidates: [
          { suspect: '张华', confidence: 0.8, evidence: ['线索A'] },
          { suspect: '刘芳', confidence: 0.35, evidence: ['线索B'] },
          { suspect: '陈伟', confidence: 0.32, evidence: ['线索C'] },
        ],
      },
    };
    const gatePass = computeComplexityGate(stronger);
    expect(gatePass.verdict).toBe('pass');
    expect(gatePass.metrics?.competitors).toBeGreaterThanOrEqual(2);
  });
});
