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

export class ZentRequest {
  #raw: IncomingMessage;
  #pathCache: string | undefined;
  #queryCache: Record<string, string> | undefined;
  #hostnameCache: string | undefined;
  #params: Record<string, string> = {};
  #body: unknown = undefined;

  constructor(raw: IncomingMessage) {
    this.#raw = raw;
    this.#pathCache = undefined;
    this.#queryCache = undefined;
    this.#hostnameCache = undefined;
  }

  get raw(): IncomingMessage {
    return this.#raw;
  }

  get method(): string {
    return this.#raw.method!;
  }

  get url(): string {
    return this.#raw.url!;
  }

  get path(): string {
    if (this.#pathCache === undefined) {
      this.#pathCache = resolvePathFromUrl(this.#raw.url);
    }

    return this.#pathCache;
  }

  get query(): Record<string, string> {
    if (this.#queryCache === undefined) {
      this.#queryCache = resolveQueryFromUrl(this.#raw.url);
    }

    return this.#queryCache;
  }

  get headers(): IncomingHttpHeaders {
    return this.#raw.headers;
  }

  get params(): Record<string, string> {
    return this.#params;
  }

  set params(value: Record<string, string>) {
    this.#params = value;
  }

  get ip(): string | undefined {
    return this.#raw.socket.remoteAddress;
  }

  get hostname(): string {
    if (this.#hostnameCache === undefined) {
      this.#hostnameCache = resolveHostnameFromHostHeader(
        this.#raw.headers.host
      );
    }

    return this.#hostnameCache;
  }

  get protocol(): string {
    const socket = this.#raw.socket;
    if (
      'encrypted' in socket &&
      typeof (socket as { encrypted?: boolean }).encrypted === 'boolean'
    ) {
      return (socket as { encrypted: boolean }).encrypted ? 'https' : 'http';
    }
    return 'http';
  }

  get body(): unknown {
    return this.#body;
  }

  set body(value: unknown) {
    this.#body = value;
  }

  get(name: string): string | string[] | undefined {
    return this.#raw.headers[name.toLowerCase()];
  }

  is(type: string): boolean {
    const contentType = (this.get('content-type') as string) || '';
    return contentType.includes(type);
  }
}
