# Análise: Histórico de preços na nota

**Data:** 2026-09-29
**Projeto:** fed-catalogo-compara-precos
**Escopo:** no detalhe da nota (`/notas/:chave`), comparar o preço pago em cada item com o
que o **próprio usuário** já pagou pelo mesmo produto nas **outras notas dele** (histórico
pessoal, não a base comunitária nem o Menor Preço).

---

## 1. Contexto

**O que já existe**

- `/notas/:chave` (`features/notas/detalhe/nota-detalhe.page.*`): resumo (total, itens,
  desconto, economia possível), bloco **"Tem mais barato perto?"** (Menor Preço, sob
  demanda, `MaisBaratoPerto`), lista de itens com link para `/produtos/:id`, chave de acesso
  e exclusão.
- Cada `ItemNota` já traz `produtoId` (`ean:<gtin>` ou `loc:<cnpj>:<codigo>`), `qtd`,
  `unidade`, `vlUnit`, `vlTotal` e `precoPorUnidadeBase` (R$/kg, R$/L ou R$/un quando o
  conteúdo é conhecido). Ou seja, **o histórico pessoal inteiro já está nas notas do
  usuário**; não falta dado novo para a primeira versão.
- `NotasService.todas(filtro, maxPaginas)` já lê várias páginas de notas (usado pelo painel)
  e `chaves()` lê as 200 últimas.
- `ProdutosService.produtosPorIds(ids)` (grupos de 30 no `in`) e `equivalentes(id)`
  (canônico + vinculados) resolvem o vínculo entre produtos de mercados diferentes.
- A página do produto já marca preços como fonte `minhas-notas`
  (`resumirPrecos(…, chavesDoUsuario)`), mas sobre a base comunitária `precos` (90 dias,
  ≤ 300), não sobre as notas do usuário.
- UI pronta: `<cp-badge-preco>` (mais barato / mais caro / igual, ícone + texto + cor),
  `<cp-preco>`, `<cp-fonte-preco>`, classes `.cp-summary`, `.cp-list-row`, `.cp-badge--*`.

**O que falta**

- Nenhuma tela compara uma nota com as compras anteriores do usuário.
- Não há índice "produto → minhas compras": o `produtoId` está dentro do array `itens` (objetos),
  então o Firestore **não consegue** consultar "notas que contêm o produto X". A comparação
  precisa ler as notas e montar o índice no cliente (ver RNF-01 e a decisão D-01).
- O `produtoId` do item é gravado na importação e **não muda** quando o produto é vinculado
  depois: item sem EAN de mercados diferentes só é reconhecido como o mesmo produto
  resolvendo o grupo de equivalência em `produtos` (`vinculadoA`).

## 2. Dados Disponíveis

| Fonte | O que dá | Acesso | Observação |
|---|---|---|---|
| `usuarios/{uid}/notas/{chave}` | Itens com `produtoId`, `vlUnit`, `qtd`, `precoPorUnidadeBase`, `cnpj`, `estabelecimentoNome`, `emissao` | Leitura do dono (regras) — `NotasService` | Fonte do histórico. Sem campo consultável por produto |
| `NotasService.todas({de}, maxPaginas)` | Todas as notas de uma janela, 20 por página | Existente | 1 leitura por nota (sem projeção de campos no SDK web) |
| `produtos/{id}` | `vinculadoA` (canônico), `conteudo`, `descricao` | Só leitura — `ProdutosService.produtosPorIds` | Resolve o grupo de equivalência |
| `produtos where vinculadoA in [...]` | Membros de cada grupo | Consulta nova (grupos de 30), mesmo padrão de `equivalentes` | Índice de campo único automático |
| `precos` (comunitário) | Preços anônimos por produto | Só leitura | **Fora do escopo**: é a base de todos; o histórico pessoal vem das notas |
| Menor Preço | Ofertas da região | Navegador | **Fora do escopo** (já é o "Tem mais barato perto?") |

## 3. Requisitos Funcionais

- **RF-01 — Comparação automática.** Ao abrir `/notas/:chave`, o app compara, sem precisar de
  clique, cada item da nota com as compras do mesmo produto nas **outras** notas do usuário
  (a própria nota nunca entra no histórico). Não chama nenhuma API externa.
- **RF-02 — Mesmo produto.** Um item de outra nota é "o mesmo produto" quando:
  (a) tem o mesmo `produtoId`; ou (b) os dois `produtoId` estão no mesmo grupo de equivalência
  (mesmo canônico por `vinculadoA`, inclusive vínculo automático por etiquetas/IA). Não há
  comparação por semelhança de texto (Jaccard) neste recurso: sem vínculo, é outro produto.
- **RF-03 — Referência de comparação (decidido: D-02).** Cada item é comparado com a **última
  vez que o usuário comprou o mesmo produto antes desta nota** (maior `emissao` menor que a da
  nota): valor, data e estabelecimento. Compras **posteriores** a esta nota não contam (numa
  nota antiga, a pergunta continua sendo "paguei mais ou menos que da vez anterior?"). Sem
  compra anterior → "Primeira compra" (RF-04). Menor preço já pago, média e quantas vezes
  comprou são só informação complementar na expansão do item (RF-09), nunca a base do badge.
- **RF-04 — Classificação e valores do item.** `mais-caro` / `mais-barato` / `igual`
  (tolerância de meio centavo, como o `CENTAVO` de `mais-barato-perto.ts`). Todo item
  comparável mostra **os valores**, não só o badge:
  - **preço unitário da última vez** (ex.: "Última vez: R$ 5,49");
  - **diferença por unidade** em R$ e % (ex.: "+R$ 0,50 (+9,1 %)");
  - **quanto pagou a mais ou a menos nesta compra**: diferença por unidade × quantidade
    comprada nesta nota, na unidade usada na comparação (RF-05) — ex.: 3 un × R$ 0,50 =
    "R$ 1,50 a mais"; 1,245 kg × R$ 2,00/kg = "R$ 2,49 a mais". Arredondado a centavos.
  Item sem compra anterior: "Primeira compra" (neutro, sem badge colorido e sem valores).
- **RF-05 — Unidade de comparação.** Compara por `precoPorUnidadeBase` quando os dois lados
  têm a mesma unidade base (produtos de peso e embalagens diferentes do mesmo grupo); senão por
  `vlUnit`. Quando nenhum dos dois é comparável (unidade base diferente e `unidade` comercial
  diferente, ex.: `UN` × `KG`), o item fica "Sem comparação" em vez de mostrar um número errado.
- **RF-06 — Total da nota.** No `.cp-summary`, um indicador "Comparado com a última vez",
  calculado **só sobre os itens comparáveis** (excluídos "Primeira compra" e "Sem
  comparação"), somando o valor "nesta compra" de cada item (RF-04):
  - **pagou a mais**: soma dos itens que subiram (ex.: "R$ 18,70 a mais em 9 itens");
  - **pagou a menos**: soma dos itens que baixaram (ex.: "R$ 6,30 a menos em 5 itens");
  - **saldo**: a mais − a menos, em destaque ("R$ 12,40 a mais que da última vez" ou "a
    menos"; "Mesmo valor" se zerar);
  - contagem "N de M itens comparados" (M = itens da nota).
  O saldo usa `$cp-pricier` quando positivo e `$cp-cheaper` quando negativo, sempre com ícone
  e texto.
- **RF-07 — Destaques.** Bloco "Comparado com suas compras" com as maiores altas e quedas
  (até 3 de cada) e um filtro na lista de itens: **Todos · Subiram · Baixaram · Primeira
  compra**. Em nota de 200 itens, é isso que torna o recurso útil sem rolar a lista toda.
- **RF-08 — Linha do item.** Na linha do item, abaixo do detalhe `qtd × vlUnit`, uma linha
  do histórico com o badge, o preço anterior e a diferença: "Última vez R$ 5,49 (12/08 ·
  Mercado X) · +R$ 0,50/un · R$ 1,50 a mais nesta compra". Convive com
  o resultado do "Tem mais barato perto?" na mesma linha, cada um com seu rótulo de fonte
  (`<cp-fonte-preco>`: "suas notas" × "Menor Preço").
- **RF-09 — Detalhe sob demanda.** Tocar na linha do histórico expande as compras daquele
  produto (até 5 mais recentes: data, mercado, valor) e um link "Ver histórico completo" para
  `/produtos/:id`.
- **RF-10 — Janela.** Considera as notas dos **últimos 12 meses** (até 20 páginas de 20 = 400
  notas). O texto do resumo informa a janela ("nos últimos 12 meses").
- **RF-11 — Estados.** Carregando (skeleton na área do resumo, a lista de itens aparece na hora
  sem esperar o histórico), sem histórico nenhum ("Esta é sua primeira nota com esses
  produtos"), erro (aviso discreto `cp-info-block--warn` com "Tentar de novo"; a nota continua
  utilizável).
- **RF-12 — Atualização.** Excluir outra nota ou importar uma nova reflete no histórico na
  próxima abertura do detalhe (não precisa ser em tempo real). O índice fica em memória na
  sessão e é invalidado quando a lista de chaves do usuário muda.

## 4. Requisitos Não Funcionais

- **RNF-01 — Custo de leitura e desempenho.** A primeira abertura lê as notas da janela
  (≤ 400 leituras) e os produtos da nota (≤ 7 consultas `in` para 200 itens + ≤ 7 consultas
  `vinculadoA in`). O índice pessoal (`produtoId → compras`) é montado **uma vez por sessão**
  num store `providedIn: 'root'` e reaproveitado ao abrir outras notas. Montar o índice e
  comparar 200 itens em < 50 ms (função pura, `Map`). A lista de itens não espera o histórico.
- **RNF-02 — Bundle.** Nada no bundle inicial: tudo dentro da rota lazy de `notas`. O bloco de
  destaques em `@defer (on viewport)`. Budget `anyComponentStyle` (6 kB aviso) respeitado:
  estilos reaproveitam `.cp-badge--*`, `.cp-summary`, `.cp-segmented` (filtro) e
  `.cp-list-row`.
- **RNF-03 — Responsividade.** Mobile (≤ 599): linha do histórico quebra em duas linhas abaixo
  da descrição; filtro em `.cp-segmented` com rolagem horizontal. Tablet/desktop: badge à
  direita junto do preço. Nada de `window.innerWidth`; se precisar, `BreakpointService`.
- **RNF-04 — Acessibilidade (WCAG AA).** Badge sempre com ícone + texto (nunca só cor);
  resumo anunciado por `role="status"` quando termina de carregar; linha expansível é
  `<button aria-expanded aria-controls>`; filtro com `aria-pressed` ou radiogroup; contraste
  dos tokens existentes já verificado por `npm run contraste` (acrescentar par novo se criar
  token). Valores com `currency` pt-BR.
- **RNF-05 — Manutenibilidade.** Standalone, OnPush, `inject()`, signals (`resource` para a
  carga, `computed` para a comparação), control flow com `track`. Regra de negócio em funções
  puras (`historico-pessoal.ts`), sem Angular, testáveis isoladas; o store só orquestra.
- **RNF-06 — Testabilidade.** Vitest: 100 % das funções puras (mesmo `produtoId`, grupo de
  equivalência, unidade base × `vlUnit`, incomparável, primeira compra, compra
  posterior ignorada, tolerância de centavo, soma do resumo). Componente com `FIRESTORE_API` fake
  (sem `vi.mock` de Firebase). Fixture: 3–4 notas reais anonimizadas de mercados diferentes
  com produtos repetidos. e2e: um cenário no Playwright com seletores por papel/label.
- **RNF-07 — Segurança e privacidade.** Só lê `usuarios/{uid}/notas` do próprio usuário (regras
  existentes) e `produtos` (leitura pública). **Nada é gravado** e nada sai do navegador: o
  histórico pessoal não vai para a base comunitária nem para Functions. Sem mudança em
  `firestore.rules`.
- **RNF-08 — Internacionalização.** Não há ngx-translate no projeto: textos em pt-BR no
  template, `LOCALE_ID` pt-BR, `currency` BRL, datas `dd/MM`.

## 5. Estrutura de Componentes Proposta

```
src/app/features/notas/
├── data-access/
│   └── historico-pessoal.store.ts      # root: resource que lê as notas da janela e os grupos;
│                                       #   índice produtoId → compras, cache por sessão
├── detalhe/
│   ├── historico-pessoal.ts            # PURO: indexarCompras, gruposDeEquivalencia,
│   │                                   #   compararItem, resumirNota, destaques
│   ├── historico-pessoal.spec.ts
│   ├── historico-resumo.ts             # <cp-historico-resumo>: indicador no .cp-summary +
│   │                                   #   bloco de destaques (@defer on viewport)
│   ├── historico-item.ts               # <cp-historico-item [comparacao]>: badge + "Última vez…"
│   │                                   #   + expansão das últimas compras
│   ├── nota-detalhe.page.html          # filtro Todos/Subiram/Baixaram/Primeira compra
│   └── nota-detalhe.page.ts            # filtro em query param (?itens=subiram)
└── notas.spec.ts                       # casos do detalhe com histórico

src/testing/fixtures/notas-historico/   # notas anonimizadas com produtos repetidos
e2e/notas-historico.spec.ts
```

Tipos (no próprio `historico-pessoal.ts`):

```ts
interface CompraPessoal { chave: string; cnpj: string; mercado: string; emissao: string;
  vlUnit: number; qtd: number; unidade: string; porUnidade: PrecoPorUnidade | null }

interface ResumoHistorico { aMais: number; itensAMais: number; aMenos: number;
  itensAMenos: number; saldo: number; comparados: number; total: number }

type ComparacaoHistorico =
  | { tipo: 'primeira-compra' }
  | { tipo: 'sem-comparacao'; compras: CompraPessoal[] }
  | { tipo: 'mais-caro' | 'mais-barato' | 'igual'; referencia: CompraPessoal;
      diferenca: number;       // por unidade comparada (R$/un, R$/kg…)
      percentual: number;
      impacto: number;         // diferenca × quantidade desta nota (RF-04), com sinal
      menor: CompraPessoal; media: number;
      vezes: number; compras: CompraPessoal[] };  // referencia = última compra anterior
```

`ProdutosService` ganha `membrosDosGrupos(canonicos: string[])` (`where('vinculadoA','in',…)`
em grupos de 30), no mesmo padrão de `produtosPorIds`.

## 6. Dependências e Pré-condições

| Item | Estado atual | Ação necessária |
|---|---|---|
| `produtoId` e `precoPorUnidadeBase` nos itens das notas | Gravados pela importação | Nenhuma. Conferir se notas antigas no dv têm `precoPorUnidadeBase` (senão cai no `vlUnit`) |
| Leitura de várias páginas de notas | `NotasService.todas()` (10 páginas) | Aceitar `maxPaginas = 20` e filtro `de` = 12 meses; já existe índice `emissao desc` |
| Grupo de equivalência em lote | Só `equivalentes(id)` (1 produto por vez) | Criar `membrosDosGrupos(canonicos)`; índice de campo único de `vinculadoA` é automático |
| Vínculo entre mercados (`vinculadoA`) | Manual + automático (etiquetas/IA) | Nenhuma; a qualidade do histórico entre mercados depende dele (ver riscos) |
| Linha do item comporta dois resultados | Hoje só o do Menor Preço | Ajustar layout de `.detalhe-item` para duas linhas de comparação |
| Ícones novos (`history`, `expand_more`) | Subset em `index.html` | Acrescentar os nomes em `icon_names=` (ordem alfabética) |
| Fixtures com produtos repetidos | Só notas soltas | Gerar com `scripts/anonimizar-fixture.mjs` |
| Firestore rules / Functions | Suficientes | Nenhuma mudança |

**Decisões e riscos**

- **D-01 — Índice no cliente (recomendado para a v1)** × agregado mantido por Function
  (`usuarios/{uid}/historico/{produtoId}`, atualizado em `gravarNota` e num trigger de
  exclusão). O cliente é zero infraestrutura e sempre coerente com as notas; custa ≤ 400
  leituras na primeira abertura da sessão. Migrar para o agregado só se os usuários passarem
  de ~400 notas/ano ou se o custo de leitura aparecer na fatura.
- **D-02 — Referência = última compra anterior (decidido pelo usuário em 2026-09-29).** O
  badge responde "paguei mais caro ou mais barato que da última vez?". Média e menor preço
  ficam só no detalhe expandido.
- **R-01 — Item sem EAN em mercado novo** só é reconhecido depois do vínculo; nesses casos a
  tela mostra "Primeira compra" mesmo que o usuário já tenha comprado em outro mercado. O
  texto do detalhe oferece "Este produto é o mesmo que…" (diálogo de vínculo existente).
- **R-02 — Promoção e desconto por item** não aparecem no `vlUnit` da SEFAZ de forma
  confiável; a comparação é sobre o preço unitário do cupom.

## 7. Critérios de Aceitação

- [ ] Ao abrir uma nota, cada item já comprado antes mostra badge "R$ X mais caro/mais
      barato" (ou "Mesmo preço") em relação à última compra anterior, com data e mercado.
- [ ] Item comprado pela primeira vez mostra "Primeira compra", sem cor de alta/queda.
- [ ] Produto com o mesmo `produtoId` em outra nota é reconhecido; produto `loc:` de outro
      mercado vinculado ao mesmo canônico também.
- [ ] Compras posteriores à nota são ignoradas: nota antiga compara com a compra anterior a
      ela, ou mostra "Primeira compra".
- [ ] A própria nota nunca entra no histórico; itens repetidos na mesma nota não se comparam
      entre si.
- [ ] Produto a granel compara por R$/kg; unidades incompatíveis mostram "Sem comparação".
- [ ] Cada item comparável mostra o preço da última vez, a diferença por unidade (R$ e %) e
      quanto pagou a mais ou a menos nesta compra (diferença × quantidade).
- [ ] O resumo mostra, só com os itens comparáveis, o total pago a mais, o total pago a menos,
      o saldo e "N de M itens comparados", e bate com a soma manual dos itens da fixture.
- [ ] O filtro Subiram/Baixaram/Primeira compra reduz a lista e fica no query param.
- [ ] A expansão do item lista até 5 compras e leva a `/produtos/:id`.
- [ ] A lista de itens aparece antes do histórico terminar; falha no histórico mostra aviso
      com "Tentar de novo" e não quebra a página.
- [ ] Abrir uma segunda nota na mesma sessão não relê as notas (verificável no teste pelo fake
      de `getDocs`).
- [ ] Nenhuma escrita no Firestore e nenhuma chamada a Functions, Menor Preço ou Claude API.
- [ ] Axe sem violações no detalhe da nota; badges com ícone + texto.
- [ ] `npm run lint`, `npm run test:ci`, `npm run contraste` e build de produção verdes, sem
      estourar budget.
