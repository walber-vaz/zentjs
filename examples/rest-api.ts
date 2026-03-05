import { bodyParser, NotFoundError, zent } from '../src/zent';

const app = zent();

app.use(bodyParser());

const users = new Map();
let nextId = 1;

app.get('/users', (ctx) => {
  ctx.res.json([...users.values()]);
});

app.get('/users/:id', (ctx) => {
  const user = users.get(Number(ctx.req.params.id));

  if (!user) {
    throw new NotFoundError('User not found');
  }

  ctx.res.json(user);
});

app.post('/users', (ctx) => {
  const user = {
    id: nextId++,
    name: ctx.req.body?.name || 'Anonymous',
  };

  users.set(user.id, user);
  ctx.res.status(201).json(user);
});

app.delete('/users/:id', (ctx) => {
  const id = Number(ctx.req.params.id);
  users.delete(id);
  ctx.res.empty(204);
});

const address = await app.listen({ port: 3000, host: '127.0.0.1' });
console.log(`REST API running at ${address}`);
