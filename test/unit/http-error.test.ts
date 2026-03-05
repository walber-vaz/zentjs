import { afterEach, describe, expect, it } from 'vitest';

import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  HttpError,
  InternalServerError,
  MethodNotAllowedError,
  NotFoundError,
  TooManyRequestsError,
  UnauthorizedError,
  UnprocessableEntityError,
} from '../../src/errors/http-error';

describe('HttpError', () => {
  afterEach(() => {
    HttpError.showStackTrace = false;
  });

  it('should create an error with statusCode and message', () => {
    const error = new HttpError(500, 'Something went wrong');

    expect(error).toBeInstanceOf(Error);
    expect(error.statusCode).toBe(500);
    expect(error.message).toBe('Something went wrong');
    expect(error.error).toBe('Internal Server Error');
    expect(error.name).toBe('HttpError');
  });

  it('should return "Unknown Error" for unknown status codes', () => {
    const error = new HttpError(999, 'weird');

    expect(error.error).toBe('Unknown Error');
  });

  it('should not have stack trace when showStackTrace is false', () => {
    const error = new HttpError(400, 'bad');

    expect(error.stack).toBeUndefined();
  });

  it('should have stack trace when showStackTrace is true', () => {
    HttpError.showStackTrace = true;

    const error = new HttpError(400, 'bad');

    expect(error.stack).toBeDefined();
    expect(error.stack).toContain('HttpError');
  });

  describe('toJSON()', () => {
    it('should serialize without stack by default', () => {
      const error = new HttpError(404, 'Not here');
      const json = error.toJSON();

      expect(json).toEqual({
        statusCode: 404,
        error: 'Not Found',
        message: 'Not here',
      });
      expect(json).not.toHaveProperty('stack');
    });

    it('should include stack when showStackTrace is true', () => {
      HttpError.showStackTrace = true;

      const error = new HttpError(500, 'Oops');
      const json = error.toJSON();

      expect(json.stack).toBeDefined();
      expect(json.statusCode).toBe(500);
    });
  });
});

describe('HttpError subclasses', () => {
  const cases = [
    { Class: BadRequestError, code: 400, label: 'Bad Request' },
    { Class: UnauthorizedError, code: 401, label: 'Unauthorized' },
    { Class: ForbiddenError, code: 403, label: 'Forbidden' },
    { Class: NotFoundError, code: 404, label: 'Not Found' },
    { Class: MethodNotAllowedError, code: 405, label: 'Method Not Allowed' },
    { Class: ConflictError, code: 409, label: 'Conflict' },
    {
      Class: UnprocessableEntityError,
      code: 422,
      label: 'Unprocessable Entity',
    },
    { Class: TooManyRequestsError, code: 429, label: 'Too Many Requests' },
    {
      Class: InternalServerError,
      code: 500,
      label: 'Internal Server Error',
    },
  ];

  for (const { Class, code, label } of cases) {
    describe(Class.name, () => {
      it(`should have statusCode ${code}`, () => {
        const error = new Class();

        expect(error.statusCode).toBe(code);
        expect(error.error).toBe(label);
        expect(error.message).toBe(label);
        expect(error.name).toBe(Class.name);
        expect(error).toBeInstanceOf(HttpError);
        expect(error).toBeInstanceOf(Error);
      });

      it('should accept custom message', () => {
        const error = new Class('Custom message');

        expect(error.message).toBe('Custom message');
        expect(error.statusCode).toBe(code);
      });
    });
  }
});
