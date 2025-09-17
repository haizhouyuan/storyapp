import pino from 'pino';
import pretty from 'pino-pretty';

// Environment-based log level
const logLevel = process.env.LOG_LEVEL || 'info';
const nodeEnv = process.env.NODE_ENV || 'development';

// Create logger configuration
const loggerConfig = {
  level: logLevel,
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label: string) => ({
      level: label.toUpperCase()
    }),
  },
  serializers: {
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
    err: pino.stdSerializers.err,
  },
  base: {
    pid: process.pid,
    hostname: process.env.HOSTNAME || require('os').hostname(),
    service: 'storyapp-backend',
    version: process.env.npm_package_version || '1.0.0',
    environment: nodeEnv,
  },
};

// For development, use pretty printing
let logger: pino.Logger;

if (nodeEnv === 'development') {
  const stream = pretty({
    colorize: true,
    translateTime: 'yyyy-mm-dd HH:MM:ss',
    ignore: 'pid,hostname,service,version,environment',
    messageFormat: '[{service}] {msg}',
    // customPrettifiers: {
    //   time: (timestamp: string) => `🕒 ${timestamp}`,
    // },
  });
  
  logger = pino(loggerConfig, stream);
} else {
  // Production: structured JSON logs
  logger = pino(loggerConfig);
}

// Add custom methods for different contexts
export const createLogger = (component: string) => {
  return logger.child({ component });
};

// Export the main logger
export default logger;

// Helper functions for common logging patterns
export const logHttpRequest = (req: any, res: any) => {
  const startTime = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const logData = {
      method: req.method,
      url: req.originalUrl || req.url,
      status: res.statusCode,
      userAgent: req.get('User-Agent'),
      ip: req.ip || req.connection.remoteAddress,
      duration: `${duration}ms`,
      contentLength: res.get('Content-Length'),
    };

    if (res.statusCode >= 400) {
      logger.warn(logData, `${req.method} ${req.url} ${res.statusCode} - ${duration}ms`);
    } else {
      logger.info(logData, `${req.method} ${req.url} ${res.statusCode} - ${duration}ms`);
    }
  });
};

export const logError = (error: Error, context?: any) => {
  logger.error({
    err: error,
    context,
    stack: error.stack,
  }, `Error: ${error.message}`);
};

export const logValidationError = (errors: string[], context?: any) => {
  logger.warn({
    validationErrors: errors,
    context,
  }, `Validation failed: ${errors.join(', ')}`);
};

export const logServiceOperation = (operation: string, data: any, duration?: number) => {
  logger.info({
    operation,
    data: typeof data === 'object' ? JSON.stringify(data) : data,
    duration: duration ? `${duration}ms` : undefined,
  }, `Service operation: ${operation}`);
};