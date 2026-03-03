# API Pública

## Criação da aplicação

```js
import { zent } from '@zentjs/zentjs';

const app = zent({
  ignoreTrailingSlash: true,
  caseSensitive: false,
});
```

Opções suportadas:

- `ignoreTrailingSlash` (`boolean`, default `true`)
- `caseSensitive` (`boolean`, default `false`)

## Rotas

```js
app.get(path, handler, options?);
app.post(path, handler, options?);
app.put(path, handler, options?);
app.patch(path, handler, options?);
app.delete(path, handler, options?);
app.head(path, handler, options?);
app.options(path, handler, options?);
app.all(path, handler, options?);
app.route({ method, path, handler, middlewares?, hooks? });
```

`options` por rota:

```js
{
  middlewares: [fn],
  hooks: {
    onRequest: [fn],
    preParsing: [fn],
    preValidation: [fn],
    preHandler: [fn],
    onSend: [fn],
    onResponse: [fn],
    onError: [fn],
  }
}
```

## Middlewares

```js
app.use(middleware);
app.use('/prefix', middleware);
```

Assinatura:

```js
async function middleware(ctx, next) {
  await next();
}
```

## Route Groups

```js
app.group('/api', { middlewares: [auth] }, (group) => {
  group.get('/users', listUsers);

  group.group('/admin', { middlewares: [adminOnly] }, (admin) => {
    admin.delete('/users/:id', deleteUser);
  });
});
```

## Plugins

```js
app.register(plugin, options?);
app.decorate(name, value);
app.hasDecorator(name);
```

Contrato de plugin:

```js
async function myPlugin(scope, opts) {
  // scope compatível com app e encapsulado
}
```

## Hooks e handlers

```js
app.addHook(hookName, hookFn);
app.setErrorHandler(handler);
app.setNotFoundHandler(handler);
```

Hooks globais suportados:

- `onRequest`
- `preParsing`
- `preValidation`
- `preHandler`
- `onSend`
- `onResponse`
- `onError`

## Servidor e testes

```js
await app.listen({ port, host }, callback?);
await app.close();

const response = await app.inject({ method, url, headers?, body? });
response.statusCode;
response.headers;
response.body;
response.json();
```
