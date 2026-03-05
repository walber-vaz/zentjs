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

  constructor(opts: any = {}) {
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
  ): { route: any; params: Record<string, string> } {
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
  group(prefix: string, ...args: any[]): void {
    const opts = typeof args[0] === 'function' ? {} : args.shift() || {};
    const callback = args[0];

    const routeGroup = new RouteGroup<TState, TDecorators>(this, prefix, opts);
    callback(routeGroup);
  }
}

class RouteGroup<
  TState extends AnyState = AnyState,
  TDecorators extends AnyDecorators = AnyDecorators,
> implements GroupApi<TState, TDecorators> {
  #router: Router<TState, TDecorators>;
  #prefix: string;
  #middlewares: Middleware<TState, TDecorators>[];
  #hooks: any;

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
    this.#hooks = opts.hooks || {};
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
      hooks: this.#mergeHooks(this.#hooks, hooks),
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
  group(prefix: string, ...args: any[]): void {
    const opts = typeof args[0] === 'function' ? {} : args.shift() || {};
    const callback = args[0];

    const fullPrefix = this.#prefix + prefix.replace(/\/+$/, '');
    const mergedOpts = {
      middlewares: [...this.#middlewares, ...(opts.middlewares || [])],
      hooks: this.#mergeHooks(this.#hooks, opts.hooks || {}),
    };

    const subGroup = new RouteGroup<TState, TDecorators>(
      this.#router as any,
      fullPrefix,
      mergedOpts
    );
    callback(subGroup);
  }

  #mergeHooks(parent: any, child: any): any {
    const merged = { ...parent };
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

// Add methods to Router prototype
for (const method of HTTP_METHODS) {
  (Router.prototype as any)[method.toLowerCase()] = function (
    path: string,
    handler: RouteHandler,
    opts: RouteOptions = {}
  ) {
    this.route({ method, path, handler, ...opts });
  };
}
