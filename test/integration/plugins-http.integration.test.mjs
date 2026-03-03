import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';

import { zent } from '../../src/core/application.mjs';
import { bodyParser } from '../../src/plugins/body-parser.mjs';
import { cors } from '../../src/plugins/cors.mjs';

describe('Integration — plugins over real HTTP', () => {
  let app;

  afterEach(async () => {
    if (app) {
      await app.close();
      app = null;
    }
  });

  it('loads plugin routes before listen and parses JSON body', async () => {
    app = zent();

    app.register(
      async (scope) => {
        scope.use(bodyParser());
        scope.use(
          cors({
            origin: 'http://client.local',
            credentials: true,
          })
        );

        scope.post('/echo', (ctx) => {
          ctx.res.json({
            body: ctx.req.body,
            origin: ctx.req.get('origin') || null,
          });
        });
      },
      { prefix: '/api' }
    );

    const address = await app.listen({ port: 0, host: '127.0.0.1' });

    const response = await request(address)
      .post('/api/echo')
      .set('content-type', 'application/json')
      .set('origin', 'http://client.local')
      .send({ ok: true, n: 1 });

    expect(response.status).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBe(
      'http://client.local'
    );
    expect(response.headers['access-control-allow-credentials']).toBe('true');

    expect(response.body).toEqual({
      body: { ok: true, n: 1 },
      origin: 'http://client.local',
    });
  });

  it('handles CORS preflight over network', async () => {
    app = zent();

    app.use(
      cors({
        origin: ['http://client.local'],
        methods: ['GET', 'POST'],
        allowedHeaders: ['content-type', 'authorization'],
        maxAge: 600,
      })
    );

    app.options('/items', (ctx) => {
      ctx.res.empty(204);
    });

    const address = await app.listen({ port: 0, host: '127.0.0.1' });

    const response = await request(address)
      .options('/items')
      .set('origin', 'http://client.local')
      .set('access-control-request-method', 'POST')
      .set('access-control-request-headers', 'content-type,authorization');

    expect(response.status).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe(
      'http://client.local'
    );
    expect(response.headers['access-control-allow-methods']).toBe('GET, POST');
    expect(response.headers['access-control-allow-headers']).toBe(
      'content-type, authorization'
    );
    expect(response.headers['access-control-max-age']).toBe('600');
  });

  it('supports nested plugin prefixes over network', async () => {
    app = zent();

    app.register(
      async (scope) => {
        scope.register(
          async (innerScope) => {
            innerScope.get('/health', (ctx) => {
              ctx.res.json({ ok: true });
            });
          },
          { prefix: '/v1' }
        );
      },
      { prefix: '/api' }
    );

    const address = await app.listen({ port: 0, host: '127.0.0.1' });

    const response = await request(address).get('/api/v1/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
  });

  it('applies onSend hook to payload returned by handler over network', async () => {
    app = zent();

    app.addHook('onSend', async (ctx, payload) => {
      return { ...payload, source: 'onSend' };
    });

    app.get('/onsend', () => {
      return { ok: true };
    });

    const address = await app.listen({ port: 0, host: '127.0.0.1' });
    const response = await request(address).get('/onsend');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true, source: 'onSend' });
  });

  it('applies prefixed middleware only to matching routes over network', async () => {
    app = zent();

    app.use('/api', async (ctx, next) => {
      ctx.res.header('x-scope', 'api');
      await next();
    });

    app.get('/api/users', (ctx) => {
      ctx.res.json({ scope: 'api' });
    });

    app.get('/health', (ctx) => {
      ctx.res.json({ ok: true });
    });

    const address = await app.listen({ port: 0, host: '127.0.0.1' });

    const apiResponse = await request(address).get('/api/users');
    const healthResponse = await request(address).get('/health');

    expect(apiResponse.status).toBe(200);
    expect(apiResponse.headers['x-scope']).toBe('api');

    expect(healthResponse.status).toBe(200);
    expect(healthResponse.headers['x-scope']).toBeUndefined();
  });

  it('uses custom not found handler over network', async () => {
    app = zent();

    app.setNotFoundHandler((ctx) => {
      ctx.res.status(404).json({
        custom: true,
        path: ctx.req.path,
      });
    });

    const address = await app.listen({ port: 0, host: '127.0.0.1' });
    const response = await request(address).get('/does-not-exist');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      custom: true,
      path: '/does-not-exist',
    });
  });

  it('applies route-level onSend hook over network', async () => {
    app = zent();

    app.get(
      '/route-onsend',
      () => {
        return { ok: true };
      },
      {
        hooks: {
          onSend: async (ctx, payload) => ({ ...payload, route: true }),
        },
      }
    );

    const address = await app.listen({ port: 0, host: '127.0.0.1' });
    const response = await request(address).get('/route-onsend');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true, route: true });
  });

  it('isolates plugin hooks/middlewares between sibling scopes over network', async () => {
    app = zent();

    app.register(
      async (scope) => {
        scope.use(async (ctx, next) => {
          ctx.res.header('x-parent-mw', 'true');
          await next();
        });

        scope.addHook('onRequest', async (ctx) => {
          ctx.state.fromParentHook = true;
        });

        scope.register(async (inner) => {
          inner.get('/child', (ctx) => {
            ctx.res.json({
              fromParentHook: Boolean(ctx.state.fromParentHook),
            });
          });
        });
      },
      { prefix: '/a' }
    );

    app.register(
      async (scope) => {
        scope.get('/plain', (ctx) => {
          ctx.res.json({ fromParentHook: Boolean(ctx.state.fromParentHook) });
        });
      },
      { prefix: '/b' }
    );

    const address = await app.listen({ port: 0, host: '127.0.0.1' });

    const responseA = await request(address).get('/a/child');
    const responseB = await request(address).get('/b/plain');

    expect(responseA.status).toBe(200);
    expect(responseA.headers['x-parent-mw']).toBe('true');
    expect(responseA.body).toEqual({ fromParentHook: true });

    expect(responseB.status).toBe(200);
    expect(responseB.headers['x-parent-mw']).toBeUndefined();
    expect(responseB.body).toEqual({ fromParentHook: false });
  });

  it('returns 400 for malformed JSON body over network', async () => {
    app = zent();
    app.use(bodyParser());

    app.post('/json', (ctx) => {
      ctx.res.json({ ok: true, body: ctx.req.body });
    });

    const address = await app.listen({ port: 0, host: '127.0.0.1' });
    const response = await request(address)
      .post('/json')
      .set('content-type', 'application/json')
      .send('{invalid-json');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Invalid JSON body',
    });
  });
});
