import { Context } from '../core/context';
import { AnyDecorators, AnyState } from '../types/util';

export function compose<
  TState extends AnyState = AnyState,
  TDecorators extends AnyDecorators = AnyDecorators,
>(
  middlewares: Array<
    (
      ctx: Context<TState, TDecorators>,
      next: () => Promise<void>
    ) => Promise<void>
  >
): (
  ctx: Context<TState, TDecorators>,
  finalHandler?: (ctx: Context<TState, TDecorators>) => Promise<void>
) => Promise<void> {
  if (!Array.isArray(middlewares)) {
    throw new TypeError('middlewares must be an array');
  }

  for (let i = 0; i < middlewares.length; i++) {
    if (typeof middlewares[i] !== 'function') {
      throw new TypeError(
        `Middleware at index ${i} must be a function, got ${typeof middlewares[i]}`
      );
    }
  }

  return function pipeline(
    ctx: Context<TState, TDecorators>,
    finalHandler?: (ctx: Context<TState, TDecorators>) => Promise<void>
  ): Promise<void> {
    let index = -1;

    return dispatch(0);

    function dispatch(i: number): Promise<void> {
      if (i <= index) {
        return Promise.reject(
          new Error('next() called multiple times in the same middleware')
        );
      }

      index = i;

      const fn = i < middlewares.length ? middlewares[i] : finalHandler;

      if (!fn) {
        return Promise.resolve();
      }

      try {
        return Promise.resolve(fn(ctx, dispatch.bind(null, i + 1)));
      } catch (err) {
        return Promise.reject(err);
      }
    }
  };
}
