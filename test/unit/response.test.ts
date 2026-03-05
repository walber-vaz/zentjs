import { describe, expect, it } from 'vitest';

import { ZentResponse } from '../../src/http/response';

/**
 * Cria um mock mínimo do ServerResponse.
 */
function createRawResponse() {
  const headers: Record<string, any> = {};
  let headWritten = false;
  let headWriteCount = 0;
  let headStatusCode: number | null = null;
  let endData: any = undefined;
  let endCount = 0;

  return {
    writableEnded: false,
    setHeader(name: string, value: any) {
      headers[name] = value;
    },
    getHeader(name: string) {
      return headers[name];
    },
    writeHead(statusCode: number) {
      headWritten = true;
      headWriteCount += 1;
      headStatusCode = statusCode;
    },
    end(data: any) {
      this.writableEnded = true;
      endCount += 1;
      endData = data;
    },
    // Test helpers
    get _headers() {
      return headers;
    },
    get _headWritten() {
      return headWritten;
    },
    get _headStatusCode() {
      return headStatusCode;
    },
    get _headWriteCount() {
      return headWriteCount;
    },
    get _endData() {
      return endData;
    },
    get _endCount() {
      return endCount;
    },
  } as any;
}

function createRawResponseThatEndsDuringSetHeader() {
  const raw = createRawResponse();
  const baseSetHeader = raw.setHeader.bind(raw);

  raw.setHeader = (name: string, value: any) => {
    baseSetHeader(name, value);
    raw.writableEnded = true;
  };

  return raw;
}

describe('ZentResponse', () => {
  describe('status()', () => {
    it('should default to 200', () => {
      const res = new ZentResponse(createRawResponse());

      expect(res.statusCode).toBe(200);
    });

    it('should set status code and return this (fluent)', () => {
      const res = new ZentResponse(createRawResponse());
      const ret = res.status(201);

      expect(res.statusCode).toBe(201);
      expect(ret).toBe(res);
    });
  });

  describe('header()', () => {
    it('should set a header and return this', () => {
      const raw = createRawResponse();
      const res = new ZentResponse(raw);
      const ret = res.header('X-Custom', 'value');

      expect(raw._headers['X-Custom']).toBe('value');
      expect(ret).toBe(res);
    });
  });

  describe('type()', () => {
    it('should set Content-Type header', () => {
      const raw = createRawResponse();
      const res = new ZentResponse(raw);
      res.type('text/xml');

      expect(raw._headers['Content-Type']).toBe('text/xml');
    });
  });

  describe('json()', () => {
    it('should serialize data as JSON and end response', () => {
      const raw = createRawResponse();
      const res = new ZentResponse(raw);
      res.status(200).json({ hello: 'world' });

      expect(raw._headStatusCode).toBe(200);
      expect(raw._headers['Content-Type']).toBe(
        'application/json; charset=utf-8'
      );
      expect(raw._endData).toBe('{"hello":"world"}');
      expect(raw.writableEnded).toBe(true);
    });

    it('should respect custom status code', () => {
      const raw = createRawResponse();
      const res = new ZentResponse(raw);
      res.status(201).json({ id: 1 });

      expect(raw._headStatusCode).toBe(201);
    });
  });

  describe('send()', () => {
    it('should send string with text/plain content-type', () => {
      const raw = createRawResponse();
      const res = new ZentResponse(raw);
      res.send('Hello');

      expect(raw._headers['Content-Type']).toBe('text/plain; charset=utf-8');
      expect(raw._endData).toBe('Hello');
    });

    it('should send Buffer with octet-stream content-type', () => {
      const raw = createRawResponse();
      const res = new ZentResponse(raw);
      const buf = Buffer.from('binary data');
      res.send(buf);

      expect(raw._headers['Content-Type']).toBe('application/octet-stream');
      expect(raw._endData).toBe(buf);
    });

    it('should not override existing Content-Type', () => {
      const raw = createRawResponse();
      const res = new ZentResponse(raw);
      res.type('text/csv').send('a,b,c');

      expect(raw._headers['Content-Type']).toBe('text/csv');
    });
  });

  describe('html()', () => {
    it('should send HTML content', () => {
      const raw = createRawResponse();
      const res = new ZentResponse(raw);
      res.html('<h1>Hello</h1>');

      expect(raw._headers['Content-Type']).toBe('text/html; charset=utf-8');
      expect(raw._endData).toBe('<h1>Hello</h1>');
    });
  });

  describe('redirect()', () => {
    it('should redirect with 302 by default', () => {
      const raw = createRawResponse();
      const res = new ZentResponse(raw);
      res.redirect('/new-location');

      expect(raw._headStatusCode).toBe(302);
      expect(raw._headers['Location']).toBe('/new-location');
      expect(raw.writableEnded).toBe(true);
    });

    it('should redirect with custom status code', () => {
      const raw = createRawResponse();
      const res = new ZentResponse(raw);
      res.redirect('/permanent', 301);

      expect(raw._headStatusCode).toBe(301);
      expect(raw._headers['Location']).toBe('/permanent');
    });
  });

  describe('empty()', () => {
    it('should respond with 204 and no body by default', () => {
      const raw = createRawResponse();
      const res = new ZentResponse(raw);
      res.empty();

      expect(raw._headStatusCode).toBe(204);
      expect(raw._endData).toBeUndefined();
      expect(raw.writableEnded).toBe(true);
    });

    it('should accept custom status code', () => {
      const raw = createRawResponse();
      const res = new ZentResponse(raw);
      res.empty(304);

      expect(raw._headStatusCode).toBe(304);
    });
  });

  describe('sent', () => {
    it('should be false before sending', () => {
      const res = new ZentResponse(createRawResponse());

      expect(res.sent).toBe(false);
    });

    it('should be true after sending', () => {
      const raw = createRawResponse();
      const res = new ZentResponse(raw);
      res.json({ ok: true });

      expect(res.sent).toBe(true);
    });
  });

  describe('raw', () => {
    it('should expose the original ServerResponse', () => {
      const raw = createRawResponse();
      const res = new ZentResponse(raw);

      expect(res.raw).toBe(raw);
    });
  });

  describe('fluent chaining', () => {
    it('should allow chaining status + header + json', () => {
      const raw = createRawResponse();
      const res = new ZentResponse(raw);
      res.status(201).header('X-Request-Id', 'abc').json({ created: true });

      expect(raw._headStatusCode).toBe(201);
      expect(raw._headers['X-Request-Id']).toBe('abc');
      expect(raw._endData).toBe('{"created":true}');
    });
  });

  describe('idempotency after sent', () => {
    it('should ignore second send call', () => {
      const raw = createRawResponse();
      const res = new ZentResponse(raw);

      res.send('first');
      res.send('second');

      expect(raw._endData).toBe('first');
      expect(raw._endCount).toBe(1);
      expect(raw._headWriteCount).toBe(1);
    });

    it('should ignore headers and status changes after send', () => {
      const raw = createRawResponse();
      const res = new ZentResponse(raw);

      res.status(201).header('X-First', 'yes').send('done');
      res.status(500).header('X-Late', 'no').json({ overwritten: true });

      expect(raw._headStatusCode).toBe(201);
      expect(raw._headers['X-First']).toBe('yes');
      expect(raw._headers['X-Late']).toBeUndefined();
      expect(raw._endData).toBe('done');
      expect(raw._endCount).toBe(1);
    });

    it('should ignore redirect/empty after already sent', () => {
      const raw = createRawResponse();
      const res = new ZentResponse(raw);

      res.json({ ok: true });
      res.redirect('/other');
      res.empty();

      expect(raw._endCount).toBe(1);
      expect(raw._headers['Location']).toBeUndefined();
    });

    it('should ignore html after already sent', () => {
      const raw = createRawResponse();
      const res = new ZentResponse(raw);

      res.send('first');
      res.html('<h1>ignored</h1>');

      expect(raw._endCount).toBe(1);
      expect(raw._endData).toBe('first');
    });

    it('should not write head when response becomes sent before internal end', () => {
      const raw = createRawResponseThatEndsDuringSetHeader();
      const res = new ZentResponse(raw);

      res.send('ignored');

      expect(raw._headWriteCount).toBe(0);
      expect(raw._endCount).toBe(0);
    });
  });
});
