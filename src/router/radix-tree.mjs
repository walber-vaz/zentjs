import { MethodNotAllowedError, NotFoundError } from '../errors/http-error.mjs';
import { Node } from './node.mjs';

/**
 * Radix Tree (Patricia Trie) para roteamento HTTP.
 * Responsabilidade única: inserir e buscar rotas por path.
 * Complexidade de lookup: O(k) onde k = comprimento do path.
 */
export class RadixTree {
  /** @type {Node} */
  #root;

  /** @type {boolean} */
  #ignoreTrailingSlash;

  /** @type {boolean} */
  #caseSensitive;

  /**
   * @param {object} [opts]
   * @param {boolean} [opts.ignoreTrailingSlash=true]
   * @param {boolean} [opts.caseSensitive=false]
   */
  constructor(opts = {}) {
    this.#root = new Node();
    this.#ignoreTrailingSlash = opts.ignoreTrailingSlash ?? true;
    this.#caseSensitive = opts.caseSensitive ?? false;
  }

  /**
   * Concatena segmentos a partir de um índice sem criar slice intermediário.
   * @param {string[]} segments
   * @param {number} startIndex
   * @returns {string}
   */
  #joinSegmentsFrom(segments, startIndex) {
    if (startIndex >= segments.length) return '';

    let result = segments[startIndex];
    for (let i = startIndex + 1; i < segments.length; i++) {
      result += `/${segments[i]}`;
    }

    return result;
  }

  /**
   * Registra uma rota na árvore.
   * @param {string} method - HTTP method (GET, POST, etc.)
   * @param {string} path - Route path (ex: /users/:id/posts)
   * @param {object} route - { handler, hooks?, middlewares? }
   */
  add(method, path, route) {
    const segments = this.#splitPath(this.#normalizePath(path));
    let current = this.#root;

    for (const segment of segments) {
      if (segment.startsWith(':')) {
        // Segmento de parâmetro
        const paramName = segment.slice(1);

        if (!current.paramChild) {
          current.paramChild = new Node(segment);
          current.paramChild.paramName = paramName;
        }

        current = current.paramChild;
      } else if (segment.startsWith('*')) {
        // Segmento wildcard
        const wildcardName = segment.slice(1) || 'wildcard';

        if (!current.wildcardChild) {
          current.wildcardChild = new Node(segment);
          current.wildcardChild.wildcardName = wildcardName;
        }

        current = current.wildcardChild;
        break; // Wildcard consome o resto do path
      } else {
        // Segmento estático
        current = this.#insertStatic(current, segment);
      }
    }

    current.addHandler(method, route);
  }

  /**
   * Busca uma rota na árvore.
   * @param {string} method - HTTP method
   * @param {string} path - Request path
   * @returns {{ route: object, params: Record<string, string> }}
   * @throws {NotFoundError} Rota não encontrada
   * @throws {MethodNotAllowedError} Método não permitido
   */
  find(method, path) {
    const normalizedPath = this.#normalizePath(path);
    const segments = this.#splitPath(normalizedPath);
    const params = {};

    const node = this.#search(this.#root, segments, 0, params);

    if (!node) {
      throw new NotFoundError(`Route not found: ${method} ${path}`);
    }

    const route = node.getHandler(method);

    if (!route) {
      const error = new MethodNotAllowedError(
        `Method ${method} not allowed for ${path}`
      );
      error.allowedMethods = node.allowedMethods;
      throw error;
    }

    return { route, params };
  }

  /**
   * Busca recursiva na árvore.
   * @param {Node} node
   * @param {string[]} segments
   * @param {number} index
   * @param {Record<string, string>} params
   * @returns {Node | null}
   */
  #search(node, segments, index, params) {
    // Todos os segmentos consumidos — retorna o nó se tem handlers
    if (index === segments.length) {
      return node.hasHandlers ? node : null;
    }

    const segment = segments[index];

    // 1. Tenta match estático (prioridade mais alta)
    const staticChild = this.#findStaticChild(node, segment);
    if (staticChild) {
      const result = this.#search(staticChild, segments, index + 1, params);
      if (result) return result;
    }

    // 2. Tenta match por parâmetro
    if (node.paramChild) {
      params[node.paramChild.paramName] = segment;
      const result = this.#search(node.paramChild, segments, index + 1, params);
      if (result) return result;
      delete params[node.paramChild.paramName]; // Backtrack
    }

    // 3. Tenta match wildcard (prioridade mais baixa)
    if (node.wildcardChild) {
      params[node.wildcardChild.wildcardName] = this.#joinSegmentsFrom(
        segments,
        index
      );
      return node.wildcardChild;
    }

    return null;
  }

  /**
   * Insere um segmento estático na árvore, dividindo nós quando necessário.
   * @param {Node} parent
   * @param {string} segment
   * @returns {Node}
   */
  #insertStatic(parent, segment) {
    const key = this.#segmentKey(segment);
    const existing = parent.children.get(key);

    if (!existing) {
      const child = new Node(segment);
      parent.children.set(key, child);
      return child;
    }

    const existingPrefix = this.#caseSensitive
      ? existing.prefix
      : existing.prefix.toLowerCase();
    const newSegment = this.#caseSensitive ? segment : segment.toLowerCase();

    // Calcula o prefixo comum
    const commonLen = this.#commonPrefixLength(existingPrefix, newSegment);

    // Prefixo idêntico — avança para o nó existente
    if (commonLen === existing.prefix.length && commonLen === segment.length) {
      return existing;
    }

    // O segmento existente é um prefixo do novo — continua na subárvore
    if (commonLen === existing.prefix.length) {
      const remainder = segment.slice(commonLen);
      return this.#insertStatic(existing, remainder);
    }

    // Split: dividir o nó existente
    const splitNode = new Node(existing.prefix.slice(0, commonLen));

    // O antigo nó vira filho do split
    existing.prefix = existing.prefix.slice(commonLen);
    const existingNewKey = this.#segmentKey(existing.prefix);
    splitNode.children.set(existingNewKey, existing);

    // Atualiza o parent para apontar pro split
    parent.children.set(key, splitNode);

    // Se o segmento novo é exatamente o prefixo comum, o splitNode é o destino
    if (commonLen === segment.length) {
      return splitNode;
    }

    // Cria novo nó para o restante do segmento
    const remainder = segment.slice(commonLen);
    const newChild = new Node(remainder);
    const newKey = this.#segmentKey(remainder);
    splitNode.children.set(newKey, newChild);

    return newChild;
  }

  /**
   * Busca um filho estático que corresponda ao segmento.
   * @param {Node} node
   * @param {string} segment
   * @returns {Node | null}
   */
  #findStaticChild(node, segment) {
    const key = this.#segmentKey(segment);
    const child = node.children.get(key);

    if (!child) return null;

    const childPrefix = this.#caseSensitive
      ? child.prefix
      : child.prefix.toLowerCase();
    const target = this.#caseSensitive ? segment : segment.toLowerCase();

    if (target === childPrefix) {
      return child;
    }

    // O prefix do filho é início do segmento — continua descendo
    if (target.startsWith(childPrefix)) {
      const remainder = segment.slice(child.prefix.length);
      return this.#findStaticChild(child, remainder);
    }

    return null;
  }

  /**
   * Calcula a chave de indexação para um segmento.
   * @param {string} segment
   * @returns {string}
   */
  #segmentKey(segment) {
    if (segment === '') return '';
    return this.#caseSensitive ? segment[0] : segment[0].toLowerCase();
  }

  /**
   * Calcula o comprimento do prefixo comum entre duas strings.
   * @param {string} a
   * @param {string} b
   * @returns {number}
   */
  #commonPrefixLength(a, b) {
    const len = Math.min(a.length, b.length);
    let i = 0;
    while (i < len && a[i] === b[i]) i++;
    return i;
  }

  /**
   * Normaliza o path — remove trailing slash, garante leading slash.
   * @param {string} path
   * @returns {string}
   */
  #normalizePath(path) {
    if (!path || path === '/') return '/';

    let normalized = path.startsWith('/') ? path : '/' + path;

    if (this.#ignoreTrailingSlash && normalized.length > 1) {
      normalized = normalized.replace(/\/+$/, '');
    }

    return normalized;
  }

  /**
   * Divide o path em segmentos.
   * Preserva trailing slash como segmento vazio quando ignoreTrailingSlash é false.
   * @param {string} path
   * @returns {string[]}
   */
  #splitPath(path) {
    if (path === '/') return [];
    // Remove o leading '/' e faz split
    const parts = path.slice(1).split('/');
    // Remove trailing empty segment apenas quando trailing slash é ignorada
    if (
      this.#ignoreTrailingSlash &&
      parts.length > 0 &&
      parts[parts.length - 1] === ''
    ) {
      parts.pop();
    }
    return parts;
  }
}
