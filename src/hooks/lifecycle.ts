import { Context } from '../core/context';
import { AnyDecorators, AnyState } from '../types/util';

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
> = (
  ctx: Context<TState, TDecorators>,
  ...args: unknown[]
) => unknown | Promise<unknown>;

export class Lifecycle<
  TState extends AnyState = AnyState,
  TDecorators extends AnyDecorators = AnyDecorators,
> {
  #hooks: Map<HookPhase, LifecycleHookFn<TState, TDecorators>[]>;

  constructor() {
    this.#hooks = new Map();

    for (const phase of HOOK_PHASES) {
      this.#hooks.set(phase, []);
    }
  }

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

  getHooks(phase: HookPhase): LifecycleHookFn<TState, TDecorators>[] {
    return this.#hooks.get(phase) || [];
  }

  hasHooks(phase: HookPhase): boolean {
    const hooks = this.#hooks.get(phase);
    return hooks !== undefined && hooks.length > 0;
  }

  async run(
    phase: HookPhase,
    ctx: Context<TState, TDecorators>,
    ...args: unknown[]
  ): Promise<unknown> {
    const hooks = this.getHooks(phase);

    if (hooks.length === 0) return args[0];

    if (phase === 'onSend') {
      return this.#runOnSend(hooks, ctx, args[0]);
    }

    if (phase === 'onError') {
      if (args[0] instanceof Error) {
        return this.#runOnError(hooks, ctx, args[0]);
      } else {
        throw new TypeError(
          'onError hook expects an Error instance as its argument'
        );
      }
    }

    for (const hook of hooks) {
      await hook(ctx);
    }
  }

  async #runOnSend(
    hooks: LifecycleHookFn<TState, TDecorators>[],
    ctx: Context<TState, TDecorators>,
    payload: unknown
  ): Promise<unknown> {
    let current = payload;

    for (const hook of hooks) {
      const result = await hook(ctx, current);
      if (result !== undefined) {
        current = result;
      }
    }

    return current;
  }

  async #runOnError(
    hooks: LifecycleHookFn<TState, TDecorators>[],
    ctx: Context<TState, TDecorators>,
    error: Error
  ): Promise<void> {
    for (const hook of hooks) {
      await hook(ctx, error);
    }
  }

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
