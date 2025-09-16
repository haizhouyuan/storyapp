/**
 * 故事生成日志记录系统测试脚本
 * 这个脚本会测试新的日志记录功能是否正常工作
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:5001';

// 颜色输出函数
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

const log = (color, message) => {
  console.log(`${colors[color]}${message}${colors.reset}`);
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function testHealthCheck() {
  log('blue', '\n🔍 测试1: 健康检查');
  try {
    const response = await axios.get(`${BASE_URL}/api/health`);
    log('green', '✅ 健康检查通过');
    console.log('响应:', response.data);
  } catch (error) {
    log('red', '❌ 健康检查失败');
    console.error('错误:', error.message);
    throw error;
  }
}

async function testStoryGeneration() {
  log('blue', '\n🔍 测试2: 故事生成（会创建详细日志）');
  try {
    const response = await axios.post(`${BASE_URL}/api/generate-story`, {
      topic: '测试用的小兔子冒险故事',
      maxChoices: 3
    });
    
    log('green', '✅ 故事生成成功');
    console.log('故事长度:', response.data.storySegment.length);
    console.log('选择数量:', response.data.choices.length);
    console.log('是否结尾:', response.data.isEnding);
    
    return response.data;
  } catch (error) {
    log('red', '❌ 故事生成失败');
    console.error('错误:', error.response ? error.response.data : error.message);
    throw error;
  }
}

async function testAdminStats() {
  log('blue', '\n🔍 测试3: 管理员统计API');
  try {
    const response = await axios.get(`${BASE_URL}/api/admin/stats`);
    log('green', '✅ 统计数据获取成功');
    
    const stats = response.data.data;
    console.log('总会话数:', stats.overview.totalSessions);
    console.log('24小时会话数:', stats.overview.sessionsLast24h);
    console.log('成功率:', Math.round(stats.overview.successRate) + '%');
    console.log('错误总数:', stats.overview.totalErrors);
    
    return stats;
  } catch (error) {
    log('red', '❌ 统计数据获取失败');
    console.error('错误:', error.response ? error.response.data : error.message);
    throw error;
  }
}

async function testAdminLogs() {
  log('blue', '\n🔍 测试4: 管理员日志API');
  try {
    const response = await axios.get(`${BASE_URL}/api/admin/logs?limit=5`);
    log('green', '✅ 日志数据获取成功');
    
    const logs = response.data.data.logs;
    console.log('获取日志数量:', logs.length);
    
    if (logs.length > 0) {
      const latestLog = logs[0];
      console.log('最新日志:');
      console.log('  - 时间:', latestLog.timestamp);
      console.log('  - 级别:', latestLog.logLevel);
      console.log('  - 事件:', latestLog.eventType);
      console.log('  - 消息:', latestLog.message);
      console.log('  - 会话ID:', latestLog.sessionId);
    }
    
    return logs;
  } catch (error) {
    log('red', '❌ 日志数据获取失败');
    console.error('错误:', error.response ? error.response.data : error.message);
    throw error;
  }
}

async function testPerformanceMetrics() {
  log('blue', '\n🔍 测试5: 性能指标API');
  try {
    const response = await axios.get(`${BASE_URL}/api/admin/performance?days=1`);
    log('green', '✅ 性能数据获取成功');
    
    const performance = response.data.data;
    console.log('时间线数据点数量:', performance.timeline.length);
    console.log('模型性能数据数量:', performance.byModel.length);
    
    if (performance.byModel.length > 0) {
      const firstModel = performance.byModel[0];
      console.log('模型:', firstModel._id);
      console.log('平均耗时:', Math.round(firstModel.avgDuration) + 'ms');
      console.log('调用次数:', firstModel.calls);
    }
    
    return performance;
  } catch (error) {
    log('red', '❌ 性能数据获取失败');
    console.error('错误:', error.response ? error.response.data : error.message);
    throw error;
  }
}

async function testActiveSessions() {
  log('blue', '\n🔍 测试6: 活跃会话API');
  try {
    const response = await axios.get(`${BASE_URL}/api/admin/sessions/active`);
    log('green', '✅ 活跃会话数据获取成功');
    
    const sessions = response.data.data;
    console.log('活跃会话数量:', sessions.count);
    console.log('会话列表长度:', sessions.activeSessions.length);
    
    return sessions;
  } catch (error) {
    log('red', '❌ 活跃会话数据获取失败');
    console.error('错误:', error.response ? error.response.data : error.message);
    throw error;
  }
}

async function testStoryStorage() {
  log('blue', '\n🔍 测试7: 故事保存（会创建保存日志）');
  try {
    const storyContent = JSON.stringify({
      storySegment: '这是一个测试故事片段，用于验证日志记录系统是否正常工作。',
      choices: ['选择1', '选择2', '选择3'],
      isEnding: false
    });
    
    const response = await axios.post(`${BASE_URL}/api/save-story`, {
      title: '测试故事 - ' + new Date().toLocaleString(),
      content: storyContent
    });
    
    log('green', '✅ 故事保存成功');
    console.log('故事ID:', response.data.storyId);
    console.log('消息:', response.data.message);
    
    return response.data;
  } catch (error) {
    log('red', '❌ 故事保存失败');
    console.error('错误:', error.response ? error.response.data : error.message);
    throw error;
  }
}

async function main() {
  log('cyan', '🚀 开始测试故事生成日志记录系统...\n');
  
  let passedTests = 0;
  const totalTests = 7;
  
  const tests = [
    testHealthCheck,
    testStoryGeneration,
    testAdminStats,
    testAdminLogs,
    testPerformanceMetrics,
    testActiveSessions,
    testStoryStorage
  ];
  
  for (let i = 0; i < tests.length; i++) {
    try {
      await tests[i]();
      passedTests++;
      log('green', `✅ 测试 ${i + 1} 通过`);
    } catch (error) {
      log('red', `❌ 测试 ${i + 1} 失败`);
    }
    
    // 在测试之间稍作等待
    if (i < tests.length - 1) {
      await sleep(1000);
    }
  }
  
  log('cyan', `\n📊 测试结果: ${passedTests}/${totalTests} 通过`);
  
  if (passedTests === totalTests) {
    log('green', '🎉 所有测试通过！日志记录系统工作正常。');
    log('yellow', '\n📋 接下来你可以：');
    console.log('1. 访问 http://localhost:5001/api/admin/stats 查看统计数据');
    console.log('2. 访问 http://localhost:5001/api/admin/logs 查看日志');
    console.log('3. 使用Appsmith配置文件搭建可视化后台');
    console.log('4. 查看 docs/APPSMITH_SETUP.md 了解详细配置步骤');
  } else {
    log('red', '❌ 部分测试失败，请检查：');
    console.log('1. 后端服务是否正常启动 (npm run dev)');
    console.log('2. MongoDB是否正常运行');
    console.log('3. 环境变量是否正确配置');
    console.log('4. DeepSeek API密钥是否有效');
  }
  
  log('cyan', '\n🔗 有用的链接：');
  console.log('- 健康检查: http://localhost:5001/api/health');
  console.log('- 管理API文档: http://localhost:5001/api/admin');
  console.log('- Appsmith配置: ./appsmith-story-admin.json');
  console.log('- 详细文档: ./docs/APPSMITH_SETUP.md');
}

// 处理未捕获的错误
process.on('unhandledRejection', (reason, promise) => {
  log('red', '❌ 未处理的Promise拒绝:');
  console.error(reason);
  process.exit(1);
});

// 运行测试
main().catch(error => {
  log('red', '❌ 测试执行失败:');
  console.error(error);
  process.exit(1);
});