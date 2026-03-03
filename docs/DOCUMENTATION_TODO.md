# Documentation TODO — ZentJS

Plano incremental para evoluir a documentação com entregas pequenas, revisáveis e alinhadas ao runtime atual.

## Status

- [x] Etapa 0 — Levantamento da API implementada (`src/`)
- [x] Etapa 1 — Estrutura base da documentação
- [x] Etapa 2 — API de aplicação e roteamento
- [x] Etapa 3 — Lifecycle, middlewares e erros
- [x] Etapa 4 — Plugins e encapsulamento
- [x] Etapa 5 — Guias práticos e receitas
- [ ] Etapa 6 — Revisão final e consistência

---

## Etapa 0 — Levantamento da API implementada

Objetivo: confirmar contratos reais antes de escrever/expandir a doc.

Checklist concluído:

- [x] Exportações públicas em `src/index.mjs`
- [x] API da aplicação em `src/core/application.mjs`
- [x] Recursos de roteamento (`group`, hooks/middlewares de rota)
- [x] Hooks globais e de rota (`onRequest` → `onError`, incluindo `onSend`)
- [x] Plugin system e escopo encapsulado
- [x] `setNotFoundHandler()` e `use('/prefix', middleware)` validados no código

---

## Etapa 1 — Estrutura base da documentação

Objetivo: organizar o README e preparar navegação clara por tópicos.

Entregas:

- [x] Revisar sumário para refletir ciclo atual (fases 6–10 + documentação)
- [x] Adicionar seção de "Estado da documentação"
- [x] Definir padrão de escrita (exemplos, assinatura de API, erros)
- [x] Padronizar termos (handler, hook, middleware, plugin scope)

Critério de pronto:

- README com índice navegável e seções sem duplicidade conceitual.

Status da etapa:

- [x] Concluída em 03/03/2026

---

## Etapa 2 — API de aplicação e roteamento

Objetivo: detalhar API pública mais usada no dia a dia.

Entregas:

- [x] Documentar `zent()` e opções da aplicação com defaults reais
- [x] Documentar `route()`, métodos HTTP e `all()`
- [x] Documentar `group()` (herança de middlewares/hooks e subgrupos)
- [x] Documentar `inject()` com exemplos de teste
- [x] Validar exemplos contra comportamento real

Critério de pronto:

- Exemplos executáveis sem divergência entre docs e runtime.

Status da etapa:

- [x] Concluída em 03/03/2026

---

## Etapa 3 — Lifecycle, middlewares e erros

Objetivo: consolidar fluxo de request/response e políticas de erro.

Entregas:

- [x] Sequência completa de hooks globais e por rota
- [x] Semântica de `onSend` (transformação de payload)
- [x] `use(middleware)` e `use('/prefix', middleware)`
- [x] `setErrorHandler()` e `setNotFoundHandler()`
- [x] Tabela de respostas padrão de erro

Critério de pronto:

- Fluxo documentado com exemplos cobrindo sucesso e falha.

Status da etapa:

- [x] Concluída em 03/03/2026

---

## Etapa 4 — Plugins e encapsulamento

Objetivo: explicar isolamento de escopo e composição de plugins.

Entregas:

- [x] Modelo de escopo (pai → filho, isolamento entre irmãos)
- [x] Uso de `register()`, `decorate()`, `hasDecorator()`
- [x] Herança controlada de hooks e middlewares
- [x] Exemplo com plugins aninhados e prefixos

Critério de pronto:

- Leitor consegue prever o que herda e o que não vaza entre escopos.

Status da etapa:

- [x] Concluída em 03/03/2026

---

## Etapa 5 — Guias práticos e receitas

Objetivo: acelerar adoção com snippets prontos.

Entregas:

- [x] Guia "primeira API" (CRUD básico)
- [x] Guia "autenticação por plugin"
- [x] Guia de métricas com `requestMetrics`
- [x] Guia de testes com `inject()` + Vitest

Critério de pronto:

- Guias testáveis e reutilizáveis em projetos reais.

Status da etapa:

- [x] Concluída em 03/03/2026

---

## Etapa 6 — Revisão final e consistência

Objetivo: fechar ciclo com qualidade editorial e técnica.

Entregas:

- [ ] Revisão de consistência API x README x exemplos
- [ ] Revisão de linguagem (PT-BR técnico consistente)
- [ ] Ajustes de markdown lint e legibilidade
- [ ] Checklist final de links internos

Critério de pronto:

- Documentação estável para release e manutenção contínua.

---

## Convenções de atualização

- Atualizar este arquivo ao concluir cada etapa.
- Cada PR de documentação deve marcar os itens correspondentes.
- Evitar documentar comportamento não implementado no runtime.
