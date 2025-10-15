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
      },

      '/api/projects': {
        post: {
          tags: ['Projects'],
          summary: 'Create project',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    title: { type: 'string' },
                    locale: { type: 'string' },
                    protagonist: { type: 'object' },
                    constraints: { type: 'object' }
                  },
                  required: ['title']
                }
              }
            }
          },
          responses: { '200': { description: 'OK' } }
        }
      },

      '/api/projects/{projectId}/plan': {
        post: {
          tags: ['Projects'],
          summary: 'Plan blueprint (DetectiveOutline)',
          parameters: [ { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } } ],
          requestBody: {
            required: false,
            content: { 'application/json': { schema: { type: 'object', properties: { topic: { type: 'string' }, profile: { type: 'string' }, seed: { type: 'string' }, options: { type: 'object' } } } } }
          },
          responses: { '200': { description: 'OK' } }
        }
      },

      '/api/projects/{projectId}/write': {
        post: {
          tags: ['Writer'],
          summary: 'Write a scene chapter',
          parameters: [
            { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'scene_id', in: 'query', required: true, schema: { type: 'string', example: 'S3' } }
          ],
          responses: { '200': { description: 'OK' }, '422': { description: 'Words out of range' }, '502': { description: 'Schema invalid' } }
        }
      },

      '/api/projects/{projectId}/edit': {
        post: {
          tags: ['Editor'],
          summary: 'Edit a scene chapter (grading and sanitization)',
          parameters: [ { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }, { name: 'scene_id', in: 'query', required: false, schema: { type: 'string' } } ],
          requestBody: {
            required: false,
            content: { 'application/json': { schema: { type: 'object', properties: { chapter: { type: 'object' } } } } }
          },
          responses: { '200': { description: 'OK' }, '502': { description: 'Schema invalid' } }
        }
      },

      '/api/blueprints/{blueprintId}': {
        get: {
          tags: ['Blueprints'],
          summary: 'Get blueprint outline by blueprintId',
          parameters: [ { name: 'blueprintId', in: 'path', required: true, schema: { type: 'string' } } ],
          responses: { '200': { description: 'OK' }, '404': { description: 'Not found' } }
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