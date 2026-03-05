import { Context } from '../core/context';
import { AnyDecorators, AnyState } from '../types/util';
import { HttpError, InternalServerError } from './http-error';

export class ErrorHandler<
  TState extends AnyState = AnyState,
  TDecorators extends AnyDecorators = AnyDecorators,
> {
  #customHandler:
    | ((
        error: Error,
        ctx: Context<TState, TDecorators>
      ) => void | Promise<void>)
    | null;

  constructor() {
    this.#customHandler = null;
  }

  setErrorHandler(
    fn: (
      error: Error,
      ctx: Context<TState, TDecorators>
    ) => void | Promise<void>
  ) {
    if (typeof fn !== 'function') {
      throw new TypeError(`Error handler must be a function, got ${typeof fn}`);
    }

    this.#customHandler = fn;
  }

  async handle(error: Error, ctx: Context<TState, TDecorators>) {
    if (ctx.res.sent) return;

    const httpError =
      error instanceof HttpError
        ? error
        : new InternalServerError(error.message || 'Internal Server Error');

    if (this.#customHandler) {
      try {
        await this.#customHandler(httpError, ctx);
      } catch {
        this.#defaultHandler(httpError, ctx);
      }
      return;
    }

    this.#defaultHandler(httpError, ctx);
  }

  #defaultHandler(error: HttpError, ctx: Context<TState, TDecorators>) {
    if (ctx.res.sent) return;

    ctx.res.status(error.statusCode).json(error.toJSON());
  }
}
