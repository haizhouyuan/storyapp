import request from 'supertest';
import express from 'express';
import healthRouter from '../../src/routes/health';

const app = express();
app.use('/api/health', healthRouter);

describe('Health API Routes', () => {
  describe('GET /api/health', () => {
    it('应该返回健康状态', async () => {
      const response = await request(app)
        .get('/api/health');

      expect(response.body).toBeDefined();
      expect(response.body.status).toBeDefined();
      expect(response.body.checks).toBeDefined();
      expect(response.body.checks.server).toBe(true);
      expect(response.body.checks.database).toBeDefined();
      expect(typeof response.body.checks.database).toBe('boolean');
    });

    it('应该包含必要的健康检查项', async () => {
      const response = await request(app)
        .get('/api/health');

      const { checks } = response.body;
      
      expect(checks).toHaveProperty('server');
      expect(checks).toHaveProperty('database');
      expect(checks).toHaveProperty('deepseek');
      
      expect(typeof checks.server).toBe('boolean');
      expect(typeof checks.database).toBe('boolean');
      expect(typeof checks.deepseek).toBe('object');
    });

    it('应该在所有检查通过时返回健康状态', async () => {
      const response = await request(app)
        .get('/api/health');

      if (response.body.checks.server && 
          response.body.checks.database && 
          response.body.checks.deepseek.available) {
        expect(response.body.status).toBe('healthy');
      }
    });

    it('应该返回正确的响应格式', async () => {
      const response = await request(app)
        .get('/api/health');

      expect(response.headers['content-type']).toMatch(/application\/json/);
      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('checks');
      expect(typeof response.body.status).toBe('string');
      expect(typeof response.body.checks).toBe('object');
    });
  });
});