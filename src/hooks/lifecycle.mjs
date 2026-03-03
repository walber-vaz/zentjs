/**
 * Lifecycle — Gerencia hooks de ciclo de vida da requisição.
 *
 * Hooks são executados em fases bem definidas, permitindo
 * interceptar e modificar o fluxo em cada etapa.
 *
 * Fases (ordem de execução):
 *   1. onRequest    — Primeira fase, antes de qualquer processamento
 *   2. preParsing   — Antes de parsear o body
 *   3. preValidation — Antes de validar input
 *   4. preHandler   — Após validação, antes do handler
 *   5. onSend       — Antes de enviar a resposta (pode modificar payload)
 *   6. onResponse   — Após envio da resposta (cleanup, métricas)
 *   7. onError      — Chamado quando ocorre erro em qualquer fase
 *
 * @module hooks/lifecycle
 */

/** Fases válidas do lifecycle */
export const HOOK_PHASES = Object.freeze([
  'onRequest',
  'preParsing',
  'preValidation',
  'preHandler',
  'onSend',
  'onResponse',
  'onError',
]);

/**
 * Gerenciador de hooks de lifecycle.
 * Responsabilidade única: registrar e executar hooks por fase.
 */
export class Lifecycle {
  /** @type {Map<string, Function[]>} */
  #hooks;

  constructor() {
    this.#hooks = new Map();

    for (const phase of HOOK_PHASES) {
      this.#hooks.set(phase, []);
    }
  }

  /**
   * Registra um hook para uma fase do lifecycle.
   *
   * @param {string} phase - Nome da fase (ex: 'onRequest', 'preHandler')
   * @param {Function} fn - Função do hook
   * @throws {Error} Se a fase não for válida
   * @throws {TypeError} Se fn não for uma função
   */
  addHook(phase, fn) {
    if (!this.#hooks.has(phase)) {
      throw new Error(
        `Invalid hook phase: "${phase}". Valid phases: ${HOOK_PHASES.join(', ')}`
      );
    }

    if (typeof fn !== 'function') {
      throw new TypeError(`Hook must be a function, got ${typeof fn}`);
    }

    this.#hooks.get(phase).push(fn);
  }

  /**
   * Retorna os hooks registrados para uma fase.
   *
   * @param {string} phase
   * @returns {Function[]}
   */
  getHooks(phase) {
    return this.#hooks.get(phase) || [];
  }

  /**
   * Verifica se uma fase possui hooks registrados.
   *
   * @param {string} phase
   * @returns {boolean}
   */
  hasHooks(phase) {
    const hooks = this.#hooks.get(phase);
    return hooks !== undefined && hooks.length > 0;
  }

  /**
   * Executa todos os hooks de uma fase sequencialmente.
   * Cada hook recebe os argumentos passados (tipicamente ctx, ou ctx + payload).
   *
   * Para a fase 'onSend', o retorno do hook substitui o payload
   * (permite transformação encadeada).
   *
   * @param {string} phase - Fase do lifecycle
   * @param {object} ctx - Contexto da requisição
   * @param {...*} args - Argumentos adicionais (ex: payload para onSend, error para onError)
   * @returns {Promise<*>} O último payload (para onSend) ou undefined
   */
  async run(phase, ctx, ...args) {
    const hooks = this.getHooks(phase);

    if (hooks.length === 0) return args[0];

    if (phase === 'onSend') {
      return this.#runOnSend(hooks, ctx, args[0]);
    }

    if (phase === 'onError') {
      return this.#runOnError(hooks, ctx, args[0]);
    }

    // Fases normais: onRequest, preParsing, preValidation, preHandler, onResponse
    for (const hook of hooks) {
      await hook(ctx);
    }
  }

  /**
   * Executa hooks de onSend encadeando o payload.
   * Cada hook pode retornar um payload modificado.
   *
   * @param {Function[]} hooks
   * @param {object} ctx
   * @param {*} payload
   * @returns {Promise<*>}
   */
  async #runOnSend(hooks, ctx, payload) {
    let current = payload;

    for (const hook of hooks) {
      const result = await hook(ctx, current);
      // Se o hook retornar algo, substitui o payload
      if (result !== undefined) {
        current = result;
      }
    }

    return current;
  }

  /**
   * Executa hooks de onError sequencialmente.
   * Cada hook recebe (ctx, error).
   *
   * @param {Function[]} hooks
   * @param {object} ctx
   * @param {Error} error
   * @returns {Promise<void>}
   */
  async #runOnError(hooks, ctx, error) {
    for (const hook of hooks) {
      await hook(ctx, error);
    }
  }

  /**
   * Cria uma cópia do lifecycle com os mesmos hooks.
   * Útil para encapsulamento de plugins (herança de escopo pai).
   *
   * @returns {Lifecycle}
   */
  clone() {
    const cloned = new Lifecycle();

    for (const [phase, hooks] of this.#hooks) {
      for (const hook of hooks) {
        cloned.addHook(phase, hook);
      }
    }

    return cloned;
  }
}
