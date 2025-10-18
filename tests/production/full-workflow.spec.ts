import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const OUTPUT_DIR = path.resolve('testrun');
const TOPICS = [
  { title: '月球基地的失踪事件', slug: 'space-station-mystery' },
  { title: '深海遗迹的回声秘密', slug: 'underwater-ruins-echo' },
  { title: '魔法森林的诅咒真相', slug: 'enchanted-forest-curse' },
];

async function waitForWorkflow(request: any, workflowId: string, timeoutMs = 15 * 60 * 1000, pollIntervalMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await request.get(`/api/story-workflows/${workflowId}`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    const workflow = body?.data;
    if (!workflow) throw new Error('workflow payload missing');
    if (workflow.status === 'completed') {
      return workflow;
    }
    if (workflow.status === 'failed' || workflow.status === 'terminated') {
      throw new Error(`workflow ended with status=${workflow.status}`);
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
  throw new Error('workflow polling timed out');
}

function formatStoryDocument(workflow: any) {
  const parts: string[] = [];
  const outline = workflow.history?.at(-1)?.outline ?? workflow.outline;
  if (outline) {
    parts.push('# 蓝图概览');
    parts.push('```json');
    parts.push(JSON.stringify(outline, null, 2));
    parts.push('```');
  }

  const storyDraft = workflow.history?.at(-1)?.storyDraft ?? workflow.storyDraft;
  if (storyDraft?.chapters?.length) {
    parts.push('\n# 故事正文');
    storyDraft.chapters.forEach((chapter: any, idx: number) => {
      const title = chapter.title || `章节 ${idx + 1}`;
      parts.push(`\n## ${title}`);
      if (chapter.summary) {
        parts.push(`> 摘要：${chapter.summary}`);
      }
      parts.push((chapter.content || '').trim());
    });
  }

  const validation = workflow.history?.at(-1)?.validation ?? workflow.validation;
  if (validation) {
    parts.push('\n# Stage4 校验');
    parts.push('```json');
    parts.push(JSON.stringify(validation, null, 2));
    parts.push('```');
  }

  const review = workflow.history?.at(-1)?.review ?? workflow.review;
  if (review) {
    parts.push('\n# Stage3 审核');
    parts.push('```json');
    parts.push(JSON.stringify(review, null, 2));
    parts.push('```');
  }

  return parts.join('\n');
}

test.describe('Detective workflow end-to-end', () => {
  test.beforeAll(() => {
    if (!fs.existsSync(OUTPUT_DIR)) {
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }
  });

  for (const topic of TOPICS) {
    test(`生成完整故事 - ${topic.title}`, async ({ request }) => {
      const createRes = await request.post('/api/story-workflows', {
        data: { topic: topic.title, locale: 'zh-CN' },
      });
      expect(createRes.ok()).toBeTruthy();
      const createBody = await createRes.json();
      const workflowId = createBody?.data?._id;
      expect(workflowId).toBeTruthy();

      const workflow = await waitForWorkflow(request, workflowId);

      const storyDoc = formatStoryDocument(workflow);
      const summary = workflow.history?.at(-1)?.validation?.summary ?? workflow.validation?.summary;
      if (summary) {
        console.log(`Validation summary for ${topic.title}:`, summary);
      }

      const filePath = path.join(OUTPUT_DIR, `${topic.slug}.md`);
      fs.writeFileSync(filePath, storyDoc, 'utf-8');
      test.info().attach(`${topic.slug}.md`, { body: storyDoc, contentType: 'text/markdown' });
    });
  }
});
