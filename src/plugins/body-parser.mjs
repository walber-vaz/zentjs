/**
 * bodyParser — Middleware built-in para parsing do body da requisição.
 *
 * Suporta:
 *   - application/json
 *   - text/plain
 *   - application/x-www-form-urlencoded
 *
 * Não parseia automaticamente requests sem body (GET, HEAD, DELETE, OPTIONS).
 * O body é populado em ctx.req.body após parsing.
 *
 * Decisão (ADR-007): Lazy body parsing — exige middleware explícito.
 *
 * @module plugins/body-parser
 */

import { BadRequestError } from '../errors/http-error.mjs';

/** Métodos HTTP que tipicamente não possuem body */
const NO_BODY_METHODS = new Set(['GET', 'HEAD', 'DELETE', 'OPTIONS']);

/** Limite padrão de tamanho do body: 1 MB */
const DEFAULT_LIMIT = 1024 * 1024;

/**
 * @typedef {object} BodyParserOptions
 * @property {number} [limit=1048576] - Limite máximo do body em bytes
 */

/**
 * @callback MiddlewareNext
 * @returns {void|Promise<void>}
 */

/**
 * @callback BodyParserMiddleware
 * @param {import('../core/context.mjs').Context} ctx
 * @param {MiddlewareNext} next
 * @returns {Promise<void>}
 */

/**
 * Lê o body bruto da requisição como Buffer.
 * Suporta tanto streams reais (IncomingMessage) quanto
 * objetos mockados pelo inject() (que possuem rawReq.body).
 *
 * @param {object} raw - IncomingMessage ou mock
 * @param {number} limit - Limite máximo em bytes
 * @returns {Promise<Buffer>}
 * @throws {Error} Quando body excede o limite configurado (statusCode 413)
 */
function readRawBody(raw, limit) {
  // inject() mock — body já é string, não é stream
  if (raw.body !== undefined && raw.body !== null) {
    const buf = Buffer.from(raw.body);

    if (buf.length > limit) {
      const error = new Error(`Body exceeds size limit of ${limit} bytes`);
      error.statusCode = 413;
      throw error;
    }

    return Promise.resolve(buf);
  }

  // Stream real (node:http IncomingMessage)
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;

    raw.on('data', (chunk) => {
      size += chunk.length;

      if (size > limit) {
        raw.destroy();
        const error = new Error(`Body exceeds size limit of ${limit} bytes`);
        error.statusCode = 413;
        reject(error);
        return;
      }

      chunks.push(chunk);
    });

    raw.on('end', () => {
      resolve(Buffer.concat(chunks));
    });

    raw.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Parseia o body de acordo com o Content-Type.
 *
 * @param {Buffer} buffer - Body bruto
 * @param {string} contentType - Valor do header Content-Type
 * @returns {*} Body parseado (objeto, string ou raw)
 * @throws {SyntaxError} Quando JSON for inválido
 */
function parseBody(buffer, contentType) {
  const type = (contentType || '').toLowerCase();

  if (type.includes('application/json')) {
    const text = buffer.toString('utf-8');

    if (text.length === 0) return {};

    try {
      return JSON.parse(text);
    } catch {
      throw new BadRequestError('Invalid JSON body');
    }
  }

  if (type.includes('application/x-www-form-urlencoded')) {
    const text = buffer.toString('utf-8');
    return Object.fromEntries(new URLSearchParams(text));
  }

  if (type.includes('text/')) {
    return buffer.toString('utf-8');
  }

  // Tipo desconhecido — retorna buffer como string
  return buffer.toString('utf-8');
}

/**
 * Cria o middleware bodyParser.
 *
 * @param {BodyParserOptions} [opts={}]
 * @returns {BodyParserMiddleware} Middleware (ctx, next) => Promise
 *
 * @example
 * import { bodyParser } from 'zentjs';
 *
 * app.use(bodyParser());
 * app.use(bodyParser({ limit: 512 * 1024 })); // 512 KB
 */
export function bodyParser(opts = {}) {
  const limit = opts.limit ?? DEFAULT_LIMIT;

  return async function bodyParserMiddleware(ctx, next) {
    // Pula métodos sem body
    if (NO_BODY_METHODS.has(ctx.req.method)) {
      return next();
    }

    const contentType = ctx.req.get('content-type') || '';

    // Sem content-type — pula parsing
    if (!contentType) {
      return next();
    }

    const buffer = await readRawBody(ctx.req.raw, limit);

    ctx.req.body = parseBody(buffer, contentType);

    return next();
  };
}
