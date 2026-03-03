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
import { Lifecycle } from '../hooks/lifecycle.mjs';
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
  }

  // ─── Routing ──────────────────────────────────────────

  /**
   * Registra uma rota completa.
   * @param {object} definition
   */
  route(definition) {
    this.#router.route(definition);
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
   * Registra um middleware global.
   * @param {Function} fn - async (ctx, next) => {}
   * @returns {this}
   */
  use(fn) {
    if (typeof fn !== 'function') {
      throw new TypeError(`Middleware must be a function, got ${typeof fn}`);
    }

    this.#middlewares.push(fn);
    return this;
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

    return {
      get: (path, handler, routeOpts) =>
        parent.get(prefix + path, handler, routeOpts),
      post: (path, handler, routeOpts) =>
        parent.post(prefix + path, handler, routeOpts),
      put: (path, handler, routeOpts) =>
        parent.put(prefix + path, handler, routeOpts),
      patch: (path, handler, routeOpts) =>
        parent.patch(prefix + path, handler, routeOpts),
      delete: (path, handler, routeOpts) =>
        parent.delete(prefix + path, handler, routeOpts),
      head: (path, handler, routeOpts) =>
        parent.head(prefix + path, handler, routeOpts),
      options: (path, handler, routeOpts) =>
        parent.options(prefix + path, handler, routeOpts),
      all: (path, handler, routeOpts) =>
        parent.all(prefix + path, handler, routeOpts),
      route: (def) => parent.route({ ...def, path: prefix + def.path }),
      group: (groupPrefix, ...args) =>
        parent.group(prefix + groupPrefix, ...args),
      use: (fn) => parent.use(fn),
      addHook: (phase, fn) => parent.addHook(phase, fn),
      setErrorHandler: (fn) => parent.setErrorHandler(fn),
      decorate: (name, value) => parent.decorate(name, value),
      hasDecorator: (name) => parent.hasDecorator(name),
      register: (fn, pluginOpts) => {
        parent.#plugins.register((scopedApp) => fn(scopedApp, pluginOpts), {
          ...pluginOpts,
          prefix: prefix + (pluginOpts?.prefix || ''),
        });
      },
    };
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

    // Prepara body serializado
    let bodyStr;
    if (body !== undefined && body !== null) {
      if (typeof body === 'object') {
        bodyStr = JSON.stringify(body);
        headers['content-type'] = headers['content-type'] || 'application/json';
      } else {
        bodyStr = String(body);
      }
      headers['content-length'] = String(Buffer.byteLength(bodyStr));
    }

    // Mock do IncomingMessage
    const rawReq = {
      method: method.toUpperCase(),
      url,
      headers: { host: 'localhost', ...headers },
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

    try {
      let handlerResult;

      // 1. onRequest hooks
      await this.#lifecycle.run('onRequest', ctx);

      // 2. Router lookup
      const { route, params } = this.#router.find(ctx.req.method, ctx.req.path);

      // 3. Set params no request
      ctx.req.params = params;

      // 4. preParsing hooks
      await this.#lifecycle.run('preParsing', ctx);

      // 5. preValidation hooks
      await this.#lifecycle.run('preValidation', ctx);

      // 6. Montar pipeline: global middlewares + route middlewares + handler
      const routeMiddlewares = route.middlewares || [];
      const allMiddlewares = [...this.#middlewares, ...routeMiddlewares];

      // 7. preHandler hooks (executados dentro do pipeline, antes do handler)
      const handler = async (ctx) => {
        await this.#lifecycle.run('preHandler', ctx);

        // Execute route-level hooks (preHandler)
        if (route.hooks?.preHandler) {
          const routePreHandlers = Array.isArray(route.hooks.preHandler)
            ? route.hooks.preHandler
            : [route.hooks.preHandler];

          for (const hook of routePreHandlers) {
            await hook(ctx);
          }
        }

        handlerResult = await route.handler(ctx);
      };

      // 8. Execute pipeline
      const pipeline = compose(allMiddlewares);
      await pipeline(ctx, handler);

      // 8.1 onSend + envio automático para payload retornado pelo handler
      if (!ctx.res.sent && handlerResult !== undefined) {
        const payload = await this.#lifecycle.run('onSend', ctx, handlerResult);
        this.#sendPayload(ctx, payload);
      }

      // 9. onResponse hooks (após a resposta ser preparada/enviada)
      await this.#lifecycle.run('onResponse', ctx);
    } catch (error) {
      // Executa onError hooks
      if (this.#lifecycle.hasHooks('onError')) {
        try {
          await this.#lifecycle.run('onError', ctx, error);
        } catch {
          // Se onError hook falhar, continua para o error handler
        }
      }

      // Error handler gera a resposta de erro
      await this.#errorHandler.handle(error, ctx);
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
