import {
  GroupApi,
  GroupOptions,
  Middleware,
  RouteDefinition,
  RouteHandler,
  RouteOptions,
} from '../types/router';
import { AnyDecorators, AnyState } from '../types/util';
import { RadixTree } from './radix-tree';

const HTTP_METHODS = [
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'HEAD',
  'OPTIONS',
] as const;

export class Router<
  TState extends AnyState = AnyState,
  TDecorators extends AnyDecorators = AnyDecorators,
> {
  #tree: RadixTree<TState, TDecorators>;

  constructor(opts: object = {}) {
    this.#tree = new RadixTree<TState, TDecorators>(opts);
  }

  route(definition: RouteDefinition<TState, TDecorators>): void {
    const {
      method,
      path,
      handler,
      middlewares = [],
      hooks = {},
      ...meta
    } = definition;
    this.#tree.add(method.toUpperCase(), path, {
      handler,
      middlewares,
      hooks,
      ...meta,
    });
  }

  find(
    method: string,
    path: string
  ): {
    route: RouteDefinition<TState, TDecorators> | undefined;
    params: Record<string, string>;
  } {
    return this.#tree.find(method, path);
  }

  all(
    path: string,
    handler: RouteHandler<TState, TDecorators>,
    opts: RouteOptions<TState, TDecorators> = {}
  ): void {
    for (const method of HTTP_METHODS) {
      this.route({ method, path, handler, ...opts });
    }
  }

  group(
    prefix: string,
    callback: (group: GroupApi<TState, TDecorators>) => void
  ): void;
  group(
    prefix: string,
    opts: GroupOptions<TState, TDecorators>,
    callback: (group: GroupApi<TState, TDecorators>) => void
  ): void;
  group(
    prefix: string,
    ...args: [
      (
        | GroupOptions<TState, TDecorators>
        | ((group: GroupApi<TState, TDecorators>) => void)
      ),
      ((group: GroupApi<TState, TDecorators>) => void)?,
    ]
  ): void {
    let opts: GroupOptions<TState, TDecorators> = {};
    let callback: ((group: GroupApi<TState, TDecorators>) => void) | undefined;

    if (typeof args[0] === 'function') {
      callback = args[0] as (group: GroupApi<TState, TDecorators>) => void;
    } else {
      opts = args[0] as GroupOptions<TState, TDecorators>;
      callback = args[1] as (group: GroupApi<TState, TDecorators>) => void;
    }

    const routeGroup = new RouteGroup<TState, TDecorators>(this, prefix, opts);
    if (typeof callback === 'function') {
      callback(routeGroup);
    }
  }
}

class RouteGroup<
  TState extends AnyState = AnyState,
  TDecorators extends AnyDecorators = AnyDecorators,
> implements GroupApi<TState, TDecorators> {
  #router: Router<TState, TDecorators>;
  #prefix: string;
  #middlewares: Middleware<TState, TDecorators>[];
  #hooks: Record<string, unknown[]>;

  constructor(
    router: Router<TState, TDecorators>,
    prefix: string,
    opts: GroupOptions<TState, TDecorators> = {}
  ) {
    this.#router = router;
    this.#prefix = prefix.replace(/\/+$/, '');
    this.#middlewares = Array.isArray(opts.middlewares)
      ? opts.middlewares
      : opts.middlewares
        ? [opts.middlewares]
        : [];
    this.#hooks = opts.hooks
      ? Object.fromEntries(
          Object.entries(opts.hooks).map(([key, val]) => [
            key,
            Array.isArray(val) ? val : [val],
          ])
        )
      : {};
  }

  route(definition: RouteDefinition<TState, TDecorators>): void {
    const { method, path, handler, middlewares = [], hooks = {} } = definition;
    this.#router.route({
      method,
      path: this.#prefix + (path === '/' ? '' : path),
      handler,
      middlewares: [
        ...this.#middlewares,
        ...(Array.isArray(middlewares) ? middlewares : [middlewares]),
      ],
      hooks: this.#mergeHooks(
        this.#hooks,
        Object.fromEntries(
          Object.entries(hooks).map(([key, val]) => [
            key,
            Array.isArray(val) ? val : [val],
          ])
        )
      ),
    });
  }

  all(
    path: string,
    handler: RouteHandler<TState, TDecorators>,
    opts: RouteOptions<TState, TDecorators> = {}
  ): void {
    for (const method of HTTP_METHODS) {
      this.route({ method, path, handler, ...opts });
    }
  }

  group(
    prefix: string,
    callback: (group: GroupApi<TState, TDecorators>) => void
  ): void;
  group(
    prefix: string,
    opts: GroupOptions<TState, TDecorators>,
    callback: (group: GroupApi<TState, TDecorators>) => void
  ): void;
  group(
    prefix: string,
    ...args: [
      (
        | GroupOptions<TState, TDecorators>
        | ((group: GroupApi<TState, TDecorators>) => void)
      ),
      ((group: GroupApi<TState, TDecorators>) => void)?,
    ]
  ): void {
    let opts: GroupOptions<TState, TDecorators> = {};
    let callback: (group: GroupApi<TState, TDecorators>) => void;

    if (typeof args[0] === 'function') {
      callback = args[0] as (group: GroupApi<TState, TDecorators>) => void;
    } else {
      opts = args[0] as GroupOptions<TState, TDecorators>;
      callback = args[1] as (group: GroupApi<TState, TDecorators>) => void;
    }

    const fullPrefix = this.#prefix + prefix.replace(/\/+$/, '');
    const mergedOpts: GroupOptions<TState, TDecorators> = {
      middlewares: [
        ...this.#middlewares,
        ...(Array.isArray(opts.middlewares)
          ? opts.middlewares
          : opts.middlewares
            ? [opts.middlewares]
            : []),
      ],
      hooks: this.#mergeHooks(
        this.#hooks,
        opts.hooks
          ? Object.fromEntries(
              Object.entries(opts.hooks).map(([key, val]) => [
                key,
                Array.isArray(val) ? val : [val],
              ])
            )
          : {}
      ),
    };

    const subGroup = new RouteGroup<TState, TDecorators>(
      this.#router,
      fullPrefix,
      mergedOpts
    );
    if (typeof callback === 'function') {
      callback(subGroup);
    }
  }

  #mergeHooks(
    parent: Record<string, unknown[]>,
    child: Record<string, unknown[]>
  ): Record<string, unknown[]> {
    const merged: Record<string, unknown[]> = { ...parent };
    for (const [key, fns] of Object.entries(child)) {
      merged[key] = [
        ...(merged[key] || []),
        ...(Array.isArray(fns) ? fns : [fns]),
      ];
    }
    return merged;
  }

  get(
    path: string,
    handler: RouteHandler<TState, TDecorators>,
    opts?: RouteOptions<TState, TDecorators>
  ): void {
    this.route({ method: 'GET', path, handler, ...opts });
  }
  post(
    path: string,
    handler: RouteHandler<TState, TDecorators>,
    opts?: RouteOptions<TState, TDecorators>
  ): void {
    this.route({ method: 'POST', path, handler, ...opts });
  }
  put(
    path: string,
    handler: RouteHandler<TState, TDecorators>,
    opts?: RouteOptions<TState, TDecorators>
  ): void {
    this.route({ method: 'PUT', path, handler, ...opts });
  }
  patch(
    path: string,
    handler: RouteHandler<TState, TDecorators>,
    opts?: RouteOptions<TState, TDecorators>
  ): void {
    this.route({ method: 'PATCH', path, handler, ...opts });
  }
  delete(
    path: string,
    handler: RouteHandler<TState, TDecorators>,
    opts?: RouteOptions<TState, TDecorators>
  ): void {
    this.route({ method: 'DELETE', path, handler, ...opts });
  }
  head(
    path: string,
    handler: RouteHandler<TState, TDecorators>,
    opts?: RouteOptions<TState, TDecorators>
  ): void {
    this.route({ method: 'HEAD', path, handler, ...opts });
  }
  options(
    path: string,
    handler: RouteHandler<TState, TDecorators>,
    opts?: RouteOptions<TState, TDecorators>
  ): void {
    this.route({ method: 'OPTIONS', path, handler, ...opts });
  }
}

for (const method of HTTP_METHODS) {
  (Router.prototype as any)[method.toLowerCase()] = function (
    path: string,
    handler: RouteHandler,
    opts: RouteOptions = {}
  ) {
    this.route({ method, path, handler, ...opts });
  };
}
