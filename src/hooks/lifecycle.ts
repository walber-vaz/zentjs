import { Context } from '../core/context';
import { AnyDecorators, AnyState } from '../types/util';

/** Fases válidas do lifecycle */
export const HOOK_PHASES = Object.freeze([
  'onRequest',
  'preParsing',
  'preValidation',
  'preHandler',
  'onSend',
  'onResponse',
  'onError',
] as const);

export type HookPhase = (typeof HOOK_PHASES)[number];

export type LifecycleHookFn<
  TState extends AnyState,
  TDecorators extends AnyDecorators,
> = (ctx: Context<TState, TDecorators>, ...args: any[]) => any | Promise<any>;

/**
 * Gerenciador de hooks de lifecycle.
 * Responsabilidade única: registrar e executar hooks por fase.
 */
export class Lifecycle<
  TState extends AnyState = AnyState,
  TDecorators extends AnyDecorators = AnyDecorators,
> {
  /** @type {Map<string, LifecycleHookFn<TState, TDecorators>[]>} */
  #hooks: Map<HookPhase, LifecycleHookFn<TState, TDecorators>[]>;

  constructor() {
    this.#hooks = new Map();

    for (const phase of HOOK_PHASES) {
      this.#hooks.set(phase, []);
    }
  }

  /**
   * Registra um hook para uma fase do lifecycle.
   *
   * @param {HookPhase} phase - Nome da fase (ex: 'onRequest', 'preHandler')
   * @param {LifecycleHookFn<TState, TDecorators>} fn - Função do hook
   * @throws {Error} Se a fase não for válida
   * @throws {TypeError} Se fn não for uma função
   */
  addHook(phase: HookPhase, fn: LifecycleHookFn<TState, TDecorators>) {
    if (!this.#hooks.has(phase)) {
      throw new Error(
        `Invalid hook phase: "${phase}". Valid phases: ${HOOK_PHASES.join(', ')}`
      );
    }

    if (typeof fn !== 'function') {
      throw new TypeError(`Hook must be a function, got ${typeof fn}`);
    }

    this.#hooks.get(phase)!.push(fn);
  }

  /**
   * Retorna os hooks registrados para uma fase.
   *
   * @param {HookPhase} phase
   * @returns {LifecycleHookFn<TState, TDecorators>[]}
   */
  getHooks(phase: HookPhase): LifecycleHookFn<TState, TDecorators>[] {
    return this.#hooks.get(phase) || [];
  }

  /**
   * Verifica se uma fase possui hooks registrados.
   *
   * @param {HookPhase} phase
   * @returns {boolean}
   */
  hasHooks(phase: HookPhase): boolean {
    const hooks = this.#hooks.get(phase);
    return hooks !== undefined && hooks.length > 0;
  }

  async run(
    phase: HookPhase,
    ctx: Context<TState, TDecorators>,
    ...args: any[]
  ): Promise<any> {
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
   */
  async #runOnSend(
    hooks: LifecycleHookFn<TState, TDecorators>[],
    ctx: Context<TState, TDecorators>,
    payload: any
  ): Promise<any> {
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
   */
  async #runOnError(
    hooks: LifecycleHookFn<TState, TDecorators>[],
    ctx: Context<TState, TDecorators>,
    error: Error
  ): Promise<void> {
    for (const hook of hooks) {
      await hook(ctx, error);
    }
  }

  /**
   * Cria uma cópia do lifecycle com os mesmos hooks.
   * Útil para encapsulamento de plugins (herança de escopo pai).
   *
   * @returns {Lifecycle<TState, TDecorators>}
   */
  clone(): Lifecycle<TState, TDecorators> {
    const cloned = new Lifecycle<TState, TDecorators>();

    for (const [phase, hooks] of this.#hooks) {
      for (const hook of hooks) {
        cloned.addHook(phase, hook);
      }
    }

    return cloned;
  }
}
