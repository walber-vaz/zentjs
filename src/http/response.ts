import { ServerResponse } from 'node:http';

import { HttpStatus } from '../utils/http-status';

const CONTENT_TYPE = 'Content-Type';
const MIME_JSON = 'application/json; charset=utf-8';
const MIME_HTML = 'text/html; charset=utf-8';
const MIME_TEXT = 'text/plain; charset=utf-8';

/**
 * Wrapper sobre http.ServerResponse.
 * Responsabilidade única: construção e envio da resposta HTTP.
 * API fluente (chainable) para status e headers.
 */
export class ZentResponse {
  #raw: ServerResponse;
  #statusCode: number = HttpStatus.OK;

  constructor(raw: ServerResponse) {
    this.#raw = raw;
  }

  /** Objeto ServerResponse original (escape hatch) */
  get raw(): ServerResponse {
    return this.#raw;
  }

  /** @returns {boolean} Já enviou a resposta? */
  get sent(): boolean {
    return this.#raw.writableEnded;
  }

  /** @returns {number} Status code atual */
  get statusCode(): number {
    return this.#statusCode;
  }

  /**
   * Define o status code.
   */
  status(code: number): this {
    if (this.sent) return this;

    this.#statusCode = code;
    return this;
  }

  /**
   * Define um header.
   */
  header(name: string, value: string | number | string[]): this {
    if (this.sent) return this;

    this.#raw.setHeader(name, value);
    return this;
  }

  /**
   * Atalho para Content-Type.
   */
  type(contentType: string): this {
    return this.header(CONTENT_TYPE, contentType);
  }

  /**
   * Envia resposta JSON.
   */
  json(data: any): void {
    if (this.sent) return;

    const body = JSON.stringify(data);
    this.type(MIME_JSON);
    this.#end(body);
  }

  /**
   * Envia string ou Buffer.
   */
  send(data: string | Buffer): void {
    if (this.sent) return;

    if (!this.#raw.getHeader(CONTENT_TYPE)) {
      this.type(Buffer.isBuffer(data) ? 'application/octet-stream' : MIME_TEXT);
    }
    this.#end(data);
  }

  /**
   * Envia resposta HTML.
   */
  html(data: string): void {
    if (this.sent) return;

    this.type(MIME_HTML);
    this.#end(data);
  }

  /**
   * Redireciona para outra URL.
   */
  redirect(url: string, code: number = HttpStatus.FOUND): void {
    if (this.sent) return;

    this.#statusCode = code;
    this.header('Location', url);
    this.#end();
  }

  /**
   * Resposta sem body.
   */
  empty(code: number = HttpStatus.NO_CONTENT): void {
    if (this.sent) return;

    this.#statusCode = code;
    this.#end();
  }

  /**
   * Finaliza a resposta. Método interno compartilhado.
   */
  #end(body?: string | Buffer): void {
    if (this.sent) return;

    this.#raw.writeHead(this.#statusCode);

    if (body !== undefined) {
      this.#raw.end(body);
    } else {
      this.#raw.end();
    }
  }
}
