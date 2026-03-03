import { describe, expect, it } from 'vitest';

import { ErrorHandler } from '../../src/errors/error-handler.mjs';
import {
  BadRequestError,
  HttpError,
  NotFoundError,
} from '../../src/errors/http-error.mjs';

/**
 * Cria um ctx mock mínimo com res que registra as chamadas.
 */
function createMockCtx() {
  const written = {};

  const res = {
    _statusCode: null,
    _body: null,
    _sent: false,

    get sent() {
      return this._sent;
    },

    status(code) {
      this._statusCode = code;
      return this;
    },

    json(data) {
      this._body = data;
      this._sent = true;
    },
  };

  return { ctx: { req: {}, res, state: {} }, res };
}

describe('ErrorHandler', () => {
  describe('setErrorHandler()', () => {
    it('should accept a function as custom handler', () => {
      const eh = new ErrorHandler();

      expect(() => eh.setErrorHandler(() => {})).not.toThrow();
    });

    it('should throw TypeError if argument is not a function', () => {
      const eh = new ErrorHandler();

      expect(() => eh.setErrorHandler('not-fn')).toThrow(TypeError);
      expect(() => eh.setErrorHandler('not-fn')).toThrow(
        'Error handler must be a function, got string'
      );
    });
  });

  describe('handle() — default handler', () => {
    it('should respond with HttpError as JSON', async () => {
      const eh = new ErrorHandler();
      const { ctx, res } = createMockCtx();
      const error = new NotFoundError('User not found');

      await eh.handle(error, ctx);

      expect(res._statusCode).toBe(404);
      expect(res._body).toEqual({
        statusCode: 404,
        error: 'Not Found',
        message: 'User not found',
      });
    });

    it('should convert non-HttpError to InternalServerError', async () => {
      const eh = new ErrorHandler();
      const { ctx, res } = createMockCtx();
      const error = new Error('something broke');

      await eh.handle(error, ctx);

      expect(res._statusCode).toBe(500);
      expect(res._body).toEqual({
        statusCode: 500,
        error: 'Internal Server Error',
        message: 'something broke',
      });
    });

    it('should use default message for error without message', async () => {
      const eh = new ErrorHandler();
      const { ctx, res } = createMockCtx();
      const error = new Error();
      error.message = '';

      await eh.handle(error, ctx);

      expect(res._statusCode).toBe(500);
      expect(res._body.message).toBe('Internal Server Error');
    });

    it('should not send response if already sent', async () => {
      const eh = new ErrorHandler();
      const { ctx, res } = createMockCtx();
      res._sent = true; // simulate already-sent response

      await eh.handle(new NotFoundError(), ctx);

      // Should not have changed anything
      expect(res._statusCode).toBeNull();
      expect(res._body).toBeNull();
    });
  });

  describe('handle() — custom handler', () => {
    it('should delegate to custom handler', async () => {
      const eh = new ErrorHandler();
      const { ctx, res } = createMockCtx();
      const error = new BadRequestError('bad input');

      eh.setErrorHandler((err, ctx) => {
        ctx.res.status(err.statusCode).json({
          success: false,
          error: err.message,
        });
      });

      await eh.handle(error, ctx);

      expect(res._statusCode).toBe(400);
      expect(res._body).toEqual({
        success: false,
        error: 'bad input',
      });
    });

    it('should normalize error before passing to custom handler', async () => {
      const eh = new ErrorHandler();
      const { ctx, res } = createMockCtx();
      let receivedError;

      eh.setErrorHandler((err) => {
        receivedError = err;
      });

      await eh.handle(new TypeError('oops'), ctx);

      expect(receivedError).toBeInstanceOf(HttpError);
      expect(receivedError.statusCode).toBe(500);
    });

    it('should fallback to default handler if custom handler throws', async () => {
      const eh = new ErrorHandler();
      const { ctx, res } = createMockCtx();

      eh.setErrorHandler(() => {
        throw new Error('custom handler crashed');
      });

      await eh.handle(new NotFoundError('missing'), ctx);

      // Should have fallen back to default handler
      expect(res._statusCode).toBe(404);
      expect(res._body).toEqual({
        statusCode: 404,
        error: 'Not Found',
        message: 'missing',
      });
    });

    it('should support async custom handler', async () => {
      const eh = new ErrorHandler();
      const { ctx, res } = createMockCtx();

      eh.setErrorHandler(async (err, ctx) => {
        await new Promise((r) => setTimeout(r, 5));
        ctx.res.status(err.statusCode).json({ msg: err.message });
      });

      await eh.handle(new BadRequestError('async error'), ctx);

      expect(res._statusCode).toBe(400);
      expect(res._body).toEqual({ msg: 'async error' });
    });
  });

  describe('handle() — edge cases', () => {
    it('should handle error with custom status code', async () => {
      const eh = new ErrorHandler();
      const { ctx, res } = createMockCtx();

      const error = new HttpError(503, 'Service Unavailable');

      await eh.handle(error, ctx);

      expect(res._statusCode).toBe(503);
      expect(res._body.statusCode).toBe(503);
    });

    it('should not crash when custom handler fails and response already sent in fallback', async () => {
      const eh = new ErrorHandler();
      const { ctx, res } = createMockCtx();

      // Custom handler fails
      eh.setErrorHandler(() => {
        throw new Error('crash');
      });

      // But make res.sent return false first (for custom), then true (for fallback)
      let callCount = 0;
      Object.defineProperty(res, 'sent', {
        get() {
          callCount++;
          return callCount > 1; // false first, then true
        },
      });

      await eh.handle(new NotFoundError(), ctx);

      // Default handler should skip since sent becomes true
      expect(res._body).toBeNull();
    });
  });
});
