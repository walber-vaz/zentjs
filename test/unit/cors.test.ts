import { describe, expect, it } from 'vitest';

import { zent } from '../../src/core/application';
import { cors } from '../../src/plugins/cors';

describe('cors', () => {
  // ─── factory ──────────────────────────────────────────

  describe('factory', () => {
    it('should return a middleware function', () => {
      const mw = cors();

      expect(typeof mw).toBe('function');
      expect(mw.name).toBe('corsMiddleware');
    });

    it('should accept custom options', () => {
      const mw = cors({ origin: 'https://example.com' });

      expect(typeof mw).toBe('function');
    });
  });

  // ─── Default origin: '*' ──────────────────────────────

  describe('default origin (*)', () => {
    it('should set Access-Control-Allow-Origin to * by default', async () => {
      const app = zent();
      app.use(cors());
      app.get('/test', (ctx) => ctx.res.json({ ok: true }));

      const res = await app.inject({ method: 'GET', url: '/test' });

      expect(res.headers['access-control-allow-origin']).toBe('*');
    });

    it('should not set Vary header when origin is *', async () => {
      const app = zent();
      app.use(cors());
      app.get('/test', (ctx) => ctx.res.json({ ok: true }));

      const res = await app.inject({ method: 'GET', url: '/test' });

      expect(res.headers['vary']).toBeUndefined();
    });
  });

  // ─── String origin ────────────────────────────────────

  describe('string origin', () => {
    it('should set specific origin', async () => {
      const app = zent();
      app.use(cors({ origin: 'https://example.com' }));
      app.get('/test', (ctx) => ctx.res.json({ ok: true }));

      const res = await app.inject({
        method: 'GET',
        url: '/test',
        headers: { origin: 'https://example.com' },
      });

      expect(res.headers['access-control-allow-origin']).toBe(
        'https://example.com'
      );
      expect(res.headers['vary']).toBe('Origin');
    });
  });

  // ─── Boolean origin ───────────────────────────────────

  describe('boolean origin', () => {
    it('should allow all origins when origin is true', async () => {
      const app = zent();
      app.use(cors({ origin: true }));
      app.get('/test', (ctx) => ctx.res.json({ ok: true }));

      const res = await app.inject({
        method: 'GET',
        url: '/test',
        headers: { origin: 'https://any.com' },
      });

      expect(res.headers['access-control-allow-origin']).toBe('*');
    });

    it('should skip CORS headers when origin is false', async () => {
      const app = zent();
      app.use(cors({ origin: false }));
      app.get('/test', (ctx) => ctx.res.json({ ok: true }));

      const res = await app.inject({
        method: 'GET',
        url: '/test',
        headers: { origin: 'https://evil.com' },
      });

      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  // ─── Array origin ─────────────────────────────────────

  describe('array origin', () => {
    it('should allow matching origin from array', async () => {
      const app = zent();
      app.use(cors({ origin: ['https://a.com', 'https://b.com'] }));
      app.get('/test', (ctx) => ctx.res.json({ ok: true }));

      const res = await app.inject({
        method: 'GET',
        url: '/test',
        headers: { origin: 'https://b.com' },
      });

      expect(res.headers['access-control-allow-origin']).toBe('https://b.com');
      expect(res.headers['vary']).toBe('Origin');
    });

    it('should reject non-matching origin from array', async () => {
      const app = zent();
      app.use(cors({ origin: ['https://a.com', 'https://b.com'] }));
      app.get('/test', (ctx) => ctx.res.json({ ok: true }));

      const res = await app.inject({
        method: 'GET',
        url: '/test',
        headers: { origin: 'https://evil.com' },
      });

      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  // ─── Function origin ──────────────────────────────────

  describe('function origin', () => {
    it('should use function to resolve origin', async () => {
      const app = zent();
      app.use(
        cors({
          origin: (reqOrigin) =>
            reqOrigin.endsWith('.example.com') ? reqOrigin : false,
        })
      );
      app.get('/test', (ctx) => ctx.res.json({ ok: true }));

      const res = await app.inject({
        method: 'GET',
        url: '/test',
        headers: { origin: 'https://sub.example.com' },
      });

      expect(res.headers['access-control-allow-origin']).toBe(
        'https://sub.example.com'
      );
    });

    it('should reject when function returns false', async () => {
      const app = zent();
      app.use(cors({ origin: () => false }));
      app.get('/test', (ctx) => ctx.res.json({ ok: true }));

      const res = await app.inject({
        method: 'GET',
        url: '/test',
        headers: { origin: 'https://evil.com' },
      });

      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('should support async origin function', async () => {
      const app = zent();
      app.use(
        cors({
          origin: async (reqOrigin) => {
            return reqOrigin === 'https://allowed.com' ? reqOrigin : false;
          },
        })
      );
      app.get('/test', (ctx) => ctx.res.json({ ok: true }));

      const res = await app.inject({
        method: 'GET',
        url: '/test',
        headers: { origin: 'https://allowed.com' },
      });

      expect(res.headers['access-control-allow-origin']).toBe(
        'https://allowed.com'
      );
    });
  });

  // ─── Invalid origin type ──────────────────────────────

  describe('invalid origin type', () => {
    it('should return false for unsupported origin type (number)', async () => {
      const app = zent();
      app.use(cors({ origin: 42 as any }));
      app.get('/test', (ctx) => ctx.res.json({ ok: true }));

      const res = await app.inject({
        method: 'GET',
        url: '/test',
        headers: { origin: 'https://any.com' },
      });

      // resolveOrigin returns false for number → no CORS headers
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  // ─── Credentials ──────────────────────────────────────

  describe('credentials', () => {
    it('should set Access-Control-Allow-Credentials when enabled', async () => {
      const app = zent();
      app.use(cors({ origin: 'https://example.com', credentials: true }));
      app.get('/test', (ctx) => ctx.res.json({ ok: true }));

      const res = await app.inject({
        method: 'GET',
        url: '/test',
        headers: { origin: 'https://example.com' },
      });

      expect(res.headers['access-control-allow-credentials']).toBe('true');
    });

    it('should not set credentials header when disabled', async () => {
      const app = zent();
      app.use(cors({ origin: '*', credentials: false }));
      app.get('/test', (ctx) => ctx.res.json({ ok: true }));

      const res = await app.inject({ method: 'GET', url: '/test' });

      expect(res.headers['access-control-allow-credentials']).toBeUndefined();
    });
  });

  // ─── Exposed Headers ──────────────────────────────────

  describe('exposedHeaders', () => {
    it('should set exposed headers as string', async () => {
      const app = zent();
      app.use(cors({ exposedHeaders: 'X-Custom-Header' }));
      app.get('/test', (ctx) => ctx.res.json({ ok: true }));

      const res = await app.inject({ method: 'GET', url: '/test' });

      expect(res.headers['access-control-expose-headers']).toBe(
        'X-Custom-Header'
      );
    });

    it('should set exposed headers as array', async () => {
      const app = zent();
      app.use(cors({ exposedHeaders: ['X-A', 'X-B'] }));
      app.get('/test', (ctx) => ctx.res.json({ ok: true }));

      const res = await app.inject({ method: 'GET', url: '/test' });

      expect(res.headers['access-control-expose-headers']).toBe('X-A, X-B');
    });

    it('should not set exposed headers when null', async () => {
      const app = zent();
      app.use(cors({ exposedHeaders: null }));
      app.get('/test', (ctx) => ctx.res.json({ ok: true }));

      const res = await app.inject({ method: 'GET', url: '/test' });

      expect(res.headers['access-control-expose-headers']).toBeUndefined();
    });
  });

  // ─── Preflight (OPTIONS) ──────────────────────────────

  describe('preflight (OPTIONS)', () => {
    it('should respond to OPTIONS with 204 and CORS headers', async () => {
      const app = zent();
      app.use(cors());
      app.get('/test', (ctx) => ctx.res.json({ ok: true }));
      // Need to register OPTIONS route for the path
      app.options('/test', (ctx) => ctx.res.empty(204));

      const res = await app.inject({
        method: 'OPTIONS',
        url: '/test',
        headers: {
          origin: 'https://example.com',
          'access-control-request-method': 'POST',
        },
      });

      expect(res.statusCode).toBe(204);
      expect(res.headers['access-control-allow-origin']).toBe('*');
      expect(res.headers['access-control-allow-methods']).toBe(
        'GET,HEAD,PUT,PATCH,POST,DELETE'
      );
    });

    it('should reflect request headers when allowedHeaders is null', async () => {
      const app = zent();
      app.use(cors({ allowedHeaders: null }));
      app.options('/test', (ctx) => ctx.res.empty(204));

      const res = await app.inject({
        method: 'OPTIONS',
        url: '/test',
        headers: {
          origin: 'https://example.com',
          'access-control-request-headers': 'X-Custom, Authorization',
        },
      });

      expect(res.headers['access-control-allow-headers']).toBe(
        'X-Custom, Authorization'
      );
    });

    it('should not set allowed headers when no request headers and allowedHeaders is null', async () => {
      const app = zent();
      app.use(cors({ allowedHeaders: null }));
      app.options('/test', (ctx) => ctx.res.empty(204));

      const res = await app.inject({
        method: 'OPTIONS',
        url: '/test',
        headers: { origin: 'https://example.com' },
      });

      expect(res.headers['access-control-allow-headers']).toBeUndefined();
    });

    it('should set custom allowedHeaders as string', async () => {
      const app = zent();
      app.use(cors({ allowedHeaders: 'Content-Type, Authorization' }));
      app.options('/test', (ctx) => ctx.res.empty(204));

      const res = await app.inject({
        method: 'OPTIONS',
        url: '/test',
        headers: { origin: 'https://example.com' },
      });

      expect(res.headers['access-control-allow-headers']).toBe(
        'Content-Type, Authorization'
      );
    });

    it('should set custom allowedHeaders as array', async () => {
      const app = zent();
      app.use(cors({ allowedHeaders: ['Content-Type', 'Authorization'] }));
      app.options('/test', (ctx) => ctx.res.empty(204));

      const res = await app.inject({
        method: 'OPTIONS',
        url: '/test',
        headers: { origin: 'https://example.com' },
      });

      expect(res.headers['access-control-allow-headers']).toBe(
        'Content-Type, Authorization'
      );
    });

    it('should set methods as array', async () => {
      const app = zent();
      app.use(cors({ methods: ['GET', 'POST'] }));
      app.options('/test', (ctx) => ctx.res.empty(204));

      const res = await app.inject({
        method: 'OPTIONS',
        url: '/test',
        headers: { origin: 'https://example.com' },
      });

      expect(res.headers['access-control-allow-methods']).toBe('GET, POST');
    });

    it('should set Max-Age header', async () => {
      const app = zent();
      app.use(cors({ maxAge: 86400 }));
      app.options('/test', (ctx) => ctx.res.empty(204));

      const res = await app.inject({
        method: 'OPTIONS',
        url: '/test',
        headers: { origin: 'https://example.com' },
      });

      expect(res.headers['access-control-max-age']).toBe('86400');
    });

    it('should not set Max-Age when null', async () => {
      const app = zent();
      app.use(cors({ maxAge: null }));
      app.options('/test', (ctx) => ctx.res.empty(204));

      const res = await app.inject({
        method: 'OPTIONS',
        url: '/test',
        headers: { origin: 'https://example.com' },
      });

      expect(res.headers['access-control-max-age']).toBeUndefined();
    });
  });

  // ─── Non-OPTIONS with CORS ────────────────────────────

  describe('non-OPTIONS requests', () => {
    it('should set CORS headers and call next for GET', async () => {
      const app = zent();
      app.use(cors({ origin: 'https://example.com' }));
      app.get('/data', (ctx) => ctx.res.json({ data: 42 }));

      const res = await app.inject({
        method: 'GET',
        url: '/data',
        headers: { origin: 'https://example.com' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ data: 42 });
      expect(res.headers['access-control-allow-origin']).toBe(
        'https://example.com'
      );
    });

    it('should set CORS headers for POST requests', async () => {
      const app = zent();
      app.use(cors());
      app.post('/data', (ctx) => ctx.res.status(201).json({ created: true }));

      const res = await app.inject({
        method: 'POST',
        url: '/data',
        body: { name: 'test' },
      });

      expect(res.statusCode).toBe(201);
      expect(res.headers['access-control-allow-origin']).toBe('*');
    });
  });

  // ─── Combined options ─────────────────────────────────

  describe('combined options', () => {
    it('should handle full CORS config', async () => {
      const app = zent();
      app.use(
        cors({
          origin: ['https://app.com', 'https://admin.com'],
          methods: ['GET', 'POST', 'PUT'],
          allowedHeaders: ['Content-Type', 'Authorization'],
          exposedHeaders: ['X-Request-Id'],
          credentials: true,
          maxAge: 3600,
        })
      );
      app.options('/api', (ctx) => ctx.res.empty(204));
      app.get('/api', (ctx) => ctx.res.json({ ok: true }));

      // Preflight
      const preflight = await app.inject({
        method: 'OPTIONS',
        url: '/api',
        headers: { origin: 'https://app.com' },
      });

      expect(preflight.statusCode).toBe(204);
      expect(preflight.headers['access-control-allow-origin']).toBe(
        'https://app.com'
      );
      expect(preflight.headers['access-control-allow-methods']).toBe(
        'GET, POST, PUT'
      );
      expect(preflight.headers['access-control-allow-headers']).toBe(
        'Content-Type, Authorization'
      );
      expect(preflight.headers['access-control-allow-credentials']).toBe(
        'true'
      );
      expect(preflight.headers['access-control-max-age']).toBe('3600');

      // GET request
      const get = await app.inject({
        method: 'GET',
        url: '/api',
        headers: { origin: 'https://app.com' },
      });

      expect(get.statusCode).toBe(200);
      expect(get.headers['access-control-allow-origin']).toBe(
        'https://app.com'
      );
      expect(get.headers['access-control-expose-headers']).toBe('X-Request-Id');
      expect(get.headers['vary']).toBe('Origin');
    });
  });
});
