#!/usr/bin/env node
/**
 * Node.js版本一致性检查脚本
 * 检查项目中所有涉及Node.js版本的文件，确保版本一致性
 */

const fs = require('fs');
const path = require('path');
const glob = require('glob');

// 目标Node.js版本配置
const TARGET_VERSIONS = {
  major: 20,
  full: '20.x',
  docker: 'node:20-alpine',
  engines: '>=20.0.0'
};

// 需要检查的文件模式和版本提取规则
const VERSION_CHECKS = [
  {
    name: 'CI工作流',
    pattern: '.github/workflows/*.yml',
    extract: (content) => {
      const nodeVersionMatch = content.match(/NODE_VERSION:\s*['"]([^'"]+)['"]/);
      const setupNodeMatch = content.match(/node-version:\s*(?:\$\{\{\s*env\.NODE_VERSION\s*\}\}|['"]?([^'"'\s}]+)['"]?)/);
      return {
        NODE_VERSION: nodeVersionMatch ? nodeVersionMatch[1] : null,
        setup_node: setupNodeMatch && setupNodeMatch[0].includes('env.NODE_VERSION') ? 'env.NODE_VERSION' : (setupNodeMatch ? setupNodeMatch[1] : null)
      };
    }
  },
  {
    name: 'Dockerfile',
    pattern: 'Dockerfile*',
    extract: (content) => {
      const nodeImageMatch = content.match(/NODE_IMAGE=([^\s\n]+)/);
      const fromNodeMatch = content.match(/FROM\s+([^\s]+node[^\s]*)/);
      return {
        NODE_IMAGE: nodeImageMatch ? nodeImageMatch[1] : null,
        FROM_node: fromNodeMatch ? fromNodeMatch[1] : null
      };
    }
  },
  {
    name: '环境配置文件',
    pattern: '.env*',
    extract: (content) => {
      const nodeImageMatch = content.match(/NODE_IMAGE=([^\s\n]+)/);
      const nodeVersionMatch = content.match(/NODE_VERSION=([^\s\n]+)/);
      return {
        NODE_IMAGE: nodeImageMatch ? nodeImageMatch[1] : null,
        NODE_VERSION: nodeVersionMatch ? nodeVersionMatch[1] : null
      };
    }
  },
  {
    name: 'package.json',
    pattern: '**/package.json',
    extract: (content) => {
      try {
        const pkg = JSON.parse(content);
        return {
          engines_node: pkg.engines?.node || null,
          volta_node: pkg.volta?.node || null
        };
      } catch (e) {
        return {};
      }
    }
  },
  {
    name: 'Docker Compose',
    pattern: 'docker-compose*.yml',
    extract: (content) => {
      const nodeImageMatch = content.match(/NODE_IMAGE.*?([^\s\n]+node[^\s]*)/);
      return {
        NODE_IMAGE: nodeImageMatch ? nodeImageMatch[1] : null
      };
    }
  }
];

/**
 * 检查单个文件的Node.js版本
 */
function checkFile(filePath, checker) {
  try {
    if (!fs.existsSync(filePath)) return null;
    
    const content = fs.readFileSync(filePath, 'utf8');
    const versions = checker.extract(content);
    
    return {
      file: filePath,
      versions
    };
  } catch (error) {
    console.warn(`⚠️ 读取文件失败: ${filePath} - ${error.message}`);
    return null;
  }
}

/**
 * 检查版本是否符合目标
 */
function validateVersion(versionStr, type = 'general') {
  if (!versionStr) return { valid: null, message: '未设置' };
  
  const cleanVersion = versionStr.replace(/['"]/g, '');
  
  switch (type) {
    case 'major':
      const majorMatch = cleanVersion.match(/(\d+)/);
      const major = majorMatch ? parseInt(majorMatch[1]) : null;
      if (major === TARGET_VERSIONS.major) {
        return { valid: true, message: `✅ 正确 (${cleanVersion})` };
      }
      return { valid: false, message: `❌ 不匹配 (${cleanVersion}, 期望: ${TARGET_VERSIONS.major}.x)` };
      
    case 'docker':
      if (cleanVersion.includes(`node:${TARGET_VERSIONS.major}`)) {
        return { valid: true, message: `✅ 正确 (${cleanVersion})` };
      }
      return { valid: false, message: `❌ 不匹配 (${cleanVersion}, 期望: ${TARGET_VERSIONS.docker})` };
      
    case 'engines':
      if (cleanVersion.includes(`>=${TARGET_VERSIONS.major}`) || 
          cleanVersion.includes(`^${TARGET_VERSIONS.major}`) ||
          cleanVersion === TARGET_VERSIONS.engines) {
        return { valid: true, message: `✅ 正确 (${cleanVersion})` };
      }
      return { valid: false, message: `❌ 不匹配 (${cleanVersion}, 期望: ${TARGET_VERSIONS.engines})` };
      
    default:
      if (cleanVersion.includes(TARGET_VERSIONS.major.toString())) {
        return { valid: true, message: `✅ 正确 (${cleanVersion})` };
      }
      return { valid: false, message: `❌ 不匹配 (${cleanVersion}, 期望包含: ${TARGET_VERSIONS.major})` };
  }
}

/**
 * 生成修复建议
 */
function generateFixSuggestions(issues) {
  const suggestions = [];
  
  for (const issue of issues) {
    const { file, type, current, expected } = issue;
    
    suggestions.push({
      file,
      action: `更新 ${type}`,
      from: current,
      to: expected,
      command: generateFixCommand(file, type, expected)
    });
  }
  
  return suggestions;
}

/**
 * 生成修复命令
 */
function generateFixCommand(filePath, type, expectedValue) {
  const filename = path.basename(filePath);
  
  if (filename.includes('package.json')) {
    return `npm pkg set engines.node="${expectedValue}"`;
  }
  
  if (filename.includes('.yml') || filename.includes('.yaml')) {
    return `# 手动编辑 ${filePath}\n# 将 ${type} 更新为: ${expectedValue}`;
  }
  
  if (filename === 'Dockerfile') {
    return `# 手动编辑 ${filePath}\n# 将 ARG NODE_IMAGE 更新为: ${expectedValue}`;
  }
  
  if (filename.startsWith('.env')) {
    return `# 手动编辑 ${filePath}\n# 将 NODE_IMAGE 更新为: ${expectedValue}`;
  }
  
  return `# 手动编辑 ${filePath}`;
}

/**
 * 主检查函数
 */
async function checkNodeVersionConsistency() {
  console.log('🔍 Node.js版本一致性检查');
  console.log('==========================');
  console.log(`目标版本: Node.js ${TARGET_VERSIONS.major}.x (${TARGET_VERSIONS.docker})`);
  console.log('');
  
  const allResults = [];
  const issues = [];
  
  for (const checker of VERSION_CHECKS) {
    console.log(`📁 检查 ${checker.name}:`);
    
    try {
      const files = glob.sync(checker.pattern, {
        cwd: process.cwd(),
        ignore: ['node_modules/**', '.git/**']
      });
      
      if (files.length === 0) {
        console.log(`   ⚠️ 未找到匹配文件: ${checker.pattern}`);
        continue;
      }
      
      for (const file of files) {
        const result = checkFile(file, checker);
        if (!result) continue;
        
        allResults.push({
          category: checker.name,
          ...result
        });
        
        console.log(`   📄 ${file}:`);
        
        for (const [key, value] of Object.entries(result.versions)) {
          if (value === null) {
            console.log(`      ${key}: 未设置`);
            continue;
          }
          
          // 跳过env.NODE_VERSION引用，因为这是正确的用法
          if (value === 'env.NODE_VERSION') {
            console.log(`      ${key}: ✅ 正确 (使用环境变量引用)`);
            continue;
          }
          
          let validationType = 'general';
          if (key.includes('IMAGE') || key.includes('FROM')) {
            validationType = 'docker';
          } else if (key.includes('engines')) {
            validationType = 'engines';
          } else {
            validationType = 'major';
          }
          
          const validation = validateVersion(value, validationType);
          console.log(`      ${key}: ${validation.message}`);
          
          if (validation.valid === false) {
            issues.push({
              file,
              type: key,
              current: value,
              expected: getExpectedValue(key),
              category: checker.name
            });
          }
        }
      }
    } catch (error) {
      console.error(`❌ 检查 ${checker.name} 时出错:`, error.message);
    }
    
    console.log('');
  }
  
  // 总结
  console.log('📊 检查总结:');
  console.log('============');
  
  if (issues.length === 0) {
    console.log('✅ 所有Node.js版本配置都是一致的！');
  } else {
    console.log(`❌ 发现 ${issues.length} 个版本不一致问题:`);
    console.log('');
    
    // 按类别分组显示问题
    const issuesByCategory = {};
    for (const issue of issues) {
      if (!issuesByCategory[issue.category]) {
        issuesByCategory[issue.category] = [];
      }
      issuesByCategory[issue.category].push(issue);
    }
    
    for (const [category, categoryIssues] of Object.entries(issuesByCategory)) {
      console.log(`🔧 ${category}:`);
      for (const issue of categoryIssues) {
        console.log(`   ${issue.file} - ${issue.type}: ${issue.current} → ${issue.expected}`);
      }
      console.log('');
    }
    
    // 生成修复建议
    console.log('💡 修复建议:');
    console.log('============');
    const suggestions = generateFixSuggestions(issues);
    
    for (const suggestion of suggestions) {
      console.log(`📝 ${suggestion.file}:`);
      console.log(`   ${suggestion.action}: ${suggestion.from} → ${suggestion.to}`);
      console.log(`   命令: ${suggestion.command}`);
      console.log('');
    }
  }
  
  return {
    issues,
    totalFiles: allResults.length,
    consistent: issues.length === 0
  };
}

/**
 * 获取期望的值
 */
function getExpectedValue(key) {
  if (key.includes('IMAGE') || key.includes('FROM')) {
    return TARGET_VERSIONS.docker;
  } else if (key.includes('engines')) {
    return TARGET_VERSIONS.engines;
  } else {
    return TARGET_VERSIONS.full;
  }
}

// 如果作为脚本直接运行
if (require.main === module) {
  checkNodeVersionConsistency()
    .then((result) => {
      if (!result.consistent) {
        process.exit(1);
      }
    })
    .catch((error) => {
      console.error('💥 检查失败:', error);
      process.exit(1);
    });
}

module.exports = {
  checkNodeVersionConsistency,
  TARGET_VERSIONS,
  validateVersion
};