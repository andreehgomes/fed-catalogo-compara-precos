# Execução: Comparação com o seu melhor preço recente

**Data:** 2026-09-30
**Plano:** [docs/plano/melhor-preco-recente-plano.md](../plano/melhor-preco-recente-plano.md)
**Branch:** main
**Executor:** Claude Code

---

## Resumo

O detalhe da nota passou a comparar cada item com o **menor preço que o usuário pagou pelo mesmo
produto/grupo, em qualquer mercado, nos 60 dias antes da emissão da nota**, em vez da última
compra. Quem pagou acima vê "R$ X acima do seu melhor", e esse valor vai para o resumo ("Você
poderia ter economizado"). Igual ou abaixo ganha o selo "Seu melhor preço" ou "Novo melhor
preço", sem descontar nada. A última compra aparece só como tendência. Foram atualizados a
lista de notas, os destaques, os filtros, os testes, o e2e e a documentação.

---

## Tarefas Executadas

| Fase | Tarefa | Status | Observações |
|------|--------|--------|-------------|
| 1.1 | Novos tipos | ✅ | `ComparacaoComValores` (`acima`/`melhor`, `melhor`, `novoMelhor`, `ultima`), `Tendencia`, `sem-recente`, `ResumoHistorico` sem `aMenos`/`saldo`, `JANELA_MELHOR_PRECO_DIAS` |
| 1.2 | `compararItem` com janela, base ancorada e tendência | ✅ | `baseDoItem` substitui `escolherBase`; janela por `Date.parse` (não depende do formato da string) |
| 1.3 | Resumo, destaques e filtros | ✅ | `destaques()` devolve `number[]` (só os acima); filtros `todos/acima/melhor/primeira` |
| 2.1 | `<cp-historico-item>` | ✅ | Badges com `rotulo`; linha de tendência com `trending_up/down/flat`; `sem-recente` neutro |
| 2.2 | Resumo, destaques e filtro no detalhe | ✅ | Um card de destaques; `TipoDestaque`/`alternarDestaques` removidos; CSS sem uso removido |
| 2.3 | Saldo na lista de notas | ✅ | "R$ X a mais" ou "No melhor preço"; "de economia" removido |
| 3.1 | Spec da regra | ✅ | 36 testes, incluindo o cenário Box/Merkagel e o limite de 60 dias |
| 3.2 | Specs de componente | ✅ | `notas.spec.ts` atualizado e com testes novos (tendência e `sem-recente`) |
| 3.3 | e2e | ⚠️ | Textos atualizados em `notas-historico.spec.ts` e `a11y.spec.ts`; não executado (sem `.env.e2e`) |
| 4.1 | CLAUDE.md | ✅ | Seção Minhas notas |
| 4.2 | Conferir sugestão de compra | ✅ | `sugestao.ts` usa só `baseComum`/`sufixoDaBase`; specs verdes sem alteração |
| 4.3 | Análise | ✅ | D-03 acrescentada, D-02 marcada como substituída, aviso antes de RF-03 |

---

## Discrepâncias do Plano

- **Fixture nos specs de componente:** com a janela de 60 dias, a nota de 10/06 da fixture
  `notas-historico` fica fora da janela da nota de 20/09, e quase tudo vira `sem-recente`.
  O spec da regra usa a fixture como está (cobre `sem-recente`). Em `notas.spec.ts`, a nota foi
  movida para 05/08 na carga, para a tela passar por todos os estados. O arquivo da fixture não
  mudou.
- **Badges:** o plano previa "R$ X acima do seu melhor" também nos destaques. No card de
  destaques ficou "R$ X a mais", porque a linha já mostra "seu melhor R$ Y (mercado)".
- **Tendência na expansão:** "(nesta compra)" passou a ser calculado no template
  (`valorAtual <= menor`), já que o campo `menorNestaCompra` saiu do tipo.
- **Verificação visual:** não foi feita. O `npm start` exige login com a conta real no dv, e o
  agente não digita senhas.

---

## Análise de Lint

```
Linting "fed-catalogo-compara-precos"...
All files pass linting.
```

(stylelint incluso no `npm run lint`, sem erros.)

Build de produção: concluído sem aviso de budget (`nota-detalhe-page` 29,14 kB bruto / 8,48 kB
transferido).

Testes: `npm run test:ci` → 43 arquivos, 660 testes, todos verdes.

## Boas Práticas Angular 20

| Critério | Status |
|----------|--------|
| OnPush em todos os componentes | ✅ |
| inject() sem construtor | ✅ |
| takeUntilDestroyed() | ✅ (nenhuma subscription nova) |
| trackBy/track em @for | ✅ |
| loading="lazy" em imagens | ✅ (nenhuma imagem nova) |
| Sem any implícito | ✅ |

---

## Critérios de Aceitação

- ✅ Cenário Box 10,00 → Merkagel 11,00 → Merkagel 11,00: as duas acima do Box em R$ 1,00/un;
  a segunda com tendência "igual" à primeira do Merkagel (teste em `historico-pessoal.spec.ts`).
- ✅ Referência = menor preço em qualquer mercado nos 60 dias antes da emissão; posterior e
  própria nota não contam.
- ✅ Igual ou abaixo → "Seu melhor preço" / "Novo melhor preço", sem reduzir o resumo.
- ✅ Resumo "Comparado com seu melhor preço" com "R$ X a mais" e "Você poderia ter economizado".
- ✅ Só compras com mais de 60 dias → última compra como informação, fora do resumo; nunca
  comprado → "Primeira compra".
- ✅ Filtros Todos · Acima do melhor · Melhor preço · Primeira compra em `?itens=`; valor
  desconhecido cai em Todos.
- ✅ Destaques só com os acima, por impacto.
- ✅ Lista de notas com "R$ X a mais" ou "No melhor preço".
- ✅ Sugestão de compra sem regressão.
- ⚠️ `npm run lint`, `npm test` e build verdes; `npm run e2e` não executado (sem `.env.e2e`).
- ⚠️ Badges com ícone + texto ✅; axe em `/notas/:chave` depende do e2e logado (não executado).

---

## Arquivos Criados/Modificados

```
src/app/features/notas/detalhe/historico-pessoal.ts
src/app/features/notas/detalhe/historico-pessoal.spec.ts
src/app/features/notas/detalhe/historico-item.ts
src/app/features/notas/detalhe/nota-detalhe.page.ts
src/app/features/notas/detalhe/nota-detalhe.page.html
src/app/features/notas/detalhe/nota-detalhe.page.scss
src/app/features/notas/data-access/historico-pessoal.store.ts
src/app/features/notas/lista/notas-lista.page.ts
src/app/features/notas/lista/notas-lista.page.html
src/app/features/notas/lista/notas-lista.page.scss
src/app/features/notas/notas.spec.ts
src/index.html                      (ícone trending_flat)
e2e/notas-historico.spec.ts
e2e/a11y.spec.ts
CLAUDE.md
docs/analise/historico-precos-nota-analise.md
docs/plano/melhor-preco-recente-plano.md          (criado antes da execução)
docs/execucao/2026-09-30-melhor-preco-recente-plano.md
```
