import { IncomingHttpHeaders, IncomingMessage } from 'node:http';

function resolvePathFromUrl(rawUrl: string | undefined): string {
  if (!rawUrl) return '/';

  const queryIndex = rawUrl.indexOf('?');
  const path = queryIndex === -1 ? rawUrl : rawUrl.slice(0, queryIndex);

  return path || '/';
}

function resolveQueryFromUrl(
  rawUrl: string | undefined
): Record<string, string> {
  if (!rawUrl) return {};

  const queryIndex = rawUrl.indexOf('?');
  if (queryIndex === -1 || queryIndex === rawUrl.length - 1) return {};

  return Object.fromEntries(new URLSearchParams(rawUrl.slice(queryIndex + 1)));
}

function resolveHostnameFromHostHeader(
  host: string | string[] | undefined
): string {
  if (!host) return 'localhost';

  const rawHost = Array.isArray(host) ? host[0] : host;
  if (!rawHost) return 'localhost';

  if (rawHost.startsWith('[')) {
    const end = rawHost.indexOf(']');
    if (end !== -1) {
      return rawHost.slice(0, end + 1);
    }
  }

  const colonIndex = rawHost.indexOf(':');
  if (colonIndex === -1) return rawHost;

  return rawHost.slice(0, colonIndex);
}

/**
 * Wrapper sobre http.IncomingMessage.
 * Responsabilidade única: leitura e parse dos dados da requisição.
 */
export class ZentRequest {
  #raw: IncomingMessage;
  #pathCache: string | undefined;
  #queryCache: Record<string, string> | undefined;
  #hostnameCache: string | undefined;
  #params: Record<string, string> = {};
  #body: any = undefined;

  constructor(raw: IncomingMessage) {
    this.#raw = raw;
    this.#pathCache = undefined;
    this.#queryCache = undefined;
    this.#hostnameCache = undefined;
  }

  /** Objeto IncomingMessage original (escape hatch) */
  get raw(): IncomingMessage {
    return this.#raw;
  }

  /** @returns {string} Método HTTP em uppercase */
  get method(): string {
    return this.#raw.method!;
  }

  /** @returns {string} URL completa (path + query) */
  get url(): string {
    return this.#raw.url!;
  }

  /** @returns {string} Path sem query string */
  get path(): string {
    if (this.#pathCache === undefined) {
      this.#pathCache = resolvePathFromUrl(this.#raw.url);
    }

    return this.#pathCache;
  }

  /** @returns {Record<string, string>} Query params como objeto */
  get query(): Record<string, string> {
    if (this.#queryCache === undefined) {
      this.#queryCache = resolveQueryFromUrl(this.#raw.url);
    }

    return this.#queryCache;
  }

  /** @returns {import('node:http').IncomingHttpHeaders} */
  get headers(): IncomingHttpHeaders {
    return this.#raw.headers;
  }

  /** @returns {Record<string, string>} Route params populados pelo router */
  get params(): Record<string, string> {
    return this.#params;
  }

  set params(value: Record<string, string>) {
    this.#params = value;
  }

  /** @returns {string} IP do cliente */
  get ip(): string | undefined {
    return this.#raw.socket.remoteAddress;
  }

  /** @returns {string} Hostname da requisição */
  get hostname(): string {
    if (this.#hostnameCache === undefined) {
      this.#hostnameCache = resolveHostnameFromHostHeader(
        this.#raw.headers.host
      );
    }

    return this.#hostnameCache;
  }

  /** @returns {string} 'http' ou 'https' */
  get protocol(): string {
    return (this.#raw.socket as any).encrypted ? 'https' : 'http';
  }

  /** @returns {*} Body parseado (definido pelo body-parser middleware) */
  get body(): any {
    return this.#body;
  }

  set body(value: any) {
    this.#body = value;
  }

  /**
   * Retorna o valor de um header (case-insensitive).
   */
  get(name: string): string | string[] | undefined {
    return this.#raw.headers[name.toLowerCase()];
  }

  /**
   * Verifica se o Content-Type bate com o tipo informado.
   */
  is(type: string): boolean {
    const contentType = (this.get('content-type') as string) || '';
    return contentType.includes(type);
  }
}
