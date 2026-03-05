import { describe, expect, it, vi } from 'vitest';

import { compose } from '../../src/middleware/pipeline';

describe('Pipeline (compose)', () => {
  describe('validation', () => {
    it('should throw TypeError if middlewares is not an array', () => {
      expect(() => compose('not-array' as any)).toThrow(TypeError);
      expect(() => compose('not-array' as any)).toThrow(
        'middlewares must be an array'
      );
    });

    it('should throw TypeError if any middleware is not a function', () => {
      expect(() =>
        compose([(() => {}) as any, 'string' as any, (() => {}) as any])
      ).toThrow(TypeError);
      expect(() =>
        compose([(() => {}) as any, 'string' as any, (() => {}) as any])
      ).toThrow('Middleware at index 1 must be a function, got string');
    });

    it('should accept an empty array', () => {
      expect(() => compose([])).not.toThrow();
    });
  });

  describe('execution order (onion model)', () => {
    it('should execute middlewares in order', async () => {
      const order: string[] = [];

      const mw1 = async (_ctx: any, next: any) => {
        order.push('mw1-before');
        await next();
        order.push('mw1-after');
      };

      const mw2 = async (_ctx: any, next: any) => {
        order.push('mw2-before');
        await next();
        order.push('mw2-after');
      };

      const pipeline = compose([mw1, mw2]);
      await pipeline({} as any);

      expect(order).toEqual([
        'mw1-before',
        'mw2-before',
        'mw2-after',
        'mw1-after',
      ]);
    });

    it('should execute single middleware', async () => {
      const fn = vi.fn(async (_ctx: any, next: any) => {
        await next();
      });

      const pipeline = compose([fn]);
      await pipeline({} as any);

      expect(fn).toHaveBeenCalledOnce();
    });

    it('should resolve when no middlewares', async () => {
      const pipeline = compose([]);
      await expect(pipeline({} as any)).resolves.toBeUndefined();
    });
  });

  describe('context passing', () => {
    it('should pass ctx through all middlewares', async () => {
      const ctx: any = { state: {} };

      const mw1 = async (ctx: any, next: any) => {
        ctx.state.user = 'alice';
        await next();
      };

      const mw2 = async (ctx: any, next: any) => {
        ctx.state.role = 'admin';
        await next();
      };

      const pipeline = compose([mw1, mw2]);
      await pipeline(ctx);

      expect(ctx.state).toEqual({ user: 'alice', role: 'admin' });
    });

    it('should allow downstream middleware to read upstream state', async () => {
      const ctx: any = { state: {} };
      let captured: any;

      const mw1 = async (ctx: any, next: any) => {
        ctx.state.token = 'abc123';
        await next();
      };

      const mw2 = async (ctx: any, next: any) => {
        captured = ctx.state.token;
        await next();
      };

      const pipeline = compose([mw1, mw2]);
      await pipeline(ctx);

      expect(captured).toBe('abc123');
    });
  });

  describe('finalHandler', () => {
    it('should call finalHandler after all middlewares', async () => {
      const order: string[] = [];

      const mw = async (_ctx: any, next: any) => {
        order.push('mw-before');
        await next();
        order.push('mw-after');
      };

      const handler = async () => {
        order.push('handler');
      };

      const pipeline = compose([mw]);
      await pipeline({} as any, handler as any);

      expect(order).toEqual(['mw-before', 'handler', 'mw-after']);
    });

    it('should pass ctx to finalHandler', async () => {
      const ctx: any = { state: { ready: true } };
      let received: any;

      const handler = async (ctx: any) => {
        received = ctx.state.ready;
      };

      const pipeline = compose([]);
      await pipeline(ctx, handler);

      expect(received).toBe(true);
    });

    it('should work without finalHandler', async () => {
      const fn = vi.fn(async (_ctx: any, next: any) => {
        await next();
      });

      const pipeline = compose([fn]);
      await expect(pipeline({} as any)).resolves.toBeUndefined();
    });
  });

  describe('next() safety', () => {
    it('should reject if next() is called multiple times', async () => {
      const mw = async (_ctx: any, next: any) => {
        await next();
        await next(); // double call
      };

      const pipeline = compose([mw]);

      await expect(pipeline({} as any)).rejects.toThrow(
        'next() called multiple times'
      );
    });

    it('should work when middleware does not call next() (short-circuit)', async () => {
      const order: string[] = [];

      const mw1 = async () => {
        order.push('mw1'); // does NOT call next()
      };

      const mw2 = async (_ctx: any, next: any) => {
        order.push('mw2');
        await next();
      };

      const pipeline = compose([mw1, mw2] as any);
      await pipeline({} as any);

      // mw2 should never execute
      expect(order).toEqual(['mw1']);
    });
  });

  describe('error handling', () => {
    it('should propagate async errors', async () => {
      const mw = async () => {
        throw new Error('async boom');
      };

      const pipeline = compose([mw] as any);

      await expect(pipeline({} as any)).rejects.toThrow('async boom');
    });

    it('should propagate sync errors', async () => {
      const mw = () => {
        throw new Error('sync boom');
      };

      const pipeline = compose([mw] as any);

      await expect(pipeline({} as any)).rejects.toThrow('sync boom');
    });

    it('should propagate errors from finalHandler', async () => {
      const mw = async (_ctx: any, next: any) => {
        await next();
      };

      const handler = async () => {
        throw new Error('handler error');
      };

      const pipeline = compose([mw]);

      await expect(pipeline({} as any, handler as any)).rejects.toThrow(
        'handler error'
      );
    });

    it('should allow middleware to catch and handle errors', async () => {
      const ctx: any = { state: {} };

      const errorCatcher = async (ctx: any, next: any) => {
        try {
          await next();
        } catch (err: any) {
          ctx.state.error = err.message;
        }
      };

      const thrower = async () => {
        throw new Error('caught');
      };

      const pipeline = compose([errorCatcher, thrower] as any);
      await pipeline(ctx);

      expect(ctx.state.error).toBe('caught');
    });

    it('should propagate error from downstream to upstream after-phase', async () => {
      const order: string[] = [];

      const mw1 = async (_ctx: any, next: any) => {
        order.push('mw1-before');
        try {
          await next();
        } catch {
          order.push('mw1-caught');
        }
        order.push('mw1-after');
      };

      const mw2 = async () => {
        order.push('mw2');
        throw new Error('fail');
      };

      const pipeline = compose([mw1, mw2] as any);
      await pipeline({} as any);

      expect(order).toEqual(['mw1-before', 'mw2', 'mw1-caught', 'mw1-after']);
    });
  });

  describe('async behavior', () => {
    it('should handle async operations in middlewares', async () => {
      const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
      const order: string[] = [];

      const mw = async (_ctx: any, next: any) => {
        order.push('start');
        await delay(10);
        order.push('after-delay');
        await next();
      };

      const pipeline = compose([mw]);
      await pipeline({} as any);

      expect(order).toEqual(['start', 'after-delay']);
    });

    it('should handle sync middlewares (non-async functions)', async () => {
      const order: string[] = [];

      const syncMw = (_ctx: any, next: any) => {
        order.push('sync');
        return next();
      };

      const pipeline = compose([syncMw]);
      await pipeline({} as any);

      expect(order).toEqual(['sync']);
    });
  });
});
