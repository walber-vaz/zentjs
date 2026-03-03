import { HttpStatus } from '../utils/http-status.mjs';

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
  /** @type {import('node:http').ServerResponse} */
  #raw;

  /** @type {number} */
  #statusCode = HttpStatus.OK;

  /**
   * @param {import('node:http').ServerResponse} raw
   */
  constructor(raw) {
    this.#raw = raw;
  }

  /** Objeto ServerResponse original (escape hatch) */
  get raw() {
    return this.#raw;
  }

  /** @returns {boolean} Já enviou a resposta? */
  get sent() {
    return this.#raw.writableEnded;
  }

  /** @returns {number} Status code atual */
  get statusCode() {
    return this.#statusCode;
  }

  /**
   * Define o status code.
   * @param {number} code
   * @returns {this}
   */
  status(code) {
    if (this.sent) return this;

    this.#statusCode = code;
    return this;
  }

  /**
   * Define um header.
   * @param {string} name
   * @param {string | number} value
   * @returns {this}
   */
  header(name, value) {
    if (this.sent) return this;

    this.#raw.setHeader(name, value);
    return this;
  }

  /**
   * Atalho para Content-Type.
   * @param {string} contentType
   * @returns {this}
   */
  type(contentType) {
    return this.header(CONTENT_TYPE, contentType);
  }

  /**
   * Envia resposta JSON.
   * @param {*} data
   */
  json(data) {
    if (this.sent) return;

    const body = JSON.stringify(data);
    this.type(MIME_JSON);
    this.#end(body);
  }

  /**
   * Envia string ou Buffer.
   * @param {string | Buffer} data
   */
  send(data) {
    if (this.sent) return;

    if (!this.#raw.getHeader(CONTENT_TYPE)) {
      this.type(Buffer.isBuffer(data) ? 'application/octet-stream' : MIME_TEXT);
    }
    this.#end(data);
  }

  /**
   * Envia resposta HTML.
   * @param {string} data
   */
  html(data) {
    if (this.sent) return;

    this.type(MIME_HTML);
    this.#end(data);
  }

  /**
   * Redireciona para outra URL.
   * @param {string} url
   * @param {number} [code=HttpStatus.FOUND]
   */
  redirect(url, code = HttpStatus.FOUND) {
    if (this.sent) return;

    this.#statusCode = code;
    this.header('Location', url);
    this.#end();
  }

  /**
   * Resposta sem body.
   * @param {number} [code=HttpStatus.NO_CONTENT]
   */
  empty(code = HttpStatus.NO_CONTENT) {
    if (this.sent) return;

    this.#statusCode = code;
    this.#end();
  }

  /**
   * Finaliza a resposta. Método interno compartilhado.
   * @param {string | Buffer} [body]
   */
  #end(body) {
    if (this.sent) return;

    this.#raw.writeHead(this.#statusCode);

    if (body !== undefined) {
      this.#raw.end(body);
    } else {
      this.#raw.end();
    }
  }
}
