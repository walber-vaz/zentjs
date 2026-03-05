import { describe, expect, it, vi } from 'vitest';

import { zent } from '../../src/core/application';
import {
  requestMetrics,
  requestMetricsPlugin,
} from '../../src/plugins/request-metrics';

describe('requestMetrics plugin', () => {
  it('should collect method, path, statusCode and duration', async () => {
    const app = zent();
    const records: any[] = [];
    const hooks = requestMetrics({
      onRecord: (record) => {
        records.push(record);
      },
    });

    app.addHook('onRequest', hooks.onRequest);
    app.addHook('onResponse', hooks.onResponse);

    app.get('/health', (ctx) => {
      ctx.res.status(201).json({ ok: true });
    });

    const res = await app.inject({ method: 'GET', url: '/health' });

    expect(res.statusCode).toBe(201);
    expect(records).toHaveLength(1);
    expect(records[0].method).toBe('GET');
    expect(records[0].path).toBe('/health');
    expect(records[0].statusCode).toBe(201);
    expect(records[0].durationMs).toBeGreaterThanOrEqual(0);
  });

  it('should support custom clock and stateKey', async () => {
    const app = zent<any>();
    const records: any[] = [];

    const clock = vi
      .fn()
      .mockReturnValueOnce(1_000_000_000n)
      .mockReturnValueOnce(1_015_000_000n);

    const hooks = requestMetrics<any>({
      clock,
      stateKey: '__custom_start',
      onRecord: (record, ctx) => {
        records.push(record);
        expect(ctx.state.__custom_start).toBe(1_000_000_000n);
      },
    });

    app.addHook('onRequest', hooks.onRequest);
    app.addHook('onResponse', hooks.onResponse);

    app.get('/timed', (ctx) => {
      ctx.res.json({ ok: true });
    });

    await app.inject({ method: 'GET', url: '/timed' });

    expect(records).toHaveLength(1);
    expect(records[0].durationMs).toBe(15);
  });

  it('should be scoped when registered inside plugin', async () => {
    const app = zent();
    const records: any[] = [];

    app.register(
      async (scope) => {
        await requestMetricsPlugin({
          onRecord: (record) => records.push(record),
        })(scope);

        scope.get('/a', (ctx) => {
          ctx.res.json({ ok: true });
        });
      },
      { prefix: '/api' }
    );

    app.get('/root', (ctx) => {
      ctx.res.json({ ok: true });
    });

    await app.inject({ method: 'GET', url: '/api/a' });
    await app.inject({ method: 'GET', url: '/root' });

    expect(records).toHaveLength(1);
    expect(records[0].path).toBe('/api/a');
  });

  it('should no-op onResponse when start time is missing', async () => {
    const hooks = requestMetrics();
    const ctx: any = {
      state: {},
      req: { method: 'GET', path: '/x' },
      res: { statusCode: 200 },
    };

    await expect(hooks.onResponse(ctx)).resolves.toBeUndefined();
  });

  it('should work with default onRecord callback', async () => {
    const hooks = requestMetrics();
    const ctx: any = {
      state: {},
      req: { method: 'GET', path: '/x' },
      res: { statusCode: 200 },
    };

    await hooks.onRequest(ctx);

    await expect(hooks.onResponse(ctx)).resolves.toBeUndefined();
  });
});
