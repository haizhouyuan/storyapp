import { OpenAPIRegistry, OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';
import { WorkflowSchemas } from '@storyapp/shared';
import { config } from './index';

// Create the OpenAPI registry
const registry = new OpenAPIRegistry();

// Register common components
registry.registerComponent('ApiError', WorkflowSchemas.ApiResponseSchema(undefined));
registry.registerComponent('ValidationError', {
  type: 'object',
  properties: {
    success: { type: 'boolean', example: false },
    errors: {
      type: 'array',
      items: { type: 'string' },
      example: ['Title is required', 'Invalid genre tag']
    },
    message: { type: 'string', example: 'Validation failed' }
  }
});

// Security schemes
registry.registerComponent('BearerAuth', {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'JWT'
});

// ========== Project Management APIs ==========

// POST /api/workflow/projects - Create Project
registry.registerPath({
  method: 'post',
  path: '/api/workflow/projects',
  tags: ['Projects'],
  summary: 'Create a new story project',
  description: 'Initialize a new story creation project with basic information',
  security: [{ BearerAuth: [] }],
  requestBody: {
    required: true,
    content: {
      'application/json': {
        schema: WorkflowSchemas.CreateProjectRequestSchema
      }
    }
  },
  responses: {
    201: {
      description: 'Project created successfully',
      content: {
        'application/json': {
          schema: WorkflowSchemas.CreateProjectResponseSchema
        }
      }
    },
    400: {
      description: 'Validation error',
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/ValidationError' }
        }
      }
    },
    401: {
      description: 'Authentication required',
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/ApiError' }
        }
      }
    },
    429: {
      description: 'Rate limit exceeded',
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/ApiError' }
        }
      }
    }
  }
});

// GET /api/workflow/projects - List Projects
registry.registerPath({
  method: 'get',
  path: '/api/workflow/projects',
  tags: ['Projects'],
  summary: 'List user projects',
  description: 'Retrieve a paginated list of projects for the authenticated user',
  security: [{ BearerAuth: [] }],
  parameters: [
    {
      name: 'page',
      in: 'query',
      description: 'Page number (1-based)',
      schema: { type: 'integer', minimum: 1, default: 1 }
    },
    {
      name: 'limit',
      in: 'query', 
      description: 'Number of items per page',
      schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 }
    },
    {
      name: 'q',
      in: 'query',
      description: 'Search query',
      schema: { type: 'string' }
    },
    {
      name: 'sort',
      in: 'query',
      description: 'Sort field',
      schema: { type: 'string', enum: ['createdAt', 'updatedAt', 'title'], default: 'updatedAt' }
    },
    {
      name: 'order',
      in: 'query',
      description: 'Sort order',
      schema: { type: 'string', enum: ['asc', 'desc'], default: 'desc' }
    }
  ],
  responses: {
    200: {
      description: 'Projects retrieved successfully',
      content: {
        'application/json': {
          schema: WorkflowSchemas.ApiResponseSchema(
            WorkflowSchemas.PaginatedResponseSchema(WorkflowSchemas.ProjectSchema)
          )
        }
      }
    },
    401: {
      description: 'Authentication required',
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/ApiError' }
        }
      }
    }
  }
});

// GET /api/workflow/projects/{id} - Get Project
registry.registerPath({
  method: 'get',
  path: '/api/workflow/projects/{id}',
  tags: ['Projects'],
  summary: 'Get project details',
  description: 'Retrieve detailed information about a specific project',
  security: [{ BearerAuth: [] }],
  parameters: [
    {
      name: 'id',
      in: 'path',
      required: true,
      description: 'Project ID',
      schema: { type: 'string' }
    }
  ],
  responses: {
    200: {
      description: 'Project retrieved successfully',
      content: {
        'application/json': {
          schema: WorkflowSchemas.ApiResponseSchema(WorkflowSchemas.ProjectSchema)
        }
      }
    },
    404: {
      description: 'Project not found',
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/ApiError' }
        }
      }
    },
    401: {
      description: 'Authentication required',
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/ApiError' }
        }
      }
    }
  }
});

// ========== Miracle Management APIs ==========

// POST /api/workflow/projects/{projectId}/miracle - Create/Update Miracle
registry.registerPath({
  method: 'post',
  path: '/api/workflow/projects/{projectId}/miracle',
  tags: ['Miracles'],
  summary: 'Create or update project miracle',
  description: 'Create or update the central miracle mechanism for a project',
  security: [{ BearerAuth: [] }],
  parameters: [
    {
      name: 'projectId',
      in: 'path',
      required: true,
      description: 'Project ID',
      schema: { type: 'string' }
    }
  ],
  requestBody: {
    required: true,
    content: {
      'application/json': {
        schema: WorkflowSchemas.UpdateMiracleRequestSchema
      }
    }
  },
  responses: {
    200: {
      description: 'Miracle created/updated successfully',
      content: {
        'application/json': {
          schema: WorkflowSchemas.ApiResponseSchema(WorkflowSchemas.MiracleSchema)
        }
      }
    },
    400: {
      description: 'Validation error',
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/ValidationError' }
        }
      }
    },
    404: {
      description: 'Project not found',
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/ApiError' }
        }
      }
    },
    401: {
      description: 'Authentication required',
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/ApiError' }
        }
      }
    }
  }
});

// GET /api/workflow/projects/{projectId}/miracle - Get Miracle
registry.registerPath({
  method: 'get',
  path: '/api/workflow/projects/{projectId}/miracle',
  tags: ['Miracles'],
  summary: 'Get project miracle',
  description: 'Retrieve the central miracle mechanism for a project',
  security: [{ BearerAuth: [] }],
  parameters: [
    {
      name: 'projectId',
      in: 'path',
      required: true,
      description: 'Project ID',
      schema: { type: 'string' }
    }
  ],
  responses: {
    200: {
      description: 'Miracle retrieved successfully',
      content: {
        'application/json': {
          schema: WorkflowSchemas.ApiResponseSchema(WorkflowSchemas.MiracleSchema)
        }
      }
    },
    404: {
      description: 'Miracle not found',
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/ApiError' }
        }
      }
    },
    401: {
      description: 'Authentication required',
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/ApiError' }
        }
      }
    }
  }
});

// POST /api/workflow/ai/generate-miracle - Generate Miracle
registry.registerPath({
  method: 'post',
  path: '/api/workflow/ai/generate-miracle',
  tags: ['AI Generation'],
  summary: 'Generate miracle alternatives',
  description: 'Use AI to generate multiple miracle mechanism alternatives',
  security: [{ BearerAuth: [] }],
  requestBody: {
    required: true,
    content: {
      'application/json': {
        schema: WorkflowSchemas.GenerateMiracleRequestSchema
      }
    }
  },
  responses: {
    200: {
      description: 'Miracle alternatives generated successfully',
      content: {
        'application/json': {
          schema: WorkflowSchemas.GenerateMiracleResponseSchema
        }
      }
    },
    400: {
      description: 'Validation error',
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/ValidationError' }
        }
      }
    },
    401: {
      description: 'Authentication required',
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/ApiError' }
        }
      }
    },
    429: {
      description: 'Rate limit exceeded',
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/ApiError' }
        }
      }
    }
  }
});

// ========== Validation APIs ==========

// POST /api/workflow/projects/{projectId}/validate - Run Validation
registry.registerPath({
  method: 'post',
  path: '/api/workflow/projects/{projectId}/validate',
  tags: ['Validation'],
  summary: 'Run project validation',
  description: 'Execute validation rules on a project to check story logic and consistency',
  security: [{ BearerAuth: [] }],
  parameters: [
    {
      name: 'projectId',
      in: 'path',
      required: true,
      description: 'Project ID',
      schema: { type: 'string' }
    }
  ],
  requestBody: {
    required: false,
    content: {
      'application/json': {
        schema: WorkflowSchemas.RunValidationRequestSchema
      }
    }
  },
  responses: {
    200: {
      description: 'Validation completed',
      content: {
        'application/json': {
          schema: WorkflowSchemas.RunValidationResponseSchema
        }
      }
    },
    404: {
      description: 'Project not found',
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/ApiError' }
        }
      }
    },
    401: {
      description: 'Authentication required',
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/ApiError' }
        }
      }
    },
    429: {
      description: 'Rate limit exceeded',
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/ApiError' }
        }
      }
    }
  }
});

// Generate OpenAPI specification
const generator = new OpenApiGeneratorV3(registry.definitions);

export const openApiDocument = generator.generateDocument({
  openapi: '3.0.3',
  info: {
    title: 'StoryApp Workflow API',
    description: `
# Story Creation Workflow API

This API provides a comprehensive system for managing story creation workflows, specifically designed for mystery/detective fiction following the "honkaku" (fair-play) tradition.

## Features

- **Project Management**: Create and manage story projects with collaborative features
- **Miracle System**: Design and validate central mystery mechanisms  
- **Validation Engine**: Automated checking of story logic and fairness
- **AI Generation**: AI-assisted creation of story elements
- **Workflow Stages**: Guided progression through 11 defined creation stages

## Authentication

All endpoints require Bearer token authentication unless otherwise specified.

## Rate Limiting

Different endpoints have different rate limits:
- General: 100 requests per 15 minutes
- Authentication: 5 attempts per 15 minutes  
- Project Creation: 10 projects per hour
- Validation: 20 requests per 5 minutes

## Workflow Stages

1. **project_init** - Project initialization
2. **center_miracle** - Central miracle design
3. **chekhov_list** - Props inventory
4. **structure_build** - Story structure
5. **clue_matrix** - Clue design
6. **misdirection_design** - Misdirection elements
7. **scene_cards** - Scene planning
8. **recap_chapter** - Logic recap
9. **pressure_test** - Logic stress testing  
10. **language_polish** - Language refinement
11. **publish_postmortem** - Publication analysis
    `,
    version: config.app.version,
    contact: {
      name: 'StoryApp API Support',
      url: 'https://github.com/haizhouyuan/storyapp'
    },
    license: {
      name: 'MIT',
      url: 'https://opensource.org/licenses/MIT'
    }
  },
  servers: [
    {
      url: config.server.nodeEnv === 'production' 
        ? 'https://api.storyapp.com' 
        : `http://localhost:${config.server.port}`,
      description: config.server.nodeEnv === 'production' ? 'Production server' : 'Development server'
    }
  ],
  tags: [
    { name: 'Projects', description: 'Story project management operations' },
    { name: 'Miracles', description: 'Central miracle mechanism management' },
    { name: 'AI Generation', description: 'AI-powered content generation' },
    { name: 'Validation', description: 'Story logic validation and testing' }
  ],
  components: {
    securitySchemes: {
      BearerAuth: { $ref: '#/components/schemas/BearerAuth' }
    }
  }
});

export { registry as openApiRegistry };