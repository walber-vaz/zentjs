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

    it('should fallback path to root when url is missing', () => {
      const req = new ZentRequest(createRawRequest({ url: undefined }));

      expect(req.path).toBe('/');
    });

    it('should fallback path to root when url starts with query string', () => {
      const req = new ZentRequest(createRawRequest({ url: '?page=1' }));

      expect(req.path).toBe('/');
    });

    it('should expose raw IncomingMessage via raw', () => {
      const rawReq = createRawRequest();
      const req = new ZentRequest(rawReq);

      expect(req.raw).toBe(rawReq);
    });

    it('should cache parsed path after first access', () => {
      const raw = createRawRequest({ url: '/initial?x=1' });
      const req = new ZentRequest(raw);

      expect(req.path).toBe('/initial');
      raw.url = '/changed?x=2';
      expect(req.path).toBe('/initial');
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

    it('should return empty object when url ends with question mark', () => {
      const req = new ZentRequest(createRawRequest({ url: '/users?' }));

      expect(req.query).toEqual({});
    });

    it('should return empty object when url is missing', () => {
      const req = new ZentRequest(createRawRequest({ url: undefined }));

      expect(req.query).toEqual({});
    });

    it('should cache parsed query after first access', () => {
      const raw = createRawRequest({ url: '/search?q=first' });
      const req = new ZentRequest(raw);

      expect(req.query).toEqual({ q: 'first' });
      raw.url = '/search?q=second';
      expect(req.query).toEqual({ q: 'first' });
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

    it('should expose hostname without port unchanged', () => {
      const req = new ZentRequest(
        createRawRequest({ headers: { host: 'service.internal' } })
      );

      expect(req.hostname).toBe('service.internal');
    });

    it('should fallback hostname to localhost when host header is missing', () => {
      const req = new ZentRequest(
        createRawRequest({ headers: {}, url: '/test' })
      );

      expect(req.hostname).toBe('localhost');
    });

    it('should parse IPv6 hostname enclosed in brackets', () => {
      const req = new ZentRequest(
        createRawRequest({ headers: { host: '[::1]:3000' }, url: '/test' })
      );

      expect(req.hostname).toBe('[::1]');
    });

    it('should fallback hostname to localhost when host header array is empty', () => {
      const req = new ZentRequest(
        createRawRequest({ headers: { host: [] }, url: '/test' })
      );

      expect(req.hostname).toBe('localhost');
    });

    it('should resolve hostname when host header is a non-empty array', () => {
      const req = new ZentRequest(
        createRawRequest({ headers: { host: ['example.org:8080'] }, url: '/' })
      );

      expect(req.hostname).toBe('example.org');
    });

    it('should fallback to colon split for malformed IPv6 host', () => {
      const req = new ZentRequest(
        createRawRequest({ headers: { host: '[::1' }, url: '/test' })
      );

      expect(req.hostname).toBe('[');
    });

    it('should cache hostname after first access', () => {
      const raw = createRawRequest({ headers: { host: 'first.local:3000' } });
      const req = new ZentRequest(raw);

      expect(req.hostname).toBe('first.local');
      raw.headers.host = 'second.local:3000';
      expect(req.hostname).toBe('first.local');
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
