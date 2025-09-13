// 直接使用dotenv加载环境变量
import dotenv from 'dotenv';
dotenv.config();

// Configuration object using environment variables
export const config = {
  // Server configuration
  server: {
    port: parseInt(process.env.PORT || '5000', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  },

  // Logging configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    enableDetailedLogging: process.env.ENABLE_DETAILED_LOGGING === 'true',
    enableDbLogging: process.env.ENABLE_DB_LOGGING === 'true',
    retentionDays: parseInt(process.env.LOG_RETENTION_DAYS || '30', 10),
    format: process.env.LOG_FORMAT || 'json', // json | pretty
  },

  // Rate limiting configuration
  rateLimit: {
    general: {
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 minutes
      max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
    },
    auth: {
      windowMs: parseInt(process.env.RATE_LIMIT_AUTH_WINDOW_MS || '900000', 10), // 15 minutes
      max: parseInt(process.env.RATE_LIMIT_AUTH_MAX || '5', 10),
    },
    createProject: {
      windowMs: parseInt(process.env.RATE_LIMIT_CREATE_PROJECT_WINDOW_MS || '3600000', 10), // 1 hour
      max: parseInt(process.env.RATE_LIMIT_CREATE_PROJECT_MAX || '10', 10),
    },
    validation: {
      windowMs: parseInt(process.env.RATE_LIMIT_VALIDATION_WINDOW_MS || '300000', 10), // 5 minutes
      max: parseInt(process.env.RATE_LIMIT_VALIDATION_MAX || '20', 10),
    },
  },

  // Security configuration
  security: {
    trustProxy: process.env.TRUST_PROXY === 'true',
    corsOrigins: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
    helmetOptions: {
      hsts: {
        maxAge: parseInt(process.env.HSTS_MAX_AGE || '31536000', 10), // 1 year
        includeSubDomains: process.env.HSTS_INCLUDE_SUBDOMAINS === 'true',
        preload: process.env.HSTS_PRELOAD === 'true',
      },
    },
  },

  // Database configuration
  database: {
    url: process.env.MONGODB_URI || 'mongodb://localhost:27017',
    name: process.env.MONGODB_DB_NAME || 'storyapp',
    options: {
      maxPoolSize: parseInt(process.env.DB_MAX_POOL_SIZE || '10', 10),
      minPoolSize: parseInt(process.env.DB_MIN_POOL_SIZE || '5', 10),
      maxIdleTimeMS: parseInt(process.env.DB_MAX_IDLE_TIME_MS || '30000', 10),
      serverSelectionTimeoutMS: parseInt(process.env.DB_SERVER_SELECTION_TIMEOUT_MS || '5000', 10),
    },
  },

  // Metrics configuration
  metrics: {
    enabled: process.env.METRICS_ENABLED !== 'false',
    endpoint: process.env.METRICS_ENDPOINT || '/metrics',
    memoryUpdateInterval: parseInt(process.env.METRICS_MEMORY_UPDATE_INTERVAL || '30000', 10),
  },

  // Health check configuration
  health: {
    endpoint: process.env.HEALTH_ENDPOINT || '/api/health',
    readyEndpoint: process.env.READY_ENDPOINT || '/api/ready',
  },

  // Application configuration
  app: {
    name: process.env.APP_NAME || 'storyapp-backend',
    version: process.env.npm_package_version || '1.0.0',
    description: process.env.APP_DESCRIPTION || 'Story creation workflow backend API',
  },

  // Feature flags
  features: {
    enableMetrics: process.env.FEATURE_METRICS !== 'false',
    enableTracing: process.env.FEATURE_TRACING === 'true',
    enableDetailedErrors: (process.env.NODE_ENV || 'development') === 'development',
  },

  // API配置
  api: {
    deepseek: {
      apiKey: process.env.DEEPSEEK_API_KEY || '',
      apiUrl: process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com',
      model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
      maxTokens: parseInt(process.env.DEEPSEEK_MAX_TOKENS || '4000', 10),
      temperature: parseFloat(process.env.DEEPSEEK_TEMPERATURE || '0.7'),
    },
  },
};

// Validation function
export const validateConfig = () => {
  const errors: string[] = [];

  // Validate required environment variables
  if (!process.env.NODE_ENV) {
    errors.push('NODE_ENV is not set');
  }

  if (config.server.port < 1 || config.server.port > 65535) {
    errors.push('PORT must be between 1 and 65535');
  }

  if (config.rateLimit.general.max <= 0) {
    errors.push('Rate limit max must be greater than 0');
  }

  // Add more validations as needed

  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
  }
};

// Export individual config sections for convenience
export const {
  server: serverConfig,
  logging: loggingConfig,
  rateLimit: rateLimitConfig,
  security: securityConfig,
  database: databaseConfig,
  metrics: metricsConfig,
  health: healthConfig,
  app: appConfig,
  features: featureConfig,
} = config;

export default config;