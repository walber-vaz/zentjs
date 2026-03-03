import { describe, expect, it } from 'vitest';

import {
  MethodNotAllowedError,
  NotFoundError,
} from '../../src/errors/http-error.mjs';
import { Router } from '../../src/router/index.mjs';

describe('Router', () => {
  describe('convenience methods', () => {
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
      it(`should register and find ${method.toUpperCase()} route`, () => {
        const router = new Router();
        const handler = () => method;
        router[method]('/test', handler);

        const result = router.find(method.toUpperCase(), '/test');

        expect(result.route.handler).toBe(handler);
      });
    }
  });

  describe('route()', () => {
    it('should register a full route definition', () => {
      const router = new Router();
      const handler = () => {};
      const middleware = () => {};

      router.route({
        method: 'POST',
        path: '/users',
        handler,
        middlewares: [middleware],
        hooks: { preHandler: [() => {}] },
      });

      const result = router.find('POST', '/users');

      expect(result.route.handler).toBe(handler);
      expect(result.route.middlewares).toHaveLength(1);
      expect(result.route.middlewares[0]).toBe(middleware);
    });

    it('should uppercase method automatically', () => {
      const router = new Router();
      const handler = () => {};
      router.route({ method: 'get', path: '/test', handler });

      const result = router.find('GET', '/test');

      expect(result.route.handler).toBe(handler);
    });
  });

  describe('all()', () => {
    it('should register handler for all HTTP methods', () => {
      const router = new Router();
      const handler = () => 'all';
      router.all('/health', handler);

      const methods = [
        'GET',
        'POST',
        'PUT',
        'PATCH',
        'DELETE',
        'HEAD',
        'OPTIONS',
      ];
      for (const method of methods) {
        const result = router.find(method, '/health');
        expect(result.route.handler).toBe(handler);
      }
    });
  });

  describe('find()', () => {
    it('should return route and params', () => {
      const router = new Router();
      const handler = () => {};
      router.get('/users/:id', handler);

      const result = router.find('GET', '/users/42');

      expect(result.route.handler).toBe(handler);
      expect(result.params).toEqual({ id: '42' });
    });

    it('should throw NotFoundError for missing route', () => {
      const router = new Router();

      expect(() => router.find('GET', '/nope')).toThrow(NotFoundError);
    });

    it('should throw MethodNotAllowedError for wrong method', () => {
      const router = new Router();
      router.get('/users', () => {});

      expect(() => router.find('DELETE', '/users')).toThrow(
        MethodNotAllowedError
      );
    });
  });

  describe('group()', () => {
    it('should prefix routes with group prefix', () => {
      const router = new Router();
      const handler = () => 'list';

      router.group('/api/v1', (group) => {
        group.get('/users', handler);
      });

      const result = router.find('GET', '/api/v1/users');

      expect(result.route.handler).toBe(handler);
    });

    it('should handle root path inside group', () => {
      const router = new Router();
      const handler = () => 'root';

      router.group('/health', (group) => {
        group.get('/', handler);
      });

      const result = router.find('GET', '/health');

      expect(result.route.handler).toBe(handler);
    });

    it('should merge group middlewares with route middlewares', () => {
      const router = new Router();
      const groupMw = () => 'group';
      const routeMw = () => 'route';
      const handler = () => {};

      router.group('/api', { middlewares: [groupMw] }, (group) => {
        group.get('/users', handler, { middlewares: [routeMw] });
      });

      const result = router.find('GET', '/api/users');

      expect(result.route.middlewares).toEqual([groupMw, routeMw]);
    });

    it('should merge group hooks with route hooks', () => {
      const router = new Router();
      const groupHook = () => 'group-hook';
      const routeHook = () => 'route-hook';
      const handler = () => {};

      router.group('/api', { hooks: { preHandler: [groupHook] } }, (group) => {
        group.get('/users', handler, {
          hooks: { preHandler: [routeHook] },
        });
      });

      const result = router.find('GET', '/api/users');

      expect(result.route.hooks.preHandler).toEqual([groupHook, routeHook]);
    });

    it('should support nested groups', () => {
      const router = new Router();
      const handler = () => 'nested';

      router.group('/api', (api) => {
        api.group('/v1', (v1) => {
          v1.get('/users', handler);
        });
      });

      const result = router.find('GET', '/api/v1/users');

      expect(result.route.handler).toBe(handler);
    });

    it('should accumulate middlewares across nested groups', () => {
      const router = new Router();
      const mw1 = () => '1';
      const mw2 = () => '2';
      const mw3 = () => '3';
      const handler = () => {};

      router.group('/api', { middlewares: [mw1] }, (api) => {
        api.group('/v1', { middlewares: [mw2] }, (v1) => {
          v1.get('/users', handler, { middlewares: [mw3] });
        });
      });

      const result = router.find('GET', '/api/v1/users');

      expect(result.route.middlewares).toEqual([mw1, mw2, mw3]);
    });

    it('should support all() inside group', () => {
      const router = new Router();
      const handler = () => 'all';

      router.group('/api', (group) => {
        group.all('/status', handler);
      });

      expect(router.find('GET', '/api/status').route.handler).toBe(handler);
      expect(router.find('POST', '/api/status').route.handler).toBe(handler);
    });

    it('should support route() inside group', () => {
      const router = new Router();
      const handler = () => {};

      router.group('/api', (group) => {
        group.route({
          method: 'POST',
          path: '/items',
          handler,
          middlewares: [],
        });
      });

      const result = router.find('POST', '/api/items');

      expect(result.route.handler).toBe(handler);
    });

    it('should not leak group routes to parent scope', () => {
      const router = new Router();

      router.group('/api', (group) => {
        group.get('/users', () => {});
      });

      // /users (without /api prefix) should not exist
      expect(() => router.find('GET', '/users')).toThrow(NotFoundError);
    });

    it('should handle group with null opts gracefully', () => {
      const router = new Router();
      const handler = () => 'ok';

      router.group('/api', null, (group) => {
        group.get('/items', handler);
      });

      const result = router.find('GET', '/api/items');

      expect(result.route.handler).toBe(handler);
    });

    it('should handle nested group with null opts gracefully', () => {
      const router = new Router();
      const handler = () => 'nested';

      router.group('/api', (api) => {
        api.group('/v1', null, (v1) => {
          v1.get('/data', handler);
        });
      });

      const result = router.find('GET', '/api/v1/data');

      expect(result.route.handler).toBe(handler);
    });

    it('should merge hooks when child provides single function instead of array', () => {
      const router = new Router();
      const parentHook = () => 'parent';
      const childHook = () => 'child';
      const handler = () => {};

      router.group('/api', { hooks: { preHandler: [parentHook] } }, (api) => {
        api.group('/v1', { hooks: { preHandler: childHook } }, (v1) => {
          v1.get('/users', handler);
        });
      });

      const result = router.find('GET', '/api/v1/users');

      expect(result.route.hooks.preHandler).toEqual([parentHook, childHook]);
    });

    it('should merge hooks when child has a hook type not present in parent', () => {
      const router = new Router();
      const parentHook = () => 'pre';
      const childHook = () => 'response';
      const handler = () => {};

      router.group('/api', { hooks: { preHandler: [parentHook] } }, (api) => {
        api.group('/v1', { hooks: { onResponse: [childHook] } }, (v1) => {
          v1.get('/users', handler);
        });
      });

      const result = router.find('GET', '/api/v1/users');

      expect(result.route.hooks.preHandler).toEqual([parentHook]);
      expect(result.route.hooks.onResponse).toEqual([childHook]);
    });
  });
});
