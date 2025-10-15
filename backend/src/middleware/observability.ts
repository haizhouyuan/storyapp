import { Request, Response, NextFunction, RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import compression from 'compression';
import {
  httpRequestsInFlight,
  recordHttpMetrics,
  rateLimitHits,
  recordError 
} from '../config/metrics';
import { logHttpRequest, logError, createLogger } from '../config/logger';
import { securityConfig, rateLimitConfig } from '../config';
import { checkDatabaseHealth } from '../config/database';

const logger = createLogger('middleware');

const isTestEnvironment = process.env.NODE_ENV === 'test';

// Security middleware using Helmet
const baseHelmetOptions = {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
  crossOriginEmbedderPolicy: false,
  strictTransportSecurity: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
};

const userHelmetOptions = { ...(securityConfig.helmetOptions ?? {}) } as Record<string, unknown>;
const hstsOverride = userHelmetOptions.hsts;
delete userHelmetOptions.hsts;

const helmetOptions: Record<string, unknown> = {
  ...baseHelmetOptions,
  ...userHelmetOptions,
};

const disableUpgradeInsecure = process.env.DISABLE_UPGRADE_INSECURE === 'true' || isTestEnvironment;

if (hstsOverride === false || (isTestEnvironment && hstsOverride !== true)) {
  helmetOptions.strictTransportSecurity = false;
} else {
  helmetOptions.strictTransportSecurity = {
    ...(baseHelmetOptions.strictTransportSecurity as Record<string, unknown>),
    ...((hstsOverride as Record<string, unknown>) || {}),
  };
}

if (disableUpgradeInsecure) {
  const directives = (helmetOptions.contentSecurityPolicy as { directives?: Record<string, unknown> })?.directives;
  if (directives) {
    directives['upgrade-insecure-requests'] = null;
  }
}

export const securityMiddleware = helmet(helmetOptions as Parameters<typeof helmet>[0]);

// Compression middleware for response optimization
export const compressionMiddleware = compression({
  filter: (req: Request, res: Response) => {
    // Don't compress responses with this request header
    if (req.headers['x-no-compression']) {
      return false;
    }
    // Fallback to standard compression filter
    return compression.filter(req, res);
  },
  level: 6, // Compression level 1-9
  threshold: 1024, // Only compress if response is larger than 1KB
});

// Rate limiting middleware
const isRateLimitingDisabled = isTestEnvironment || process.env.DISABLE_RATE_LIMIT === '1';

const passthroughRateLimiter: RequestHandler = (_req, _res, next) => next();

export const createRateLimiter = (windowMs: number, max: number, message: string, keyPrefix: string) => {
  if (isRateLimitingDisabled) {
    return passthroughRateLimiter;
  }

  return rateLimit({
    windowMs,
    max,
    message: {
      success: false,
      error: message,
      retryAfter: Math.ceil(windowMs / 1000)
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req: Request, res: Response) => {
      const userId = (req as any).user?.id || 'anonymous';
      const endpoint = req.route?.path || req.path;
      
      // Record rate limit hit in metrics
      rateLimitHits.inc({ endpoint, user_id: userId });
      
      // Log rate limit hit
      logger.warn({
        userId,
        endpoint,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      }, `Rate limit exceeded for ${keyPrefix}`);
      
      recordError('rate_limit', endpoint, '429');
      
      res.status(429).json({
        success: false,
        error: message,
        retryAfter: Math.ceil(windowMs / 1000)
      });
    },
    keyGenerator: (req: Request) => {
      // Use user ID if authenticated, otherwise IP
      const userId = (req as any).user?.id;
      return userId ? `${keyPrefix}_user_${userId}` : `${keyPrefix}_ip_${req.ip}`;
    }
  });
};

// Different rate limiters for different endpoints
export const generalRateLimit = createRateLimiter(
  rateLimitConfig.general.windowMs,
  rateLimitConfig.general.max,
  'Too many requests, please try again later',
  'general'
);

export const authRateLimit = createRateLimiter(
  rateLimitConfig.auth.windowMs,
  rateLimitConfig.auth.max,
  'Too many login attempts, please try again later',
  'auth'
);

export const createProjectRateLimit = createRateLimiter(
  rateLimitConfig.createProject.windowMs,
  rateLimitConfig.createProject.max,
  'Too many project creations, please try again later',
  'create_project'
);

export const validationRateLimit = createRateLimiter(
  rateLimitConfig.validation.windowMs,
  rateLimitConfig.validation.max,
  'Too many validation requests, please try again later',
  'validation'
);

export const ttsRateLimit = createRateLimiter(
  rateLimitConfig.tts.windowMs,
  rateLimitConfig.tts.max,
  '语音合成请求过多，请稍后再试',
  'tts'
);

// HTTP metrics and logging middleware
export const httpMetricsMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  
  // Track requests in flight
  httpRequestsInFlight.inc({ method: req.method });
  
  // Set up response logging
  logHttpRequest(req, res);
  
  // Handle response completion
  const originalEnd = res.end.bind(res);
  res.end = function(chunk?: any, encoding?: any, callback?: () => void) {
    // Record metrics
    recordHttpMetrics(req, res, startTime);
    
    // Decrement in-flight counter
    httpRequestsInFlight.dec({ method: req.method });
    
    // Call original end with proper return
    return originalEnd(chunk, encoding, callback);
  };
  
  next();
};

// Error handling middleware with metrics
export const errorMetricsMiddleware = (error: Error, req: Request, res: Response, next: NextFunction) => {
  const endpoint = req.route?.path || req.path;
  const statusCode = (error as any).status || (error as any).statusCode || 500;
  
  // Record error metrics
  recordError(error.name || 'UnknownError', endpoint, statusCode.toString());
  
  // Log error with context
  logError(error, {
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: (req as any).user?.id
  });
  
  // Don't send error details in production
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  res.status(statusCode).json({
    success: false,
    error: isDevelopment ? error.message : 'Internal server error',
    ...(isDevelopment && { stack: error.stack })
  });
};

// Request ID middleware for tracing
export const requestIdMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const requestId = req.get('X-Request-ID') || 
                   req.get('X-Correlation-ID') || 
                   Math.random().toString(36).substring(2, 15);
  
  // Add request ID to request object
  (req as any).requestId = requestId;
  
  // Add request ID to response headers
  res.setHeader('X-Request-ID', requestId);
  
  // Create logger with request context
  (req as any).logger = createLogger('request').child({ requestId });
  
  next();
};

// Health check middleware (doesn't need auth)
export const healthCheckMiddleware = (req: Request, res: Response, next: NextFunction) => {
  if (req.path === '/healthz' || req.path === '/api/health' || req.path === '/health') {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development'
    };
    
    res.status(200).json(health);
    return;
  }
  
  next();
};

// Ready check middleware (checks database connectivity)
export const readyCheckMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  if (req.path === '/api/ready' || req.path === '/ready') {
    try {
      const databaseHealthy = await checkDatabaseHealth();
      const memoryHealthy =
        process.memoryUsage().heapUsed / process.memoryUsage().heapTotal < 0.9;

      const ready = {
        status: databaseHealthy && memoryHealthy ? 'ready' : 'degraded',
        timestamp: new Date().toISOString(),
        checks: {
          database: databaseHealthy ? 'healthy' : 'unhealthy',
          memory: memoryHealthy ? 'healthy' : 'warning',
        },
      };

      const allHealthy = Object.values(ready.checks).every((check) => check === 'healthy');
      res.status(allHealthy ? 200 : 503).json(ready);
      return;
    } catch (error) {
      logger.error(
        {
          error: error as Error,
          requestId: (req as any).requestId,
        },
        'Ready check failed',
      );
      res.status(503).json({
        status: 'not ready',
        timestamp: new Date().toISOString(),
        error: 'Service checks failed',
      });
      return;
    }
  }

  next();
};

// Metrics endpoint middleware
export const metricsMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  if (req.path === '/metrics') {
    try {
      const { register } = await import('../config/metrics');
      res.set('Content-Type', register.contentType);
      res.end(await register.metrics());
      return;
    } catch (error) {
      res.status(500).json({ error: 'Failed to generate metrics' });
      return;
    }
  }
  
  next();
};
