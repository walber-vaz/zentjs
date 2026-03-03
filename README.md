# ZentJS

[![CI](https://github.com/walber-vaz/zentjs/actions/workflows/ci.yml/badge.svg)](https://github.com/walber-vaz/zentjs/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/%40zentjs%2Fzentjs)](https://www.npmjs.com/package/@zentjs/zentjs)
[![npm downloads](https://img.shields.io/npm/dm/%40zentjs%2Fzentjs)](https://www.npmjs.com/package/@zentjs/zentjs)
[![license](https://img.shields.io/npm/l/%40zentjs%2Fzentjs)](LICENSE)

Framework web minimalista e performático para Node.js, inspirado no Express e Fastify.

**Zero dependências em runtime** · **ESM-only** · **Node.js >= 24**

> ⚠️ **Atenção:** este projeto está em constante desenvolvimento e **ainda não deve ser usado em produção**.

## Criado e contribuído por

- [walber-vaz](https://github.com/walber-vaz)

## Instalação

```bash
npm install @zentjs/zentjs
```

## Exemplo rápido

```js
import { zent } from '@zentjs/zentjs';

const app = zent();

app.get('/', (ctx) => {
  return ctx.res.json({ hello: 'world' });
});

app.listen({ port: 3000 });
```

## TypeScript (state + decorators)

```ts
import { zent } from '@zentjs/zentjs';

type AppState = {
  requestId?: string;
};

const app = zent<AppState>();

const appWithAuth = app.decorate('authenticate', async (ctx) => {
  const token = ctx.req.get('authorization');
  if (!token) {
    ctx.res.status(401).json({ message: 'Unauthorized' });
  }
});

appWithAuth.get('/me', async (ctx) => {
  ctx.state.requestId = crypto.randomUUID();
  await ctx.app.authenticate(ctx);
  return ctx.res.json({ requestId: ctx.state.requestId });
});
```

## Scripts úteis (desenvolvimento)

```bash
npm test
npm run lint
npm run test:coverage
```

## Documentação completa

A documentação detalhada foi separada na pasta `docs/`:

- [Hub da documentação](docs/README.md)
- [Arquitetura](docs/architecture.md)
- [API pública](docs/api.md)
- [Guias práticos](docs/guides.md)
- [Roadmap e ADRs](docs/roadmap.md)
- [Checklist de evolução da documentação](docs/DOCUMENTATION_TODO.md)

## Exemplos executáveis

```bash
node examples/hello-world.mjs
node examples/rest-api.mjs
node examples/with-plugins.mjs
node --experimental-strip-types examples/typed-app.ts
```

## Licença

[BSD-3-Clause](LICENSE)
