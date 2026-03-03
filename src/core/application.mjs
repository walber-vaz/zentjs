/**
 * Application — Classe principal do framework ZentJS.
 *
 * Orquestra todos os componentes: Router, Lifecycle, ErrorHandler, Pipeline.
 * Expõe a API pública para o usuário registrar rotas, middlewares,
 * hooks e plugins, e iniciar/parar o servidor HTTP.
 *
 * @module core/application
 */

import { createServer } from 'node:http';

import { ErrorHandler } from '../errors/error-handler.mjs';
import { NotFoundError } from '../errors/http-error.mjs';
import { HOOK_PHASES, Lifecycle } from '../hooks/lifecycle.mjs';
import { compose } from '../middleware/pipeline.mjs';
import { PluginManager } from '../plugins/manager.mjs';
import { Router } from '../router/index.mjs';
import { Context } from './context.mjs';

const HTTP_METHODS = [
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'HEAD',
  'OPTIONS',
];

const SCOPE_DECORATORS = Symbol('scopeDecorators');
const SCOPE_MIDDLEWARES = Symbol('scopeMiddlewares');
const SCOPE_HOOKS = Symbol('scopeHooks');
const ROUTE_HOOKS = Symbol('routeHooks');
const ROUTE_MIDDLEWARES = Symbol('routeMiddlewares');
const ROUTE_PIPELINE_CACHE = Symbol('routePipelineCache');

/**
 * Cria um registro de decorators com herança por escopo.
 * @param {{ values: object } | null} parentRegistry
 * @returns {{ values: object, has: (name: string) => boolean, define: (name: string, value: *) => void }}
 */
function createScopeDecoratorRegistry(parentRegistry = null) {
  const values = Object.create(parentRegistry?.values || null);

  return {
    values,
    has(name) {
      return name in values;
    },
    define(name, value) {
      if (name in values) {
        throw new Error(`Decorator "${name}" already exists`);
      }

      values[name] = value;
    },
  };
}

/**
 * Clona mapa de hooks preservando funções.
 * @param {object | null | undefined} hooks
 * @returns {object}
 */
function cloneHooksMap(hooks) {
  const cloned = {};

  if (!hooks) return cloned;

  for (const [phase, fns] of Object.entries(hooks)) {
    cloned[phase] = Array.isArray(fns) ? [...fns] : [fns];
  }

  return cloned;
}

/**
 * Mescla hooks preservando ordem: base -> extra.
 * @param {object | null | undefined} baseHooks
 * @param {object | null | undefined} extraHooks
 * @returns {object}
 */
function mergeHooksMap(baseHooks, extraHooks) {
  const merged = cloneHooksMap(baseHooks);

  if (!extraHooks) return merged;

  for (const [phase, fns] of Object.entries(extraHooks)) {
    const list = Array.isArray(fns) ? fns : [fns];
    merged[phase] = [...(merged[phase] || []), ...list];
  }

  return merged;
}

/**
 * Normaliza entrada de middlewares para array.
 * @param {Function[] | Function | undefined} middlewares
 * @returns {Function[]}
 */
function toMiddlewareArray(middlewares) {
  if (!middlewares) return [];
  return Array.isArray(middlewares) ? middlewares : [middlewares];
}

/**
 * Normaliza hooks de rota para arrays por fase.
 * @param {object | null | undefined} hooks
 * @returns {Record<string, Function[]>}
 */
function normalizeRouteHooks(hooks) {
  const normalized = {};

  if (!hooks) return normalized;

  for (const phase of HOOK_PHASES) {
    const phaseHooks = hooks[phase];
    if (!phaseHooks) continue;
    normalized[phase] = Array.isArray(phaseHooks) ? phaseHooks : [phaseHooks];
  }

  return normalized;
}

/**
 * Compila definição de rota para reduzir custo no hot path.
 * @param {object} definition
 * @returns {object}
 */
function compileRouteDefinition(definition) {
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

/**
 * Normaliza prefixo de middleware.
 * @param {string} prefix
 * @returns {string}
 */
function normalizeMiddlewarePrefix(prefix) {
  const trimmed = prefix.trim();

  if (!trimmed || trimmed === '/') return '/';

  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return withLeadingSlash.replace(/\/+$/, '');
}

/**
 * Verifica se o path atual pertence ao prefixo configurado.
 * @param {string} path
 * @param {string} prefix
 * @returns {boolean}
 */
function pathMatchesPrefix(path, prefix) {
  if (prefix === '/') return true;
  return path === prefix || path.startsWith(`${prefix}/`);
}

/**
 * Normaliza headers para lowercase simulando IncomingMessage.headers.
 * @param {Record<string, string>} headers
 * @returns {Record<string, string>}
 */
function normalizeInjectHeaders(headers = {}) {
  const normalized = {};

  for (const [name, value] of Object.entries(headers)) {
    normalized[name.toLowerCase()] = value;
  }

  return normalized;
}

/**
 * Cria uma nova instância da aplicação ZentJS.
 *
 * @param {object} [opts]
 * @param {boolean} [opts.ignoreTrailingSlash=true]
 * @param {boolean} [opts.caseSensitive=false]
 * @returns {Zent}
 */
export function zent(opts = {}) {
  return new Zent(opts);
}

/**
 * Classe principal do framework.
 * Responsabilidade: orquestrar Router, Lifecycle, Pipeline e ErrorHandler.
 */
export class Zent {
  /** @type {import('node:http').Server | null} */
  #server;

  /** @type {Router} */
  #router;

  /** @type {Lifecycle} */
  #lifecycle;

  /** @type {ErrorHandler} */
  #errorHandler;

  /** @type {Function[]} */
  #middlewares;

  /** @type {Record<string, *>} */
  #decorators;

  /** @type {PluginManager} */
  #plugins;

  /** @type {number} */
  #middlewareVersion;

  /** @type {Record<string, boolean>} */
  #globalHooksActive;

  /** @type {((ctx: Context) => void | Promise<void>) | null} */
  #notFoundHandler;

  /**
   * @param {object} [opts]
   * @param {boolean} [opts.ignoreTrailingSlash=true]
   * @param {boolean} [opts.caseSensitive=false]
   */
  constructor(opts = {}) {
    this.#server = null;
    this.#router = new Router({
      ignoreTrailingSlash: opts.ignoreTrailingSlash,
      caseSensitive: opts.caseSensitive,
    });
    this.#lifecycle = new Lifecycle();
    this.#errorHandler = new ErrorHandler();
    this.#middlewares = [];
    this.#decorators = {};
    this.#plugins = new PluginManager();
    this.#notFoundHandler = null;
    this.#middlewareVersion = 0;
    this.#globalHooksActive = Object.fromEntries(
      HOOK_PHASES.map((phase) => [phase, false])
    );
  }

  // ─── Routing ──────────────────────────────────────────

  /**
   * Registra uma rota completa.
   * @param {object} definition
   */
  route(definition) {
    this.#router.route(compileRouteDefinition(definition));
    return this;
  }

  /**
   * Registra rota para todos os métodos HTTP.
   * @param {string} path
   * @param {Function} handler
   * @param {object} [opts]
   */
  all(path, handler, opts) {
    this.#router.all(path, handler, opts);
    return this;
  }

  /**
   * Agrupa rotas sob um prefixo.
   * @param {string} prefix
   * @param  {...any} args
   */
  group(prefix, ...args) {
    this.#router.group(prefix, ...args);
    return this;
  }

  // ─── Middleware ───────────────────────────────────────

  /**
   * Registra middleware global ou com prefixo.
   * @param {Function|string} arg1 - middleware ou prefixo
   * @param {Function} [arg2] - middleware quando usar prefixo
   * @returns {this}
   */
  use(arg1, arg2) {
    if (typeof arg1 === 'function' && arg2 === undefined) {
      this.#middlewares.push(arg1);
      this.#middlewareVersion++;
      return this;
    }

    if (typeof arg1 === 'string' && typeof arg2 === 'function') {
      const prefix = normalizeMiddlewarePrefix(arg1);

      this.#middlewares.push(async (ctx, next) => {
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

  // ─── Lifecycle Hooks ──────────────────────────────────

  /**
   * Registra um hook de lifecycle.
   * @param {string} phase
   * @param {Function} fn
   * @returns {this}
   */
  addHook(phase, fn) {
    this.#lifecycle.addHook(phase, fn);
    this.#globalHooksActive[phase] = true;
    return this;
  }

  // ─── Error Handling ───────────────────────────────────

  /**
   * Define um error handler customizado.
   * @param {Function} fn - (error, ctx) => {}
   * @returns {this}
   */
  setErrorHandler(fn) {
    this.#errorHandler.setErrorHandler(fn);
    return this;
  }

  /**
   * Define um handler customizado para rotas não encontradas (404).
   * @param {(ctx: Context) => void | Promise<void>} fn
   * @returns {this}
   */
  setNotFoundHandler(fn) {
    if (typeof fn !== 'function') {
      throw new TypeError(
        `Not found handler must be a function, got ${typeof fn}`
      );
    }

    this.#notFoundHandler = fn;
    return this;
  }

  // ─── Decorators ───────────────────────────────────────

  /**
   * Adiciona uma propriedade/método à instância da aplicação.
   * Acessível via ctx.app.nome nos handlers.
   * @param {string} name
   * @param {*} value
   * @returns {this}
   */
  decorate(name, value) {
    if (name in this) {
      throw new Error(`Decorator "${name}" already exists`);
    }

    this.#decorators[name] = value;
    this[name] = value;
    return this;
  }

  /**
   * Verifica se um decorator existe.
   * @param {string} name
   * @returns {boolean}
   */
  hasDecorator(name) {
    return name in this.#decorators;
  }

  // ─── Plugins ──────────────────────────────────────────

  /**
   * Registra um plugin para ser carregado antes do listen/inject.
   * Cada plugin recebe uma instância encapsulada do app.
   *
   * @param {Function} fn - async (app, opts) => {}
   * @param {object} [opts={}] - Opções do plugin (ex: { prefix: '/api' })
   * @returns {this}
   */
  register(fn, opts = {}) {
    this.#plugins.register(fn, opts);
    return this;
  }

  /**
   * Carrega todos os plugins registrados se ainda não foram carregados.
   * Cria escopos encapsulados: rotas do plugin são prefixadas,
   * hooks e decorators são isolados no escopo, middlewares são herdados.
   *
   * @returns {Promise<void>}
   */
  async #loadPlugins() {
    if (this.#plugins.loaded) return;

    await this.#plugins.load((opts) => this.#createScope(opts));
  }

  /**
   * Cria um escopo encapsulado para um plugin.
   * O escopo herda middlewares e hooks do pai mas adiciona
   * rotas e decorators de forma isolada.
   *
   * @param {object} opts - Opções do plugin
   * @returns {object} Escopo encapsulado com a mesma API do Zent
   */
  #createScope(opts) {
    const prefix = opts.prefix || '';
    const parent = this;
    const decoratorRegistry = createScopeDecoratorRegistry(
      opts[SCOPE_DECORATORS] || null
    );
    const scopeMiddlewares = [...(opts[SCOPE_MIDDLEWARES] || [])];
    const scopeHooks = cloneHooksMap(opts[SCOPE_HOOKS]);

    const scope = {};

    const scopeDecorate = (name, value) => {
      if (name in scope) {
        throw new Error(`Decorator "${name}" already exists`);
      }

      decoratorRegistry.define(name, value);
      scope[name] = value;
    };

    const scopeHasDecorator = (name) => decoratorRegistry.has(name);

    const scopeUse = (arg1, arg2) => {
      if (typeof arg1 === 'function' && arg2 === undefined) {
        scopeMiddlewares.push(arg1);
        return scope;
      }

      if (typeof arg1 === 'string' && typeof arg2 === 'function') {
        const scopedPrefix = `${prefix}${arg1.startsWith('/') ? '' : '/'}${arg1}`;
        const localPrefix = normalizeMiddlewarePrefix(scopedPrefix);

        scopeMiddlewares.push(async (ctx, next) => {
          if (!pathMatchesPrefix(ctx.req.path, localPrefix)) {
            return next();
          }

          return arg2(ctx, next);
        });

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

    const scopeAddHook = (phase, fn) => {
      if (!HOOK_PHASES.includes(phase)) {
        throw new Error(
          `Invalid hook phase: "${phase}". Valid phases: ${HOOK_PHASES.join(', ')}`
        );
      }

      if (typeof fn !== 'function') {
        throw new TypeError(`Hook must be a function, got ${typeof fn}`);
      }

      const existing = scopeHooks[phase] || [];
      scopeHooks[phase] = [...existing, fn];
      return scope;
    };

    const withScopeRouteOpts = (routeOpts = {}) => {
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
      (method) =>
      (path, handler, routeOpts = {}) => {
        parent[method](prefix + path, handler, withScopeRouteOpts(routeOpts));
        return scope;
      };

    const scopeRoute = (def) => {
      const routeOpts = withScopeRouteOpts({
        middlewares: def.middlewares,
        hooks: def.hooks,
      });

      parent.route({
        ...def,
        path: prefix + def.path,
        middlewares: routeOpts.middlewares,
        hooks: routeOpts.hooks,
      });
      return scope;
    };

    const scopeAll = (path, handler, routeOpts = {}) => {
      for (const method of HTTP_METHODS) {
        scopeRoute({ method, path, handler, ...routeOpts });
      }
      return scope;
    };

    const scopeGroup = (groupPrefix, ...args) => {
      const groupOpts = typeof args[0] === 'function' ? {} : args.shift() || {};
      const callback = args[0];

      const mergedGroupOpts = {
        ...groupOpts,
        middlewares: [
          ...scopeMiddlewares,
          ...toMiddlewareArray(groupOpts.middlewares),
        ],
        hooks: mergeHooksMap(scopeHooks, groupOpts.hooks || {}),
      };

      parent.group(prefix + groupPrefix, mergedGroupOpts, callback);
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
      setErrorHandler: (fn) => {
        parent.setErrorHandler(fn);
        return scope;
      },
      setNotFoundHandler: (fn) => {
        parent.setNotFoundHandler(fn);
        return scope;
      },
      decorate: scopeDecorate,
      hasDecorator: scopeHasDecorator,
      register: (fn, pluginOpts) => {
        const nextOpts = {
          ...(pluginOpts || {}),
          prefix: prefix + (pluginOpts?.prefix || ''),
          [SCOPE_DECORATORS]: decoratorRegistry,
          [SCOPE_MIDDLEWARES]: [...scopeMiddlewares],
          [SCOPE_HOOKS]: cloneHooksMap(scopeHooks),
        };

        parent.#plugins.register((scopedApp, resolvedOpts) => {
          return fn(scopedApp, resolvedOpts);
        }, nextOpts);
      },
    });
  }

  // ─── Server ───────────────────────────────────────────

  /**
   * Inicia o servidor HTTP.
   * @param {object} [opts]
   * @param {number} [opts.port=3000]
   * @param {string} [opts.host='0.0.0.0']
   * @param {Function} [callback] - (err, address) => {}
   * @returns {Promise<string>} Endereço do servidor
   */
  async listen(opts = {}, callback) {
    await this.#loadPlugins();

    const port = opts.port ?? 3000;
    const host = opts.host ?? '0.0.0.0';

    this.#server = createServer((req, res) => {
      this.#handleRequest(req, res);
    });

    return new Promise((resolve, reject) => {
      this.#server.listen(port, host, () => {
        const boundPort = this.#server.address().port;
        const address = `http://${host}:${boundPort}`;

        if (callback) {
          callback(null, address);
        }

        resolve(address);
      });

      this.#server.on('error', (err) => {
        if (callback) {
          callback(err);
        }

        reject(err);
      });
    });
  }

  /**
   * Encerra o servidor HTTP.
   * @returns {Promise<void>}
   */
  async close() {
    if (!this.#server) return;

    return new Promise((resolve, reject) => {
      this.#server.close((err) => {
        this.#server = null;

        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  // ─── Inject (test helper) ────────────────────────────

  /**
   * Simula uma requisição HTTP sem abrir uma porta de rede.
   * Ideal para testes unitários/integração.
   *
   * @param {object} opts
   * @param {string} opts.method - HTTP method
   * @param {string} opts.url - Request path
   * @param {Record<string, string>} [opts.headers] - Headers
   * @param {string | object} [opts.body] - Body (string ou objeto → JSON)
   * @returns {Promise<{ statusCode: number, headers: object, body: string, json: Function }>}
   */
  async inject(opts) {
    await this.#loadPlugins();

    const { method = 'GET', url = '/', headers = {}, body } = opts;
    const normalizedHeaders = normalizeInjectHeaders(headers);

    // Prepara body serializado
    let bodyStr;
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

    // Mock do IncomingMessage
    const rawReq = {
      method: method.toUpperCase(),
      url,
      headers: { host: 'localhost', ...normalizedHeaders },
      socket: { remoteAddress: '127.0.0.1', encrypted: false },
      body: bodyStr ?? null,
    };

    // Mock do ServerResponse — acumula dados escritos
    const chunks = [];
    let headersWritten = {};
    let statusCode = 200;

    const rawRes = {
      writableEnded: false,

      setHeader(name, value) {
        headersWritten[name.toLowerCase()] = value;
      },

      getHeader(name) {
        return headersWritten[name.toLowerCase()];
      },

      writeHead(code) {
        statusCode = code;
      },

      end(chunk) {
        if (chunk !== undefined) {
          chunks.push(typeof chunk === 'string' ? chunk : chunk.toString());
        }
        this.writableEnded = true;
      },
    };

    // Executa o request dispatch
    await this.#handleRequest(rawReq, rawRes);

    const responseBody = chunks.join('');

    return {
      statusCode,
      headers: headersWritten,
      body: responseBody,
      json() {
        return JSON.parse(responseBody);
      },
    };
  }

  // ─── Request Dispatch (internal) ─────────────────────

  /**
   * Processa uma requisição HTTP completa.
   * Orquestra: Context → Hooks → Router → Middleware → Handler → Response.
   *
   * @param {import('node:http').IncomingMessage} rawReq
   * @param {import('node:http').ServerResponse} rawRes
   */
  async #handleRequest(rawReq, rawRes) {
    const ctx = new Context(rawReq, rawRes, this);
    let route = null;
    let routeHooks = null;

    try {
      let handlerResult;

      // 1. onRequest hooks
      if (this.#globalHooksActive.onRequest) {
        await this.#lifecycle.run('onRequest', ctx);
      }

      // 2. Router lookup
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
      routeHooks = route[ROUTE_HOOKS];

      // 3. Set params no request
      ctx.req.params = params;

      // 3.1 route-level onRequest hooks
      await this.#runHooksList(routeHooks.onRequest, ctx);

      // 4. preParsing hooks
      if (this.#globalHooksActive.preParsing) {
        await this.#lifecycle.run('preParsing', ctx);
      }
      await this.#runHooksList(routeHooks.preParsing, ctx);

      // 5. preValidation hooks
      if (this.#globalHooksActive.preValidation) {
        await this.#lifecycle.run('preValidation', ctx);
      }
      await this.#runHooksList(routeHooks.preValidation, ctx);

      // 6. Montar pipeline: global middlewares + route middlewares + handler
      // 7. preHandler hooks (executados dentro do pipeline, antes do handler)
      const handler = async (ctx) => {
        if (this.#globalHooksActive.preHandler) {
          await this.#lifecycle.run('preHandler', ctx);
        }
        await this.#runHooksList(routeHooks.preHandler, ctx);

        handlerResult = await route.handler(ctx);
      };

      // 8. Execute pipeline
      const pipeline = this.#getRoutePipeline(route);
      await pipeline(ctx, handler);

      // 8.1 onSend + envio automático para payload retornado pelo handler
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

      // 9. onResponse hooks (após a resposta ser preparada/enviada)
      if (this.#globalHooksActive.onResponse) {
        await this.#lifecycle.run('onResponse', ctx);
      }
      await this.#runHooksList(routeHooks.onResponse, ctx);
    } catch (error) {
      // Executa onError hooks
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

      await this.#errorHandler.handle(error, ctx);
    }
  }

  /**
   * Executa hooks de rota para uma fase (exceto onSend).
   * @param {object | null} route
   * @param {string} phase
   * @param {Context} ctx
   * @param {...*} args
   * @returns {Promise<void>}
   */
  async #runRouteHooks(route, phase, ctx, ...args) {
    if (route) {
      this.#ensureCompiledRoute(route);
    }

    const hooks = route?.[ROUTE_HOOKS]?.[phase];
    if (!hooks || hooks.length === 0) return;

    await this.#runHooksList(hooks, ctx, ...args);
  }

  /**
   * Executa uma lista de hooks sequencialmente.
   * @param {Function[] | undefined} hooks
   * @param {Context} ctx
   * @param {...*} args
   */
  async #runHooksList(hooks, ctx, ...args) {
    if (!hooks || hooks.length === 0) return;

    for (const hook of hooks) {
      await hook(ctx, ...args);
    }
  }

  /**
   * Executa hooks onSend encadeando payload.
   * @param {Function[] | undefined} hooks
   * @param {Context} ctx
   * @param {*} payload
   * @returns {Promise<*>}
   */
  async #runOnSendHooksList(hooks, ctx, payload) {
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

  /**
   * Retorna pipeline compilado por rota com cache por versão de middlewares globais.
   * @param {object} route
   * @returns {(ctx: object, finalHandler?: Function) => Promise<void>}
   */
  #getRoutePipeline(route) {
    this.#ensureCompiledRoute(route);

    const cache = route[ROUTE_PIPELINE_CACHE];

    if (cache && cache.version === this.#middlewareVersion && cache.pipeline) {
      return cache.pipeline;
    }

    const routeMiddlewares = route[ROUTE_MIDDLEWARES] || [];
    const allMiddlewares = [...this.#middlewares, ...routeMiddlewares];
    const pipeline = compose(allMiddlewares);

    route[ROUTE_PIPELINE_CACHE] = {
      version: this.#middlewareVersion,
      pipeline,
    };

    return pipeline;
  }

  /**
   * Garante metadados compilados para rotas não compiladas previamente.
   * @param {object} route
   */
  #ensureCompiledRoute(route) {
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
   * @param {Context} ctx
   * @returns {{ route: object, params: Record<string, string> }}
   */
  async #findRoute(ctx) {
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
   * @param {Context} ctx
   * @returns {Promise<void>}
   */
  async #handleNotFound(ctx) {
    await this.#notFoundHandler(ctx);

    if (!ctx.res.sent) {
      ctx.res.status(404).json(new NotFoundError().toJSON());
    }
  }

  /**
   * Envia payload retornado por handler quando a resposta ainda não foi enviada.
   * @param {Context} ctx
   * @param {*} payload
   */
  #sendPayload(ctx, payload) {
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
  /**
   * @param {string} path
   * @param {Function} handler
   * @param {object} [opts]
   */
  Zent.prototype[method.toLowerCase()] = function (path, handler, opts) {
    this.route({ method, path, handler, ...(opts || {}) });
    return this;
  };
}
