# Plano de Desenvolvimento: Lista de compras

**Data:** 30/09/2026
**Projeto:** fed-catalogo-compara-precos (Cupom Esperto)
**Análise base:** [lista-compras-analise.md](../analise/lista-compras-analise.md)
**Branch alvo:** `main`

---

## Visão Geral

Uma área nova, `/listas` ("Lista de compras"), onde o usuário mantém até **5 listas**. Cada lista
é um documento em `usuarios/{uid}/listas/{listaId}` e cada item um documento em
`usuarios/{uid}/listas/{listaId}/itens/{itemId}` (D-01, D-02), gravados **direto pelo cliente**
com o SDK modular. Itens entram à mão (com autocompletar do histórico pessoal), a partir da
Sugestão de compra, da página do produto ou dos itens de uma nota. No mercado, tocar no item
marca "no carrinho"; tudo funciona sem sinal (fila local do cache persistente do Firestore) e a
tela fica acesa enquanto há itens pendentes.

Depois da compra, "Ler a nota desta compra" reaproveita o fluxo de `/importar` com a lista em
contexto. A **conferência** (`/listas/:id/conferir?chave=`) liga os itens da lista aos itens da
nota — primeiro pelo grupo do produto, depois por semelhança de texto (Jaccard ≥ 0,4 liga, 0,25
a 0,4 pergunta; D-04) — e mostra **Comprados**, **Confirme**, **Faltou** e **Fora da lista** com
os valores. Salvar grava o vínculo e o produto aprendido nos itens digitados. Na finalização o
usuário **exclui** a lista, **guarda para usar de novo** (desmarcada, sem vínculos),
**mantém só o que faltou** ou **lê outra nota** (compra em dois mercados) (D-03).

Preços de referência só das notas do usuário (D-05). **Nenhuma Function nova**, nenhuma IA, sem
Menor Preço e sem `precos` comunitário. Mudam o `firestore.rules`, o token `FIRESTORE_API` e as
telas de Importar, Sugestões, Produto, Nota e Painel.

---

## Convenções Obrigatórias

- Standalone, **OnPush** explícito, **zoneless**; `inject()`; `input()`/`output()`/`model()`/
  `viewChild()`.
- Estado em signals; `onSnapshot` → `Observable` → `toSignal()` (padrão do `PendentesService`);
  `takeUntilDestroyed()` em toda subscription manual. Stores `providedIn: 'root'` expondo só
  `Signal` readonly.
- Regra de negócio em **funções puras** (`features/listas/lista.ts`), sem Angular/Firebase, com
  datas recebidas por parâmetro (`RELOGIO` no store).
- Firestore só pelo token `FIRESTORE_API`. **Sem `vi.mock` de módulos do Firebase.** Sem
  Emulator Suite.
- **Escrita do cliente só em `usuarios/{uid}/listas/**`.** Nada em `produtos`, `precos`,
  `estabelecimentos`, notas, pendentes ou apelidos.
- **Escrita otimista, sem `await` na UI:** com o cache persistente, a promessa do `commit()` só
  resolve quando o servidor confirma; offline ela fica pendente. A UI atualiza pelo
  `onSnapshot` local (que já reflete a escrita) e só trata o `catch` (regra recusou).
- Contadores do cabeçalho (`qtdItens`, `qtdMarcados`) sempre no **mesmo `writeBatch`** do item,
  com `increment()`.
- Signal Forms (`@angular/forms/signals`) nos campos; `<label>` + `<input class="cp-field">`.
- Rotas com `loadChildren`/`loadComponent`; query params pela `withComponentInputBinding`.
- `@for` sempre com `track` (`item.id`, `lista.id`); `@defer (on viewport)` no card do painel;
  diálogos carregados por `import()`.
- Estilo: classe global primeiro (`.cp-page`, `.cp-page-header`, `.cp-list` + `.cp-list-row`,
  `.cp-card`, `.cp-summary`, `.cp-empty-state`, `.cp-info-block--warn/--erro`, `.cp-skeleton`,
  `.cp-btn-*`, `.cp-price`, `.cp-chip`, `.cp-sr-only`); cor só por token `$cp-*`; budget
  `anyComponentStyle` 6 kB.
- Breakpoint em TS só por `BreakpointService`.
- Ícone novo → `icon_names=` do `src/index.html`, em ordem alfabética.
- Textos pt-BR no template; `currency` padrão; datas `dd/MM`; sem comentários além de
  invariantes não óbvias.
- e2e com `getByRole`/`getByLabel`, nunca por classe.

---

## Fases de Implementação

### Fase 1 — Fundação

**Objetivo:** modelo, API de escrita, regras, rota, menu e ícones.

#### Tarefa 1.1 — Modelo

**Arquivo(s):** `shared/model.ts`

**O que fazer:** acrescentar os tipos da análise (seção 2), com `id` só no tipo de leitura:

```ts
export type StatusLista = 'aberta' | 'aguardando-nota';
export type OrigemItemLista = 'manual' | 'sugestao' | 'historico' | 'produto' | 'nota';

/** `usuarios/{uid}/listas/{listaId}` — privado, gravado pelo cliente. */
export interface ListaCompras {
  nome: string;
  status: StatusLista;
  criadaEm: DataIso;
  atualizadaEm: DataIso;
  qtdItens: number;
  qtdMarcados: number;
  ultimaCompraEm: DataIso | null;
  notas: string[];
  pendentes: string[];
}

/** `usuarios/{uid}/listas/{listaId}/itens/{itemId}` — privado, gravado pelo cliente. */
export interface ItemLista {
  texto: string;
  grupo: string | null;
  quantidade: number | null;
  unidade: string | null;
  base: UnidadeBase | null;
  origem: OrigemItemLista;
  ordem: number;
  marcado: boolean;
  marcadoEm: DataIso | null;
  vinculo: VinculoItemLista | null;
}

export interface VinculoItemLista {
  chave: string;
  n: number;
  produtoId: ProdutoId;
  descricao: string;
  qtd: number;
  unidade: string;
  vlTotal: number;
  cnpj: string;
  mercado: string;
  como: 'grupo' | 'texto' | 'manual';
}

export type ComId<T> = T & { id: string };
```

`origem: 'nota'` é o item "Adicionar à lista" vindo de "Fora da lista" (RF-11).

**Critério:** `npm --prefix functions run typecheck` e `ng build` compilam.

#### Tarefa 1.2 — Escrita no `FIRESTORE_API`

**Arquivo(s):** `src/app/core/firebase/firestore-api.ts` e os fakes usados nos specs
(procurar por `FIRESTORE_API` em `src/**/*.spec.ts` e `src/testing/`)

**O que fazer:** acrescentar `setDoc`, `updateDoc`, `writeBatch` e `increment`. Id novo por
`doc(collection(db, caminho))` (já disponível). Se houver um fake compartilhado, estendê-lo com
um `writeBatch` que registra as operações (`set`/`update`/`delete`) e um `commit` controlável
(resolve, rejeita ou fica pendente, para testar o offline).

**Critério:** specs existentes continuam passando; o `main` não cresce além do que o SDK já
traz (as funções vêm do mesmo módulo `firebase/firestore`, já no chunk do token).

#### Tarefa 1.3 — Regras do Firestore

**Arquivo(s):** `firestore.rules`, `docs/qualidade/regras-firestore-checklist.md`

**O que fazer:** dentro de `match /usuarios/{uid}` (o `allow write: if false` do documento
raiz não se aplica a subcoleções):

```
function texto(v, min, max) { return v is string && v.size() >= min && v.size() <= max; }
function dataOuNulo(v) { return v == null || texto(v, 20, 30); }
function listaValida(d) {
  return d.keys().hasOnly(['nome','status','criadaEm','atualizadaEm','qtdItens','qtdMarcados',
                           'ultimaCompraEm','notas','pendentes'])
    && texto(d.nome, 1, 60) && d.status in ['aberta', 'aguardando-nota']
    && texto(d.criadaEm, 20, 30) && texto(d.atualizadaEm, 20, 30) && dataOuNulo(d.ultimaCompraEm)
    && d.qtdItens is int && d.qtdItens >= 0 && d.qtdItens <= 150
    && d.qtdMarcados is int && d.qtdMarcados >= 0 && d.qtdMarcados <= d.qtdItens
    && d.notas is list && d.notas.size() <= 3
    && d.pendentes is list && d.pendentes.size() <= 3;
}
function vinculoValido(v) {
  return v == null || (v.keys().hasOnly(['chave','n','produtoId','descricao','qtd','unidade',
                                         'vlTotal','cnpj','mercado','como'])
    && v.chave is string && v.chave.matches('^[0-9]{44}$') && v.n is int
    && texto(v.produtoId, 5, 120) && texto(v.descricao, 1, 200) && v.qtd is number
    && texto(v.unidade, 0, 10) && v.vlTotal is number && texto(v.cnpj, 14, 14)
    && texto(v.mercado, 0, 120) && v.como in ['grupo', 'texto', 'manual']);
}
function itemValido(d) {
  return d.keys().hasOnly(['texto','grupo','quantidade','unidade','base','origem','ordem',
                           'marcado','marcadoEm','vinculo'])
    && texto(d.texto, 1, 80) && (d.grupo == null || texto(d.grupo, 5, 120))
    && (d.quantidade == null || (d.quantidade is number && d.quantidade > 0 && d.quantidade <= 999))
    && (d.unidade == null || texto(d.unidade, 1, 10))
    && (d.base == null || d.base in ['kg', 'L', 'un'])
    && d.origem in ['manual', 'sugestao', 'historico', 'produto', 'nota']
    && d.ordem is number && d.marcado is bool && dataOuNulo(d.marcadoEm)
    && vinculoValido(d.vinculo);
}

match /listas/{listaId} {
  allow read, delete: if dono(uid);
  allow create, update: if dono(uid) && listaValida(request.resource.data);
  match /itens/{itemId} {
    allow read, delete: if dono(uid);
    allow create, update: if dono(uid) && itemValido(request.resource.data);
  }
}
```

O limite de 5 listas é do cliente (regra não conta documentos; o custo de burlar é só do
próprio usuário). No checklist, acrescentar os casos: dono cria lista/item válidos; outro uid
lê/grava → negado; campo extra → negado; `texto` com 81 caracteres → negado; `quantidade` 0 →
negado; `qtdItens` 151 → negado; `vinculo.chave` com 43 dígitos → negado; escrita em
`usuarios/{uid}/notas` continua negada.

**Critério:** `firebase` aceita o arquivo (validação no deploy do usuário:
`npm run deploy:rules:dev`); checklist atualizado. **Deploy só pelo usuário.**

#### Tarefa 1.4 — Rota, menu, FAB e ícones

**Arquivo(s):** `src/app/app.routes.ts`, `src/app/features/listas/listas.routes.ts`,
`src/app/core/layout/shell.ts`, `src/app/core/layout/shell.spec.ts`, `src/index.html`

**O que fazer:**
- `app.routes.ts`: `{ path: 'listas', loadChildren: () => import('./features/listas/listas.routes') }`
  depois de `sugestoes`.
- `listas.routes.ts`: `''` (título "Listas de compras · Cupom Esperto"), `':id'` ("Lista de
  compras · …") e `':id/conferir'` ("Conferir nota · …"), todos `loadComponent`.
- `ITENS_NAV`: `{ rota: '/listas', icone: 'checklist', rotulo: 'Lista de compras' }` depois de
  "Sugestão de compra".
- `mostrarFab`: esconder também em `/listas/<id>` (a lista e a conferência têm ação fixa no
  rodapé), mantendo o FAB em `/listas`: regex `^\/(importar|sugestoes|listas\/[^/?]+)(\/|\?|$)`.
- `icon_names=`: `add`, `add_shopping_cart`, `checklist`, `playlist_add`, `remove`,
  `shopping_cart` (conferir os que já existem e manter a ordem alfabética).

**Critério:** `shell.spec.ts` passa com o rótulo novo; o FAB some em `/listas/abc` e aparece em
`/listas`; os ícones renderizam (sem texto de ligadura).

---

### Fase 2 — Regra pura

**Objetivo:** toda a lógica da lista e da conferência em `lista.ts`, 100 % coberta.

#### Tarefa 2.1 — Tipos e constantes

**Arquivo(s):** `src/app/features/listas/lista.ts`

**O que fazer:**

```ts
export const MAX_LISTAS = 5;
export const MAX_ITENS = 150;
export const MAX_NOTAS_POR_LISTA = 3;
export const LIGA_POR_TEXTO = 0.4;
export const PERGUNTA_POR_TEXTO = 0.25;
export const SUGESTOES_AUTOCOMPLETAR = 5;

export type Item = ComId<ItemLista>;
export type Lista = ComId<ListaCompras>;

export interface ItemNovo {
  texto: string; grupo: string | null; quantidade: number | null;
  unidade: string | null; base: UnidadeBase | null; origem: OrigemItemLista;
}
export interface Par { item: Item; nota: ItemNota; como: VinculoItemLista['como']; score: number }
export interface Conciliacao {
  comprados: Par[]; confirme: Par[]; faltou: Item[]; foraDaLista: ItemNota[];
}
```

**Critério:** compila.

#### Tarefa 2.2 — Montar e mesclar itens

**Arquivo(s):** `lista.ts`, `lista.spec.ts`

**O que fazer:**
- `chaveDoItem(i)`: `grupo` quando houver, senão `normalizarDescricao(texto)`.
- `mesclarItem(existentes, novo)`: devolve `{ tipo: 'somar', id, quantidade } | { tipo:
  'novo' }` — mesmo `chaveDoItem` e mesma unidade (ou uma das quantidades nula) soma; unidades
  diferentes viram item novo.
- `itensDaSugestao(selecionados: ItemDaLista[])`: `ItemNovo` com `grupo`, `descricao` como
  `texto` (cortada em 80), `quantidade` ajustada e `unidade`/`base` da `QuantidadeSugerida`,
  `origem: 'sugestao'`.
- `itemDoProduto(produto)`, `itemDoHistorico(grupo, compras)` (usa `quantidadeSugerida(ocasioes(
  compras))` de `sugestao.ts`) e `itemDaNota(itemNota, grupo)`.
- `nomePadrao(hoje)`: `"Compras de dd/MM"`.

**Critério:** specs cobrem soma, unidade diferente, texto normalizado igual (acento/caixa) e
corte em 80.

#### Tarefa 2.3 — Ordem, progresso, estimativa e texto

**Arquivo(s):** `lista.ts`, `lista.spec.ts`

**O que fazer:**
- `separar(itens)`: `{ pendentes, noCarrinho }`; pendentes por `ordem`, carrinho por
  `marcadoEm desc`.
- `progresso(itens)`: `{ marcados, total }`.
- `precoDeReferencia(item, indice)`: sem `grupo` ou sem compras → `null`; senão a última
  compra (`indice.get(grupo)[0]`) e o preço pela função `precoNaQuantidade({ valor, unidade,
  base }, compra)` de `sugestao.ts`; retorna `{ valor, compra } | null`.
- `estimativa(itens, indice)`: soma `valor × (quantidade ?? 1)` dos pendentes e marcados com
  preço, e `semPreco` (contagem).
- `textoDaLista(lista, itens)`: nome + pendentes ("- Leite integral (6 un)"), no estilo do
  `textoDaLista` da sugestão.
- `autocompletar(texto, indice)`: tokens do texto (`tokensSemMedida`) × descrição mais recente
  de cada grupo; Jaccard > 0, empate pela quantidade de compras; até 5
  `{ grupo, descricao, quantidade }`. Menos de 2 caracteres → `[]`.

**Critério:** estimativa bate com fixture (itens com e sem preço, unidade base e comercial);
autocompletar acha "leite" → leites do histórico e ignora texto curto.

#### Tarefa 2.4 — Conciliação

**Arquivo(s):** `lista.ts`, `lista.spec.ts`

**O que fazer:** `conciliar(itens: Item[], nota: Nota, grupos: Grupos): Conciliacao`:
1. Considerar só itens **sem `vinculo`** (segunda nota, RF-13) e `consolidarItens(nota.itens)`.
2. **Por grupo:** para cada item com `grupo`, candidatos da nota com `chaveDoGrupo(produtoId,
   grupos) === grupo` ainda livres; escolher o de maior `vlTotal`. `como: 'grupo'`, `score: 1`.
3. **Por texto:** para os itens restantes, todos os pares (item × item da nota livre) com
   `jaccard(tokensSemMedida(item.texto), tokensSemMedida(nota.descricao))` e conteúdo compatível
   (`extrairConteudo` dos dois lados; desconhecido de um lado = compatível). Ordenar por score
   desc e atribuir guloso, cada lado uma vez. `score ≥ LIGA_POR_TEXTO` → `comprados` (`como:
   'texto'`); `PERGUNTA_POR_TEXTO ≤ score < LIGA` ou empate com outro candidato do mesmo item →
   `confirme`.
4. Restos → `faltou` e `foraDaLista` (este ordenado por `vlTotal desc`).

Também: `resumoDaConferencia(c, nota)` → `{ total, daLista, foraDaLista, qtdFaltou }`
(`daLista` = Σ `vlTotal` de `comprados`; `foraDaLista` = Σ do resto; `total` = `nota.total`) e
`vinculoDe(par, nota)` → `VinculoItemLista`.

**Critério:** specs com a fixture (Tarefa 2.6): item com grupo liga ao `loc:` vinculado ao
mesmo canônico; "leite integral" liga a "LEITE UHT INT ITALAC 1L"; "leite" com dois leites na
nota vai para `confirme`; "arroz 5kg" não liga a "ARROZ 1KG"; item já vinculado é ignorado;
cada item da nota é usado uma vez; totais batem.

#### Tarefa 2.5 — Finalização

**Arquivo(s):** `lista.ts`, `lista.spec.ts`

**O que fazer:** `planoDeFinalizacao(acao, lista, itens, agora)` devolve as operações (puro,
sem SDK), que o service aplica num batch:
- `excluir` → `delete` de todos os itens e da lista;
- `guardar` → `update` de cada item `{ marcado: false, marcadoEm: null, vinculo: null }` e da
  lista `{ status: 'aberta', notas: [], pendentes: [], qtdMarcados: 0, ultimaCompraEm: agora,
  atualizadaEm: agora }`;
- `so-faltou` → `delete` dos itens com `vinculo` ou marcados, `update` dos demais
  (desmarcados) e da lista (`qtdItens` = restantes, `qtdMarcados: 0`, `notas: []`).

```ts
export type Operacao =
  | { tipo: 'delete'; itemId: string | null }          // null = a própria lista
  | { tipo: 'update'; itemId: string | null; dados: Partial<ItemLista> | Partial<ListaCompras> };
```

**Critério:** specs das três ações, inclusive lista vazia e `so-faltou` sem faltantes (não
oferecida: função recusa com erro).

#### Tarefa 2.6 — Fixture e calibração inicial (D-04)

**Arquivo(s):** `src/testing/fixtures/lista/` (`nota.ts`, `lista.ts`, `grupos.ts`)

**O que fazer:** montar a nota a partir dos itens de `functions/test/fixtures/nota-real-pr-2026-09.html`
(já anonimizada; copiar só descrição, qtd, unidade, valores) com `produtoId` `loc:`, e uma
lista com textos como o usuário digita ("leite", "pão francês", "detergente", "coca 2l",
"banana"). Rodar `conciliar` e registrar no spec a tabela `texto × descrição × score` esperada.
Se a maioria dos acertos óbvios ficar abaixo de 0,4 (descrições abreviadas: "DET LIQ YPE"),
ajustar as constantes e anotar o valor escolhido no D-04 da análise.

**Critério:** spec de calibração passa e documenta os scores; constantes justificadas.

---

### Fase 3 — Acesso a dados e stores

**Objetivo:** ler e gravar listas e itens, com estado reativo.

#### Tarefa 3.1 — `ListasService`

**Arquivo(s):** `src/app/features/listas/data-access/listas.service.ts` (+ spec)

**O que fazer:** root, `inject(FIRESTORE)`, `inject(FIRESTORE_API)`, `inject(AuthStore)`,
`inject(RELOGIO)`. Caminhos `usuarios/${uid}/listas` e `.../${id}/itens`.
- Leitura: `listas$()` (`orderBy('atualizadaEm','desc')`, `limit(MAX_LISTAS + 1)`),
  `lista$(id)`, `itens$(id)` (`orderBy('ordem')`) — `onSnapshot` com `includeMetadataChanges`
  para expor `pendenteNoServidor` (`snap.metadata.hasPendingWrites`), usado no aviso offline.
- Escrita (todas devolvem `Promise<void>` que a UI **não aguarda**; ver convenções):
  `criar(nome, itens: ItemNovo[])` → devolve o `id` **na hora** (gerado por `doc(collection())`)
  e comita lista + itens num batch; `renomear`; `excluir(id)` (lê os ids dos itens do cache e
  apaga tudo num batch); `adicionar(id, itens: ItemNovo[], existentes)` (usa `mesclarItem`;
  `increment` em `qtdItens`); `marcar(id, item, marcado)` (item + `qtdMarcados ±1` +
  `atualizadaEm`); `editar(id, itemId, dados)`; `remover(id, item)`; `desmarcarTudo(id, itens)`;
  `salvarConferencia(id, pares, chave, gruposAprendidos)`; `aguardarNota(id, chave)`
  (`status: 'aguardando-nota'`, `pendentes: arrayUnion`) — acrescentar `arrayUnion`/
  `arrayRemove` ao token na Tarefa 1.2 se usados; `finalizar(id, operacoes: Operacao[])`.
- `gruposNasListas()`: `getDocs` dos itens de cada lista aberta → `Set<string>` de `grupo`
  (para a marca "Na lista" da sugestão; ≤ 5 consultas).
- Limites: `criar` recusa com `ListaCheiaError` quando já há `MAX_LISTAS`; `adicionar` corta
  em `MAX_ITENS` e informa quantos ficaram de fora.

**Critério:** spec com fake do `FIRESTORE_API` confere caminhos, conteúdo do batch (item +
contadores no mesmo commit), limite de 5, corte em 150 e que `criar` devolve o id sem esperar o
commit.

#### Tarefa 3.2 — `ListasStore` (lista de listas)

**Arquivo(s):** `src/app/features/listas/data-access/listas.store.ts` (+ spec)

**O que fazer:** root; `listas = toSignal(auth uid → listas$())`, `cheia = computed(listas.length
>= MAX_LISTAS)`, `abertas`, `emAndamento` (a mais recente com `qtdMarcados > 0`, ou a mais
recente) para o painel. Métodos finos que chamam o service e abrem snackbar em erro.

**Critério:** spec com service fake.

#### Tarefa 3.3 — `ListaStore` (a lista aberta)

**Arquivo(s):** `src/app/features/listas/data-access/lista.store.ts` (+ spec)

**O que fazer:** **não** root — `providers: [ListaStore]` na página, recebendo o `id` por
`abrir(id)`. `lista`, `itens` (signals do `onSnapshot`), `separados = computed(separar)`,
`progresso`, `indice` (`resource` com `HistoricoPessoalStore.indiceCompleto()`, só carregado
quando `itens` tem `grupo` ou o campo de adicionar pede — `carregarHistorico()`),
`estimativa`, `referencias` (mapa itemId → preço), `sugestoesDe(texto)` (autocompletar),
`offline` (de `ConexaoService`) e `pendenteNoServidor`. Ações: `adicionarTexto`,
`adicionarDoHistorico`, `marcar` (com "Desfazer" no snackbar), `editar`, `remover` (com
"Desfazer": regrava o item removido), `desmarcarTudo`, `textoParaCompartilhar`.

**Critério:** spec cobre marcar/desfazer, estimativa com índice fake e o histórico só carregado
sob demanda.

#### Tarefa 3.4 — Grupos da nota no histórico

**Arquivo(s):** `src/app/features/notas/data-access/historico-pessoal.store.ts` (+ spec)

**O que fazer:** expor `async gruposDaNota(nota: Nota): Promise<Grupos>` (o que `comparar` já
faz com `gruposDe(idsDe([nota]))`), para a conferência resolver os grupos de uma nota recém-
importada sem montar o índice inteiro.

**Critério:** spec do store existente estendido; nenhuma mudança de comportamento em
`comparar`/`resumir`.

#### Tarefa 3.5 — Tela acesa

**Arquivo(s):** `src/app/features/listas/data-access/tela-acesa.ts` (+ spec)

**O que fazer:** token `WAKE_LOCK` (factory: `navigator.wakeLock` ou `null`) e função
`manterTelaAcesa(ativo: Signal<boolean>)` para chamar no contexto de injeção da página: um
`effect` pede `request('screen')` quando `ativo()` e a aba está visível, solta quando não;
reaquisita no `visibilitychange`; solta no `DestroyRef`. Sem suporte → nada.

**Critério:** spec com wake lock fake: pede com pendentes, solta ao zerar pendentes, ao ocultar
a aba e ao destruir.

---

### Fase 4 — Telas da lista

**Objetivo:** criar, usar no mercado e editar listas.

#### Tarefa 4.1 — Minhas listas (`/listas`)

**Arquivo(s):** `src/app/features/listas/minhas-listas/minhas-listas.page.ts|html|scss` (+ spec)

**O que fazer:** `.cp-page` com `.cp-page-header` ("Listas de compras", "Nova lista"). `.cp-list`
de cards: nome, "N de M itens" (barra de progresso com `role="progressbar"`), chip de status
("Aguardando nota" / "Última compra em dd/MM"), menu `more_vert` (Renomear, Excluir). "Nova
lista" cria com `nomePadrao` e navega para ela (sem esperar o commit). Cheia → botão
desabilitado + `.cp-info-block--warn` "Você já tem 5 listas…". Vazio → `<cp-empty-state>` com
"Nova lista" e "Usar a sugestão de compra". Renomear: diálogo pequeno (Signal Forms, 1–60)
reaproveitado na lista. Exclusão com `<cp-confirm-dialog>`.

**Critério:** spec: estados vazio/cheio/lista, navegação ao criar, confirmação da exclusão.

#### Tarefa 4.2 — `<cp-adicionar-item>`

**Arquivo(s):** `src/app/features/listas/lista/ui/adicionar-item.ts` (+ spec)

**O que fazer:** campo "Adicionar item" (Signal Forms, 1–80) com combobox acessível
(`role="combobox"`, `aria-expanded`, `aria-activedescendant`, lista `role="listbox"`) das
`sugestoesDe(texto)` (mostra descrição e "≈ qtd"). Enter sem opção ativa → texto livre; escolher
opção → do histórico. No foco, `carregarHistorico()`. Depois de adicionar, limpa e mantém o
foco. Outputs `texto(string)` e `historico(grupo)`.

**Critério:** spec: Enter adiciona e mantém foco; setas + Enter escolhem sugestão; Esc fecha;
texto de 1 caractere não abre lista.

#### Tarefa 4.3 — `<cp-item-lista>` e editar

**Arquivo(s):** `src/app/features/listas/lista/ui/item-lista.ts|scss`,
`src/app/features/listas/lista/ui/editar-item-dialog.ts` (+ specs)

**O que fazer:** linha `.cp-list-row` inteira dentro de `<label>` com `<input type="checkbox">`
nativo (alvo ≥ 48 px); texto (riscado quando marcado + `cp-sr-only` "no carrinho"); quantidade
("6 un", "1,5 kg" com `DecimalPipe`); preço de referência opcional ("último R$ 4,99"); ícone
`link` quando tem `vinculo`. `more_vert`: Editar, Remover. O diálogo (via `import()`) edita
texto, quantidade (stepper − / +) e unidade.

**Critério:** spec: clique na linha emite `alternar`; nome acessível do checkbox inclui texto e
quantidade; menu emite `editar`/`remover`.

#### Tarefa 4.4 — Página da lista (`/listas/:id`)

**Arquivo(s):** `src/app/features/listas/lista/lista.page.ts|html|scss` (+ spec)

**O que fazer:** `providers: [ListaStore]`; `id` por input da rota. Cabeçalho `.cp-detail-header`
com nome (menu: Renomear, Copiar lista, Compartilhar — `navigator.share` quando existir —,
Desmarcar tudo, Excluir lista). Progresso "8 de 15 no carrinho" em `aria-live="polite"`.
`<cp-adicionar-item>` no topo. Seção pendentes e seção "No carrinho (N)" (recolhível). Ao marcar,
o foco vai para o próximo pendente. Rodapé fixo: estimativa ("≈ R$ 87,40 · 3 sem preço") e
"Ler a nota desta compra" → `/importar?lista=<id>`. Avisos: offline (`.cp-info-block--warn`
"Sem conexão — suas marcações serão salvas quando voltar"); `aguardando-nota` (RF-12, Tarefa
5.3); compra conferida não finalizada (todos com vínculo ou `notas` não vazio) → faixa
"Compra conferida — excluir ou guardar?" com as ações da Tarefa 6.3. Lista inexistente →
`<cp-empty-state>` "Lista não encontrada" + voltar. `manterTelaAcesa(pendentes > 0)`.

**Critério:** spec: marcar move de seção e anuncia; rodapé navega com o query param; aviso
offline; lista inexistente; wake lock chamado.

---

### Fase 5 — Importação com a lista em contexto

**Objetivo:** "Ler a nota desta compra" e os três desfechos da importação.

#### Tarefa 5.1 — `ImportarStore` com lista

**Arquivo(s):** `src/app/features/importar/importar.store.ts`, `importar.spec.ts`

**O que fazer:** `private _lista = signal<string | null>(null)`, `lista` readonly e
`definirLista(id | null)`. Em `confirmar()`, no sucesso: com lista → `router.navigate(
['/listas', lista, 'conferir'], { queryParams: { chave } })` e snackbar "Nota importada — confira
com a lista"; sem lista → comportamento atual. Em `guardar()`, no sucesso com lista →
`ListasService.aguardarNota(lista, chave)`. `reiniciar()` não limpa a lista (ela só sai por
`definirLista(null)` ao entrar em `/importar` sem o param).

**Critério:** specs: confirmar com e sem lista navega para o destino certo; guardar com lista
chama `aguardarNota`.

#### Tarefa 5.2 — Página de importação

**Arquivo(s):** `src/app/features/importar/importar.page.ts|html`,
`src/app/features/importar/preview-nota/preview-nota.page.html`

**O que fazer:** input `lista` (query param) → `store.definirLista(lista ?? null)`; nome da
lista pelo `ListasStore`. Faixa `.cp-info-block` "A nota vai ser conferida com a lista
**Nome**" com "Não conferir" (limpa o contexto). Na prévia, o botão vira "Importar e conferir".
Erro `ja-importada` com lista → ação extra "Conferir com a lista" (navega para a conferência
com a `chave` do erro), além de "Abrir nota".

**Critério:** spec: faixa aparece só com o param; `ja-importada` oferece a conferência.

#### Tarefa 5.3 — Lista aguardando a nota

**Arquivo(s):** `lista.page.*`, `lista.store.ts`

**O que fazer:** com `status: 'aguardando-nota'`, para cada chave em `pendentes` observar
`NotasService.obter(chave)`: nota existe → faixa "A nota chegou — conferir agora" (link para a
conferência); pendente com `status: 'falhou'` no `PendentesService` → "Não conseguimos importar
a nota" + "Ler de novo". Ao abrir a conferência de uma chave pendente, `salvarConferencia` a
remove de `pendentes` e volta `status` a `aberta`.

**Critério:** spec com os dois desfechos.

---

### Fase 6 — Conferência

**Objetivo:** ligar a nota à lista e finalizar a compra.

#### Tarefa 6.1 — `ConferenciaStore`

**Arquivo(s):** `src/app/features/listas/conferencia/conferencia.store.ts` (+ spec)

**O que fazer:** provido na página. Entradas `id` e `chave`. Carrega lista/itens (service),
nota (`NotasService.obter`, primeiro valor; nota sem itens ainda → "carregando") e grupos
(`HistoricoPessoalStore.gruposDaNota`). `automatica = computed(conciliar(...))`. Ajustes em
`linkedSignal` a partir da automática (reinicia se a nota mudar): `confirmar(par)`,
`recusar(par)` (vai para faltou/fora), `desfazer(par)`, `ligarManual(itemId, n)` (`como:
'manual'`), `adicionarDeFora(n)` (cria item `origem: 'nota'` já ligado). `resumo` e `salvar()`
(chama `salvarConferencia` com os pares finais + `gruposAprendidos` = itens sem `grupo` que
ganharam par → `chaveDoGrupo(produtoId)`). Nota `ja` em `lista.notas` → abre em modo leitura
(mostra o que foi gravado). Mais de `MAX_NOTAS_POR_LISTA` → erro amigável.

**Critério:** spec: automática → ajustes → salvar grava vínculos, marcações e grupos
aprendidos; segunda nota ignora itens já ligados.

#### Tarefa 6.2 — Página da conferência

**Arquivo(s):** `src/app/features/listas/conferencia/conferencia.page.ts|html|scss`,
`conferencia/ui/par-conferido.ts`, `conferencia/ui/escolher-par-dialog.ts` (+ specs)

**O que fazer:** `.cp-summary` com total da nota, "Da lista: R$ A (N)", "Fora da lista: R$ B
(M)", "Faltou: K". Seções `.cp-section-title`: **Comprados** (`<cp-par-conferido>`: texto da
lista ↔ descrição da nota, qtd, `<cp-preco>`; chip "aproximado" com ícone quando `texto`;
"Não é este"), **Confirme** ("Sim"/"Não"), **Faltou** ("Estava na nota como…" abre
`escolher-par-dialog` com os itens de fora), **Fora da lista** ("Estava na lista como…" com os
faltantes; "Adicionar à lista"). Desktop (`BreakpointService`/`desktop`): duas colunas. Rodapé
fixo "Salvar conferência". Nota excluída → aviso "A nota foi excluída" (RF-15), sem link.

**Critério:** spec: seções e totais; ações movem itens entre seções; badges com texto + ícone.

#### Tarefa 6.3 — Finalização

**Arquivo(s):** `conferencia.page.*`, `src/app/features/listas/ui/finalizar-compra.ts` (+ spec)

**O que fazer:** após salvar, painel "A compra virou nota. E a lista?" com "Excluir lista"
(primário), "Guardar para usar de novo", "Manter só o que faltou" (só se houver faltantes) e
"Ler outra nota" (só se `notas.length < 3` e houver faltantes → `/importar?lista=`). Aplica
`planoDeFinalizacao` via `ListasService.finalizar`. Excluir → `/listas` com snackbar; guardar /
só faltou → `/listas/:id`. Mesmo componente usado na faixa da Tarefa 4.4.

**Critério:** spec das quatro ações e das condições de exibição.

---

### Fase 7 — Integrações

**Objetivo:** levar itens para a lista a partir das outras telas.

#### Tarefa 7.1 — `escolher-lista-dialog`

**Arquivo(s):** `src/app/features/listas/ui/escolher-lista-dialog.ts` (+ spec)

**O que fazer:** diálogo (via `import()`) com as listas abertas (radio) e "Nova lista" (se não
cheia). Devolve `{ id } | { nova: true } | null`. Helper `adicionarEmLista(itens: ItemNovo[])`
no `ListasStore`: 0 listas → cria; 1 → adiciona direto; > 1 → abre o diálogo. Snackbar "N itens
adicionados a Nome" com "Abrir".

**Critério:** spec dos três caminhos e do caso cheio.

#### Tarefa 7.2 — Sugestão de compra

**Arquivo(s):** `src/app/features/sugestoes/sugestoes.page.ts|html`,
`sugestoes/ui/sugestao-item.ts`, `sugestoes/data-access/sugestoes.store.ts` (+ specs)

**O que fazer:** ação no rodapé "Criar lista com N itens" (`itensDaSugestao(selecionados())` →
`ListasStore.criar` → navega para a lista; cheia → desabilitado com o aviso) e, quando há lista
aberta, "Adicionar à lista" (Tarefa 7.1). `SugestoesStore.naLista` (`resource` de
`gruposNasListas()`, recarregado ao voltar para a tela) → chip "Na lista" no item e fora da
pré-seleção (ajustar o `linkedSignal` da seleção para desmarcar grupos em `naLista`).

**Critério:** spec: criar leva as quantidades ajustadas; item na lista aparece marcado "Na
lista" e desmarcado.

#### Tarefa 7.3 — Página do produto

**Arquivo(s):** `src/app/features/produtos/detalhe/*.page.html|ts`

**O que fazer:** botão secundário "Adicionar à lista" (`playlist_add`) com `itemDoProduto`
(canônico) → `adicionarEmLista`.

**Critério:** spec: clique chama `adicionarEmLista` com o grupo canônico.

#### Tarefa 7.4 — Detalhe da nota

**Arquivo(s):** `src/app/features/notas/detalhe/*.page.html|ts`

**O que fazer:** no menu do detalhe, "Conferir com uma lista" (só com listas abertas) →
`escolher-lista-dialog` sem "Nova lista" → `/listas/:id/conferir?chave=`.

**Critério:** spec: ação some sem listas e navega com a lista escolhida.

#### Tarefa 7.5 — Card no painel

**Arquivo(s):** `src/app/features/painel/ui/lista-em-andamento.ts` (+ spec),
`src/app/features/painel/painel.page.html`

**O que fazer:** `<cp-lista-em-andamento>` em `@defer (on viewport)`: nome, progresso, "Abrir
lista"; sem listas → não renderiza.

**Critério:** spec com e sem lista.

---

### Fase 8 — Qualidade

**Objetivo:** testes, verificação no dv e documentação.

#### Tarefa 8.1 — Cobertura

**Arquivo(s):** specs das fases anteriores

**O que fazer:** `lista.ts` com 100 %; stores e páginas cobrindo estados de carregando, vazio,
erro de gravação (commit rejeitado → snackbar) e offline.

**Critério:** `npm run test:ci` verde; cobertura de `lista.ts` 100 %.

#### Tarefa 8.2 — e2e

**Arquivo(s):** `e2e/listas.spec.ts`, `e2e/a11y.spec.ts`

**O que fazer:** com usuário de teste (senão `test.skip`), `chromium` e `mobile`: criar lista,
adicionar 3 itens, marcar/desmarcar, renomear; criar lista pela sugestão (pula se não houver
sugestões); conferir com uma nota **já importada** do usuário de teste pelo menu do detalhe da
nota (pula sem notas, como `notas-historico.spec.ts`), verificar as seções e finalizar com
"Excluir lista". `afterEach` exclui pela UI as listas criadas (o e2e grava no dv). Axe em
`/listas` e `/listas/:id`.

**Critério:** `npm run e2e` verde (ou pulado sem `.env.e2e`), sem violações do axe.

#### Tarefa 8.3 — Lint, contraste, build e budgets

**O que fazer:** `npm run lint`, `npm run contraste` (acrescentar par em `scripts/contraste.mjs`
se o texto riscado ou o chip "aproximado" usar token novo), `ng build --configuration=production`
conferindo `main` < 500 kB e `anyComponentStyle` < 6 kB.

**Critério:** tudo verde.

#### Tarefa 8.4 — Verificação no navegador (dv)

**O que fazer:** depois do deploy das regras pelo usuário, `npm start` e, no navegador: criar
lista, adicionar com autocompletar, marcar em modo offline (DevTools → Offline) e ver a
marcação persistir ao voltar; ler uma nota real sobre a lista e conferir os pares; ajustar
`LIGA_POR_TEXTO`/`PERGUNTA_POR_TEXTO` se os acertos óbvios caírem em "Confirme" (D-04); testar
as quatro finalizações e o limite de 5 listas. Rodar o checklist das regras no Playground.

**Critério:** capturas das telas principais; checklist das regras marcado.

#### Tarefa 8.5 — Documentação

**Arquivo(s):** `CLAUDE.md`, `docs/analise/lista-compras-analise.md`

**O que fazer:** no `CLAUDE.md`, rota `/listas` na lista de rotas, item de menu em "Shell",
seção "Lista de compras" (coleções, escrita do cliente só em `usuarios/{uid}/listas/**` com
validação nas regras, escrita otimista sem `await`, conciliação e constantes, finalização) e a
regra em "Firebase": "o cliente grava só em `usuarios/{uid}/listas/**`". Na análise, registrar
os limiares finais do D-04.

**Critério:** documentação reflete o que foi entregue.

---

## Estrutura Final de Arquivos

```
shared/model.ts                                      # 1.1 tipos da lista
firestore.rules                                      # 1.3
docs/qualidade/regras-firestore-checklist.md         # 1.3
src/index.html                                       # 1.4 ícones
src/app/app.routes.ts                                # 1.4
src/app/core/firebase/firestore-api.ts               # 1.2
src/app/core/layout/shell.ts | shell.spec.ts         # 1.4
src/app/features/listas/
├── listas.routes.ts                                 # 1.4
├── lista.ts | lista.spec.ts                         # 2.1–2.5
├── data-access/
│   ├── listas.service.ts | .spec.ts                 # 3.1
│   ├── listas.store.ts | .spec.ts                   # 3.2, 7.1
│   ├── lista.store.ts | .spec.ts                    # 3.3, 5.3
│   └── tela-acesa.ts | .spec.ts                     # 3.5
├── ui/
│   ├── escolher-lista-dialog.ts | .spec.ts          # 7.1
│   └── finalizar-compra.ts | .spec.ts               # 6.3
├── minhas-listas/minhas-listas.page.* | .spec.ts    # 4.1
├── lista/
│   ├── lista.page.* | .spec.ts                      # 4.4, 5.3
│   └── ui/adicionar-item.ts, item-lista.ts|scss,
│       editar-item-dialog.ts (+ specs)              # 4.2, 4.3
└── conferencia/
    ├── conferencia.store.ts | .spec.ts              # 6.1
    ├── conferencia.page.* | .spec.ts                # 6.2
    └── ui/par-conferido.ts, escolher-par-dialog.ts  # 6.2
src/testing/fixtures/lista/                          # 2.6
src/app/features/notas/data-access/historico-pessoal.store.ts   # 3.4
src/app/features/importar/importar.store.ts | importar.page.* |
    preview-nota/preview-nota.page.html | importar.spec.ts        # 5.1, 5.2
src/app/features/sugestoes/…                         # 7.2
src/app/features/produtos/detalhe/…                  # 7.3
src/app/features/notas/detalhe/…                     # 7.4
src/app/features/painel/ui/lista-em-andamento.ts, painel.page.html  # 7.5
e2e/listas.spec.ts, e2e/a11y.spec.ts                 # 8.2
scripts/contraste.mjs                                # 8.3 (se houver token novo)
CLAUDE.md                                            # 8.5
```

---

## Ordem de Execução Recomendada

```
1.1 ─┬─ 1.2 ── 1.3
     └─ 1.4
1.1 ── 2.1 ── 2.2 ── 2.3 ── 2.4 ── 2.5
                             └── 2.6 (calibração)
1.2 + 2.x ── 3.1 ── 3.2 ── 3.3 ── 3.5
                    3.4 (independente)
3.2 + 3.3 ── 4.1 ── 4.2 ── 4.3 ── 4.4
3.1 ── 5.1 ── 5.2 ── 5.3 (depois de 4.4)
2.4 + 3.4 + 4.4 ── 6.1 ── 6.2 ── 6.3
3.2 ── 7.1 ── 7.2, 7.3, 7.4 ;  3.2 ── 7.5
tudo ── 8.1 ── 8.2 ── 8.3 ── 8.4 ── 8.5
```

Primeira tarefa: **1.1 (modelo)**; a Fase 2 (regra pura) pode avançar em paralelo à Fase 1.2–1.4.

---

## Critérios de Aceitação Globais

- [ ] "Lista de compras" no menu abre `/listas`; o FAB não aparece em `/listas/:id` nem na
      conferência.
- [ ] Criar, renomear e excluir lista (com confirmação); com 5 listas não dá para criar outra
      (nem pela sugestão) e o aviso explica.
- [ ] Autocompletar sugere o que o usuário já comprou; texto livre funciona; item repetido soma.
- [ ] "Criar lista com N itens" na sugestão leva itens e quantidades ajustadas; itens em lista
      aparecem como "Na lista".
- [ ] "Adicionar à lista" funciona na página do produto e em "Fora da lista".
- [ ] Marcar/desmarcar move o item de seção, atualiza e anuncia o progresso; "Desfazer" funciona.
- [ ] Offline: marcar, adicionar, editar e remover funcionam e sincronizam ao voltar.
- [ ] A tela fica acesa na lista com pendentes e volta ao normal ao sair.
- [ ] Estimativa com último preço pago e contagem de itens sem preço.
- [ ] "Ler a nota desta compra" → importar → conferência; `ja-importada` oferece conferir; nota
      na fila deixa a lista "aguardando nota" e avisa quando chega.
- [ ] "Conferir com uma lista" no detalhe da nota.
- [ ] Conferência liga por grupo, por texto (aproximado) e pergunta nos incertos; ajustes
      manuais funcionam; totais batem.
- [ ] Salvar grava vínculos, marca os itens e o produto aprendido; na próxima compra com a lista
      guardada, o item antes digitado liga por grupo.
- [ ] Finalização: excluir, guardar para usar de novo, manter só o que faltou e ler outra nota.
- [ ] Regras: só o dono lê/grava; campos inválidos recusados; notas/pendentes continuam sem
      escrita do cliente (checklist no Playground).
- [ ] `lista.ts` 100 %; `npm run lint`, `npm run contraste`, `npm run test:ci`, e2e e build de
      produção verdes; `main` < 500 kB.
- [ ] `CLAUDE.md` atualizado.
