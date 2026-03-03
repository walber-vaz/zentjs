import { describe, expect, it } from 'vitest';

import {
  MethodNotAllowedError,
  NotFoundError,
} from '../../src/errors/http-error.mjs';
import { RadixTree } from '../../src/router/radix-tree.mjs';

const handler = () => {};
const route = (h = handler) => ({ handler: h });

describe('RadixTree', () => {
  describe('static routes', () => {
    it('should find root route', () => {
      const tree = new RadixTree();
      tree.add('GET', '/', route());

      const result = tree.find('GET', '/');

      expect(result.route.handler).toBe(handler);
      expect(result.params).toEqual({});
    });

    it('should find simple static route', () => {
      const tree = new RadixTree();
      tree.add('GET', '/users', route());

      const result = tree.find('GET', '/users');

      expect(result.route.handler).toBe(handler);
    });

    it('should find nested static routes', () => {
      const tree = new RadixTree();
      const h1 = () => 'list';
      const h2 = () => 'active';
      tree.add('GET', '/users', route(h1));
      tree.add('GET', '/users/active', route(h2));

      expect(tree.find('GET', '/users').route.handler).toBe(h1);
      expect(tree.find('GET', '/users/active').route.handler).toBe(h2);
    });

    it('should handle routes with shared prefixes (node splitting)', () => {
      const tree = new RadixTree();
      const h1 = () => 'users';
      const h2 = () => 'uploads';
      tree.add('GET', '/users', route(h1));
      tree.add('GET', '/uploads', route(h2));

      expect(tree.find('GET', '/users').route.handler).toBe(h1);
      expect(tree.find('GET', '/uploads').route.handler).toBe(h2);
    });

    it('should support multiple methods on same path', () => {
      const tree = new RadixTree();
      const getHandler = () => 'get';
      const postHandler = () => 'post';
      tree.add('GET', '/users', route(getHandler));
      tree.add('POST', '/users', route(postHandler));

      expect(tree.find('GET', '/users').route.handler).toBe(getHandler);
      expect(tree.find('POST', '/users').route.handler).toBe(postHandler);
    });
  });

  describe('parameterized routes', () => {
    it('should match single param', () => {
      const tree = new RadixTree();
      tree.add('GET', '/users/:id', route());

      const result = tree.find('GET', '/users/42');

      expect(result.route.handler).toBe(handler);
      expect(result.params).toEqual({ id: '42' });
    });

    it('should match multiple params', () => {
      const tree = new RadixTree();
      tree.add('GET', '/users/:userId/posts/:postId', route());

      const result = tree.find('GET', '/users/5/posts/99');

      expect(result.params).toEqual({ userId: '5', postId: '99' });
    });

    it('should prefer static over param', () => {
      const tree = new RadixTree();
      const staticH = () => 'static';
      const paramH = () => 'param';
      tree.add('GET', '/users/active', route(staticH));
      tree.add('GET', '/users/:id', route(paramH));

      expect(tree.find('GET', '/users/active').route.handler).toBe(staticH);
      expect(tree.find('GET', '/users/42').route.handler).toBe(paramH);
    });

    it('should match param with nested static', () => {
      const tree = new RadixTree();
      tree.add('GET', '/users/:id/posts', route());

      const result = tree.find('GET', '/users/7/posts');

      expect(result.params).toEqual({ id: '7' });
    });
  });

  describe('wildcard routes', () => {
    it('should match wildcard and capture rest of path', () => {
      const tree = new RadixTree();
      tree.add('GET', '/static/*filepath', route());

      const result = tree.find('GET', '/static/css/main.css');

      expect(result.params).toEqual({ filepath: 'css/main.css' });
    });

    it('should use "wildcard" as default param name', () => {
      const tree = new RadixTree();
      tree.add('GET', '/files/*', route());

      const result = tree.find('GET', '/files/documents/report.pdf');

      expect(result.params).toEqual({ wildcard: 'documents/report.pdf' });
    });

    it('should prefer static and param over wildcard', () => {
      const tree = new RadixTree();
      const staticH = () => 'static';
      const paramH = () => 'param';
      const wildcardH = () => 'wildcard';
      tree.add('GET', '/api/docs', route(staticH));
      tree.add('GET', '/api/:resource', route(paramH));
      tree.add('GET', '/api/*path', route(wildcardH));

      expect(tree.find('GET', '/api/docs').route.handler).toBe(staticH);
      expect(tree.find('GET', '/api/users').route.handler).toBe(paramH);
      expect(tree.find('GET', '/api/a/b/c').route.handler).toBe(wildcardH);
    });
  });

  describe('trailing slash handling', () => {
    it('should ignore trailing slash by default', () => {
      const tree = new RadixTree();
      tree.add('GET', '/users', route());

      expect(tree.find('GET', '/users/').route.handler).toBe(handler);
      expect(tree.find('GET', '/users').route.handler).toBe(handler);
    });

    it('should respect trailing slash when ignoreTrailingSlash is false', () => {
      const tree = new RadixTree({ ignoreTrailingSlash: false });
      tree.add('GET', '/users', route());

      expect(tree.find('GET', '/users').route.handler).toBe(handler);
      expect(() => tree.find('GET', '/users/')).toThrow(NotFoundError);
    });
  });

  describe('case sensitivity', () => {
    it('should be case-insensitive by default', () => {
      const tree = new RadixTree();
      tree.add('GET', '/Users', route());

      expect(tree.find('GET', '/users').route.handler).toBe(handler);
      expect(tree.find('GET', '/USERS').route.handler).toBe(handler);
    });

    it('should be case-sensitive when caseSensitive is true', () => {
      const tree = new RadixTree({ caseSensitive: true });
      tree.add('GET', '/Users', route());

      expect(tree.find('GET', '/Users').route.handler).toBe(handler);
      expect(() => tree.find('GET', '/users')).toThrow(NotFoundError);
    });
  });

  describe('error handling', () => {
    it('should throw NotFoundError for non-existent route', () => {
      const tree = new RadixTree();
      tree.add('GET', '/users', route());

      expect(() => tree.find('GET', '/posts')).toThrow(NotFoundError);
    });

    it('should throw MethodNotAllowedError for wrong method', () => {
      const tree = new RadixTree();
      tree.add('GET', '/users', route());

      try {
        tree.find('POST', '/users');
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(MethodNotAllowedError);
        expect(err.statusCode).toBe(405);
        expect(err.allowedMethods).toContain('GET');
      }
    });

    it('should throw NotFoundError for partial path match', () => {
      const tree = new RadixTree();
      tree.add('GET', '/users/active', route());

      expect(() => tree.find('GET', '/users')).toThrow(NotFoundError);
    });
  });

  describe('edge cases', () => {
    it('should handle many routes without conflict', () => {
      const tree = new RadixTree();
      const handlers = {};

      const paths = [
        '/api/v1/users',
        '/api/v1/users/:id',
        '/api/v1/posts',
        '/api/v1/posts/:id',
        '/api/v2/users',
        '/health',
        '/about',
      ];

      for (const path of paths) {
        handlers[path] = () => path;
        tree.add('GET', path, route(handlers[path]));
      }

      expect(tree.find('GET', '/api/v1/users').route.handler).toBe(
        handlers['/api/v1/users']
      );
      expect(tree.find('GET', '/api/v1/users/42').route.handler).toBe(
        handlers['/api/v1/users/:id']
      );
      expect(tree.find('GET', '/api/v1/posts').route.handler).toBe(
        handlers['/api/v1/posts']
      );
      expect(tree.find('GET', '/api/v2/users').route.handler).toBe(
        handlers['/api/v2/users']
      );
      expect(tree.find('GET', '/health').route.handler).toBe(
        handlers['/health']
      );
    });

    it('should handle path without leading slash', () => {
      const tree = new RadixTree();
      tree.add('GET', 'users', route());

      expect(tree.find('GET', '/users').route.handler).toBe(handler);
    });

    it('should handle route where existing prefix is prefix of new segment', () => {
      const tree = new RadixTree();
      const h1 = () => 'user';
      const h2 = () => 'users';
      tree.add('GET', '/user', route(h1));
      tree.add('GET', '/users', route(h2));

      expect(tree.find('GET', '/user').route.handler).toBe(h1);
      expect(tree.find('GET', '/users').route.handler).toBe(h2);
    });

    it('should handle route where new segment is prefix of existing (split + return splitNode)', () => {
      const tree = new RadixTree();
      const h1 = () => 'users';
      const h2 = () => 'use';
      tree.add('GET', '/users', route(h1));
      tree.add('GET', '/use', route(h2));

      expect(tree.find('GET', '/users').route.handler).toBe(h1);
      expect(tree.find('GET', '/use').route.handler).toBe(h2);
    });

    it('should find routes through split nodes recursively', () => {
      const tree = new RadixTree();
      const h1 = () => 'users';
      const h2 = () => 'uploads';
      const h3 = () => 'usersList';
      tree.add('GET', '/users', route(h1));
      tree.add('GET', '/uploads', route(h2));
      tree.add('GET', '/usersList', route(h3));

      expect(tree.find('GET', '/users').route.handler).toBe(h1);
      expect(tree.find('GET', '/uploads').route.handler).toBe(h2);
      expect(tree.find('GET', '/usersList').route.handler).toBe(h3);
    });

    it('should return null from static child when segment is shorter than prefix', () => {
      const tree = new RadixTree();
      tree.add('GET', '/users', route());

      // "/us" shares first char "u" with child prefix "users" but is shorter
      expect(() => tree.find('GET', '/us')).toThrow(NotFoundError);
    });

    it('should handle trailing slash with ignoreTrailingSlash explicitly true', () => {
      const tree = new RadixTree({ ignoreTrailingSlash: true });
      tree.add('GET', '/items/', route());

      expect(tree.find('GET', '/items').route.handler).toBe(handler);
      expect(tree.find('GET', '/items/').route.handler).toBe(handler);
    });

    it('should handle adding trailing slash route when ignoreTrailingSlash is false', () => {
      const tree = new RadixTree({ ignoreTrailingSlash: false });
      const h1 = () => 'no-slash';
      const h2 = () => 'with-slash';
      tree.add('GET', '/items', route(h1));
      tree.add('GET', '/items/', route(h2));

      expect(tree.find('GET', '/items').route.handler).toBe(h1);
      expect(tree.find('GET', '/items/').route.handler).toBe(h2);
    });
  });
});
