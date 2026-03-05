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

import { BadRequestError } from '../errors/http-error';
import { Middleware } from '../types/router';
import { AnyDecorators, AnyState } from '../types/util';

/** Métodos HTTP que tipicamente não possuem body */
const NO_BODY_METHODS = new Set(['GET', 'HEAD', 'DELETE', 'OPTIONS']);

/** Limite padrão de tamanho do body: 1 MB */
const DEFAULT_LIMIT = 1024 * 1024;

export interface BodyParserOptions {
  limit?: number;
}

/**
 * Lê o body bruto da requisição como Buffer.
 */
function readRawBody(raw: any, limit: number): Promise<Buffer> {
  // inject() mock — body já é string, não é stream
  if (raw.body !== undefined && raw.body !== null) {
    const buf = Buffer.from(raw.body);

    if (buf.length > limit) {
      const error: any = new Error(`Body exceeds size limit of ${limit} bytes`);
      error.statusCode = 413;
      throw error;
    }

    return Promise.resolve(buf);
  }

  // Stream real (node:http IncomingMessage)
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;

    raw.on('data', (chunk: Buffer) => {
      size += chunk.length;

      if (size > limit) {
        raw.destroy();
        const error: any = new Error(
          `Body exceeds size limit of ${limit} bytes`
        );
        error.statusCode = 413;
        reject(error);
        return;
      }

      chunks.push(chunk);
    });

    raw.on('end', () => {
      resolve(Buffer.concat(chunks));
    });

    raw.on('error', (err: Error) => {
      reject(err);
    });
  });
}

/**
 * Parseia o body de acordo com o Content-Type.
 */
function parseBody(buffer: Buffer, contentType: string): any {
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
 */
export function bodyParser<
  TState extends AnyState = AnyState,
  TDecorators extends AnyDecorators = AnyDecorators,
>(opts: BodyParserOptions = {}): Middleware<TState, TDecorators> {
  const limit = opts.limit ?? DEFAULT_LIMIT;

  return async function bodyParserMiddleware(ctx, next) {
    // Pula métodos sem body
    if (NO_BODY_METHODS.has(ctx.req.method)) {
      return next();
    }

    const contentType = (ctx.req.get('content-type') as string) || '';

    // Sem content-type — pula parsing
    if (!contentType) {
      return next();
    }

    const buffer = await readRawBody(ctx.req.raw, limit);

    ctx.req.body = parseBody(buffer, contentType);

    return next();
  };
}
