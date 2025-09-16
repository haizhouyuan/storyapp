#!/usr/bin/env node

/**
 * 前端构建性能测试脚本
 * 用于验证构建优化效果
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const FRONTEND_DIR = path.resolve(__dirname, '../frontend');
const BUILD_DIR = path.join(FRONTEND_DIR, 'build');

console.log('🚀 前端构建性能测试启动...\n');

/**
 * 格式化文件大小
 */
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * 获取目录大小
 */
function getDirSize(dirPath) {
  let totalSize = 0;
  
  function traverseDir(currentPath) {
    const items = fs.readdirSync(currentPath);
    
    for (const item of items) {
      const itemPath = path.join(currentPath, item);
      const stats = fs.statSync(itemPath);
      
      if (stats.isDirectory()) {
        traverseDir(itemPath);
      } else {
        totalSize += stats.size;
      }
    }
  }
  
  if (fs.existsSync(dirPath)) {
    traverseDir(dirPath);
  }
  
  return totalSize;
}

/**
 * 分析构建文件
 */
function analyzeBuildFiles() {
  const staticDir = path.join(BUILD_DIR, 'static');
  const results = {
    total: 0,
    js: { count: 0, size: 0, files: [] },
    css: { count: 0, size: 0, files: [] },
    assets: { count: 0, size: 0, files: [] }
  };
  
  if (!fs.existsSync(staticDir)) {
    console.log('❌ 构建目录不存在，请先运行构建');
    return results;
  }
  
  // 分析JS文件
  const jsDir = path.join(staticDir, 'js');
  if (fs.existsSync(jsDir)) {
    const jsFiles = fs.readdirSync(jsDir);
    for (const file of jsFiles) {
      const filePath = path.join(jsDir, file);
      const stats = fs.statSync(filePath);
      results.js.count++;
      results.js.size += stats.size;
      results.js.files.push({ name: file, size: stats.size });
      results.total += stats.size;
    }
    // 按大小排序
    results.js.files.sort((a, b) => b.size - a.size);
  }
  
  // 分析CSS文件
  const cssDir = path.join(staticDir, 'css');
  if (fs.existsSync(cssDir)) {
    const cssFiles = fs.readdirSync(cssDir);
    for (const file of cssFiles) {
      const filePath = path.join(cssDir, file);
      const stats = fs.statSync(filePath);
      results.css.count++;
      results.css.size += stats.size;
      results.css.files.push({ name: file, size: stats.size });
      results.total += stats.size;
    }
    results.css.files.sort((a, b) => b.size - a.size);
  }
  
  // 分析其他资源文件
  const mediaDir = path.join(staticDir, 'media');
  if (fs.existsSync(mediaDir)) {
    const mediaFiles = fs.readdirSync(mediaDir);
    for (const file of mediaFiles) {
      const filePath = path.join(mediaDir, file);
      const stats = fs.statSync(filePath);
      results.assets.count++;
      results.assets.size += stats.size;
      results.assets.files.push({ name: file, size: stats.size });
      results.total += stats.size;
    }
    results.assets.files.sort((a, b) => b.size - a.size);
  }
  
  return results;
}

/**
 * 运行构建测试
 */
function runBuildTest() {
  const tests = [
    {
      name: '标准构建',
      command: 'npm run build',
      description: '使用CRACO配置的优化构建'
    },
    {
      name: '生产构建',
      command: 'npm run build:production',
      description: '显式指定生产环境的构建'
    }
  ];
  
  const results = [];
  
  for (const test of tests) {
    console.log(`📦 运行 ${test.name}...`);
    console.log(`   ${test.description}`);
    
    // 清理之前的构建
    if (fs.existsSync(BUILD_DIR)) {
      execSync(`rm -rf "${BUILD_DIR}"`, { cwd: FRONTEND_DIR });
    }
    
    const startTime = Date.now();
    
    try {
      // 运行构建
      execSync(test.command, { 
        cwd: FRONTEND_DIR, 
        stdio: 'pipe',
        env: { ...process.env, NODE_ENV: 'production' }
      });
      
      const buildTime = Date.now() - startTime;
      const buildSize = getDirSize(BUILD_DIR);
      const analysis = analyzeBuildFiles();
      
      results.push({
        ...test,
        buildTime,
        buildSize,
        analysis,
        success: true
      });
      
      console.log(`   ✅ 构建成功 (${(buildTime / 1000).toFixed(2)}s)`);
      console.log(`   📊 总大小: ${formatBytes(buildSize)}`);
      
    } catch (error) {
      console.log(`   ❌ 构建失败: ${error.message}`);
      results.push({
        ...test,
        success: false,
        error: error.message
      });
    }
    
    console.log('');
  }
  
  return results;
}

/**
 * 生成报告
 */
function generateReport(results) {
  console.log('📈 构建性能报告');
  console.log('='.repeat(50));
  
  for (const result of results) {
    if (!result.success) {
      console.log(`❌ ${result.name}: 构建失败`);
      console.log(`   错误: ${result.error}`);
      continue;
    }
    
    console.log(`✅ ${result.name}`);
    console.log(`   构建时间: ${(result.buildTime / 1000).toFixed(2)}s`);
    console.log(`   总体积: ${formatBytes(result.buildSize)}`);
    console.log(`   静态资源: ${formatBytes(result.analysis.total)}`);
    
    if (result.analysis.js.count > 0) {
      console.log(`   JavaScript: ${result.analysis.js.count} 个文件, ${formatBytes(result.analysis.js.size)}`);
      // 显示最大的3个JS文件
      const topJs = result.analysis.js.files.slice(0, 3);
      for (const file of topJs) {
        console.log(`     - ${file.name}: ${formatBytes(file.size)}`);
      }
    }
    
    if (result.analysis.css.count > 0) {
      console.log(`   CSS: ${result.analysis.css.count} 个文件, ${formatBytes(result.analysis.css.size)}`);
      for (const file of result.analysis.css.files) {
        console.log(`     - ${file.name}: ${formatBytes(file.size)}`);
      }
    }
    
    if (result.analysis.assets.count > 0) {
      console.log(`   其他资源: ${result.analysis.assets.count} 个文件, ${formatBytes(result.analysis.assets.size)}`);
    }
    
    console.log('');
  }
}

/**
 * 构建优化建议
 */
function generateOptimizationSuggestions(results) {
  console.log('💡 优化建议');
  console.log('='.repeat(50));
  
  const latestResult = results.find(r => r.success);
  if (!latestResult) {
    console.log('❌ 无可用的构建结果进行分析');
    return;
  }
  
  const analysis = latestResult.analysis;
  
  // JavaScript 分析
  if (analysis.js.size > 500 * 1024) { // 500KB
    console.log('🔍 JavaScript 包体积较大 (>500KB):');
    console.log('   - 考虑使用 React.lazy() 进行代码分割');
    console.log('   - 检查是否有未使用的依赖项');
    console.log('   - 使用 npm run build:analyze 分析包组成');
  }
  
  // CSS 分析
  if (analysis.css.size > 100 * 1024) { // 100KB
    console.log('🎨 CSS 文件较大 (>100KB):');
    console.log('   - 检查 Tailwind CSS 是否正确清除未使用样式');
    console.log('   - 考虑拆分关键 CSS');
  }
  
  // 构建时间分析
  if (latestResult.buildTime > 60000) { // 60秒
    console.log('⏱️  构建时间较长 (>60s):');
    console.log('   - 确保启用了 TypeScript 增量编译');
    console.log('   - 考虑使用 webpack 缓存');
    console.log('   - 检查是否有循环依赖');
  }
  
  console.log('');
  console.log('🚀 额外优化选项:');
  console.log('   - 运行 npm run build:cdn 测试 CDN 外部化');
  console.log('   - 运行 npm run build:analyze 查看详细包分析');
  console.log('   - 使用 lighthouse 测试页面性能');
}

// 主函数
async function main() {
  try {
    // 检查是否在正确的目录
    if (!fs.existsSync(path.join(FRONTEND_DIR, 'package.json'))) {
      console.log('❌ 未找到前端项目目录');
      process.exit(1);
    }
    
    // 运行构建测试
    const results = runBuildTest();
    
    // 生成报告
    generateReport(results);
    
    // 生成优化建议
    generateOptimizationSuggestions(results);
    
    console.log('✨ 前端构建性能测试完成！');
    
  } catch (error) {
    console.error('❌ 测试过程中出现错误:', error.message);
    process.exit(1);
  }
}

// 运行主函数
if (require.main === module) {
  main();
}

module.exports = {
  formatBytes,
  getDirSize,
  analyzeBuildFiles,
  runBuildTest,
  generateReport,
  generateOptimizationSuggestions
};