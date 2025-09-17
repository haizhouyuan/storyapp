#!/usr/bin/env node

/**
 * CI环境测试种子数据生成脚本
 * 用于在E2E测试前创建必要的测试数据
 */

const axios = require('axios');

const config = {
  apiUrl: process.env.BASE_URL || 'http://localhost:5001',
  timeout: 10000,
  retries: 3
};

const testStories = [
  {
    title: '测试故事：小兔子的冒险',
    content: JSON.stringify({
      storySegment: '这是一个测试故事片段，用于E2E测试。小兔子在神奇的森林里开始了它的冒险之旅。',
      choices: ['进入神秘洞穴', '爬上大橡树', '跟随蝴蝶'],
      isEnding: false
    })
  },
  {
    title: '测试故事：彩虹城堡',
    content: JSON.stringify({
      storySegment: '在遥远的天边，有一座美丽的彩虹城堡。这里住着善良的彩虹公主。',
      choices: ['敲响城堡大门', '在花园里休息', '寻找彩虹桥'],
      isEnding: false
    })
  }
];

async function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function createStoryWithRetry(story, retries = config.retries) {
  for (let i = 0; i < retries; i++) {
    try {
      console.log(`正在创建测试故事: ${story.title} (尝试 ${i + 1}/${retries})`);
      
      const response = await axios.post(
        `${config.apiUrl}/api/save-story`, 
        story,
        {
          timeout: config.timeout,
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );
      
      console.log(`✅ 成功创建故事: ${story.title}`, response.data);
      return response.data;
      
    } catch (error) {
      console.warn(`❌ 创建故事失败 (尝试 ${i + 1}/${retries}):`, error.message);
      
      if (i === retries - 1) {
        throw error;
      }
      
      // 指数退避重试
      await wait(Math.pow(2, i) * 1000);
    }
  }
}

async function healthCheck() {
  try {
    console.log('🔍 检查API健康状态...');
    const response = await axios.get(`${config.apiUrl}/api/health`, {
      timeout: 5000
    });
    
    if (response.status === 200 && response.data.status === 'healthy') {
      console.log('✅ API健康检查通过');
      return true;
    }
    
    throw new Error(`API健康检查失败: ${JSON.stringify(response.data)}`);
  } catch (error) {
    console.error('❌ API健康检查失败:', error.message);
    return false;
  }
}

async function seedTestData() {
  console.log('🌱 开始创建CI测试种子数据...');
  console.log(`目标API: ${config.apiUrl}`);
  
  // 首先进行健康检查
  const isHealthy = await healthCheck();
  if (!isHealthy) {
    console.error('❌ API不健康，无法创建种子数据');
    process.exit(1);
  }
  
  let successCount = 0;
  let failCount = 0;
  
  for (const story of testStories) {
    try {
      await createStoryWithRetry(story);
      successCount++;
    } catch (error) {
      console.error(`❌ 最终创建失败: ${story.title}`, error.message);
      failCount++;
    }
  }
  
  console.log(`\n📊 种子数据创建完成:`);
  console.log(`  ✅ 成功: ${successCount}`);
  console.log(`  ❌ 失败: ${failCount}`);
  console.log(`  📈 成功率: ${((successCount / testStories.length) * 100).toFixed(1)}%`);
  
  if (failCount > 0) {
    console.warn('⚠️  存在失败的种子数据创建，但不影响测试进行');
  }
  
  console.log('🎉 种子数据脚本执行完成');
}

// 错误处理
process.on('unhandledRejection', (error) => {
  console.error('❌ 未处理的Promise拒绝:', error);
  process.exit(1);
});

process.on('SIGINT', () => {
  console.log('\n⚡ 收到中断信号，正在退出...');
  process.exit(0);
});

// 执行主函数
if (require.main === module) {
  seedTestData().catch((error) => {
    console.error('❌ 种子数据脚本执行失败:', error);
    process.exit(1);
  });
}

module.exports = { seedTestData, healthCheck };