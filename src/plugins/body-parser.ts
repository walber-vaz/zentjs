import { IncomingMessage } from 'http';

import { BadRequestError, HttpError } from '../errors/http-error';
import { Middleware } from '../types/router';
import { AnyDecorators, AnyState } from '../types/util';

const NO_BODY_METHODS = new Set(['GET', 'HEAD', 'DELETE', 'OPTIONS']);

const DEFAULT_LIMIT = 1024 * 1024;

export interface BodyParserOptions {
  limit?: number;
}

function isIncomingMessage(
  raw: IncomingMessage | { body?: string | Buffer }
): raw is IncomingMessage {
  return (
    raw instanceof IncomingMessage ||
    (typeof (raw as unknown as { on?: unknown; emit?: unknown })?.on ===
      'function' &&
      typeof (raw as unknown as { on?: unknown; emit?: unknown })?.emit ===
        'function')
  );
}

function readRawBody(
  raw: IncomingMessage | { body?: string | Buffer },
  limit: number
): Promise<Buffer> {
  if ('body' in raw && raw.body !== undefined && raw.body !== null) {
    const buf = Buffer.from(raw.body);

    if (buf.length > limit) {
      const error = new HttpError(
        413,
        `Body exceeds size limit of ${limit} bytes`
      );
      throw error;
    }

    return Promise.resolve(buf);
  }

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;

    if (isIncomingMessage(raw)) {
      raw.on('data', (chunk: Buffer) => {
        size += chunk.length;

        if (size > limit) {
          raw.destroy();
          const error = new HttpError(
            413,
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
    } else {
      reject(new Error('Invalid raw body type'));
    }
  });
}

function parseBody(buffer: Buffer, contentType: string) {
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

  return buffer.toString('utf-8');
}

export function bodyParser<
  TState extends AnyState = AnyState,
  TDecorators extends AnyDecorators = AnyDecorators,
>(opts: BodyParserOptions = {}): Middleware<TState, TDecorators> {
  const limit = opts.limit ?? DEFAULT_LIMIT;

  return async function bodyParserMiddleware(ctx, next) {
    if (NO_BODY_METHODS.has(ctx.req.method)) {
      return next();
    }

    const contentType = (ctx.req.get('content-type') as string) || '';

    if (!contentType) {
      return next();
    }

    const buffer = await readRawBody(ctx.req.raw, limit);

    ctx.req.body = parseBody(buffer, contentType);

    return next();
  };
}
