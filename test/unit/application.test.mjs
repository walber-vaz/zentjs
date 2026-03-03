import { describe, expect, it } from 'vitest';

import { Zent, zent } from '../../src/core/application.mjs';

describe('Application (Zent)', () => {
  describe('factory function', () => {
    it('should create a Zent instance via zent()', () => {
      const app = zent();

      expect(app).toBeInstanceOf(Zent);
    });

    it('should accept options', () => {
      const app = zent({ ignoreTrailingSlash: false, caseSensitive: true });

      expect(app).toBeInstanceOf(Zent);
    });
  });

  describe('routing — convenience methods', () => {
    const methods = [
      'get',
      'post',
      'put',
      'patch',
      'delete',
      'head',
      'options',
    ];

    for (const method of methods) {
      it(`should register ${method.toUpperCase()} route and respond via inject`, async () => {
        const app = zent();
        app[method]('/test', (ctx) => {
          ctx.res.json({ method: ctx.req.method });
        });

        const res = await app.inject({
          method: method.toUpperCase(),
          url: '/test',
        });

        expect(res.statusCode).toBe(200);
        expect(res.json().method).toBe(method.toUpperCase());
      });
    }
  });

  describe('route()', () => {
    it('should register a full route definition', async () => {
      const app = zent();
      app.route({
        method: 'POST',
        path: '/items',
        handler: (ctx) => ctx.res.status(201).json({ created: true }),
      });

      const res = await app.inject({ method: 'POST', url: '/items' });

      expect(res.statusCode).toBe(201);
      expect(res.json()).toEqual({ created: true });
    });
  });

  describe('all()', () => {
    it('should register handler for all HTTP methods', async () => {
      const app = zent();
      app.all('/health', (ctx) => ctx.res.json({ status: 'ok' }));

      for (const method of ['GET', 'POST', 'PUT', 'DELETE']) {
        const res = await app.inject({ method, url: '/health' });
        expect(res.json()).toEqual({ status: 'ok' });
      }
    });
  });

  describe('group()', () => {
    it('should group routes under a prefix', async () => {
      const app = zent();

      app.group('/api/v1', (group) => {
        group.get('/users', (ctx) => ctx.res.json({ users: [] }));
      });

      const res = await app.inject({ method: 'GET', url: '/api/v1/users' });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ users: [] });
    });
  });

  describe('params', () => {
    it('should populate route params', async () => {
      const app = zent();
      app.get('/users/:id', (ctx) => {
        ctx.res.json({ id: ctx.req.params.id });
      });

      const res = await app.inject({ method: 'GET', url: '/users/42' });

      expect(res.json()).toEqual({ id: '42' });
    });
  });

  describe('use() — global middleware', () => {
    it('should register and execute global middleware', async () => {
      const app = zent();
      const order = [];

      app.use(async (ctx, next) => {
        order.push('mw-before');
        await next();
        order.push('mw-after');
      });

      app.get('/test', (ctx) => {
        order.push('handler');
        ctx.res.json({ ok: true });
      });

      await app.inject({ method: 'GET', url: '/test' });

      expect(order).toEqual(['mw-before', 'handler', 'mw-after']);
    });

    it('should execute multiple middlewares in order', async () => {
      const app = zent();
      const order = [];

      app.use(async (ctx, next) => {
        order.push('mw1');
        await next();
      });

      app.use(async (ctx, next) => {
        order.push('mw2');
        await next();
      });

      app.get('/test', (ctx) => {
        order.push('handler');
        ctx.res.json({});
      });

      await app.inject({ method: 'GET', url: '/test' });

      expect(order).toEqual(['mw1', 'mw2', 'handler']);
    });

    it('should throw TypeError for non-function middleware', () => {
      const app = zent();

      expect(() => app.use('not-fn')).toThrow(TypeError);
    });

    it('should allow middleware to modify state', async () => {
      const app = zent();

      app.use(async (ctx, next) => {
        ctx.state.user = 'alice';
        await next();
      });

      app.get('/profile', (ctx) => {
        ctx.res.json({ user: ctx.state.user });
      });

      const res = await app.inject({ method: 'GET', url: '/profile' });

      expect(res.json()).toEqual({ user: 'alice' });
    });

    it('should execute prefixed middleware only for matching paths', async () => {
      const app = zent();
      const hits = [];

      app.use('/api', async (ctx, next) => {
        hits.push(`mw:${ctx.req.path}`);
        await next();
      });

      app.get('/api/users', (ctx) => {
        ctx.res.json({ scope: 'api' });
      });

      app.get('/health', (ctx) => {
        ctx.res.json({ ok: true });
      });

      await app.inject({ method: 'GET', url: '/api/users' });
      await app.inject({ method: 'GET', url: '/health' });

      expect(hits).toEqual(['mw:/api/users']);
    });

    it('should not match similar prefix names', async () => {
      const app = zent();
      let called = 0;

      app.use('/api', async (ctx, next) => {
        called += 1;
        await next();
      });

      app.get('/apix/test', (ctx) => {
        ctx.res.json({ ok: true });
      });

      await app.inject({ method: 'GET', url: '/apix/test' });

      expect(called).toBe(0);
    });

    it('should throw for invalid prefixed middleware signature', () => {
      const app = zent();

      expect(() => app.use('/api', 'not-fn')).toThrow(
        'Invalid use() signature'
      );
    });
  });

  describe('route-level middleware', () => {
    it('should execute route middlewares after global', async () => {
      const app = zent();
      const order = [];

      app.use(async (ctx, next) => {
        order.push('global');
        await next();
      });

      const routeMw = async (ctx, next) => {
        order.push('route-mw');
        await next();
      };

      app.get(
        '/test',
        (ctx) => {
          order.push('handler');
          ctx.res.json({});
        },
        { middlewares: [routeMw] }
      );

      await app.inject({ method: 'GET', url: '/test' });

      expect(order).toEqual(['global', 'route-mw', 'handler']);
    });
  });

  describe('addHook() — lifecycle hooks', () => {
    it('should execute onRequest hook', async () => {
      const app = zent();
      let hookCalled = false;

      app.addHook('onRequest', async () => {
        hookCalled = true;
      });

      app.get('/test', (ctx) => ctx.res.json({}));
      await app.inject({ method: 'GET', url: '/test' });

      expect(hookCalled).toBe(true);
    });

    it('should execute hooks in lifecycle order', async () => {
      const app = zent();
      const order = [];

      app.addHook('onRequest', async () => order.push('onRequest'));
      app.addHook('preParsing', async () => order.push('preParsing'));
      app.addHook('preValidation', async () => order.push('preValidation'));
      app.addHook('preHandler', async () => order.push('preHandler'));
      app.addHook('onResponse', async () => order.push('onResponse'));

      app.get('/test', (ctx) => {
        order.push('handler');
        ctx.res.json({});
      });

      await app.inject({ method: 'GET', url: '/test' });

      expect(order).toEqual([
        'onRequest',
        'preParsing',
        'preValidation',
        'preHandler',
        'handler',
        'onResponse',
      ]);
    });

    it('should execute onError hook on error', async () => {
      const app = zent();
      let capturedError;

      app.addHook('onError', async (ctx, err) => {
        capturedError = err;
      });

      app.get('/fail', () => {
        throw new Error('boom');
      });

      const res = await app.inject({ method: 'GET', url: '/fail' });

      expect(capturedError).toBeDefined();
      expect(capturedError.message).toBe('boom');
      expect(res.statusCode).toBe(500);
    });

    it('should execute onSend hook and send transformed handler payload', async () => {
      const app = zent();

      app.addHook('onSend', async (ctx, payload) => {
        return { ...payload, transformed: true };
      });

      app.get('/transform', () => {
        return { ok: true };
      });

      const res = await app.inject({ method: 'GET', url: '/transform' });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ ok: true, transformed: true });
    });

    it('should not execute onSend when response was already sent', async () => {
      const app = zent();
      let onSendCalled = false;

      app.addHook('onSend', async () => {
        onSendCalled = true;
        return { changed: true };
      });

      app.get('/already-sent', (ctx) => {
        ctx.res.json({ ok: true });
        return { ignored: true };
      });

      const res = await app.inject({ method: 'GET', url: '/already-sent' });

      expect(onSendCalled).toBe(false);
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ ok: true });
    });

    it('should fallback to error handler when onError hook throws', async () => {
      const app = zent();

      app.addHook('onError', async () => {
        throw new Error('hook also failed');
      });

      app.get('/fail', () => {
        throw new Error('original');
      });

      const res = await app.inject({ method: 'GET', url: '/fail' });

      // Should still get error response from the error handler
      expect(res.statusCode).toBe(500);
    });

    it('should return chaining from addHook', () => {
      const app = zent();
      const result = app.addHook('onRequest', async () => {});

      expect(result).toBe(app);
    });
  });

  describe('setErrorHandler()', () => {
    it('should use custom error handler', async () => {
      const app = zent();

      app.setErrorHandler((error, ctx) => {
        ctx.res.status(error.statusCode || 500).json({
          custom: true,
          message: error.message,
        });
      });

      app.get('/fail', () => {
        throw new Error('custom error');
      });

      const res = await app.inject({ method: 'GET', url: '/fail' });

      expect(res.statusCode).toBe(500);
      expect(res.json()).toEqual({ custom: true, message: 'custom error' });
    });

    it('should return 404 for non-existent route', async () => {
      const app = zent();

      const res = await app.inject({ method: 'GET', url: '/nope' });

      expect(res.statusCode).toBe(404);
      expect(res.json().error).toBe('Not Found');
    });

    it('should return 405 for wrong method', async () => {
      const app = zent();
      app.get('/users', (ctx) => ctx.res.json({}));

      const res = await app.inject({ method: 'DELETE', url: '/users' });

      expect(res.statusCode).toBe(405);
    });
  });

  describe('setNotFoundHandler()', () => {
    it('should return chaining from setNotFoundHandler', () => {
      const app = zent();
      const result = app.setNotFoundHandler((ctx) => {
        ctx.res.status(404).json({ custom: true });
      });

      expect(result).toBe(app);
    });

    it('should use custom not found handler for missing route', async () => {
      const app = zent();

      app.setNotFoundHandler((ctx) => {
        ctx.res.status(404).json({ custom404: true, path: ctx.req.path });
      });

      const res = await app.inject({ method: 'GET', url: '/unknown' });

      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({ custom404: true, path: '/unknown' });
    });

    it('should fallback to default 404 payload if custom handler does not send', async () => {
      const app = zent();

      app.setNotFoundHandler(() => {
        // intentionally does not send response
      });

      const res = await app.inject({ method: 'GET', url: '/missing' });

      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({
        statusCode: 404,
        error: 'Not Found',
        message: 'Not Found',
      });
    });

    it('should not intercept method not allowed errors', async () => {
      const app = zent();

      app.setNotFoundHandler((ctx) => {
        ctx.res.status(404).json({ custom404: true });
      });

      app.get('/users', (ctx) => ctx.res.json({ ok: true }));

      const res = await app.inject({ method: 'DELETE', url: '/users' });

      expect(res.statusCode).toBe(405);
      expect(res.json().error).toBe('Method Not Allowed');
    });

    it('should throw TypeError for non-function not found handler', () => {
      const app = zent();

      expect(() => app.setNotFoundHandler('not-fn')).toThrow(TypeError);
    });
  });

  describe('decorate()', () => {
    it('should add property to app instance', () => {
      const app = zent();
      app.decorate('db', { query: () => {} });

      expect(app.db).toBeDefined();
      expect(app.hasDecorator('db')).toBe(true);
    });

    it('should be accessible via ctx.app', async () => {
      const app = zent();
      app.decorate('version', '1.0.0');

      app.get('/version', (ctx) => {
        ctx.res.json({ version: ctx.app.version });
      });

      const res = await app.inject({ method: 'GET', url: '/version' });

      expect(res.json()).toEqual({ version: '1.0.0' });
    });

    it('should throw if decorator name already exists', () => {
      const app = zent();
      app.decorate('foo', 'bar');

      expect(() => app.decorate('foo', 'baz')).toThrow(
        'Decorator "foo" already exists'
      );
    });

    it('hasDecorator should return false for missing decorator', () => {
      const app = zent();

      expect(app.hasDecorator('nonexistent')).toBe(false);
    });
  });

  describe('inject()', () => {
    it('should inject GET request', async () => {
      const app = zent();
      app.get('/', (ctx) => ctx.res.json({ hello: 'world' }));

      const res = await app.inject({ method: 'GET', url: '/' });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ hello: 'world' });
      expect(res.body).toBe('{"hello":"world"}');
    });

    it('should inject POST with JSON body', async () => {
      const app = zent();

      app.post('/echo', (ctx) => {
        ctx.res.json({ received: true });
      });

      const res = await app.inject({
        method: 'POST',
        url: '/echo',
        body: { name: 'John' },
      });

      expect(res.statusCode).toBe(200);
    });

    it('should inject POST with string body', async () => {
      const app = zent();

      app.post('/echo', (ctx) => {
        ctx.res.send('ok');
      });

      const res = await app.inject({
        method: 'POST',
        url: '/echo',
        body: 'raw-body',
      });

      expect(res.statusCode).toBe(200);
      expect(res.body).toBe('ok');
    });

    it('should inject with custom headers', async () => {
      const app = zent();

      app.get('/auth', (ctx) => {
        const token = ctx.req.get('authorization');
        ctx.res.json({ token });
      });

      const res = await app.inject({
        method: 'GET',
        url: '/auth',
        headers: { authorization: 'Bearer abc123' },
      });

      expect(res.json()).toEqual({ token: 'Bearer abc123' });
    });

    it('should default method to GET and url to /', async () => {
      const app = zent();
      app.get('/', (ctx) => ctx.res.json({ root: true }));

      const res = await app.inject({});

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ root: true });
    });

    it('should expose response headers', async () => {
      const app = zent();

      app.get('/custom', (ctx) => {
        ctx.res.header('x-custom', 'value').json({ ok: true });
      });

      const res = await app.inject({ method: 'GET', url: '/custom' });

      expect(res.headers['x-custom']).toBe('value');
    });
  });

  describe('listen() and close()', () => {
    it('should start and stop the server', async () => {
      const app = zent();
      app.get('/', (ctx) => ctx.res.json({ ok: true }));

      const address = await app.listen({ port: 0, host: '127.0.0.1' });

      expect(address).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);

      await app.close();
    });

    it('should invoke callback on listen', async () => {
      const app = zent();
      app.get('/', (ctx) => ctx.res.json({}));

      let cbAddress;
      await app.listen({ port: 0, host: '127.0.0.1' }, (err, addr) => {
        cbAddress = addr;
      });

      expect(cbAddress).toMatch(/^http:\/\//);

      await app.close();
    });

    it('should resolve close() even without server', async () => {
      const app = zent();

      await expect(app.close()).resolves.toBeUndefined();
    });

    it('should call callback with error when listen fails', async () => {
      const app1 = zent();
      app1.get('/', (ctx) => ctx.res.json({}));
      const address = await app1.listen({ port: 0, host: '127.0.0.1' });
      // Extract port from address
      const port = Number(address.split(':').pop());

      const app2 = zent();
      let cbError;

      try {
        await app2.listen({ port, host: '127.0.0.1' }, (err) => {
          cbError = err;
        });
      } catch {
        // expected rejection
      }

      expect(cbError).toBeDefined();
      expect(cbError.code).toBe('EADDRINUSE');

      await app1.close();
    });

    it('should reject promise when listen fails without callback', async () => {
      const app1 = zent();
      app1.get('/', (ctx) => ctx.res.json({}));
      const address = await app1.listen({ port: 0, host: '127.0.0.1' });
      const port = Number(address.split(':').pop());

      const app2 = zent();

      await expect(app2.listen({ port, host: '127.0.0.1' })).rejects.toThrow();

      await app1.close();
    });

    it('should reject close() when server.close fails', async () => {
      const app = zent();
      app.get('/', (ctx) => ctx.res.json({}));
      await app.listen({ port: 0, host: '127.0.0.1' });

      // Destroy underlying connections to force server.close(cb) to call cb with error
      await app.close();
      // After close, #server is null → early return, no reject
      await expect(app.close()).resolves.toBeUndefined();
    });

    it('should handle real HTTP request through createServer', async () => {
      const app = zent();
      app.get('/ping', (ctx) => ctx.res.json({ pong: true }));

      const address = await app.listen({ port: 0, host: '127.0.0.1' });

      const res = await fetch(`${address}/ping`);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body).toEqual({ pong: true });

      await app.close();
    });
  });

  describe('chaining', () => {
    it('should support method chaining', () => {
      const app = zent();

      const result = app
        .use(async (ctx, next) => await next())
        .get('/a', (ctx) => ctx.res.json({}))
        .post('/b', (ctx) => ctx.res.json({}))
        .addHook('onRequest', async () => {});

      expect(result).toBe(app);
    });
  });

  describe('route-level hooks', () => {
    it('should execute route-level preHandler hooks', async () => {
      const app = zent();
      const order = [];

      app.addHook('preHandler', async () => order.push('global-preHandler'));

      app.get(
        '/test',
        (ctx) => {
          order.push('handler');
          ctx.res.json({});
        },
        {
          hooks: { preHandler: [async () => order.push('route-preHandler')] },
        }
      );

      await app.inject({ method: 'GET', url: '/test' });

      expect(order).toEqual([
        'global-preHandler',
        'route-preHandler',
        'handler',
      ]);
    });

    it('should handle single function as route preHandler hook', async () => {
      const app = zent();
      const order = [];

      app.get(
        '/test',
        (ctx) => {
          order.push('handler');
          ctx.res.json({});
        },
        {
          hooks: { preHandler: async () => order.push('route-hook') },
        }
      );

      await app.inject({ method: 'GET', url: '/test' });

      expect(order).toEqual(['route-hook', 'handler']);
    });

    it('should execute route-level preValidation hooks', async () => {
      const app = zent();
      const order = [];

      app.addHook('preValidation', async () =>
        order.push('global-preValidation')
      );

      app.get(
        '/validate',
        (ctx) => {
          order.push('handler');
          ctx.res.json({ ok: true });
        },
        {
          hooks: {
            preValidation: [async () => order.push('route-preValidation')],
          },
        }
      );

      await app.inject({ method: 'GET', url: '/validate' });

      expect(order).toEqual([
        'global-preValidation',
        'route-preValidation',
        'handler',
      ]);
    });

    it('should execute route-level onSend hooks and transform payload', async () => {
      const app = zent();

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

      const res = await app.inject({ method: 'GET', url: '/route-onsend' });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ ok: true, route: true });
    });

    it('should execute route-level onResponse hooks', async () => {
      const app = zent();
      const order = [];

      app.addHook('onResponse', async () => order.push('global-onResponse'));

      app.get(
        '/route-onresponse',
        (ctx) => {
          ctx.res.json({ ok: true });
        },
        {
          hooks: {
            onResponse: async () => order.push('route-onResponse'),
          },
        }
      );

      await app.inject({ method: 'GET', url: '/route-onresponse' });

      expect(order).toEqual(['global-onResponse', 'route-onResponse']);
    });

    it('should execute route-level onError hooks', async () => {
      const app = zent();
      let routeHookError;

      app.get(
        '/route-onerror',
        () => {
          throw new Error('route fail');
        },
        {
          hooks: {
            onError: async (ctx, err) => {
              routeHookError = err;
            },
          },
        }
      );

      const res = await app.inject({ method: 'GET', url: '/route-onerror' });

      expect(res.statusCode).toBe(500);
      expect(routeHookError).toBeDefined();
      expect(routeHookError.message).toBe('route fail');
    });
  });

  // ─── Plugins (register / createScope / loadPlugins) ─────

  describe('register() — plugins', () => {
    it('should return this for chaining', () => {
      const app = zent();
      const result = app.register(async () => {});

      expect(result).toBe(app);
    });

    it('should chain multiple register calls', () => {
      const app = zent();
      const result = app.register(async () => {}).register(async () => {});

      expect(result).toBe(app);
    });

    it('should load plugins on inject()', async () => {
      const order = [];
      const app = zent();

      app.register(async (scope) => {
        order.push('plugin-loaded');
        scope.get('/hello', (ctx) => ctx.res.json({ ok: true }));
      });

      app.get('/root', (ctx) => ctx.res.json({ root: true }));

      // inject() triggers #loadPlugins
      const res = await app.inject({ method: 'GET', url: '/hello' });

      expect(order).toEqual(['plugin-loaded']);
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ ok: true });
    });

    it('should prefix plugin routes with opts.prefix', async () => {
      const app = zent();

      app.register(
        async (scope) => {
          scope.get('/items', (ctx) => ctx.res.json({ items: [] }));
        },
        { prefix: '/api' }
      );

      const res = await app.inject({ method: 'GET', url: '/api/items' });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ items: [] });
    });

    it('should support all HTTP method shortcuts in scope', async () => {
      const app = zent();

      app.register(
        async (scope) => {
          scope.get('/r', (ctx) => ctx.res.json({ m: 'GET' }));
          scope.post('/r', (ctx) => ctx.res.json({ m: 'POST' }));
          scope.put('/r', (ctx) => ctx.res.json({ m: 'PUT' }));
          scope.patch('/r', (ctx) => ctx.res.json({ m: 'PATCH' }));
          scope.delete('/r', (ctx) => ctx.res.json({ m: 'DELETE' }));
          scope.head('/r', (ctx) => ctx.res.status(204).send(''));
          scope.options('/r', (ctx) => ctx.res.status(204).send(''));
        },
        { prefix: '/v1' }
      );

      const get = await app.inject({ method: 'GET', url: '/v1/r' });
      expect(get.json().m).toBe('GET');

      const post = await app.inject({ method: 'POST', url: '/v1/r' });
      expect(post.json().m).toBe('POST');

      const put = await app.inject({ method: 'PUT', url: '/v1/r' });
      expect(put.json().m).toBe('PUT');

      const patch = await app.inject({ method: 'PATCH', url: '/v1/r' });
      expect(patch.json().m).toBe('PATCH');

      const del = await app.inject({ method: 'DELETE', url: '/v1/r' });
      expect(del.json().m).toBe('DELETE');

      const head = await app.inject({ method: 'HEAD', url: '/v1/r' });
      expect(head.statusCode).toBe(204);

      const opts = await app.inject({ method: 'OPTIONS', url: '/v1/r' });
      expect(opts.statusCode).toBe(204);
    });

    it('should support scope.all() with prefix', async () => {
      const app = zent();

      app.register(
        async (scope) => {
          scope.all('/any', (ctx) => ctx.res.json({ ok: true }));
        },
        { prefix: '/p' }
      );

      const res = await app.inject({ method: 'PATCH', url: '/p/any' });
      expect(res.json()).toEqual({ ok: true });
    });

    it('should support scope.route() with prefix', async () => {
      const app = zent();

      app.register(
        async (scope) => {
          scope.route({
            method: 'GET',
            path: '/custom',
            handler: (ctx) => ctx.res.json({ route: true }),
          });
        },
        { prefix: '/scoped' }
      );

      const res = await app.inject({ method: 'GET', url: '/scoped/custom' });
      expect(res.json()).toEqual({ route: true });
    });

    it('should support scope.group() with prefix', async () => {
      const app = zent();

      app.register(
        async (scope) => {
          scope.group('/sub', (router) => {
            router.get('/item', (ctx) => ctx.res.json({ grouped: true }));
          });
        },
        { prefix: '/ns' }
      );

      const res = await app.inject({ method: 'GET', url: '/ns/sub/item' });
      expect(res.json()).toEqual({ grouped: true });
    });

    it('should apply scope.use() only to routes in same plugin scope', async () => {
      const app = zent();
      const order = [];

      app.register(
        async (scope) => {
          scope.use(async (ctx, next) => {
            order.push('plugin-mw');
            await next(ctx);
          });

          scope.get('/scoped', (ctx) => {
            order.push('scoped-handler');
            ctx.res.json({ ok: true });
          });
        },
        { prefix: '/api' }
      );

      app.get('/x', (ctx) => {
        order.push('root-handler');
        ctx.res.json({});
      });

      await app.inject({ method: 'GET', url: '/api/scoped' });
      await app.inject({ method: 'GET', url: '/x' });

      expect(order).toEqual(['plugin-mw', 'scoped-handler', 'root-handler']);
    });

    it('should apply scope.addHook() only to routes in same plugin scope', async () => {
      const app = zent();
      const order = [];

      app.register(
        async (scope) => {
          scope.addHook('onRequest', async () => {
            order.push('plugin-hook');
          });

          scope.get('/hooked', (ctx) => {
            order.push('scoped-handler');
            ctx.res.json({ ok: true });
          });
        },
        { prefix: '/api' }
      );

      app.get('/h', (ctx) => {
        order.push('root-handler');
        ctx.res.json({});
      });

      await app.inject({ method: 'GET', url: '/api/hooked' });
      await app.inject({ method: 'GET', url: '/h' });

      expect(order).toEqual(['plugin-hook', 'scoped-handler', 'root-handler']);
    });

    it('should inherit scope middlewares and hooks in nested plugins', async () => {
      const app = zent();
      const order = [];

      app.register(
        async (scope) => {
          scope.use(async (ctx, next) => {
            order.push('parent-mw');
            await next(ctx);
          });

          scope.addHook('onRequest', async () => {
            order.push('parent-hook');
          });

          scope.register(async (innerScope) => {
            innerScope.get('/inner', (ctx) => {
              order.push('inner-handler');
              ctx.res.json({ ok: true });
            });
          });
        },
        { prefix: '/api' }
      );

      await app.inject({ method: 'GET', url: '/api/inner' });

      expect(order).toEqual(['parent-hook', 'parent-mw', 'inner-handler']);
    });

    it('should allow plugin to set error handler via scope.setErrorHandler()', async () => {
      const app = zent();

      app.register(async (scope) => {
        scope.setErrorHandler((err, ctx) => {
          ctx.res.status(599).json({ custom: true });
        });
      });

      app.get('/fail', () => {
        throw new Error('boom');
      });

      const res = await app.inject({ method: 'GET', url: '/fail' });

      expect(res.statusCode).toBe(599);
      expect(res.json()).toEqual({ custom: true });
    });

    it('should allow plugin to decorate via scope.decorate()', async () => {
      const app = zent();
      let scopeHasDecorator = false;

      app.register(async (scope) => {
        scope.decorate('dbClient', { query: () => 'result' });
        scopeHasDecorator = scope.hasDecorator('dbClient');
      });

      app.get('/dec', (ctx) => {
        ctx.res.json({ hasOnApp: ctx.app.hasDecorator('dbClient') });
      });

      const res = await app.inject({ method: 'GET', url: '/dec' });

      expect(scopeHasDecorator).toBe(true);
      expect(res.json()).toEqual({ hasOnApp: false });
    });

    it('should allow plugin to check decorator via scope.hasDecorator()', async () => {
      const app = zent();
      let result;

      app.register(async (scope) => {
        scope.decorate('myDec', 42);
        result = scope.hasDecorator('myDec');
      });

      await app.inject({ method: 'GET', url: '/' }).catch(() => {});

      expect(result).toBe(true);
    });

    it('should support nested register with prefix accumulation', async () => {
      const app = zent();

      app.register(
        async (scope) => {
          scope.register(
            async (innerScope) => {
              innerScope.get('/list', (ctx) => ctx.res.json({ nested: true }));
            },
            { prefix: '/v2' }
          );
        },
        { prefix: '/api' }
      );

      const res = await app.inject({ method: 'GET', url: '/api/v2/list' });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ nested: true });
    });

    it('should inherit decorators from parent plugin scope to nested plugin scope', async () => {
      const app = zent();

      app.register(
        async (scope) => {
          scope.decorate('repo', { find: () => 'ok' });

          scope.register(async (innerScope) => {
            innerScope.get('/check', (ctx) => {
              ctx.res.json({ hasRepo: innerScope.hasDecorator('repo') });
            });
          });
        },
        { prefix: '/api' }
      );

      const res = await app.inject({ method: 'GET', url: '/api/check' });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ hasRepo: true });
    });

    it('should not leak decorators between sibling plugin scopes', async () => {
      const app = zent();

      app.register(
        async (scope) => {
          scope.decorate('aOnly', true);

          scope.get('/a', (ctx) => {
            ctx.res.json({ hasAOnly: scope.hasDecorator('aOnly') });
          });
        },
        { prefix: '/scope-a' }
      );

      app.register(
        async (scope) => {
          scope.get('/b', (ctx) => {
            ctx.res.json({ hasAOnly: scope.hasDecorator('aOnly') });
          });
        },
        { prefix: '/scope-b' }
      );

      const resA = await app.inject({ method: 'GET', url: '/scope-a/a' });
      const resB = await app.inject({ method: 'GET', url: '/scope-b/b' });

      expect(resA.statusCode).toBe(200);
      expect(resA.json()).toEqual({ hasAOnly: true });

      expect(resB.statusCode).toBe(200);
      expect(resB.json()).toEqual({ hasAOnly: false });
    });

    it('should support nested register without inner prefix', async () => {
      const app = zent();

      app.register(
        async (scope) => {
          scope.register(async (innerScope) => {
            innerScope.get('/flat', (ctx) => ctx.res.json({ flat: true }));
          });
        },
        { prefix: '/base' }
      );

      const res = await app.inject({ method: 'GET', url: '/base/flat' });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ flat: true });
    });

    it('should load plugins only once (idempotent)', async () => {
      const app = zent();
      let count = 0;

      app.register(async () => {
        count++;
      });

      await app.inject({ method: 'GET', url: '/' }).catch(() => {});
      await app.inject({ method: 'GET', url: '/' }).catch(() => {});

      expect(count).toBe(1);
    });

    it('should pass plugin opts to plugin function', async () => {
      const app = zent();
      let receivedOpts;

      app.register(
        async (scope, opts) => {
          receivedOpts = opts;
        },
        { prefix: '/api', custom: 'value' }
      );

      await app.inject({ method: 'GET', url: '/' }).catch(() => {});

      expect(receivedOpts).toEqual({ prefix: '/api', custom: 'value' });
    });

    it('should register plugin without prefix (empty string default)', async () => {
      const app = zent();

      app.register(async (scope) => {
        scope.get('/no-prefix', (ctx) => ctx.res.json({ ok: true }));
      });

      const res = await app.inject({ method: 'GET', url: '/no-prefix' });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ ok: true });
    });

    it('should propagate plugin errors during load', async () => {
      const app = zent();

      app.register(async () => {
        throw new Error('plugin init failed');
      });

      await expect(app.inject({ method: 'GET', url: '/' })).rejects.toThrow(
        'plugin init failed'
      );
    });

    it('should load plugins before listen()', async () => {
      const app = zent();
      let loaded = false;

      app.register(async (scope) => {
        loaded = true;
        scope.get('/after-load', (ctx) => ctx.res.json({ loaded: true }));
      });

      const address = await app.listen({ port: 0 });

      expect(loaded).toBe(true);
      expect(address).toContain('http://');

      await app.close();
    });
  });
});
