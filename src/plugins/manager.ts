import type { AnyDecorators, AnyState } from '@/types/util';

import type {
  PluginFunction,
  PluginOptions,
  PluginScopeInstance,
  ZentPluginScope,
} from '../types/plugin';

interface PluginEntry<
  TOptions extends PluginOptions,
  TState extends AnyState,
  TDecorators extends AnyDecorators,
> {
  fn: PluginFunction<TOptions, TState, TDecorators>;
  opts: TOptions;
}

export class PluginManager<
  TOptions extends PluginOptions = PluginOptions,
  TState extends AnyState = AnyState,
  TDecorators extends AnyDecorators = AnyDecorators,
> {
  #queue: ZentPluginScope<TState, TDecorators> extends ZentPluginScope<
    infer U,
    infer V
  >
    ? PluginEntry<TOptions, U, V>[]
    : never[];
  #loaded: boolean;

  constructor() {
    this.#queue = [];
    this.#loaded = false;
  }

  get loaded(): boolean {
    return this.#loaded;
  }

  register(
    fn: ZentPluginScope<TState, TDecorators> extends ZentPluginScope<
      infer U,
      infer V
    >
      ? PluginFunction<TOptions, U, V>
      : never,
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

  async load(
    createScope: (opts: TOptions) => PluginScopeInstance<TState, TDecorators>
  ) {
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

  get size(): number {
    return this.#queue.length;
  }
}
