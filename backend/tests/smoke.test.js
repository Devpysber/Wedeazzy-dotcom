/**
 * Smoke tests — verify the app boots and the core auth/permission gates behave.
 * These are intentionally minimal and DB-free: every case is rejected or
 * validated *before* any database query, so they run without a live MySQL.
 *
 * POST requests set `X-Requested-With: XMLHttpRequest` to satisfy the app's
 * CSRF middleware (see server.js), mirroring how the real frontend calls the API.
 */

const request = require('supertest');
const app = require('../src/server');

const xhr = (req) => req.set('X-Requested-With', 'XMLHttpRequest');

describe('WedEazzy API smoke tests', () => {
  test('health check responds ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  describe('Authentication', () => {
    test('GET /api/auth/me without a token is rejected (401)', async () => {
      const res = await request(app).get('/api/auth/me');
      expect(res.status).toBe(401);
    });
  });

  describe('Protected routes', () => {
    test('GET /api/vendor/me without a token is rejected (401)', async () => {
      const res = await request(app).get('/api/vendor/me');
      expect(res.status).toBe(401);
    });

    test('GET /api/couple/me without a token is rejected (401)', async () => {
      const res = await request(app).get('/api/couple/me');
      expect(res.status).toBe(401);
    });
  });

  describe('Admin permissions', () => {
    test('GET /api/admin/analytics without a token is rejected (401)', async () => {
      const res = await request(app).get('/api/admin/analytics');
      expect(res.status).toBe(401);
    });
  });

  describe('Payments', () => {
    test('POST /api/payment/initiate without a token is rejected (401)', async () => {
      const res = await xhr(request(app).post('/api/payment/initiate')).send({ planName: 'Basic' });
      expect(res.status).toBe(401);
    });
  });

  describe('Login', () => {
    test('POST /api/auth/login with empty body fails validation (400)', async () => {
      const res = await xhr(request(app).post('/api/auth/login')).send({});
      expect(res.status).toBe(400);
    });
  });

  describe('Registration', () => {
    test('POST /api/auth/signup with empty body fails validation (400)', async () => {
      const res = await xhr(request(app).post('/api/auth/signup')).send({});
      expect(res.status).toBe(400);
    });
  });
});
