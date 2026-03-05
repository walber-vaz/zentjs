/**
 * cors — Middleware built-in para Cross-Origin Resource Sharing (CORS).
 *
 * Suporta:
 *   - Preflight requests (OPTIONS)
 *   - Origens configuráveis (string, array, function, '*')
 *   - Methods, headers, credentials, maxAge, exposedHeaders
 *
 * Sem dependências externas.
 *
 * @module plugins/cors
 */

import { Context } from '../core/context';
import { Middleware } from '../types/router';
import { AnyDecorators, AnyState } from '../types/util';

/**
 * Opções padrão do CORS.
 */
const DEFAULTS: CorsOptions = {
  origin: '*',
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  allowedHeaders: null,
  exposedHeaders: null,
  credentials: false,
  maxAge: null,
};

export type CorsOriginResolver = (
  requestOrigin: string
) => string | false | Promise<string | false>;

export interface CorsOptions {
  origin?: string | string[] | CorsOriginResolver | boolean;
  methods?: string | string[];
  allowedHeaders?: string | string[] | null;
  exposedHeaders?: string | string[] | null;
  credentials?: boolean;
  maxAge?: number | null;
}

/**
 * Resolve o valor de origin a partir da configuration.
 */
async function resolveOrigin(
  origin: any,
  requestOrigin: string
): Promise<string | false> {
  if (origin === true || origin === '*') {
    return '*';
  }

  if (origin === false) {
    return false;
  }

  if (typeof origin === 'string') {
    return origin;
  }

  if (Array.isArray(origin)) {
    return origin.includes(requestOrigin) ? requestOrigin : false;
  }

  if (typeof origin === 'function') {
    return origin(requestOrigin);
  }

  return false;
}

/**
 * Configura os headers de CORS na resposta.
 */
function setCorsHeaders(
  ctx: Context<any, any>,
  opts: CorsOptions,
  allowOrigin: string
) {
  ctx.res.header('Access-Control-Allow-Origin', allowOrigin);

  if (opts.credentials) {
    ctx.res.header('Access-Control-Allow-Credentials', 'true');
  }

  if (opts.exposedHeaders) {
    const value = Array.isArray(opts.exposedHeaders)
      ? opts.exposedHeaders.join(', ')
      : opts.exposedHeaders;
    ctx.res.header('Access-Control-Expose-Headers', value);
  }
}

/**
 * Configura headers adicionais para preflight (OPTIONS).
 */
function setPreflightHeaders(ctx: Context<any, any>, opts: CorsOptions) {
  // Methods
  const methods = Array.isArray(opts.methods)
    ? opts.methods.join(', ')
    : opts.methods;
  ctx.res.header('Access-Control-Allow-Methods', methods!);

  // Allowed Headers
  if (opts.allowedHeaders) {
    const headers = Array.isArray(opts.allowedHeaders)
      ? opts.allowedHeaders.join(', ')
      : opts.allowedHeaders;
    ctx.res.header('Access-Control-Allow-Headers', headers);
  } else {
    // Reflect request headers
    const requestHeaders = ctx.req.get('access-control-request-headers');
    if (requestHeaders) {
      ctx.res.header('Access-Control-Allow-Headers', requestHeaders as string);
    }
  }

  // Max Age
  if (opts.maxAge !== null && opts.maxAge !== undefined) {
    ctx.res.header('Access-Control-Max-Age', String(opts.maxAge));
  }
}

/**
 * Cria o middleware CORS.
 */
export function cors<
  TState extends AnyState = AnyState,
  TDecorators extends AnyDecorators = AnyDecorators,
>(opts: CorsOptions = {}): Middleware<TState, TDecorators> {
  const config = { ...DEFAULTS, ...opts };

  return async function corsMiddleware(ctx, next) {
    const requestOrigin = (ctx.req.get('origin') as string) || '';

    const allowOrigin = await resolveOrigin(config.origin, requestOrigin);

    // Origin não permitida — prossegue sem headers CORS
    if (allowOrigin === false) {
      return next();
    }

    // Configura headers base de CORS
    setCorsHeaders(ctx, config, allowOrigin);

    // Vary header para caches
    if (allowOrigin !== '*') {
      ctx.res.header('Vary', 'Origin');
    }

    // Preflight (OPTIONS)
    if (ctx.req.method === 'OPTIONS') {
      setPreflightHeaders(ctx, config);
      return ctx.res.empty(204);
    }

    return next();
  };
}
