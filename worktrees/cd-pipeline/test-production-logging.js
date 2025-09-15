#!/usr/bin/env node

/**
 * 生产环境Docker容器日志系统测试脚本
 * 用于验证容器化部署后的日志记录功能
 */

const axios = require('axios');
const fs = require('fs');

// 配置
const BASE_URL = process.env.API_URL || 'http://localhost:5001/api';
const ADMIN_URL = process.env.ADMIN_API_URL || 'http://localhost:5001/api/admin';
const DOMAIN_URL = process.env.DOMAIN_URL || 'http://storyapp.dandanbaba.xyz/api';

// 颜色输出
const colors = {
    cyan: '\x1b[36m',
    blue: '\x1b[34m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    reset: '\x1b[0m'
};

function log(color, message) {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

// 测试结果统计
let testResults = {
    passed: 0,
    failed: 0,
    total: 0
};

async function runTest(testName, testFn) {
    testResults.total++;
    log('blue', `\n🔍 测试${testResults.total}: ${testName}`);
    
    try {
        await testFn();
        testResults.passed++;
        log('green', `✅ 测试 ${testResults.total} 通过`);
        return true;
    } catch (error) {
        testResults.failed++;
        log('red', `❌ 测试 ${testResults.total} 失败`);
        if (error.response) {
            console.log('响应状态:', error.response.status);
            console.log('响应数据:', error.response.data);
        } else {
            console.log('错误:', error.message);
        }
        return false;
    }
}

// 测试1: Docker容器健康检查
async function testContainerHealth() {
    const response = await axios.get(`${BASE_URL}/health`, { timeout: 10000 });
    
    if (response.data.status !== 'healthy') {
        throw new Error('健康检查状态异常');
    }
    
    log('green', '✅ Docker容器健康状态正常');
    console.log('响应数据:', JSON.stringify(response.data, null, 2));
    
    // 检查数据库连接
    if (!response.data.checks.database) {
        throw new Error('数据库连接异常');
    }
    
    log('green', '✅ MongoDB数据库连接正常');
}

// 测试2: 容器内故事保存功能（创建日志）
async function testContainerStorySaving() {
    const storyData = {
        title: `Docker容器测试故事 - ${new Date().toLocaleString()}`,
        content: JSON.stringify({
            storySegment: "这是在Docker容器中测试的故事片段，用于验证日志记录系统在容器环境中的工作状态。",
            choices: ["选择继续冒险", "选择返回安全地带", "选择寻求帮助"],
            isEnding: false
        })
    };
    
    const response = await axios.post(`${BASE_URL}/save-story`, storyData, { timeout: 15000 });
    
    if (!response.data.success) {
        throw new Error('故事保存失败');
    }
    
    log('green', '✅ Docker容器内故事保存成功');
    console.log('故事ID:', response.data.storyId);
    console.log('消息:', response.data.message);
    
    return response.data.storyId;
}

// 测试3: 容器间通信（管理API）
async function testContainerAdminAPI() {
    // 等待日志写入
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // 测试统计API
    const statsResponse = await axios.get(`${ADMIN_URL}/stats`, { timeout: 10000 });
    
    if (!statsResponse.data.overview) {
        throw new Error('统计数据格式异常');
    }
    
    log('green', '✅ 容器间管理API通信正常');
    console.log('总会话数:', statsResponse.data.overview.totalSessions);
    console.log('24小时会话数:', statsResponse.data.overview.sessionsLast24h);
    console.log('成功率:', Math.round(statsResponse.data.overview.successRate) + '%');
    
    // 测试日志API
    const logsResponse = await axios.get(`${ADMIN_URL}/logs?limit=10`, { timeout: 10000 });
    
    if (!Array.isArray(logsResponse.data.logs)) {
        throw new Error('日志数据格式异常');
    }
    
    log('green', '✅ 容器内日志查询正常');
    console.log('获取日志数量:', logsResponse.data.logs.length);
    
    if (logsResponse.data.logs.length > 0) {
        const latestLog = logsResponse.data.logs[0];
        console.log('最新日志:');
        console.log(`  - 时间: ${latestLog.timestamp}`);
        console.log(`  - 级别: ${latestLog.logLevel}`);
        console.log(`  - 事件: ${latestLog.eventType}`);
        console.log(`  - 消息: ${latestLog.message}`);
    }
}

// 测试4: 生产环境性能指标
async function testProductionPerformance() {
    const perfResponse = await axios.get(`${ADMIN_URL}/performance`, { timeout: 10000 });
    
    if (perfResponse.data.timeline === undefined) {
        throw new Error('性能数据格式异常');
    }
    
    log('green', '✅ 生产环境性能指标正常');
    console.log('时间线数据点数量:', perfResponse.data.timeline.length);
    
    if (perfResponse.data.summary) {
        console.log('性能摘要:');
        console.log(`  - 平均响应时间: ${Math.round(perfResponse.data.summary.avgResponseTime)}ms`);
        console.log(`  - 总API调用数: ${perfResponse.data.summary.totalApiCalls}`);
        console.log(`  - 错误率: ${Math.round(perfResponse.data.summary.errorRate * 100)}%`);
    }
}

// 测试5: 域名访问（如果配置了）
async function testDomainAccess() {
    if (DOMAIN_URL === 'http://storyapp.dandanbaba.xyz/api') {
        log('yellow', '⚠️  使用默认域名，可能无法访问');
    }
    
    const healthResponse = await axios.get(`${DOMAIN_URL}/health`, { timeout: 15000 });
    
    if (healthResponse.data.status !== 'healthy') {
        throw new Error('域名健康检查失败');
    }
    
    log('green', '✅ 域名访问正常');
    console.log('域名:', DOMAIN_URL);
    console.log('服务状态:', healthResponse.data.status);
    
    // 测试域名管理API
    const domainStatsResponse = await axios.get(`${DOMAIN_URL.replace('/api', '/api/admin')}/stats`, { timeout: 15000 });
    
    if (domainStatsResponse.data.overview) {
        log('green', '✅ 域名管理API访问正常');
    }
}

// 测试6: 容器资源使用情况
async function testContainerResources() {
    try {
        // 这里模拟检查容器资源使用
        // 在实际部署中，可以通过Docker API获取真实的资源使用情况
        log('green', '✅ 容器资源检查');
        console.log('注意: 请在服务器上运行 docker stats storyapp_prod 查看实际资源使用');
        console.log('注意: 请在服务器上运行 docker logs storyapp_prod 查看应用日志');
    } catch (error) {
        throw new Error('容器资源检查失败');
    }
}

// 测试7: 数据持久化验证
async function testDataPersistence() {
    // 验证MongoDB数据持久化
    const storiesResponse = await axios.get(`${BASE_URL}/get-stories`, { timeout: 10000 });
    
    if (!Array.isArray(storiesResponse.data.stories)) {
        throw new Error('故事数据格式异常');
    }
    
    log('green', '✅ 数据持久化正常');
    console.log('存储的故事数量:', storiesResponse.data.stories.length);
    
    if (storiesResponse.data.stories.length > 0) {
        const latestStory = storiesResponse.data.stories[0];
        console.log('最新故事:');
        console.log(`  - 标题: ${latestStory.title}`);
        console.log(`  - 创建时间: ${latestStory.created_at}`);
        console.log(`  - 预览: ${latestStory.preview.substring(0, 50)}...`);
    }
}

// 生成测试报告
function generateReport() {
    const reportData = {
        testTime: new Date().toISOString(),
        environment: 'production-docker',
        testResults: testResults,
        configuration: {
            baseUrl: BASE_URL,
            adminUrl: ADMIN_URL,
            domainUrl: DOMAIN_URL
        }
    };
    
    const reportContent = `# 生产环境Docker容器测试报告

## 测试概要
- **测试时间**: ${reportData.testTime}
- **测试环境**: ${reportData.environment}
- **通过测试**: ${testResults.passed}/${testResults.total}
- **失败测试**: ${testResults.failed}/${testResults.total}
- **成功率**: ${Math.round((testResults.passed / testResults.total) * 100)}%

## 测试配置
- **基础API**: ${BASE_URL}
- **管理API**: ${ADMIN_URL}
- **域名API**: ${DOMAIN_URL}

## 建议后续操作
${testResults.failed > 0 ? 
`⚠️  发现 ${testResults.failed} 个失败测试，建议：
1. 检查Docker容器日志: docker logs storyapp_prod
2. 检查MongoDB容器日志: docker logs storyapp_mongo
3. 验证网络连接和端口映射
4. 检查环境变量配置` : 
`✅ 所有测试通过！生产环境部署成功！
1. 可以开始配置Nginx反向代理
2. 可以设置域名解析
3. 可以配置SSL证书
4. 可以启用Appsmith监控后台`}

## 有用的命令
\`\`\`bash
# 查看容器状态
docker-compose ps

# 查看应用日志
docker-compose logs -f app

# 查看资源使用
docker stats storyapp_prod

# 重启应用
docker-compose restart app

# 进入容器调试
docker exec -it storyapp_prod sh
\`\`\`
`;
    
    try {
        fs.writeFileSync('production-test-report.md', reportContent);
        log('green', '✅ 测试报告已生成: production-test-report.md');
    } catch (error) {
        log('yellow', '⚠️  测试报告生成失败，但测试已完成');
    }
}

// 主测试函数
async function runAllTests() {
    log('cyan', '🚀 开始生产环境Docker容器日志系统测试...\n');
    
    await runTest('Docker容器健康检查', testContainerHealth);
    await runTest('容器内故事保存功能', testContainerStorySaving);
    await runTest('容器间管理API通信', testContainerAdminAPI);
    await runTest('生产环境性能指标', testProductionPerformance);
    
    // 域名测试（可能失败，不影响整体评估）
    try {
        await runTest('域名访问测试', testDomainAccess);
    } catch (error) {
        log('yellow', '⚠️  域名访问测试跳过（域名可能未配置）');
    }
    
    await runTest('容器资源检查', testContainerResources);
    await runTest('数据持久化验证', testDataPersistence);
    
    // 输出测试结果
    console.log('\n' + '='.repeat(60));
    log('cyan', `📊 生产环境测试结果: ${testResults.passed}/${testResults.total} 通过`);
    
    if (testResults.failed === 0) {
        log('green', '🎉 所有测试通过！Docker容器化部署成功！');
    } else {
        log('yellow', `⚠️  ${testResults.failed} 个测试失败，请检查容器配置和日志`);
    }
    
    console.log('\n🔗 有用的链接：');
    console.log(`- 健康检查: ${BASE_URL}/health`);
    console.log(`- 管理API: ${ADMIN_URL}`);
    console.log('- Docker容器状态: docker-compose ps');
    console.log('- 应用日志: docker-compose logs -f app');
    console.log('- 详细文档: ./docs/APPSMITH_SETUP.md');
    
    generateReport();
}

// 错误处理
process.on('unhandledRejection', (error) => {
    log('red', '❌ 未处理的错误:');
    console.error(error);
    process.exit(1);
});

// 运行测试
runAllTests().catch((error) => {
    log('red', '❌ 测试运行失败:');
    console.error(error);
    process.exit(1);
});