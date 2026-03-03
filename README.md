# ZentJS

> Framework web minimalista e performático para Node.js, inspirado no Express e Fastify.

**Zero dependências em runtime** · **ESM-only** · **Node.js ≥ 20**

---

## Sumário

- [Visão Geral](#visão-geral)
- [Plano de Documentação](#plano-de-documentação)
- [Estado da Documentação](#estado-da-documentação)
- [Padrão Editorial](#padrão-editorial)
- [Glossário de Termos](#glossário-de-termos)
- [Motivação e Princípios](#motivação-e-princípios)
- [Arquitetura Geral](#arquitetura-geral)
- [Estrutura de Diretórios](#estrutura-de-diretórios)
- [Componentes Principais](#componentes-principais)
  - [Application (Zent)](#1-application-zent)
  - [Router (Radix Tree)](#2-router-radix-tree)
  - [Request](#3-request)
  - [Response](#4-response)
  - [Middleware Pipeline](#5-middleware-pipeline)
  - [Plugin System](#6-plugin-system)
  - [Lifecycle Hooks](#7-lifecycle-hooks)
  - [Context (ctx)](#8-context-ctx)
  - [Error Handling](#9-error-handling)
- [Fluxo de uma Requisição](#fluxo-de-uma-requisição)
- [API Pública](#api-pública)
  - [Route Groups](#route-groups)
- [Exemplos de Uso](#exemplos-de-uso)
  - [Guia: Primeira API (CRUD básico)](#guia-primeira-api-crud-básico)
  - [Guia: Autenticação por plugin](#guia-autenticação-por-plugin)
  - [Guia: Métricas com requestMetrics](#guia-métricas-com-requestmetrics)
  - [Guia: Testes com inject + Vitest](#guia-testes-com-inject--vitest)
- [Roadmap de Implementação](#roadmap-de-implementação)
- [Decisões Técnicas (ADRs)](#decisões-técnicas-adrs)
- [Referências](#referências)

---

## Plano de Documentação

A evolução da documentação agora segue etapas incrementais com checklist versionado.

- Arquivo de acompanhamento: [docs/DOCUMENTATION_TODO.md](docs/DOCUMENTATION_TODO.md)
- Status atual: **Etapa 5 concluída**
- Próxima etapa: **Etapa 6** (revisão final e consistência)

> Regra de ouro: documentar apenas comportamento já implementado no runtime.

---

## Estado da Documentação

Este README é a referência principal do projeto e segue atualização incremental por etapas.

- Fonte de controle: [docs/DOCUMENTATION_TODO.md](docs/DOCUMENTATION_TODO.md)
- Escopo atual: estrutura editorial e padronização de linguagem
- Política: exemplos e contratos devem refletir o runtime real em `src/`

---

## Padrão Editorial

Para manter consistência entre seções, usar o padrão abaixo:

- **API pública**: assinatura + parâmetros + retorno + exemplo mínimo executável
- **Fluxos**: ordem de execução explícita (hooks, middlewares, handler)
- **Erros**: classe/condição + status HTTP + formato de resposta
- **Exemplos**: preferir snippets curtos, com foco em um conceito por bloco

---

## Glossário de Termos

- **Handler**: função final da rota que produz o resultado da requisição
- **Middleware**: função `async (ctx, next)` no pipeline (antes/depois do handler)
- **Hook**: interceptador de fase específica do lifecycle (`onRequest`, `preHandler`, etc.)
- **Plugin Scope**: escopo encapsulado criado por `register()`, com herança controlada

---

## Visão Geral

**ZentJS** é uma framework HTTP para construção de APIs e aplicações web em Node.js.
O objetivo é combinar o melhor dos dois mundos:

| Inspiração  | O que trazemos                                                             |
| ----------- | -------------------------------------------------------------------------- |
| **Express** | API simples e intuitiva, middleware `(req, res, next)`                     |
| **Fastify** | Performance, sistema de plugins com encapsulamento, hooks de ciclo de vida |

O resultado é uma framework leve, sem dependências de runtime, construída 100% sobre o módulo nativo `node:http`.

---

## Motivação e Princípios

### Por que criar outra framework?

1. **Aprendizado profundo** — Entender os internos de uma framework HTTP modular.
2. **Zero dependências** — O core não depende de nenhum pacote externo.
3. **ESM nativo** — Sem CommonJS, sem transpilação, sem build step.
4. **Performance by design** — Roteamento via Radix Tree, sem regex em hot path.
5. **Developer Experience** — API clara, erros descritivos, tipagem via JSDoc.

### Princípios Arquiteturais

| Princípio                  | Descrição                                                  |
| -------------------------- | ---------------------------------------------------------- |
| **Single Responsibility**  | Cada módulo tem uma única razão para mudar                 |
| **Open/Closed**            | Extensível via plugins, fechado para modificação no core   |
| **Composição > Herança**   | Plugins e middlewares compõem funcionalidade               |
| **Fail Fast**              | Erros são detectados e reportados o mais cedo possível     |
| **Convention over Config** | Defaults sensatos, mas tudo configurável                   |
| **Immutable por padrão**   | Objetos de configuração não são mutados após inicialização |

---

## Arquitetura Geral

```text
┌─────────────────────────────────────────────────────────────────────┐
│                         ZentJS Core                                 │
│                                                                     │
│  ┌────────────┐    ┌───────────┐    ┌───────────┐    ┌───────────┐  │
│  │  Server    │───▶│  Router   │───▶│ Middleware│───▶│  Handler  │  │
│  │ (node:http)│    │(RadixTree)│    │ Pipeline  │    │ (user fn) │  │
│  └────────────┘    └───────────┘    └───────────┘    └───────────┘  │
│       │                                                │            │
│       ▼                                                ▼            │
│  ┌───────────┐                                    ┌────────────┐    │
│  │  Request  │                                    │  Response  │    │
│  │ (wrapper) │◄──────── Context (ctx) ───────────▶│ (wrapper)  │    │
│  └───────────┘                                    └────────────┘    │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────┐       │
│  │                    Lifecycle Hooks                       │       │
│  │  onRequest → preParsing → preValidation → preHandler     │       │
│  │  → onSend → onResponse → onError                         │       │
│  └──────────────────────────────────────────────────────────┘       │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────┐       │
│  │                    Plugin System                         │       │
│  │  register() → encapsulated scope → decorators            │       │
│  └──────────────────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Estrutura de Diretórios

```text
zentjs/
├── src/
│   ├── index.mjs                 # Entry point — exporta a função zent()
│   │
│   ├── core/
│   │   ├── application.mjs       # Classe Zent (instância do app)
│   │   └── context.mjs           # Objeto de contexto por requisição
│   │
│   ├── http/
│   │   ├── request.mjs           # Wrapper do IncomingMessage
│   │   └── response.mjs          # Wrapper do ServerResponse
│   │
│   ├── router/
│   │   ├── index.mjs             # Router público
│   │   ├── node.mjs              # Nó da árvore (estático, param, wildcard)
│   │   ├── radix-tree.mjs        # Implementação da Radix Tree
│   │
│   ├── middleware/
│   │   └── pipeline.mjs          # Executor da cadeia de middlewares
│   │
│   ├── plugins/
│   │   ├── manager.mjs           # Registro e carregamento de plugins
│   │   ├── body-parser.mjs       # Parser de body (JSON, URL-encoded, text)
│   │   └── cors.mjs              # Middleware CORS built-in
│   │
│   ├── hooks/
│   │   └── lifecycle.mjs         # Gerenciador dos lifecycle hooks
│   │
│   └── errors/
│       ├── http-error.mjs        # Classe base HttpError
│       └── error-handler.mjs     # Handler global de erros
│
├── test/
│   ├── setupTests.mjs
│   ├── unit/
│   │   └── ... (13 arquivos de testes unitários)
│   └── integration/
│       └── plugins-http.integration.test.mjs
│
├── examples/
│   ├── hello-world.mjs
│   ├── rest-api.mjs
│   └── with-plugins.mjs
│
├── package.json
├── vitest.config.mjs
├── eslint.config.mjs
└── README.md
```

---

## Componentes Principais

### 1. Application (Zent)

O ponto de entrada da framework. Cria e configura a instância do servidor.

**Arquivo:** `src/core/application.mjs`

**Responsabilidades:**

- Inicializar o servidor HTTP
- Registrar rotas (proxy para o Router)
- Registrar middlewares globais
- Registrar plugins
- Gerenciar lifecycle hooks
- Iniciar/parar o servidor (`listen` / `close`)

**Interface:**

```js
import { zent } from 'zentjs';

const app = zent({
  // Opções de configuração
  logger: true, // Habilitar logging básico
  ignoreTrailingSlash: true, // /users e /users/ são a mesma rota
});

// Registrar rotas
app.get('/hello', (ctx) => {
  return ctx.res.json({ message: 'Hello, World!' });
});

// Iniciar servidor
app.listen({ port: 3000, host: '0.0.0.0' }, (err, address) => {
  if (err) throw err;
  console.log(`Server listening on ${address}`);
});
```

**Diagrama de classe:**

```text
┌────────────────────────────────────┐
│            Zent (Application)      │
├────────────────────────────────────┤
│ - _server: HttpServer              │
│ - _router: Router                  │
│ - _plugins: PluginManager          │
│ - _hooks: LifecycleManager         │
│ - _middlewares: Middleware[]        │
│ - _options: ZentOptions            │
├────────────────────────────────────┤
│ + get(path, opts?, handler)        │
│ + post(path, opts?, handler)       │
│ + put(path, opts?, handler)        │
│ + patch(path, opts?, handler)      │
│ + delete(path, opts?, handler)     │
│ + head(path, opts?, handler)       │
│ + options(path, opts?, handler)    │
│ + all(path, opts?, handler)        │
│ + use(middleware)                   │
│ + register(plugin, opts?)          │
│ + addHook(name, fn)                │
│ + decorate(name, value)            │
│ + listen(opts, callback?)          │
│ + close()                          │
│ + inject(opts): Promise<Response>  │
└────────────────────────────────────┘
```

> **`inject()`** permite testar rotas sem abrir uma porta de rede (inspirado no Fastify).

---

### 2. Router (Radix Tree)

Roteamento de alta performance usando uma **Radix Tree** (também chamada Patricia Trie ou Compact Prefix Tree).

**Arquivo:** `src/router/radix-tree.mjs`

**Por que Radix Tree?**

| Abordagem      | Complexidade (lookup) | Usado por               |
| -------------- | --------------------- | ----------------------- |
| Array linear   | O(n)                  | Express                 |
| Regex matching | O(n)                  | Koa                     |
| **Radix Tree** | **O(k)** \*           | **Fastify**, **ZentJS** |

_\* k = comprimento do path, independente do número de rotas_

**Funcionalidades:**

- Rotas estáticas: `/users/list`
- Parâmetros nomeados: `/users/:id`
- Wildcard: `/static/*filepath`
- Suporte a múltiplos métodos HTTP por path

**Estrutura do nó:**

```js
// Cada nó na Radix Tree
{
  prefix: '/users',          // Fragmento do path
  children: Map {},          // Filhos indexados pelo primeiro caractere
  paramChild: null,          // Filho de parâmetro (:param)
  wildcardChild: null,       // Filho wildcard (*)
  handlers: Map {            // Handlers por método HTTP
    'GET': { handler, hooks, middlewares },
    'POST': { handler, hooks, middlewares }
  }
}
```

**Exemplo de árvore para as rotas:**

```text
GET  /users
GET  /users/:id
POST /users
GET  /users/:id/posts
GET  /about
```

```text
                    root ('')
                    ├── /u
                    │   └── sers
                    │       ├── [GET, POST handlers]
                    │       └── /:id
                    │           ├── [GET handler]
                    │           └── /posts
                    │               └── [GET handler]
                    └── /about
                        └── [GET handler]
```

**API do Router:**

```js
class Router {
  add(method, path, handler, opts?)   // Adiciona rota
  find(method, path)                   // Busca rota → { handler, params, hooks }
  all(path, handler)                   // Registra para todos os métodos HTTP
  group(prefix, opts?, callback)       // Agrupa rotas sob prefixo
}
```

**Route Groups:**

```js
// Grupo com prefixo + middlewares compartilhados
router.group('/api', { middlewares: [auth] }, (group) => {
  group.get('/users', listUsers); // GET /api/users
  group.post('/users', createUser); // POST /api/users

  // Sub-grupo aninhado — herda middlewares do pai
  group.group('/admin', { middlewares: [adminOnly] }, (admin) => {
    admin.delete('/users/:id', deleteUser); // DELETE /api/admin/users/:id
    // middlewares executados: [auth, adminOnly]
  });
});
```

---

### 3. Request

Wrapper sobre `http.IncomingMessage` que fornece uma API mais ergonômica.

**Arquivo:** `src/http/request.mjs`

**Propriedades e métodos:**

```js
class ZentRequest {
  // Propriedades parseadas do request original
  get method()        // 'GET', 'POST', etc.
  get url()           // URL completa
  get path()          // Path sem query string
  get query()         // Query params como objeto { key: value }
  get headers()       // Headers como objeto
  get params()        // Route params { id: '123' }
  get ip()            // IP do cliente
  get hostname()      // Hostname da requisição
  get protocol()      // 'http' ou 'https'

  // Body (populado após parsing)
  get body()          // Body parseado (JSON, form, etc.)

  // Helpers
  is(type)            // Verifica Content-Type
  get(header)         // Retorna valor de um header
}
```

**Decisão:** O body **não** é parseado automaticamente. O usuário deve usar o middleware `bodyParser()` ou ler manualmente. Isso garante zero overhead para rotas que não precisam de body.

---

### 4. Response

Wrapper sobre `http.ServerResponse` com API fluente (chainable).

**Arquivo:** `src/http/response.mjs`

**API:**

```js
class ZentResponse {
  // Status
  status(code)                   // Define status code → retorna this

  // Headers
  header(name, value)           // Define header → retorna this
  type(contentType)             // Atalho para Content-Type → retorna this

  // Envio de resposta
  json(data)                    // Serializa como JSON e envia
  send(data)                    // Envia string/Buffer
  html(data)                    // Envia como text/html
  redirect(url, code?)          // Redireciona (default 302)
  empty(code?)                  // Resposta sem body (default 204)

  // Propriedades
  get sent()                    // Boolean: response já foi enviada?
  get statusCode()              // Status code atual
}
```

**Exemplo de uso:**

```js
app.get('/users/:id', (ctx) => {
  const user = findUser(ctx.req.params.id);

  if (!user) {
    return ctx.res.status(404).json({ error: 'User not found' });
  }

  return ctx.res.json(user);
});
```

---

### 5. Middleware Pipeline

Sistema de middlewares inspirado no Express, mas com execução baseada em `async/await`.

**Arquivo:** `src/middleware/pipeline.mjs`

**Signature do middleware:**

```js
// Middleware com next()
async function myMiddleware(ctx, next) {
  // Antes do handler
  console.log('Before');

  await next();

  // Depois do handler (response já preparada)
  console.log('After');
}
```

**Tipos de middleware:**

```text
┌──────────────────────────────────────────────────┐
│              Middleware Pipeline                 │
│                                                  │
│  1. Global Middlewares      app.use(fn)          │
│  2. Route-level Middlewares route opts           │
│  3. Plugin-scoped           dentro de plugins    │
│                                                  │
│  Execução: Onion Model (como Koa)                │
│                                                  │
│  ┌───────────────────────────────────────────┐   │
│  │ Middleware 1 (before)                     │   │
│  │  ┌───────────────────────────────────┐    │   │
│  │  │ Middleware 2 (before)             │    │   │
│  │  │  ┌──────────────────────────┐     │    │   │
│  │  │  │     Route Handler        │     │    │   │
│  │  │  └──────────────────────────┘     │    │   │
│  │  │ Middleware 2 (after)              │    │   │
│  │  └───────────────────────────────────┘    │   │
│  │ Middleware 1 (after)                      │   │
│  └───────────────────────────────────────────┘   │
└──────────────────────────────────────────────────┘
```

**Assinaturas suportadas na aplicação:**

- `app.use(fn)` — middleware global
- `app.use('/prefix', fn)` — middleware global com prefix match
- `route options.middlewares` — middleware por rota
- `group(..., { middlewares })` — middleware herdado por grupo/subgrupo

**Ordem de execução efetiva:**

1. Middlewares globais registrados via `app.use()`
2. Middlewares herdados do escopo de plugin/grupo
3. Middlewares específicos da rota
4. Handler da rota (dentro do pipeline)

> `preHandler` é executado imediatamente antes do handler, dentro do estágio final do pipeline.

**Implementação do pipeline executor:**

```js
function compose(middlewares) {
  return function (ctx) {
    let index = -1;

    function dispatch(i) {
      if (i <= index) {
        return Promise.reject(new Error('next() called multiple times'));
      }
      index = i;

      const fn = middlewares[i];
      if (!fn) return Promise.resolve();

      return Promise.resolve(fn(ctx, () => dispatch(i + 1)));
    }

    return dispatch(0);
  };
}
```

---

### 6. Plugin System

Inspirado diretamente no Fastify, com **encapsulamento de escopo**.

**Arquivos:** `src/plugins/manager.mjs`, `src/core/application.mjs` (criação de escopo)

**Conceito:**

- Cada plugin recebe uma instância "encapsulada" do app
- Decorators, hooks e middlewares de plugin são aplicados por escopo
- Plugins podem ter dependências e são registrados de forma assíncrona

**Garantias de encapsulamento no runtime atual:**

- Pai → Filho: middlewares, hooks e decorators são herdados
- Filho → Pai: alterações no escopo filho **não** voltam para o pai
- Irmão A ↔ Irmão B: não compartilham decorators/hooks/middlewares locais
- Prefixo: `register(plugin, { prefix })` é acumulativo em plugins aninhados

**API:**

```js
// Definir um plugin
async function dbPlugin(app, opts) {
  const connection = await connectDB(opts.uri);

  // Decorator: adiciona propriedade ao escopo atual do plugin
  app.decorate('db', connection);

  // Hook específico do escopo
  app.addHook('onRequest', async (ctx) => {
    ctx.state.db = connection;
  });
}

// Registrar plugin
app.register(dbPlugin, { uri: 'mongodb://localhost/mydb' });
```

**Encapsulamento:**

```text
┌─────────────────────────────────────────────┐
│  Root Scope (app)                           │
│  ├── global middlewares                     │
│  ├── global hooks                           │
│  │                                          │
│  │  ┌────────────────────────────────────┐  │
│  │  │  Plugin Scope A                    │  │
│  │  │  ├── herda middlewares do pai      │  │
│  │  │  ├── decorators locais (scope.db)  │  │
│  │  │  └── rotas locais (/api/v1/*)      │  │
│  │  └────────────────────────────────────┘  │
│  │                                          │
│  │  ┌────────────────────────────────────┐  │
│  │  │  Plugin Scope B                    │  │
│  │  │  ├── herda middlewares do pai      │  │
│  │  │  ├── NÃO acessa app.db (de A)      │  │
│  │  │  └── rotas locais (/api/v2/*)      │  │
│  │  └────────────────────────────────────┘  │
│  │                                          │
└─────────────────────────────────────────────┘
```

**Herança de escopo (resumo):**

| Recurso      | Pai → Filho | Filho → Pai | Irmãos |
| ------------ | ----------- | ----------- | ------ |
| Decorators   | Sim         | Não         | Não    |
| Hooks        | Sim         | Não         | Não    |
| Middlewares  | Sim         | Não         | Não    |
| Prefixo rota | Sim         | Não         | Não    |

**Exemplo com plugins irmãos (sem vazamento):**

```js
import { NotFoundError, zent } from 'zentjs';

const app = zent();

async function pluginA(scope) {
  scope.decorate('token', 'A');
  scope.get('/a', (ctx) => ctx.res.json({ token: scope.token }));
}

async function pluginB(scope) {
  scope.get('/b', (ctx) => {
    if (!scope.hasDecorator('token')) {
      throw new NotFoundError('Decorator token is not available in plugin B');
    }
    return ctx.res.json({ token: scope.token });
  });
}

app.register(pluginA, { prefix: '/v1' });
app.register(pluginB, { prefix: '/v1' });
```

No exemplo acima, o decorator `token` criado em `pluginA` não fica visível em `pluginB`.

**Propriedades do Plugin Manager:**

```text
┌──────────────────────────────────────┐
│          PluginManager               │
├──────────────────────────────────────┤
│ - _plugins: PluginEntry[]            │
│ - _loaded: boolean                   │
├──────────────────────────────────────┤
│ + register(fn, opts?)                │
│ + load(): Promise<void>              │
│ + createScope(parent): Zent          │
└──────────────────────────────────────┘
```

---

### 7. Lifecycle Hooks

Hooks permitem interceptar diferentes fases do ciclo de vida de uma requisição.

**Arquivo:** `src/hooks/lifecycle.mjs`

**Hooks disponíveis (em ordem de execução):**

```text
Requisição chega
       │
       ▼
  ┌─────────────┐
  │  onRequest  │ → Primeira coisa executada (logging, auth check)
  └──────┬──────┘
         ▼
  ┌─────────────┐
  │  preParsing │ → Antes de fazer parse do body
  └──────┬──────┘
         ▼
  ┌───────────────┐
  │ preValidation │ → Antes de validar o input (schema)
  └──────┬────────┘
         ▼
  ┌─────────────┐
  │  preHandler │ → Depois de validar, antes do handler
  └──────┬──────┘
         ▼
  ┌─────────────┐
  │   Handler   │ → Função do usuário
  └──────┬──────┘
         ▼
  ┌─────────────┐
  │   onSend    │ → Antes de enviar a resposta (pode modificar payload)
  └──────┬──────┘
         ▼
  ┌─────────────┐
  │  onResponse │ → Depois que a resposta foi enviada (cleanup, metrics)
  └──────┬──────┘
         ▼
       Fim

  ┌─────────────┐
  │   onError   │ → Chamado quando qualquer erro ocorre (em qualquer fase)
  └─────────────┘
```

**Signature dos hooks:**

```js
// onRequest, preParsing, preValidation, preHandler
app.addHook('onRequest', async (ctx) => {
  ctx.req.startTime = Date.now();
});

// onSend — pode modificar o payload
app.addHook('onSend', async (ctx, payload) => {
  // Retornar payload modificado
  return payload;
});

// onResponse — chamado após envio (não pode modificar a resposta)
app.addHook('onResponse', async (ctx) => {
  const duration = Date.now() - ctx.req.startTime;
  console.log(`${ctx.req.method} ${ctx.req.path} - ${duration}ms`);
});

// onError — handler de erro global
app.addHook('onError', async (ctx, error) => {
  console.error(error);
});
```

**Ordem de execução no runtime (quando a rota existe):**

1. `onRequest` global → `onRequest` da rota
2. `preParsing` global → `preParsing` da rota
3. `preValidation` global → `preValidation` da rota
4. Pipeline de middlewares
5. `preHandler` global → `preHandler` da rota
6. Handler da rota
7. `onSend` global → `onSend` da rota (somente quando handler retorna payload e `ctx.res` ainda não foi enviado)
8. `onResponse` global → `onResponse` da rota

Se ocorrer erro em qualquer etapa:

1. `onError` global
2. `onError` da rota
3. `setErrorHandler()` customizado (ou handler padrão)

---

### 8. Context (ctx)

Objeto criado **por requisição** que carrega todo o estado.

**Arquivo:** `src/core/context.mjs`

```js
class Context {
  constructor(req, res, app) {
    this.req = req; // ZentRequest
    this.res = res; // ZentResponse
    this.app = app; // Instância da aplicação
    this.state = {}; // Espaço livre para o usuário armazenar dados
  }
}
```

**Uso no handler:**

```js
app.get('/dashboard', async (ctx) => {
  // ctx.req  → Request
  // ctx.res  → Response
  // ctx.state → dados do middleware (ex: user autenticado)
  // ctx.app  → instância (acesso a decorators: ctx.app.db)

  const userId = ctx.state.user.id;
  const data = await ctx.app.db.findDashboard(userId);

  return ctx.res.json(data);
});
```

---

### 9. Error Handling

Sistema de erros estruturado com classes customizadas e error handler global.

**Arquivos:** `src/errors/http-error.mjs`, `src/errors/error-handler.mjs`

**Hierarquia de erros:**

```text
Error
 └── HttpError
      ├── BadRequestError        (400)
      ├── UnauthorizedError      (401)
      ├── ForbiddenError         (403)
      ├── NotFoundError          (404)
      ├── MethodNotAllowedError  (405)
      ├── ConflictError          (409)
      ├── UnprocessableEntityError (422)
      ├── TooManyRequestsError   (429)
      └── InternalServerError    (500)
```

**Uso:**

```js
import { NotFoundError, BadRequestError } from 'zentjs';

app.get('/users/:id', async (ctx) => {
  if (!isValidId(ctx.req.params.id)) {
    throw new BadRequestError('Invalid user ID');
  }

  const user = await findUser(ctx.req.params.id);
  if (!user) {
    throw new NotFoundError('User not found');
  }

  return ctx.res.json(user);
});
```

**Formato de resposta de erro padrão:**

```json
{
  "statusCode": 404,
  "error": "Not Found",
  "message": "User not found"
}
```

**Comportamento padrão do ErrorHandler:**

- Se o erro já for `HttpError`, usa o `statusCode` e `toJSON()` da classe
- Se for erro genérico, converte para `InternalServerError` (500)
- Se `ctx.res.sent === true`, não envia resposta duplicada
- Se `setErrorHandler()` falhar, faz fallback para o handler padrão

**404 customizado com `setNotFoundHandler()`:**

```js
app.setNotFoundHandler(async (ctx) => {
  return ctx.res.status(404).json({
    statusCode: 404,
    error: 'Not Found',
    message: `Route ${ctx.req.method} ${ctx.req.path} not found`,
  });
});
```

Se o not-found handler não enviar resposta, o framework envia automaticamente o payload padrão de `NotFoundError`.

**Falha comum de parsing (JSON inválido):**

```js
import { bodyParser, zent } from 'zentjs';

const app = zent();
app.use(bodyParser());

app.post('/echo', (ctx) => ctx.res.json(ctx.req.body));
// body JSON inválido -> BadRequestError(400) com message "Invalid JSON body"
```

**Error handler customizado:**

```js
app.setErrorHandler((error, ctx) => {
  // Lógica customizada
  return ctx.res.status(error.statusCode || 500).json({
    success: false,
    error: error.message,
  });
});
```

---

## Fluxo de uma Requisição

Diagrama completo do ciclo de vida de uma requisição HTTP no ZentJS:

```text
Cliente HTTP
     │
     ▼
┌──────────────────────────────────────────────────────────────┐
│                    node:http Server                          │
│                  (req, res) callback                         │
└───────────────────────┬──────────────────────────────────────┘
                        │
                        ▼
              ┌─────────────────┐
              │  Criar Context  │  ZentRequest + ZentResponse
              │  (ctx)          │  são instanciados
              └────────┬────────┘
                       │
                       ▼
              ┌──────────────────┐
              │  onRequest hooks │  Logging, rate limiting, etc.
              └────────┬─────────┘
                       │
                       ▼
              ┌──────────────────┐
              │  Router.find()   │  Radix Tree lookup
              │  (method + path) │  → handler + params + route hooks
              └────────┬─────────┘
                       │
              ┌────────┴──────────┐
              │  Rota encontrada? │
              └────┬────────┬─────┘
                   │ Não    │ Sim
                   ▼        ▼
           ┌───────────┐  ┌─────────────────┐
           │ 404 Error │  │  preParsing     │  body-parser, upload
           └───────────┘  └───────┬─────────┘
                                  │
                                  ▼
                         ┌─────────────────┐
                         │  preValidation  │  schema validation
                         └────────┬────────┘
                                  │
                                  ▼
                       ┌──────────────────────┐
                       │  Middleware Pipeline │  Global + Route middlewares
                       │  (onion model)       │
                       └──────────┬───────────┘
                                  │
                                  ▼
                         ┌─────────────────┐
                         │  preHandler     │  Última chance antes do handler
                         └────────┬────────┘
                                  │
                                  ▼
                         ┌─────────────────┐
                         │  Route Handler  │  Função do usuário
                         └────────┬────────┘
                                  │
                                  ▼
                         ┌─────────────────┐
                         │  onSend         │  Serialização, compressão
                         └────────┬────────┘
                                  │
                                  ▼
                         ┌─────────────────┐
                         │  res.end()      │  Resposta enviada ao cliente
                         └────────┬────────┘
                                  │
                                  ▼
                         ┌─────────────────┐
                         │  onResponse     │  Métricas, cleanup
                         └─────────────────┘

         ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─
         Em caso de erro em qualquer fase:
         ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─
                         ┌─────────────────┐
                         │  onError hook   │
                         │  Error Handler  │  Formata e envia erro
                         └─────────────────┘
```

---

## API Pública

### Criação da instância

```js
import { zent } from 'zentjs';

const app = zent(options?);
```

**Opções:**

| Opção                 | Tipo      | Default | Descrição                         |
| --------------------- | --------- | ------- | --------------------------------- |
| `ignoreTrailingSlash` | `boolean` | `true`  | `/foo` e `/foo/` são equivalentes |
| `caseSensitive`       | `boolean` | `false` | Paths sensíveis a maiúsculas      |

> As opções acima são as efetivamente consumidas pela aplicação no runtime atual.

### Métodos de roteamento

```js
app.get(path, handler, options?);
app.post(path, handler, options?);
app.put(path, handler, options?);
app.patch(path, handler, options?);
app.delete(path, handler, options?);
app.head(path, handler, options?);
app.options(path, handler, options?);
app.all(path, handler, options?); // todos os métodos HTTP
app.route(definition); // definição completa da rota
```

**`options` por rota:**

```js
{
  middlewares: [authMiddleware],
  hooks: {
    onRequest: [fn],
    preParsing: [fn],
    preValidation: [fn],
    preHandler: [fn],
    onSend: [fn],
    onResponse: [fn],
    onError: [fn],
  },
}
```

**`app.route(definition)`**

```js
app.route({
  method: 'POST',
  path: '/users',
  handler: createUser,
  middlewares: [authMiddleware],
  hooks: { preValidation: [validateBody] },
});
```

### Middleware

```js
app.use(middleware); // Global
app.use('/api', middleware); // Com prefixo
```

Assinaturas válidas:

- `use(middleware)`
- `use(prefix, middleware)`

### Route Groups

Agrupa rotas sob um prefixo compartilhado, com middlewares e hooks herdados:

```js
// Grupo simples
app.group('/api/v1', (group) => {
  group.get('/users', listUsers); // GET /api/v1/users
  group.post('/users', createUser); // POST /api/v1/users
  group.get('/users/:id', getUser); // GET /api/v1/users/:id
});

// Grupo com middlewares compartilhados
app.group('/admin', { middlewares: [authMiddleware] }, (group) => {
  group.get('/dashboard', dashboard); // GET /admin/dashboard (com auth)
  group.delete('/users/:id', deleteUser);
});

// Sub-grupos aninhados (middlewares acumulam: pai → filho → rota)
app.group('/api', { middlewares: [cors] }, (api) => {
  api.group('/v1', { middlewares: [rateLimit] }, (v1) => {
    v1.get('/products', listProducts); // middlewares: [cors, rateLimit]
  });
  api.group('/v2', (v2) => {
    v2.get('/products', listProductsV2); // middlewares: [cors]
  });
});
```

**Características:**

- Prefixo aplicado automaticamente a todas as rotas do grupo
- Middlewares do grupo executam **antes** dos middlewares da rota
- Hooks são mesclados (grupo → rota)
- Sub-grupos herdam middlewares/hooks dos grupos pai
- Mesma API de conveniência (`get`, `post`, `all`, `route`, etc.)

### Plugins

```js
app.register(plugin, options?); // ex: { prefix: '/api' }
app.decorate(name, value);
app.hasDecorator(name);
```

Contrato de plugin:

```js
async function myPlugin(scope, opts) {
  // scope possui API compatível com app
  // e respeita encapsulamento por escopo
}
```

Métrica mínima por hooks (built-in):

```js
import { requestMetrics } from 'zentjs';

const metrics = requestMetrics({
  onRecord: (record) => {
    // { method, path, statusCode, durationMs }
    console.log(record);
  },
});

app.addHook('onRequest', metrics.onRequest);
app.addHook('onResponse', metrics.onResponse);
```

### Lifecycle

```js
app.addHook(hookName, hookFunction);
app.setErrorHandler(handler);
app.setNotFoundHandler(handler);
```

`hookName` suportados no lifecycle global:

- `onRequest`
- `preParsing`
- `preValidation`
- `preHandler`
- `onSend`
- `onResponse`
- `onError`

### Servidor

```js
await app.listen({ port, host }, callback?); // default: 3000 / 0.0.0.0
await app.close();
const response = await app.inject({ method, url, headers?, body? });
```

Resposta de `inject()`:

```js
{
  statusCode,
  headers,
  body,
  json() // helper para JSON.parse(body)
}
```

---

## Exemplos de Uso

### Exemplos executáveis (Fase 5)

Os exemplos abaixo já estão prontos na pasta `examples/`:

```bash
node examples/hello-world.mjs
node examples/rest-api.mjs
node examples/with-plugins.mjs
```

Cada exemplo sobe o servidor em `127.0.0.1:3000`.

Benchmark básico (Fase 10):

```bash
npm run bench
npm run bench:save-baseline
```

### Guias Práticos (Etapa 5)

- CRUD básico: seção **Guia: Primeira API (CRUD básico)**
- Autenticação por escopo: seção **Guia: Autenticação por plugin**
- Métricas por requisição: seção **Guia: Métricas com requestMetrics**
- Testes sem rede: seção **Guia: Testes com inject + Vitest**

### Hello World

```js
import { zent } from 'zentjs';

const app = zent();

app.get('/', (ctx) => {
  return ctx.res.json({ hello: 'world' });
});

app.listen({ port: 3000 });
```

### Guia: Primeira API (CRUD básico)

```js
import { zent, bodyParser, NotFoundError } from 'zentjs';

const app = zent({ logger: true });

// Middleware global para parsear body
app.use(bodyParser());

// In-memory store
const users = new Map();
let nextId = 1;

app.get('/users', (ctx) => {
  return ctx.res.json([...users.values()]);
});

app.get('/users/:id', (ctx) => {
  const user = users.get(Number(ctx.req.params.id));
  if (!user) throw new NotFoundError('User not found');
  return ctx.res.json(user);
});

app.post('/users', (ctx) => {
  const { name, email } = ctx.req.body;
  const user = { id: nextId++, name, email };
  users.set(user.id, user);
  return ctx.res.status(201).json(user);
});

app.put('/users/:id', (ctx) => {
  const id = Number(ctx.req.params.id);
  if (!users.has(id)) throw new NotFoundError('User not found');

  const { name, email } = ctx.req.body;
  const user = { id, name, email };
  users.set(id, user);
  return ctx.res.json(user);
});

app.delete('/users/:id', (ctx) => {
  const id = Number(ctx.req.params.id);
  if (!users.has(id)) throw new NotFoundError('User not found');

  users.delete(id);
  return ctx.res.empty();
});

app.listen({ port: 3000 });
```

### Guia: Autenticação por plugin

```js
import { UnauthorizedError, zent } from 'zentjs';

// Plugin de autenticação
async function authPlugin(app, opts) {
  app.decorate('authenticate', async (ctx) => {
    const token = ctx.req.get('authorization');
    if (!token) throw new UnauthorizedError('Missing token');
    ctx.state.user = verifyToken(token);
  });

  // Aplica hook em todas as rotas dentro deste escopo
  app.addHook('preHandler', async (ctx) => {
    await app.authenticate(ctx);
  });
}

// Plugin de rotas protegidas
async function protectedRoutes(app) {
  // Registra o plugin de auth neste escopo
  app.register(authPlugin);

  app.get('/profile', (ctx) => {
    return ctx.res.json(ctx.state.user);
  });
}

// Plugin de rotas públicas
async function publicRoutes(app) {
  app.get('/health', (ctx) => {
    return ctx.res.json({ status: 'ok' });
  });
}

const app = zent();

// Rotas públicas (sem auth)
app.register(publicRoutes, { prefix: '/api' });

// Rotas protegidas (com auth)
app.register(protectedRoutes, { prefix: '/api' });

app.listen({ port: 3000 });
```

### Guia: Métricas com requestMetrics

```js
import { requestMetrics, zent } from 'zentjs';

const app = zent();

const metrics = requestMetrics({
  onRecord: (record) => {
    // { method, path, statusCode, durationMs }
    console.log(record);
  },
});

app.addHook('onRequest', metrics.onRequest);
app.addHook('onResponse', metrics.onResponse);

app.get('/health', (ctx) => {
  return ctx.res.json({ status: 'ok' });
});

app.listen({ port: 3000 });
```

### Guia: Testes com inject + Vitest

```js
import { describe, it, expect } from 'vitest';
import { zent } from 'zentjs';

describe('API', () => {
  it('should return hello world', async () => {
    const app = zent();

    app.get('/', (ctx) => {
      return ctx.res.json({ hello: 'world' });
    });

    const response = await app.inject({
      method: 'GET',
      url: '/',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ hello: 'world' });
  });
});
```

---

## Roadmap de Implementação

A implementação segue uma ordem lógica de dependências:

### Fase 1 — Fundação (Core)

| #   | Módulo         | Prioridade | Dependência | Descrição                          |
| --- | -------------- | ---------- | ----------- | ---------------------------------- |
| 1   | `HttpError`    | Alta       | Nenhuma     | Classes de erro HTTP               |
| 2   | `ZentRequest`  | Alta       | Nenhuma     | Wrapper do IncomingMessage         |
| 3   | `ZentResponse` | Alta       | Nenhuma     | Wrapper do ServerResponse          |
| 4   | `Context`      | Alta       | 2, 3        | Objeto de contexto (req + res)     |
| 5   | `RadixTree`    | Alta       | Nenhuma     | Estrutura de dados para roteamento |
| 6   | `Router`       | Alta       | 5           | API pública do router              |

### Fase 2 — Pipeline

| #   | Módulo         | Prioridade | Dependência | Descrição                         |
| --- | -------------- | ---------- | ----------- | --------------------------------- |
| 7   | `Pipeline`     | Alta       | 4           | Executor de middlewares (compose) |
| 8   | `Lifecycle`    | Alta       | 7           | Gerenciador de hooks              |
| 9   | `ErrorHandler` | Alta       | 1, 4        | Handler global de erros           |

### Fase 3 — Aplicação

| #   | Módulo        | Prioridade | Dependência   | Descrição                                  |
| --- | ------------- | ---------- | ------------- | ------------------------------------------ |
| 10  | `HttpServer`  | Alta       | 4, 6, 7, 8, 9 | Servidor HTTP + request dispatch           |
| 11  | `Application` | Alta       | 10            | Classe principal Zent                      |
| 12  | `inject()`    | Média      | 10, 11        | Light-weight request injection para testes |

### Fase 4 — Plugins e Extras

| #   | Módulo          | Prioridade | Dependência | Descrição                                       |
| --- | --------------- | ---------- | ----------- | ----------------------------------------------- |
| 13  | `PluginManager` | Média      | 11          | Sistema de registro e encapsulamento de plugins |
| 14  | `bodyParser`    | Média      | Nenhuma     | Middleware built-in para parsing de body        |
| 15  | `cors`          | Baixa      | Nenhuma     | Middleware built-in para CORS                   |

### Fase 5 — Polish

| #   | Módulo               | Prioridade | Descrição                           |
| --- | -------------------- | ---------- | ----------------------------------- |
| 16  | Testes de integração | Alta       | Testes end-to-end HTTP reais        |
| 17  | JSDoc + tipos        | Média      | Documentação inline e type hints    |
| 18  | Exemplos             | Baixa      | Exemplos executáveis em `examples/` |

Status atual: fases 1–5 implementadas.

Métricas atuais (03/03/2026):

- Testes: `322/322` passando (`14` arquivos de teste)
- Cobertura geral: `99.62%` statements · `96.79%` branches · `100%` functions · `99.61%` lines

### Novo ciclo (pós-fases iniciais)

Com as fases 1–5 concluídas, o próximo ciclo passa a ser guiado por **entregas pequenas e testáveis**, sempre com:

1. Escopo fechado por fase
2. Testes unitários obrigatórios
3. Testes de integração quando houver impacto no fluxo HTTP real, plugins ou encapsulamento

### Fase 6 — Paridade API x Runtime

Objetivo: alinhar comportamento real com a API pública/documentação.

| Item | Escopo                                                                           |
| ---- | -------------------------------------------------------------------------------- |
| 6.1  | Executar `onSend` no dispatch da requisição (incluindo transformação de payload) |
| 6.2  | Suporte completo a `app.use('/prefix', middleware)`                              |
| 6.3  | Implementar `setNotFoundHandler()` na aplicação                                  |
| 6.4  | Garantir hooks de rota além de `preHandler` conforme contrato público            |

**Testes da fase 6:**

- Unitários para `application`, `lifecycle`, `router`
- Integração para validar `onSend`, middleware com prefixo e 404 customizado

### Fase 7 — Encapsulamento real de plugins

Objetivo: garantir isolamento entre escopos pai/filho/irmãos.

| Item | Escopo                                                        |
| ---- | ------------------------------------------------------------- |
| 7.1  | Isolar decorators por escopo de plugin                        |
| 7.2  | Isolar hooks e middlewares com herança controlada pai → filho |
| 7.3  | Validar que plugins irmãos não compartilham estado interno    |
| 7.4  | Fortalecer contratos de registro/carregamento em cascata      |

**Testes da fase 7:**

- Unitários para `plugin-manager` e criação de escopo
- Integração com plugins aninhados e cenários de não-vazamento

### Fase 8 — Robustez de HTTP/erros

Objetivo: endurecer comportamento em cenários de borda.

| Item | Escopo                                                             |
| ---- | ------------------------------------------------------------------ |
| 8.1  | Revisar fluxo de erro para evitar respostas duplicadas             |
| 8.2  | Consolidar resposta de parse inválido de body (ex.: JSON inválido) |
| 8.3  | Melhorar consistência entre `inject()` e servidor real             |
| 8.4  | Cobrir cenários limite de headers/body/status                      |

**Testes da fase 8:**

- Unitários focados em `error-handler`, `body-parser`, `response`
- Integração para falhas reais de parsing e serialização

### Fase 9 — Qualidade de documentação e DX

Objetivo: manter documentação e uso prático sempre sincronizados.

| Item | Escopo                                                          |
| ---- | --------------------------------------------------------------- |
| 9.1  | Corrigir lint de markdown (fenced blocks com linguagem)         |
| 9.2  | Revisar README para refletir somente comportamento implementado |
| 9.3  | Padronizar exemplos para cobrir APIs críticas do ciclo 6–8      |

**Testes/validações da fase 9:**

- `npm run lint`
- Execução dos exemplos e smoke tests de rotas principais

### Fase 10 — Performance e observabilidade mínima

Objetivo: preparar baseline para evolução com segurança.

| Item | Escopo                                                     |
| ---- | ---------------------------------------------------------- |
| 10.1 | Benchmark básico de roteamento e pipeline                  |
| 10.2 | Métricas mínimas por requisição (tempo e status) via hooks |
| 10.3 | Cenários de carga leve para regressão de performance       |

**Testes/validações da fase 10:**

- Benchmarks reproduzíveis versionados no repositório
- Regressão comparativa entre versões do core

---

## Decisões Técnicas (ADRs)

### ADR-001: ESM Only

**Contexto:** Node.js suporta CommonJS e ESM.
**Decisão:** Usar exclusivamente ESM (`.mjs` ou `"type": "module"`).
**Motivo:** ESM é o padrão do futuro, permite top-level await, tree-shaking nativo, e importações estáticas para analysis.

### ADR-002: Zero Dependências de Runtime

**Contexto:** Frameworks como Express dependem de dezenas de pacotes.
**Decisão:** Nenhuma dependência no `dependencies` do package.json.
**Motivo:** Reduz supply chain risk, tamanho do `node_modules`, e garante total controle sobre o código.

### ADR-003: Radix Tree para Roteamento

**Contexto:** Express usa array linear O(n), o que não escala.
**Decisão:** Implementar Radix Tree customizada.
**Motivo:** Lookup em O(k) onde k = comprimento do path. Performance independente do número de rotas.

### ADR-004: Context Object (ctx)

**Contexto:** Express passa `(req, res, next)`, Fastify passa `(request, reply)`.
**Decisão:** Usar um único objeto `ctx` que contém `req`, `res`, `state` e `app`.
**Motivo:** Simplifica a signature dos handlers, facilita extensão via `state`, e permite tipagem mais clara.

### ADR-005: Async-first

**Contexto:** Express não trata promises automaticamente.
**Decisão:** Todos os handlers e middlewares são tratados como async por padrão.
**Motivo:** Elimina a necessidade de `try/catch` manual e `next(err)`. Erros em async handlers são capturados automaticamente.

### ADR-006: Plugin Encapsulation

**Contexto:** Em Express, todos os middlewares são globais.
**Decisão:** Plugins criam escopos encapsulados (inspirado no Fastify).
**Motivo:** Evita efeitos colaterais entre módulos, facilita composição de aplicações grandes.

### ADR-007: Lazy Body Parsing

**Contexto:** Fastify parseia body apenas quando necessário.
**Decisão:** Body não é parseado automaticamente — exige middleware explícito.
**Motivo:** Zero overhead para rotas que não precisam de body (GET, DELETE, health checks).

---

## Referências

- [Node.js HTTP Module](https://nodejs.org/api/http.html)
- [Express.js Source Code](https://github.com/expressjs/express)
- [Fastify Architecture](https://fastify.dev/docs/latest/Reference/Architecture/)
- [Radix Tree (Wikipedia)](https://en.wikipedia.org/wiki/Radix_tree)
- [find-my-way (Fastify Router)](https://github.com/delvedor/find-my-way)
- [Koa Compose (Middleware)](https://github.com/koajs/compose)

---

## Licença

[BSD-3-Clause](LICENSE)
