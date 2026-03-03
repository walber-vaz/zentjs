import { describe, expect, it } from 'vitest';

import { ZentRequest } from '../../src/http/request.mjs';

/**
 * Cria um mock mínimo do IncomingMessage.
 */
function createRawRequest(overrides = {}) {
  return {
    method: 'GET',
    url: '/',
    headers: { host: 'localhost:3000' },
    socket: { remoteAddress: '127.0.0.1', encrypted: false },
    ...overrides,
  };
}

describe('ZentRequest', () => {
  describe('basic properties', () => {
    it('should expose method', () => {
      const req = new ZentRequest(createRawRequest({ method: 'POST' }));

      expect(req.method).toBe('POST');
    });

    it('should expose raw url', () => {
      const req = new ZentRequest(createRawRequest({ url: '/users?page=2' }));

      expect(req.url).toBe('/users?page=2');
    });

    it('should expose path without query string', () => {
      const req = new ZentRequest(
        createRawRequest({ url: '/users?page=2&limit=10' })
      );

      expect(req.path).toBe('/users');
    });

    it('should expose raw IncomingMessage via raw', () => {
      const rawReq = createRawRequest();
      const req = new ZentRequest(rawReq);

      expect(req.raw).toBe(rawReq);
    });
  });

  describe('query', () => {
    it('should parse query params as object', () => {
      const req = new ZentRequest(
        createRawRequest({ url: '/search?q=zentjs&page=1' })
      );

      expect(req.query).toEqual({ q: 'zentjs', page: '1' });
    });

    it('should return empty object when no query string', () => {
      const req = new ZentRequest(createRawRequest({ url: '/users' }));

      expect(req.query).toEqual({});
    });
  });

  describe('headers', () => {
    it('should expose headers object', () => {
      const headers = {
        host: 'example.com',
        'content-type': 'application/json',
      };
      const req = new ZentRequest(createRawRequest({ headers }));

      expect(req.headers).toBe(headers);
    });

    it('should get header value case-insensitively', () => {
      const headers = {
        host: 'example.com',
        'content-type': 'application/json',
        authorization: 'Bearer abc123',
      };
      const req = new ZentRequest(createRawRequest({ headers }));

      expect(req.get('Content-Type')).toBe('application/json');
      expect(req.get('AUTHORIZATION')).toBe('Bearer abc123');
    });

    it('should return undefined for missing header', () => {
      const req = new ZentRequest(createRawRequest());

      expect(req.get('x-custom')).toBeUndefined();
    });
  });

  describe('params', () => {
    it('should default to empty object', () => {
      const req = new ZentRequest(createRawRequest());

      expect(req.params).toEqual({});
    });

    it('should allow setting params (from router)', () => {
      const req = new ZentRequest(createRawRequest());
      req.params = { id: '42', slug: 'hello' };

      expect(req.params).toEqual({ id: '42', slug: 'hello' });
    });
  });

  describe('body', () => {
    it('should default to undefined', () => {
      const req = new ZentRequest(createRawRequest());

      expect(req.body).toBeUndefined();
    });

    it('should allow setting body (from body-parser)', () => {
      const req = new ZentRequest(createRawRequest());
      req.body = { name: 'John' };

      expect(req.body).toEqual({ name: 'John' });
    });
  });

  describe('network properties', () => {
    it('should expose client IP', () => {
      const req = new ZentRequest(
        createRawRequest({
          socket: { remoteAddress: '192.168.1.1', encrypted: false },
        })
      );

      expect(req.ip).toBe('192.168.1.1');
    });

    it('should expose hostname', () => {
      const req = new ZentRequest(
        createRawRequest({ headers: { host: 'api.example.com:8080' } })
      );

      expect(req.hostname).toBe('api.example.com');
    });

    it('should fallback hostname to localhost when host header is missing', () => {
      const req = new ZentRequest(
        createRawRequest({ headers: {}, url: '/test' })
      );

      expect(req.hostname).toBe('localhost');
    });

    it('should return http protocol for non-encrypted socket', () => {
      const req = new ZentRequest(
        createRawRequest({
          socket: { remoteAddress: '127.0.0.1', encrypted: false },
        })
      );

      expect(req.protocol).toBe('http');
    });

    it('should return https protocol for encrypted socket', () => {
      const req = new ZentRequest(
        createRawRequest({
          socket: { remoteAddress: '127.0.0.1', encrypted: true },
        })
      );

      expect(req.protocol).toBe('https');
    });
  });

  describe('is()', () => {
    it('should match content-type', () => {
      const req = new ZentRequest(
        createRawRequest({
          headers: { host: 'localhost', 'content-type': 'application/json' },
        })
      );

      expect(req.is('json')).toBe(true);
      expect(req.is('application/json')).toBe(true);
      expect(req.is('html')).toBe(false);
    });

    it('should return false when no content-type', () => {
      const req = new ZentRequest(createRawRequest());

      expect(req.is('json')).toBe(false);
    });
  });
});
