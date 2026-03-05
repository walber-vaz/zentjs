import { describe, expect, it } from 'vitest';

import { Zent } from '../../src/core/application';
import { Context } from '../../src/core/context';
import { ZentRequest } from '../../src/http/request';
import { ZentResponse } from '../../src/http/response';

function createRawReq(overrides = {}) {
  return {
    method: 'GET',
    url: '/test',
    headers: { host: 'localhost' },
    socket: { remoteAddress: '127.0.0.1', encrypted: false },
    ...overrides,
  } as any;
}

function createRawRes() {
  const headers: Record<string, any> = {};
  return {
    writableEnded: false,
    setHeader(name: string, value: any) {
      headers[name] = value;
    },
    getHeader(name: string) {
      return headers[name];
    },
    writeHead() {},
    end() {
      this.writableEnded = true;
    },
  } as any;
}

describe('Context', () => {
  it('should create ZentRequest from raw request', () => {
    const ctx = new Context(createRawReq(), createRawRes(), null as any);

    expect(ctx.req).toBeInstanceOf(ZentRequest);
    expect(ctx.req.method).toBe('GET');
    expect(ctx.req.path).toBe('/test');
  });

  it('should create ZentResponse from raw response', () => {
    const ctx = new Context(createRawReq(), createRawRes(), null as any);

    expect(ctx.res).toBeInstanceOf(ZentResponse);
    expect(ctx.res.statusCode).toBe(200);
  });

  it('should expose app reference', () => {
    const fakeApp = { name: 'zent' } as unknown as Zent;
    const ctx = new Context(createRawReq(), createRawRes(), fakeApp);

    expect(ctx.app).toBe(fakeApp);
  });

  it('should initialize state as empty object', () => {
    const ctx = new Context(createRawReq(), createRawRes(), null as any);

    expect(ctx.state).toEqual({});
  });

  it('should allow storing data in state', () => {
    const ctx = new Context<any, any>(
      createRawReq(),
      createRawRes(),
      null as any
    );
    ctx.state.user = { id: 1, name: 'John' };
    ctx.state.authenticated = true;

    expect(ctx.state.user).toEqual({ id: 1, name: 'John' });
    expect(ctx.state.authenticated).toBe(true);
  });

  it('should have independent state per context instance', () => {
    const ctx1 = new Context<any, any>(
      createRawReq(),
      createRawRes(),
      null as any
    );
    const ctx2 = new Context<any, any>(
      createRawReq(),
      createRawRes(),
      null as any
    );

    ctx1.state.value = 'a';
    ctx2.state.value = 'b';

    expect(ctx1.state.value).toBe('a');
    expect(ctx2.state.value).toBe('b');
  });
});
