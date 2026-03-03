import { describe, expect, it } from 'vitest';

import { PluginManager } from '../../src/plugins/manager.mjs';

describe('PluginManager', () => {
  // ─── constructor ──────────────────────────────────────

  describe('constructor', () => {
    it('should create a PluginManager with empty queue', () => {
      const pm = new PluginManager();

      expect(pm.loaded).toBe(false);
      expect(pm.size).toBe(0);
    });
  });

  // ─── register() ──────────────────────────────────────

  describe('register()', () => {
    it('should register a plugin function', () => {
      const pm = new PluginManager();
      const plugin = async () => {};

      pm.register(plugin);

      expect(pm.size).toBe(1);
    });

    it('should register a plugin with options', () => {
      const pm = new PluginManager();
      const plugin = async () => {};

      pm.register(plugin, { prefix: '/api' });

      expect(pm.size).toBe(1);
    });

    it('should register multiple plugins', () => {
      const pm = new PluginManager();

      pm.register(async () => {});
      pm.register(async () => {});
      pm.register(async () => {});

      expect(pm.size).toBe(3);
    });

    it('should throw TypeError if fn is not a function', () => {
      const pm = new PluginManager();

      expect(() => pm.register('not-a-function')).toThrow(TypeError);
      expect(() => pm.register('not-a-function')).toThrow(
        'Plugin must be a function, got string'
      );
    });

    it('should throw TypeError for null plugin', () => {
      const pm = new PluginManager();

      expect(() => pm.register(null)).toThrow(TypeError);
    });

    it('should throw TypeError for number plugin', () => {
      const pm = new PluginManager();

      expect(() => pm.register(42)).toThrow(TypeError);
      expect(() => pm.register(42)).toThrow(
        'Plugin must be a function, got number'
      );
    });

    it('should throw Error if plugins already loaded', async () => {
      const pm = new PluginManager();

      await pm.load(() => ({}));

      expect(() => pm.register(async () => {})).toThrow(
        'Cannot register plugins after they have been loaded'
      );
    });
  });

  // ─── load() ───────────────────────────────────────────

  describe('load()', () => {
    it('should load all registered plugins sequentially', async () => {
      const pm = new PluginManager();
      const order = [];

      pm.register(async () => {
        order.push('plugin-1');
      });

      pm.register(async () => {
        order.push('plugin-2');
      });

      await pm.load(() => ({}));

      expect(order).toEqual(['plugin-1', 'plugin-2']);
      expect(pm.loaded).toBe(true);
    });

    it('should call createScope for each plugin', async () => {
      const pm = new PluginManager();
      const scopes = [];

      pm.register(async (app) => {
        scopes.push(app);
      });

      pm.register(async (app) => {
        scopes.push(app);
      });

      let callCount = 0;
      await pm.load(() => {
        callCount++;
        return { id: callCount };
      });

      expect(callCount).toBe(2);
      expect(scopes).toEqual([{ id: 1 }, { id: 2 }]);
    });

    it('should pass opts to createScope', async () => {
      const pm = new PluginManager();
      const receivedOpts = [];

      pm.register(async () => {}, { prefix: '/api' });
      pm.register(async () => {}, { prefix: '/admin' });

      await pm.load((opts) => {
        receivedOpts.push(opts);
        return {};
      });

      expect(receivedOpts).toEqual([{ prefix: '/api' }, { prefix: '/admin' }]);
    });

    it('should pass opts to plugin function', async () => {
      const pm = new PluginManager();
      let receivedOpts;

      pm.register(
        async (app, opts) => {
          receivedOpts = opts;
        },
        { prefix: '/api', custom: 42 }
      );

      await pm.load(() => ({}));

      expect(receivedOpts).toEqual({ prefix: '/api', custom: 42 });
    });

    it('should preserve symbol-based scope metadata in opts', async () => {
      const pm = new PluginManager();
      const scopeToken = Symbol('scope-token');
      const scopeState = { inherited: true };
      let createScopeOpts;
      let pluginOpts;

      pm.register(
        async (app, opts) => {
          pluginOpts = opts;
        },
        {
          prefix: '/api',
          [scopeToken]: scopeState,
        }
      );

      await pm.load((opts) => {
        createScopeOpts = opts;
        return {};
      });

      expect(createScopeOpts[scopeToken]).toBe(scopeState);
      expect(pluginOpts[scopeToken]).toBe(scopeState);
    });

    it('should handle async plugins that return promises', async () => {
      const pm = new PluginManager();
      const order = [];

      pm.register(async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        order.push('slow-plugin');
      });

      pm.register(async () => {
        order.push('fast-plugin');
      });

      await pm.load(() => ({}));

      expect(order).toEqual(['slow-plugin', 'fast-plugin']);
    });

    it('should propagate plugin errors', async () => {
      const pm = new PluginManager();

      pm.register(async () => {
        throw new Error('Plugin failed');
      });

      await expect(pm.load(() => ({}))).rejects.toThrow('Plugin failed');
    });

    it('should throw TypeError if createScope is not a function', async () => {
      const pm = new PluginManager();
      pm.register(async () => {});

      await expect(pm.load('not-fn')).rejects.toThrow(TypeError);
      await expect(pm.load('not-fn')).rejects.toThrow(
        'createScope must be a function'
      );
    });

    it('should throw Error if already loaded', async () => {
      const pm = new PluginManager();

      await pm.load(() => ({}));

      await expect(pm.load(() => ({}))).rejects.toThrow(
        'Plugins have already been loaded'
      );
    });

    it('should set loaded to true even with empty queue', async () => {
      const pm = new PluginManager();

      await pm.load(() => ({}));

      expect(pm.loaded).toBe(true);
      expect(pm.size).toBe(0);
    });

    it('should work with sync plugin functions', async () => {
      const pm = new PluginManager();
      let called = false;

      pm.register(() => {
        called = true;
      });

      await pm.load(() => ({}));

      expect(called).toBe(true);
    });
  });

  // ─── size ─────────────────────────────────────────────

  describe('size', () => {
    it('should return 0 for new instance', () => {
      const pm = new PluginManager();

      expect(pm.size).toBe(0);
    });

    it('should increment after each register', () => {
      const pm = new PluginManager();

      pm.register(async () => {});
      expect(pm.size).toBe(1);

      pm.register(async () => {});
      expect(pm.size).toBe(2);
    });
  });

  // ─── loaded ───────────────────────────────────────────

  describe('loaded', () => {
    it('should be false before load', () => {
      const pm = new PluginManager();

      expect(pm.loaded).toBe(false);
    });

    it('should be true after load', async () => {
      const pm = new PluginManager();

      await pm.load(() => ({}));

      expect(pm.loaded).toBe(true);
    });

    it('should remain false if load throws', async () => {
      const pm = new PluginManager();
      pm.register(async () => {
        throw new Error('fail');
      });

      try {
        await pm.load(() => ({}));
      } catch {
        // expected
      }

      expect(pm.loaded).toBe(false);
    });
  });
});
