/**
 * 集中化环境变量加载器
 * 统一管理所有环境变量加载逻辑，确保只在一处加载
 */

const fs = require('fs');
const path = require('path');

// 全局加载状态
let isLoaded = false;
let loadedConfig = null;

/**
 * 按优先级顺序查找并加载环境文件
 */
function findAndLoadEnvFiles() {
  if (isLoaded && loadedConfig) {
    return loadedConfig;
  }

  const rootDir = path.resolve(__dirname, '..');
  const envNameRaw = typeof process.env.NODE_ENV === 'string' ? process.env.NODE_ENV.trim() : '';
  const envName = envNameRaw || 'development';
  if (!envNameRaw) {
    process.env.NODE_ENV = envName;
  }
  
  // 环境文件优先级顺序
  const envFiles = [
    // 1. 特定环境文件（最高优先级）
    `.env.${envName}.local`,
    `.env.${envName}`,
    
    // 2. 通用本地文件
    '.env.local',
    
    // 3. 通用环境文件
    '.env'
  ];

  const loadedEnvs = [];
  const config = {};
  
  console.log('🔧 开始加载环境配置...');
  console.log(`当前环境: ${envName}`);
  console.log(`项目根目录: ${rootDir}`);
  
  for (const envFile of envFiles) {
    const envPath = path.join(rootDir, envFile);
    
    if (fs.existsSync(envPath)) {
      try {
        console.log(`✅ 加载环境文件: ${envFile}`);
        
        // 读取环境文件内容
        const envContent = fs.readFileSync(envPath, 'utf8');
        const envVars = parseEnvContent(envContent);
        
        // 合并配置（不覆盖已存在的值）
        Object.keys(envVars).forEach(key => {
          if (!(key in process.env)) {
            process.env[key] = envVars[key];
            config[key] = envVars[key];
          }
        });
        
        loadedEnvs.push({
          file: envFile,
          path: envPath,
          varsCount: Object.keys(envVars).length
        });
        
      } catch (error) {
        console.warn(`⚠️ 加载环境文件失败: ${envFile} - ${error.message}`);
      }
    }
  }
  
  // 验证关键环境变量
  validateRequiredEnvVars();
  
  // 记录加载结果
  console.log('📊 环境配置加载完成:');
  loadedEnvs.forEach(env => {
    console.log(`  - ${env.file}: ${env.varsCount} 个变量`);
  });
  
  // 设置默认值
  setDefaultValues(config);
  
  isLoaded = true;
  loadedConfig = {
    files: loadedEnvs,
    config: config,
    loadedAt: new Date().toISOString()
  };
  
  return loadedConfig;
}

/**
 * 解析环境文件内容
 */
function parseEnvContent(content) {
  const envVars = {};
  
  content.split('\n').forEach(line => {
    line = line.trim();
    
    // 跳过注释和空行
    if (!line || line.startsWith('#') || line.startsWith('//')) {
      return;
    }
    
    // 解析 KEY=VALUE 格式
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      let [, key, value] = match;
      key = key.trim();
      value = value.trim();
      
      // 去除引号
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      
      envVars[key] = value;
    }
  });
  
  return envVars;
}

function toNumber(value, fallback) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

/**
 * 验证必需的环境变量
 */
function validateRequiredEnvVars() {
  const required = {
    // 生产环境必需
    production: [
      'DEEPSEEK_API_KEY',
      'MONGODB_URI'
    ],
    
    // 开发环境推荐
    development: [
      'DEEPSEEK_API_KEY'
    ],
    
    // 测试环境可选（可使用Mock）
    test: []
  };
  
  const currentEnv = process.env.NODE_ENV || 'development';
  const requiredVars = required[currentEnv] || [];
  
  const missing = requiredVars.filter(varName => !process.env[varName]);
  
  if (missing.length > 0) {
    const severity = currentEnv === 'production' ? 'ERROR' : 'WARN';
    console[severity === 'ERROR' ? 'error' : 'warn'](
      `${severity}: 缺少${currentEnv}环境必需的环境变量: ${missing.join(', ')}`
    );
    
    if (currentEnv === 'production' && severity === 'ERROR') {
      throw new Error(`生产环境缺少必需的环境变量: ${missing.join(', ')}`);
    }
  }
}

/**
 * 设置默认值
 */
function setDefaultValues(config) {
  const defaults = {
    // 服务器配置
    PORT: '5000',
    HOST: '0.0.0.0',
    NODE_ENV: 'development',
    
    // 前端配置
    FRONTEND_URL: 'http://localhost:3000',
    
    // 数据库配置
    MONGODB_URI: 'mongodb://localhost:27017',
    MONGODB_DB_NAME: 'storyapp',
    MONGO_REPLICA_SET: 'storyapp-rs',
    MONGODB_MAX_POOL_SIZE: '50',
    MONGODB_MIN_POOL_SIZE: '5',
    MONGODB_MAX_IDLE_TIME_MS: '30000',
    MONGODB_CONNECT_TIMEOUT_MS: '20000',
    MONGODB_SOCKET_TIMEOUT_MS: '60000',
    MONGODB_SERVER_SELECTION_TIMEOUT_MS: '30000',
    MONGODB_RETRY_WRITES: 'true',
    MONGODB_READ_PREFERENCE: 'primaryPreferred',

    // API配置
    DEEPSEEK_API_URL: 'https://api.deepseek.com',
    
    // 日志配置
    LOG_LEVEL: 'info',
    ENABLE_DB_LOGGING: 'true',
    ENABLE_DETAILED_LOGGING: 'true',
    LOG_RETENTION_DAYS: '30',

    // 限流配置
    RATE_LIMIT_WINDOW_MS: process.env.NODE_ENV === 'test' ? '300000' : '900000',
    RATE_LIMIT_MAX_REQUESTS: process.env.NODE_ENV === 'test' ? '1000' : '100',

    // TTS 配置默认值
    TTS_PROVIDER: 'mock',
    TTS_CACHE_TTL: '300',
    TTS_RATE_LIMIT_WINDOW: '60000',
    TTS_RATE_LIMIT_MAX: '10',
    TTS_AUDIO_BASE_URL: 'http://localhost:5001/static/tts',

    // React App 默认值
    REACT_APP_API_URL: 'http://localhost:5000/api',
    REACT_APP_VERSION: '1.0.0',
    REACT_APP_DEBUG: 'true'
  };
  
  Object.keys(defaults).forEach(key => {
    if (!(key in process.env)) {
      process.env[key] = defaults[key];
      config[key] = defaults[key];
    }
  });
}

/**
 * 获取配置信息（用于调试）
 */
function getConfigInfo() {
  return loadedConfig || findAndLoadEnvFiles();
}

/**
 * 重置加载状态（仅用于测试）
 */
function resetLoadState() {
  if (process.env.NODE_ENV === 'test') {
    isLoaded = false;
    loadedConfig = null;
  }
}

/**
 * 导出类型化配置对象
 */
function getTypedConfig() {
  // 确保配置已加载
  findAndLoadEnvFiles();
  
  return {
    server: {
      port: parseInt(process.env.PORT || '5000', 10),
      host: process.env.HOST || '0.0.0.0',
      nodeEnv: process.env.NODE_ENV || 'development',
      frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000'
    },
    
    database: {
      uri: process.env.MONGODB_URI || 'mongodb://localhost:27017',
      name: process.env.MONGODB_DB_NAME || 'storyapp',
      replicaSet: process.env.MONGO_REPLICA_SET,
      authSource: process.env.MONGODB_AUTH_SOURCE || 'admin',
      options: {
        maxPoolSize: toNumber(process.env.MONGODB_MAX_POOL_SIZE, 50),
        minPoolSize: toNumber(process.env.MONGODB_MIN_POOL_SIZE, 5),
        maxIdleTimeMS: toNumber(process.env.MONGODB_MAX_IDLE_TIME_MS, 30000),
        connectTimeoutMS: toNumber(process.env.MONGODB_CONNECT_TIMEOUT_MS, 20000),
        socketTimeoutMS: toNumber(process.env.MONGODB_SOCKET_TIMEOUT_MS, 60000),
        serverSelectionTimeoutMS: toNumber(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS, 30000),
        readPreference: process.env.MONGODB_READ_PREFERENCE || 'primaryPreferred',
        tls: process.env.MONGODB_TLS === 'true' || !!process.env.MONGODB_TLS_CA_FILE,
        tlsCAFile: process.env.MONGODB_TLS_CA_FILE,
      }
    },
    
    api: {
      deepseek: {
        apiKey: process.env.DEEPSEEK_API_KEY,
        apiUrl: process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com'
      }
    },
    
    logging: {
      level: process.env.LOG_LEVEL || 'info',
      enableDbLogging: process.env.ENABLE_DB_LOGGING !== 'false',
      enableDetailedLogging: process.env.ENABLE_DETAILED_LOGGING !== 'false',
      retentionDays: parseInt(process.env.LOG_RETENTION_DAYS || '30', 10)
    },
    
    rateLimit: {
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
      max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10)
    },
    
    frontend: {
      apiUrl: process.env.REACT_APP_API_URL || 'http://localhost:5000/api',
      version: process.env.REACT_APP_VERSION || '1.0.0',
      debug: process.env.REACT_APP_DEBUG === 'true'
    }
  };
}

// 立即加载配置（当模块被导入时）
findAndLoadEnvFiles();

module.exports = {
  loadEnvConfig: findAndLoadEnvFiles,
  getConfigInfo,
  getTypedConfig,
  resetLoadState, // 仅用于测试
};

// 如果作为独立脚本运行，显示配置信息
if (require.main === module) {
  console.log('🔧 环境配置加载器');
  console.log('====================');
  
  const info = getConfigInfo();
  const typed = getTypedConfig();
  
  console.log('\n📁 加载的文件:');
  info.files.forEach(file => {
    console.log(`  ${file.file} (${file.varsCount} vars)`);
  });
  
  console.log('\n⚙️ 类型化配置:');
  console.log(JSON.stringify(typed, (key, value) => {
    // 隐藏敏感信息
    if (key.toLowerCase().includes('key') || key.toLowerCase().includes('secret')) {
      return value ? '[HIDDEN]' : undefined;
    }
    return value;
  }, 2));
  
  console.log(`\n✅ 配置加载时间: ${info.loadedAt}`);
}
