import { Context } from '../core/context';
import { HookPhase } from '../hooks/lifecycle';
import { AnyDecorators, AnyState, MaybePromise } from './util';

export type { HookPhase };

export type OnRequestHook<
  TState extends AnyState = AnyState,
  TDecorators extends AnyDecorators = AnyDecorators,
> = (ctx: Context<TState, TDecorators>) => MaybePromise<void>;

export type PreParsingHook<
  TState extends AnyState = AnyState,
  TDecorators extends AnyDecorators = AnyDecorators,
> = (ctx: Context<TState, TDecorators>) => MaybePromise<void>;

export type PreValidationHook<
  TState extends AnyState = AnyState,
  TDecorators extends AnyDecorators = AnyDecorators,
> = (ctx: Context<TState, TDecorators>) => MaybePromise<void>;

export type PreHandlerHook<
  TState extends AnyState = AnyState,
  TDecorators extends AnyDecorators = AnyDecorators,
> = (ctx: Context<TState, TDecorators>) => MaybePromise<void>;

export type OnResponseHook<
  TState extends AnyState = AnyState,
  TDecorators extends AnyDecorators = AnyDecorators,
> = (ctx: Context<TState, TDecorators>) => MaybePromise<void>;

export type OnErrorHook<
  TState extends AnyState = AnyState,
  TDecorators extends AnyDecorators = AnyDecorators,
> = (ctx: Context<TState, TDecorators>, error: Error) => MaybePromise<void>;

export type OnSendHook<
  TState extends AnyState = AnyState,
  TDecorators extends AnyDecorators = AnyDecorators,
> = (
  ctx: Context<TState, TDecorators>,
  payload: unknown
) => MaybePromise<unknown>;

export interface RouteHooks<
  TState extends AnyState = AnyState,
  TDecorators extends AnyDecorators = AnyDecorators,
> {
  onRequest?:
    | OnRequestHook<TState, TDecorators>
    | OnRequestHook<TState, TDecorators>[];
  preParsing?:
    | PreParsingHook<TState, TDecorators>
    | PreParsingHook<TState, TDecorators>[];
  preValidation?:
    | PreValidationHook<TState, TDecorators>
    | PreValidationHook<TState, TDecorators>[];
  preHandler?:
    | PreHandlerHook<TState, TDecorators>
    | PreHandlerHook<TState, TDecorators>[];
  onSend?: OnSendHook<TState, TDecorators> | OnSendHook<TState, TDecorators>[];
  onResponse?:
    | OnResponseHook<TState, TDecorators>
    | OnResponseHook<TState, TDecorators>[];
  onError?:
    | OnErrorHook<TState, TDecorators>
    | OnErrorHook<TState, TDecorators>[];
  [key: string]: unknown;
}
