import { runStage1Planning, runStage2Writing, runStage3Review } from '../src/agents/detective/stageRunner';
import { runStage4Validation } from '../src/agents/detective/validators';

async function run(): Promise<void> {
  const topic = process.argv.slice(2).join(' ') || '雾岚古堡的第八声';
  console.log('🕵️ 主题：', topic);

  const outline = await runStage1Planning(topic);
  console.log('\n📋 Stage1 Outline:');
  console.log(JSON.stringify(outline, null, 2));

  const draft = await runStage2Writing(outline);
  console.log('\n📚 Stage2 Story Draft:');
  console.log(JSON.stringify(draft, null, 2));

  const review = await runStage3Review(outline, draft);
  console.log('\n🔍 Stage3 Review:');
  console.log(JSON.stringify(review, null, 2));

  const validation = runStage4Validation(outline, draft);
  console.log('\n✅ Stage4 Validation:');
  console.log(JSON.stringify(validation, null, 2));
}

run().catch((error) => {
  console.error('❌ 执行失败:', error);
  process.exit(1);
});
