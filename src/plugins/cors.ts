import { Context } from '../core/context';
import { Middleware } from '../types/router';
import { AnyDecorators, AnyState } from '../types/util';

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

async function resolveOrigin(
  origin: string | string[] | CorsOriginResolver | boolean | undefined,
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

function setCorsHeaders<
  TState extends AnyState = AnyState,
  TDecorators extends AnyDecorators = AnyDecorators,
>(ctx: Context<TState, TDecorators>, opts: CorsOptions, allowOrigin: string) {
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

function setPreflightHeaders<
  TState extends AnyState = AnyState,
  TDecorators extends AnyDecorators = AnyDecorators,
>(ctx: Context<TState, TDecorators>, opts: CorsOptions) {
  const methods = Array.isArray(opts.methods)
    ? opts.methods.join(', ')
    : opts.methods;
  ctx.res.header('Access-Control-Allow-Methods', methods!);

  if (opts.allowedHeaders) {
    const headers = Array.isArray(opts.allowedHeaders)
      ? opts.allowedHeaders.join(', ')
      : opts.allowedHeaders;
    ctx.res.header('Access-Control-Allow-Headers', headers);
  } else {
    const requestHeaders = ctx.req.get('access-control-request-headers');
    if (requestHeaders) {
      ctx.res.header('Access-Control-Allow-Headers', requestHeaders as string);
    }
  }

  if (opts.maxAge !== null && opts.maxAge !== undefined) {
    ctx.res.header('Access-Control-Max-Age', String(opts.maxAge));
  }
}

export function cors<
  TState extends AnyState = AnyState,
  TDecorators extends AnyDecorators = AnyDecorators,
>(opts: CorsOptions = {}): Middleware<TState, TDecorators> {
  const config = { ...DEFAULTS, ...opts };

  return async function corsMiddleware(ctx, next) {
    const requestOrigin = (ctx.req.get('origin') as string) || '';

    const allowOrigin = await resolveOrigin(config.origin, requestOrigin);

    if (allowOrigin === false) {
      return next();
    }

    setCorsHeaders(ctx, config, allowOrigin);

    if (allowOrigin !== '*') {
      ctx.res.header('Vary', 'Origin');
    }

    if (ctx.req.method === 'OPTIONS') {
      setPreflightHeaders(ctx, config);
      return ctx.res.empty(204);
    }

    return next();
  };
}
