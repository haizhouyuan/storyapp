#!/usr/bin/env node
/**
 * 简化的Node.js版本一致性检查脚本
 * 只检查项目自己的关键配置文件，忽略依赖包
 */

const fs = require('fs');
const path = require('path');

// 目标Node.js版本配置
const TARGET_VERSION = '20';
const TARGET_DOCKER = 'node:20-alpine';
const TARGET_ENGINES = '>=20.0.0';

// 要检查的关键文件
const FILES_TO_CHECK = [
  {
    path: '.env',
    checks: [
      { key: 'NODE_IMAGE', expected: TARGET_DOCKER, pattern: /NODE_IMAGE=(.+)/ }
    ]
  },
  {
    path: '.github/workflows/ci.yml',
    checks: [
      { key: 'NODE_VERSION', expected: '20.x', pattern: /NODE_VERSION:\s*['"]([^'"]+)['"]/ },
      { key: 'node-version使用变量引用', expected: '使用env.NODE_VERSION', pattern: /node-version:\s*\$\{\{\s*env\.NODE_VERSION\s*\}\}/ }
    ]
  },
  {
    path: 'Dockerfile',
    checks: [
      { key: 'NODE_IMAGE默认值', expected: TARGET_DOCKER, pattern: /ARG NODE_IMAGE=(.+)/ }
    ]
  },
  {
    path: 'package.json',
    checks: [
      { key: 'engines.node', expected: TARGET_ENGINES, pattern: null, jsonPath: 'engines.node' }
    ]
  },
  {
    path: 'backend/package.json',
    checks: [
      { key: 'engines.node', expected: TARGET_ENGINES, pattern: null, jsonPath: 'engines.node' }
    ]
  },
  {
    path: 'frontend/package.json',
    checks: [
      { key: 'engines.node', expected: TARGET_ENGINES, pattern: null, jsonPath: 'engines.node' }
    ]
  },
  {
    path: 'shared/package.json',
    checks: [
      { key: 'engines.node', expected: TARGET_ENGINES, pattern: null, jsonPath: 'engines.node' }
    ]
  }
];

/**
 * 获取JSON路径的值
 */
function getJsonValue(obj, path) {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

/**
 * 检查单个文件
 */
function checkFile(fileConfig) {
  const { path: filePath, checks } = fileConfig;
  
  if (!fs.existsSync(filePath)) {
    return { file: filePath, status: 'not_found', results: [] };
  }
  
  const content = fs.readFileSync(filePath, 'utf8');
  const results = [];
  
  for (const check of checks) {
    let actualValue = null;
    let found = false;
    
    if (check.jsonPath) {
      // JSON 文件检查
      try {
        const parsed = JSON.parse(content);
        actualValue = getJsonValue(parsed, check.jsonPath);
        found = actualValue !== undefined;
      } catch (e) {
        results.push({
          key: check.key,
          expected: check.expected,
          actual: 'JSON解析错误',
          status: 'error'
        });
        continue;
      }
    } else if (check.pattern) {
      // 正则表达式检查
      const match = content.match(check.pattern);
      if (match) {
        actualValue = match[1] || match[0];
        found = true;
      }
    }
    
    let status = 'missing';
    if (found) {
      if (check.key.includes('使用变量引用')) {
        // 特殊检查：变量引用
        status = 'ok';
        actualValue = '✅ 正确使用变量引用';
      } else if (actualValue === check.expected) {
        status = 'ok';
      } else {
        status = 'mismatch';
      }
    }
    
    results.push({
      key: check.key,
      expected: check.expected,
      actual: actualValue || '未找到',
      status
    });
  }
  
  return { file: filePath, status: 'checked', results };
}

/**
 * 主检查函数
 */
function checkNodeVersions() {
  console.log('🔍 Node.js版本一致性检查（简化版）');
  console.log('===================================');
  console.log(`目标版本: Node.js ${TARGET_VERSION}.x (${TARGET_DOCKER})`);
  console.log('');
  
  const allResults = [];
  let totalIssues = 0;
  
  for (const fileConfig of FILES_TO_CHECK) {
    const result = checkFile(fileConfig);
    allResults.push(result);
    
    console.log(`📄 ${result.file}:`);
    
    if (result.status === 'not_found') {
      console.log('   ⚠️ 文件不存在');
      continue;
    }
    
    for (const check of result.results) {
      const statusEmoji = {
        'ok': '✅',
        'mismatch': '❌',
        'missing': '⚠️',
        'error': '💥'
      }[check.status] || '❓';
      
      console.log(`   ${statusEmoji} ${check.key}: ${check.actual}`);
      
      if (check.status !== 'ok') {
        console.log(`      期望: ${check.expected}`);
        totalIssues++;
      }
    }
    
    console.log('');
  }
  
  // 总结
  console.log('📊 检查总结:');
  console.log('============');
  
  if (totalIssues === 0) {
    console.log('✅ 所有关键Node.js版本配置都是一致的！');
    console.log('');
    console.log('🎉 Node.js版本标准化完成：');
    console.log(`   - 统一版本: Node.js ${TARGET_VERSION}.x`);
    console.log(`   - Docker镜像: ${TARGET_DOCKER}`);
    console.log(`   - 包管理器约束: ${TARGET_ENGINES}`);
    console.log(`   - 版本管理文件: .nvmrc`);
  } else {
    console.log(`❌ 发现 ${totalIssues} 个版本问题需要修复`);
  }
  
  return {
    totalIssues,
    consistent: totalIssues === 0,
    results: allResults
  };
}

// 如果作为脚本直接运行
if (require.main === module) {
  const result = checkNodeVersions();
  process.exit(result.consistent ? 0 : 1);
}

module.exports = { checkNodeVersions, TARGET_VERSION, TARGET_DOCKER, TARGET_ENGINES };