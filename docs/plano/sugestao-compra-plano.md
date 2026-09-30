# Plano de Desenvolvimento: Sugestão de compra

**Data:** 29/09/2026
**Projeto:** fed-catalogo-compara-precos (Cupom Esperto)
**Análise base:** [sugestao-compra-analise.md](../analise/sugestao-compra-analise.md)
**Branch alvo:** `main`

---

## Visão Geral

Uma tela nova, `/sugestoes` ("Sugestão de compra"), prevê o que o usuário precisa comprar a
partir das **notas dele**. Um produto é recorrente quando aparece em ao menos 3 ocasiões de
compra nos últimos 12 meses. O ciclo de recompra é a mediana dos intervalos, e com ele o
produto cai em **"Hora de repor"** (ciclo vencido), **"Em breve"** (dentro do horizonte
hoje / semana / 15 dias) ou **"Parou de comprar?"** (mais de 3 ciclos). Cada item traz a
quantidade habitual e **três preços que o próprio usuário pagou**: o último, o mais barato e
o mais caro, com data e mercado.

Há duas visões. **Lista completa** (padrão): todos os itens sem agrupar, com os totais "como
da última vez" e "no seu menor preço". **Por mercado**: usa o último preço pago em cada
mercado onde o usuário comprou para agrupar os itens por onde saíram mais barato e para
sugerir até 3 mercados, caso ele queira comprar tudo num lugar só. O usuário marca "Já tenho"
e "Não sugerir mais" (no `localStorage`, D-03), copia ou compartilha a lista. O painel ganha
um card "Hora de repor".

Tudo roda **no cliente**, sobre o cache de notas do `HistoricoPessoalStore` (D-01). Só os
grupos de equivalência (`produtos`) exigem leituras além das notas. **Não entram** a base
comunitária `precos` nem o Menor Preço (D-05). Não há Function nova, mudança em
`firestore.rules`, índice novo, IA nem escrita no Firestore.

---

## Convenções Obrigatórias

- Standalone, **OnPush** explícito, **zoneless**; `inject()`; `input()`/`output()`/`model()`.
- Estado em signals: `resource` para a carga, `computed` para sugestões/totais/cestas,
  `linkedSignal` para a seleção (reinicia quando o horizonte muda). Store `providedIn:
  'root'` expondo só `Signal` readonly.
- `@for` sempre com `track` (por `grupo`/`cnpj`); `@defer (on viewport)` no card do painel.
- Regra de negócio em **funções puras** (`sugestao.ts`), sem Angular/Firebase, com `hoje`
  recebido por parâmetro (nunca `new Date()` dentro da regra).
- Firestore só pelo token `FIRESTORE_API` (fakes nos testes). **Sem `vi.mock` de Firebase.**
- Cliente **nunca escreve** no Firestore. Sem Emulator Suite. Sem leitura de `precos` e sem
  Menor Preço nesta feature.
- Rotas com `loadChildren`; query params como fonte de verdade (`withComponentInputBinding`).
- Estilo: classe global primeiro (`.cp-page`, `.cp-page-header`, `.cp-summary`,
  `.cp-segmented`, `.cp-list` + `.cp-list-row`, `.cp-card`, `.cp-empty-state`,
  `.cp-info-block--erro`, `.cp-skeleton`, `.cp-btn-*`, `.cp-price`, `.cp-sr-only`); mixin só
  para o parametrizado (`cp-grid`); cor só por token `$cp-*`. Budget `anyComponentStyle` 6 kB.
- Breakpoint em TS só por `BreakpointService`.
- Ícone novo → `icon_names=` do `src/index.html`, em ordem alfabética.
- Textos em pt-BR no template; `currency` padrão (BRL); datas `dd/MM`; sem comentários além de
  invariantes não óbvias.
- `localStorage` sempre em `try/catch` (padrão do `NotasAbertasService`).
- e2e com `getByRole`/`getByLabel`, nunca por classe.

---

## Fases de Implementação

### Fase 1 — Fundação

**Objetivo:** expor o histórico completo e a regra de unidade, criar rota, menu e
persistência local.

#### Tarefa 1.1 — Regra de comparabilidade exportada

**Arquivo(s):** `src/app/features/notas/detalhe/historico-pessoal.ts`,
`src/app/features/notas/detalhe/historico-pessoal.spec.ts`

**O que fazer:** hoje `escolherBase(item, ref)` é privada e recebe um `ItemNota`. Extrair
uma função exportada que decide a base comum a uma **lista de compras**, sem mudar o
comportamento do detalhe da nota:

```ts
/** Base em que todas as compras podem ser comparadas, ou null. */
export function baseComum(compras: readonly CompraPessoal[]): {
  base: BaseComparacao;
  valor: (c: CompraPessoal) => number;
  aceita: (c: CompraPessoal) => boolean;
} | null
```

Regra (mesma do RF-05 do histórico): tomando a compra mais recente como referência, usa
`vlUnit` para as compras com a mesma unidade comercial e conteúdo compatível; senão usa
R$/unidade base para as que têm `porUnidade` na mesma unidade. Compra que não é aceita fica
de fora. Exportar também `unidadeNormalizada`. `escolherBase` passa a reaproveitar os mesmos
predicados.

**Critério:** os specs atuais do histórico continuam verdes. Casos novos de `baseComum`:
mesma unidade, granel em kg, embalagens diferentes com unidade base, e `UN` × `KG` sem base
(o incompatível fica fora).

#### Tarefa 1.2 — Histórico completo no store

**Arquivo(s):** `src/app/features/notas/data-access/historico-pessoal.store.ts`

**O que fazer:** novo método público

```ts
async indiceCompleto(): Promise<{ notas: Nota[]; grupos: Grupos; indice: Map<string, CompraPessoal[]> }>
```

- As notas vêm de `notas()`, o cache da sessão.
- Os grupos cobrem os ids de **todas** as notas. Generalizar o `grupos(notas)` privado para
  `gruposDe(ids)`, que reaproveita `produtosCache` e `membrosCache`.
- Para reduzir leituras (RNF-01), resolver só os ids que são `loc:` ou que aparecem em ≥ 2
  notas. Os demais (`ean:` visto uma vez) entram como o próprio grupo.
- `invalidar()` continua limpando tudo.

**Critério:** um spec com fake de `NotasService`/`ProdutosService` mostra que chamar
`indiceCompleto()` duas vezes lê as notas uma vez só. Depois de `invalidar()`, lê de novo.
Produtos `loc:` de mercados diferentes com o mesmo `vinculadoA` caem na mesma chave.

#### Tarefa 1.3 — Relógio injetável

**Arquivo(s):** `src/app/core/relogio.ts` (novo)

**O que fazer:** criar o token `RELOGIO = new InjectionToken<() => Date>('RELOGIO', {
providedIn: 'root', factory: () => () => new Date() })`. O store usa o token, e os testes
de componente fixam a data.

**Critério:** o spec da página troca o relógio e as sugestões mudam de estado de acordo.

#### Tarefa 1.4 — Itens dispensados (localStorage)

**Arquivo(s):** `src/app/features/sugestoes/data-access/dispensados.service.ts`,
`src/app/core/auth/auth.store.ts`

**O que fazer:** criar um service root com os signals `jaTenho: Map<grupo, DataIso>` e
`nunca: Set<grupo>`.

- A chave do storage é `cp-sugestao-dispensados:<uid>`, e o service relê quando o `uid` muda.
- Métodos: `marcarJaTenho(grupo, hoje)`, `naoSugerir(grupo)`, `voltarASugerir(grupo)`.
- Todo acesso ao storage fica em `try/catch`. Com o storage bloqueado, os dados valem só na
  sessão.
- Em `AuthStore.sair()`, apagar as chaves `cp-sugestao-dispensados:*`, sem importar a
  feature no auth. Um helper `limparDispensados()` no próprio `auth.store.ts` remove as
  chaves por prefixo.

**Critério:** spec do service cobre a persistência entre instâncias, a separação por `uid`, o
storage que lança erro e a limpeza no `sair()`.

#### Tarefa 1.5 — Rota, menu e ícones

**Arquivo(s):** `src/app/app.routes.ts`, `src/app/features/sugestoes/sugestoes.routes.ts`,
`src/app/core/layout/shell.ts`, `src/app/core/layout/shell.spec.ts`, `src/index.html`

**O que fazer:**
- Criar a rota `sugestoes` (`loadChildren`) com `title: 'Sugestão de compra · Cupom
  Esperto'`. Enquanto a Fase 5 não existe, ela carrega um placeholder.
- Acrescentar `{ rota: '/sugestoes', icone: 'event_repeat', rotulo: 'Sugestão de compra' }`
  em `ITENS_NAV`, depois de "Minhas notas".
- Acrescentar `event_repeat`, `share` e `visibility_off` em `icon_names=`, em ordem
  alfabética.

**Critério:** o menu mostra o item e a navegação abre a rota. O `shell.spec.ts` passa, porque
já compara com `ITENS_NAV`. Os ícones renderizam como glifo, não como texto.

---

### Fase 2 — Regra pura

**Objetivo:** toda a lógica de sugestão, preços e totais em `sugestao.ts`, com 100 % de
cobertura.

#### Tarefa 2.1 — Tipos e constantes

**Arquivo(s):** `src/app/features/sugestoes/sugestao.ts`

**O que fazer:** criar os tipos da análise (`EstadoSugestao`, `Confianca`, `Horizonte`,
`Ocasiao`, `Sugestao`, `FaixaDePreco`, `UltimoPorMercado`, `TotaisDaLista`,
`GrupoPorMercado`, `Cesta`) e as constantes exportadas (D-02):

```ts
export const MIN_OCASIOES = 3;
export const JUNTAR_DIAS = 2;
export const CICLO_MIN_DIAS = 3;
export const CICLO_MAX_DIAS = 120;
export const EM_BREVE_A_PARTIR = 0.8;
export const PAROU_ACIMA = 3;
export const CV_INSTAVEL = 0.6;
export const DIAS_HORIZONTE: Record<Horizonte, number> = { hoje: 0, semana: 7, quinzena: 15 };
```

**Critério:** o arquivo compila e não importa Angular.

#### Tarefa 2.2 — Ocasiões, ciclo, estado e confiança

**Arquivo(s):** `sugestao.ts`, `sugestao.spec.ts`

**O que fazer:**
- `ocasioes(compras)`: agrupa compras com menos de `JUNTAR_DIAS` de diferença e soma as
  quantidades (RF-02). A entrada vem ordenada da mais recente para a mais antiga (como o
  `indexarCompras`), e a saída sai em ordem cronológica.
- `ciclo(ocasioes)`: mediana dos intervalos em dias, com piso de `CICLO_MIN_DIAS`. Com menos
  de 2 ocasiões devolve `null`.
- `estadoDaSugestao(diasDesde, ciclo, horizonte)`: devolve `repor`, `em-breve`, `parou` ou
  `null` (RF-04).
- `confianca(ocasioes, intervalos)`: nível pela contagem (≥ 5 / 3–4 / 2) e rebaixado um
  nível quando o coeficiente de variação passa de `CV_INSTAVEL` (RF-05).

**Critério:** specs cobrem a junção de < 2 dias, a mediana com número par e ímpar, o piso de
3 dias, o corte de 120 dias, os limites de atraso 0,79 / 0,8 / 1 / 3 / 3,01, o horizonte
`hoje`/`semana`/`quinzena` e a confiança rebaixada pelo CV.

#### Tarefa 2.3 — Quantidade sugerida

**Arquivo(s):** `sugestao.ts`, `sugestao.spec.ts`

**O que fazer:** `quantidadeSugerida(ocasioes)` devolve a mediana da quantidade por ocasião.

- Quando todas as compras têm `quantidadeNaUnidadeBase` (de `@shared/unidade`), a mediana
  sai em kg, L ou un.
- Senão, usa a unidade comercial mais frequente (`unidadeNormalizada`).
- Arredonda: 3 casas para kg/L e inteiro para un/UN.

**Critério:** casos 2 × 1 L e 1 × 2 L → "2 L", granel 1,245 kg, mistura sem unidade base →
unidade mais frequente.

#### Tarefa 2.4 — Faixa de preço e último por mercado

**Arquivo(s):** `sugestao.ts`, `sugestao.spec.ts`

**O que fazer:**
- `faixaDePreco(compras)` → `FaixaDePreco` (RF-07). O `ultimoPago` é a compra mais recente.
  Mais barato e mais caro saem de `baseComum(compras)` aplicada às compras aceitas. Em
  empate, fica a compra mais recente. Sem base, `maisBarato` e `maisCaro` ficam `null`.
- `ultimoPorMercado(compras)` → `Map<cnpj, CompraPessoal>` com a compra mais recente de cada
  mercado (RF-09).

**Critério:** casos cobrem todas as compras iguais (mais barato = mais caro, e a UI mostra
"Sempre"), compra incomparável fora da faixa mas presente como último pago, e dois mercados
com várias compras (fica só a última de cada um).

#### Tarefa 2.5 — `sugerir`

**Arquivo(s):** `sugestao.ts`, `sugestao.spec.ts`

**O que fazer:**

```ts
export function sugerir(
  indice: ReadonlyMap<string, readonly CompraPessoal[]>,
  hoje: Date,
  horizonte: Horizonte,
  dispensados: { jaTenho: ReadonlyMap<string, string>; nunca: ReadonlySet<string> },
): Sugestao[]
```

- Para cada grupo, combina 2.2 a 2.4.
- Fica de fora o que tem menos de 2 ocasiões, ciclo acima de 120 dias ou estado `null`.
- Com 2 ocasiões, a confiança é sempre `baixa` (RF-01).
- Fica de fora o grupo em `nunca`.
- Fica de fora o grupo em `jaTenho` enquanto `hoje < data + ciclo`. O `jaTenho` também deixa
  de valer se houver uma ocasião depois da data marcada.
- A `descricao` vem da compra mais recente.
- Ordena por estado (`repor` → `em-breve` → `parou`), depois por confiança e depois por
  atraso decrescente.

**Critério:** uma fixture sintética (Tarefa 2.7) gera exatamente os itens esperados em cada
seção para uma data fixa. Os casos de "já tenho" (expira no ciclo seguinte e é invalidado por
nova compra) e de "nunca" passam.

#### Tarefa 2.6 — Totais, agrupamento e cestas

**Arquivo(s):** `sugestao.ts`, `sugestao.spec.ts`

**O que fazer:**
- `totaisDaLista(itens)`, onde cada item é uma sugestão selecionada com a quantidade editada
  e a faixa (RF-08):
  - `comoDaUltimaVez` = Σ último pago × qtd;
  - `noMenorPreco` = Σ mais barato × qtd, só nos itens com faixa;
  - `economia` = diferença entre os dois, calculada sobre os mesmos itens;
  - arredondar a centavos.
  - Para a quantidade na base comparada, converter com `quantidadeNaUnidadeBase` quando a
    base for kg/L/un.
- `agruparPorMaisBarato(itens)` → `GrupoPorMercado[]` (RF-09): para cada item, o `cnpj` com o
  menor valor em `ultimoPorMercado`. Os grupos ordenam por total decrescente. Todo item cai
  num grupo.
- `montarCestas(itens, max = 3)` → `Cesta[]` (RF-09): para cada mercado que aparece em algum
  `ultimoPorMercado`, lista os itens cobertos, os que faltam e o total. Ordena por
  cobertura e depois por total. Quando os conjuntos cobertos diferem, a ordem por total
  compara só os itens comuns aos dois mercados.
- `textoDaLista(visao, …)` monta o texto de "Copiar lista" (RF-13).

**Critério:** as somas batem com o cálculo manual da fixture. Nenhum item some no
agrupamento. Um mercado que cobre menos não vence por ter total menor. O texto copiado sai
estável em snapshot.

#### Tarefa 2.7 — Fixture sintética

**Arquivo(s):** `src/testing/fixtures/sugestao/notas.ts`

**O que fazer:** um gerador determinístico de `Nota[]` para 12 meses a partir de uma data
fixa, com 3 mercados. Produtos:
- semanal (leite, sempre no mercado A);
- quinzenal (café, alternando A/B com preços diferentes);
- a granel (banana em kg);
- mensal com embalagens diferentes (detergente 500 mL × 1 L);
- esporádico (> 120 dias);
- abandonado (última compra há 4 ciclos);
- 2 ocasiões apenas;
- `loc:` em dois mercados vinculado ao mesmo canônico (com `produtos.ts` correspondente).

Sem dados reais nem PII.

**Critério:** a fixture é usada pelos specs de 2.5, 2.6 e 3.1.

---

### Fase 3 — Store

**Objetivo:** orquestrar carga e derivações para a página e o painel.

#### Tarefa 3.1 — `SugestoesStore`

**Arquivo(s):** `src/app/features/sugestoes/data-access/sugestoes.store.ts`, `sugestoes.store.spec.ts`

**O que fazer:** store root com estas peças:
- **Carga:** `private readonly dados = resource({ params: () => this.auth.uid(), loader:
  () => this.historico.indiceCompleto() })`.
- **Entradas:** `horizonte = signal<Horizonte>('semana')`, definido pela página a partir do
  query param.
- **Sugestões:** `sugestoes = computed(() => sugerir(indice, relogio(), horizonte,
  dispensados))`, que expõe `repor`, `emBreve`, `maisSugestoes` (confiança baixa), `parou` e
  `ocultos` (itens em `nunca`, com descrição).
- **Seleção e quantidades:** `selecao = linkedSignal`, que reinicia com `repor` + `emBreve`
  de confiança alta/média sempre que as sugestões mudam; `quantidades = linkedSignal` com as
  sugeridas. Métodos `alternar(grupo)` e `definirQuantidade(grupo, n)`.
- **Visões:** `totais`, `porMercado` e `cestas` são `computed` sobre os itens selecionados.
  Os nomes dos mercados saem das próprias compras (`mercado`), sem leitura extra.
- **Estados:** `carregando`, `erro`, `insuficiente` (menos de 3 notas ou nenhum recorrente) e
  `recarregar()`.
- **Painel:** `horaDeRepor = computed(() => repor.slice(0, 5))`.

Expor tudo com `asReadonly()` ou `computed`.

**Critério:** spec com fake do `HistoricoPessoalStore` e `RELOGIO` fixo cobre:
- as seções esperadas;
- trocar o horizonte, que muda o "Em breve" e reinicia a seleção;
- desmarcar um item, que recalcula os totais;
- `marcarJaTenho`, que tira o item;
- o erro no loader, que aparece em `erro()`.

---

### Fase 4 — Componentes de apresentação

**Objetivo:** peças pequenas e burras, só com `input()`/`output()`.

#### Tarefa 4.1 — `<cp-faixa-preco>`

**Arquivo(s):** `src/app/features/sugestoes/ui/faixa-preco.ts`

**O que fazer:** `input.required<FaixaDePreco>()`. Mostra "Última vez", "Mais barato" e
"Mais caro", cada um com `<cp-preco>`, a data `dd/MM` e o mercado.
- Se o mais barato for igual ao mais caro, mostra "Sempre R$ X".
- Sem faixa, mostra só a última vez.
- `<cp-badge-preco>` do último pago contra o mais barato: "R$ 0,80 acima do seu menor preço"
  ou "É o seu menor preço".
- Layout: `<dl>` com colunas no desktop e empilhado no mobile (CSS com os mixins de
  breakpoint).

**Critério:** o spec renderiza os três casos e o badge sempre leva ícone + texto.

#### Tarefa 4.2 — `<cp-sugestao-item>`

**Arquivo(s):** `src/app/features/sugestoes/ui/sugestao-item.ts`

**O que fazer:**
- **Inputs:** `sugestao`, `selecionado`, `quantidade`.
- **Outputs:** `alternar`, `quantidade`, `jaTenho`, `naoSugerir`.
- **Linha `.cp-list-row`:**
  - checkbox nativo com `<label>` = nome;
  - link do nome para `/produtos/:id` do canônico;
  - "≈ qtd" com stepper (`<input type="number">` com label);
  - texto "Costuma comprar a cada N dias · última vez há M dias";
  - `<cp-faixa-preco>`;
  - estado com ícone + texto (`schedule` para "Hora de repor", `event_repeat` para "Em
    breve").
- **Ações:** menu com "Já tenho" e "Não sugerir mais". O `aria-label` inclui o nome do
  produto.
- **Expansão "Por que esta sugestão?":** `<button aria-expanded aria-controls>` que lista as
  últimas 5 ocasiões (data, mercado, quantidade, preço).

**Critério:** o spec cobre os eventos emitidos, `aria-expanded` alternando e o texto
acessível das ações.

#### Tarefa 4.3 — `<cp-lista-completa>`

**Arquivo(s):** `src/app/features/sugestoes/ui/lista-completa.ts`

**O que fazer:**
- Seções `<h2>` "Hora de repor" e "Em breve" com `<cp-sugestao-item>`.
- "Mostrar mais N sugestões" para a confiança baixa.
- "Parou de comprar?" colapsado.
- "Itens ocultos" com "Voltar a sugerir".
- Rodapé `.cp-summary` com `role="status"`: "Como da última vez", "No seu menor preço" e
  "Seu melhor cenário: R$ X a menos".

**Critério:** o spec mostra que os totais mudam ao desmarcar e que as seções colapsadas
abrem por botão.

#### Tarefa 4.4 — `<cp-por-mercado>`

**Arquivo(s):** `src/app/features/sugestoes/ui/por-mercado.ts`

**O que fazer:**
- **"Onde cada item saiu mais barato":** um `.cp-card` por mercado, com nome, N itens,
  total e a lista (nome, qtd e último preço lá). Abaixo, "Comprando cada item onde saiu mais
  barato: R$ X em N mercados".
- **"Um mercado só":** até 3 cards com cobertura "N de M itens", total e "Faltam: …".
- Desktop com `cp-grid`/painel lateral e mobile empilhado.

**Critério:** o spec mostra que todo item aparece em algum card e que a ordem das cestas
segue a cobertura.

---

### Fase 5 — Página `/sugestoes`

**Objetivo:** montar a tela com query params, estados e exportação.

#### Tarefa 5.1 — Página

**Arquivo(s):** `src/app/features/sugestoes/sugestoes.page.ts|html|scss`, `sugestoes.routes.ts`

**O que fazer:**
- **Query params:** `horizonte` (`hoje|semana|quinzena`, padrão `semana`) e `visao`
  (`lista|mercado`, padrão `lista`), como `input()` via `withComponentInputBinding`. O valor
  padrão não aparece na URL.
- **Topo:**
  - `.cp-page-header` "Sugestão de compra";
  - resumo `role="status"`: "N itens para repor · total estimado R$ X · janela de 12 meses";
  - dois `.cp-segmented` com `aria-pressed`: horizonte e visão.
- **Corpo:** `@switch` da visão, com `<cp-lista-completa>` ou `<cp-por-mercado>`.
- **Estados:**
  - skeleton enquanto carrega;
  - `<cp-empty-state>` quando o histórico é insuficiente, com atalho "Importar nota";
  - `.cp-info-block--erro` com "Tentar de novo".
- **Exportar:**
  - "Copiar lista" usa `navigator.clipboard.writeText(textoDaLista(...))` e mostra snackbar
    "Lista copiada";
  - "Compartilhar" só aparece com `navigator.share`;
  - no mobile, as ações ficam numa barra fixa no rodapé.

**Critério:** trocar o horizonte ou a visão atualiza a URL e o conteúdo, e recarregar a página
mantém a escolha. A página funciona com o storage bloqueado.

#### Tarefa 5.2 — FAB no mobile

**Arquivo(s):** `src/app/core/layout/shell.ts|html`

**O que fazer:** esconder o FAB "Importar nota" quando a rota ativa começa com `/sugestoes`,
para não sobrepor a barra de ações. Usar um `computed` sobre a URL, que o shell já observa
com `NavigationEnd`.

**Critério:** em 375 px não há sobreposição (screenshot na verificação) e o FAB volta nas
outras rotas.

---

### Fase 6 — Card no painel

**Objetivo:** atalho "Hora de repor" no `/`.

#### Tarefa 6.1 — `<cp-hora-de-repor>`

**Arquivo(s):** `src/app/features/painel/hora-de-repor.ts`, `painel.page.html`, `painel.page.ts`

**O que fazer:**
- O componente injeta `SugestoesStore` e lista `horaDeRepor()` (nome e "há N dias", no máximo
  5) com o link "Ver sugestão completa" para `/sugestoes`.
- Não renderiza nada quando a lista está vazia ou há erro.
- No painel, entra em `@defer (on viewport) { <cp-hora-de-repor /> }` depois das últimas
  notas.

**Critério:** o spec do painel mostra o card com 5 itens e nenhum card sem sugestão. O build
mostra que `sugestao.ts` e o store não estão no chunk `main`.

---

### Fase 7 — Qualidade

**Objetivo:** fechar testes, a11y, e2e, budgets e documentação.

#### Tarefa 7.1 — Specs de página

**Arquivo(s):** `src/app/features/sugestoes/sugestoes.spec.ts`

**O que fazer:** usar a fixture sintética com `FIRESTORE_API` fake e `RELOGIO` fixo, e
cobrir:
- as seções renderizadas;
- a troca de visão e de horizonte;
- "Já tenho", que some e persiste após remontar;
- "Copiar lista", com `clipboard` fake;
- o estado insuficiente e o estado de erro;
- **nenhuma consulta a `precos`** (fake de `getDocs` só recebe `notas`/`produtos`).

**Critério:** `npm run test:ci` verde, com cobertura de 100 % em `sugestao.ts`.

#### Tarefa 7.2 — e2e

**Arquivo(s):** `e2e/sugestoes.spec.ts`, `e2e/a11y.spec.ts`

**O que fazer:**
- Seguir o padrão de `notas-historico.spec.ts`: `bloquearServicosReais`, `entrar` e pular
  quando `!TEM_USUARIO_E2E`.
- Abrir `/sugestoes` pelo menu (`getByRole('link', { name: 'Sugestão de compra' })`).
- Conferir o resumo **ou** o estado vazio; `test.skip` se o usuário de teste não tiver
  recorrentes.
- Trocar para "Por mercado" (`?visao=mercado`) e depois o horizonte.
- Incluir `/sugestoes` na varredura do axe.

**Critério:** `npm run e2e` verde em `chromium` e `mobile`, e axe sem violações.

#### Tarefa 7.3 — Lint, contraste, build e budgets

**O que fazer:** rodar `npm run lint`, `npm run contraste` (acrescentar par em
`scripts/contraste.mjs` se criar token), `ng build --configuration=production` e conferir o
`main` e o `anyComponentStyle` dos componentes novos.

**Critério:** tudo verde, sem aviso novo de budget.

#### Tarefa 7.4 — Verificação no navegador (dv)

**O que fazer:** subir `npm start`, entrar com o usuário de teste e abrir `/sugestoes` em
desktop e em 375 px. Conferir contra as notas reais do dv:
- os três preços de um item batem com as notas dele;
- "Por mercado" usa só mercados em que ele comprou;
- o FAB não sobrepõe;
- no network, nenhuma leitura de `precos` nem chamada a Menor Preço ou Functions.

**Critério:** screenshots das duas visões e o log de rede sem essas chamadas.

#### Tarefa 7.5 — Documentação

**Arquivo(s):** `CLAUDE.md`

**O que fazer:** acrescentar a rota `/sugestoes` em **Rotas**, "Sugestão de compra" em
**Shell/Itens** e uma seção curta "Sugestão de compra" com:
- regra e constantes em `sugestao.ts`;
- `indiceCompleto()`;
- só preços do usuário (D-05);
- `localStorage` dos dispensados, limpo no `sair()`;
- `RELOGIO`;
- card do painel.

**Critério:** o CLAUDE.md descreve a feature sem repetir a análise.

---

## Estrutura Final de Arquivos

```
src/
├── index.html                                   # F1.5 icon_names (+event_repeat, share, visibility_off)
├── app/
│   ├── app.routes.ts                            # F1.5 rota 'sugestoes'
│   ├── core/
│   │   ├── relogio.ts                           # F1.3 token RELOGIO (novo)
│   │   ├── auth/auth.store.ts                   # F1.4 limpar dispensados no sair()
│   │   └── layout/
│   │       ├── shell.ts                         # F1.5 ITENS_NAV · F5.2 FAB oculto em /sugestoes
│   │       ├── shell.html                       # F5.2
│   │       └── shell.spec.ts                    # F1.5
│   └── features/
│       ├── notas/
│       │   ├── data-access/historico-pessoal.store.ts   # F1.2 indiceCompleto(), gruposDe(ids)
│       │   └── detalhe/
│       │       ├── historico-pessoal.ts                 # F1.1 baseComum, unidadeNormalizada
│       │       └── historico-pessoal.spec.ts            # F1.1
│       ├── painel/
│       │   ├── hora-de-repor.ts                 # F6.1 (novo)
│       │   ├── painel.page.html                 # F6.1 @defer
│       │   └── painel.page.ts                   # F6.1
│       └── sugestoes/                           # (novo)
│           ├── sugestoes.routes.ts              # F1.5 / F5.1
│           ├── sugestao.ts                      # F2.1–2.6 regra pura
│           ├── sugestao.spec.ts                 # F2.2–2.6
│           ├── data-access/
│           │   ├── dispensados.service.ts       # F1.4
│           │   ├── dispensados.service.spec.ts  # F1.4
│           │   ├── sugestoes.store.ts           # F3.1
│           │   └── sugestoes.store.spec.ts      # F3.1
│           ├── ui/
│           │   ├── faixa-preco.ts               # F4.1
│           │   ├── sugestao-item.ts             # F4.2
│           │   ├── lista-completa.ts            # F4.3
│           │   └── por-mercado.ts               # F4.4
│           ├── sugestoes.page.ts|html|scss      # F5.1
│           └── sugestoes.spec.ts                # F4.x / F7.1
└── testing/fixtures/sugestao/
    ├── notas.ts                                 # F2.7 gerador determinístico
    └── produtos.ts                              # F2.7 grupos loc: vinculados

e2e/
├── sugestoes.spec.ts                            # F7.2
└── a11y.spec.ts                                 # F7.2 (+ /sugestoes)

CLAUDE.md                                        # F7.5
```

---

## Ordem de Execução Recomendada

```
F1.1 baseComum ──┐
F1.2 indiceCompleto ─┼──► F2.1 tipos ─► F2.2 ciclo ─► F2.3 qtd ─► F2.4 faixa ─► F2.5 sugerir ─► F2.6 totais/cestas
F1.3 RELOGIO ────┤                                   ▲
F1.4 dispensados ┤                          F2.7 fixture (junto com F2.2)
F1.5 rota/menu ──┘
                                     F2.x ──► F3.1 store ──► F4.1 faixa ─► F4.2 item ─► F4.3 lista
                                                                                  └──► F4.4 por mercado
                                     F4.x ──► F5.1 página ─► F5.2 FAB
                                     F3.1 ──► F6.1 card do painel
                                     F5 + F6 ──► F7.1 specs ─► F7.2 e2e ─► F7.3 build ─► F7.4 dv ─► F7.5 docs
```

A Fase 1 é independente entre si. As Fases 4.1–4.4 podem andar em paralelo depois da 3.1. A
Fase 6 só depende da 3.1.

---

## Critérios de Aceitação Globais

- [ ] "Sugestão de compra" aparece no menu e abre `/sugestoes`, com rota lazy e sem crescimento
      do `main`.
- [ ] Produto com ≥ 3 ocasiões e ciclo vencido aparece em "Hora de repor" com "costuma comprar a
      cada N dias, última vez há M dias"; 0,8 ≤ atraso < 1 ou dentro do horizonte aparece em
      "Em breve"; atraso > 3 só em "Parou de comprar?".
- [ ] Compras com menos de 2 dias de diferença contam como uma ocasião; produto vinculado entre
      mercados forma uma série só; ciclo > 120 dias e 1 ocasião ficam fora.
- [ ] A quantidade sugerida é a mediana das ocasiões, em unidade base quando possível.
- [ ] Cada item mostra último pago, mais barato e mais caro **só das compras do usuário**, com
      data e mercado; preços iguais → "Sempre R$ X".
- [ ] "Lista completa" (padrão) mostra todos os itens sem agrupar, com totais "como da última
      vez", "no seu menor preço" e a diferença; desmarcar ou mudar quantidade recalcula.
- [ ] "Por mercado" usa só mercados onde o usuário comprou e o último preço pago em cada um;
      todo item aparece em algum grupo; "um mercado só" ordena por cobertura.
- [ ] Horizonte e visão ficam em query params e sobrevivem a recarregar.
- [ ] "Já tenho" some até o próximo ciclo (ou até nova compra); "Não sugerir mais" some até
      "Voltar a sugerir"; ambos por `uid`, sobrevivem a recarregar e são apagados no "Sair".
- [ ] "Copiar lista" copia o texto da visão atual; "Compartilhar" só com `navigator.share`.
- [ ] Histórico insuficiente mostra estado vazio com "Importar nota"; erro mostra "Tentar de
      novo" sem quebrar a tela.
- [ ] O painel mostra "Hora de repor" (até 5) com link para `/sugestoes` e some sem sugestão.
- [ ] Abrir `/sugestoes` após o detalhe de uma nota não relê as notas.
- [ ] Nenhuma escrita no Firestore; nenhuma leitura de `precos`; nenhuma chamada a Functions,
      Menor Preço ou Claude API.
- [ ] Mobile (375 px) sem sobreposição com o FAB; desktop com os três preços alinhados.
- [ ] Axe sem violações em `/sugestoes`; estados e badges com ícone + texto.
- [ ] `npm run lint`, `npm run test:ci` (100 % em `sugestao.ts`), `npm run contraste`,
      `npm run e2e` e `ng build --configuration=production` verdes, sem aviso novo de budget.
