# Execução: Painel inicial com gráficos e destaques

**Data:** 2026-10-25
**Plano:** [docs/plano/painel-inicial-plano.md](../plano/painel-inicial-plano.md)
**Branch:** main
**Executor:** Claude Code

---

## Resumo

O painel (`/`) passou a resumir um mês de referência (o atual com nota, senão o último mês com
nota) com gasto, variação contra o mesmo período do mês anterior, **saldo contra o melhor preço do
próprio usuário** (no lugar da "economia possível" da base comunitária) e ticket médio. As últimas
notas mostram o saldo de cada compra com o novo `<cp-saldo-nota>`, o mesmo da lista de notas. Entraram
o gráfico de gastos/saldo por mês em SVG próprio, "Onde você pagou mais / economizou", "Preços que
mais subiram", "Onde você gastou" e "Onde mais gasta". Tudo no cliente, sobre o cache do
`HistoricoPessoalStore`, sem Function, regra, índice ou escrita nova.

---

## Tarefas Executadas

| Fase | Tarefa | Status | Observações |
|------|--------|--------|-------------|
| 1.1 | `<cp-saldo-nota>` | ✅ | `shared/ui/saldo-nota/` com `grande` para o resumo; a lista de notas usa o componente e perdeu o `.notas-saldo` |
| 1.2 | `comparacoesDaJanela()` | ✅ | Tipos `NotaComparada` e `JanelaComparada`; cache ligado ao `indiceCompleto()` e zerado no `invalidar()`; spec confere que o resumo é igual ao de `resumir()` |
| 1.3 | Ícones e tokens | ✅ | Nada a acrescentar: todos os ícones usados já estavam no subset e as cores usam tokens existentes (`$cp-serie-1`, `$cp-pricier`, `$cp-cheaper`, `$cp-grafico-grade`) |
| 2.1 | Fixture de histórico curto | ✅ | `src/testing/fixtures/painel/notas.ts` (28/08, 28/09, 03/10; leite vinculado entre mercados, arroz `loc:` → `ean:`) |
| 2.2 | Mês de referência e variação | ✅ | + `somarMeses`, `inicioDoMes`, `filtroDoMes` (query params da lista); `economiaPotencial` removida |
| 2.3 | Resumo do período | ✅ | |
| 2.4 | Séries mensais | ✅ | |
| 2.5 | Gasto por mercado | ✅ | |
| 2.6 | Destaques do período | ✅ | |
| 2.7 | Preços que mais subiram | ✅ | |
| 2.8 | Onde mais gasta | ✅ | |
| 3.1 | `PainelStore` | ✅ | 6 meses com `BreakpointService.estreito`, 12 no largo |
| 4.1 | `<cp-resumo-mes>` | ✅ | Aviso "mostrando o último mês com compra" quando o mês atual não tem nota |
| 4.2 | `<cp-grafico-meses>` | ✅ | Barras como `<a>` no SVG, `role="group"` (ver discrepâncias), padrão listrado no mês parcial, linha da média |
| 4.3 | `<cp-gasto-por-mercado>` | ✅ | Link com o mês e o CNPJ; "Outros" leva às notas do mês |
| 4.4 | `<cp-destaques-precos>` | ✅ | Usa `<cp-badge-preco>` com `rotulo` (sem CSS de cor novo) |
| 4.5 | `<cp-precos-que-subiram>` e `<cp-onde-mais-gasta>` | ✅ | |
| 5.1 | `PainelPage` | ✅ | Erro no histórico vira `.cp-info-block--erro` com "Tentar de novo"; as últimas notas seguem |
| 6.1 | Specs da página | ✅ | `paginas-fase9.spec.ts`: 5 casos da página + 4 dos blocos |
| 6.2 | e2e e axe | ⚠️ | `e2e/painel.spec.ts` criado (fluxo e axe com os blocos `@defer` carregados); **pulado aqui** porque não há `.env.e2e` nesta máquina. `/` já estava no `a11y.spec.ts` |
| 6.3 | Budget, lint e contraste | ✅ | Bundle inicial 491,92 kB (abaixo de 500 kB), sem aviso de `anyComponentStyle`; chunk `painel-page` 19,46 kB |
| 6.4 | Validação com dados reais do dv | ⏳ | Dev server no ar, mas a sessão caiu no login; falta o usuário entrar no painel do navegador para conferir |
| 6.5 | `CLAUDE.md` | ✅ | Linha do painel reescrita |

---

## Discrepâncias do Plano

- **Gráfico com `role="group"`, não `role="img"`:** as barras são links. Dentro de `role="img"` os
  filhos ficam ocultos para leitor de tela e os links sumiriam. O SVG tem `aria-label`, cada barra
  tem nome acessível ("outubro (até hoje): R$ 35,47, ver notas") e a tabela `cp-sr-only` continua.
- **6 × 12 meses pelo `BreakpointService.estreito` (≤ 900 px):** o serviço só expõe essa consulta;
  não foi criada outra para o breakpoint `desktop`.
- **Desempates de ordenação removidos** em destaques, altas e "onde mais gasta": a ordem de entrada
  já é determinística e os ramos de desempate não eram alcançáveis (100 % de cobertura).
- **"Preços que mais subiram" usa `aceitas[0]` / `aceitas.at(-1)`** porque o índice já vem da compra
  mais recente para a mais antiga.
- **Spec antigo dos cálculos do painel** em `produtos.spec.ts` (que testava `economiaPotencial`) foi
  removido; `totalDe`/`variacao` passaram a ser testados em `painel.calculos.spec.ts`.
- **"Outros" em "Onde você gastou"** também é link (para as notas do mês, sem filtro de mercado).

---

## Análise de Lint

```
Linting "fed-catalogo-compara-precos"...
All files pass linting.
(stylelint sem erros)
```

`npm run contraste`: 55 pares aprovados em WCAG AA.

`npm test`: 49 arquivos, 733 testes verdes; `painel.calculos.ts` com 100 % (linhas, ramos e funções).

## Boas Práticas Angular

| Critério | Status |
|----------|--------|
| OnPush em todos os componentes | ✅ |
| inject() sem construtor | ✅ |
| takeUntilDestroyed() | ✅ (nenhuma subscription manual nova) |
| trackBy/track em @for | ✅ |
| loading="lazy" em imagens | ✅ (sem imagens novas) |
| Sem any implícito | ✅ |

---

## Critérios de Aceitação

- ✅ Últimas notas com "a mais" / "de economia" / "Saldo zerado" pelo mesmo componente da lista; nota sem comparação não mostra saldo.
- ✅ Saldo do mês com o líquido e as duas parcelas; é a soma dos `ResumoHistorico` das notas (mesmo cálculo da lista, conferido em spec).
- ✅ Nenhum número do painel usa `produto.menorPreco`, `precos` comunitário ou Menor Preço; `economiaPotencial` não existe mais.
- ✅ Mês sem nota mostra o último mês com nota, rotulado, sem seletor.
- ✅ Variação do mês em curso contra o mesmo período do anterior, dita no texto ("até o dia N").
- ✅ Gráfico: 6/12 meses, mês de referência em destaque, parcial listrado, média dos fechados, por compra com menos de 2 meses, barras levam à lista filtrada.
- ✅ Modo "Saldo" com barras para cima/baixo, legenda e rótulo com sinal.
- ✅ "Onde você gastou" com valor, % e nº de notas e link `/notas?cnpj=` (mais o mês).
- ✅ "Onde você pagou mais" / "Onde economizou" sobre as mesmas comparações dos cards das notas.
- ✅ "Preços que mais subiram" com 2 compras; some sem alta ≥ 5 % e ≥ R$ 0,10.
- ✅ "Onde mais gasta" soma o grupo vinculado numa linha.
- ✅ Erro no histórico só afeta os blocos dependentes; `versao` nova recarrega o painel.
- ⚠️ Acessibilidade: tabela equivalente e nomes acessíveis verificados em spec; axe no e2e escrito mas não executado (sem `.env.e2e`).
- ✅ Bundle inicial sem aumento relevante (491,92 kB) e sem biblioteca de gráfico nova.
- ✅ `npm run lint` e `npm test` verdes; ⚠️ `npm run e2e` pula os testes logados sem `.env.e2e`.
- ⏳ Conferência no dv com os dados reais (celular e desktop).

---

## Arquivos Criados/Modificados

```
CLAUDE.md
docs/analise/painel-inicial-analise.md                (novo)
docs/plano/painel-inicial-plano.md                    (novo)
e2e/painel.spec.ts                                    (novo)
src/app/shared/ui/saldo-nota/saldo-nota.ts|scss|spec  (novos)
src/app/features/notas/data-access/historico-pessoal.store.ts
src/app/features/notas/lista/notas-lista.page.html|scss|ts
src/app/features/notas/notas.spec.ts
src/app/features/painel/painel.calculos.ts
src/app/features/painel/painel.calculos.spec.ts       (novo)
src/app/features/painel/painel.store.ts|spec.ts       (novos)
src/app/features/painel/painel.page.html|scss|ts
src/app/features/painel/paginas-fase9.spec.ts
src/app/features/painel/ui/resumo-mes.ts|scss         (novos)
src/app/features/painel/ui/grafico-meses.ts|html|scss (novos)
src/app/features/painel/ui/gasto-por-mercado.ts|scss  (novos)
src/app/features/painel/ui/destaques-precos.ts        (novo)
src/app/features/painel/ui/precos-que-subiram.ts      (novo)
src/app/features/painel/ui/onde-mais-gasta.ts         (novo)
src/app/features/produtos/produtos.spec.ts
src/testing/fixtures/painel/notas.ts                  (novo)
```
