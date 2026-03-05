import { ServerResponse } from 'node:http';

import { HttpStatus } from '../utils/http-status';

const CONTENT_TYPE = 'Content-Type';
const MIME_JSON = 'application/json; charset=utf-8';
const MIME_HTML = 'text/html; charset=utf-8';
const MIME_TEXT = 'text/plain; charset=utf-8';

export class ZentResponse {
  #raw: ServerResponse;
  #statusCode: number = HttpStatus.OK;

  constructor(raw: ServerResponse) {
    this.#raw = raw;
  }

  get raw(): ServerResponse {
    return this.#raw;
  }

  get sent(): boolean {
    return this.#raw.writableEnded;
  }

  get statusCode(): number {
    return this.#statusCode;
  }

  status(code: number): this {
    if (this.sent) return this;

    this.#statusCode = code;
    return this;
  }

  header(name: string, value: string | number | string[]): this {
    if (this.sent) return this;

    this.#raw.setHeader(name, value);
    return this;
  }

  type(contentType: string): this {
    return this.header(CONTENT_TYPE, contentType);
  }

  json(data: unknown): void {
    if (this.sent) return;

    const body = JSON.stringify(data);
    this.type(MIME_JSON);
    this.#end(body);
  }

  send(data: string | Buffer): void {
    if (this.sent) return;

    if (!this.#raw.getHeader(CONTENT_TYPE)) {
      this.type(Buffer.isBuffer(data) ? 'application/octet-stream' : MIME_TEXT);
    }
    this.#end(data);
  }

  html(data: string): void {
    if (this.sent) return;

    this.type(MIME_HTML);
    this.#end(data);
  }

  redirect(url: string, code: number = HttpStatus.FOUND): void {
    if (this.sent) return;

    this.#statusCode = code;
    this.header('Location', url);
    this.#end();
  }

  empty(code: number = HttpStatus.NO_CONTENT): void {
    if (this.sent) return;

    this.#statusCode = code;
    this.#end();
  }

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
