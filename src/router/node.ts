import { AnyDecorators, AnyState } from '../types/util';

export class Node<
  TState extends AnyState = AnyState,
  TDecorators extends AnyDecorators = AnyDecorators,
> {
  prefix: string;
  children: Map<string, Node<TState, TDecorators>>;
  paramChild: Node<TState, TDecorators> | null;
  paramName: string | null;
  wildcardChild: Node<TState, TDecorators> | null;
  wildcardName: string | null;
  handlers: Map<string, (...args: unknown[]) => unknown>;

  constructor(prefix = '') {
    this.prefix = prefix;
    this.children = new Map();
    this.paramChild = null;
    this.paramName = null;
    this.wildcardChild = null;
    this.wildcardName = null;
    this.handlers = new Map();
  }

  addHandler(method: string, route: (...args: unknown[]) => unknown) {
    this.handlers.set(method, route);
  }

  getHandler(method: string) {
    return this.handlers.get(method);
  }

  get hasHandlers() {
    return this.handlers.size > 0;
  }

  get allowedMethods() {
    return [...this.handlers.keys()];
  }
}
