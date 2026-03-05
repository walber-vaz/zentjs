import { describe, expect, it, vi } from 'vitest';

import { HOOK_PHASES, Lifecycle } from '../../src/hooks/lifecycle';

describe('Lifecycle', () => {
  describe('HOOK_PHASES', () => {
    it('should export all 7 phases in correct order', () => {
      expect(HOOK_PHASES).toEqual([
        'onRequest',
        'preParsing',
        'preValidation',
        'preHandler',
        'onSend',
        'onResponse',
        'onError',
      ]);
    });

    it('should be frozen (immutable)', () => {
      expect(Object.isFrozen(HOOK_PHASES)).toBe(true);
    });
  });

  describe('addHook()', () => {
    it('should register a hook for a valid phase', () => {
      const lc = new Lifecycle();
      const fn = () => {};

      lc.addHook('onRequest', fn);

      expect(lc.getHooks('onRequest')).toContain(fn);
    });

    it('should allow multiple hooks on the same phase', () => {
      const lc = new Lifecycle();
      const fn1 = () => {};
      const fn2 = () => {};

      lc.addHook('preHandler', fn1);
      lc.addHook('preHandler', fn2);

      expect(lc.getHooks('preHandler')).toEqual([fn1, fn2]);
    });

    it('should throw Error for invalid phase', () => {
      const lc = new Lifecycle();

      expect(() => lc.addHook('invalid' as any, () => {})).toThrow(Error);
      expect(() => lc.addHook('invalid' as any, () => {})).toThrow(
        'Invalid hook phase: "invalid"'
      );
    });

    it('should throw TypeError if fn is not a function', () => {
      const lc = new Lifecycle();

      expect(() => lc.addHook('onRequest', 'not-fn' as any)).toThrow(TypeError);
      expect(() => lc.addHook('onRequest', 'not-fn' as any)).toThrow(
        'Hook must be a function, got string'
      );
    });
  });

  describe('getHooks()', () => {
    it('should return empty array for phase with no hooks', () => {
      const lc = new Lifecycle();

      expect(lc.getHooks('onRequest')).toEqual([]);
    });

    it('should return empty array for unknown phase', () => {
      const lc = new Lifecycle();

      expect(lc.getHooks('unknown' as any)).toEqual([]);
    });
  });

  describe('hasHooks()', () => {
    it('should return false for phase with no hooks', () => {
      const lc = new Lifecycle();

      expect(lc.hasHooks('onRequest')).toBe(false);
    });

    it('should return true after adding a hook', () => {
      const lc = new Lifecycle();
      lc.addHook('onRequest', () => {});

      expect(lc.hasHooks('onRequest')).toBe(true);
    });

    it('should return false for unknown phase', () => {
      const lc = new Lifecycle();

      expect(lc.hasHooks('nonexistent' as any)).toBe(false);
    });
  });

  describe('run() — standard phases', () => {
    it('should execute hooks sequentially', async () => {
      const lc = new Lifecycle();
      const order: number[] = [];

      lc.addHook('onRequest', async () => order.push(1));
      lc.addHook('onRequest', async () => order.push(2));
      lc.addHook('onRequest', async () => order.push(3));

      await lc.run('onRequest', {} as any);

      expect(order).toEqual([1, 2, 3]);
    });

    it('should pass ctx to each hook', async () => {
      const lc = new Lifecycle();
      const ctx: any = { state: {} };

      lc.addHook('preHandler', async (ctx: any) => {
        ctx.state.processed = true;
      });

      await lc.run('preHandler', ctx);

      expect(ctx.state.processed).toBe(true);
    });

    it('should handle phase with no hooks (no-op)', async () => {
      const lc = new Lifecycle();

      await expect(lc.run('onRequest', {} as any)).resolves.toBeUndefined();
    });

    it('should propagate errors from hooks', async () => {
      const lc = new Lifecycle();

      lc.addHook('preHandler', async () => {
        throw new Error('hook failed');
      });

      await expect(lc.run('preHandler', {} as any)).rejects.toThrow(
        'hook failed'
      );
    });

    it('should stop execution after error', async () => {
      const lc = new Lifecycle();
      const fn2 = vi.fn();

      lc.addHook('preHandler', async () => {
        throw new Error('stop');
      });
      lc.addHook('preHandler', fn2);

      await expect(lc.run('preHandler', {} as any)).rejects.toThrow('stop');
      expect(fn2).not.toHaveBeenCalled();
    });
  });

  describe('run() — onSend phase', () => {
    it('should pass payload through hooks and return final value', async () => {
      const lc = new Lifecycle();

      lc.addHook('onSend', async (_ctx: any, payload: any) => {
        return { ...payload, modified: true };
      });

      const result = await lc.run('onSend', {} as any, { data: 'hello' });

      expect(result).toEqual({ data: 'hello', modified: true });
    });

    it('should chain payload transformations', async () => {
      const lc = new Lifecycle();

      lc.addHook('onSend', async (_ctx: any, payload: any) => {
        return payload + ' world';
      });

      lc.addHook('onSend', async (_ctx: any, payload: any) => {
        return payload.toUpperCase();
      });

      const result = await lc.run('onSend', {} as any, 'hello');

      expect(result).toBe('HELLO WORLD');
    });

    it('should keep current payload if hook returns undefined', async () => {
      const lc = new Lifecycle();

      lc.addHook('onSend', async () => {
        // does not return anything, just logs
      });

      const result = await lc.run('onSend', {} as any, 'original');

      expect(result).toBe('original');
    });

    it('should return original payload when no onSend hooks', async () => {
      const lc = new Lifecycle();

      const result = await lc.run('onSend', {} as any, 'untouched');

      expect(result).toBe('untouched');
    });
  });

  describe('run() — onError phase', () => {
    it('should pass ctx and error to each hook', async () => {
      const lc = new Lifecycle();
      const ctx: any = { state: {} };
      const error = new Error('test error');
      let captured: any;

      lc.addHook('onError', async (ctx: any, err: any) => {
        captured = err;
        ctx.state.errorHandled = true;
      });

      await lc.run('onError', ctx, error);

      expect(captured).toBe(error);
      expect(ctx.state.errorHandled).toBe(true);
    });

    it('should execute multiple onError hooks in order', async () => {
      const lc = new Lifecycle();
      const order: string[] = [];

      lc.addHook('onError', async () => order.push('handler1'));
      lc.addHook('onError', async () => order.push('handler2'));

      await lc.run('onError', {} as any, new Error('fail'));

      expect(order).toEqual(['handler1', 'handler2']);
    });
  });

  describe('clone()', () => {
    it('should create independent copy with same hooks', () => {
      const lc = new Lifecycle();
      const fn1 = () => {};
      const fn2 = () => {};

      lc.addHook('onRequest', fn1);
      lc.addHook('preHandler', fn2);

      const cloned = lc.clone();

      expect(cloned.getHooks('onRequest')).toEqual([fn1]);
      expect(cloned.getHooks('preHandler')).toEqual([fn2]);
    });

    it('should not affect original when cloned is modified', () => {
      const lc = new Lifecycle();
      const fn1 = () => {};

      lc.addHook('onRequest', fn1);

      const cloned = lc.clone();
      cloned.addHook('onRequest', () => {});

      expect(lc.getHooks('onRequest')).toHaveLength(1);
      expect(cloned.getHooks('onRequest')).toHaveLength(2);
    });

    it('should not affect clone when original is modified', () => {
      const lc = new Lifecycle();

      const cloned = lc.clone();
      lc.addHook('preHandler', () => {});

      expect(cloned.getHooks('preHandler')).toHaveLength(0);
      expect(lc.getHooks('preHandler')).toHaveLength(1);
    });
  });
});
