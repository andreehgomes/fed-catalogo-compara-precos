# Execução: Histórico de preços na nota

**Data:** 2026-09-29
**Plano:** [docs/plano/historico-precos-nota-plano.md](../plano/historico-precos-nota-plano.md)
**Branch:** main
**Executor:** Claude Code

---

## Resumo

No detalhe da nota (`/notas/:chave`), cada item passa a ser comparado com a última compra
anterior do mesmo produto (ou do mesmo grupo de vínculo) nas notas do próprio usuário dos
últimos 12 meses: badge, preço da última vez com data e mercado, diferença por unidade (R$ e %)
e quanto pagou a mais/a menos nesta compra. O resumo soma a mais, a menos e o saldo; há
destaques das maiores altas/quedas e o filtro Todos · Subiram · Baixaram · Primeira compra em
`?itens=`. Tudo no cliente, sem escrita no Firestore e sem Function nova.

---

## Tarefas Executadas

| Fase | Tarefa | Status | Observações |
|------|--------|--------|-------------|
| 1.1 | `quantidadeNaUnidadeBase` | ✅ | `shared/unidade.ts` + `shared/unidade.spec.ts` (KG, G, ML, "2L", "6X350ML", "30un", sem conteúdo) |
| 1.2 | `membrosDosGrupos` | ✅ | `ProdutosService`, `vinculadoA in` em grupos de 30; spec: 65 canônicos → 3 consultas, sem duplicados |
| 1.3 | Ícones | ✅ | `expand_less`, `expand_more`, `history` em `icon_names=` (ordem alfabética) |
| 5.1 | Fixture de histórico | ✅ | `src/testing/fixtures/notas-historico/{notas,produtos}.json`: 4 notas, 2 mercados |
| 2.1 | Tipos, `montarGrupos`, `indexarCompras` | ✅ | `detalhe/historico-pessoal.ts` |
| 2.2 | `compararItem` | ✅ | Ver discrepância sobre a base `vlUnit` |
| 2.3 | Resumo, destaques e filtro | ✅ | `resumirHistorico`, `destaques`, `filtrarItens` + `contarPorFiltro`, `compararNota`, `comValores` |
| 3.1 | `HistoricoPessoalStore` | ✅ | Promessa compartilhada por `uid`, cache de produtos e membros, releitura única para nota ausente |
| 3.2 | Invalidação | ✅ | Após `excluir()` no detalhe e após `confirmarNfce` ok no `ImportarStore`; specs verificam |
| 4.1 | `<cp-historico-item>` | ✅ | Badge + "Última vez…", "Primeira compra", "Unidade diferente…", expansão com `aria-expanded`/`aria-controls` |
| 4.2 | Total no resumo e estados | ✅ | `resource` + `computed`; skeleton só no resumo; aviso com "Tentar de novo" |
| 4.3 | Destaques e filtro | ✅ | `@defer (on viewport)`, `.cp-segmented` com contagem, `?itens=`, rolagem até `#item-{n}` |
| 5.2 | Specs do detalhe | ✅ | `notas.spec.ts`: resumo, linha, lista antes do histórico, erro, filtro, destaques, exclusão, store e componente |
| 5.3 | e2e e acessibilidade | ✅ | `e2e/notas-historico.spec.ts` e detalhe da nota no `a11y.spec.ts` (pulados sem `.env.e2e`) |
| 5.4 | Documentação e verificação | ✅ | Seção "Minhas notas" do `CLAUDE.md`; lint, contraste, `test:ci`, build e Functions verdes |

---

## Discrepâncias do Plano

- **Base `vlUnit` (Tarefa 2.2):** o plano manda comparar `vlUnit` sempre que a unidade comercial
  for a mesma, mas o critério da mesma tarefa exige "2L × 3L do mesmo grupo por R$/L" (os dois
  são `UN`). Implementado: `vlUnit` quando a unidade comercial é a mesma **e** o conteúdo da
  descrição é igual (ou desconhecido em um dos lados); com conteúdos diferentes cai para
  R$/unidade base.
- **Fixture (Tarefa 5.1):** a nota real do PR só tem itens `UN`. O granel em `KG` ("Tomate
  Italiano Kg") e o "REPOLHO VERDE" em `KG` do segundo mercado foram criados; os demais itens
  usam descrições da nota real. Gerada uma vez por script (não versionado); os CNPJs são os já
  usados nos specs.
- **Componente do item:** o botão de expandir tem texto visível ("Ver compras"/"Ocultar
  compras") além do ícone, em vez de só ícone.
- **Helpers extras:** `compararNota`, `comValores` e `contarPorFiltro` (contagem do filtro) em
  `historico-pessoal.ts`; `inicioDaJanela` no store.
- **Releitura por nota ausente:** limitada a uma vez por chave, para não reler a cada abertura
  quando o usuário tem mais de 400 notas na janela.
- **Contraste:** pares novos em `scripts/contraste.mjs` (`cp-cheaper`/`cp-pricier`/
  `cp-accent-ink` sobre `cp-surface-subtle`), porque o saldo e a expansão ficam sobre essa superfície.
- **Verificação visual:** não foi feita no navegador — o detalhe exige login no dv e não há
  `.env.e2e` com o usuário de teste. O comportamento foi coberto pelos specs de página.
- **Prettier:** reformatou `importar.page.html` e `preview-nota.page.html` (alterações do
  usuário ainda sem commit); só formatação/fim de linha, sem mudança de conteúdo.

---

## Análise de Lint

```
> ng lint && stylelint "src/**/*.scss" --allow-empty-input
Linting "fed-catalogo-compara-precos"...
All files pass linting.
```

`npm run contraste`: 55 pares aprovados (3 novos) em WCAG AA.
`npm run test:ci`: 28 arquivos, 338 testes verdes. Cobertura de linhas: `historico-pessoal.ts`
93/93, `historico-pessoal.store.ts` 52/52, `historico-item.ts` 58/58, `shared/unidade.ts` 34/34.
`ng build --configuration=production`: sem aviso de budget; initial 483,79 kB; chunk
`nota-detalhe-page` 26,90 kB.
Functions: `typecheck` ok, 90 testes verdes.

## Boas Práticas Angular 20

| Critério | Status |
|----------|--------|
| OnPush em todos os componentes | ✅ |
| inject() sem construtor | ✅ |
| takeUntilDestroyed() | ✅ (nenhuma subscription manual nova) |
| trackBy/track em @for | ✅ |
| loading="lazy" em imagens | ✅ (nenhuma imagem nova) |
| Sem any implícito | ✅ |

---

## Critérios de Aceitação

- ✅ Cada item comprado antes mostra o preço da última vez (data e mercado), a diferença por
  unidade em R$ e % e quanto pagou a mais ou a menos nesta compra.
- ✅ Item sem compra anterior mostra "Primeira compra", sem cor de alta/queda.
- ✅ Compras posteriores à nota e a própria nota são ignoradas.
- ✅ Mesmo `produtoId` e produtos de mercados diferentes vinculados ao mesmo canônico são
  reconhecidos; sem vínculo, não.
- ✅ Granel compara por R$/kg; embalagens diferentes do mesmo grupo por R$/L ou R$/kg;
  unidades incompatíveis mostram "Unidade diferente da última compra".
- ✅ O resumo mostra total a mais, a menos, saldo e "N de M itens comparados", batendo com a
  soma manual da fixture (R$ 8,16 − R$ 4,25 = R$ 3,91; 6 de 8).
- ✅ Filtro Subiram/Baixaram/Primeira compra funciona e fica em `?itens=`.
- ✅ Destaques listam até 3 altas e 3 quedas e levam ao item.
- ✅ Expansão do item mostra até 5 compras, menor e média, e o link para `/produtos/:id`.
- ✅ A lista de itens aparece antes do histórico; falha mostra aviso com "Tentar de novo".
- ✅ Abrir uma segunda nota na sessão não relê as notas; excluir ou importar invalida o cache.
- ✅ Nenhuma escrita no Firestore e nenhuma chamada a Functions, Menor Preço ou Claude API.
- ⚠️ Badges com ícone + texto ✅; axe no detalhe da nota escrito, mas **não executado** (sem
  `.env.e2e`).
- ✅ `npm run lint`, `npm run contraste`, `npm run test:ci` e build de produção verdes, sem
  estourar budget.

---

## Arquivos Criados/Modificados

```
CLAUDE.md
e2e/a11y.spec.ts
e2e/notas-historico.spec.ts                                  (novo)
scripts/contraste.mjs
shared/unidade.ts
shared/unidade.spec.ts                                       (novo)
src/index.html
src/app/features/importar/importar.store.ts
src/app/features/importar/importar.spec.ts
src/app/features/notas/data-access/historico-pessoal.store.ts (novo)
src/app/features/notas/detalhe/historico-item.ts             (novo)
src/app/features/notas/detalhe/historico-pessoal.ts          (novo)
src/app/features/notas/detalhe/historico-pessoal.spec.ts     (novo)
src/app/features/notas/detalhe/nota-detalhe.page.html
src/app/features/notas/detalhe/nota-detalhe.page.scss
src/app/features/notas/detalhe/nota-detalhe.page.ts
src/app/features/notas/notas.spec.ts
src/app/features/produtos/data-access/produtos.service.ts
src/app/features/produtos/produtos.spec.ts
src/testing/fixtures/notas-historico/notas.json              (novo)
src/testing/fixtures/notas-historico/produtos.json           (novo)
```

---

## Ajustes pedidos após a execução

- **Lançamentos repetidos consolidados:** `consolidarItens` (em `historico-pessoal.ts`) junta os
  lançamentos do mesmo produto, unidade e preço unitário numa linha, somando quantidade e total
  (fica o `n` do primeiro). Vale para a lista de itens, o resumo, o filtro, os destaques, o
  "Tem mais barato perto?" e o índice do histórico (a expansão não repete a mesma nota). O
  resumo passa a contar itens consolidados; o "Itens" do topo continua sendo o `qtdItens` do cupom.
- **Destaques em dois cards:** "Ficaram mais baratos" e "Ficaram mais caros", com a contagem no
  título, os 3 maiores por |impacto| e "Ver todos (N)" / "Mostrar menos" (`aria-expanded`).
  Cada linha mostra quantidade, valor por unidade atual e o anterior
  ("2 UN · R$ 21,40/un · antes R$ 18,90/un"). `sufixoDaBase` foi movido para a regra pura.
- Verificação: `npm run lint` sem erros, `npm run test:ci` com 343 testes verdes, build de
  produção sem aviso de budget.
