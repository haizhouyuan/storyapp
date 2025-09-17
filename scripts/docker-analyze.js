#!/usr/bin/env node
/**
 * Docker镜像和容器性能分析脚本
 * 分析镜像大小、层数、构建效率等指标
 */

const { execSync } = require('child_process');
const fs = require('fs');

// 配置
const IMAGE_NAME = 'storyapp';
const OPTIMIZED_IMAGE = 'storyapp-optimized';

/**
 * 执行命令并返回结果
 */
function exec(command) {
  try {
    return execSync(command, { encoding: 'utf8' }).trim();
  } catch (error) {
    console.warn(`命令执行失败: ${command}`);
    return null;
  }
}

/**
 * 格式化字节大小
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * 分析镜像信息
 */
function analyzeImage(imageName) {
  console.log(`🔍 分析镜像: ${imageName}`);
  
  // 检查镜像是否存在
  const imageExists = exec(`docker images -q ${imageName}:latest`);
  if (!imageExists) {
    console.log(`   ❌ 镜像不存在: ${imageName}:latest`);
    return null;
  }
  
  // 获取镜像基本信息
  const imageInfo = exec(`docker images ${imageName}:latest --format "{{.Size}}"`);
  const sizeStr = imageInfo || '0MB';
  
  // 转换大小为字节
  let sizeBytes = 0;
  if (sizeStr.includes('GB')) {
    sizeBytes = parseFloat(sizeStr) * 1024 * 1024 * 1024;
  } else if (sizeStr.includes('MB')) {
    sizeBytes = parseFloat(sizeStr) * 1024 * 1024;
  } else if (sizeStr.includes('KB')) {
    sizeBytes = parseFloat(sizeStr) * 1024;
  }
  
  // 获取镜像层信息
  const historyOutput = exec(`docker history ${imageName}:latest --format "{{.Size}}" --no-trunc`);
  const layers = historyOutput ? historyOutput.split('\n').length : 0;
  
  // 获取镜像创建时间
  const created = exec(`docker images ${imageName}:latest --format "{{.CreatedAt}}"`);
  
  return {
    name: imageName,
    size: sizeStr,
    sizeBytes,
    layers,
    created
  };
}

/**
 * 分析Dockerfile层效率
 */
function analyzeDockerfileLayers(dockerfilePath) {
  if (!fs.existsSync(dockerfilePath)) {
    return null;
  }
  
  const content = fs.readFileSync(dockerfilePath, 'utf8');
  const lines = content.split('\n');
  
  let fromCount = 0;
  let runCount = 0;
  let copyCount = 0;
  let addCount = 0;
  let exposeCount = 0;
  let envCount = 0;
  let workdirCount = 0;
  let cmdCount = 0;
  let entrypointCount = 0;
  let healthcheckCount = 0;
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('FROM')) fromCount++;
    else if (trimmed.startsWith('RUN')) runCount++;
    else if (trimmed.startsWith('COPY')) copyCount++;
    else if (trimmed.startsWith('ADD')) addCount++;
    else if (trimmed.startsWith('EXPOSE')) exposeCount++;
    else if (trimmed.startsWith('ENV')) envCount++;
    else if (trimmed.startsWith('WORKDIR')) workdirCount++;
    else if (trimmed.startsWith('CMD')) cmdCount++;
    else if (trimmed.startsWith('ENTRYPOINT')) entrypointCount++;
    else if (trimmed.startsWith('HEALTHCHECK')) healthcheckCount++;
  }
  
  return {
    totalLines: lines.length,
    instructions: {
      FROM: fromCount,
      RUN: runCount,
      COPY: copyCount,
      ADD: addCount,
      EXPOSE: exposeCount,
      ENV: envCount,
      WORKDIR: workdirCount,
      CMD: cmdCount,
      ENTRYPOINT: entrypointCount,
      HEALTHCHECK: healthcheckCount
    }
  };
}

/**
 * 生成优化建议
 */
function generateOptimizationSuggestions(analysis) {
  const suggestions = [];
  
  if (analysis.original) {
    if (analysis.original.sizeBytes > 500 * 1024 * 1024) { // > 500MB
      suggestions.push('🔸 镜像大小较大，考虑使用alpine基础镜像');
    }
    
    if (analysis.original.layers > 20) {
      suggestions.push('🔸 镜像层数较多，考虑合并RUN指令');
    }
  }
  
  if (analysis.dockerfile) {
    if (analysis.dockerfile.instructions.RUN > 10) {
      suggestions.push('🔸 RUN指令过多，建议使用&&连接命令减少层数');
    }
    
    if (analysis.dockerfile.instructions.COPY > 5) {
      suggestions.push('🔸 COPY指令较多，考虑优化文件复制顺序');
    }
    
    if (analysis.dockerfile.instructions.ADD > 0) {
      suggestions.push('🔸 建议使用COPY替代ADD，除非需要URL下载或解压');
    }
  }
  
  return suggestions;
}

/**
 * 主分析函数
 */
function analyzeDockerPerformance() {
  console.log('🐳 Docker性能分析报告');
  console.log('========================');
  console.log('');
  
  const analysis = {};
  
  // 分析原始镜像
  console.log('📊 镜像分析:');
  analysis.original = analyzeImage(IMAGE_NAME);
  if (analysis.original) {
    console.log(`   📦 ${analysis.original.name}:`);
    console.log(`      大小: ${analysis.original.size}`);
    console.log(`      层数: ${analysis.original.layers}`);
    console.log(`      创建时间: ${analysis.original.created}`);
  }
  
  // 分析优化镜像
  analysis.optimized = analyzeImage(OPTIMIZED_IMAGE);
  if (analysis.optimized) {
    console.log(`   📦 ${analysis.optimized.name}:`);
    console.log(`      大小: ${analysis.optimized.size}`);
    console.log(`      层数: ${analysis.optimized.layers}`);
    console.log(`      创建时间: ${analysis.optimized.created}`);
  }
  
  console.log('');
  
  // 对比分析
  if (analysis.original && analysis.optimized) {
    console.log('🔄 优化对比:');
    const sizeDiff = analysis.original.sizeBytes - analysis.optimized.sizeBytes;
    const layerDiff = analysis.original.layers - analysis.optimized.layers;
    
    if (sizeDiff > 0) {
      console.log(`   ✅ 镜像大小减少: ${formatBytes(sizeDiff)} (${((sizeDiff / analysis.original.sizeBytes) * 100).toFixed(1)}%)`);
    } else if (sizeDiff < 0) {
      console.log(`   ❌ 镜像大小增加: ${formatBytes(-sizeDiff)} (${((-sizeDiff / analysis.original.sizeBytes) * 100).toFixed(1)}%)`);
    } else {
      console.log(`   ➖ 镜像大小无变化`);
    }
    
    if (layerDiff > 0) {
      console.log(`   ✅ 镜像层数减少: ${layerDiff} 层`);
    } else if (layerDiff < 0) {
      console.log(`   ❌ 镜像层数增加: ${-layerDiff} 层`);
    } else {
      console.log(`   ➖ 镜像层数无变化`);
    }
    
    console.log('');
  }
  
  // 分析Dockerfile
  console.log('📋 Dockerfile分析:');
  analysis.dockerfile = analyzeDockerfileLayers('Dockerfile');
  if (analysis.dockerfile) {
    console.log(`   📄 原始Dockerfile:`);
    console.log(`      总行数: ${analysis.dockerfile.totalLines}`);
    console.log(`      指令统计:`);
    for (const [instruction, count] of Object.entries(analysis.dockerfile.instructions)) {
      if (count > 0) {
        console.log(`        ${instruction}: ${count}`);
      }
    }
  }
  
  analysis.dockerfileOptimized = analyzeDockerfileLayers('Dockerfile.optimized');
  if (analysis.dockerfileOptimized) {
    console.log(`   📄 优化Dockerfile:`);
    console.log(`      总行数: ${analysis.dockerfileOptimized.totalLines}`);
    console.log(`      指令统计:`);
    for (const [instruction, count] of Object.entries(analysis.dockerfileOptimized.instructions)) {
      if (count > 0) {
        console.log(`        ${instruction}: ${count}`);
      }
    }
  }
  
  console.log('');
  
  // 生成建议
  console.log('💡 优化建议:');
  const suggestions = generateOptimizationSuggestions(analysis);
  if (suggestions.length > 0) {
    suggestions.forEach(suggestion => console.log(`   ${suggestion}`));
  } else {
    console.log('   ✅ 暂无额外优化建议');
  }
  
  console.log('');
  
  // 缓存分析
  console.log('🗄️ 构建缓存分析:');
  const cacheInfo = exec('docker system df');
  if (cacheInfo) {
    console.log(cacheInfo);
  }
  
  return analysis;
}

/**
 * 检查Docker环境
 */
function checkDockerEnvironment() {
  console.log('🔧 Docker环境检查:');
  
  // Docker版本
  const dockerVersion = exec('docker --version');
  if (dockerVersion) {
    console.log(`   Docker版本: ${dockerVersion}`);
  }
  
  // BuildKit支持
  const buildkitSupport = exec('docker buildx version');
  if (buildkitSupport) {
    console.log(`   ✅ BuildKit可用: ${buildkitSupport.split('\n')[0]}`);
  } else {
    console.log(`   ❌ BuildKit不可用`);
  }
  
  // 磁盘使用情况
  const diskUsage = exec('docker system df --format "table {{.Type}}\t{{.Total}}\t{{.Active}}\t{{.Size}}\t{{.Reclaimable}}"');
  if (diskUsage) {
    console.log(`   磁盘使用情况:`);
    diskUsage.split('\n').forEach(line => {
      if (line.trim()) {
        console.log(`      ${line}`);
      }
    });
  }
  
  console.log('');
}

// 如果作为脚本直接运行
if (require.main === module) {
  checkDockerEnvironment();
  analyzeDockerPerformance();
}

module.exports = {
  analyzeDockerPerformance,
  analyzeImage,
  analyzeDockerfileLayers,
  generateOptimizationSuggestions
};