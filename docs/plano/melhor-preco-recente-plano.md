# Plano de Desenvolvimento: Comparação com o seu melhor preço recente

**Data:** 30/09/2026
**Projeto:** fed-catalogo-compara-precos
**Análise base:** [historico-precos-nota-analise.md](../analise/historico-precos-nota-analise.md)
(esta mudança substitui a decisão **D-02**, ver Tarefa 4.3)
**Branch alvo:** `main`

---

## Visão Geral

Hoje o detalhe da nota (`/notas/:chave`) compara cada item com a **última compra anterior**
(`compararItem` em `src/app/features/notas/detalhe/historico-pessoal.ts`). Isso esconde quanto
o usuário deixou de economizar. Exemplo real: Coca-Cola 2L Zero a R$ 10,00 no Box Atacadista,
depois R$ 11,00 duas vezes no Merkagel. A segunda nota do Merkagel mostra "Mesmo preço", porque
a referência passou a ser a primeira compra no Merkagel, e os R$ 10,00 do Box somem.

A comparação principal passa a ser contra o **seu melhor preço recente**: o menor valor que o
usuário pagou pelo mesmo produto/grupo, **em qualquer mercado**, numa **janela móvel de 60 dias
antes da emissão da nota**. O item mostra onde e quando foi esse preço. Quem pagou acima vê
"R$ X acima do seu melhor preço", e esse valor (diferença × quantidade) entra no resumo como
**"você poderia ter economizado"**. Quem pagou igual ou abaixo ganha o selo **"Seu melhor
preço"** (ou "Novo melhor preço", quando ficou abaixo), que **não** conta como economia no
resumo. A comparação com a última vez continua como informação secundária de tendência
("Última vez R$ 11,00 · 25/09 · Merkagel · igual").

Os dados não mudam: as mesmas notas de 12 meses já carregadas pelo `HistoricoPessoalStore`.
Nada é gravado, não há Function nova, `firestore.rules` não muda e o Menor Preço não é chamado.
O trabalho fica na regra pura, no `<cp-historico-item>`, no detalhe da nota, no saldo da lista
de notas e nos testes.

No exemplo: as duas notas do Merkagel mostram "R$ 1,00 acima do seu melhor preço (R$ 10,00 ·
20/09 · Box Atacadista)". A segunda acrescenta "Última vez R$ 11,00 · igual".

---

## Convenções Obrigatórias

- Standalone, **OnPush** explícito, **zoneless**; `inject()`; `input()`/`output()`.
- Estado em signals (`computed`, `resource`); nenhum estado novo fora do que já existe.
- `@for` sempre com `track`; destaques continuam em `@defer (on viewport)`.
- Regra de negócio em **função pura** (`historico-pessoal.ts`), sem Angular/Firebase, testada
  isolada com a fixture `src/testing/fixtures/notas-historico/`.
- Data de referência da janela = `nota.emissao` (parâmetro), **nunca** `new Date()`: reabrir uma
  nota antiga dá sempre o mesmo resultado.
- Cliente não escreve no Firestore. Sem Emulator Suite. Sem `vi.mock` de Firebase.
- Estilo: classe global primeiro; badge sempre ícone + texto (`<cp-badge-preco>` com `rotulo`);
  cor só por token `$cp-*`. Budget `anyComponentStyle` 6 kB.
- Ícone novo → `icon_names=` do `src/index.html`, em ordem alfabética.
- Textos da UI em pt-BR no template. Sem comentários além de invariantes não óbvias.
- e2e com `getByRole`/`getByLabel`.

---

## Regras (referência para todas as tarefas)

- **R-1 Janela:** candidatas = compras do mesmo grupo com `emissao` em
  `[nota.emissao − 60 dias, nota.emissao)` e `chave ≠ nota.chave`. Constante
  `JANELA_MELHOR_PRECO_DIAS = 60`.
- **R-2 Base:** ancorada no **item da nota**. `vlUnit` aceita as candidatas com a mesma unidade
  comercial e conteúdo compatível (`mesmaUnidadeQue(item)`); R$/unidade base aceita as que têm
  `porUnidade` na mesma unidade base do item **e** o item tem `quantidadeNaUnidadeBase`. Vence a
  base que aceita **mais** candidatas da janela (empate → `vlUnit`), como em `baseComum`.
- **R-3 Melhor preço:** menor `base.valor` entre as candidatas aceitas; no empate, a **mais
  recente** (mostra a data mais útil).
- **R-4 Classificação** (tolerância `CENTAVO`):
  - `acima`: atual > melhor → `diferenca` = atual − melhor, `impacto` = diferença × quantidade
    na base (> 0).
  - `melhor`: atual ≤ melhor + CENTAVO → `impacto` 0; `novoMelhor = atual < melhor − CENTAVO`.
- **R-5 Tendência (secundária):** a última compra anterior (qualquer data dentro dos 12 meses).
  Se a base escolhida a aceita: `ultima = { compra, valor, tendencia: 'subiu'|'baixou'|'igual',
  diferenca }`; senão `ultima = null`.
- **R-6 Sem compra na janela:**
  - nenhuma compra anterior → `primeira-compra` (como hoje);
  - há compras anteriores, mas nenhuma nos 60 dias → `sem-recente` (mostra a última compra como
    informação, **fora** do resumo);
  - há compras na janela, mas nenhuma base as aceita → `sem-comparacao` (como hoje).
- **R-7 Resumo:** `aMais` = Σ `impacto` dos itens `acima` ("poderia ter economizado");
  `itensAcima`, `itensNoMelhor` (inclui novos melhores), `comparados` (`acima` + `melhor`),
  `total`. **Sem** `aMenos`/`saldo`: pagar abaixo não vira economia.

---

## Fases de Implementação

### Fase 1 — Regra pura

**Objetivo:** `compararItem` passa a devolver a comparação com o melhor preço recente, com a
tendência como campo secundário.

#### Tarefa 1.1 — Novos tipos

**Arquivo(s):** `src/app/features/notas/detalhe/historico-pessoal.ts`

**O que fazer:** substituir `ComparacaoComValores` e `ComparacaoHistorico`:

```ts
export const JANELA_MELHOR_PRECO_DIAS = 60;

export interface Tendencia {
  compra: CompraPessoal;
  valor: number;
  tendencia: 'subiu' | 'baixou' | 'igual';
  /** Atual − última, por unidade da base, com sinal. */
  diferenca: number;
}

export interface ComparacaoComValores {
  tipo: 'acima' | 'melhor';
  base: BaseComparacao;
  /** Compra do melhor preço na janela. */
  referencia: CompraPessoal;
  valorAtual: number;
  melhor: number;
  /** ≥ 0; 0 quando `melhor`. */
  diferenca: number;
  percentual: number;
  /** Diferença × quantidade desta nota; 0 quando `melhor`. */
  impacto: number;
  novoMelhor: boolean;
  ultima: Tendencia | null;
  /** Menor dos 12 meses (contando esta compra), média e vezes das anteriores: só na expansão. */
  menor: number;
  media: number;
  vezes: number;
  compras: CompraPessoal[];
}

export type ComparacaoHistorico =
  | { tipo: 'primeira-compra' }
  | { tipo: 'sem-recente'; ultima: CompraPessoal; compras: CompraPessoal[] }
  | { tipo: 'sem-comparacao'; compras: CompraPessoal[] }
  | ComparacaoComValores;
```

`comValores` aceita `acima | melhor`. `sufixoDaBase` não muda: continua recebendo
`{ base, referencia }`, e a `sugestao.ts` segue funcionando.

**Critério:** `npm run lint` e o typecheck apontam só os consumidores das próximas tarefas.

#### Tarefa 1.2 — `compararItem` com janela, base ancorada e tendência

**Arquivo(s):** `historico-pessoal.ts`

**O que fazer:**
- `compararItem(item, nota, compras)` mantém a assinatura (o `nota.emissao` já está lá).
- `anteriores` = filtro atual (`emissao < nota.emissao && chave ≠ nota.chave`), ordenadas como
  hoje (mais recente primeiro). Vazia → `primeira-compra`.
- `naJanela` = `anteriores` com `emissao ≥ inicioJanela(nota.emissao)`; vazia →
  `{ tipo: 'sem-recente', ultima: anteriores[0], compras: anteriores.slice(0, 5) }`.
- Trocar `escolherBase(item, ref)` por `baseDoItem(item, candidatas)` (R-2), devolvendo
  `Base | null` (com `quantidade`). Reaproveita `mesmaUnidadeQue`, `porUnidadeBase` e
  `quantidadeNaUnidadeBase`; `null` → `sem-comparacao`.
- Melhor (R-3), classificação (R-4), tendência (R-5) sobre `anteriores[0]` com `base.aceita`.
- `menor`/`media`/`vezes` continuam sobre **todas** as anteriores aceitas pela base (expansão).
- `inicioJanela(emissao)`: subtrai 60 dias em ms de `Date.parse(emissao)` e devolve ISO, para
  comparar strings como o resto do arquivo.

**Critério:** os testes da Tarefa 3.1 passam.

#### Tarefa 1.3 — Resumo, destaques e filtros

**Arquivo(s):** `historico-pessoal.ts`

**O que fazer:**
- `ResumoHistorico` → `{ aMais, itensAcima, itensNoMelhor, itensNovoMelhor, comparados, total }`;
  `resumirHistorico` soma conforme R-7.
- `destaques(r)` → `number[]` dos itens `acima`, por `impacto` desc (desempate `n`). Os "novos
  melhores" não viram destaque (só selo na linha).
- `FiltroHistorico` = `'todos' | 'acima' | 'melhor' | 'primeira'`. `passa`: `acima` → tipo
  `acima`; `melhor` → tipo `melhor`; `primeira` → `primeira-compra`. Valor antigo na URL
  (`subiram`/`baixaram`) cai em `todos` pela checagem que já existe na página.

**Critério:** `contarPorFiltro` e `filtrarItens` cobertos na Tarefa 3.1.

### Fase 2 — Telas

**Objetivo:** a nota e a lista de notas falam em "melhor preço recente" e "poderia ter
economizado".

#### Tarefa 2.1 — Linha do item (`<cp-historico-item>`)

**Arquivo(s):** `src/app/features/notas/detalhe/historico-item.ts`

**O que fazer:**
- `acima`: `<cp-badge-preco tipo="mais-caro" [rotulo]="'R$ X acima do seu melhor'">` (valor =
  `impacto` formatado com `CurrencyPipe` no componente ou um `@let`) + texto
  "Seu melhor em 60 dias: {{ melhor }}{{ sufixo }} ({{ dd/MM }} · {{ mercado }}) · +{{ diferenca
  }}{{ sufixo }} (+{{ percentual }} %)".
- `melhor`: badge `tipo="igual"` com rótulo "Seu melhor preço"; `novoMelhor` → `tipo="mais-barato"`
  com rótulo "Novo melhor preço" e texto "antes {{ melhor }} ({{ dd/MM }} · {{ mercado }})".
  Quando a referência é a própria loja e o preço é igual, o texto diz só "igual a {{ dd/MM }}".
- Tendência (`ultima`, se houver e se a compra **não** for a mesma da `referencia`): linha
  discreta "Última vez {{ valor }} ({{ dd/MM }} · {{ mercado }}) · subiu/baixou/igual
  {{ diferenca }}", com ícone `trending_up`/`trending_down`/`trending_flat` (acrescentar
  `trending_flat` no `icon_names=` se ainda não estiver).
- `sem-recente`: "Última compra há mais de 60 dias: {{ vlUnit }} ({{ dd/MM/yy }} · {{ mercado }})",
  estilo neutro, com "Ver compras".
- Expansão: mantém lista, "Menor preço nos últimos 12 meses" (texto ajustado) e média.

**Critério:** no spec da Tarefa 3.2, os quatro estados aparecem com os textos acima; o badge
tem ícone + texto.

#### Tarefa 2.2 — Resumo, destaques e filtro no detalhe da nota

**Arquivo(s):** `nota-detalhe.page.ts`, `nota-detalhe.page.html`, `nota-detalhe.page.scss`

**O que fazer:**
- Resumo (`.historico-resumo`): rótulo **"Comparado com seu melhor preço"**.
  - `aMais > 0`: valor "{{ aMais }} a mais", com `trending_up` e a cor de mais caro; detalhe
    "Você poderia ter economizado {{ aMais }} em {{ itensAcima }} itens · {{ itensNoMelhor }} no
    seu melhor preço · {{ comparados }} de {{ total }} comparados · últimos 60 dias".
  - `aMais = 0` e `comparados > 0`: "No seu melhor preço" com `check`.
  - `comparados = 0`: "Sem compras recentes desses produtos".
- `ROTULOS_FILTRO`: Todos · Acima do melhor · Melhor preço · Primeira compra.
- `gruposDestaque` → um grupo só, "Pagou acima do seu melhor preço", item com
  "{{ valorAtual }} · seu melhor {{ melhor }} ({{ mercado }})" e badge com o `impacto`.
  Remover `TipoDestaque`/`alternarDestaques` por tipo se sobrar só um grupo (um `signal<boolean>`).
- Remover o CSS que ficar sem uso (`historico-saldo--mais-barato`, se for o caso).

**Critério:** spec da Tarefa 3.2; budget de estilo do componente sem aviso novo no build.

#### Tarefa 2.3 — Saldo na lista de notas

**Arquivo(s):** `src/app/features/notas/lista/notas-lista.page.ts`, `.html`

**O que fazer:** `saldos` passa a usar `aMais`. `> 0` → "R$ X a mais" (`trending_up`);
`= 0` com `comparados > 0` → "No melhor preço" (`check`). Some o "de economia".
Comentário do `resumos` atualizado ("contra o melhor preço recente").

**Critério:** spec da lista (`notas.spec.ts`, "mostra o saldo de cada nota…") atualizado e verde.

### Fase 3 — Testes

#### Tarefa 3.1 — Regra pura

**Arquivo(s):** `historico-pessoal.spec.ts`, `src/testing/fixtures/notas-historico/` (se
precisar de nota nova)

**O que fazer:** reescrever o `describe('compararItem')` e o bloco da fixture:
- **Cenário do usuário:** Box 10,00 (20/09) → Merkagel 11,00 (25/09) → Merkagel 11,00 (29/09),
  mesmo grupo. As duas do Merkagel: `acima`, `melhor` 10, `referencia` = Box, `impacto` =
  1 × qtd; a segunda com `ultima.tendencia = 'igual'`.
- Compra 61 dias antes mais barata **não** conta; 59 dias conta (limite da janela).
- Abaixo do melhor → `melhor` + `novoMelhor`, `impacto` 0, `ultima.tendencia = 'baixou'`.
- Igual ao melhor (± meio centavo) → `melhor`, `novoMelhor` false.
- Empate de melhor preço → referência mais recente.
- Só compras com mais de 60 dias → `sem-recente` com a última.
- Base ancorada no item: 2L × 3L por R$/L; UN × KG sem conteúdo → `sem-comparacao`; base que
  aceita mais candidatas vence.
- Compra posterior à nota e a própria nota não contam (testes atuais mantidos).
- `resumirHistorico`: `aMais` soma só `acima`; novos melhores não reduzem nada.
- `destaques`, `filtrarItens` e `contarPorFiltro` com os novos filtros.

**Critério:** `ng test --include='**/historico-pessoal.spec.ts'` verde, cobertura do arquivo
igual ou maior que a atual.

#### Tarefa 3.2 — Componentes

**Arquivo(s):** `src/app/features/notas/notas.spec.ts`

**O que fazer:** atualizar `NotaDetalhePage: comparado com a última vez` (renomear o describe),
o teste da linha do item e o saldo da lista para os novos textos e somas da fixture.

**Critério:** `npm test` verde.

#### Tarefa 3.3 — e2e

**Arquivo(s):** `e2e/notas-historico.spec.ts`, `e2e/a11y.spec.ts`

**O que fazer:** trocar o filtro de status para "Comparado com seu melhor preço", o texto
alternativo do resumo para `/comparados|Sem compras recentes/`, o botão `Subiram` →
`Acima do melhor` (e o `?itens=acima` na URL).

**Critério:** `npm run e2e` verde (com `.env.e2e`).

### Fase 4 — Documentação

#### Tarefa 4.1 — CLAUDE.md

**Arquivo(s):** `CLAUDE.md`, seção **Minhas notas**

**O que fazer:** trocar o item "Comparado com a última vez" por: referência = menor preço do
usuário em qualquer mercado nos 60 dias antes da emissão (`JANELA_MELHOR_PRECO_DIAS`), base
ancorada no item, resumo = "poderia ter economizado" (só itens acima), selo "Seu melhor preço"
fora do resumo, última compra só como tendência, `sem-recente` além de 60 dias.

#### Tarefa 4.2 — Sugestão de compra

**Arquivo(s):** nenhum, só conferência.

**O que fazer:** confirmar que `sugestao.ts` só usa `baseComum`, `sufixoDaBase` e
`CompraPessoal` (não depende de `compararItem`). Se algum teste de sugestões quebrar, é efeito
colateral a investigar, não algo a ajustar no texto.

#### Tarefa 4.3 — Análise

**Arquivo(s):** `docs/analise/historico-precos-nota-analise.md`

**O que fazer:** marcar **D-02** como substituída e acrescentar **D-03 — Referência = melhor
preço do usuário nos 60 dias anteriores (decidido pelo usuário em 2026-09-30)**, com o exemplo
Box/Merkagel e o motivo (a última compra apaga a referência boa; o mês do calendário tem corte
artificial; a janela móvel resolve os dois). Ajustar RF-03, RF-04, RF-06 e RF-07 para o
texto novo.

---

## Estrutura Final de Arquivos

```
src/app/features/notas/
├── detalhe/
│   ├── historico-pessoal.ts            (Fase 1: tipos, compararItem, resumo, destaques, filtros)
│   ├── historico-pessoal.spec.ts       (Fase 3.1)
│   ├── historico-item.ts               (Fase 2.1)
│   ├── nota-detalhe.page.ts            (Fase 2.2)
│   ├── nota-detalhe.page.html          (Fase 2.2)
│   └── nota-detalhe.page.scss          (Fase 2.2, só limpeza)
├── lista/
│   ├── notas-lista.page.ts             (Fase 2.3)
│   └── notas-lista.page.html           (Fase 2.3)
└── notas.spec.ts                       (Fase 3.2)
src/testing/fixtures/notas-historico/   (Fase 3.1, se precisar de nota nova)
src/index.html                          (Fase 2.1, se faltar `trending_flat`)
e2e/notas-historico.spec.ts             (Fase 3.3)
e2e/a11y.spec.ts                        (Fase 3.3)
CLAUDE.md                               (Fase 4.1)
docs/analise/historico-precos-nota-analise.md (Fase 4.3)
```

---

## Ordem de Execução Recomendada

```
1.1 tipos ──► 1.2 compararItem ──► 1.3 resumo/destaques/filtros ──► 3.1 spec da regra
                                                │
                    ┌───────────────────────────┼──────────────────────┐
                    ▼                           ▼                      ▼
             2.1 historico-item         2.2 detalhe da nota     2.3 lista de notas
                    └───────────────────────────┼──────────────────────┘
                                                ▼
                                   3.2 specs de componente ──► 3.3 e2e
                                                ▼
                                   4.1 CLAUDE.md · 4.2 conferir sugestões · 4.3 análise
```

---

## Critérios de Aceitação Globais

- [ ] Cenário Box 10,00 → Merkagel 11,00 → Merkagel 11,00: as duas notas do Merkagel mostram
      "R$ 1,00 acima do seu melhor" com "R$ 10,00 · 20/09 · Box Atacadista"; a segunda mostra
      também "Última vez R$ 11,00 · igual".
- [ ] A referência é o menor preço pago em **qualquer mercado** nos 60 dias **antes da emissão**
      da nota; compra posterior e a própria nota não contam; reabrir a nota depois não muda o
      resultado.
- [ ] Item com preço igual ou abaixo do melhor recente mostra o selo "Seu melhor preço" ou
      "Novo melhor preço" e **não** reduz o valor do resumo.
- [ ] Resumo da nota: "Comparado com seu melhor preço" com "R$ X a mais" e "Você poderia ter
      economizado R$ X em N itens", igual à soma manual dos impactos.
- [ ] Item comprado só há mais de 60 dias mostra a última compra como informação e fica fora do
      resumo; nunca comprado mostra "Primeira compra".
- [ ] Filtros Todos · Acima do melhor · Melhor preço · Primeira compra, em `?itens=`; valor
      antigo na URL cai em Todos.
- [ ] Destaques listam só os itens acima do melhor, por impacto.
- [ ] Lista de notas mostra "R$ X a mais" ou "No melhor preço"; não aparece mais "de economia".
- [ ] Sugestão de compra sem regressão (`sugestao.spec.ts` verde sem alteração).
- [ ] `npm run lint`, `npm test`, `npm run e2e` e `ng build --configuration=production` verdes,
      sem aviso novo de budget.
- [ ] Badges com ícone + texto; axe sem violações em `/notas/:chave`.
