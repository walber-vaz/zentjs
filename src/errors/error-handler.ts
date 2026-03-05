/**
 * ErrorHandler — Handler centralizado de erros para o framework.
 *
 * Responsabilidades:
 *   - Converter qualquer erro em uma resposta HTTP coerente
 *   - Suportar handler customizado definido pelo usuário
 *   - Garantir que erros nunca crashem o processo
 *   - Invocar hooks onError do lifecycle
 *
 * @module errors/error-handler
 */

import { Context } from '../core/context';
import { AnyDecorators, AnyState } from '../types/util';
import { HttpError, InternalServerError } from './http-error';

/**
 * Gerencia o tratamento de erros do framework.
 * O usuário pode fornecer um handler customizado via setErrorHandler().
 */
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

  /**
   * Define um handler customizado de erros.
   * O handler recebe (error, ctx) e deve enviar a resposta via ctx.res.
   *
   * @param {(error: Error, ctx: Context<TState, TDecorators>) => void | Promise<void>} fn
   * @throws {TypeError} Se fn não for uma função
   */
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

  /**
   * Trata um erro, enviando a resposta HTTP apropriada.
   *
   * Fluxo:
   *   1. Se a resposta já foi enviada, não faz nada
   *   2. Se existe handler customizado, delega ao handler
   *   3. Caso contrário, usa o handler padrão do framework
   *
   * @param {Error} error - O erro a ser tratado
   * @param {Context<TState, TDecorators>} ctx - Contexto da requisição (req, res, app, state)
   * @returns {Promise<void>}
   */
  async handle(error: Error, ctx: Context<TState, TDecorators>) {
    // Se a resposta já foi enviada, não há nada a fazer
    if (ctx.res.sent) return;

    // Normaliza: erros não-HttpError viram InternalServerError
    const httpError =
      error instanceof HttpError
        ? error
        : new InternalServerError(error.message || 'Internal Server Error');

    if (this.#customHandler) {
      try {
        await this.#customHandler(httpError, ctx);
      } catch {
        // Se o handler customizado falhar, usa o padrão
        this.#defaultHandler(httpError, ctx);
      }
      return;
    }

    this.#defaultHandler(httpError, ctx);
  }

  /**
   * Handler padrão — envia resposta JSON com statusCode, error e message.
   *
   * @param {HttpError} error
   * @param {Context<TState, TDecorators>} ctx
   */
  #defaultHandler(error: HttpError, ctx: Context<TState, TDecorators>) {
    if (ctx.res.sent) return;

    ctx.res.status(error.statusCode).json(error.toJSON());
  }
}
