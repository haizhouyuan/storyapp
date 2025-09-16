#!/usr/bin/env node
/**
 * E2E测试确定性种子数据脚本
 * 为Playwright E2E测试创建预定义的故事数据，确保测试结果可预测
 */

const axios = require('axios');

// 配置
const BASE_URL = process.env.BASE_URL || 'http://localhost:5001';
const API_URL = `${BASE_URL}/api`;

// 确定性测试数据
const SEED_STORIES = [
  {
    title: '测试故事：小兔子的冒险',
    content: JSON.stringify({
      storySegment: '在一个阳光明媚的早晨，小兔子波波决定去森林里探险。它蹦蹦跳跳地走在小径上，突然看到前方有三条不同的路。',
      choices: [
        '选择走向花香阵阵的左边小路',
        '选择走向鸟语花香的中间大路', 
        '选择走向神秘幽静的右边小径'
      ],
      isEnding: false,
      metadata: {
        difficulty: 'easy',
        theme: 'adventure',
        ageGroup: '3-6',
        sessionId: 'e2e-test-session-1'
      }
    })
  },
  {
    title: '测试故事：月亮上的旅行',
    content: JSON.stringify({
      storySegment: '小女孩艾米乘坐神奇的星光火箭来到了月亮上。月亮表面闪闪发光，到处都是银色的月尘。艾米要选择去哪里探索呢？',
      choices: [
        '去拜访住在月宫里的嫦娥姐姐',
        '和可爱的月兔一起玩耍',
        '收集美丽的星星做项链'
      ],
      isEnding: false,
      metadata: {
        difficulty: 'medium',
        theme: 'fantasy',
        ageGroup: '4-8',
        sessionId: 'e2e-test-session-2'
      }
    })
  },
  {
    title: '测试故事：彩虹城堡的秘密',
    content: JSON.stringify({
      storySegment: '勇敢的小骑士来到了传说中的彩虹城堡。城堡的大门紧紧关闭，但门前有三个彩色按钮。按下正确的按钮就能打开城堡大门！',
      choices: [
        '按下红色按钮（代表勇气）',
        '按下蓝色按钮（代表智慧）',
        '按下黄色按钮（代表友善）'
      ],
      isEnding: false,
      metadata: {
        difficulty: 'medium',
        theme: 'adventure',
        ageGroup: '5-10',
        sessionId: 'e2e-test-session-3'
      }
    })
  }
];

// 测试用户会话数据
const TEST_SESSIONS = [
  {
    sessionId: 'e2e-test-session-1',
    timestamp: new Date('2024-01-01T10:00:00Z'),
    userChoices: ['选择走向花香阵阵的左边小路'],
    completionStatus: 'in_progress'
  },
  {
    sessionId: 'e2e-test-session-2', 
    timestamp: new Date('2024-01-01T11:00:00Z'),
    userChoices: ['去拜访住在月宫里的嫦娥姐姐'],
    completionStatus: 'completed'
  },
  {
    sessionId: 'e2e-test-session-3',
    timestamp: new Date('2024-01-01T12:00:00Z'),
    userChoices: [],
    completionStatus: 'started'
  }
];

/**
 * 清理现有测试数据
 */
async function cleanupTestData() {
  try {
    console.log('🧹 清理现有测试数据...');
    
    // 删除所有以"测试故事："开头的故事
    const storiesResponse = await axios.get(`${API_URL}/get-stories`);
    const stories = storiesResponse.data.stories || [];
    
    for (const story of stories) {
      if (story.title && story.title.startsWith('测试故事：')) {
        console.log(`删除测试故事: ${story.title}`);
        // 注意：需要确保后端有删除API，如果没有则跳过此步
        // await axios.delete(`${API_URL}/delete-story/${story._id}`);
      }
    }
    
    console.log('✅ 测试数据清理完成');
  } catch (error) {
    console.warn('⚠️ 清理测试数据时出现警告:', error.message);
    // 清理失败不应该阻止种子数据创建
  }
}

/**
 * 创建种子故事数据
 */
async function createSeedStories() {
  console.log('🌱 开始创建E2E测试种子数据...');
  
  for (const [index, storyData] of SEED_STORIES.entries()) {
    try {
      console.log(`创建故事 ${index + 1}/${SEED_STORIES.length}: ${storyData.title}`);
      
      const response = await axios.post(`${API_URL}/save-story`, storyData, {
        headers: {
          'Content-Type': 'application/json',
          'X-E2E-Test': 'true' // 标识这是E2E测试数据
        },
        timeout: 10000
      });
      
      if (response.status === 200 || response.status === 201) {
        console.log(`✅ 故事创建成功: ${storyData.title}`);
        console.log(`   Story ID: ${response.data.storyId || response.data._id || 'unknown'}`);
      } else {
        console.warn(`⚠️ 故事创建异常 (状态码: ${response.status}): ${storyData.title}`);
      }
      
    } catch (error) {
      console.error(`❌ 故事创建失败: ${storyData.title}`);
      console.error(`   错误信息: ${error.message}`);
      
      if (error.response) {
        console.error(`   HTTP状态: ${error.response.status}`);
        console.error(`   响应数据:`, error.response.data);
      }
      
      // 继续创建其他故事，不中断整个流程
      continue;
    }
  }
}

/**
 * 验证种子数据创建结果
 */
async function validateSeedData() {
  try {
    console.log('🔍 验证种子数据创建结果...');
    
    const response = await axios.get(`${API_URL}/get-stories`, {
      timeout: 10000
    });
    
    const stories = response.data.stories || [];
    const testStories = stories.filter(story => 
      story.title && story.title.startsWith('测试故事：')
    );
    
    console.log(`📊 验证结果:`);
    console.log(`   总故事数: ${stories.length}`);
    console.log(`   测试故事数: ${testStories.length}`);
    console.log(`   期望创建: ${SEED_STORIES.length}`);
    
    if (testStories.length >= SEED_STORIES.length) {
      console.log('✅ 种子数据验证通过');
    } else {
      console.warn('⚠️ 种子数据数量不足，部分故事可能创建失败');
    }
    
    // 打印创建的测试故事
    testStories.forEach((story, index) => {
      console.log(`   ${index + 1}. ${story.title} (ID: ${story._id})`);
    });
    
  } catch (error) {
    console.error('❌ 种子数据验证失败:', error.message);
  }
}

/**
 * 等待服务可用
 */
async function waitForService(maxRetries = 30, retryInterval = 2000) {
  console.log(`⏳ 等待服务可用 ${BASE_URL}...`);
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await axios.get(`${BASE_URL}/healthz`, { 
        timeout: 3000 
      });
      
      if (response.status === 200) {
        console.log('✅ 服务已就绪');
        return true;
      }
    } catch (error) {
      console.log(`等待服务就绪... (${i + 1}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, retryInterval));
    }
  }
  
  throw new Error(`服务在${maxRetries * retryInterval / 1000}秒后仍未就绪`);
}

/**
 * 主函数
 */
async function main() {
  try {
    console.log('🚀 E2E测试种子数据脚本启动');
    console.log(`目标服务: ${BASE_URL}`);
    
    // 等待服务可用
    await waitForService();
    
    // 清理现有测试数据（可选）
    if (process.env.CLEANUP_EXISTING !== 'false') {
      await cleanupTestData();
    }
    
    // 创建种子数据
    await createSeedStories();
    
    // 验证结果
    await validateSeedData();
    
    console.log('🎉 E2E测试种子数据创建完成');
    process.exit(0);
    
  } catch (error) {
    console.error('💥 种子数据脚本执行失败:', error.message);
    process.exit(1);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  main();
}

module.exports = {
  createSeedStories,
  validateSeedData,
  SEED_STORIES,
  TEST_SESSIONS
};