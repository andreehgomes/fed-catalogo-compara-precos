# Execução: Sugestão de compra

**Data:** 2026-09-29
**Plano:** [docs/plano/sugestao-compra-plano.md](../plano/sugestao-compra-plano.md)
**Branch:** main
**Executor:** Claude Code

---

## Resumo

Nova tela `/sugestoes` ("Sugestão de compra") que prevê, a partir das notas do próprio usuário,
o que ele costuma recomprar: seções "Hora de repor", "Em breve", "Outras sugestões" (confiança
baixa) e "Parou de comprar?", quantidade habitual e três preços que ele pagou (último, mais
barato e mais caro). Há duas visões, "Lista completa" e "Por mercado" (onde cada item saiu mais
barato e "Um mercado só"), além de "Já tenho", "Não sugerir mais", copiar/compartilhar e o card
"Hora de repor" no painel. Tudo roda no cliente, sobre o cache do `HistoricoPessoalStore`, sem
ler `precos`, sem Menor Preço, sem Functions e sem escrita no Firestore.

---

## Tarefas Executadas

| Fase | Tarefa | Status | Observações |
|------|--------|--------|-------------|
| 1.1 | `baseComum` e `unidadeNormalizada` exportadas | ✅ | `escolherBase` reaproveita `mesmaUnidadeQue`/`porUnidadeBase`; specs antigos verdes + 5 casos novos |
| 1.2 | `indiceCompleto()` e `gruposDe(ids)` | ✅ | Resultado memoizado por leitura de notas; resolve só `loc:` e ids em ≥ 2 notas; `versao` (signal) muda no `invalidar()` |
| 1.3 | Token `RELOGIO` | ✅ | `src/app/core/relogio.ts` |
| 1.4 | `DispensadosService` + limpeza no `sair()` | ✅ | `linkedSignal` por `uid`; `PREFIXO_DISPENSADOS` e `limparDispensados()` em `auth.store.ts` |
| 1.5 | Rota, menu e ícones | ✅ | `event_repeat`, `more_vert`, `share`, `visibility_off` em `icon_names=` |
| 2.1 | Tipos e constantes | ✅ | Mais `HORIZONTES`, `VisaoSugestao`, `QuantidadeSugerida`, `PrecoPago`, `ItemDaLista`, `ItemNoMercado` |
| 2.2 | Ocasiões, ciclo, estado, confiança | ✅ | Também `mediana`, `intervalos` |
| 2.3 | Quantidade sugerida | ✅ | |
| 2.4 | Faixa de preço e último por mercado | ✅ | + `precoNaQuantidade` |
| 2.5 | `sugerir` | ✅ | + `contarRecorrentes` (estado "insuficiente") |
| 2.6 | Totais, agrupamento, cestas e texto | ✅ | Texto conferido por igualdade exata (sem arquivo de snapshot) |
| 2.7 | Fixture sintética | ✅ | `src/testing/fixtures/sugestao/{notas,produtos}.ts` |
| 3.1 | `SugestoesStore` | ✅ | `resource` com `uid` + `versao`; seleção reinicia ao trocar o horizonte e guarda as escolhas quando só a lista muda |
| 4.1 | `<cp-faixa-preco>` | ✅ | |
| 4.2 | `<cp-sugestao-item>` | ✅ | Quantidade como `model()` (`quantidadeChange`); ações em `mat-menu` |
| 4.3 | `<cp-lista-completa>` | ✅ | |
| 4.4 | `<cp-por-mercado>` | ✅ | |
| 5.1 | Página `/sugestoes` | ✅ | |
| 5.2 | FAB oculto em `/sugestoes` | ✅ | Regex do `mostrarFab` em `shell.ts` (sem mudança no `shell.html`) |
| 6.1 | `<cp-hora-de-repor>` no painel | ✅ | `@defer (on viewport)` depois das últimas notas |
| 7.1 | Specs de página | ✅ | `sugestoes.spec.ts` com `FIRESTORE_API` fake, `RELOGIO` fixo e `RouterTestingHarness` |
| 7.2 | e2e | ⚠️ | `e2e/sugestoes.spec.ts` e `/sugestoes` no axe escritos; **pulados** aqui por falta do `.env.e2e` |
| 7.3 | Lint, contraste, build, budgets | ✅ | Sem aviso de budget |
| 7.4 | Verificação no navegador (dv) | ❌ | Não feita: exige login no Firebase do dv, que o agente não faz. Ver "Pendências" |
| 7.5 | CLAUDE.md | ✅ | Rota, item do shell, FAB e seção "Sugestão de compra" |

---

## Discrepâncias do Plano

- **`FaixaDePreco` sem `null`:** o plano previa `maisBarato`/`maisCaro` nulos "sem base". Pela
  regra de `baseComum`, a compra mais recente sempre é aceita pela própria base, então a faixa
  sempre existe (no mínimo com o último pago). Os campos são `PrecoPago` (compra + valor na base)
  e a faixa ganhou `sufixo` ("/un", "/L"…). "Sempre R$ X" aparece quando mais barato = mais caro.
- **`baseComum`:** entre `vlUnit` e R$/unidade base, fica a que aceita mais compras (empate →
  `vlUnit`). Assim, detergente 1 L × 500 mL compara em R$/L, e o granel continua em `vlUnit`.
- **Totais:** em vez de converter a quantidade para a base da faixa, cada preço é convertido para
  a unidade da quantidade sugerida (`precoNaQuantidade`: R$/kg·L·un quando a quantidade está na
  base, `vlUnit` quando está na unidade comercial). O resultado é o mesmo e item não conversível
  fica fora das somas.
- **`ciclo`:** a mediana não é arredondada (a tela mostra arredondado); intervalos em dias
  inteiros; `diasDesdeUltima` é arredondado para baixo.
- **Store:** além do que o plano listava, `HistoricoPessoalStore.versao` (signal) faz o
  `SugestoesStore` recarregar depois de `invalidar()` (RF-18), e o `resource` fica ocioso sem
  `uid`.
- **Seleção:** o `linkedSignal` reinicia quando o horizonte muda (como no plano); quando só a lista
  muda (ex.: "Já tenho"), as escolhas dos outros itens são mantidas.
- **Ícone extra:** `more_vert` (botão do menu de ações do item).
- **Spec do painel:** o card é testado isolado (`HoraDeRepor` com store fake: 5 itens, vazio e
  erro) dentro de `sugestoes.spec.ts`, não no spec da página do painel.
- **Snapshot:** o texto de "Copiar lista" é conferido por igualdade com a string esperada, porque
  o builder do Angular não grava snapshots.
- **`main`:** cresceu 0,31 kB (248,64 → 248,95 kB) pela constante do prefixo e pelo
  `limparDispensados()` no `auth.store.ts`, que o próprio plano põe no `sair()`. O initial total
  foi de 484,05 para 485,05 kB. Regra, store, página e card estão em chunks lazy.

---

## Análise de Lint

```
npm run lint
All files pass linting.   (ng lint + stylelint, 0 erros)
```

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

## Verificações

- `npm run test:ci`: **32 arquivos, 418 testes, todos verdes.** `sugestao.ts` e
  `dispensados.service.ts` com 100 %. `sugestoes.store.ts` tem 100 % de linhas.
- `npm run contraste`: 55 pares aprovados (nenhum token novo).
- `ng build --configuration=production`: ok, sem aviso de budget (`initial` 485,05 kB;
  `anyComponentStyle` sem aviso).
- `npm run e2e`: 23 passaram, 41 pulados (todos os testes logados, inclusive o novo
  `sugestoes.spec.ts` e o axe de `/sugestoes`, porque não há `.env.e2e` nesta máquina).
- Navegador: `/sugestoes` sem sessão redireciona para `/login?voltar=%2Fsugestoes` (rota e guard
  ok). Não houve verificação logada.

---

## Critérios de Aceitação

- ✅ "Sugestão de compra" aparece no menu e abre `/sugestoes` com rota lazy. O `main` só ganhou
  0,31 kB do `limparDispensados` (ver Discrepâncias).
- ✅ Produto com ≥ 3 ocasiões e ciclo vencido aparece em "Hora de repor" com o texto do ciclo;
  0,8 ≤ atraso < 1 ou dentro do horizonte → "Em breve"; atraso > 3 → "Parou de comprar?".
- ✅ Compras a menos de 2 dias → uma ocasião; `loc:` vinculados formam uma série; ciclo > 120
  dias e 1 ocasião ficam fora.
- ✅ Quantidade = mediana das ocasiões, em unidade base quando possível.
- ✅ Último pago, mais barato e mais caro só das compras do usuário, com data e mercado; iguais →
  "Sempre R$ X".
- ✅ "Lista completa" com os totais e a diferença; desmarcar ou mudar a quantidade recalcula.
- ✅ "Por mercado" só com mercados onde o usuário comprou (último preço em cada um); todo item
  num grupo; "um mercado só" por cobertura.
- ✅ Horizonte e visão em query params (spec da página; o recarregamento está no e2e, que não
  rodou logado).
- ✅ "Já tenho" até o próximo ciclo ou nova compra; "Não sugerir mais" até "Voltar a sugerir";
  por `uid`, persiste ao remontar e é apagado no "Sair".
- ✅ "Copiar lista" copia o texto da visão atual; "Compartilhar" só com `navigator.share`.
- ✅ Histórico insuficiente → estado vazio com "Importar nota"; erro → "Tentar de novo".
- ✅ Painel mostra "Hora de repor" (até 5) com link e some sem sugestão ou com erro.
- ✅ Abrir `/sugestoes` depois do detalhe de uma nota não relê as notas (spec).
- ✅ Nenhuma escrita, nenhuma leitura de `precos`, nenhuma callable (spec com o fake de `getDocs`
  e de `CHAMAR_FUNCTION`).
- ⚠️ Mobile sem sobreposição com o FAB: o FAB some em `/sugestoes` (spec do shell). Falta o
  screenshot em 375 px logado.
- ⚠️ Axe em `/sugestoes`: incluído no `a11y.spec.ts`, mas não rodou (sem usuário de teste).
  Estados e badges têm ícone + texto.
- ⚠️ `lint`, `test:ci` (100 % em `sugestao.ts`), `contraste` e build verdes; `e2e` verde só nos
  testes sem login.

---

## Pendências (usuário)

1. Criar o `.env.e2e` (ou rodar no CI com os secrets) e rodar `npm run e2e` para executar
   `e2e/sugestoes.spec.ts` e o axe de `/sugestoes`.
2. Tarefa 7.4: com `npm start` e o usuário de teste, abrir `/sugestoes` em desktop e 375 px e
   conferir os três preços de um item contra as notas, a visão "Por mercado", o FAB e a aba
   de rede (sem `precos`, Menor Preço ou Functions).

---

## Arquivos Criados/Modificados

```
CLAUDE.md                                                    (M)
e2e/a11y.spec.ts                                             (M)
e2e/sugestoes.spec.ts                                        (novo)
src/index.html                                               (M)
src/app/app.routes.ts                                        (M)
src/app/core/relogio.ts                                      (novo)
src/app/core/auth/auth.store.ts                              (M)
src/app/core/auth/auth.store.spec.ts                         (M)
src/app/core/layout/shell.ts                                 (M)
src/app/core/layout/shell.spec.ts                            (M)
src/app/features/notas/data-access/historico-pessoal.store.ts (M)
src/app/features/notas/detalhe/historico-pessoal.ts          (M)
src/app/features/notas/detalhe/historico-pessoal.spec.ts     (M)
src/app/features/notas/notas.spec.ts                         (M)
src/app/features/painel/hora-de-repor.ts                     (novo)
src/app/features/painel/painel.page.html                     (M)
src/app/features/painel/painel.page.ts                       (M)
src/app/features/sugestoes/sugestoes.routes.ts               (novo)
src/app/features/sugestoes/sugestao.ts                       (novo)
src/app/features/sugestoes/sugestao.spec.ts                  (novo)
src/app/features/sugestoes/sugestoes.page.ts|html|scss       (novo)
src/app/features/sugestoes/sugestoes.spec.ts                 (novo)
src/app/features/sugestoes/data-access/dispensados.service.ts      (novo)
src/app/features/sugestoes/data-access/dispensados.service.spec.ts (novo)
src/app/features/sugestoes/data-access/sugestoes.store.ts          (novo)
src/app/features/sugestoes/data-access/sugestoes.store.spec.ts     (novo)
src/app/features/sugestoes/ui/faixa-preco.ts|scss            (novo)
src/app/features/sugestoes/ui/sugestao-item.ts|scss          (novo)
src/app/features/sugestoes/ui/lista-completa.ts              (novo)
src/app/features/sugestoes/ui/por-mercado.ts|scss            (novo)
src/testing/fixtures/sugestao/notas.ts                       (novo)
src/testing/fixtures/sugestao/produtos.ts                    (novo)
docs/execucao/2026-09-29-sugestao-compra-plano.md            (novo)
```

Alterações que já estavam no working tree antes da execução (`historico-item.ts`, partes de
`historico-pessoal.ts`/`.spec.ts` e `notas.spec.ts` sobre "menor preço nesta compra") foram
mantidas. `.github/workflows/deploy.yml` aparece modificado, mas não foi tocado nesta execução.

---

## Ajuste pós-execução (2026-09-29)

Com os dados reais do dv (4 notas entre 28/08 e 28/09; 14 produtos comprados em 28/08 e 26/09),
a tela ficava vazia em todos os horizontes: nada vencia em 15 dias, e no mês os 14 itens tinham
confiança baixa e ficavam escondidos em "Outras sugestões", fora da seleção e dos totais.

- Novo horizonte **"Próximo mês"** (`mes`, 30 dias).
- Confiança baixa entra em "Hora de repor"/"Em breve", selecionada, com "estimativa com N
  compras" (a seção "Outras sugestões" saiu; diverge do RF-05 da análise).
- Período sem nada: sem totais nem ações, com o botão "Ver o próximo mês (N itens)".
- Conferido no navegador com o usuário logado: "Próximo mês" lista os 14 itens (R$ 294,55).
- `npm run test:ci`: 419 testes verdes; lint ok.
