# Plano de Desenvolvimento: Painel inicial com gráficos e destaques

**Data:** 25/10/2026
**Projeto:** fed-catalogo-compara-precos (Cupom Esperto)
**Análise base:** [painel-inicial-analise.md](../analise/painel-inicial-analise.md)
**Branch alvo:** `main`

---

## Visão Geral

O painel (`/`) passa a resumir um **mês de referência**: o mês atual quando já tem nota, ou o último
mês com nota, com o nome do mês, para não ficar zerado antes da compra mensal (D-03). O resumo mostra
o **gasto** (variação contra o mesmo período do mês anterior), o **saldo contra o melhor preço do
próprio usuário** (no lugar da "economia possível" da base comunitária, D-02) e o **ticket médio**.
As **últimas notas** ganham o saldo de cada compra ("a mais" / "de economia"), com o mesmo componente
da lista de notas.

Abaixo do resumo entram: o gráfico de **gastos por mês** (alternando com o **saldo por mês**), **onde
você gastou** (por mercado), **onde você pagou mais** / **onde economizou**, **preços que mais
subiram** e **onde mais gasta**. Os gráficos são **SVG/HTML próprios, sem biblioteca**, no padrão do
`<cp-grafico-historico>`.

Tudo roda **no cliente** sobre o cache do `HistoricoPessoalStore` (notas dos 12 meses, já
compartilhado com lista de notas, detalhe e sugestões) e usa **só os preços das notas do usuário**
(D-01): sem `precos` comunitário, sem `produto.menorPreco`, sem Menor Preço. Não há Function nova,
mudança em `firestore.rules`, índice novo, IA nem escrita no Firestore. Gasto por categoria fica fora
(D-06).

**Decisões adotadas (propostas da análise, confirmar na revisão do plano):**

| ID | Decisão |
|---|---|
| D-01 | Só preços das notas do usuário; nada comunitário nem Menor Preço no painel |
| D-02 | "Economia possível" (base comunitária) sai; entra o saldo contra o melhor preço pessoal |
| D-03 | Mês de referência = mês atual com nota, senão o último mês com nota; seletor "Este mês / Mês passado" só quando o mês atual tem nota |
| D-04 | Gastos por mês: 6 meses no celular, 12 no desktop; uma barra por compra quando há menos de 2 meses com nota |
| D-05 | "Preços que mais subiram": primeira × última compra da janela de 12 meses, na base de `baseComum` |
| D-06 | Gasto por categoria fora deste plano |

---

## Convenções Obrigatórias

- Standalone, **OnPush** explícito, **zoneless**; `inject()`; `input()`/`output()`; sem decorators.
- Estado em signals: `resource` para a carga, `computed` para as agregações, `linkedSignal` para o
  mês escolhido (volta para o padrão quando os dados mudam). Store do painel **provido na página**,
  expondo só `Signal` readonly.
- `@for` sempre com `track`; blocos abaixo da dobra em `@defer (on viewport)` com placeholder de
  altura fixa.
- Regras em **funções puras** (`painel.calculos.ts`), sem Angular/Firebase, com `hoje` por parâmetro
  (data pelo token `RELOGIO` no store; nunca `new Date()` na regra). Mês em **horário local**.
- Reaproveitar `compararNota`, `consolidarItens`, `resumirHistorico`, `comValores`, `baseComum`,
  `chaveDoGrupo`, `sufixoDaBase` e `nomeDoItem`; não reescrever comparação de preço.
- Cliente **nunca escreve** no Firestore. Sem Emulator Suite. **Sem `vi.mock` de Firebase**: specs
  com o `HistoricoPessoalStore`/`NotasService` falsos.
- Estilo: classe global primeiro (`.cp-block`, `.cp-section-top/-title`, `.cp-summary`,
  `.cp-segmented`, `.cp-list` + `.cp-list-row`, `.cp-skeleton`, `.cp-info-block--erro`, `.cp-btn-*`,
  `.cp-price`, `.cp-sr-only`); mixin só para o parametrizado (`cp-grid`, `cp-segmented`); cor só por
  token `$cp-*`; budget `anyComponentStyle` 6 kB **medido no build**.
- Breakpoint em TS só pelo `BreakpointService`.
- Ícone novo → `icon_names=` do `src/index.html`, em ordem alfabética.
- Textos pt-BR no template; `currency` padrão (BRL); mês por `DatePipe` (`MMM`, `MMMM`); sem
  comentários além de invariantes não óbvias.
- Gráfico: `role="img"` + `aria-label` e tabela equivalente `cp-sr-only`; cor nunca é a única pista.
- e2e com `getByRole`/`getByLabel`, nunca por classe.

---

## Fases de Implementação

### Fase 1 — Fundação

**Objetivo:** saldo da nota reutilizável, comparações de toda a janela num só lugar, ícones.

#### Tarefa 1.1 — Componente `<cp-saldo-nota>`

**Arquivo(s):** `src/app/shared/ui/saldo-nota/saldo-nota.ts` (novo),
`src/app/features/notas/lista/notas-lista.page.html|scss|ts`

**O que fazer:** extrair o bloco `.notas-saldo` da lista de notas para um componente de
apresentação com `saldo = input.required<number>()`: `> 0` → `trending_up` + "R$ X a mais"
(`$cp-pricier`), `< 0` → `trending_down` + "R$ X de economia" (`$cp-cheaper`), `0` → `check` +
"Saldo zerado". O estilo vai junto (sai do SCSS da lista). Na lista, trocar o `@if/@else if` por:

```html
@if (saldos().has(n.chave)) {
  <cp-saldo-nota [saldo]="saldos().get(n.chave)!" />
}
```

**Critério:** lista de notas idêntica na tela; os specs atuais da lista passam sem mudar as
expectativas de texto; spec do componente cobre os três casos.

#### Tarefa 1.2 — Comparações de toda a janela no `HistoricoPessoalStore`

**Arquivo(s):** `src/app/features/notas/data-access/historico-pessoal.store.ts` e spec

**O que fazer:** novo método público que compara **todas** as notas da janela de uma vez, usando o
`indiceCompleto()` (mesma leitura e mesmos grupos), com cache ligado ao `completo` atual:

```ts
export interface NotaComparada {
  nota: Nota;
  comparacao: Map<number, ComparacaoHistorico>;
  resumo: ResumoHistorico;
}

/** Todas as notas da janela comparadas com o melhor preço recente (painel). */
comparacoesDaJanela(): Promise<{ indice: IndiceCompleto; notas: NotaComparada[] }>;
```

Cada item: `compararNota(n, indice.indice, indice.grupos)` e
`resumirHistorico(consolidarItens(n.itens), comparacao)`. O cache cai junto com `invalidar()`.
Os grupos do `indiceCompleto()` bastam: `ean:` é sempre raiz e todo `loc:` é resolvido, então o
resultado é o mesmo do `resumir()` (o spec verifica isso).

**Critério:** spec com a fixture de `src/testing/fixtures/sugestao/`: para cada nota, o `resumo` é
igual ao de `resumir([nota])`; segunda chamada não relê notas nem produtos; `invalidar()` refaz.

#### Tarefa 1.3 — Ícones e tokens

**Arquivo(s):** `src/index.html`, `src/app/shared/style/_tokens.scss`, `scripts/contraste.mjs`

**O que fazer:** acrescentar no subset os ícones novos que ainda não estiverem lá (ex.: `bar_chart`,
`storefront`, `show_chart`, `trending_up`, `trending_down`, `shopping_basket`), em ordem alfabética.
Só criar token se faltar: barra do mês parcial (ex.: `$cp-chart-partial`, sobre `$cp-surface`) e a
linha da média; barras de gasto usam `$cp-serie-1`, saldo usa `$cp-pricier`/`$cp-cheaper`.
Registrar os pares novos no `contraste.mjs` (3:1 para barra/ícone).

**Critério:** `npm run contraste` e `npm run lint` passam; nenhum ícone aparece como texto.

---

### Fase 2 — Regra pura

**Objetivo:** todas as agregações do painel em `painel.calculos.ts`, com 100 % de cobertura.

#### Tarefa 2.1 — Fixture de histórico curto

**Arquivo(s):** `src/testing/fixtures/painel/notas.ts` (novo)

**O que fazer:** cenário que imita o dv (compra mensal): 3 notas em 2 meses (ex.: 28/08, 28/09 e
03/10, dois mercados), com um produto mais caro na segunda compra, um mais barato, um vinculado entre
mercados (`loc:` → `ean:`) e um comprado só uma vez; `HOJE_PAINEL` fixo. Para o mês vazio, usar a
mesma fixture com `hoje` em 02/11. Reaproveitar a fixture de 12 meses da sugestão para os casos com
6+ meses.

**Critério:** a fixture monta `IndiceCompleto` pelas funções reais (`indexarCompras`, `montarGrupos`).

#### Tarefa 2.2 — Mês de referência e variação comparável

**Arquivo(s):** `src/app/features/painel/painel.calculos.ts` e `painel.calculos.spec.ts`

**O que fazer:**

```ts
export type Mes = `${number}-${string}`; // 'AAAA-MM', horário local
export type EscolhaMes = 'atual' | 'anterior';

export function mesDe(iso: string): Mes;
/** Mês atual se tem nota; senão o último mês com nota (≤ hoje); null sem nota. */
export function mesDeReferencia(notas: readonly Nota[], hoje: Date, escolha: EscolhaMes): Mes | null;
export function notasDoMes(notas: readonly Nota[], mes: Mes): Nota[];
/**
 * Mês em curso: compara com o mês anterior do dia 1 até o mesmo dia (limitado ao último dia);
 * mês fechado: com o mês anterior inteiro. null sem base.
 */
export function variacaoComparavel(notas: readonly Nota[], mes: Mes, hoje: Date):
  { percentual: number; base: number; parcial: boolean } | null;
```

`escolha: 'anterior'` = mês calendário anterior ao atual. Manter `totalDe` e `variacao`; **remover
`economiaPotencial`** (D-02).

**Critério:** specs: mês atual com nota; mês atual vazio → setembro; sem nota → null; dia 31 contra
mês de 30 dias; mês fechado compara inteiro; base 0 → null.

#### Tarefa 2.3 — Resumo e saldo do período

**O que fazer:**

```ts
export interface ResumoPeriodo {
  total: number;
  qtdNotas: number;
  ticketMedio: number;
  aMais: number; itensAcima: number;
  economia: number; itensNovoMelhor: number;
  saldo: number;
  comparados: number;
}
export function resumoDoPeriodo(notas: readonly NotaComparada[]): ResumoPeriodo;
```

Soma dos `ResumoHistorico` (arredondado a centavos no fim, como `resumirHistorico`).

**Critério:** o `saldo` é igual à soma dos saldos das notas que a lista de notas mostra; sem item
comparável → `comparados: 0`.

#### Tarefa 2.4 — Séries mensais

**O que fazer:**

```ts
export interface BarraMes { mes: Mes; total: number; saldo: number; aMais: number; economia: number;
  qtdNotas: number; parcial: boolean }
/** Últimos `meses` meses até o atual (meses sem nota com zero), em ordem cronológica. */
export function seriesPorMes(notas: readonly NotaComparada[], hoje: Date, meses: number): BarraMes[];
/** Uma barra por nota (histórico com menos de 2 meses com nota, D-04). */
export function barrasPorCompra(notas: readonly NotaComparada[]): { chave: string; emissao: string;
  mercado: string; total: number; saldo: number }[];
export function mediaDosFechados(barras: readonly BarraMes[]): number | null;
export function mesesComNota(notas: readonly Nota[]): number;
```

**Critério:** 12 meses da fixture longa; meses vazios com zero; mês atual `parcial`; média ignora o
parcial e os vazios antes da primeira nota; histórico curto → `mesesComNota < 2` no cenário de 1 mês.

#### Tarefa 2.5 — Gasto por mercado

**O que fazer:**

```ts
export interface GastoMercado { cnpj: string | null; nome: string; total: number;
  percentual: number; qtdNotas: number }
/** Top `limite` por total + "Outros" (cnpj null) com o resto. */
export function gastoPorMercado(notas: readonly Nota[], limite = 5): GastoMercado[];
```

Nome = `estabelecimentoNome` da nota mais recente daquele CNPJ (já vem com o apelido).

**Critério:** percentuais somam 100 (±0,1); "Outros" só com mais de `limite` mercados.

#### Tarefa 2.6 — Destaques do período

**O que fazer:**

```ts
export interface DestaquePreco { chave: string; n: number; produtoId: ProdutoId; nome: string;
  valor: number; percentual: number; atual: number; melhor: number; sufixo: string;
  referencia: { mercado: string; emissao: string } }
/** "Pagou mais" por impacto e "economizou" por economia, entre todas as notas do período. */
export function destaquesDoPeriodo(notas: readonly NotaComparada[], limite = 5):
  { pagouMais: DestaquePreco[]; economizou: DestaquePreco[] };
```

Usa `comValores` em cada `comparacao`; nome por `nomeDoItem` do item da nota; `sufixo` por
`sufixoDaBase`. Mesmo critério de ordenação de `destaques()` (desempate por chave e `n`).

**Critério:** os itens de uma nota única batem com os cards "Ficaram mais caros/baratos" do detalhe.

#### Tarefa 2.7 — Preços que mais subiram

**O que fazer:**

```ts
export const ALTA_MIN_PERCENTUAL = 5;
export const ALTA_MIN_REAIS = 0.1;
export interface AltaPreco { grupo: string; produtoId: ProdutoId; nome: string; de: number;
  para: number; percentual: number; sufixo: string; desde: string; em: string; vezes: number }
export function precosQueSubiram(indice: ReadonlyMap<string, readonly CompraPessoal[]>,
  limite = 5): AltaPreco[];
```

Por grupo: `baseComum(compras)` → compras aceitas, de notas distintas, em ordem de emissão; precisa
de ≥ 2; primeira × última (D-05); só altas ≥ 5 % **e** ≥ R$ 0,10; ordena por percentual, desempate
por diferença. `produtoId` e nome da última compra.

**Critério:** funciona com 2 compras (fixture curta); queda e alta pequena ficam de fora; base
incompatível (500 mL × 1 L por `vlUnit`) não vira alta falsa.

#### Tarefa 2.8 — Onde mais gasta

**O que fazer:**

```ts
export interface MaiorGasto { grupo: string; produtoId: ProdutoId; nome: string; total: number;
  compras: number; quantidade: number; unidade: string }
/** Produtos/grupos com maior valor somado (vlTotal) nas notas dadas. */
export function ondeMaisGasta(notas: readonly Nota[], grupos: Grupos, limite = 5): MaiorGasto[];
```

O store passa as notas dos últimos 3 meses (`intervaloDe('3-meses', …, hoje)`). Quantidade somada
só quando a unidade é a mesma em todas as compras; senão mostra só o nº de compras.

**Critério:** grupo vinculado entre mercados soma numa linha só; itens repetidos na mesma nota contam
uma compra.

---

### Fase 3 — Store do painel

**Objetivo:** uma fonte de estado para a página, com carga independente por bloco.

#### Tarefa 3.1 — `PainelStore`

**Arquivo(s):** `src/app/features/painel/painel.store.ts` (novo) e spec

**O que fazer:** `@Injectable()` provido em `PainelPage`.

- `ultimas = resource(...)`: `NotasService.listar({})` → 5 primeiras (rápido, não espera o
  histórico, como hoje).
- `saldosUltimas = resource({ params: ultimas, loader: historico.resumir })`: falha só esconde o
  saldo.
- `janela = resource({ params: () => historico.versao(), loader: () =>
  historico.comparacoesDaJanela() })`.
- `escolha = linkedSignal<…, EscolhaMes>({ source: janela.value, computation: () => 'atual' })`.
- `computed`s: `mes`, `podeEscolher` (mês atual tem nota), `resumo`, `variacao`, `barras` (6 ou 12 por
  `BreakpointService`, ou por compra), `media`, `mercados`, `destaques`, `altas`, `maioresGastos`;
  `hoje` pelo token `RELOGIO`.
- `semNotas`: `ultimas` vazio.

**Critério:** spec com histórico falso: mês vazio cai no anterior; trocar `escolha` recalcula sem
recarregar; `versao` muda → `janela` recarrega; erro na `janela` não afeta `ultimas`.

---

### Fase 4 — Componentes de apresentação

**Objetivo:** blocos burros (`input()` + template), cada um com seu estado vazio.

#### Tarefa 4.1 — `<cp-resumo-mes>`

**Arquivo(s):** `src/app/features/painel/ui/resumo-mes.ts`

**O que fazer:** `.cp-summary` com três células: **Gasto em {mês}** (+ variação com ícone e o texto
"em relação a {mês anterior} até o dia N" ou "em relação a {mês anterior}"), **Saldo contra seu
melhor preço** (`<cp-saldo-nota>` grande + "R$ X a mais em N itens · R$ Y de economia em M itens";
`comparados === 0` → "Importe mais notas para comparar preços"), **Notas** (qtd + "ticket médio
R$ Z"). Quando o mês não é o atual, título com o nome do mês. `output()` `escolher` e o
`.cp-segmented` "Este mês / Mês passado" só com `podeEscolher`.

**Critério:** spec dos três estados do saldo, do rótulo de mês anterior e do seletor oculto.

#### Tarefa 4.2 — `<cp-grafico-meses>`

**Arquivo(s):** `src/app/features/painel/ui/grafico-meses.ts|scss`

**O que fazer:** SVG com `viewBox` (largura cheia), dois modos por `.cp-segmented` "Gasto | Saldo":

- **Gasto:** barras verticais `$cp-serie-1`, mês de referência destacado, mês parcial com
  preenchimento listrado/claro + "parcial" no rótulo, linha tracejada da média com legenda.
- **Saldo:** barras divergentes do zero — para cima `$cp-pricier` ("a mais"), para baixo
  `$cp-cheaper` ("economia"), rótulo de valor com sinal em texto.
- Cada barra dentro de `<a>` (`routerLink="/notas"` + `queryParams` `periodo=personalizado&de&ate`)
  com `aria-label` ("Outubro: R$ 812,40, ver notas"); modo por compra leva a `/notas/:chave`.
- Rótulo do mês `MMM`; `<title>` com o valor; tabela `cp-sr-only` (mês, gasto, saldo, notas).

**Critério:** spec: nº de barras, link do mês, tabela equivalente, modo saldo com sinais; SCSS < 6 kB
no build.

#### Tarefa 4.3 — `<cp-gasto-por-mercado>`

**Arquivo(s):** `src/app/features/painel/ui/gasto-por-mercado.ts`

**O que fazer:** lista `.cp-list` em que cada linha tem nome, "N notas", valor e uma barra
horizontal em HTML (`width` em %, `$cp-serie-1`, com `role="presentation"`; o % também em texto).
Linha leva a `/notas?cnpj=…` ("Outros" sem link).

**Critério:** spec: ordem, % em texto, link por CNPJ, "Outros" sem link.

#### Tarefa 4.4 — `<cp-destaques-precos>`

**Arquivo(s):** `src/app/features/painel/ui/destaques-precos.ts`

**O que fazer:** dois cards lado a lado no desktop (`cp-grid`), empilhados no celular: **Onde você
pagou mais** (`trending_up`, "R$ X a mais · +N %", "R$ 7,99/un no Mercado Y em 02/10") e **Onde você
economizou** (`trending_down`, "R$ X de economia"). Item leva a `/produtos/:id`. Card sem item some;
os dois vazios → bloco some.

**Critério:** spec com os dois cards, só um, nenhum.

#### Tarefa 4.5 — `<cp-precos-que-subiram>` e `<cp-onde-mais-gasta>`

**Arquivo(s):** `src/app/features/painel/ui/precos-que-subiram.ts`, `ui/onde-mais-gasta.ts`

**O que fazer:** listas `.cp-list-row` com link para o produto. Altas: "de R$ A para R$ B/un
(+N %)" e "desde dd/MM"; vazio → "Os preços que subiram aparecem quando você comprar o mesmo produto
duas vezes". Onde mais gasta: total, "N compras" e a quantidade quando houver; título "Onde mais
gasta (3 meses)".

**Critério:** specs de lista e vazio.

---

### Fase 5 — Página

**Objetivo:** montar o painel novo sobre o `PainelStore`.

#### Tarefa 5.1 — `PainelPage`

**Arquivo(s):** `src/app/features/painel/painel.page.ts|html|scss`

**O que fazer:**

- `providers: [PainelStore]`; remover o `resource` antigo, `ProdutosService` e `economiaPotencial`.
- Ordem (RF-16): cabeçalho → atalhos → pendentes → lista em andamento → `<cp-resumo-mes>` →
  **Últimas notas** (com `<cp-saldo-nota>` em `.item-lado`, como na lista de notas) →
  `@defer (on viewport)` gráfico de meses → destaques → preços que subiram → onde você gastou →
  onde mais gasta → hora de repor.
- Desktop (`desktop` ≥ 1024): resumo em linha; blocos de gráfico/destaque em grade de 2 colunas.
- Estados por bloco: skeleton enquanto `janela` carrega; erro da `janela` → um
  `.cp-info-block--erro` compacto com "Tentar de novo" (`janela.reload()`) no lugar dos blocos que
  dependem dela; últimas notas e atalhos seguem. Sem nota → os 3 passos (como hoje).

**Critério:** no celular e no desktop a ordem bate com o RF-16; erro simulado na `janela` deixa as
últimas notas na tela; sem nota mostra os 3 passos.

---

### Fase 6 — Qualidade

**Objetivo:** testes, a11y, budget, validação com dados reais e documentação.

#### Tarefa 6.1 — Specs da página

**Arquivo(s):** `src/app/features/painel/paginas-fase9.spec.ts` (atualizar `describe('PainelPage')`)

**O que fazer:** trocar o teste de "economia" pelo saldo; casos: mês atual, mês vazio (cai no
anterior), saldo nas últimas notas, erro na janela sem derrubar a página, sem notas. `RELOGIO` fixo.

**Critério:** `npm test` verde; 100 % em `painel.calculos.ts` no `npm run test:ci`.

#### Tarefa 6.2 — e2e e axe

**Arquivo(s):** `e2e/painel.spec.ts` (novo), `e2e/a11y.spec.ts`

**O que fazer:** com o usuário de teste do dv: painel mostra "Últimas notas", o resumo e o gráfico
(`getByRole('img', { name: /Gastos por mês/ })`), a tabela do gráfico existe, barra do mês leva a
`/notas` filtrada. Incluir `/` no axe depois de rolar até o fim (os `@defer`). Pular sem
`.env.e2e`, como os outros.

**Critério:** `npm run e2e` verde nos projetos `chromium` e `mobile`; axe sem violações.

#### Tarefa 6.3 — Budget, lint e contraste

**O que fazer:** `ng build --configuration=production`; conferir que o bundle inicial não cresceu
e que cada componente novo está abaixo de 6 kB; `npm run lint`; `npm run contraste`.

**Critério:** build sem aviso de budget novo; lint e contraste verdes.

#### Tarefa 6.4 — Validação com os dados reais do dv

**O que fazer:** com `npm start` e o usuário logado no painel do navegador, conferir: saldo do mês
igual à soma da lista de notas do mesmo mês; destaques iguais aos cards das notas; gráfico com o
histórico curto real (uma barra por compra se houver menos de 2 meses); nenhum bloco vazio ou quebrado.
Ajustar limites (5 %, R$ 0,10, top 5) se a tela ficar vazia ou poluída com os dados reais.

**Critério:** prints do celular e do desktop sem bloco vazio; números conferidos com a lista de notas.

#### Tarefa 6.5 — `CLAUDE.md`

**O que fazer:** atualizar a linha do painel em "Produtos, estabelecimentos e painel" (mês de
referência, saldo pessoal no lugar da economia comunitária, gráficos SVG próprios, `PainelStore`,
`comparacoesDaJanela`, `<cp-saldo-nota>`) com o link para este plano.

**Critério:** `CLAUDE.md` descreve o painel novo e não cita mais a economia pela base comunitária.

---

## Estrutura Final de Arquivos

```
src/
├── index.html                                   # ícones novos (1.3)
├── app/
│   ├── shared/
│   │   ├── style/_tokens.scss                   # tokens do gráfico, se faltarem (1.3)
│   │   └── ui/saldo-nota/saldo-nota.ts          # NOVO (1.1)
│   └── features/
│       ├── notas/
│       │   ├── data-access/historico-pessoal.store.ts   # comparacoesDaJanela (1.2)
│       │   └── lista/notas-lista.page.html|scss         # usa <cp-saldo-nota> (1.1)
│       └── painel/
│           ├── painel.calculos.ts|spec.ts       # regra pura (2.2–2.8)
│           ├── painel.store.ts|spec.ts          # NOVO (3.1)
│           ├── painel.page.ts|html|scss         # página nova (5.1)
│           ├── paginas-fase9.spec.ts            # specs da página (6.1)
│           └── ui/
│               ├── resumo-mes.ts                # NOVO (4.1)
│               ├── grafico-meses.ts|scss        # NOVO (4.2)
│               ├── gasto-por-mercado.ts         # NOVO (4.3)
│               ├── destaques-precos.ts          # NOVO (4.4)
│               ├── precos-que-subiram.ts        # NOVO (4.5)
│               └── onde-mais-gasta.ts           # NOVO (4.5)
└── testing/fixtures/painel/notas.ts             # NOVO (2.1)
scripts/contraste.mjs                            # pares novos (1.3)
e2e/painel.spec.ts                               # NOVO (6.2)
e2e/a11y.spec.ts                                 # painel no axe (6.2)
CLAUDE.md                                        # (6.5)
```

---

## Ordem de Execução Recomendada

```
1.1 saldo-nota ─────────────────────────────────────────┐
1.2 comparacoesDaJanela ──┐                             │
1.3 ícones/tokens ────────┼──────────────┐              │
2.1 fixture ──► 2.2 ► 2.3 ► 2.4 ► 2.5 ► 2.6 ► 2.7 ► 2.8 │
                          │              │              │
                          └──► 3.1 PainelStore ◄────────┤
                                         │              │
                     4.1 ─ 4.2 ─ 4.3 ─ 4.4 ─ 4.5 ◄──────┘
                                         │
                                  5.1 PainelPage
                                         │
                      6.1 ─ 6.2 ─ 6.3 ─ 6.4 ─ 6.5
```

1.1 e 1.2 são independentes entre si; as tarefas da Fase 2 só dependem da fixture e podem ir em
qualquer ordem depois da 2.2; os componentes da Fase 4 dependem dos tipos da Fase 2.

---

## Critérios de Aceitação Globais

- [ ] As últimas notas do painel mostram "R$ X a mais", "R$ X de economia" ou "Saldo zerado" com o
      mesmo componente e valor da lista de notas; nota sem comparação não mostra saldo.
- [ ] O saldo do mês mostra o líquido e as duas parcelas, e bate com a soma dos saldos da lista de
      notas no mesmo mês.
- [ ] Nenhum número do painel usa `produto.menorPreco`, `precos` comunitário ou Menor Preço;
      `economiaPotencial` não existe mais.
- [ ] Em um mês sem nota, o painel mostra o último mês com nota, com o nome do mês, e sem seletor.
- [ ] A variação do mês em curso compara com o mesmo período do mês anterior e diz isso no texto.
- [ ] Gastos por mês: 6 barras no celular, 12 no desktop, mês de referência destacado, mês parcial
      marcado, média dos meses fechados; uma barra por compra com menos de 2 meses com nota; cada
      barra abre a lista de notas filtrada.
- [ ] Modo "Saldo": barras para cima (a mais) e para baixo (economia), com texto e sinal.
- [ ] "Onde você gastou": mercados do mês com valor, % e nº de notas, link para `/notas?cnpj=`.
- [ ] "Onde você pagou mais" / "Onde economizou" batem com os cards das notas do mês.
- [ ] "Preços que mais subiram" aparece com 2 compras do mesmo produto e some sem altas ≥ 5 % e
      ≥ R$ 0,10.
- [ ] "Onde mais gasta" soma o grupo vinculado entre mercados numa linha.
- [ ] Erro no histórico afeta só os blocos que dependem dele; confirmar/excluir nota atualiza o
      painel sem recarregar.
- [ ] Gráficos com `role="img"`, `aria-label` e tabela `cp-sr-only`; axe sem violações; `npm run
      contraste` verde.
- [ ] Bundle inicial sem aumento; cada estilo de componente < 6 kB no build; sem biblioteca de
      gráfico nova no `package.json`.
- [ ] `npm run lint`, `npm test` (100 % em `painel.calculos.ts`) e `npm run e2e` verdes.
- [ ] Conferido no dv com os dados reais (celular e desktop).
