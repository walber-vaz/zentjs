import { zent } from '../src/zent';

const app = zent();

app.get('/', (ctx) => {
  ctx.res.json({ hello: 'world' });
});

const address = await app.listen({ port: 3000, host: '127.0.0.1' });
console.log(`ZentJS running at ${address}`);
