import { __testing as stageTesting } from '../src/agents/detective/stageRunner';
import type { DetectiveOutline, DetectiveStoryDraft } from '@storyapp/shared';

describe('ensureEndingResolution', () => {
  const outline: DetectiveOutline = {
    characters: [
      { name: '林探长', role: 'detective' },
      { name: '周小雨', role: 'witness' },
    ],
    caseSetup: {
      victim: '陈阿姨',
    },
    centralTrick: {
      mechanism: '蒸汽管道暗门',
    },
    themes: ['信任'],
  };
  (outline as any).locations = [{ name: '云杉庄园' }];
  (outline as any).solution = {
    culprit: '李森',
    motiveCore: '为了继承家族的旧工厂',
    keyReveals: [],
    fairnessChecklist: [],
  };

  it('appends a closure paragraph when ending-resolution requirements are unmet', () => {
    const draft: DetectiveStoryDraft = {
      chapters: [
        {
          title: '尾声',
          summary: '',
          content: '尘埃落定，众人沉默地看向侦探。',
        },
      ],
      continuityNotes: [],
    };

    const result = stageTesting.ensureEndingResolutionForTest(outline, draft);

    expect(result.appended).toBe(true);
    const finalChapter = result.draft.chapters[result.draft.chapters.length - 1];
    expect(finalChapter.content).toMatch(/后来/);
    expect(finalChapter.content).toMatch(/最终/);
    expect(finalChapter.content).toMatch(/孩子们/);
    const length = finalChapter.content.replace(/\s+/g, '').length;
    expect(length).toBeGreaterThanOrEqual(120);
    expect(result.draft.continuityNotes?.some((note) => note.includes('结尾善后段'))).toBe(true);
  });

  it('keeps the draft unchanged when a valid closure already exists', () => {
    const draft: DetectiveStoryDraft = {
      chapters: [
        {
          title: '尾声',
          summary: '',
          content:
            '后来，云杉庄园恢复了热闹，孩子们重新在庭院玩耍，邻里之间又开始分享自制点心。最终，林探长公布真相，陈阿姨的家人逐渐释怀，还邀请周小雨记录下案件的警示。几天后，大家携手修复旧工厂，让回忆平复下来，并计划建立社区巡逻队，确保不再发生类似事件。又过了一个月，社区创立以“信任”为主题的故事夜，孩子们围坐在灯火下听林探长讲述这次经历，从惊惧中重新学会勇敢。',
        },
      ],
    };

    const result = stageTesting.ensureEndingResolutionForTest(outline, draft);

    expect(result.appended).toBe(false);
    expect(result.draft.chapters[0].content).toBe(draft.chapters[0].content);
  });
});
