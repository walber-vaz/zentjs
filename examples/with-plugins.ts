import { bodyParser, cors, zent } from '../src/zent';

const app = zent();

app.addHook('onSend', async (ctx, payload) => {
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    return {
      data: payload,
      meta: {
        path: ctx.req.path,
        method: ctx.req.method,
      },
    };
  }

  return payload;
});

app.setNotFoundHandler((ctx) => {
  ctx.res.status(404).json({
    error: 'Route not found',
    path: ctx.req.path,
  });
});

app.register(
  async (scope) => {
    scope.use(cors({ origin: 'http://localhost:5173', credentials: true }));
    scope.use(bodyParser({ limit: 512 * 1024 }));

    scope.addHook('onRequest', async (ctx) => {
      ctx.state.scope = 'api';
    });

    scope.get('/health', (ctx) => {
      return { ok: true, scope: ctx.state.scope };
    });

    scope.post('/echo', (ctx) => {
      return { body: ctx.req.body, scope: ctx.state.scope };
    });
  },
  { prefix: '/api' }
);

const address = await app.listen({ port: 3000, host: '127.0.0.1' });
console.log(`Plugin example running at ${address}`);
