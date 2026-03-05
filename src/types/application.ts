import { Zent } from '../core/application';
import { AnyDecorators, AnyState } from './util';

export interface ZentOptions {
  ignoreTrailingSlash?: boolean;
  caseSensitive?: boolean;
}

export interface ListenOptions {
  port?: number;
  host?: string;
}

export type ListenCallback = (err: Error | null, address?: string) => void;

export type AppInstance<
  TState extends AnyState = AnyState,
  TDecorators extends AnyDecorators = AnyDecorators,
> = Zent<TState, TDecorators> & TDecorators;

export interface InjectOptions {
  method?: string;
  url?: string;
  headers?: Record<string, string>;
  body?: string | object;
}

export interface InjectResponse {
  statusCode: number;
  headers: Record<string, string | number | string[]>;
  body: string;
  json<T = unknown>(): T;
}
