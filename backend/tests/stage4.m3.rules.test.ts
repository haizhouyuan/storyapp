import { runStage4Validation } from '../src/agents/detective/validators/stage4Validator';
import type { DetectiveOutline, DetectiveStoryDraft } from '@storyapp/shared';

describe('Stage4 Validator - M3 rules', () => {
  test('fairness-min-exposures + language-adaptation metrics', () => {
    const outline: DetectiveOutline = {
      clueMatrix: [
        { clue: '门缝铜丝', mustForeshadow: true, explicitForeshadowChapters: ['Chapter 1'] },
        { clue: '第七钟后细响', mustForeshadow: true, explicitForeshadowChapters: ['Chapter 1'] },
      ],
      timeline: [ { time: 'Day1 19:00', event: '七声钟' }, { time: 'Day1 22:30', event: '机关' } ],
      centralTrick: { summary: '风道滑轮共振', mechanism: '风道 滑轮 共振' },
    };

    const draft: DetectiveStoryDraft = {
      chapters: [
        { title: 'Ch1', summary: '', content: '门缝铜丝 第七钟后细响 19:00', cluesEmbedded: ['门缝铜丝'] },
        { title: 'Ch2', summary: '', content: '…… 门缝铜丝 22:30', cluesEmbedded: [] },
        { title: 'Final', summary: '', content: '回收线索：门缝铜丝 第七钟后细响。', cluesEmbedded: ['门缝铜丝','第七钟后细响'] },
      ] as any
    };

    const report = runStage4Validation(outline as any, draft as any);
    expect(report.results.find(r => r.ruleId === 'fairness-min-exposures')).toBeTruthy();
    const lang = report.results.find(r => r.ruleId === 'language-adaptation');
    expect(lang).toBeTruthy();
    if (report.metrics) {
      expect(typeof report.metrics.redHerringRatio).toBe('number');
      expect(typeof report.metrics.avgSentenceLen).toBe('number');
    }
  });
});
