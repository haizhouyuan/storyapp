import { buildPlannerPrompt, buildWriterPrompt } from '../src/agents/detective/promptBuilder';

describe('promptBuilder', () => {
  it('injects custom mechanism keywords into planner prompt', () => {
    const { user } = buildPlannerPrompt('机械幻影', {
      vars: { deviceKeywords: ['齿轮', '发条', '暗门'] },
    });
    expect(user).toContain('中心奇迹请围绕以下关键词设计变体');
    expect(user).toContain('齿轮、发条、暗门');
    expect(user).toContain('StoryBlueprint');
    expect(user).not.toContain('风道');
    expect(user).toContain('centralTrick.summary 与 centralTrick.mechanism 必须写成完整句子');
  });

  it('guides writer to output chapters array without CLUE markers', () => {
    const dummyOutline = {
      centralTrick: { summary: '示例', mechanism: '示例机制', fairnessNotes: ['示例线索'] },
      acts: [],
      clueMatrix: [],
      timeline: [],
    };
    const { user } = buildWriterPrompt(dummyOutline, { vars: { targets: { wordsPerScene: 1000 } } });
    expect(user).toContain('"chapters": [ { "title"');
    expect(user).toContain('禁止使用 [CLUE]');
    expect(user).toContain('第三章需包含对峙与复盘');
  });
});
