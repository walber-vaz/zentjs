import { Context } from '../core/context';
import { ZentPluginScope } from '../types/plugin';
import { AnyDecorators, AnyState, MaybePromise } from '../types/util';

export interface RequestMetricRecord {
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
}

export interface RequestMetricsOptions<
  TState extends AnyState = AnyState,
  TDecorators extends AnyDecorators = AnyDecorators,
> {
  onRecord?: (
    record: RequestMetricRecord,
    ctx: Context<TState, TDecorators>
  ) => MaybePromise<void>;
  clock?: () => bigint;
  stateKey?: string;
}

export function requestMetrics<
  TState extends AnyState = AnyState,
  TDecorators extends AnyDecorators = AnyDecorators,
>(opts: RequestMetricsOptions<TState, TDecorators> = {}) {
  const onRecord = opts.onRecord || (async () => {});
  const clock = opts.clock || process.hrtime.bigint;
  const stateKey = opts.stateKey || '__zent_request_metrics_start';

  return {
    async onRequest(ctx: Context<TState, TDecorators>) {
      (ctx.state as Record<string, unknown>)[stateKey] = clock();
    },

    async onResponse(ctx: Context<TState, TDecorators>) {
      const start = (ctx.state as Record<string, unknown>)[stateKey];
      if (typeof start !== 'bigint') return;

      const durationMs = Number(clock() - start) / 1_000_000;

      const record: RequestMetricRecord = {
        method: ctx.req.method,
        path: ctx.req.path,
        statusCode: ctx.res.statusCode,
        durationMs,
      };

      await onRecord(record, ctx);
    },
  };
}

export function requestMetricsPlugin<
  TState extends AnyState = AnyState,
  TDecorators extends AnyDecorators = AnyDecorators,
>(opts: RequestMetricsOptions<TState, TDecorators> = {}) {
  const hooks = requestMetrics(opts);

  return async function registerRequestMetrics(
    app: ZentPluginScope<TState, TDecorators>
  ) {
    app.addHook('onRequest', hooks.onRequest);
    app.addHook('onResponse', hooks.onResponse);
  };
}
