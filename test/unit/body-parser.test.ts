import { EventEmitter } from 'node:events';

import { describe, expect, it } from 'vitest';

import { zent } from '../../src/core/application';
import { bodyParser } from '../../src/plugins/body-parser';

// ─── Tests ──────────────────────────────────────────────

describe('bodyParser', () => {
  describe('factory', () => {
    it('should return a middleware function', () => {
      const mw = bodyParser();

      expect(typeof mw).toBe('function');
      expect(mw.name).toBe('bodyParserMiddleware');
    });

    it('should accept custom options', () => {
      const mw = bodyParser({ limit: 512 });

      expect(typeof mw).toBe('function');
    });
  });

  // ─── Skip methods without body ──────────────────────

  describe('skip methods without body', () => {
    for (const method of ['GET', 'HEAD', 'DELETE', 'OPTIONS'] as const) {
      it(`should skip parsing for ${method}`, async () => {
        const app = zent();
        app.use(bodyParser());

        (app as any)[method === 'DELETE' ? 'delete' : method.toLowerCase()](
          '/test',
          (ctx: any) => {
            ctx.res.json({ body: ctx.req.body ?? null });
          }
        );

        const res = await app.inject({ method, url: '/test' });

        expect(res.json<any>().body).toBeNull();
      });
    }
  });

  // ─── Skip when no content-type ──────────────────────

  describe('skip when no content-type', () => {
    it('should skip parsing when no content-type header', async () => {
      const app = zent();
      app.use(bodyParser());

      app.post('/test', (ctx) => {
        ctx.res.json({ body: ctx.req.body ?? null });
      });

      const res = await app.inject({
        method: 'POST',
        url: '/test',
        headers: { 'content-type': '' },
      });

      expect(res.json<any>().body).toBeNull();
    });
  });

  // ─── JSON parsing ──────────────────────────────────

  describe('JSON parsing', () => {
    it('should parse application/json body', async () => {
      const app = zent();
      app.use(bodyParser());

      app.post('/test', (ctx) => {
        ctx.res.json(ctx.req.body);
      });

      const res = await app.inject({
        method: 'POST',
        url: '/test',
        body: { name: 'Alice', age: 30 },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ name: 'Alice', age: 30 });
    });

    it('should return empty object for empty JSON body', async () => {
      const app = zent();
      app.use(bodyParser());

      app.post('/test', (ctx) => {
        ctx.res.json(ctx.req.body);
      });

      const res = await app.inject({
        method: 'POST',
        url: '/test',
        body: '',
        headers: { 'content-type': 'application/json' },
      });

      expect(res.json()).toEqual({});
    });

    it('should handle application/json with charset', async () => {
      const app = zent();
      app.use(bodyParser());

      app.post('/test', (ctx) => {
        ctx.res.json(ctx.req.body);
      });

      const res = await app.inject({
        method: 'POST',
        url: '/test',
        body: { ok: true },
        headers: { 'content-type': 'application/json; charset=utf-8' },
      });

      expect(res.json()).toEqual({ ok: true });
    });

    it('should throw on invalid JSON', async () => {
      const app = zent();
      app.use(bodyParser());

      app.post('/test', (ctx) => {
        ctx.res.json(ctx.req.body);
      });

      const res = await app.inject({
        method: 'POST',
        url: '/test',
        body: '{invalid-json',
        headers: { 'content-type': 'application/json' },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Invalid JSON body',
      });
    });
  });

  // ─── URL-encoded parsing ──────────────────────────

  describe('URL-encoded parsing', () => {
    it('should parse application/x-www-form-urlencoded body', async () => {
      const app = zent();
      app.use(bodyParser());

      app.post('/test', (ctx) => {
        ctx.res.json(ctx.req.body);
      });

      const res = await app.inject({
        method: 'POST',
        url: '/test',
        body: 'name=Alice&age=30',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ name: 'Alice', age: '30' });
    });
  });

  // ─── Text parsing ────────────────────────────────

  describe('text parsing', () => {
    it('should parse text/plain body', async () => {
      const app = zent();
      app.use(bodyParser());

      app.post('/test', (ctx) => {
        ctx.res.send(ctx.req.body);
      });

      const res = await app.inject({
        method: 'POST',
        url: '/test',
        body: 'hello world',
        headers: { 'content-type': 'text/plain' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.body).toBe('hello world');
    });

    it('should parse text/html body', async () => {
      const app = zent();
      app.use(bodyParser());

      app.post('/test', (ctx) => {
        ctx.res.send(ctx.req.body);
      });

      const res = await app.inject({
        method: 'POST',
        url: '/test',
        body: '<p>hello</p>',
        headers: { 'content-type': 'text/html' },
      });

      expect(res.body).toBe('<p>hello</p>');
    });
  });

  // ─── Unknown content-type ─────────────────────────

  describe('unknown content-type', () => {
    it('should return body as string for unknown content-type', async () => {
      const app = zent();
      app.use(bodyParser());

      app.post('/test', (ctx) => {
        ctx.res.send(ctx.req.body);
      });

      const res = await app.inject({
        method: 'POST',
        url: '/test',
        body: 'raw-data',
        headers: { 'content-type': 'application/octet-stream' },
      });

      expect(res.body).toBe('raw-data');
    });
  });

  // ─── Size limit ───────────────────────────────────

  describe('size limit', () => {
    it('should reject body exceeding limit (inject mock)', async () => {
      const app = zent();
      app.use(bodyParser({ limit: 10 }));

      app.post('/test', (ctx) => {
        ctx.res.json(ctx.req.body);
      });

      const res = await app.inject({
        method: 'POST',
        url: '/test',
        body: 'x'.repeat(20),
        headers: { 'content-type': 'text/plain' },
      });

      // Error handler catches the 413-like error
      expect(res.statusCode).toBe(500);
    });

    it('should accept body within limit', async () => {
      const app = zent();
      app.use(bodyParser({ limit: 100 }));

      app.post('/test', (ctx) => {
        ctx.res.json(ctx.req.body);
      });

      const res = await app.inject({
        method: 'POST',
        url: '/test',
        body: { ok: true },
      });

      expect(res.statusCode).toBe(200);
    });
  });

  // ─── Stream reading (real IncomingMessage mock) ───

  describe('readRawBody with stream', () => {
    it('should read body from a stream emitter', async () => {
      const app = zent();
      app.use(bodyParser());

      app.post('/test', (ctx) => {
        ctx.res.json(ctx.req.body);
      });

      // Inject with JSON body works via inject mock path
      const res = await app.inject({
        method: 'POST',
        url: '/test',
        body: { streamed: true },
      });

      expect(res.json()).toEqual({ streamed: true });
    });

    it('should handle stream error', async () => {
      // Use baixo nível para testar o stream error path
      const { bodyParser: bp } = await import('../../src/plugins/body-parser');
      const mw = bp();

      const emitter: any = new EventEmitter();
      emitter.method = 'POST';
      emitter.url = '/test';
      emitter.headers = {
        host: 'localhost',
        'content-type': 'application/json',
      };
      emitter.socket = { remoteAddress: '127.0.0.1', encrypted: false };

      const ctx: any = {
        req: {
          method: 'POST',
          raw: emitter,
          get: (name: string) => emitter.headers[name.toLowerCase()],
        },
      };

      const promise = mw(ctx, async () => {});

      process.nextTick(() => {
        emitter.emit('error', new Error('stream broken'));
      });

      await expect(promise).rejects.toThrow('stream broken');
    });

    it('should reject stream exceeding limit', async () => {
      const { bodyParser: bp } = await import('../../src/plugins/body-parser');
      const mw = bp({ limit: 5 });

      const emitter: any = new EventEmitter();
      emitter.method = 'POST';
      emitter.url = '/test';
      emitter.headers = {
        host: 'localhost',
        'content-type': 'text/plain',
      };
      emitter.socket = { remoteAddress: '127.0.0.1', encrypted: false };
      emitter.destroy = () => {};

      const ctx: any = {
        req: {
          method: 'POST',
          raw: emitter,
          get: (name: string) => emitter.headers[name.toLowerCase()],
        },
      };

      const promise = mw(ctx, async () => {});

      process.nextTick(() => {
        emitter.emit('data', Buffer.from('exceeds-limit-data'));
        emitter.emit('end');
      });

      await expect(promise).rejects.toThrow('Body exceeds size limit');
    });

    it('should read real stream data successfully', async () => {
      const { bodyParser: bp } = await import('../../src/plugins/body-parser');
      const mw = bp();

      const emitter: any = new EventEmitter();
      emitter.method = 'POST';
      emitter.url = '/test';
      emitter.headers = {
        host: 'localhost',
        'content-type': 'application/json',
      };
      emitter.socket = { remoteAddress: '127.0.0.1', encrypted: false };

      const ctx: any = {
        req: {
          method: 'POST',
          raw: emitter,
          get: (name: string) => emitter.headers[name.toLowerCase()],
          body: undefined,
        },
      };

      const promise = mw(ctx, async () => {});

      process.nextTick(() => {
        emitter.emit('data', Buffer.from('{"hello":'));
        emitter.emit('data', Buffer.from('"world"}'));
        emitter.emit('end');
      });

      await promise;

      expect(ctx.req.body).toEqual({ hello: 'world' });
    });
  });

  // ─── PUT/PATCH methods ────────────────────────────

  describe('PUT and PATCH methods', () => {
    it('should parse body for PUT requests', async () => {
      const app = zent();
      app.use(bodyParser());

      app.put('/test', (ctx) => {
        ctx.res.json(ctx.req.body);
      });

      const res = await app.inject({
        method: 'PUT',
        url: '/test',
        body: { updated: true },
      });

      expect(res.json()).toEqual({ updated: true });
    });

    it('should parse body for PATCH requests', async () => {
      const app = zent();
      app.use(bodyParser());

      app.patch('/test', (ctx) => {
        ctx.res.json(ctx.req.body);
      });

      const res = await app.inject({
        method: 'PATCH',
        url: '/test',
        body: { patched: true },
      });

      expect(res.json()).toEqual({ patched: true });
    });
  });
});
