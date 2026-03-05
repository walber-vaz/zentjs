/**
 * PluginManager — Gerencia registro e carregamento de plugins.
 *
 * Cada plugin é uma função assíncrona que recebe uma instância
 * encapsulada do app e opções. Plugins podem registrar rotas,
 * hooks, middlewares e decorators sem vazar para o escopo pai.
 *
 * Inspirado no sistema de plugins do Fastify.
 *
 * @module plugins/manager
 */

import {
  PluginFunction,
  PluginOptions,
  ZentPluginScope,
} from '../types/plugin';
import { AnyDecorators, AnyState } from '../types/util';

/**
 * @typedef {object} PluginEntry
 */
interface PluginEntry {
  fn: PluginFunction<any, any, any>;
  opts: any;
}

/**
 * Gerenciador de plugins com suporte a encapsulamento de escopo.
 * Responsabilidade única: registrar, ordenar e carregar plugins.
 */
export class PluginManager {
  #queue: PluginEntry[];
  #loaded: boolean;

  constructor() {
    this.#queue = [];
    this.#loaded = false;
  }

  /**
   * Indica se os plugins já foram carregados.
   */
  get loaded(): boolean {
    return this.#loaded;
  }

  /**
   * Registra um plugin para ser carregado posteriormente.
   */
  register<
    TOptions extends PluginOptions = PluginOptions,
    TState extends AnyState = AnyState,
    TDecorators extends AnyDecorators = AnyDecorators,
  >(
    fn: PluginFunction<TOptions, TState, TDecorators>,
    opts: TOptions = {} as TOptions
  ) {
    if (typeof fn !== 'function') {
      throw new TypeError(`Plugin must be a function, got ${typeof fn}`);
    }

    if (this.#loaded) {
      throw new Error(
        'Cannot register plugins after they have been loaded. ' +
          'Call register() before listen().'
      );
    }

    this.#queue.push({ fn, opts });
  }

  /**
   * Carrega todos os plugins registrados sequencialmente.
   * Cada plugin recebe uma instância encapsulada via `createScope`.
   */
  async load(createScope: (opts: any) => ZentPluginScope<any, any>) {
    if (typeof createScope !== 'function') {
      throw new TypeError('createScope must be a function');
    }

    if (this.#loaded) {
      throw new Error('Plugins have already been loaded');
    }

    for (const entry of this.#queue) {
      const scopedApp = createScope(entry.opts);

      await entry.fn(scopedApp, entry.opts);
    }

    this.#loaded = true;
  }

  /**
   * Retorna o número de plugins registrados.
   */
  get size(): number {
    return this.#queue.length;
  }
}
