import { Router, Request, Response } from 'express';
import swaggerUi from 'swagger-ui-express';
import { openApiDocument } from '../config/openapi';
import { createLogger } from '../config/logger';

const router = Router();
const logger = createLogger('docs');

// Swagger UI options
const swaggerOptions: swaggerUi.SwaggerUiOptions = {
  explorer: true,
  customCss: `
    .swagger-ui .topbar { display: none }
    .swagger-ui .info .title { color: #3b82f6; }
    .swagger-ui .scheme-container { 
      background: #f8fafc; 
      border: 1px solid #e2e8f0; 
      border-radius: 6px; 
    }
    .swagger-ui .btn.authorize { 
      background: #3b82f6; 
      border-color: #3b82f6; 
    }
    .swagger-ui .btn.authorize:hover { 
      background: #2563eb; 
      border-color: #2563eb; 
    }
  `,
  customSiteTitle: 'StoryApp API Documentation',
  customfavIcon: '/favicon.ico',
  swaggerOptions: {
    persistAuthorization: true,
    displayRequestDuration: true,
    docExpansion: 'list',
    filter: true,
    showRequestHeaders: true,
    tryItOutEnabled: true,
    requestSnippetsEnabled: true,
    requestSnippets: {
      generators: {
        curl_bash: {
          title: 'cURL (bash)',
          syntax: 'bash'
        },
        curl_powershell: {
          title: 'cURL (PowerShell)',
          syntax: 'powershell'
        },
        fetch: {
          title: 'Fetch',
          syntax: 'javascript'
        },
        nodejs_native: {
          title: 'Node.js',
          syntax: 'javascript'
        }
      },
      defaultExpanded: false,
      languages: ['curl_bash', 'curl_powershell', 'fetch', 'nodejs_native']
    }
  }
};

// Serve OpenAPI JSON
router.get('/openapi.json', (req: Request, res: Response) => {
  try {
    logger.info({
      userAgent: req.get('User-Agent'),
      ip: req.ip,
      requestId: (req as any).requestId
    }, 'OpenAPI JSON requested');
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.json(openApiDocument);
  } catch (error) {
    logger.error({ error }, 'Failed to serve OpenAPI JSON');
    res.status(500).json({
      success: false,
      error: 'Failed to generate API documentation'
    });
  }
});

// Serve OpenAPI YAML
router.get('/openapi.yaml', (req: Request, res: Response) => {
  try {
    const yaml = require('js-yaml');
    const yamlDoc = yaml.dump(openApiDocument, {
      indent: 2,
      lineWidth: 120,
      noRefs: false
    });
    
    logger.info({
      userAgent: req.get('User-Agent'),
      ip: req.ip,
      requestId: (req as any).requestId
    }, 'OpenAPI YAML requested');
    
    res.setHeader('Content-Type', 'text/yaml');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send(yamlDoc);
  } catch (error) {
    logger.error({ error }, 'Failed to serve OpenAPI YAML');
    res.status(500).json({
      success: false,
      error: 'Failed to generate YAML documentation'
    });
  }
});

// API documentation landing page
router.get('/', (req: Request, res: Response) => {
  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>StoryApp API Documentation</title>
        <style>
            body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                max-width: 1200px;
                margin: 0 auto;
                padding: 2rem;
                background: #f8fafc;
                color: #1e293b;
            }
            .header {
                text-align: center;
                margin-bottom: 3rem;
                padding: 2rem;
                background: white;
                border-radius: 12px;
                box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            }
            .header h1 {
                color: #3b82f6;
                margin-bottom: 0.5rem;
            }
            .links {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
                gap: 1.5rem;
                margin-bottom: 3rem;
            }
            .card {
                background: white;
                padding: 1.5rem;
                border-radius: 12px;
                box-shadow: 0 1px 3px rgba(0,0,0,0.1);
                border: 1px solid #e2e8f0;
                transition: transform 0.2s, box-shadow 0.2s;
            }
            .card:hover {
                transform: translateY(-2px);
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            }
            .card h3 {
                margin-top: 0;
                color: #3b82f6;
            }
            .card p {
                color: #64748b;
                margin-bottom: 1rem;
            }
            .btn {
                display: inline-block;
                padding: 0.75rem 1.5rem;
                background: #3b82f6;
                color: white;
                text-decoration: none;
                border-radius: 6px;
                font-weight: 500;
                transition: background 0.2s;
            }
            .btn:hover {
                background: #2563eb;
            }
            .btn.secondary {
                background: #6b7280;
            }
            .btn.secondary:hover {
                background: #4b5563;
            }
            .info {
                background: white;
                padding: 2rem;
                border-radius: 12px;
                box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            }
            .info h2 {
                color: #1e293b;
                margin-bottom: 1rem;
            }
            .info ul {
                color: #64748b;
            }
            .badge {
                display: inline-block;
                padding: 0.25rem 0.75rem;
                background: #dbeafe;
                color: #3b82f6;
                border-radius: 4px;
                font-size: 0.875rem;
                font-weight: 500;
                margin-left: 0.5rem;
            }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>🏗️ StoryApp API Documentation</h1>
            <p>Comprehensive API for story creation workflow management</p>
            <span class="badge">Version ${openApiDocument.info.version}</span>
        </div>
        
        <div class="links">
            <div class="card">
                <h3>📖 Interactive Documentation</h3>
                <p>Explore and test API endpoints with Swagger UI. Includes request/response examples and authentication.</p>
                <a href="/docs/swagger" class="btn">Open Swagger UI</a>
            </div>
            
            <div class="card">
                <h3>📄 OpenAPI Specification</h3>
                <p>Download the complete API specification in JSON or YAML format for code generation and tooling.</p>
                <a href="/docs/openapi.json" class="btn secondary">JSON</a>
                <a href="/docs/openapi.yaml" class="btn secondary">YAML</a>
            </div>
            
            <div class="card">
                <h3>🚀 Quick Start</h3>
                <p>Get started with authentication, rate limiting, and basic workflow operations.</p>
                <a href="/docs/swagger#/Projects/post_api_workflow_projects" class="btn">Create Project</a>
            </div>
            
            <div class="card">
                <h3>🔒 API Health</h3>
                <p>Check service status, database connectivity, and system metrics.</p>
                <a href="/api/health" class="btn secondary">Health Check</a>
                <a href="/metrics" class="btn secondary">Metrics</a>
            </div>
        </div>
        
        <div class="info">
            <h2>API Features</h2>
            <ul>
                <li><strong>Project Management</strong> - Create and manage story creation projects</li>
                <li><strong>Miracle System</strong> - Design central mystery mechanisms with validation</li>
                <li><strong>AI Generation</strong> - AI-assisted content creation for story elements</li>
                <li><strong>Validation Engine</strong> - Automated story logic and fairness checking</li>
                <li><strong>Workflow Stages</strong> - 11-stage guided creation process</li>
                <li><strong>Collaborative Features</strong> - Multi-user project collaboration</li>
                <li><strong>Real-time Monitoring</strong> - Comprehensive observability and metrics</li>
                <li><strong>Rate Limiting</strong> - Multi-tier rate limiting for different operations</li>
            </ul>
            
            <h2>Authentication</h2>
            <p>All API endpoints require Bearer token authentication. Include your token in the Authorization header:</p>
            <code style="background: #f1f5f9; padding: 0.5rem; border-radius: 4px; display: block; margin: 1rem 0;">
                Authorization: Bearer your_jwt_token_here
            </code>
            
            <h2>Base URL</h2>
            <p>Development: <code>http://localhost:${process.env.PORT || 5001}</code></p>
            <p>Production: <code>https://api.storyapp.com</code></p>
        </div>
    </body>
    </html>
  `;
  
  logger.info({
    userAgent: req.get('User-Agent'),
    ip: req.ip,
    requestId: (req as any).requestId
  }, 'API documentation landing page accessed');
  
  res.send(html);
});

// Swagger UI
router.use('/swagger', swaggerUi.serve);
router.get('/swagger', swaggerUi.setup(openApiDocument, swaggerOptions));

export default router;