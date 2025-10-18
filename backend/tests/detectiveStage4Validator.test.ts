import { runStage4Validation } from '../src/agents/detective/validators/stage4Validator';
import type {
  DetectiveOutline,
  DetectiveStoryDraft,
  DetectiveChapter,
  ValidationRuleResult,
} from '@storyapp/shared';

describe('stage4Validator', () => {
  const baseOutline: DetectiveOutline = {
    clueMatrix: [
      {
        clue: '大钟显示时间',
        mustForeshadow: true,
        explicitForeshadowChapters: ['Chapter 1', 'Chapter 2'],
      },
      {
        clue: '管家有复制钥匙',
        mustForeshadow: true,
        explicitForeshadowChapters: ['Chapter 1', 'Chapter 2'],
      },
      {
        clue: '第八声钟响',
        mustForeshadow: true,
        explicitForeshadowChapters: ['Chapter 2'],
      },
    ],
    timeline: [
      { time: 'Day1 18:30', event: '凶手预调大钟', participants: ['老陈'] },
      { time: 'Day1 19:40', event: '谋杀发生', participants: ['老陈', '张老爷'] },
      { time: 'Day1 19:50', event: '大钟敲第八声', participants: [] },
    ],
  };

  const baseDraft: DetectiveStoryDraft = {
    chapters: [
      {
        title: 'Chapter 1',
        summary: '引入案发',
        content: '...“我明明看见大钟显示时间不对！”侦探低声说。管家回应：“主人的确交给我复制钥匙。”侦探补充：“那把钥匙你还留着吗？”管家摇头：“我已经交回去了。”随后两人又确认了潮汐安排...',
        cluesEmbedded: ['大钟显示时间', '管家有复制钥匙'],
        redHerringsEmbedded: ['王医生紧张神态'],
      },
      {
        title: 'Chapter 2',
        summary: '调查线索',
        content: '...“你听到第八声钟响了吗？”侦探追问。助手回答：“我在走廊亲耳听见。”侦探继续：“当时还有谁在场？”助手答：“只有张先生。”两人复盘现场布局...',
        cluesEmbedded: ['第八声钟响'],
        redHerringsEmbedded: [],
      },
      {
        title: 'Chapter 3',
        summary: '揭示真相',
        content: '侦探复盘：“第八声钟响只是障眼法。”凶手慌张道：“我……我只是想拖延时间。”侦探追问：“你何时换掉了钟芯？”凶手垂头：“就在晚饭前。”案情最终水落石出。',
        cluesEmbedded: ['大钟显示时间', '管家有复制钥匙', '第八声钟响'],
        redHerringsEmbedded: [],
      },
    ],
    overallWordCount: 4200,
  };

  it('should produce pass summary when outline and story align', () => {
    const report = runStage4Validation(baseOutline, baseDraft);
    const clueRule = report.results.find(
      (rule: ValidationRuleResult) => rule.ruleId === 'clue-foreshadowing',
    );
    const timelineRule = report.results.find(
      (rule: ValidationRuleResult) => rule.ruleId === 'timeline-consistency',
    );

    // M3 扩展校验后，规则数增加；此处只断言总体无 fail，且通过数不少于基础规则数量
    expect(report.summary?.fail ?? 0).toBe(0);
    expect(report.summary?.pass ?? 0).toBeGreaterThanOrEqual(4);
    expect(clueRule?.status).toBe('pass');
    expect(timelineRule?.status).toBe('pass');
  });

  it('should flag missing clue appearances as failure', () => {
    const emptyDraft: DetectiveStoryDraft = {
      chapters: baseDraft.chapters.map((chapter: DetectiveChapter) => ({
        ...chapter,
        cluesEmbedded: [],
        content: '无关内容',
      })),
    };

    const report = runStage4Validation(baseOutline, emptyDraft);

    const clueRule = report.results.find(
      (rule: ValidationRuleResult) => rule.ruleId === 'clue-foreshadowing',
    );
    expect(clueRule?.status).toBe('fail');
    expect(clueRule?.details?.[0].message).toContain('未在正文中出现');
  });

  it('should warn when timeline is not strictly ascending', () => {
    const outline: DetectiveOutline = {
      ...baseOutline,
      timeline: [
        { time: 'Day1 19:50', event: '后时间', participants: [] },
        { time: 'Day1 18:30', event: '前时间', participants: [] },
      ],
    };

    const report = runStage4Validation(outline, baseDraft);
    const timelineRule = report.results.find(
      (rule: ValidationRuleResult) => rule.ruleId === 'timeline-consistency',
    );

    expect(timelineRule?.status).toBe('fail');
    expect(timelineRule?.details?.[0].message).toContain('顺序异常');
  });

  it('should warn when clue declares invalid chapters', () => {
    const outline: DetectiveOutline = {
      ...baseOutline,
      clueMatrix: [
        {
          clue: '未知线索',
          mustForeshadow: true,
          explicitForeshadowChapters: ['Chapter 4'],
        },
      ],
    };

    const draft: DetectiveStoryDraft = {
      ...baseDraft,
      chapters: baseDraft.chapters.map((chapter: DetectiveChapter, index: number) =>
        index === 0
          ? {
              ...chapter,
              content: `${chapter.content} [CLUE: 未知线索]`,
              cluesEmbedded: [...(chapter.cluesEmbedded ?? []), '未知线索'],
            }
          : chapter,
      ),
    };

    const report = runStage4Validation(outline, draft);
    const clueRule = report.results.find(
      (rule: ValidationRuleResult) => rule.ruleId === 'clue-foreshadowing',
    );

    expect(clueRule?.status).toBe('warn');
    expect(clueRule?.details?.[0].message).toContain('无效章节');
  });

  it('should warn when chekhov recovery is missing in final chapter', () => {
    const outline: DetectiveOutline = {
      ...baseOutline,
      clueMatrix: [
        {
          clue: '关键线索',
          mustForeshadow: true,
          explicitForeshadowChapters: ['Chapter 1', 'Chapter 3'],
        },
      ],
    };

    const draft: DetectiveStoryDraft = {
      chapters: [
        {
          title: 'Chapter 1',
          summary: '开端',
          content: '介绍关键线索',
          cluesEmbedded: ['关键线索'],
          redHerringsEmbedded: [],
        },
        {
          title: 'Chapter 2',
          summary: '发展',
          content: '发展剧情',
          cluesEmbedded: [],
          redHerringsEmbedded: [],
        },
        {
          title: 'Chapter 3',
          summary: '结局',
          content: '结局未提及关键证据',
          cluesEmbedded: [],
          redHerringsEmbedded: [],
        },
      ],
    };

    const report = runStage4Validation(outline, draft);
    const chekhovRule = report.results.find(
      (rule: ValidationRuleResult) => rule.ruleId === 'chekhov-recovery',
    );

    expect(chekhovRule?.status).toBe('warn');
    expect(chekhovRule?.details?.[0].message).toContain('未在结局章节中显式回收');
  });

  it('should fail when red herring ratio is too high', () => {
    const draft: DetectiveStoryDraft = {
      chapters: [
        {
          title: 'Chapter 1',
          summary: '线索',
          content: '线索篇',
          cluesEmbedded: ['线索1'],
          redHerringsEmbedded: ['误导1', '误导2'],
        },
        {
          title: 'Chapter 2',
          summary: '误导',
          content: '大量误导',
          cluesEmbedded: [],
          redHerringsEmbedded: ['误导3'],
        },
      ],
    };

    const report = runStage4Validation(baseOutline, draft);
    const ratioRule = report.results.find(
      (rule: ValidationRuleResult) => rule.ruleId === 'red-herring-ratio',
    );

    expect(ratioRule?.status).toBe('fail');
    expect(ratioRule?.details?.[0].message).toContain('红鲱鱼占比过高');
  });
});
