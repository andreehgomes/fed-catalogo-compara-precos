# Fase 7: Importação (front)

**Plano:** [índice](./compara-precos-nfce-plano.md)
**Pré-requisito:** [Fase 5](./compara-precos-nfce-fase-5.md) (`<cp-scanner>`) e [Fase 6](./compara-precos-nfce-fase-6.md) (callables)
**Próxima fase:** [Fase 8](./compara-precos-nfce-fase-8.md)
**Requisitos:** RF-03 a RF-10a · RNF-05, RNF-08

---

## Objetivo

O fluxo que o usuário faz no mercado: **ler o QR → ver a prévia → confirmar**, com
as quatro entradas combinadas (câmera, imagem da galeria, URL colada, chave
digitada), mensagens claras para cada erro e a opção de **guardar a nota** quando a
SEFAZ estiver fora.

---

### Tarefa 7.1: `ImportarService` (data-access)

**Arquivo a criar:** `src/app/features/importar/data-access/importar.service.ts` (+ spec)

**O que fazer:** wrappers tipados sobre `httpsCallable` (token `FUNCTIONS`):
`preview({ url } | { chave })`, `confirmar(chave)`, `enfileirar({ url } | { chave })`
e `retentar(chave)`. Converte `FunctionsError` e as respostas `{ erro }` em
`ErroImportacao` (união da Fase 3.1). É o único arquivo da feature que conhece o SDK.

**Critério:** spec com callables mockadas cobre sucesso e cada código de erro.

---

### Tarefa 7.2: Tela "Importar nota"

**Arquivos a criar:** `src/app/features/importar/importar.page.ts|html|scss`,
`importar.store.ts`, `importar.routes.ts`

**O que fazer:**
1. Ação principal em destaque: **"Ler QR Code do cupom"**, que abre o
   `<cp-scanner [formatos]="['qr_code']">` dentro de `@defer (on interaction)`.
2. Alternativas, em seção secundária: "Escolher imagem" (dentro do scanner), **"Colar
   link do QR"** (lê `navigator.clipboard.readText()` quando permitido, senão campo
   de texto) e **"Digitar a chave de 44 dígitos"** (campo com máscara em blocos de 4
   e `inputmode="numeric"`).
3. **Validação local antes de qualquer chamada:** URL via `lerUrlQr` e chave via
   `validarChave` (critério da análise: DV inválido nunca chama a function). A
   mensagem aparece junto do campo.
4. `ImportarStore` com o estado do fluxo como união: `ocioso | validando |
   buscando | preview(NfceParsed) | confirmando | erro(ErroImportacao)`. Ao ler,
   chama `preview` e navega para `/importar/preview`.
5. Mensagens por código (RF-10):

   | Código | Mensagem | Ação oferecida |
   |---|---|---|
   | `url-invalida` | "Esse QR Code não é de uma NFC-e." | ler de novo |
   | `uf-nao-suportada` | "Por enquanto só notas do Paraná." | — |
   | `ja-importada` | "Você já importou essa nota." | **abrir a nota** |
   | `sefaz-indisponivel` | "O site da SEFAZ-PR está fora do ar agora." | **"Guardar e importar quando voltar"** → `enfileirar` |
   | `nao-encontrada` / `cancelada` | texto específico | — |
   | `layout-inesperado` | "Não conseguimos ler essa nota. Já registramos o problema." | guardar na fila |
   | `rate-limit` | "Muitas importações seguidas. Tente em alguns minutos." | — |
   | `chave-sem-qr` | "Com a chave sozinha não deu. Leia o QR do cupom." | abrir o scanner |

**Critério:** specs do `ImportarStore` e da página, com o `ImportarService` mockado,
cobrem cada código de erro. e2e contra o dv (usuário de teste da 4.4), com as
**callables interceptadas por `page.route`** (`**/*.cloudfunctions.net/**`), retornando
respostas fixas: URL colada → prévia; chave com DV errado mostra erro **sem**
requisição à function (conferido pela ausência de chamada interceptada);
`sefaz-indisponivel` oferece guardar e chama `enfileirarNfce`.

---

### Tarefa 7.3: Prévia e confirmação

**Arquivo a criar:** `src/app/features/importar/preview-nota/preview-nota.page.ts|html|scss`

**O que fazer:**
- Cabeçalho com o estabelecimento (nome, CNPJ formatado, endereço), data e hora,
  total e nº de itens.
- Lista de itens (`.cp-list`, `@for … track item.n`): descrição, `qtd × unitário`,
  total e, se existir, preço por unidade base (`<cp-preco>`).
- Botões **"Confirmar importação"** (`confirmar`) e "Cancelar". Ao confirmar, vai para
  `/notas/:chave` com um snackbar "Nota importada".
- Se o usuário chegar à rota sem prévia no store (refresh), volta para `/importar`.
- Erro `preview-expirado` na confirmação refaz a prévia uma vez, automaticamente.

**Critério:** os valores exibidos batem com a fixture. Confirmar leva ao detalhe da
nota. Refresh na prévia volta para Importar sem erro.

---

### Tarefa 7.4: Pendentes visíveis

**Arquivos a criar/modificar:** `src/app/features/notas/data-access/pendentes.service.ts`,
`src/app/features/importar/importar.page.html`

**O que fazer:**
- `PendentesService.pendentes`: `toSignal` de `onSnapshot` em
  `usuarios/{uid}/pendentes`, ordenado por `criadaEm`.
- Na tela Importar, um bloco "Aguardando a SEFAZ-PR (N)" com cada pendente:
  estabelecimento derivado da chave (CNPJ formatado), mês, **chip
  `.cp-status--aguardando`** ("Próxima tentativa às 14:30") ou **`--falhou`**
  ("Não foi possível importar"), com ações "Tentar de novo" (`retentar`) e "Excluir".
- Quando um pendente some e a nota correspondente aparece (`veioDaFila`) com o app
  aberto, mostrar o snackbar "Nota de <estabelecimento> importada".

> A lista de notas (Fase 8) exibe os mesmos pendentes no topo. O componente de linha
> de pendente fica em `features/notas/ui/pendente-row` e é compartilhado.

**Critério:** spec do `PendentesService` com o SDK mockado (snapshots simulados): um
pendente que some com a nota correspondente aparecendo dispara o snackbar. O teste
ponta a ponta no dv (enfileirar → function agendada → nota importada) é pendência
do usuário, depois do deploy das Functions.

---

## Critérios de Aceitação da Fase

- [ ] Câmera, imagem da galeria, URL colada e chave digitada levam à mesma prévia.
- [ ] Chave com DV inválido é rejeitada sem chamar a function.
- [ ] Cada código de erro tem mensagem e ação próprias.
- [ ] SEFAZ fora do ar → "Guardar e importar quando voltar" → pendente visível com status e próxima tentativa.
- [ ] Nota reimportada leva à nota existente.
- [ ] Funciona em 375×812 com uma mão: ação principal acima da dobra, alvos ≥ 44px.
