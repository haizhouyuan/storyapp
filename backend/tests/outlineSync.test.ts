import type { DetectiveOutline, DetectiveStoryDraft } from '@storyapp/shared';
import { harmonizeOutlineWithDraft } from '../src/agents/detective/outlineSync';

describe('harmonizeOutlineWithDraft', () => {
  const outline: DetectiveOutline = {
    centralTrick: {
      summary: '远程机关触发钟锤',
      mechanism: '机关依赖密室结构',
    },
    clueMatrix: [
      { clue: '风道铁锈', mustForeshadow: true, explicitForeshadowChapters: ['Chapter 1'] },
      { clue: '潮汐表', mustForeshadow: true },
      { clue: '共振簧片', mustForeshadow: true, explicitForeshadowChapters: ['Chapter 2'] },
    ],
    timeline: [
      { time: '19:30', event: '宾客抵达' },
    ],
  };

  const draft: DetectiveStoryDraft = {
    chapters: [
      {
        title: 'Chapter 1',
        summary: '',
        content: '风道铁锈 粘在墙上，时间 19:30。',
        cluesEmbedded: ['风道铁锈'],
        redHerringsEmbedded: [],
      },
      {
        title: 'Chapter 2',
        summary: '',
        content: '蛋蛋翻出潮汐表，记录 20:45。',
        cluesEmbedded: [],
        redHerringsEmbedded: [],
      },
      {
        title: 'Chapter 3',
        summary: '',
        content: '共振簧片再度出现，解释 22:10 的怪声。',
        cluesEmbedded: ['共振簧片'],
        redHerringsEmbedded: [],
      },
    ],
  };

  it('maps clue exposures back to outline', () => {
    const { outline: result, meta } = harmonizeOutlineWithDraft(outline, draft);
    const foreshadow = result.clueMatrix?.find((item) => item.clue === '潮汐表');
    expect(foreshadow?.explicitForeshadowChapters).toEqual(['Chapter 2']);
    expect(meta.clueMappings).toEqual([
      { clue: '风道铁锈', chapters: ['Chapter 1'] },
      { clue: '潮汐表', chapters: ['Chapter 2'] },
      { clue: '共振簧片', chapters: ['Chapter 3'] },
    ]);
  });

  it('normalizes timeline with textual times and fills DayX format', () => {
    const { outline: result, meta } = harmonizeOutlineWithDraft(outline, draft);
    const times = (result.timeline || []).map((e) => e.time);
    expect(times.every((time) => /^Day\d+\s+\d{2}:\d{2}$/.test(time))).toBe(true);
    expect(times).toContain('Day1 20:45');
    expect(times).toContain('Day1 22:10');
    expect(meta.timelineAdded).toBeGreaterThanOrEqual(2);
  });

  it('appends missing mechanism keywords', () => {
    const { outline: result, meta } = harmonizeOutlineWithDraft(outline, draft);
    const mechanism = result.centralTrick?.mechanism || '';
    expect(mechanism).toContain('杠杆');
    expect(mechanism).toContain('配重');
    expect(mechanism).toContain('滑轮');
    expect(meta.mechanismKeywordsAppended).toEqual(expect.arrayContaining(['杠杆', '配重', '滑轮', '绳索']));
  });

  it('generates clueMatrix when outline lacks clues', () => {
    const draftOnly: DetectiveStoryDraft = {
      chapters: [
        { title: 'Chapter 1', summary: '', content: '描写银杏叶纹理', cluesEmbedded: ['银杏叶纹理'], redHerringsEmbedded: [] },
        { title: 'Chapter 2', summary: '', content: '记录齿轮错位', cluesEmbedded: ['齿轮错位'], redHerringsEmbedded: [] },
      ],
    };
    const { outline: result, meta } = harmonizeOutlineWithDraft({}, draftOnly);
    expect(result.clueMatrix?.length).toBe(2);
    const clueNames = result.clueMatrix?.map((item) => item.clue) ?? [];
    expect(clueNames).toEqual(expect.arrayContaining(['银杏叶纹理', '齿轮错位']));
    expect(meta.generatedClues.sort()).toEqual(['银杏叶纹理', '齿轮错位'].sort());
  });
});
