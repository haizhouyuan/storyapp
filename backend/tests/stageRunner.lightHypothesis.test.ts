import { evaluateLightHypothesesSeries, __testing as stageTesting } from '../src/agents/detective/stageRunner';
import type { DetectiveOutline, DetectiveStoryDraft } from '@storyapp/shared';

const outline: DetectiveOutline = {
  characters: [
    { name: '张华', role: 'suspect', motiveKeywords: ['遗产'] },
    { name: '刘芳', role: 'suspect', motiveKeywords: ['复仇'] },
  ],
};

const draft: DetectiveStoryDraft = {
  chapters: [
    { title: '第一章', summary: '', content: '张华声称案发时在阁楼整理遗产文书。' },
    { title: '第二章', summary: '', content: '刘芳提及暗门与钟表机关的传闻。' },
    { title: '第三章', summary: '', content: '侦探记录张华衣袖的润滑油味道。' },
  ],
};

afterEach(() => {
  stageTesting.resetLightHypothesisCache();
  stageTesting.setCallDeepseekMock(null);
});

test('evaluateLightHypothesesSeries uses injected runner and chapter limit', async () => {
  const fakeRank = [{ name: '张华', score: 0.7, evidenceIds: ['c:1-1'] }];
  const runner = jest.fn().mockResolvedValue(fakeRank);

  const snapshots = await evaluateLightHypothesesSeries(outline, draft, {
    chapterLimit: 1,
    runner,
  });

  expect(runner).toHaveBeenCalledTimes(2);
  expect(snapshots).toHaveLength(2);
  expect(snapshots[0].rank[0]).toEqual(fakeRank[0]);
});

test('runLightHypothesisEval caches identical payloads', async () => {
  const payload = '证据包:张华';
  let callCount = 0;
  stageTesting.setCallDeepseekMock(async () => {
    callCount += 1;
    return {
      content: JSON.stringify({ rank: [{ name: '张华', score: 0.6, evidence_ids: ['c1'] }] }),
      usage: undefined,
    };
  });

  const first = await stageTesting.runLightHypothesisEvalForTest(payload);
  const second = await stageTesting.runLightHypothesisEvalForTest(payload);

  expect(callCount).toBe(1);
  expect(first?.[0].name).toBe('张华');
  expect(second?.[0].name).toBe('张华');
  expect(stageTesting.getLightHypothesisCacheSize()).toBe(1);
});
