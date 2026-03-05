import { Context } from '../core/context';
import { OnErrorHook, OnResponseHook, OnSendHook } from './hooks';
import {
  GroupOptions,
  Middleware,
  RouteDefinition,
  RouteHandler,
  RouteOptions,
} from './router';
import { AnyDecorators, AnyState, MaybePromise, Merge } from './util';

export interface PluginOptions {
  [key: string]: unknown;
}

export interface ZentPluginScope<
  TState extends AnyState = AnyState,
  TDecorators extends AnyDecorators = AnyDecorators,
> {
  route(definition: RouteDefinition<TState, TDecorators>): this;
  all(
    path: string,
    handler: RouteHandler<TState, TDecorators>,
    opts?: RouteOptions<TState, TDecorators>
  ): this;
  group(
    prefix: string,
    callback: (group: ZentPluginScope<TState, TDecorators>) => void
  ): this;
  group(
    prefix: string,
    opts: GroupOptions<TState, TDecorators> | null,
    callback: (group: ZentPluginScope<TState, TDecorators>) => void
  ): this;
  get(
    path: string,
    handler: RouteHandler<TState, TDecorators>,
    opts?: RouteOptions<TState, TDecorators>
  ): this;
  post(
    path: string,
    handler: RouteHandler<TState, TDecorators>,
    opts?: RouteOptions<TState, TDecorators>
  ): this;
  put(
    path: string,
    handler: RouteHandler<TState, TDecorators>,
    opts?: RouteOptions<TState, TDecorators>
  ): this;
  patch(
    path: string,
    handler: RouteHandler<TState, TDecorators>,
    opts?: RouteOptions<TState, TDecorators>
  ): this;
  delete(
    path: string,
    handler: RouteHandler<TState, TDecorators>,
    opts?: RouteOptions<TState, TDecorators>
  ): this;
  head(
    path: string,
    handler: RouteHandler<TState, TDecorators>,
    opts?: RouteOptions<TState, TDecorators>
  ): this;
  options(
    path: string,
    handler: RouteHandler<TState, TDecorators>,
    opts?: RouteOptions<TState, TDecorators>
  ): this;
  use(middleware: Middleware<TState, TDecorators>): this;
  use(prefix: string, middleware: Middleware<TState, TDecorators>): this;
  addHook(
    phase: 'onRequest',
    fn: (ctx: Context<TState, TDecorators>) => MaybePromise<void>
  ): this;
  addHook(
    phase: 'preParsing',
    fn: (ctx: Context<TState, TDecorators>) => MaybePromise<void>
  ): this;
  addHook(
    phase: 'preValidation',
    fn: (ctx: Context<TState, TDecorators>) => MaybePromise<void>
  ): this;
  addHook(
    phase: 'preHandler',
    fn: (ctx: Context<TState, TDecorators>) => MaybePromise<void>
  ): this;
  addHook(phase: 'onSend', fn: OnSendHook<TState, TDecorators>): this;
  addHook(phase: 'onResponse', fn: OnResponseHook<TState, TDecorators>): this;
  addHook(phase: 'onError', fn: OnErrorHook<TState, TDecorators>): this;
  setErrorHandler(
    fn: (error: Error, ctx: Context<TState, TDecorators>) => MaybePromise<void>
  ): this;
  setNotFoundHandler(
    fn: (ctx: Context<TState, TDecorators>) => MaybePromise<void>
  ): this;
  decorate<TKey extends string, TValue>(
    name: TKey,
    value: (ctx: Context<TState, TDecorators>, ...args: unknown[]) => TValue
  ): ZentPluginScope<TState, Merge<TDecorators, Record<TKey, typeof value>>> &
    Merge<TDecorators, Record<TKey, typeof value>>;
  decorate<TKey extends string, TValue>(
    name: TKey,
    value: TValue
  ): ZentPluginScope<TState, Merge<TDecorators, Record<TKey, TValue>>> &
    Merge<TDecorators, Record<TKey, TValue>>;
  hasDecorator<TKey extends string>(
    name: TKey
  ): name is TKey & keyof TDecorators;
  register<TOptions extends PluginOptions = PluginOptions>(
    fn: PluginFunction<TOptions, TState, TDecorators>,
    opts?: TOptions
  ): void;
  [key: string]: unknown;
}

export type PluginScopeInstance<
  TState extends AnyState = AnyState,
  TDecorators extends AnyDecorators = AnyDecorators,
> = ZentPluginScope<TState, TDecorators> & TDecorators;

export type PluginFunction<
  TOptions extends PluginOptions = PluginOptions,
  TState extends AnyState = AnyState,
  TDecorators extends AnyDecorators = AnyDecorators,
> = (
  app: PluginScopeInstance<TState, TDecorators>,
  opts: TOptions
) => MaybePromise<void>;
