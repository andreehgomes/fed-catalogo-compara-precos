# Fase 8: Minhas notas

**Plano:** [índice](./compara-precos-nfce-plano.md)
**Pré-requisito:** [Fase 7](./compara-precos-nfce-fase-7.md)
**Próxima fase:** [Fase 9](./compara-precos-nfce-fase-9.md)
**Requisitos:** RF-11, RF-12, RF-13, RF-28 · RNF-03, RNF-09

---

## Objetivo

A área privada do usuário: lista das notas importadas (com pendentes no topo),
detalhe com os itens, exclusão e, em cada item com EAN, **"Tem mais barato
perto?"** consultando o Menor Preço.

---

### Tarefa 8.1: `NotasService` e índices

**Arquivos a criar/modificar:** `src/app/features/notas/data-access/notas.service.ts`
(+ spec), `firestore.indexes.json`

**O que fazer:**
- `listar({ cnpj?, de?, ate?, cursor? })`: `query(usuarios/{uid}/notas, where…,
  orderBy('emissao', 'desc'), limit(20), startAfter(cursor))` (RNF-03). Expor como
  `rxResource`.
- `obter(chave)`: `onSnapshot` convertido com `toSignal`.
- `excluir(chave)`: `deleteDoc`. A regra permite, e os preços publicados continuam
  (RF-13).
- Índices compostos para `cnpj + emissao desc`.

**Critério:** spec com o SDK do Firestore mockado confere que as queries saem com os
`where`/`orderBy`/`limit`/`startAfter` certos para cada filtro e que o cursor avança
sem repetir. O índice composto está em `firestore.indexes.json`.

---

### Tarefa 8.2: Lista de notas

**Arquivos a criar:** `src/app/features/notas/lista/notas-lista.page.ts|html|scss`,
`src/app/features/notas/ui/pendente-row/…`

**O que fazer:**
- Topo: pendentes (componente da Fase 7.4), se houver.
- Filtros: estabelecimento (select com os CNPJs das notas do usuário) e período
  (este mês, mês passado, 3 meses, personalizado com `mat-datepicker`), refletidos
  em query params.
- Linhas (`.cp-list-row`): estabelecimento, data, total e nº de itens, com marca
  "Nova" se `veioDaFila` e ainda não aberta. "Carregar mais" por cursor.
- Estado vazio com a ação "Importar primeira nota".

**Critério:** spec da página com o `NotasService` mockado devolvendo 45 notas em
páginas: a lista pagina de 20 em 20, e os filtros vão para os query params e são
restaurados deles (refresh).

---

### Tarefa 8.3: Detalhe da nota e exclusão

**Arquivo a criar:** `src/app/features/notas/detalhe/nota-detalhe.page.ts|html|scss`

**O que fazer:**
- Cabeçalho `.cp-detail-header`: estabelecimento (com link para
  `/estabelecimentos/:cnpj`), data, total, desconto e chave formatada com botão
  copiar.
- Itens: descrição (com link para `/produtos/:produtoId`), quantidade, unitário,
  total e preço por unidade base.
- Criar `src/app/shared/ui/confirm-dialog/confirm-dialog.ts` (`mat-dialog`, com
  título, mensagem e rótulo do botão por `MAT_DIALOG_DATA`, e o botão de perigo em
  `.cp-btn-danger`). É o primeiro uso, por isso nasce aqui.
- "Excluir nota" com `confirm-dialog` (explicando que os preços anônimos
  continuam na base). Ao excluir, volta para a lista.

**Critério:** os dados batem com a nota gravada. A exclusão pede confirmação e
remove só a nota.

---

### Tarefa 8.4: "Tem mais barato perto?" (RF-28)

**Arquivos a criar:** `src/app/features/notas/detalhe/mais-barato-perto.ts`

**O que fazer:**
- Botão **"Comparar com mercados perto"** no detalhe. **Sob demanda**, para não
  disparar N consultas ao abrir a nota.
- Para cada item com `ean`, **sequencialmente** (`concatMap`, no máximo 1 em voo,
  RNF-32), chama `FontePrecosRegiao.porGtin` com a localização atual (Fase 5.4),
  aplica `separarDivergentes`, pega o **menor coerente** e compara com o `vlUnit`
  pago.
- Em cada item: `<cp-badge-preco>` "R$ 0,80 mais barato no Mercado X (1,2 km)" com
  `<cp-fonte-preco fonte="menor-preco">`, ou "Você pagou o menor preço" quando for o
  caso.
- Rodapé: **economia potencial da nota** (soma das diferenças positivas × qtd).
- Itens sem EAN: "Sem código de barras na nota". Se o spike da 6.3 confirmar que o
  PR não traz EAN, esta tarefa usa a busca por **texto** (`porTermo` com a descrição
  normalizada e o primeiro coerente) e marca o resultado como "aproximado".
- Menor Preço indisponível: mensagem única no topo, sem quebrar o detalhe.

**Critério:** com as fixtures do Menor Preço, uma nota de 10 itens gera no máximo 10
requisições sequenciais, repetir não gera nenhuma (cache) e a soma da economia
confere com o cálculo manual.

---

## Critérios de Aceitação da Fase

- [ ] Lista paginada e filtrável, com pendentes no topo.
- [ ] Detalhe fiel à nota; exclusão com confirmação e só da própria área.
- [ ] Comparação com o Menor Preço sob demanda, sequencial, com cache e fonte identificada.
- [ ] Economia potencial calculada por nota.
- [ ] Nenhuma informação comunicada só por cor.
