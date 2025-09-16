// Temporarily simplified for build fix
// TODO: Restore full OpenAPI configuration after fixing zod-to-openapi version compatibility

import { config } from './index';

// Temporary placeholder to fix build
export const generateOpenApiSpec = () => {
  return {
    openapi: '3.0.0',
    info: {
      title: 'Story Workflow API',
      version: '1.0.0',
      description: 'API for story creation workflow management'
    },
    servers: [
      {
        url: 'http://localhost:5000',
        description: 'Development server'
      }
    ],
    paths: {
      '/api/health': {
        get: {
          tags: ['System'],
          summary: 'Health check',
          responses: {
            '200': {
              description: 'Server is healthy',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      status: { type: 'string', example: 'ok' },
                      timestamp: { type: 'string', example: '2025-09-12T06:25:47.154Z' }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    components: {
      schemas: {
        ApiError: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: { type: 'string', example: 'Error message' },
            details: { type: 'object' }
          }
        }
      },
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      }
    }
  };
};

// Export default spec
export default generateOpenApiSpec();
export const openApiDocument = generateOpenApiSpec();