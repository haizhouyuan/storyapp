import { connectToDatabase } from '../src/config/database';
import { initializeDatabase } from '../src/config/initializeDatabase';
import { createDetectiveWorkflow, getWorkflowById } from '../src/services/detectiveWorkflowService';

async function run(): Promise<void> {
  const topic = process.argv.slice(2).join(' ') || '雾岚古堡的第八声';
  console.log('🚀 开始执行侦探故事工作流，主题：', topic);

  await connectToDatabase();
  await initializeDatabase();

  const workflow = await createDetectiveWorkflow({ topic });
  console.log('✅ 工作流执行完成，结果：');
  console.log(JSON.stringify(workflow, null, 2));

  if (workflow._id) {
    const latest = await getWorkflowById(workflow._id);
    console.log('\n📦 数据库查询结果：');
    console.log(JSON.stringify(latest, null, 2));
  }

  process.exit(0);
}

run().catch((error) => {
  console.error('❌ 执行失败：', error);
  process.exit(1);
});
