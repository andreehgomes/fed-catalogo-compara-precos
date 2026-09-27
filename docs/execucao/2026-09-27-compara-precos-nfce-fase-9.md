# Execução: Fase 9 — Produtos, estabelecimentos e painel

**Data:** 2026-09-27
**Plano:** docs/plano/compara-precos-nfce-fase-9.md (via `compara-precos-nfce-executar-tudo.md`)
**Branch:** main
**Executor:** Claude Code

---

## Resumo

Comparação na base comunitária: busca de produto (texto ou EAN), página do produto com
menor/médio/maior, tabela por estabelecimento, gráfico de histórico em SVG próprio e
preços da região; vínculo de produtos equivalentes por callable (sem ciclos, EANs
distintos recusados); lista e detalhe de estabelecimentos; e o painel inicial com gasto
do mês, variação, últimas notas, pendentes e economia potencial. Todas as rotas da
análise têm tela real (o placeholder "Em breve" saiu).

---

## Tarefas Executadas

| Fase | Tarefa | Status | Observações |
|------|--------|--------|-------------|
| 9.1 | `ProdutosService` e índices | ✅ | `buscar` (EAN por `getDoc`; texto pelo token mais específico + filtro no cliente), `obter`, `equivalentes` (canônico), `precos` (grupos de 30, 90 dias, `limit(300)`). Índices `precos(produtoId, emissao↓)`, `precos(cnpj, emissao↓)`, `produtos(tokens, descricaoNorm)` |
| 9.2 | Busca de produtos | ✅ | Signal Forms com debounce, scanner em `@defer`, resultados com descrição, menor preço e nº de estabelecimentos; sem resultado → "Ver preços perto de mim" (`/regiao?gtin=` ou `?termo=`) |
| 9.3 | Página do produto e histórico | ✅ | `resumirPrecos` (menor/médio/maior, R$/unidade base), tabela por estabelecimento com `cp-badge-preco` e fonte `comunidade`/`minhas-notas`, `cp-precos-perto` e `cp-grafico-historico` em `@defer (on viewport)` (chunk lazy) |
| 9.4 | Vincular produtos | ✅ | Callables `vincularProduto`/`desvincularProduto` (11 specs com repositório em memória), diálogo com busca e sugestões por Jaccard + mesmo conteúdo |
| 9.5 | Estabelecimentos | ✅ | `EstabelecimentosService`, lista paginada com busca por nome, detalhe com produtos de preço mais recente (dedup por produto) |
| 9.6 | Painel | ✅ | Total do mês + variação, notas do mês, economia potencial pela base comunitária (sem chamar o Menor Preço), últimas 5, pendentes, atalhos, estado inicial em 3 passos |

---

## Discrepâncias do Plano

- **Menor/médio/maior sobre o último preço de cada estabelecimento** (não sobre todas as
  observações): um mercado com muitas notas não pesa mais que os outros. Registrado no
  código (`resumo.ts`).
- **Nº de estabelecimentos na busca** vem de um campo novo `produtos/{id}.cnpjs` (até 50),
  mantido pela publicação de preços nas Functions (spec atualizado), em vez de uma
  consulta a `precos` por resultado.
- **Canônico do vínculo:** quando um dos lados tem EAN, o EAN vira o canônico mesmo que
  seja a origem (o plano previa sempre gravar `origem.vinculadoA`).
- **"Token mais raro"** é o token mais longo sem dígito (não há estatística de
  frequência na base).
- Tokens de cor `$cp-serie-1..5` e `$cp-grafico-grade` acrescentados (contraste
  conferido pelo script: 52 pares).
- O placeholder `features/em-breve` foi removido (todas as rotas implementadas).

---

## Análise de Lint

```
npm run lint → All files pass linting.
npm run contraste → 52 pares aprovados em WCAG AA.
```

## Verificações

```
npm run test:ci → 25 arquivos, 259 testes verdes (cobertura total 86,5%)
npm --prefix functions test → 70 testes verdes (inclui vincularProduto)
ng build -c production → initial 476.87 kB, sem aviso; gráfico, scanner e zxing fora dos
  chunks iniciais (conferido por grep no dist)
```

## Boas Práticas Angular 20

| Critério | Status |
|----------|--------|
| OnPush em todos os componentes | ✅ |
| inject() sem construtor | ✅ |
| takeUntilDestroyed() | ✅ (sem subscription manual nova) |
| trackBy/track em @for | ✅ |
| loading="lazy" em imagens | ✅ (nenhuma `<img>`) |
| Sem any implícito | ✅ |

---

## Critérios de Aceitação

- ✅ Produto com EAN comprado em 2 mercados mostra os dois, com menor, médio e maior (spec da página e do resumo com seed 3 × 6).
- ✅ Preço por unidade base exibido quando a descrição tem conteúdo (`/L` na página).
- ✅ Produto sem EAN vinculável; a comparação passa a considerar os dois (preços do vinculado entram na página do EAN); sem ciclos (spec das Functions).
- ✅ Gráfico e scanner fora do chunk inicial.
- ✅ Estabelecimentos listados a partir das notas, com detalhe.
- ✅ Painel com total do mês, últimas notas, pendentes e economia potencial (cálculo manual confere).

---

## Arquivos Criados/Modificados

```
functions/src/produtos/vincular-produto.ts functions/test/vincular.spec.ts
functions/src/index.ts functions/src/importar/{log,publicar-precos}.ts functions/test/importacao.spec.ts functions/.prettierignore
shared/model.ts firestore.indexes.json scripts/contraste.mjs src/app/shared/style/_tokens.scss
src/app/features/produtos/{produtos.routes.ts, produtos.spec.ts, data-access/produtos.service.ts, busca/*, detalhe/{produto-detalhe.page.ts,html, precos-perto.ts, resumo.ts}, vincular/vincular-dialog.ts}
src/app/shared/ui/grafico-historico/grafico-historico.{ts,scss}
src/app/features/estabelecimentos/{estabelecimentos.routes.ts, data-access/*, lista/*, detalhe/*}
src/app/features/painel/{painel.page.ts,html,scss, painel.calculos.ts, paginas-fase9.spec.ts}
src/app/features/notas/data-access/notas.service.ts src/app/app.routes.ts CLAUDE.md
(removido) src/app/features/em-breve/
```
