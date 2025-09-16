const axios = require('axios');
const { execSync } = require('child_process');

// 测试配置
const API_BASE = 'http://localhost:5001/api';
const FRONTEND_URL = 'http://localhost:5001';

// 测试数据
const TEST_TOPICS = [
  '小兔子的冒险',
  '神奇的星空之旅', 
  '森林里的小精灵'
];

class BusinessFlowTest {
  constructor() {
    this.testResults = [];
    this.currentStory = null;
    this.storyId = null;
  }

  async run() {
    console.log('🚀 开始完整的业务流程测试...\n');
    
    try {
      // 1. 健康检查
      await this.testHealthCheck();
      
      // 2. 首页访问测试
      await this.testHomepageAccess();
      
      // 3. API接口测试
      await this.testAPIs();
      
      // 4. 完整故事创作流程
      await this.testFullStoryCreation();
      
      // 5. 故事保存和查看
      await this.testStorySaving();
      
      // 6. 错误处理测试
      await this.testErrorHandling();
      
      this.printResults();
      
    } catch (error) {
      console.error('❌ 测试执行失败:', error.message);
      process.exit(1);
    }
  }

  async testHealthCheck() {
    console.log('🏥 1. 健康检查测试...');
    
    try {
      const response = await axios.get(`${API_BASE}/health`);
      
      if (response.status === 200 && response.data.status === 'healthy') {
        this.recordResult('健康检查', '✅ 通过', response.data);
        console.log('   ✅ 所有服务健康');
      } else {
        throw new Error(`健康状态异常: ${JSON.stringify(response.data)}`);
      }
      
    } catch (error) {
      this.recordResult('健康检查', '❌ 失败', error.message);
      throw error;
    }
  }

  async testHomepageAccess() {
    console.log('🌐 2. 首页访问测试...');
    
    try {
      // 使用curl测试页面访问
      const result = execSync(`curl -s -o /dev/null -w "%{http_code}" ${FRONTEND_URL}`, { 
        encoding: 'utf-8' 
      });
      
      if (result.trim() === '200') {
        this.recordResult('首页访问', '✅ 通过', `HTTP ${result}`);
        console.log('   ✅ 首页可正常访问');
      } else {
        throw new Error(`HTTP状态码: ${result}`);
      }
      
    } catch (error) {
      this.recordResult('首页访问', '❌ 失败', error.message);
      throw error;
    }
  }

  async testAPIs() {
    console.log('🔌 3. API接口测试...');
    
    // 测试故事列表API
    try {
      const response = await axios.get(`${API_BASE}/get-stories`);
      this.recordResult('获取故事列表', '✅ 通过', 
        `找到 ${response.data.stories?.length || 0} 个故事`);
      console.log('   ✅ 故事列表API正常');
    } catch (error) {
      this.recordResult('获取故事列表', '❌ 失败', error.message);
    }
    
    // 测试TTS接口（应该返回501）
    try {
      await axios.get(`${API_BASE}/tts`);
      this.recordResult('TTS接口', '⚠️ 异常', '应该返回501但返回了200');
    } catch (error) {
      if (error.response?.status === 501) {
        this.recordResult('TTS接口', '✅ 通过', '正确返回501状态码');
        console.log('   ✅ TTS接口正常（返回501）');
      } else {
        this.recordResult('TTS接口', '❌ 失败', error.message);
      }
    }
  }

  async testFullStoryCreation() {
    console.log('📖 4. 完整故事创作流程测试...');
    const testTopic = TEST_TOPICS[0];
    
    try {
      console.log(`   🎯 测试主题: ${testTopic}`);
      
      // 生成第一段故事
      const generateResponse = await axios.post(`${API_BASE}/generate-story`, {
        topic: testTopic
      });
      
      if (!generateResponse.data.storySegment || !generateResponse.data.choices) {
        throw new Error('故事生成响应格式错误');
      }
      
      this.recordResult('故事生成', '✅ 通过', 
        `生成 ${generateResponse.data.storySegment.length} 字符，${generateResponse.data.choices.length} 个选项`);
      console.log('   ✅ 第一段故事生成成功');
      
      this.currentStory = generateResponse.data;
      
      // 进行选择并继续故事
      await this.testStoryChoices(testTopic);
      
    } catch (error) {
      this.recordResult('故事创作', '❌ 失败', error.message);
      throw error;
    }
  }

  async testStoryChoices(topic) {
    console.log('   🔄 测试故事选择流程...');
    
    let currentStory = this.currentStory;
    let turnIndex = 1;
    const maxTurns = 3; // 限制交互轮数
    
    while (turnIndex <= maxTurns && currentStory && !currentStory.isEnding) {
      try {
        console.log(`   📝 第 ${turnIndex} 轮选择`);
        
        // 选择第一个选项
        const selectedChoice = currentStory.choices[0];
        console.log(`   👉 选择: ${selectedChoice.substring(0, 30)}...`);
        
        const continueResponse = await axios.post(`${API_BASE}/generate-story`, {
          topic: topic,
          currentStory: currentStory.storySegment,
          selectedChoice: selectedChoice,
          turnIndex: turnIndex
        });
        
        if (!continueResponse.data.storySegment) {
          throw new Error('继续故事响应格式错误');
        }
        
        console.log(`   ✅ 第 ${turnIndex} 轮故事继续成功`);
        
        currentStory = continueResponse.data;
        turnIndex++;
        
        // 如果故事结束，跳出循环
        if (currentStory.isEnding) {
          console.log('   🏁 故事已结束');
          break;
        }
        
        // 等待一下，避免API速率限制
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        this.recordResult(`第${turnIndex}轮故事选择`, '❌ 失败', error.message);
        throw error;
      }
    }
    
    this.recordResult('多轮故事交互', '✅ 通过', `完成 ${turnIndex - 1} 轮交互`);
  }

  async testStorySaving() {
    console.log('💾 5. 故事保存测试...');
    
    if (!this.currentStory) {
      console.log('   ⚠️ 没有当前故事，跳过保存测试');
      return;
    }
    
    try {
      const saveData = {
        title: `测试故事 - ${new Date().toLocaleString()}`,
        content: JSON.stringify({
          topic: TEST_TOPICS[0],
          segments: [this.currentStory.storySegment],
          createdAt: new Date().toISOString()
        })
      };
      
      const saveResponse = await axios.post(`${API_BASE}/save-story`, saveData);
      
      if (saveResponse.data && saveResponse.data.id) {
        this.storyId = saveResponse.data.id;
        this.recordResult('故事保存', '✅ 通过', `故事ID: ${this.storyId}`);
        console.log('   ✅ 故事保存成功');
        
        // 测试获取保存的故事
        await this.testGetSavedStory();
        
      } else {
        throw new Error('保存响应格式错误');
      }
      
    } catch (error) {
      this.recordResult('故事保存', '❌ 失败', error.message);
    }
  }

  async testGetSavedStory() {
    if (!this.storyId) return;
    
    try {
      const response = await axios.get(`${API_BASE}/get-story/${this.storyId}`);
      
      if (response.data && response.data.id === this.storyId) {
        this.recordResult('获取故事详情', '✅ 通过', '成功获取保存的故事');
        console.log('   ✅ 故事详情获取成功');
      } else {
        throw new Error('获取故事详情失败');
      }
      
    } catch (error) {
      this.recordResult('获取故事详情', '❌ 失败', error.message);
    }
  }

  async testErrorHandling() {
    console.log('⚠️  6. 错误处理测试...');
    
    // 测试空主题
    try {
      await axios.post(`${API_BASE}/generate-story`, { topic: '' });
      this.recordResult('空主题验证', '❌ 失败', '应该返回400错误但通过了');
    } catch (error) {
      if (error.response?.status === 400) {
        this.recordResult('空主题验证', '✅ 通过', '正确返回400错误');
        console.log('   ✅ 空主题验证正确');
      } else {
        this.recordResult('空主题验证', '❌ 失败', error.message);
      }
    }
    
    // 测试超长主题
    try {
      const longTopic = 'a'.repeat(150);
      await axios.post(`${API_BASE}/generate-story`, { topic: longTopic });
      this.recordResult('长主题验证', '❌ 失败', '应该返回400错误但通过了');
    } catch (error) {
      if (error.response?.status === 400) {
        this.recordResult('长主题验证', '✅ 通过', '正确返回400错误');
        console.log('   ✅ 长主题验证正确');
      } else {
        this.recordResult('长主题验证', '❌ 失败', error.message);
      }
    }
  }

  recordResult(testName, status, details) {
    this.testResults.push({
      test: testName,
      status: status,
      details: details,
      timestamp: new Date().toISOString()
    });
  }

  printResults() {
    console.log('\n📊 测试结果汇总:');
    console.log('=' .repeat(50));
    
    let passed = 0;
    let failed = 0;
    
    this.testResults.forEach((result, index) => {
      const emoji = result.status.includes('✅') ? '✅' : 
                    result.status.includes('❌') ? '❌' : '⚠️ ';
      console.log(`${index + 1}. ${emoji} ${result.test}: ${result.status}`);
      
      if (result.status.includes('✅')) passed++;
      if (result.status.includes('❌')) failed++;
    });
    
    console.log('=' .repeat(50));
    console.log(`总计: ${this.testResults.length} 个测试`);
    console.log(`通过: ${passed} | 失败: ${failed} | 警告: ${this.testResults.length - passed - failed}`);
    
    if (failed > 0) {
      console.log('\n❌ 测试失败，请检查以上错误');
      process.exit(1);
    } else {
      console.log('\n🎉 所有测试通过！业务流程完整可用');
    }
  }
}

// 运行测试
const test = new BusinessFlowTest();
test.run().catch(console.error);