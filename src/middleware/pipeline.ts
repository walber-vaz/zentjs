/**
 * Pipeline — Compõe middlewares no padrão Onion (Koa-style).
 *
 * Cada middleware tem a assinatura: async (ctx, next) => {}
 *   - ctx:  Contexto da requisição (req, res, app, state)
 *   - next: Função que delega execução para o próximo middleware
 *
 * O compose retorna uma função (ctx) => Promise<void> que executa
 * toda a cadeia na ordem, permitindo lógica "before" e "after" via await next().
 *
 * @module middleware/pipeline
 */

import { Context } from '../core/context';
import { AnyDecorators, AnyState } from '../types/util';

/**
 * Compõe um array de middlewares em uma única função executável.
 */
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

  /**
   * @param {Context<TState, TDecorators>} ctx - Contexto da requisição
   * @param {Function} [finalHandler] - Função final opcional (ex: route handler)
   * @returns {Promise<void>}
   */
  return function pipeline(
    ctx: Context<TState, TDecorators>,
    finalHandler?: (ctx: Context<TState, TDecorators>) => Promise<void>
  ): Promise<void> {
    let index = -1;

    return dispatch(0);

    /**
     * Executa o middleware no índice `i`.
     */
    function dispatch(i: number): Promise<void> {
      // Proteção contra chamada duplicada de next()
      if (i <= index) {
        return Promise.reject(
          new Error('next() called multiple times in the same middleware')
        );
      }

      index = i;

      // Seleciona o middleware atual ou o finalHandler (último da cadeia)
      const fn = i < middlewares.length ? middlewares[i] : finalHandler;

      // Nenhuma função restante — cadeia termina
      if (!fn) {
        return Promise.resolve();
      }

      try {
        // Chama fn(ctx, next) onde next() avança para dispatch(i + 1)
        return Promise.resolve(fn(ctx, dispatch.bind(null, i + 1)));
      } catch (err) {
        // Captura erros síncronos lançados pelo middleware
        return Promise.reject(err);
      }
    }
  };
}
