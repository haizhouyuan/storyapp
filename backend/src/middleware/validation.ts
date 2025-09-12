import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { logValidationError, createLogger } from '../config/logger';
import { recordError } from '../config/metrics';

const logger = createLogger('validation');

export interface ValidationResult {
  success: boolean;
  data?: any;
  errors?: string[];
}

/**
 * Middleware factory for Zod validation
 * @param schema - Zod schema to validate against
 * @param target - What to validate: 'body' | 'query' | 'params'
 * @param options - Validation options
 */
export const validateSchema = (
  schema: ZodSchema,
  target: 'body' | 'query' | 'params' = 'body',
  options: {
    allowUnknown?: boolean;
    stripUnknown?: boolean;
    abortEarly?: boolean;
  } = {}
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const dataToValidate = req[target];
      
      // Parse and validate using Zod
      const result = schema.parse(dataToValidate);
      
      // If stripUnknown is enabled, replace the request data with validated data
      if (options.stripUnknown) {
        req[target] = result;
      }
      
      // Add validated data to request for use in handlers
      (req as any).validated = {
        ...((req as any).validated || {}),
        [target]: result
      };
      
      logger.debug({
        target,
        originalData: dataToValidate,
        validatedData: result,
        requestId: (req as any).requestId
      }, 'Schema validation successful');
      
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const validationErrors = error.errors.map(err => {
          const path = err.path.length > 0 ? err.path.join('.') : 'root';
          return `${path}: ${err.message}`;
        });
        
        const endpoint = req.route?.path || req.path;
        
        // Log validation error with context
        logValidationError(validationErrors, {
          target,
          endpoint,
          method: req.method,
          data: req[target],
          requestId: (req as any).requestId
        });
        
        // Record metrics
        recordError('validation', endpoint, '400');
        
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          errors: validationErrors,
          details: options.abortEarly === false ? error.errors : undefined
        });
      }
      
      // Handle unexpected errors
      logger.error({
        error: error as Error,
        target,
        requestId: (req as any).requestId
      }, 'Unexpected validation error');
      
      recordError('validation_system', req.route?.path || req.path, '500');
      
      return res.status(500).json({
        success: false,
        error: 'Internal validation error'
      });
    }
  };
};

/**
 * Validate request body
 */
export const validateBody = (schema: ZodSchema, options?: Parameters<typeof validateSchema>[2]) => {
  return validateSchema(schema, 'body', options);
};

/**
 * Validate query parameters
 */
export const validateQuery = (schema: ZodSchema, options?: Parameters<typeof validateSchema>[2]) => {
  return validateSchema(schema, 'query', options);
};

/**
 * Validate URL parameters
 */
export const validateParams = (schema: ZodSchema, options?: Parameters<typeof validateSchema>[2]) => {
  return validateSchema(schema, 'params', options);
};

/**
 * Transform and preprocess data before validation
 */
export const preprocessData = (target: 'body' | 'query' | 'params' = 'body') => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = req[target];
      
      if (target === 'query') {
        // Convert query string values to appropriate types
        const processed = { ...data };
        
        // Convert numeric strings to numbers
        Object.keys(processed).forEach(key => {
          const value = processed[key];
          if (typeof value === 'string') {
            // Try to convert to number if it looks numeric
            if (/^\d+$/.test(value)) {
              processed[key] = parseInt(value, 10);
            } else if (/^\d+\.\d+$/.test(value)) {
              processed[key] = parseFloat(value);
            }
            // Convert boolean strings
            else if (value === 'true') {
              processed[key] = true;
            } else if (value === 'false') {
              processed[key] = false;
            }
            // Convert null/undefined strings
            else if (value === 'null') {
              processed[key] = null;
            } else if (value === 'undefined') {
              processed[key] = undefined;
            }
          }
        });
        
        req[target] = processed;
      }
      
      if (target === 'body' && typeof data === 'object' && data !== null) {
        // Preprocess dates
        const processed = JSON.parse(JSON.stringify(data), (key, value) => {
          // Convert ISO date strings to Date objects
          if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
            return new Date(value);
          }
          return value;
        });
        
        req[target] = processed;
      }
      
      next();
    } catch (error) {
      logger.error({
        error: error as Error,
        target,
        requestId: (req as any).requestId
      }, 'Data preprocessing error');
      
      return res.status(400).json({
        success: false,
        error: 'Invalid data format'
      });
    }
  };
};

/**
 * Custom validation for specific use cases
 */
export const customValidation = {
  /**
   * Validate ObjectId format
   */
  objectId: (field: string = 'id') => {
    return (req: Request, res: Response, next: NextFunction) => {
      const value = req.params[field] || req.body[field] || req.query[field];
      
      if (value && typeof value === 'string') {
        // MongoDB ObjectId format: 24 character hex string
        if (!/^[0-9a-fA-F]{24}$/.test(value)) {
          return res.status(400).json({
            success: false,
            error: 'Invalid ID format',
            field
          });
        }
      }
      
      next();
    };
  },
  
  /**
   * Validate project ownership or collaboration
   */
  projectAccess: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const projectId = req.params.projectId || req.params.id;
      const userId = (req as any).user?.id;
      
      if (!projectId || !userId) {
        return res.status(400).json({
          success: false,
          error: 'Missing project ID or user authentication'
        });
      }
      
      // TODO: Implement actual project access check with database
      // const project = await getProjectById(projectId);
      // if (!project) {
      //   return res.status(404).json({
      //     success: false,
      //     error: 'Project not found'
      //   });
      // }
      // 
      // const hasAccess = project.ownerId === userId || 
      //   project.collaborators.some(c => c.userId === userId);
      // 
      // if (!hasAccess) {
      //   return res.status(403).json({
      //     success: false,
      //     error: 'Access denied'
      //   });
      // }
      
      next();
    } catch (error) {
      logger.error({
        error: error as Error,
        projectId: req.params.projectId || req.params.id,
        userId: (req as any).user?.id,
        requestId: (req as any).requestId
      }, 'Project access validation error');
      
      return res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  },
  
  /**
   * Validate workflow stage transitions
   */
  stageTransition: (req: Request, res: Response, next: NextFunction) => {
    const currentStage = req.body.currentStage;
    const targetStage = req.body.targetStage || req.params.stage;
    
    if (!currentStage || !targetStage) {
      next();
      return;
    }
    
    // TODO: Implement stage transition validation logic
    // const isValidTransition = validateStageTransition(currentStage, targetStage);
    // if (!isValidTransition) {
    //   return res.status(400).json({
    //     success: false,
    //     error: `Invalid stage transition from ${currentStage} to ${targetStage}`
    //   });
    // }
    
    next();
  }
};

/**
 * Parse and validate complex data structures
 */
export const parseComplexData = {
  /**
   * Parse JSON fields that might be sent as strings
   */
  jsonFields: (fields: string[]) => {
    return (req: Request, res: Response, next: NextFunction) => {
      try {
        fields.forEach(field => {
          const value = req.body[field];
          if (typeof value === 'string') {
            try {
              req.body[field] = JSON.parse(value);
            } catch {
              // If parsing fails, leave as string and let schema validation handle it
            }
          }
        });
        next();
      } catch (error) {
        return res.status(400).json({
          success: false,
          error: 'Invalid JSON data format'
        });
      }
    };
  },
  
  /**
   * Parse array fields that might be sent as comma-separated strings
   */
  arrayFields: (fields: string[]) => {
    return (req: Request, res: Response, next: NextFunction) => {
      fields.forEach(field => {
        const value = req.query[field] || req.body[field];
        if (typeof value === 'string' && value.includes(',')) {
          const target = req.query[field] ? req.query : req.body;
          target[field] = value.split(',').map(s => s.trim()).filter(Boolean);
        }
      });
      next();
    };
  }
};

// Utility function to get validation errors in a consistent format
export const formatValidationErrors = (error: ZodError): string[] => {
  return error.errors.map(err => {
    const path = err.path.length > 0 ? err.path.join('.') : 'root';
    return `${path}: ${err.message}`;
  });
};

// Utility function to validate data without middleware
export const validateData = <T>(schema: ZodSchema<T>, data: unknown): ValidationResult => {
  try {
    const result = schema.parse(data);
    return {
      success: true,
      data: result
    };
  } catch (error) {
    if (error instanceof ZodError) {
      return {
        success: false,
        errors: formatValidationErrors(error)
      };
    }
    return {
      success: false,
      errors: ['Unexpected validation error']
    };
  }
};