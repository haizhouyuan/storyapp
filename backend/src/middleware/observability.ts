import { Request, Response, NextFunction } from 'express';
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

const logger = createLogger('middleware');

// Security middleware using Helmet
export const securityMiddleware = helmet({
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
  crossOriginEmbedderPolicy: false, // 允许嵌入
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
});

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
export const createRateLimiter = (windowMs: number, max: number, message: string, keyPrefix: string) => {
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
  15 * 60 * 1000, // 15 minutes
  100, // 100 requests per window
  'Too many requests, please try again later',
  'general'
);

export const authRateLimit = createRateLimiter(
  15 * 60 * 1000, // 15 minutes  
  5, // 5 login attempts per window
  'Too many login attempts, please try again later',
  'auth'
);

export const createProjectRateLimit = createRateLimiter(
  60 * 60 * 1000, // 1 hour
  10, // 10 project creations per hour
  'Too many project creations, please try again later',
  'create_project'
);

export const validationRateLimit = createRateLimiter(
  5 * 60 * 1000, // 5 minutes
  20, // 20 validation requests per 5 minutes
  'Too many validation requests, please try again later',
  'validation'
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
  if (req.path === '/api/health' || req.path === '/health') {
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
      // TODO: Add actual database connectivity check
      const ready = {
        status: 'ready',
        timestamp: new Date().toISOString(),
        checks: {
          database: 'healthy', // Will be implemented when we add real DB
          memory: process.memoryUsage().heapUsed / process.memoryUsage().heapTotal < 0.9 ? 'healthy' : 'warning'
        }
      };
      
      const allHealthy = Object.values(ready.checks).every(check => check === 'healthy');
      res.status(allHealthy ? 200 : 503).json(ready);
      return;
    } catch (error) {
      res.status(503).json({
        status: 'not ready',
        timestamp: new Date().toISOString(),
        error: 'Service checks failed'
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