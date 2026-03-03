import { randomUUID } from 'node:crypto';

import { UnauthorizedError, zent } from '../src/zent.mjs';

type AppState = {
  requestId?: string;
  userId?: string;
};

const app = zent<AppState>();

const appWithAuth = app.decorate('authenticate', async (ctx) => {
  const token = ctx.req.get('authorization');

  if (!token) {
    throw new UnauthorizedError('Missing token');
  }

  ctx.state.userId =
    String(token)
      .replace(/^Bearer\s+/i, '')
      .trim() || 'guest';
});

appWithAuth.addHook('onRequest', (ctx) => {
  ctx.state.requestId = randomUUID();
});

appWithAuth.get('/me', async (ctx) => {
  await ctx.app.authenticate(ctx);

  return {
    requestId: ctx.state.requestId,
    userId: ctx.state.userId,
  };
});

const address = await appWithAuth.listen({ port: 3000, host: '127.0.0.1' });
console.log(`Typed example running at ${address}`);
