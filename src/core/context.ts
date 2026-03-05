import { ZentRequest } from '../http/request';
import { ZentResponse } from '../http/response';
import { AnyDecorators, AnyState } from '../types/util';
import type { Zent } from './application';

export class Context<
  TState extends AnyState = AnyState,
  TDecorators extends AnyDecorators = AnyDecorators,
> {
  req: ZentRequest;

  res: ZentResponse;

  app: Zent<TState, TDecorators>;

  state: TState;

  constructor(rawReq: any, rawRes: any, app: Zent<TState, TDecorators>) {
    this.req = new ZentRequest(rawReq);
    this.res = new ZentResponse(rawRes);
    this.app = app;
    this.state = {} as TState;
  }
}
