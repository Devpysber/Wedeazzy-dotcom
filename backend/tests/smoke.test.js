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
  // /health is the one endpoint here that does touch the database — reporting
  // 503 when MySQL is unreachable is the whole point of it. Asserting a flat
  // 200 made this fail on any machine without a live database, which is every
  // machine the rest of this DB-free suite is designed for. Assert the
  // contract instead: the two states must agree with each other.
  test('health check reports its own database state consistently', async () => {
    const res = await request(app).get('/health');
    expect([200, 503]).toContain(res.status);
    expect(res.body).toHaveProperty('database');
    if (res.body.database === 'ok') {
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    } else {
      expect(res.status).toBe(503);
      expect(res.body.ok).toBe(false);
    }
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
