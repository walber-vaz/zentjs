import { MethodNotAllowedError, NotFoundError } from '../errors/http-error';
import { AnyDecorators, AnyState } from '../types/util';
import { Node } from './node';

export class RadixTree<
  TState extends AnyState = AnyState,
  TDecorators extends AnyDecorators = AnyDecorators,
> {
  #root: Node<TState, TDecorators>;
  #ignoreTrailingSlash: boolean;
  #caseSensitive: boolean;

  constructor(opts: any = {}) {
    this.#root = new Node<TState, TDecorators>();
    this.#ignoreTrailingSlash = opts.ignoreTrailingSlash ?? true;
    this.#caseSensitive = opts.caseSensitive ?? false;
  }

  #joinSegmentsFrom(segments: string[], startIndex: number): string {
    if (startIndex >= segments.length) return '';

    let result = segments[startIndex];
    for (let i = startIndex + 1; i < segments.length; i++) {
      result += `/${segments[i]}`;
    }

    return result;
  }

  add(method: string, path: string, route: any): void {
    const segments = this.#splitPath(this.#normalizePath(path));
    let current = this.#root;

    for (const segment of segments) {
      if (segment.startsWith(':')) {
        const paramName = segment.slice(1);

        if (!current.paramChild) {
          current.paramChild = new Node<TState, TDecorators>(segment);
          current.paramChild.paramName = paramName;
        }

        current = current.paramChild;
      } else if (segment.startsWith('*')) {
        const wildcardName = segment.slice(1) || 'wildcard';

        if (!current.wildcardChild) {
          current.wildcardChild = new Node<TState, TDecorators>(segment);
          current.wildcardChild.wildcardName = wildcardName;
        }

        current = current.wildcardChild;
        break;
      } else {
        current = this.#insertStatic(current, segment);
      }
    }

    current.addHandler(method, route);
  }

  find(
    method: string,
    path: string
  ): { route: any; params: Record<string, string> } {
    const normalizedPath = this.#normalizePath(path);
    const segments = this.#splitPath(normalizedPath);
    const params: Record<string, string> = {};

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

  #search(
    node: Node<TState, TDecorators>,
    segments: string[],
    index: number,
    params: Record<string, string>
  ): Node<TState, TDecorators> | null {
    if (index === segments.length) {
      return node.hasHandlers ? node : null;
    }

    const segment = segments[index];

    const staticChild = this.#findStaticChild(node, segment);
    if (staticChild) {
      const result = this.#search(staticChild, segments, index + 1, params);
      if (result) return result;
    }

    if (node.paramChild) {
      params[node.paramChild.paramName!] = segment;
      const result = this.#search(node.paramChild, segments, index + 1, params);
      if (result) return result;
      delete params[node.paramChild.paramName!];
    }

    if (node.wildcardChild) {
      params[node.wildcardChild.wildcardName!] = this.#joinSegmentsFrom(
        segments,
        index
      );
      return node.wildcardChild;
    }

    return null;
  }

  #insertStatic(
    parent: Node<TState, TDecorators>,
    segment: string
  ): Node<TState, TDecorators> {
    const key = this.#segmentKey(segment);
    const existing = parent.children.get(key);

    if (!existing) {
      const child = new Node<TState, TDecorators>(segment);
      parent.children.set(key, child);
      return child;
    }

    const existingPrefix = this.#caseSensitive
      ? existing.prefix
      : existing.prefix.toLowerCase();
    const newSegment = this.#caseSensitive ? segment : segment.toLowerCase();

    const commonLen = this.#commonPrefixLength(existingPrefix, newSegment);

    if (commonLen === existing.prefix.length && commonLen === segment.length) {
      return existing;
    }

    if (commonLen === existing.prefix.length) {
      const remainder = segment.slice(commonLen);
      return this.#insertStatic(existing, remainder);
    }

    const splitNode = new Node<TState, TDecorators>(
      existing.prefix.slice(0, commonLen)
    );

    existing.prefix = existing.prefix.slice(commonLen);
    const existingNewKey = this.#segmentKey(existing.prefix);
    splitNode.children.set(existingNewKey, existing);

    parent.children.set(key, splitNode);

    if (commonLen === segment.length) {
      return splitNode;
    }

    const remainder = segment.slice(commonLen);
    const newChild = new Node<TState, TDecorators>(remainder);
    const newKey = this.#segmentKey(remainder);
    splitNode.children.set(newKey, newChild);

    return newChild;
  }

  #findStaticChild(
    node: Node<TState, TDecorators>,
    segment: string
  ): Node<TState, TDecorators> | null {
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

    if (target.startsWith(childPrefix)) {
      const remainder = segment.slice(child.prefix.length);
      return this.#findStaticChild(child, remainder);
    }

    return null;
  }

  #segmentKey(segment: string): string {
    if (segment === '') return '';
    return this.#caseSensitive ? segment[0] : segment[0].toLowerCase();
  }

  #commonPrefixLength(a: string, b: string): number {
    const len = Math.min(a.length, b.length);
    let i = 0;
    while (i < len && a[i] === b[i]) i++;
    return i;
  }

  #normalizePath(path: string): string {
    if (!path || path === '/') return '/';

    let normalized = path.startsWith('/') ? path : '/' + path;

    if (this.#ignoreTrailingSlash && normalized.length > 1) {
      normalized = normalized.replace(/\/+$/, '');
    }

    return normalized;
  }

  #splitPath(path: string): string[] {
    if (path === '/') return [];
    const parts = path.slice(1).split('/');
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
