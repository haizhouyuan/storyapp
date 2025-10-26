import { __testing as stageTesting } from '../src/agents/detective/stageRunner';
import type { DetectiveStoryDraft, MotivePatchCandidate } from '@storyapp/shared';

describe('stageRunner motive insertion helpers', () => {
  test('insertMotiveSentenceIntoChapter aligns sentence after suspect cue', () => {
    const baseContent = ['李华靠在窗边沉默不语。', '', '助手继续追问案件细节。'].join('\n');
    const sentence = '一提起遗产分配，李华的语气明显一滞。';

    const result = stageTesting.insertMotiveSentenceIntoChapterForTest({
      content: baseContent,
      sentence,
      suspect: '李华',
      keyword: '遗产',
    });

    expect(result.inserted).toBe(true);
    expect(result.text).toContain(sentence);
    expect(result.text.indexOf('李华靠在窗边沉默不语。')).toBeLessThan(result.text.indexOf(sentence));
    expect(result.text.split('\n').length).toBeGreaterThan(baseContent.split('\n').length);
  });

  test('applyMotiveCandidatesToDraft uses contextual insertion notes', () => {
    const draft: DetectiveStoryDraft = {
      chapters: [
        {
          title: '第一章',
          summary: '叙述李华的反应。',
          content: '李华靠在窗边沉默不语，侦探注意到他的指尖在发抖。',
        },
      ],
      motivePatchCandidates: [
        {
          suspect: '李华',
          keyword: '遗产',
          chapterIndex: 0,
          suggestedSentence: '一提到遗产分配，李华的语调立刻紧绷。',
          status: 'pending',
        } satisfies MotivePatchCandidate,
      ],
    };

    const result = stageTesting.applyMotiveCandidatesToDraftForTest(draft);
    const candidate = result.draft.motivePatchCandidates?.[0];
    expect(candidate?.status).toBe('applied');
    expect(result.draft.chapters[0].content).toContain('一提到遗产分配');
    expect(result.notes[0]).toMatch(/对齐相关段落/);
  });

  test('applyMotiveCandidatesToDraft falls back to intro when no cue found', () => {
    const draft: DetectiveStoryDraft = {
      chapters: [
        {
          title: '序章',
          summary: '',
          content: '侦探抵达案发现场，暂未找到明确动机线索。',
        },
      ],
      motivePatchCandidates: [
        {
          suspect: '赵四',
          keyword: '债务',
          chapterIndex: 0,
          suggestedSentence: '一提到债务，赵四连忙岔开话题，眼神明显慌张。',
          status: 'pending',
        } satisfies MotivePatchCandidate,
      ],
    };

    const result = stageTesting.applyMotiveCandidatesToDraftForTest(draft);
    const candidate = result.draft.motivePatchCandidates?.[0];
    expect(candidate?.status).toBe('applied');
    expect(result.draft.chapters[0].content.startsWith('一提到债务')).toBe(true);
    expect(result.notes[0]).not.toMatch(/对齐相关段落/);
  });
});
