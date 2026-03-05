import { Context } from '../core/context';
import { RouteHooks } from './hooks';
import { AnyDecorators, AnyState, MaybePromise } from './util';

export type RouteHandler<
  TState extends AnyState = AnyState,
  TDecorators extends AnyDecorators = AnyDecorators,
> = (ctx: Context<TState, TDecorators>) => MaybePromise<unknown>;

export type NextFunction = () => MaybePromise<void>;

export type Middleware<
  TState extends AnyState = AnyState,
  TDecorators extends AnyDecorators = AnyDecorators,
> = (
  ctx: Context<TState, TDecorators>,
  next: NextFunction
) => MaybePromise<void>;

export interface RouteOptions<
  TState extends AnyState = AnyState,
  TDecorators extends AnyDecorators = AnyDecorators,
> {
  middlewares?:
    | Middleware<TState, TDecorators>
    | Middleware<TState, TDecorators>[];
  hooks?: RouteHooks<TState, TDecorators>;
}

export interface RouteDefinition<
  TState extends AnyState = AnyState,
  TDecorators extends AnyDecorators = AnyDecorators,
> extends RouteOptions<TState, TDecorators> {
  method: string;
  path: string;
  handler: RouteHandler<TState, TDecorators>;
  [key: string]: unknown;
}

export type GroupOptions<
  TState extends AnyState = AnyState,
  TDecorators extends AnyDecorators = AnyDecorators,
> = RouteOptions<TState, TDecorators>;

export interface GroupApi<
  TState extends AnyState = AnyState,
  TDecorators extends AnyDecorators = AnyDecorators,
> {
  route(definition: RouteDefinition<TState, TDecorators>): void;
  all(
    path: string,
    handler: RouteHandler<TState, TDecorators>,
    opts?: RouteOptions<TState, TDecorators>
  ): void;
  group(
    prefix: string,
    callback: (group: GroupApi<TState, TDecorators>) => void
  ): void;
  group(
    prefix: string,
    opts: GroupOptions<TState, TDecorators> | null,
    callback: (group: GroupApi<TState, TDecorators>) => void
  ): void;
  get(
    path: string,
    handler: RouteHandler<TState, TDecorators>,
    opts?: RouteOptions<TState, TDecorators>
  ): void;
  post(
    path: string,
    handler: RouteHandler<TState, TDecorators>,
    opts?: RouteOptions<TState, TDecorators>
  ): void;
  put(
    path: string,
    handler: RouteHandler<TState, TDecorators>,
    opts?: RouteOptions<TState, TDecorators>
  ): void;
  patch(
    path: string,
    handler: RouteHandler<TState, TDecorators>,
    opts?: RouteOptions<TState, TDecorators>
  ): void;
  delete(
    path: string,
    handler: RouteHandler<TState, TDecorators>,
    opts?: RouteOptions<TState, TDecorators>
  ): void;
  head(
    path: string,
    handler: RouteHandler<TState, TDecorators>,
    opts?: RouteOptions<TState, TDecorators>
  ): void;
  options(
    path: string,
    handler: RouteHandler<TState, TDecorators>,
    opts?: RouteOptions<TState, TDecorators>
  ): void;
}
