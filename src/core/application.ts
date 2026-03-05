import {
  createServer,
  type IncomingMessage,
  Server,
  type ServerResponse,
} from 'node:http';

import { ErrorHandler } from '../errors/error-handler';
import { NotFoundError } from '../errors/http-error';
import { HOOK_PHASES, type HookPhase, Lifecycle } from '../hooks/lifecycle';
import { compose } from '../middleware/pipeline';
import { PluginManager } from '../plugins/manager';
import { Router } from '../router/index';
import {
  InjectOptions,
  InjectResponse,
  ListenCallback,
  ListenOptions,
  ZentOptions,
} from '../types/application';
import { OnErrorHook, OnResponseHook, OnSendHook } from '../types/hooks';
import {
  PluginFunction,
  PluginOptions,
  type PluginScopeInstance,
  ZentPluginScope,
} from '../types/plugin';
import {
  GroupOptions,
  Middleware,
  RouteDefinition,
  RouteHandler,
  RouteOptions,
} from '../types/router';
import { AnyDecorators, AnyState, MaybePromise, Merge } from '../types/util';
import { Context } from './context';

const HTTP_METHODS = [
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'HEAD',
  'OPTIONS',
] as const;

const SCOPE_DECORATORS = Symbol('scopeDecorators');
const SCOPE_MIDDLEWARES = Symbol('scopeMiddlewares');
const SCOPE_HOOKS = Symbol('scopeHooks');
const ROUTE_HOOKS = Symbol('routeHooks');
const ROUTE_MIDDLEWARES = Symbol('routeMiddlewares');
const ROUTE_PIPELINE_CACHE = Symbol('routePipelineCache');

interface DecoratorRegistry {
  values: Record<string, unknown>;
  has(name: string): boolean;
  define(name: string, value: unknown): void;
}

function createScopeDecoratorRegistry(
  parentRegistry: DecoratorRegistry | null = null
): DecoratorRegistry {
  const values: Record<string, unknown> = Object.create(
    parentRegistry?.values || null
  );

  return {
    values,
    has(name: string) {
      return name in values;
    },
    define(name: string, value: unknown) {
      if (name in values) {
        throw new Error(`Decorator "${name}" already exists`);
      }

      values[name] = value;
    },
  };
}

function cloneHooksMap(
  hooks: Record<string, unknown> | undefined
): Record<string, unknown> {
  const cloned: Record<string, unknown> = {};

  if (!hooks) return cloned;

  for (const [phase, fns] of Object.entries(hooks)) {
    cloned[phase] = Array.isArray(fns) ? [...fns] : [fns];
  }

  return cloned;
}

function mergeHooksMap(
  baseHooks: Record<string, unknown> | undefined,
  extraHooks: Record<string, unknown> | undefined
): Record<string, unknown> {
  const merged = cloneHooksMap(baseHooks);

  if (!extraHooks) return merged;

  for (const [phase, fns] of Object.entries(extraHooks)) {
    const list = Array.isArray(fns) ? fns : [fns];
    merged[phase] = [
      ...(Array.isArray(merged[phase]) ? merged[phase] : []),
      ...list,
    ];
  }

  return merged;
}

function toMiddlewareArray<
  TState extends AnyState,
  TDecorators extends AnyDecorators,
>(
  middlewares:
    | Middleware<TState, TDecorators>
    | Middleware<TState, TDecorators>[]
    | undefined
): Middleware<TState, TDecorators>[] {
  if (!middlewares) return [];
  return Array.isArray(middlewares) ? middlewares : [middlewares];
}

interface RouteHooksMap {
  [phase: string]: unknown[];
}

function normalizeRouteHooks(
  hooks: Record<string, unknown> | undefined
): RouteHooksMap {
  const normalized: RouteHooksMap = {};

  if (!hooks) return normalized;

  for (const phase of HOOK_PHASES) {
    const phaseHooks = hooks[phase];
    if (!phaseHooks) continue;
    normalized[phase] = Array.isArray(phaseHooks)
      ? (phaseHooks as unknown[])
      : [phaseHooks];
  }

  return normalized;
}

function compileRouteDefinition<
  TState extends AnyState,
  TDecorators extends AnyDecorators,
>(
  definition: RouteDefinition<TState, TDecorators>
): RouteDefinition<TState, TDecorators> {
  const routeMiddlewares = toMiddlewareArray(definition.middlewares);
  const normalizedHooks = normalizeRouteHooks(definition.hooks);

  return {
    ...definition,
    middlewares: routeMiddlewares,
    hooks: normalizedHooks,
    [ROUTE_MIDDLEWARES]: routeMiddlewares,
    [ROUTE_HOOKS]: normalizedHooks,
    [ROUTE_PIPELINE_CACHE]: {
      version: -1,
      pipeline: null,
    },
  };
}

function normalizeMiddlewarePrefix(prefix: string): string {
  const trimmed = prefix.trim();

  if (!trimmed || trimmed === '/') return '/';

  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return withLeadingSlash.replace(/\/+$/, '');
}

function pathMatchesPrefix(path: string, prefix: string): boolean {
  if (prefix === '/') return true;
  return path === prefix || path.startsWith(`${prefix}/`);
}

function normalizeInjectHeaders(
  headers: Record<string, string> = {}
): Record<string, string> {
  const normalized: Record<string, string> = {};

  for (const [name, value] of Object.entries(headers)) {
    normalized[name.toLowerCase()] = value;
  }

  return normalized;
}

export function zent<
  TState extends AnyState = AnyState,
  TDecorators extends AnyDecorators = AnyDecorators,
>(opts: ZentOptions = {}): Zent<TState, TDecorators> {
  return new Zent<TState, TDecorators>(opts);
}

export class Zent<
  TState extends AnyState = AnyState,
  TDecorators extends AnyDecorators = AnyDecorators,
> {
  #server: Server | null;
  #router: Router<TState, TDecorators>;
  #lifecycle: Lifecycle<TState, TDecorators>;
  #errorHandler: ErrorHandler<TState, TDecorators>;
  #middlewares: Middleware<TState, TDecorators>[];
  #decorators: TDecorators;
  #plugins: PluginManager;
  #middlewareVersion: number;
  #globalHooksActive: Record<string, boolean>;
  #notFoundHandler:
    | ((ctx: Context<TState, TDecorators>) => MaybePromise<void>)
    | null;

  constructor(opts: ZentOptions = {}) {
    this.#server = null;
    this.#router = new Router<TState, TDecorators>({
      ignoreTrailingSlash: opts.ignoreTrailingSlash,
      caseSensitive: opts.caseSensitive,
    });
    this.#lifecycle = new Lifecycle<TState, TDecorators>();
    this.#errorHandler = new ErrorHandler<TState, TDecorators>();
    this.#middlewares = [];
    this.#decorators = {} as TDecorators;
    this.#plugins = new PluginManager();
    this.#notFoundHandler = null;
    this.#middlewareVersion = 0;
    this.#globalHooksActive = Object.fromEntries(
      HOOK_PHASES.map((phase) => [phase, false])
    );
  }

  route(definition: RouteDefinition<TState, TDecorators>): this {
    this.#router.route(compileRouteDefinition(definition));
    return this;
  }

  all(
    path: string,
    handler: RouteHandler<TState, TDecorators>,
    opts?: RouteOptions<TState, TDecorators>
  ): this {
    this.#router.all(path, handler, opts);
    return this;
  }

  group(
    prefix: string,
    callback: (group: Zent<TState, TDecorators>) => void
  ): this;
  group(
    prefix: string,
    opts: GroupOptions<TState, TDecorators>,
    callback: (group: Zent<TState, TDecorators>) => void
  ): this;
  group(
    prefix: string,
    ...args:
      | [
          GroupOptions<TState, TDecorators>,
          (group: Zent<TState, TDecorators>) => void,
        ]
      | [(group: Zent<TState, TDecorators>) => void]
  ): this {
    (
      this.#router.group as unknown as (
        prefix: string,
        opts: GroupOptions<TState, TDecorators>,
        callback: (group: Zent<TState, TDecorators>) => void
      ) => void
    )(
      prefix,
      ...(args as [
        GroupOptions<TState, TDecorators>,
        (group: Zent<TState, TDecorators>) => void,
      ])
    );
    return this;
  }

  use(middleware: Middleware<TState, TDecorators>): this;
  use(prefix: string, middleware: Middleware<TState, TDecorators>): this;
  use(
    arg1: string | Middleware<TState, TDecorators>,
    arg2?: Middleware<TState, TDecorators>
  ): this {
    if (typeof arg1 === 'function' && arg2 === undefined) {
      this.#middlewares.push(arg1);
      this.#middlewareVersion++;
      return this;
    }

    if (typeof arg1 === 'string' && typeof arg2 === 'function') {
      const prefix = normalizeMiddlewarePrefix(arg1);

      this.#middlewares.push(async (ctx, next: () => MaybePromise<void>) => {
        if (!pathMatchesPrefix(ctx.req.path, prefix)) {
          return next();
        }

        return arg2(ctx, next);
      });

      this.#middlewareVersion++;

      return this;
    }

    if (arg2 === undefined) {
      throw new TypeError(`Middleware must be a function, got ${typeof arg1}`);
    }

    throw new TypeError(
      'Invalid use() signature. Expected use(middleware) or use(prefix, middleware)'
    );
  }

  addHook(
    phase: 'onRequest',
    fn: (ctx: Context<TState, TDecorators>) => MaybePromise<void>
  ): this;
  addHook(
    phase: 'preParsing',
    fn: (ctx: Context<TState, TDecorators>) => MaybePromise<void>
  ): this;
  addHook(
    phase: 'preValidation',
    fn: (ctx: Context<TState, TDecorators>) => MaybePromise<void>
  ): this;
  addHook(
    phase: 'preHandler',
    fn: (ctx: Context<TState, TDecorators>) => MaybePromise<void>
  ): this;
  addHook(phase: 'onSend', fn: OnSendHook<TState, TDecorators>): this;
  addHook(phase: 'onResponse', fn: OnResponseHook<TState, TDecorators>): this;
  addHook(phase: 'onError', fn: OnErrorHook<TState, TDecorators>): this;
  addHook(
    phase: HookPhase,
    fn:
      | ((ctx: Context<TState, TDecorators>) => MaybePromise<void>)
      | OnSendHook<TState, TDecorators>
      | OnResponseHook<TState, TDecorators>
      | OnErrorHook<TState, TDecorators>
  ): this {
    this.#lifecycle.addHook(phase, fn);
    this.#globalHooksActive[phase] = true;
    return this;
  }

  setErrorHandler(
    fn: (error: Error, ctx: Context<TState, TDecorators>) => MaybePromise<void>
  ): this {
    this.#errorHandler.setErrorHandler(fn);
    return this;
  }

  setNotFoundHandler(
    fn: (ctx: Context<TState, TDecorators>) => MaybePromise<void>
  ): this {
    if (typeof fn !== 'function') {
      throw new TypeError(
        `Not found handler must be a function, got ${typeof fn}`
      );
    }

    this.#notFoundHandler = fn;
    return this;
  }

  decorate<TKey extends string, TValue>(
    name: TKey,
    value: (ctx: Context<TState, TDecorators>, ...args: unknown[]) => TValue
  ): Zent<TState, Merge<TDecorators, Record<TKey, typeof value>>> &
    Merge<TDecorators, Record<TKey, typeof value>>;
  decorate<TKey extends string, TValue>(
    name: TKey,
    value: TValue
  ): Zent<TState, Merge<TDecorators, Record<TKey, TValue>>> &
    Merge<TDecorators, Record<TKey, TValue>>;
  decorate<TKey extends string, TValue>(
    name: TKey,
    value: TValue
  ): Zent<TState, Merge<TDecorators, Record<TKey, TValue>>> &
    Merge<TDecorators, Record<TKey, TValue>> {
    if (name in this) {
      throw new Error(`Decorator "${name}" already exists`);
    }

    (this.#decorators as Record<string, unknown>)[name] = value;
    (this as unknown as Record<string, unknown>)[name] = value;
    return this as unknown as Zent<
      TState,
      Merge<TDecorators, Record<TKey, TValue>>
    > &
      Merge<TDecorators, Record<TKey, TValue>>;
  }

  hasDecorator<TKey extends string>(
    name: TKey
  ): name is TKey & keyof TDecorators {
    return name in this.#decorators;
  }

  register<TOptions extends PluginOptions = PluginOptions>(
    fn: PluginFunction<TOptions, TState, TDecorators>,
    opts: TOptions = {} as TOptions
  ): this {
    this.#plugins.register(fn, opts);
    return this;
  }

  async #loadPlugins(): Promise<void> {
    if (this.#plugins.loaded) return;

    await this.#plugins.load((opts) => this.#createScope(opts));
  }

  #createScope(opts: PluginOptions): ZentPluginScope<TState, TDecorators> {
    const prefix = opts.prefix || '';
    const decoratorRegistry = createScopeDecoratorRegistry(
      (opts[
        SCOPE_DECORATORS as unknown as keyof typeof opts
      ] as DecoratorRegistry | null) || null
    );
    const scopeMiddlewares = Array.isArray(
      (opts as { scopeMiddlewares?: Middleware<TState, TDecorators>[] })[
        'scopeMiddlewares'
      ]
    )
      ? [
          ...((
            opts as { scopeMiddlewares?: Middleware<TState, TDecorators>[] }
          )['scopeMiddlewares'] as Middleware<TState, TDecorators>[]),
        ]
      : [];
    const scopeHooks = cloneHooksMap(
      (opts as Record<typeof SCOPE_HOOKS, Record<string, unknown> | undefined>)[
        SCOPE_HOOKS
      ]
    );

    const scope: Partial<ZentPluginScope<TState, TDecorators>> = {};

    const scopeDecorate = (name: string, value: unknown) => {
      if (name in scope) {
        throw new Error(`Decorator "${name}" already exists`);
      }

      decoratorRegistry.define(name, value);
      scope[name] = value;
      return scope;
    };

    const scopeHasDecorator = (name: string) => decoratorRegistry.has(name);

    const scopeUse = (
      arg1: string | Middleware<TState, TDecorators>,
      arg2?: Middleware<TState, TDecorators>
    ) => {
      if (typeof arg1 === 'function' && arg2 === undefined) {
        scopeMiddlewares.push(arg1);
        return scope;
      }

      if (typeof arg1 === 'string' && typeof arg2 === 'function') {
        const scopedPrefix = `${prefix}${arg1.startsWith('/') ? '' : '/'}${arg1}`;
        const localPrefix = normalizeMiddlewarePrefix(scopedPrefix);

        scopeMiddlewares.push(
          async (
            ctx: Context<TState, TDecorators>,
            next: () => MaybePromise<void>
          ) => {
            if (!pathMatchesPrefix(ctx.req.path, localPrefix)) {
              return next();
            }

            return arg2(ctx, next);
          }
        );

        return scope;
      }

      if (arg2 === undefined) {
        throw new TypeError(
          `Middleware must be a function, got ${typeof arg1}`
        );
      }

      throw new TypeError(
        'Invalid use() signature. Expected use(middleware) or use(prefix, middleware)'
      );
    };

    const scopeAddHook = (
      phase: HookPhase,
      fn:
        | ((ctx: Context<TState, TDecorators>) => MaybePromise<void>)
        | OnSendHook<TState, TDecorators>
        | OnResponseHook<TState, TDecorators>
        | OnErrorHook<TState, TDecorators>
    ) => {
      if (!HOOK_PHASES.includes(phase)) {
        throw new Error(
          `Invalid hook phase: "${phase}". Valid phases: ${HOOK_PHASES.join(', ')}`
        );
      }

      if (typeof fn !== 'function') {
        throw new TypeError(`Hook must be a function, got ${typeof fn}`);
      }

      const existing = Array.isArray(scopeHooks[phase])
        ? scopeHooks[phase]
        : [];
      scopeHooks[phase] = [...existing, fn];
      return scope;
    };

    const withScopeRouteOpts = (
      routeOpts: RouteOptions<TState, TDecorators> = {}
    ) => {
      const routeMiddlewares = toMiddlewareArray(routeOpts.middlewares);
      const mergedMiddlewares = [...scopeMiddlewares, ...routeMiddlewares];
      const mergedHooks = mergeHooksMap(scopeHooks, routeOpts.hooks || {});

      return {
        ...routeOpts,
        middlewares: mergedMiddlewares,
        hooks: mergedHooks,
      };
    };

    const registerMethod =
      (method: string) =>
      (
        path: string,
        handler: RouteHandler<TState, TDecorators>,
        routeOpts: RouteOptions<TState, TDecorators> = {}
      ) => {
        const routeMethod = (this as Zent<TState, TDecorators>)[
          method.toLowerCase() as keyof Zent<TState, TDecorators>
        ] as unknown as (
          path: string,
          handler: RouteHandler<TState, TDecorators>,
          opts?: RouteOptions<TState, TDecorators>
        ) => Zent<TState, TDecorators>;
        routeMethod(prefix + path, handler, withScopeRouteOpts(routeOpts));
        return scope;
      };

    const scopeRoute = (def: RouteDefinition<TState, TDecorators>) => {
      const routeOpts = withScopeRouteOpts({
        middlewares: def.middlewares,
        hooks: def.hooks,
      });

      this.route({
        ...def,
        path: prefix + def.path,
        middlewares: routeOpts.middlewares,
        hooks: routeOpts.hooks,
      });
      return scope;
    };

    const scopeAll = (
      path: string,
      handler: RouteHandler<TState, TDecorators>,
      routeOpts: RouteOptions<TState, TDecorators> = {}
    ) => {
      for (const method of HTTP_METHODS) {
        scopeRoute({ method, path, handler, ...routeOpts });
      }
      return scope;
    };

    const scopeGroup = (
      groupPrefix: string,
      ...args:
        | [
            GroupOptions<TState, TDecorators>,
            (group: Zent<TState, TDecorators>) => void,
          ]
        | [(group: Zent<TState, TDecorators>) => void]
    ) => {
      const groupOpts =
        typeof args[0] === 'function'
          ? {}
          : (args.shift() as GroupOptions<TState, TDecorators>) || {};
      const callback = args[0] as (group: Zent<TState, TDecorators>) => void;

      const mergedGroupOpts = {
        ...groupOpts,
        middlewares: [
          ...scopeMiddlewares,
          ...toMiddlewareArray(groupOpts.middlewares),
        ],
        hooks: mergeHooksMap(scopeHooks, groupOpts.hooks || {}),
      };

      this.group(prefix + groupPrefix, mergedGroupOpts, callback);
      return scope;
    };

    return Object.assign(scope, {
      get: registerMethod('get'),
      post: registerMethod('post'),
      put: registerMethod('put'),
      patch: registerMethod('patch'),
      delete: registerMethod('delete'),
      head: registerMethod('head'),
      options: registerMethod('options'),
      all: scopeAll,
      route: scopeRoute,
      group: scopeGroup,
      use: scopeUse,
      addHook: scopeAddHook,
      setErrorHandler: (
        fn: (
          error: Error,
          ctx: Context<TState, TDecorators>
        ) => MaybePromise<void>
      ) => {
        this.setErrorHandler(fn);
        return scope;
      },
      setNotFoundHandler: (
        fn: (ctx: Context<TState, TDecorators>) => MaybePromise<void>
      ) => {
        this.setNotFoundHandler(fn);
        return scope;
      },
      decorate: scopeDecorate,
      hasDecorator: scopeHasDecorator,
      register: (
        fn: PluginFunction<PluginOptions, TState, TDecorators>,
        pluginOpts: PluginOptions
      ) => {
        const nextOpts: PluginOptions = {
          ...(pluginOpts || {}),
          prefix: String(prefix) + String(pluginOpts?.prefix ?? ''),
          [SCOPE_DECORATORS]: decoratorRegistry,
          [SCOPE_MIDDLEWARES]: [...scopeMiddlewares],
          [SCOPE_HOOKS]: cloneHooksMap(scopeHooks),
        };

        this.#plugins.register(
          (
            scopedApp: PluginScopeInstance<TState, TDecorators>,
            resolvedOpts: PluginOptions
          ) => {
            return fn(scopedApp, resolvedOpts);
          },
          nextOpts
        );
      },
    }) as ZentPluginScope<TState, TDecorators>;
  }

  async listen(
    opts: ListenOptions = {},
    callback?: ListenCallback
  ): Promise<string> {
    await this.#loadPlugins();

    const port = opts.port ?? 3000;
    const host = opts.host ?? '0.0.0.0';

    this.#server = createServer((req, res) => {
      this.#handleRequest(req, res);
    });

    return new Promise((resolve, reject) => {
      this.#server!.listen(port, host, () => {
        const addr = this.#server!.address();
        const boundPort = typeof addr === 'string' ? port : addr?.port || port;
        const address = `http://${host}:${boundPort}`;

        if (callback) {
          callback(null, address);
        }

        resolve(address);
      });

      this.#server!.on('error', (err) => {
        if (callback) {
          callback(err);
        }

        reject(err);
      });
    });
  }

  async close(): Promise<void> {
    if (!this.#server) return;

    return new Promise((resolve, reject) => {
      this.#server!.close((err) => {
        this.#server = null;

        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  async inject(opts: InjectOptions): Promise<InjectResponse> {
    await this.#loadPlugins();

    const { method = 'GET', url = '/', headers = {}, body } = opts;
    const normalizedHeaders = normalizeInjectHeaders(headers);

    let bodyStr: string | null = null;
    if (body !== undefined && body !== null) {
      if (typeof body === 'object') {
        bodyStr = JSON.stringify(body);
        normalizedHeaders['content-type'] =
          normalizedHeaders['content-type'] || 'application/json';
      } else {
        bodyStr = String(body);
      }
      normalizedHeaders['content-length'] = String(Buffer.byteLength(bodyStr));
    }

    interface MockRequest {
      method: string;
      url: string;
      headers: Record<string, string>;
      socket: { remoteAddress: string; encrypted: boolean };
      body: string | null;
      params?: Record<string, string>;
    }

    const rawReq: MockRequest = {
      method: method.toUpperCase(),
      url,
      headers: { host: 'localhost', ...normalizedHeaders },
      socket: { remoteAddress: '127.0.0.1', encrypted: false },
      body: bodyStr,
    };

    const chunks: string[] = [];
    const headersWritten: Record<string, string> = {};
    let statusCode = 200;

    interface MockResponse {
      writableEnded: boolean;
      setHeader(name: string, value: unknown): void;
      getHeader(name: string): unknown;
      writeHead(code: number): void;
      end(chunk?: unknown): void;
    }

    const rawRes: MockResponse = {
      writableEnded: false,

      setHeader(name: string, value: unknown) {
        headersWritten[name.toLowerCase()] = value as string;
      },

      getHeader(name: string) {
        return headersWritten[name.toLowerCase()];
      },

      writeHead(code: number) {
        statusCode = code;
      },

      end(chunk?: unknown) {
        if (chunk !== undefined) {
          if (chunk !== null) {
            chunks.push(typeof chunk === 'string' ? chunk : chunk.toString());
          }
        }
        this.writableEnded = true;
      },
    };

    const ctx = new Context<TState, TDecorators>(
      rawReq as MockRequest,
      rawRes as MockResponse,
      this
    );

    let route: RouteDefinition<TState, TDecorators> | null = null;
    let routeHooks: Record<string, unknown[]> | null = null;

    try {
      let handlerResult: unknown;

      if (this.#globalHooksActive.onRequest) {
        await this.#lifecycle.run('onRequest', ctx);
      }

      const matchedRoute = await this.#findRoute(ctx);

      if (!matchedRoute) {
        if (this.#globalHooksActive.onResponse) {
          await this.#lifecycle.run('onResponse', ctx);
        }
      } else {
        const { route: resolvedRoute, params } = matchedRoute;
        route = resolvedRoute;
        this.#ensureCompiledRoute(route);
        routeHooks = (route as RouteDefinition<TState, TDecorators>)[
          'routeHooks'
        ] as Record<string, unknown[]>;

        ctx.req.params = params;

        await this.#runHooksList(routeHooks.onRequest, ctx);

        if (this.#globalHooksActive.preParsing) {
          await this.#lifecycle.run('preParsing', ctx);
        }
        await this.#runHooksList(routeHooks.preParsing, ctx);

        if (this.#globalHooksActive.preValidation) {
          await this.#lifecycle.run('preValidation', ctx);
        }
        await this.#runHooksList(routeHooks.preValidation, ctx);

        const handler = async (ctxParam: Context<TState, TDecorators>) => {
          if (this.#globalHooksActive.preHandler) {
            await this.#lifecycle.run('preHandler', ctxParam);
          }
          if (routeHooks) {
            await this.#runHooksList(routeHooks.preHandler, ctxParam);
          }

          if (route) {
            handlerResult = await route.handler(ctxParam);
          }
        };

        const pipeline = this.#getRoutePipeline(route);
        await pipeline(ctx, handler);

        if (!ctx.res.sent && handlerResult !== undefined) {
          let payload = handlerResult;

          if (this.#globalHooksActive.onSend) {
            payload = await this.#lifecycle.run('onSend', ctx, payload);
          }

          payload = await this.#runOnSendHooksList(
            routeHooks.onSend,
            ctx,
            payload
          );
          this.#sendPayload(ctx, payload);
        }

        if (this.#globalHooksActive.onResponse) {
          await this.#lifecycle.run('onResponse', ctx);
        }
        await this.#runHooksList(routeHooks.onResponse, ctx);
      }
    } catch (error: unknown) {
      if (this.#globalHooksActive.onError) {
        try {
          await this.#lifecycle.run('onError', ctx, error);
        } catch {
          // intentionally ignored
        }
      }

      if (route) {
        try {
          await this.#runRouteHooks(route, 'onError', ctx, error);
        } catch {
          // intentionally ignored
        }
      }

      await this.#errorHandler.handle(
        error instanceof Error ? error : new Error(String(error)),
        ctx
      );
    }

    const responseBody = chunks.join('');

    return {
      statusCode,
      headers: headersWritten,
      body: responseBody,
      json<T = unknown>() {
        return JSON.parse(responseBody) as T;
      },
    };
  }

  async #handleRequest(
    rawReq: IncomingMessage,
    rawRes: ServerResponse
  ): Promise<void> {
    const ctx = new Context<TState, TDecorators>(rawReq, rawRes, this);
    let route: RouteDefinition<TState, TDecorators> | null = null;
    let routeHooks: Record<string, unknown[]> | null = null;

    try {
      let handlerResult: unknown;

      if (this.#globalHooksActive.onRequest) {
        await this.#lifecycle.run('onRequest', ctx);
      }

      const matchedRoute = await this.#findRoute(ctx);

      if (!matchedRoute) {
        if (this.#globalHooksActive.onResponse) {
          await this.#lifecycle.run('onResponse', ctx);
        }
        return;
      }

      const { route: resolvedRoute, params } = matchedRoute;
      route = resolvedRoute;
      this.#ensureCompiledRoute(route);
      routeHooks = (route as RouteDefinition<TState, TDecorators>)[
        'routeHooks'
      ] as Record<string, unknown[]>;

      ctx.req.params = params;

      await this.#runHooksList(routeHooks.onRequest, ctx);

      if (this.#globalHooksActive.preParsing) {
        await this.#lifecycle.run('preParsing', ctx);
      }
      await this.#runHooksList(routeHooks.preParsing, ctx);

      if (this.#globalHooksActive.preValidation) {
        await this.#lifecycle.run('preValidation', ctx);
      }
      await this.#runHooksList(routeHooks.preValidation, ctx);

      const handler = async (ctxParam: Context<TState, TDecorators>) => {
        if (this.#globalHooksActive.preHandler) {
          await this.#lifecycle.run('preHandler', ctxParam);
        }
        if (routeHooks) {
          await this.#runHooksList(routeHooks.preHandler, ctxParam);
        }

        if (route) {
          handlerResult = await route.handler(ctxParam);
        }
      };

      const pipeline = this.#getRoutePipeline(route);
      await pipeline(ctx, handler);

      if (!ctx.res.sent && handlerResult !== undefined) {
        let payload = handlerResult;

        if (this.#globalHooksActive.onSend) {
          payload = await this.#lifecycle.run('onSend', ctx, payload);
        }

        payload = await this.#runOnSendHooksList(
          routeHooks.onSend,
          ctx,
          payload
        );
        this.#sendPayload(ctx, payload);
      }

      if (this.#globalHooksActive.onResponse) {
        await this.#lifecycle.run('onResponse', ctx);
      }
      await this.#runHooksList(routeHooks.onResponse, ctx);
    } catch (error: unknown) {
      if (this.#globalHooksActive.onError) {
        try {
          await this.#lifecycle.run('onError', ctx, error);
        } catch {
          // Se onError hook falhar, continua para o error handler
        }
      }

      if (route) {
        try {
          await this.#runRouteHooks(route, 'onError', ctx, error);
        } catch {
          // Se onError da rota falhar, continua para o error handler
        }
      }

      await this.#errorHandler.handle(
        error instanceof Error ? error : new Error(String(error)),
        ctx
      );
    }
  }

  /**
   * Executa hooks de rota para uma fase (exceto onSend).
   */
  async #runRouteHooks(
    route: RouteDefinition<TState, TDecorators> | null,
    phase: string,
    ctx: Context<TState, TDecorators>,
    ...args: unknown[]
  ): Promise<void> {
    if (route) {
      this.#ensureCompiledRoute(route);
    }

    const hooks = (
      route?.[
        ROUTE_HOOKS as unknown as keyof RouteDefinition<TState, TDecorators>
      ] as RouteHooksMap | undefined
    )?.[phase];
    if (!hooks || hooks.length === 0) return;

    await this.#runHooksList(hooks, ctx, ...args);
  }

  async #runHooksList(
    hooks: any[] | undefined,
    ctx: Context<TState, TDecorators>,
    ...args: unknown[]
  ): Promise<void> {
    if (!hooks || hooks.length === 0) return;

    for (const hook of hooks) {
      await hook(ctx, ...args);
    }
  }

  async #runOnSendHooksList(
    hooks: any[] | undefined,
    ctx: Context<TState, TDecorators>,
    payload: any
  ): Promise<any> {
    if (!hooks || hooks.length === 0) return payload;

    let current = payload;

    for (const hook of hooks) {
      const result = await hook(ctx, current);
      if (result !== undefined) {
        current = result;
      }
    }

    return current;
  }

  #getRoutePipeline(
    route: any
  ): (
    ctx: Context<TState, TDecorators>,
    finalHandler?: (ctx: Context<TState, TDecorators>) => Promise<void>
  ) => Promise<void> {
    this.#ensureCompiledRoute(route);

    const cache = route[ROUTE_PIPELINE_CACHE];

    if (cache && cache.version === this.#middlewareVersion && cache.pipeline) {
      return cache.pipeline;
    }

    const routeMiddlewares = route[ROUTE_MIDDLEWARES] || [];
    const allMiddlewares = [...this.#middlewares, ...routeMiddlewares];
    const pipeline = compose(allMiddlewares as any);

    route[ROUTE_PIPELINE_CACHE] = {
      version: this.#middlewareVersion,
      pipeline,
    };

    return pipeline as any;
  }

  /**
   * Garante metadados compilados para rotas não compiladas previamente.
   */
  #ensureCompiledRoute(route: any): void {
    if (
      route[ROUTE_HOOKS] &&
      route[ROUTE_MIDDLEWARES] &&
      route[ROUTE_PIPELINE_CACHE]
    ) {
      return;
    }

    const routeMiddlewares = toMiddlewareArray(route.middlewares);
    const normalizedHooks = normalizeRouteHooks(route.hooks);

    route.middlewares = routeMiddlewares;
    route.hooks = normalizedHooks;
    route[ROUTE_MIDDLEWARES] = routeMiddlewares;
    route[ROUTE_HOOKS] = normalizedHooks;
    route[ROUTE_PIPELINE_CACHE] = {
      version: -1,
      pipeline: null,
    };
  }

  /**
   * Busca rota e aplica notFound handler customizado quando definido.
   */
  async #findRoute(ctx: Context<TState, TDecorators>): Promise<any> {
    try {
      return this.#router.find(ctx.req.method, ctx.req.path);
    } catch (error) {
      if (
        error instanceof NotFoundError &&
        this.#notFoundHandler &&
        !ctx.res.sent
      ) {
        await this.#handleNotFound(ctx);
        return null;
      }

      throw error;
    }
  }

  /**
   * Executa handler customizado de 404.
   */
  async #handleNotFound(ctx: Context<TState, TDecorators>): Promise<void> {
    await this.#notFoundHandler!(ctx);

    if (!ctx.res.sent) {
      ctx.res.status(404).json(new NotFoundError().toJSON());
    }
  }

  /**
   * Envia payload retornado por handler quando a resposta ainda não foi enviada.
   */
  #sendPayload(ctx: Context<TState, TDecorators>, payload: any): void {
    if (ctx.res.sent || payload === undefined) return;

    if (payload === null) {
      ctx.res.send('null');
      return;
    }

    if (Buffer.isBuffer(payload) || typeof payload === 'string') {
      ctx.res.send(payload);
      return;
    }

    if (typeof payload === 'object') {
      ctx.res.json(payload);
      return;
    }

    ctx.res.send(String(payload));
  }
}

// ─── Convenience Route Methods ──────────────────────────

for (const method of HTTP_METHODS) {
  (Zent.prototype as any)[method.toLowerCase()] = function (
    path: string,
    handler: RouteHandler,
    opts?: RouteOptions
  ) {
    this.route({ method, path, handler, ...(opts || {}) });
    return this;
  };
}
