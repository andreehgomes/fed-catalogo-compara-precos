# Plano de Desenvolvimento: Histórico de preços na nota

**Data:** 29/09/2026
**Projeto:** fed-catalogo-compara-precos
**Análise base:** [historico-precos-nota-analise.md](../analise/historico-precos-nota-analise.md)
**Branch alvo:** `main`

---

## Visão Geral

No detalhe da nota (`/notas/:chave`), cada item é comparado com a **última vez que o usuário
comprou o mesmo produto antes desta nota** (D-02). O item mostra o preço da última vez, a
diferença por unidade (R$ e %) e **quanto pagou a mais ou a menos nesta compra** (diferença ×
quantidade). O resumo da nota soma, só nos itens comparáveis, o total pago a mais, o total pago
a menos e o saldo, com "N de M itens comparados". Há destaques das maiores altas e quedas e um
filtro **Todos · Subiram · Baixaram · Primeira compra**.

Os dados vêm só das notas do próprio usuário (`usuarios/{uid}/notas`, janela de 12 meses, até
400 notas) e de `produtos` (para juntar produtos vinculados entre mercados por `vinculadoA`). O
índice `produto → compras` é montado **no cliente**, uma vez por sessão (D-01). Nada é gravado,
nenhuma Function nova, nenhuma mudança em `firestore.rules`, nenhuma chamada ao Menor Preço.

Resultado: abrir uma nota responde, item a item e no total, "paguei mais caro ou mais barato
que da última vez?", sem clique e sem atrasar a lista de itens.

---

## Convenções Obrigatórias

- Standalone, **OnPush** explícito, **zoneless**; `inject()`; `input()`/`output()`.
- Estado em signals; carga assíncrona com `resource`; derivações com `computed`. Store
  `providedIn: 'root'` expondo só `Signal` readonly.
- `@for` sempre com `track`; `@defer (on viewport)` no bloco de destaques.
- Regra de negócio em **funções puras** (sem Angular/Firebase), testadas isoladas.
- Firestore só pelo token `FIRESTORE_API` (fakes nos testes). **Sem `vi.mock` de Firebase.**
- Cliente **nunca escreve** no Firestore. Sem Emulator Suite.
- Estilo: classe global primeiro (`.cp-summary`, `.cp-badge--*`, `.cp-segmented`,
  `.cp-list-row`, `.cp-info-block--warn`, `.cp-skeleton`); cor só por token `$cp-*`; badge
  sempre ícone + texto (`<cp-badge-preco>`). Budget `anyComponentStyle` 6 kB.
- Ícone novo → acrescentar em `icon_names=` do `src/index.html`, em ordem alfabética.
- Textos da UI em pt-BR no template; `currency` padrão (BRL); sem comentários além de
  invariantes não óbvias.
- e2e com `getByRole`/`getByLabel`.

---

## Fases de Implementação

### Fase 1 — Fundação

**Objetivo:** utilitários e consultas de que a regra e o store dependem.

#### Tarefa 1.1 — Quantidade na unidade base

**Arquivo(s):** `shared/unidade.ts`, `shared/unidade.spec.ts`

**O que fazer:** criar `quantidadeNaUnidadeBase(qtd, unidadeNota, descricao)` → `number | null`,
reaproveitando `FATOR` e `extrairConteudo` (mesma lógica de `precoPorUnidadeBase`):

- vendido por peso/volume (`KG`, `G`, `L`, `ML`…): `qtd × fator` convertido para a base;
- vendido por unidade com conteúdo na descrição ("COCA 2L"): `qtd × conteudo.quantidade`;
- sem conteúdo: `null`.

Serve para calcular o "a mais nesta compra" quando a comparação é por R$/kg ou R$/L (RF-05),
sem depender do `precoPorUnidadeBase.valor` arredondado.

**Critério:** specs cobrindo `KG` (1,245 kg), `G`, `UN` com "2L", "6X350ML" e sem conteúdo.

#### Tarefa 1.2 — Membros dos grupos de vínculo em lote

**Arquivo(s):** `src/app/features/produtos/data-access/produtos.service.ts`

**O que fazer:** `membrosDosGrupos(canonicos: readonly string[]): Promise<Produto[]>` com
`where('vinculadoA', 'in', grupo)` em grupos de 30 (`emGrupos`), no padrão de
`produtosPorIds`. Índice de campo único (automático).

**Critério:** spec do serviço com `FIRESTORE_API` fake: 65 canônicos → 3 consultas; resultado
achatado e sem duplicados.

#### Tarefa 1.3 — Ícones

**Arquivo(s):** `src/index.html`

**O que fazer:** acrescentar `expand_less`, `expand_more` e `history` em `icon_names=`
(ordem alfabética).

**Critério:** os ícones renderizam (não aparece o texto da ligadura).

---

### Fase 2 — Regra pura da comparação

**Objetivo:** toda a lógica testável sem Angular.

#### Tarefa 2.1 — Tipos e índice de compras

**Arquivo(s):** `src/app/features/notas/detalhe/historico-pessoal.ts`

**O que fazer:**

```ts
export interface CompraPessoal {
  chave: string; n: number; cnpj: string; mercado: string; emissao: string;
  produtoId: ProdutoId; descricao: string; qtd: number; unidade: string;
  vlUnit: number; porUnidade: PrecoPorUnidade | null;
}

/** produtoId → id do canônico; ausente = o próprio id. */
export type Grupos = ReadonlyMap<string, string>;

export function indexarCompras(notas: readonly Nota[], grupos: Grupos): Map<string, CompraPessoal[]>;
```

- Chave do índice = `grupos.get(produtoId) ?? produtoId`.
- Cada lista ordenada por `emissao` desc (desempate por `chave`, `n`).
- `montarGrupos(produtosDaNota: Map<string, Produto>, membros: Produto[]): Grupos` — canônico =
  `vinculadoA ?? id`; mapeia o próprio item, o canônico e cada membro para o canônico.

**Critério:** specs: mesmo `produtoId` em duas notas cai na mesma lista; `loc:` de outro
mercado vinculado ao mesmo canônico cai na mesma lista; sem vínculo fica separado.

#### Tarefa 2.2 — Comparar um item

**Arquivo(s):** `historico-pessoal.ts`

**O que fazer:** `compararItem(item, nota, compras: CompraPessoal[]): ComparacaoHistorico`.

- Candidatas: compras com `emissao < nota.emissao` e `chave !== nota.chave` (compras
  **posteriores e a própria nota não contam**). Referência = a mais recente delas.
- Sem referência → `{ tipo: 'primeira-compra' }`.
- **Base da comparação** (RF-05), nesta ordem:
  1. mesma `unidade` comercial normalizada (sem acento, maiúscula) → compara `vlUnit`;
     `impacto = (vlUnit − ref.vlUnit) × qtd`;
  2. senão, `porUnidade` dos dois lados na mesma `unidade` base → compara
     `porUnidade.valor`; `impacto = diferença × quantidadeNaUnidadeBase(qtd, unidade,
     descricao)` (Tarefa 1.1); se a quantidade for `null`, cai no 3;
  3. senão → `{ tipo: 'sem-comparacao' }`.
- `diferenca` por unidade comparada, `percentual = diferenca / ref × 100`, `impacto`
  arredondado a centavos, com sinal. `|diferenca| < CENTAVO` (0,005) → `igual`, `impacto = 0`.
- Complementos para a expansão (RF-09): `menor`, `media` e `vezes` sobre as candidatas na base
  escolhida; `compras` = até 5 candidatas mais recentes.

```ts
export type ComparacaoHistorico =
  | { tipo: 'primeira-compra' }
  | { tipo: 'sem-comparacao'; compras: CompraPessoal[] }
  | {
      tipo: 'mais-caro' | 'mais-barato' | 'igual';
      base: 'unidade' | UnidadeBase;   // 'unidade' = vlUnit; senão R$/kg, R$/L, R$/un
      referencia: CompraPessoal;
      valorAtual: number; valorAnterior: number;
      diferenca: number; percentual: number; impacto: number;
      menor: number; media: number; vezes: number; compras: CompraPessoal[];
    };
```

**Critério:** specs para cada ramo: mesmo preço (dentro do centavo), subiu, baixou, primeira
compra, só compra posterior (→ primeira compra), item repetido na mesma nota não se compara
consigo, `KG` × `KG`, "2L" × "3L" do mesmo grupo por R$/L, `UN` × `KG` sem conteúdo → sem
comparação.

#### Tarefa 2.3 — Resumo, destaques e filtro

**Arquivo(s):** `historico-pessoal.ts`

**O que fazer:**

```ts
export interface ResumoHistorico {
  aMais: number; itensAMais: number;
  aMenos: number; itensAMenos: number;   // aMenos positivo (valor absoluto)
  saldo: number;                          // aMais − aMenos
  comparados: number; total: number;
}
export function resumirHistorico(itens: readonly ItemNota[], r: ReadonlyMap<number, ComparacaoHistorico>): ResumoHistorico;
export function destaques(r, limite = 3): { altas: number[]; quedas: number[] };  // por |impacto|
export type FiltroHistorico = 'todos' | 'subiram' | 'baixaram' | 'primeira';
export function filtrarItens(itens, r, filtro): ItemNota[];
```

`comparados` conta só `mais-caro | mais-barato | igual`; `total` = itens da nota. Somas
arredondadas a centavos no fim (somar os `impacto` já arredondados).

**Critério:** spec com a fixture da Fase 5 (Tarefa 5.1): `aMais`, `aMenos` e `saldo` batem com
a soma manual escrita no próprio teste.

---

### Fase 3 — Store do histórico pessoal

**Objetivo:** carregar e cachear o índice; entregar a comparação da nota aberta.

#### Tarefa 3.1 — `HistoricoPessoalStore`

**Arquivo(s):** `src/app/features/notas/data-access/historico-pessoal.store.ts`

**O que fazer:** service `providedIn: 'root'`.

- `notas()`: `NotasService.todas({ de: <hoje − 12 meses> }, 20)`, guardado em memória por
  `uid` (promessa compartilhada: duas telas pedindo juntas fazem uma leitura só).
- `comparar(nota: Nota): Promise<Map<number, ComparacaoHistorico>>`:
  1. se `nota.chave` não está nas notas em cache **e** a nota é mais recente que a janela,
     invalida e recarrega (nota que acabou de chegar pela fila ou importação);
  2. `produtosPorIds(ids da nota)` → canônicos → `membrosDosGrupos(canônicos)` →
     `montarGrupos` (grupos também cacheados por canônico na sessão);
  3. `indexarCompras` + `compararItem` para cada item.
- `invalidar()`: limpa o cache (chamado após excluir nota e após confirmar importação).
- Troca de usuário (`AuthStore.uid`) limpa o cache.

**Critério:** spec com `NotasService`/`ProdutosService` fakes: segunda nota aberta na sessão
não chama `todas()` de novo; `invalidar()` força nova leitura; nota fora do cache recarrega.

#### Tarefa 3.2 — Invalidação nos pontos de escrita

**Arquivo(s):** `src/app/features/notas/detalhe/nota-detalhe.page.ts`,
`src/app/features/importar/importar.store.ts`

**O que fazer:** chamar `historico.invalidar()` depois de `service.excluir()` com sucesso e
depois de `confirmarNfce` com `ok: true`.

**Critério:** specs existentes de exclusão e confirmação verificam a chamada.

---

### Fase 4 — Interface no detalhe da nota

**Objetivo:** mostrar item a item, total, destaques e filtro.

#### Tarefa 4.1 — `<cp-historico-item>`

**Arquivo(s):** `src/app/features/notas/detalhe/historico-item.ts`

**O que fazer:** componente OnPush com `comparacao = input.required<ComparacaoHistorico>()`
e `produtoId = input.required<string>()`.

- `mais-caro | mais-barato | igual`: `<cp-badge-preco [tipo] [diferenca]="|impacto|">`
  ("R$ 1,50 mais caro") + texto "Última vez R$ 5,49 (12/08 · Mercado X) · +R$ 0,50/un
  (+9,1 %)". Base por peso/volume mostra "/kg" ou "/L". `<cp-fonte-preco fonte="minhas-notas">`.
- `primeira-compra`: texto neutro "Primeira compra" (sem badge colorido).
- `sem-comparacao`: "Unidade diferente da última compra" (sem valores).
- Botão `aria-expanded`/`aria-controls` (ícone `expand_more`/`expand_less`) expande: até 5
  compras (data, mercado, valor), "Menor que você pagou" e "Média (N compras)", e link
  "Ver histórico completo" para `/produtos/:id`.

**Critério:** spec do componente para os três tipos e a expansão; axe sem violações.

#### Tarefa 4.2 — Total no resumo e estados

**Arquivo(s):** `nota-detalhe.page.ts`, `nota-detalhe.page.html`, `nota-detalhe.page.scss`

**O que fazer:**

- `historico = resource({ params: () => this.dados(), loader: ({params}) =>
  params ? this.historicoStore.comparar(params) : … })`; `resumo = computed(() =>
  resumirHistorico(...))`.
- No `.cp-summary`, item "Comparado com a última vez" com `role="status"`:
  - saldo em destaque ("R$ 12,40 a mais" com `trending_up` e `$cp-pricier`; "a menos" com
    `trending_down` e `$cp-cheaper`; "Mesmo valor" quando 0);
  - abaixo: "R$ 18,70 a mais em 9 itens · R$ 6,30 a menos em 5 itens · 14 de 40 itens
    comparados · últimos 12 meses".
  - Sem nenhum comparável: "Primeira vez com esses produtos".
- Carregando: `cp-skeleton` só nesse item do resumo; a lista de itens renderiza na hora.
- Erro: `cp-info-block--warn` "Não deu para comparar com suas compras agora" + botão
  `cp-btn-secondary-compact` "Tentar de novo" (`historico.reload()`).
- Na linha do item (`.detalhe-item`), `<cp-historico-item>` abaixo de `.item-detalhe` e
  **antes** do resultado do "Tem mais barato perto?"; os dois empilham com `gap` de 4px.

**Critério:** com fixture, o resumo mostra os valores esperados; lista aparece antes do
histórico resolver; erro não esconde a nota.

#### Tarefa 4.3 — Destaques e filtro da lista

**Arquivo(s):** `nota-detalhe.page.html`, `nota-detalhe.page.ts`

**O que fazer:**

- Bloco `.cp-block` "Comparado com a última vez" em `@defer (on viewport)`, só quando há
  comparáveis: até 3 maiores altas e 3 maiores quedas por `|impacto|` (descrição + badge),
  cada uma rolando até o item na lista (âncora `#item-{n}`).
- Filtro `.cp-segmented` (`role="group"`, botões `aria-pressed`) **Todos · Subiram · Baixaram
  · Primeira compra**, com contagem em cada opção, acima da lista de itens. Estado em query
  param `?itens=` (input com `withComponentInputBinding`), padrão `todos`.
- Lista usa `filtrarItens(...)`; filtro sem resultado → `cp-empty-inline`.

**Critério:** `?itens=subiram` mostra só os itens com `mais-caro`; trocar o filtro atualiza a
URL; voltar do produto mantém o filtro.

---

### Fase 5 — Qualidade

**Objetivo:** fixtures, testes de página, e2e/a11y e documentação.

#### Tarefa 5.1 — Fixture de histórico

**Arquivo(s):** `src/testing/fixtures/notas-historico/*.json`

**O que fazer:** 4 notas `Nota` (JSON) de 2 mercados em datas diferentes, montadas a partir
das descrições reais da fixture `nota-real-pr-2026-09` (já anonimizada), cobrindo: item
repetido no mesmo mercado (`loc:` igual) subindo e baixando; mesmo produto em outro mercado
com vínculo; granel em `KG`; "2L" × "3L" do mesmo grupo; `UN` × `KG` sem conteúdo; item só em
nota posterior; produtos correspondentes (`Produto` com `vinculadoA`).

**Critério:** usada pelos specs das Fases 2, 3 e 4.

#### Tarefa 5.2 — Specs do detalhe

**Arquivo(s):** `src/app/features/notas/notas.spec.ts`

**O que fazer:** no `montar()` do detalhe, prover `HistoricoPessoalStore` fake. Casos: resumo
com saldo/a mais/a menos; linha do item com badge e "Última vez"; primeira compra; estado de
erro com "Tentar de novo"; filtro `subiram`; exclusão chama `invalidar()`.

**Critério:** `npm test` verde; cobertura do `historico-pessoal.ts` em 100 % de linhas.

#### Tarefa 5.3 — e2e e acessibilidade

**Arquivo(s):** `e2e/notas-historico.spec.ts`, `e2e/a11y.spec.ts`

**O que fazer:** com o usuário de teste do dv, abrir uma nota que tenha compra anterior (pular
com `test.skip` se o usuário tiver menos de 2 notas): ver "Comparado com a última vez", aplicar
o filtro "Subiram" por `getByRole('button', { name: /Subiram/ })`, expandir um item. Incluir o
detalhe da nota no axe.

**Critério:** `npm run e2e` verde (ou pulado sem `.env.e2e`); axe sem violações.

#### Tarefa 5.4 — Verificação geral e documentação

**Arquivo(s):** `CLAUDE.md` (seção "Minhas notas"), `docs/qualidade/roteiro*` se houver item do
detalhe

**O que fazer:** documentar em 3–5 linhas: `HistoricoPessoalStore` (12 meses, 400 notas, cache
por sessão, `invalidar()`), regra "última compra anterior", base `vlUnit` → R$/unidade base →
sem comparação, e `quantidadeNaUnidadeBase`. Rodar `npm run lint`, `npm run contraste`,
`npm run test:ci`, `ng build --configuration=production` (sem estourar budget).

**Critério:** tudo verde; budget do chunk de `notas` e `anyComponentStyle` sem aviso novo.

---

## Estrutura Final de Arquivos

```
shared/
├── unidade.ts                                   # F1.1 quantidadeNaUnidadeBase
└── unidade.spec.ts                              # F1.1
src/index.html                                   # F1.3 ícones
src/app/features/
├── produtos/data-access/produtos.service.ts     # F1.2 membrosDosGrupos
├── importar/importar.store.ts                   # F3.2 invalidar após confirmar
└── notas/
    ├── data-access/
    │   └── historico-pessoal.store.ts           # F3.1 (novo)
    ├── detalhe/
    │   ├── historico-pessoal.ts                 # F2.1–2.3 (novo, puro)
    │   ├── historico-pessoal.spec.ts            # F2 (novo)
    │   ├── historico-item.ts                    # F4.1 (novo)
    │   ├── nota-detalhe.page.ts                 # F3.2, F4.2, F4.3
    │   ├── nota-detalhe.page.html               # F4.2, F4.3
    │   └── nota-detalhe.page.scss               # F4.2
    └── notas.spec.ts                            # F5.2
src/testing/fixtures/notas-historico/*.json      # F5.1 (novo)
e2e/notas-historico.spec.ts                      # F5.3 (novo)
e2e/a11y.spec.ts                                 # F5.3
CLAUDE.md                                        # F5.4
```

---

## Ordem de Execução Recomendada

```
F1.1 unidade ─────────┐
F1.2 membrosDosGrupos ─┤
F5.1 fixture ──────────┼──► F2.1 índice ─► F2.2 compararItem ─► F2.3 resumo/filtro
F1.3 ícones ───────────┘                                            │
                                                                    ▼
                                                   F3.1 store ─► F3.2 invalidação
                                                                    │
                                        ┌───────────────────────────┤
                                        ▼                           ▼
                               F4.1 historico-item        F4.2 resumo + estados
                                        └─────────────┬─────────────┘
                                                      ▼
                                              F4.3 destaques + filtro
                                                      ▼
                                      F5.2 specs ─► F5.3 e2e/a11y ─► F5.4 verificação
```

A fixture (F5.1) é feita junto da Fase 1 porque os specs da Fase 2 dependem dela.

---

## Critérios de Aceitação Globais

- [ ] Cada item comprado antes mostra o preço da última vez (data e mercado), a diferença por
      unidade em R$ e % e quanto pagou a mais ou a menos nesta compra (diferença × quantidade).
- [ ] Item sem compra anterior mostra "Primeira compra", sem cor de alta/queda.
- [ ] Compras posteriores à nota e a própria nota são ignoradas.
- [ ] Mesmo `produtoId` e produtos de mercados diferentes vinculados ao mesmo canônico são
      reconhecidos; sem vínculo, não.
- [ ] Granel compara por R$/kg; embalagens diferentes do mesmo grupo por R$/L ou R$/kg;
      unidades incompatíveis mostram "Unidade diferente da última compra".
- [ ] O resumo mostra, só com os comparáveis, total a mais, total a menos, saldo e "N de M
      itens comparados", batendo com a soma manual da fixture.
- [ ] Filtro Subiram/Baixaram/Primeira compra funciona e fica em `?itens=`.
- [ ] Destaques listam até 3 altas e 3 quedas e levam ao item.
- [ ] Expansão do item mostra até 5 compras, menor e média, e o link para `/produtos/:id`.
- [ ] A lista de itens aparece antes do histórico; falha no histórico mostra aviso com
      "Tentar de novo" e a nota continua utilizável.
- [ ] Abrir uma segunda nota na sessão não relê as notas; excluir nota ou importar nova
      invalida o cache.
- [ ] Nenhuma escrita no Firestore e nenhuma chamada a Functions, Menor Preço ou Claude API.
- [ ] Badges com ícone + texto; axe sem violações no detalhe da nota.
- [ ] `npm run lint`, `npm run contraste`, `npm run test:ci` e build de produção verdes, sem
      estourar budget.
