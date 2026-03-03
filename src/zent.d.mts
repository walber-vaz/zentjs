import type {
  IncomingHttpHeaders,
  IncomingMessage,
  ServerResponse,
} from 'node:http';

type MaybePromise<T> = T | Promise<T>;
type AnyState = Record<string, unknown>;
type AnyDecorators = Record<string, unknown>;
type Merge<TBase, TExtra> = Omit<TBase, keyof TExtra> & TExtra;

export type HookPhase =
  | 'onRequest'
  | 'preParsing'
  | 'preValidation'
  | 'preHandler'
  | 'onSend'
  | 'onResponse'
  | 'onError';

export type NextFunction = () => MaybePromise<void>;

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

export type PluginScopeInstance<
  TState extends AnyState = AnyState,
  TDecorators extends AnyDecorators = AnyDecorators,
> = ZentPluginScope<TState, TDecorators> & TDecorators;

export type RouteHandler<
  TState extends AnyState = AnyState,
  TDecorators extends AnyDecorators = AnyDecorators,
> = (ctx: Context<TState, TDecorators>) => MaybePromise<unknown>;

export type Middleware<
  TState extends AnyState = AnyState,
  TDecorators extends AnyDecorators = AnyDecorators,
> = (
  ctx: Context<TState, TDecorators>,
  next: NextFunction
) => MaybePromise<void>;

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
}

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

export interface GroupOptions<
  TState extends AnyState = AnyState,
  TDecorators extends AnyDecorators = AnyDecorators,
> extends RouteOptions<TState, TDecorators> {}

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
  addHook(phase: 'onRequest', fn: OnRequestHook<TState, TDecorators>): this;
  addHook(phase: 'preParsing', fn: PreParsingHook<TState, TDecorators>): this;
  addHook(
    phase: 'preValidation',
    fn: PreValidationHook<TState, TDecorators>
  ): this;
  addHook(phase: 'preHandler', fn: PreHandlerHook<TState, TDecorators>): this;
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

export type PluginFunction<
  TOptions extends PluginOptions = PluginOptions,
  TState extends AnyState = AnyState,
  TDecorators extends AnyDecorators = AnyDecorators,
> = (
  app: PluginScopeInstance<TState, TDecorators>,
  opts: TOptions
) => MaybePromise<void>;

export class ZentRequest {
  constructor(raw: IncomingMessage);
  get raw(): IncomingMessage;
  get method(): string;
  get url(): string;
  get path(): string;
  get query(): Record<string, string>;
  get headers(): IncomingHttpHeaders;
  get params(): Record<string, string>;
  set params(value: Record<string, string>);
  get ip(): string;
  get hostname(): string;
  get protocol(): 'http' | 'https';
  get body(): unknown;
  set body(value: unknown);
  get(name: string): string | string[] | undefined;
  is(type: string): boolean;
}

export class ZentResponse {
  constructor(raw: ServerResponse);
  get raw(): ServerResponse;
  get sent(): boolean;
  get statusCode(): number;
  status(code: number): this;
  header(name: string, value: string | number): this;
  type(contentType: string): this;
  json(data: unknown): void;
  send(data: string | Buffer): void;
  html(data: string): void;
  redirect(url: string, code?: number): void;
  empty(code?: number): void;
}

export class Context<
  TState extends AnyState = AnyState,
  TDecorators extends AnyDecorators = AnyDecorators,
> {
  req: ZentRequest;
  res: ZentResponse;
  app: AppInstance<TState, TDecorators>;
  state: TState;

  constructor(
    rawReq: IncomingMessage,
    rawRes: ServerResponse,
    app: Zent<TState, TDecorators>
  );
}

export class Router<
  TState extends AnyState = AnyState,
  TDecorators extends AnyDecorators = AnyDecorators,
> {
  constructor(opts?: ZentOptions);
  route(definition: RouteDefinition<TState, TDecorators>): void;
  find(
    method: string,
    path: string
  ): {
    route: RouteDefinition<TState, TDecorators>;
    params: Record<string, string>;
  };
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

export const HOOK_PHASES: readonly HookPhase[];

export class Lifecycle<
  TState extends AnyState = AnyState,
  TDecorators extends AnyDecorators = AnyDecorators,
> {
  constructor();
  addHook(phase: HookPhase, fn: Function): void;
  getHooks(phase: HookPhase): Function[];
  hasHooks(phase: HookPhase): boolean;
  run(
    phase: HookPhase,
    ctx: Context<TState, TDecorators>,
    ...args: unknown[]
  ): Promise<unknown>;
  clone(): Lifecycle<TState, TDecorators>;
}

export class ErrorHandler<
  TState extends AnyState = AnyState,
  TDecorators extends AnyDecorators = AnyDecorators,
> {
  constructor();
  setErrorHandler(
    fn: (error: Error, ctx: Context<TState, TDecorators>) => MaybePromise<void>
  ): void;
  handle(error: Error, ctx: Context<TState, TDecorators>): Promise<void>;
}

export class HttpError extends Error {
  static showStackTrace: boolean;
  statusCode: number;
  error: string;
  constructor(statusCode: number, message: string);
  toJSON(): {
    statusCode: number;
    error: string;
    message: string;
    stack?: string;
  };
}

export class BadRequestError extends HttpError {
  constructor(message?: string);
}

export class UnauthorizedError extends HttpError {
  constructor(message?: string);
}

export class ForbiddenError extends HttpError {
  constructor(message?: string);
}

export class NotFoundError extends HttpError {
  constructor(message?: string);
}

export class MethodNotAllowedError extends HttpError {
  constructor(message?: string);
}

export class ConflictError extends HttpError {
  constructor(message?: string);
}

export class UnprocessableEntityError extends HttpError {
  constructor(message?: string);
}

export class TooManyRequestsError extends HttpError {
  constructor(message?: string);
}

export class InternalServerError extends HttpError {
  constructor(message?: string);
}

export function compose<
  TState extends AnyState = AnyState,
  TDecorators extends AnyDecorators = AnyDecorators,
>(
  middlewares: Middleware<TState, TDecorators>[]
): (
  ctx: Context<TState, TDecorators>,
  next?: RouteHandler<TState, TDecorators>
) => Promise<void>;

export interface BodyParserOptions {
  limit?: number;
}

export function bodyParser<
  TState extends AnyState = AnyState,
  TDecorators extends AnyDecorators = AnyDecorators,
>(opts?: BodyParserOptions): Middleware<TState, TDecorators>;

export type CorsOriginResolver = (
  requestOrigin: string
) => string | false | Promise<string | false>;

export interface CorsOptions {
  origin?: string | string[] | CorsOriginResolver | boolean;
  methods?: string | string[];
  allowedHeaders?: string | string[] | null;
  exposedHeaders?: string | string[] | null;
  credentials?: boolean;
  maxAge?: number | null;
}

export function cors<
  TState extends AnyState = AnyState,
  TDecorators extends AnyDecorators = AnyDecorators,
>(opts?: CorsOptions): Middleware<TState, TDecorators>;

export interface RequestMetricRecord {
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
}

export interface RequestMetricsOptions<
  TState extends AnyState = AnyState,
  TDecorators extends AnyDecorators = AnyDecorators,
> {
  onRecord?: (
    record: RequestMetricRecord,
    ctx: Context<TState, TDecorators>
  ) => MaybePromise<void>;
  clock?: () => bigint;
  stateKey?: string;
}

export function requestMetrics<
  TState extends AnyState = AnyState,
  TDecorators extends AnyDecorators = AnyDecorators,
>(
  opts?: RequestMetricsOptions<TState, TDecorators>
): {
  onRequest: OnRequestHook<TState, TDecorators>;
  onResponse: OnResponseHook<TState, TDecorators>;
};

export function requestMetricsPlugin<
  TState extends AnyState = AnyState,
  TDecorators extends AnyDecorators = AnyDecorators,
>(
  opts?: RequestMetricsOptions<TState, TDecorators>
): (app: ZentPluginScope<TState, TDecorators>) => Promise<void>;

export class PluginManager {
  constructor();
  get loaded(): boolean;
  register<TOptions extends PluginOptions = PluginOptions>(
    fn: PluginFunction<TOptions>,
    opts?: TOptions
  ): void;
  load(createScope: (opts: PluginOptions) => ZentPluginScope): Promise<void>;
  get size(): number;
}

export const HttpStatus: {
  readonly OK: 200;
  readonly CREATED: 201;
  readonly NO_CONTENT: 204;
  readonly FOUND: 302;
  readonly BAD_REQUEST: 400;
  readonly UNAUTHORIZED: 401;
  readonly FORBIDDEN: 403;
  readonly NOT_FOUND: 404;
  readonly METHOD_NOT_ALLOWED: 405;
  readonly CONFLICT: 409;
  readonly UNPROCESSABLE_ENTITY: 422;
  readonly TOO_MANY_REQUESTS: 429;
  readonly INTERNAL_SERVER_ERROR: 500;
};

export const HttpStatusText: {
  readonly [statusCode: number]: string;
};

export class Zent<
  TState extends AnyState = AnyState,
  TDecorators extends AnyDecorators = {},
> {
  constructor(opts?: ZentOptions);

  route(definition: RouteDefinition<TState, TDecorators>): this;
  all(
    path: string,
    handler: RouteHandler<TState, TDecorators>,
    opts?: RouteOptions<TState, TDecorators>
  ): this;
  group(
    prefix: string,
    callback: (group: GroupApi<TState, TDecorators>) => void
  ): this;
  group(
    prefix: string,
    opts: GroupOptions<TState, TDecorators> | null,
    callback: (group: GroupApi<TState, TDecorators>) => void
  ): this;

  use(middleware: Middleware<TState, TDecorators>): this;
  use(prefix: string, middleware: Middleware<TState, TDecorators>): this;

  addHook(phase: 'onRequest', fn: OnRequestHook<TState, TDecorators>): this;
  addHook(phase: 'preParsing', fn: PreParsingHook<TState, TDecorators>): this;
  addHook(
    phase: 'preValidation',
    fn: PreValidationHook<TState, TDecorators>
  ): this;
  addHook(phase: 'preHandler', fn: PreHandlerHook<TState, TDecorators>): this;
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
  ): Zent<TState, Merge<TDecorators, Record<TKey, typeof value>>> &
    Merge<TDecorators, Record<TKey, typeof value>>;

  decorate<TKey extends string, TValue>(
    name: TKey,
    value: TValue
  ): Zent<TState, Merge<TDecorators, Record<TKey, TValue>>> &
    Merge<TDecorators, Record<TKey, TValue>>;
  hasDecorator<TKey extends string>(
    name: TKey
  ): name is TKey & keyof TDecorators;

  register<TOptions extends PluginOptions = PluginOptions>(
    fn: PluginFunction<TOptions, TState, TDecorators>,
    opts?: TOptions
  ): this;

  listen(opts?: ListenOptions, callback?: ListenCallback): Promise<string>;
  close(): Promise<void>;
  inject(opts: InjectOptions): Promise<InjectResponse>;

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

  [key: string]: unknown;
}

export function zent<
  TState extends AnyState = AnyState,
  TDecorators extends AnyDecorators = {},
>(opts?: ZentOptions): Zent<TState, TDecorators>;
