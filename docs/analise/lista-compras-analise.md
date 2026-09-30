# Análise: Lista de compras

**Data:** 2026-09-30
**Projeto:** fed-catalogo-compara-precos (Cupom Esperto)
**Escopo:** o usuário monta uma **lista de compras** (à mão ou a partir da Sugestão de compra),
usa no mercado **ticando o que já pôs no carrinho** e, depois, **lê o QR Code da nota em cima da
lista** para ligar cada item da lista ao item correspondente da NFC-e: o que foi comprado, quanto
custou, o que faltou e o que entrou fora da lista. Continua valendo o D-05 da sugestão: só preços
das notas do próprio usuário (sem base comunitária nem Menor Preço).

---

## 1. Contexto

**O que já existe**

- **Sugestão de compra** (`features/sugestoes/`): `SugestoesStore` já tem a seleção
  (`selecao`, `quantidades`, `selecionados(): ItemDaLista[]`) e os totais/agrupamento por mercado.
  Hoje a "lista" só sai como texto (`textoDaLista` → copiar/compartilhar); nada é persistido.
  Cada `Sugestao` traz `grupo` (id do canônico), `descricao`, `quantidade` (`valor`, `unidade`,
  `base`) e a `faixa` de preços pagos — tudo o que um item de lista vindo da sugestão precisa.
- **Histórico pessoal** (`HistoricoPessoalStore.indiceCompleto()`): índice `grupo →
  CompraPessoal[]` dos últimos 12 meses, com `chaveDoGrupo` resolvendo equivalências
  (`vinculadoA`, etiquetas/IA). Serve para: autocompletar item digitado com o que o usuário já
  comprou, mostrar "último pago" na lista e ligar item da lista a item da nota pelo grupo.
- **Importação** (`ImportarStore`, `/importar` → `/importar/preview`): estados `preview →
  confirmando → ocioso` (confirmada) ou `guardada` (fila da SEFAZ). Nota `ja-importada` devolve
  a `chave`. Scanner `<cp-scanner>` em `@defer`.
- **Nota gravada** (`usuarios/{uid}/notas/{chave}`): `itens: ItemNota[]` com `n`, `descricao`,
  `qtd`, `unidade`, `vlUnit`, `vlTotal`, `produtoId` (`ean:`/`loc:`) e `precoPorUnidadeBase`.
  `NotasService.obter(chave)` em tempo real.
- Funções puras reaproveitáveis: `jaccard`, `tokens`/`tokensSemMedida` (`@shared`),
  `extrairConteudo`/`quantidadeNaUnidadeBase` (`@shared/unidade`), `consolidarItens`,
  `baseComum`, `unidadeNormalizada` (`historico-pessoal.ts`).
- `DispensadosService` ("Já tenho"/"Não sugerir mais", `localStorage`).
- Firestore com **cache persistente multi-aba** (`firestore.token.ts`): escrita offline fica na
  fila local e sobe quando a conexão volta — relevante para uso dentro do mercado.

**O que falta**

- Nenhuma persistência de lista. RF-22/RF-29 da análise geral previam a lista como "fase
  posterior", focada em cesta mais barata pelo Menor Preço; esta análise **substitui** esse
  escopo: a lista é de uso pessoal, e a comparação de preços fica restrita às notas do usuário.
- O `firestore.rules` hoje nega escrita em tudo sob `usuarios/{uid}` (as coleções que existem
  são gravadas pelas Functions). As listas são gravadas direto pelo cliente com o SDK modular
  (D-01): basta um `match /listas/**` só do dono. A restrição do projeto vale para coleções
  compartilhadas e notas, não para dados próprios do usuário.
- `FIRESTORE_API` não expõe `setDoc`, `updateDoc`, `writeBatch`, `serverTimestamp`.
- Não há ligação entre nota e algo do usuário além do próprio documento da nota.
- Ícones: o subset tem `check`, `link` e `more_vert`; faltam `checklist`, `shopping_cart`,
  `add`, `add_shopping_cart`, `remove`, `drag_indicator` (conforme o layout final).

## 2. Dados Disponíveis

| Fonte | Conteúdo | Onde | Uso na feature |
|---|---|---|---|
| `SugestoesStore.selecionados()` | Sugestões marcadas + quantidade ajustada | Cliente | Criar lista a partir das sugestões (RF-03) |
| `HistoricoPessoalStore.indiceCompleto()` | `grupo → CompraPessoal[]`, `grupos`, `notas` | Cliente (cache da sessão) | Autocompletar, "último pago", conciliação por grupo |
| `usuarios/{uid}/notas/{chave}` | Itens da NFC-e com `produtoId` | Firestore (leitura) | Conciliação (RF-10) |
| `produtos/{id}` | `descricao`, `conteudo`, `vinculadoA` | Firestore (leitura) | Resolver grupo de um item da nota fora do índice (nota nova) |
| `ImportarStore` | Estado da importação, `chave` confirmada/guardada/já importada | Cliente | Voltar para a conciliação após ler a nota (RF-09) |
| `usuarios/{uid}/pendentes/{chave}` | Nota na fila da SEFAZ | Firestore (leitura) | Lista "aguardando nota" (RF-12) |
| **Novo** `usuarios/{uid}/listas/{listaId}` | Cabeçalho da lista | Firestore, **escrita do cliente** | Persistência (D-01, D-02) |
| **Novo** `usuarios/{uid}/listas/{listaId}/itens/{itemId}` | Itens, marcação e vínculo com a nota | Firestore, **escrita do cliente** | Persistência (D-02) |
| `precos` comunitário / Menor Preço | — | — | **Não usado** (D-05 da sugestão) |

Modelo proposto (em `@shared/model.ts`, sem `uid` nos documentos — o caminho já é do dono):

```ts
type StatusLista = 'aberta' | 'aguardando-nota';
type OrigemItemLista = 'manual' | 'sugestao' | 'historico' | 'produto' | 'nota';

interface ListaCompras {           // usuarios/{uid}/listas/{listaId}
  nome: string;                    // 1–60, padrão "Compras de 30/09"
  status: StatusLista;
  criadaEm: DataIso;
  atualizadaEm: DataIso;
  qtdItens: number;                // mantidos pelo cliente no mesmo batch
  qtdMarcados: number;
  ultimaCompraEm: DataIso | null;  // última compra finalizada com a lista guardada (RF-13)
  notas: string[];                 // chaves conferidas na compra em andamento (0..3)
  pendentes?: string[];            // chaves guardadas na fila, ainda sem nota
}

interface ItemLista {              // .../itens/{itemId}
  texto: string;                   // 1–80, o que o usuário vê
  grupo: ProdutoId | null;         // canônico, quando se sabe o produto
  quantidade: number | null;       // > 0, até 999
  unidade: string | null;          // "un", "kg", "L" ou unidade comercial
  base: UnidadeBase | null;        // como em QuantidadeSugerida (para preço na unidade)
  origem: OrigemItemLista;
  ordem: number;
  marcado: boolean;
  marcadoEm: DataIso | null;
  vinculo: VinculoItemLista | null;
}

interface VinculoItemLista {       // retrato do item da nota (sobrevive à exclusão da nota)
  chave: string;
  n: number;                       // item da nota
  produtoId: ProdutoId;
  descricao: string;
  qtd: number;
  unidade: string;
  vlTotal: number;
  cnpj: string;
  mercado: string;
  como: 'grupo' | 'texto' | 'manual';
}
```

## 3. Requisitos Funcionais

**Listas**

- **RF-01 — Minhas listas.** Tela `/listas` com as listas do usuário: nome, "N de M itens",
  status (aberta / aguardando nota), "última compra em DD/MM" quando é uma lista guardada, e
  data. Ordem por `atualizadaEm desc`. Ações: nova lista, abrir, renomear e excluir (com
  `<cp-confirm-dialog>`). Máximo de **5 listas** e **150 itens por lista** (D-03): com 5,
  "Nova lista" (e "Criar lista" na sugestão) fica desabilitado com o aviso "Você já tem 5
  listas. Exclua uma ou use uma lista guardada."
- **RF-02 — Adicionar item à mão.** Campo único "Adicionar item" no topo da lista (Enter
  adiciona, o foco fica no campo para o próximo). Enquanto digita, **autocompletar com o que o
  usuário já comprou** (índice do histórico: `descricao` mais recente de cada grupo, Jaccard sobre
  `tokens`, até 5 sugestões): escolher uma preenche `grupo`, `texto` e a quantidade habitual
  (`origem: 'historico'`); texto livre vira item sem `grupo` (`origem: 'manual'`). Quantidade e
  unidade são opcionais e editáveis na linha (stepper − / +). Item repetido (mesmo `grupo`, ou
  mesmo texto normalizado) soma a quantidade em vez de duplicar.
- **RF-03 — Criar a partir da Sugestão de compra.** Em `/sugestoes`, ação **"Criar lista com N
  itens"** (os selecionados, com a quantidade ajustada) e, se houver lista aberta, **"Adicionar à
  lista …"**. Cada item leva `grupo`, `descricao` como `texto`, `quantidade`/`unidade` da
  `QuantidadeSugerida` e `origem: 'sugestao'`. Itens já presentes somam quantidade (RF-02). Ao
  terminar, navega para a lista com snackbar "Lista criada com N itens".
- **RF-04 — Adicionar pela página do produto.** Em `/produtos/:id`, "Adicionar à lista"
  (lista aberta mais recente ou nova), com `grupo` = canônico (`origem: 'produto'`).- **RF-05 — Preço de referência (opcional por item).** Item com `grupo` presente no histórico
  mostra "último R$ X,XX em Mercado" (só notas do usuário) e o rodapé mostra **"Estimativa ≈
  R$ Y"** (soma dos itens com preço, com "N itens sem preço"), reaproveitando `baseComum` e o
  mesmo cálculo de `totaisDaLista`. Nunca bloqueia o uso da lista.

**No mercado**

- **RF-06 — Ticar item.** Toque na linha inteira (ou no checkbox) marca/desmarca; itens
  marcados descem para a seção **"No carrinho (N)"**, riscados, com "Desfazer" no snackbar.
  Progresso no topo ("8 de 15"). A marcação grava `marcado`/`marcadoEm` na hora (com fila
  offline, RNF-02).
- **RF-07 — Modo mercado.** A lista é a própria tela de uso (sem modo separado): alvos de toque
  ≥ 48 px, ações de edição recolhidas no `more_vert` da linha, campo de adicionar sempre
  visível. Opcional: manter a tela acesa (Screen Wake Lock) enquanto a lista está aberta e há
  itens pendentes, desligado ao sair da tela (D-07).
- **RF-08 — Edição.** Editar texto/quantidade, excluir item (com desfazer), limpar marcados,
  "Desmarcar tudo". Reordenação por arrastar fica fora da v1 (a ordem é a de inclusão; marcados
  descem).

**Nota em cima da lista**

- **RF-09 — "Ler a nota desta compra".** Botão fixo no rodapé da lista (e no topo quando todos
  estão marcados). Leva a `/importar?lista=<id>`: o fluxo de importação é o mesmo (scanner,
  colar link, digitar chave), com um aviso "A nota vai ser conferida com a lista X". Depois de:
  - **confirmar** a prévia → vai para `/listas/:id/conferir?chave=<chave>`;
  - **`ja-importada`** → oferece "Conferir com a lista" (a nota já está no Firestore) e vai para a
    mesma tela;
  - **guardada na fila** → a lista passa a `aguardando-nota` com a chave em `pendentes` (RF-12).
  A lista em contexto fica no `ImportarStore` (sobrevive à navegação, como a prévia).
- **RF-10 — Conciliação automática.** Função pura `conciliar(itensLista, itensNota, grupos)`,
  itens da nota consolidados (`consolidarItens`), cada item da nota usado uma vez:
  1. **Por grupo:** item da lista com `grupo` ↔ item da nota com `chaveDoGrupo(produtoId) ==
     grupo` (`como: 'grupo'`). Vários candidatos → o de maior `vlTotal` não usado.
  2. **Por texto:** item sem `grupo` (ou sem par no passo 1) ↔ item da nota com
     `jaccard(tokensSemMedida) ≥ 0,4` e conteúdo compatível (`extrairConteudo`), melhor par
     primeiro. Empate ou 0,25–0,4 → vai para "Confirme" (não liga sozinho).
  3. O resto da lista → **Faltou**; o resto da nota → **Fora da lista**.
  Os limiares viram constantes nomeadas e são calibrados com fixtures reais (D-04).
- **RF-11 — Tela de conferência** (`/listas/:id/conferir?chave=`). Resumo no topo: total da
  nota, **"Da lista: R$ A (N itens)"**, **"Fora da lista: R$ B (M itens)"** e **"Faltou: K
  itens"**. Seções:
  - **Comprados** — item da lista ↔ descrição da nota, qtd e valor; ícone de "aproximado"
    quando `como: 'texto'`; ação "Não é este" (desfaz o par).
  - **Confirme** — pares incertos com "Sim" / "Não".
  - **Faltou** — itens da lista sem par, com "Estava na nota como…" (abre a lista dos itens
    fora da lista para ligar à mão) e "Manter para a próxima" (RF-13).
  - **Fora da lista** — itens da nota sem par, com "Estava na lista como…" e "Adicionar à lista"
    (vira item já comprado, útil para a próxima).
  "Salvar conferência" grava num único batch: `vinculo` nos itens ligados, `marcado: true` neles,
  `grupo` preenchido nos itens manuais que ganharam par (**a lista aprende o produto**; a
  próxima vez liga por grupo) e `notas += chave`. Em seguida vem a finalização (RF-13).
- **RF-12 — Nota na fila.** Lista `aguardando-nota` mostra "Esperando a SEFAZ-PR liberar a
  nota". Quando a nota da chave pendente aparecer (o `PendentesService` já detecta a nota que
  `veioDaFila`), a lista mostra "A nota chegou — conferir agora". Pendente que `falhou` volta a
  lista para `aberta` com aviso.
- **RF-13 — Finalizar a compra (D-03).** Depois de salvar a conferência, a lista virou compra
  e o usuário escolhe o destino dela:
  - **"Excluir lista"** (ação principal) — apaga a lista e os itens;
  - **"Guardar para usar de novo"** — mantém todos os itens, desmarca, limpa `vinculo` e `notas`,
    guarda o `grupo` aprendido, grava `ultimaCompraEm` e volta a `aberta` (lista fixa, ex.:
    "Compra do mês");
  - **"Manter só o que faltou"** (só quando há "Faltou") — apaga os itens comprados e deixa os
    que faltaram, desmarcados;
  - **"Ler outra nota"** — compra dividida em dois mercados: a lista continua como está e a
    próxima conferência só considera itens ainda sem `vinculo` (até 3 chaves em `notas`).
  Sair da tela sem escolher mantém a lista como está (conferida e marcada), e a lista mostra o
  aviso "Compra conferida — excluir ou guardar?" com as mesmas ações.
- **RF-14 — Do lado da nota.** No menu do detalhe da nota (`/notas/:chave`), "Conferir com uma
  lista" abre a escolha entre as listas abertas e vai para o RF-11. Serve para nota importada
  sem passar pela lista.
- **RF-15 — Nota excluída durante a conferência.** O `vinculo` guarda um retrato do item, então
  uma lista com nota ainda não finalizada continua legível se a nota for excluída; a tela mostra
  "A nota foi excluída" e esconde o link.

**Integração com o resto do app**

- **RF-16 — Sugestão de compra.** Itens que estão numa lista aberta ganham a marca "Na lista"
  em `/sugestoes` (e não são pré-selecionados para uma lista nova). Nada muda na regra de
  sugestão: a própria nota importada já reinicia o ciclo.
- **RF-17 — Navegação.** Item de menu **"Lista de compras"** (ícone `checklist`) depois de
  "Sugestão de compra" em `ITENS_NAV`. O FAB "Importar nota" some em `/listas/:id` (a tela tem
  ação fixa no rodapé), como já acontece em `/importar` e `/sugestoes`. Painel: card "Lista em
  andamento" (nome, progresso, abrir) quando houver lista aberta, em `@defer (on viewport)`.
- **RF-18 — Compartilhar como texto.** "Copiar lista"/"Compartilhar" (`navigator.share`) com o
  texto dos itens pendentes, no mesmo formato de `textoDaLista`. Lista compartilhada entre
  usuários (família) fica fora da v1 (D-08).
- **RF-19 — Estados.** Carregando: skeleton; lista vazia: `<cp-empty-state>` com "Adicionar
  item" e "Usar a sugestão de compra"; sem conexão: faixa "Sem conexão — suas marcações serão
  salvas quando voltar" (`ConexaoService`); erro de gravação definitivo (regra recusou): snackbar
  e recarrega o item.

## 4. Requisitos Não Funcionais

- **RNF-01 — Desempenho.** Rotas `/listas`, `/listas/:id` e `/listas/:id/conferir` em
  `loadChildren`; nada da feature no bundle inicial (`main` < 500 kB). O índice do histórico só
  é pedido quando o campo de adicionar ganha foco ou a lista tem itens com `grupo` (reusa o
  cache da sessão). Lista com 150 itens renderiza sem travar num celular médio (`@for` com
  `track id`; sem virtual scroll na v1). Um `onSnapshot` por lista aberta (itens) e um na tela
  de listas (cabeçalhos, `limit(20)`).
- **RNF-02 — Offline primeiro.** Marcar, adicionar, editar e excluir funcionam **sem conexão**
  (escrita direta no Firestore com cache persistente; D-01). Nenhuma ação da lista depende de
  callable. A conciliação precisa da nota, que só existe online (importação pela Function).
  O cabeçalho (`qtdItens`, `qtdMarcados`, `atualizadaEm`) é atualizado no mesmo `writeBatch` do
  item, para não divergir.
- **RNF-03 — Responsividade.** Mobile (≤ 599) é o alvo principal: linha inteira clicável,
  checkbox à esquerda, quantidade à direita, rodapé fixo com "Ler a nota desta compra" acima da
  área segura. Tablet/desktop: lista em `.cp-card` com largura máxima e conferência em duas
  colunas (lista × nota) a partir de `desktop`. Breakpoint em TS só por `BreakpointService`.
- **RNF-04 — Acessibilidade (WCAG AA).** Checkbox nativo com `<label>` (nome = texto do item +
  quantidade), progresso em `aria-live="polite"` ("8 de 15 no carrinho"), mudança de seção sem
  perder o foco (o foco vai para o próximo item pendente), snackbar com "Desfazer" acessível,
  risco do item marcado acompanhado de texto oculto "no carrinho" (nunca só visual). Status da
  conferência com ícone + texto (`.cp-badge--*`), nunca só cor. Pares novos em
  `scripts/contraste.mjs` se surgir token (ex.: texto riscado). Axe no e2e (`a11y.spec.ts`) para
  `/listas` e `/listas/:id`.
- **RNF-05 — Manutenibilidade.** Standalone, `OnPush` explícito, `inject()`, `input()/output()`,
  control flow com `track`. `ListasService` (Firestore) + `ListaStore` root com estado em
  signals expostos por `asReadonly()`; `onSnapshot` → `toSignal`. Signal Forms no campo de
  adicionar, no renomear e na edição do item. Regra pura (`conciliar`, `mesclarItem`,
  `itensDaSugestao`, `ordenarItens`, `resumoDaConferencia`) em `features/listas/lista.ts`, sem
  Angular. Classes globais primeiro (`.cp-list`, `.cp-list-row`, `.cp-summary`,
  `.cp-segmented`); SCSS do componente só com o específico (budget `anyComponentStyle`).
- **RNF-06 — Testabilidade.** 100 % de cobertura em `lista.ts` com fixture real em
  `src/testing/fixtures/lista/` (lista + nota real anonimizada com itens de descrição
  abreviada). `ListasService` testado com fake do `FIRESTORE_API` (ampliado com `setDoc`,
  `updateDoc`, `writeBatch`); **sem `vi.mock` de módulos do Firebase**. Stores com fakes dos
  serviços e `RELOGIO` fixo. e2e (Playwright, dv): criar lista, adicionar item, ticar, criar a
  partir da sugestão e conciliar com a nota via `mockCallables` (confirmação) + nota já
  existente do usuário de teste; o teste apaga as listas que criou no fim.
- **RNF-07 — Segurança.** Escrita do cliente (D-01) em espaço só do dono, com validação nas
  regras:
  - só o dono (`request.auth.uid == uid`) lê e escreve `usuarios/{uid}/listas/**`;
  - `keys().hasOnly([...])` e tipos/tamanhos em cada campo (`nome` 1–60, `texto` 1–80,
    `quantidade` número 0 < q ≤ 999, `status` na enumeração, `notas.size() <= 3`);
  - `vinculo` validado por forma (`chave` com 44 dígitos, `n` inteiro) — o cliente pode gravar
    um retrato "falso", mas ele só afeta a lista do próprio usuário e **nunca** alimenta
    `precos`/`produtos` nem a sugestão (a sugestão continua lendo só as notas);
  - limite de listas/itens aplicado no cliente e, no servidor, pelo tamanho dos campos (regra
    não conta documentos; aceitável porque o custo é só do próprio usuário);
  - `usuarios/{uid}` raiz, notas, pendentes e apelidos continuam `write: if false`;
  - checklist do Rules Playground em `docs/qualidade/regras-firestore-checklist.md` ganha os
    casos da lista (dono grava válido; outro uid negado; campo extra negado; texto longo negado;
    escrita em `notas` continua negada).
  Texto do usuário é só interpolado no template (sem `innerHTML`); nada da lista vai para log.
- **RNF-08 — Privacidade.** A lista fica só no espaço do usuário; nenhum dado dela entra em
  coleção compartilhada nem é enviado à IA. `AuthStore.sair()` não precisa limpar nada (fica no
  servidor); o `localStorage` não é usado para a lista.
- **RNF-09 — Internacionalização.** Textos pt-BR no template, `LOCALE_ID pt-BR`, moeda BRL pelo
  `currency` padrão, quantidades com `DecimalPipe` (vírgula decimal: "1,5 kg"). O projeto não
  usa ngx-translate; não se aplica.
- **RNF-10 — Custo.** Estimativa por compra: abrir lista de 30 itens = ~31 leituras; ticar 30
  itens = 30 batches de 2 escritas; conferência = 1 leitura da nota + 1 batch. Sem Functions
  novas e sem IA.

## 5. Estrutura de Componentes Proposta

```
shared/
└── model.ts                              # + ListaCompras, ItemLista, VinculoItemLista, StatusLista

src/app/core/firebase/firestore-api.ts    # + setDoc, updateDoc, writeBatch, increment

src/app/features/listas/
├── listas.routes.ts                      # '' → minhas-listas; ':id' → lista; ':id/conferir' → conferencia
├── lista.ts                              # regra pura: conciliar, mesclarItem, itensDaSugestao,
│                                         #   ordenarItens, resumoDaConferencia, textoDaLista
├── lista.spec.ts
├── data-access/
│   ├── listas.service.ts                 # CRUD Firestore (batch item + cabeçalho), onSnapshot
│   ├── listas.service.spec.ts
│   ├── lista.store.ts                    # root: lista aberta, itens, progresso, estimativa (RF-05)
│   └── lista.store.spec.ts
├── minhas-listas/
│   └── minhas-listas.page.ts|html|scss   # RF-01
├── lista/
│   ├── lista.page.ts|html|scss           # RF-02, RF-06..08, RF-09 (rodapé), RF-18, RF-19
│   └── ui/
│       ├── adicionar-item.ts             # <cp-adicionar-item>: campo + autocompletar (Signal Forms)
│       ├── item-lista.ts|scss            # <cp-item-lista>: checkbox, texto, qtd, menu
│       └── editar-item-dialog.ts         # carregado por import()
└── conferencia/
    ├── conferencia.page.ts|html|scss     # RF-10, RF-11, RF-13
    ├── conferencia.store.ts              # nota (NotasService.obter) + pares editáveis (linkedSignal)
    └── ui/
        ├── par-conferido.ts              # linha item da lista ↔ item da nota
        └── escolher-par-dialog.ts        # "Estava na nota como…" / "Estava na lista como…"

Alterações em telas existentes
├── app.routes.ts                         # rota 'listas'
├── core/layout/shell.ts                  # ITENS_NAV + regra do FAB (+ shell.spec.ts)
├── features/sugestoes/                   # "Criar lista com N itens" / "Adicionar à lista" / marca "Na lista"
├── features/importar/importar.store.ts   # contexto `lista` e destino pós-confirmação (RF-09)
├── features/importar/importar.page.*     # aviso "vai ser conferida com a lista X"
├── features/notas/detalhe/               # "Conferir com uma lista" no menu (RF-14)
├── features/painel/                      # card "Lista em andamento" (RF-17)
├── src/index.html                        # ícones: add, checklist, remove, shopping_cart, add_shopping_cart
├── firestore.rules                       # match /listas/{id} e /itens/{itemId} (RNF-07)
└── firestore.indexes.json                # se precisar de status + atualizadaEm (ver D-02)
```

Rotas:

```
/listas                    → minhas listas
/listas/:id                → a lista (uso no mercado)
/listas/:id/conferir?chave → conferência com a nota
/importar?lista=:id        → importação com lista em contexto
```

## 6. Dependências e Pré-condições

| Item | Estado atual | Ação necessária |
|---|---|---|
| Regra para `usuarios/{uid}/listas/**` | Não existe (o `match /usuarios/{uid}` nega escrita) | Acrescentar o `match` do dono com validação; deploy das regras pelo usuário (`npm run deploy:rules:dev`) e checklist no Playground |
| `FIRESTORE_API` | Só leitura + `deleteDoc` | Acrescentar `setDoc`, `updateDoc`, `writeBatch`, `increment` (e nos fakes de teste) |
| Modelo em `@shared/model.ts` | Não existe | Tipos da lista (seção 2) |
| `ImportarStore` | Não conhece lista | Contexto `lista` + destino após confirmar / `ja-importada` / guardada |
| `SugestoesStore` | Seleção só em memória | Expor ação de criar/adicionar à lista e o conjunto de grupos "na lista" |
| Índice do histórico | Pronto (`indiceCompleto`) | Reusar para autocompletar, preço de referência e grupos da conciliação; nota recém-importada pode ter produto fora do cache → `invalidar()` já acontece após `confirmarNfce`, e a conferência resolve grupos da nota por `produtosPorIds`/`membrosDosGrupos` |
| Limiares da conciliação por texto | Inexistentes | Calibrar com fixture real (itens como "LEITE UHT INT ITALAC 1L" × "leite") antes de fixar (D-04) |
| Ícones do Material Symbols | Subset sem `checklist`/`add`/`shopping_cart` | Acrescentar em ordem alfabética no `icon_names=` |
| Functions | — | **Nenhuma alteração** |
| e2e no dv | Só lê dados | Os testes da lista escrevem no dv: limpar as listas criadas ao final |

**Decisões em aberto**

- **D-01 — Persistência (decidido pelo usuário em 2026-09-30).** Firestore em
  `usuarios/{uid}/listas`, lido e gravado direto pelo cliente com o SDK modular (`setDoc`,
  `updateDoc`, `writeBatch`, `onSnapshot`), sem Function. Sincroniza entre aparelhos e funciona
  offline pela fila local do cache persistente. A restrição de escrita do cliente continua
  valendo só para as coleções compartilhadas e as notas.
- **D-02 — Itens em subcoleção da lista (decidido pelo usuário em 2026-09-30).** Cada lista é
  um documento `usuarios/{uid}/listas/{listaId}` e cada item é um documento próprio em
  `usuarios/{uid}/listas/{listaId}/itens/{itemId}`, ligado à sua lista pelo caminho. A regra
  valida cada item, dois aparelhos marcando ao mesmo tempo não se sobrescrevem e cada toque grava
  só o item (mais o contador do cabeçalho). Excluir a lista apaga os itens num `writeBatch`
  antes do documento da lista.
- **D-03 — Limites e ciclo de vida (decidido pelo usuário em 2026-09-30).** Máximo de **5
  listas** por usuário, 150 itens e 3 notas por lista. Quando a lista vira compra (conferência
  salva), ela é **excluída** ou **guardada para usar depois** (RF-13).
- **D-04 — Conciliação por texto (ajuste técnico, sem decisão do usuário).** A semelhança entre
  "leite integral" (lista) e "LEITE UHT INT ITALAC 1L" (nota) é medida de 0 a 1 pela proporção
  de palavras em comum (Jaccard). A partir de **0,4** o app liga sozinho (marcado como
  aproximado); entre **0,25 e 0,4** pergunta em "Confirme"; abaixo disso não liga. Os valores
  são o ponto de partida e são ajustados com as notas reais do dv durante a implementação. IA
  fica fora (custo e envio do texto do usuário para a API).
  **Calibrado em 2026-09-30** com a nota real (`src/testing/fixtures/lista/`, spec
  "calibração D-04" em `lista.spec.ts`): o texto da lista tem 1 ou 2 palavras e a descrição da
  NFC-e 3 ou 4, então acertos óbvios ficam em 1/3 ("detergente" × "Det Ype 500ml Coco" = 0,33;
  "leite" × "Leite Lider 1l Desn" = 0,33; "pão francês" × "Pao Wickbold 270g Or" = 0,25;
  "papel higiênico" × "Pap Hig Duetto 12r p" = 0,67). Valores finais: **liga com ≥ 1/3**
  (`LIGA_POR_TEXTO`) quando há **um candidato só**; **pergunta a partir de 0,2**
  (`PERGUNTA_POR_TEXTO`) ou quando há mais de um candidato (ex.: "leite" com dois leites na nota).
  Reavaliar com notas do dv na verificação manual.
- **D-05 — Preços.** Só as notas do usuário (herda o D-05 da sugestão). "Onde comprar a lista
  mais barato" continua na Sugestão (visão "Por mercado"); a lista não repete isso na v1.
- **D-06 — Escopo (decidido pelo usuário em 2026-09-30).** Tudo numa entrega só: RF-01 a
  RF-19, inclusive a tela acesa (D-07).
- **D-07 — Tela acesa (Wake Lock).** Liga só na lista com itens pendentes e desliga ao sair da
  tela ou ocultar a aba; sem suporte no navegador, nada acontece.
- **D-08 — Lista compartilhada com outra pessoa.** Fora da v1: exige membros na regra e convite.

## 7. Critérios de Aceitação

- [ ] Item "Lista de compras" no menu leva a `/listas`; o FAB não aparece em `/listas/:id`.
- [ ] Criar lista, renomear e excluir funcionam; a exclusão pede confirmação.
- [ ] Com 5 listas, não dá para criar outra (nem pela sugestão) e o aviso explica o motivo.
- [ ] Digitar "leite" sugere os leites que o usuário já comprou; escolher um grava o item com
      `grupo` e a quantidade habitual; texto livre vira item sem `grupo`.
- [ ] Adicionar um item já presente soma a quantidade em vez de duplicar.
- [ ] Em `/sugestoes`, "Criar lista com N itens" cria a lista com os itens selecionados e as
      quantidades ajustadas, e abre a lista.
- [ ] Ticar um item move para "No carrinho", atualiza o progresso ("8 de 15") e o leitor de tela
      anuncia; "Desfazer" volta o item.
- [ ] Com o aparelho em modo avião, ticar/adicionar/editar funciona; ao voltar a conexão, a
      marcação aparece no outro aparelho.
- [ ] Item com histórico mostra o último preço pago e o rodapé a estimativa, com a contagem de
      itens sem preço.
- [ ] "Ler a nota desta compra" abre a importação com o aviso da lista; após confirmar, abre a
      conferência da nota com a lista.
- [ ] Nota já importada também pode ser conferida com a lista.
- [ ] Nota guardada na fila deixa a lista "aguardando nota" e, quando a nota chega, a lista
      oferece "Conferir agora".
- [ ] A conferência liga por grupo os itens que vieram do histórico/sugestão, liga por texto os
      itens digitados com descrição parecida (marcados como aproximados) e manda os incertos para
      "Confirme".
- [ ] O resumo mostra total da nota, valor da lista, valor fora da lista e itens que faltaram,
      e os números batem com a soma dos itens.
- [ ] Desfazer um par, ligar à mão ("Estava na nota como…") e adicionar um item de fora da lista
      funcionam antes de salvar.
- [ ] Salvar a conferência marca os itens ligados, grava o vínculo e preenche o `grupo` dos
      itens digitados.
- [ ] Ao finalizar: "Excluir lista" apaga a lista e os itens; "Guardar para usar de novo" deixa
      todos os itens desmarcados, sem vínculo, com o produto aprendido e "última compra em";
      "Manter só o que faltou" deixa só os itens sem par; "Ler outra nota" confere uma segunda
      nota só com os itens ainda sem par.
- [ ] Na próxima compra com uma lista guardada, os itens que eram texto livre ligam por produto.
- [ ] "Conferir com uma lista" no detalhe da nota abre a conferência com a lista escolhida.
- [ ] Excluir a nota antes de finalizar não quebra a lista (mostra "A nota foi excluída").
- [ ] A tela fica acesa na lista com itens pendentes e volta ao normal ao sair dela.
- [ ] Regras: outro usuário não lê nem grava a lista; campo extra, texto > 80 ou quantidade
      inválida são recusados; escrita em `notas`/`pendentes` continua negada (checklist do
      Playground no dv).
- [ ] `lista.ts` com 100 % de cobertura; `npm run lint`, `npm run contraste`, `npm run test:ci`
      e o build de produção passam; o `main` continua abaixo de 500 kB.
- [ ] e2e (chromium e mobile) cobre criar, adicionar, ticar, criar pela sugestão e conferir, sem
      violações do axe em `/listas` e `/listas/:id`.
