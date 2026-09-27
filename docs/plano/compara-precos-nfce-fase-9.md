# Fase 9: Produtos, estabelecimentos e painel

**Plano:** [índice](./compara-precos-nfce-plano.md)
**Pré-requisito:** [Fase 8](./compara-precos-nfce-fase-8.md)
**Próxima fase:** [Fase 10](./compara-precos-nfce-fase-10.md)
**Requisitos:** RF-14 a RF-21, RF-23

---

## Objetivo

A comparação sobre a **base comunitária** (preços publicados pelas notas
importadas): busca de produto, página do produto com menor, médio e maior preço por
estabelecimento, histórico, vínculo de produtos equivalentes, páginas de
estabelecimento e o painel inicial.

---

### Tarefa 9.1: `ProdutosService` e índices

**Arquivos a criar/modificar:** `src/app/features/produtos/data-access/produtos.service.ts`
(+ spec), `firestore.indexes.json`

**O que fazer:**
- `buscar(texto)`: com um GTIN válido, `getDoc(produtos/ean:<gtin>)`. Com texto,
  `where('tokens', 'array-contains', <token mais raro do termo>)`, `limit(30)`, e
  depois filtra no cliente pelos demais tokens.
- `obter(id)` e `equivalentes(id)`: o produto, o canônico (`vinculadoA`) e os que
  apontam para o mesmo canônico (`where('vinculadoA', '==', canonico)`).
- `precos(ids[], desde = 90 dias)`: `where('produtoId', 'in', ids)` (≤ 30),
  `where('emissao', '>=', desde)`, `orderBy('emissao', 'desc')`, `limit(300)`.
- Índices: `precos(produtoId, emissao desc)`, `produtos(tokens array, descricaoNorm)`
  e `produtos(vinculadoA)`.

**Critério:** spec com o SDK mockado: busca por EAN usa `getDoc` em `ean:<gtin>`, a
busca por texto consulta pelo token mais raro e filtra os demais no cliente, e os
equivalentes são resolvidos pelo canônico.

---

### Tarefa 9.2: Busca de produtos

**Arquivo a criar:** `src/app/features/produtos/busca/produtos-busca.page.ts|html|scss`

**O que fazer:** campo (Signal Forms, debounce de 400 ms) + botão "Ler código de
barras" (`<cp-scanner>` com EAN, em `@defer`). Resultados em lista com descrição,
menor preço conhecido e nº de estabelecimentos. Sem resultado na base própria,
mostrar o atalho **"Ver preços perto de mim"**, que leva para
`/regiao?gtin=`/`?termo=` (Fase 5).

**Critério:** um EAN existente abre o resultado. Um inexistente oferece o atalho para
o Menor Preço.

---

### Tarefa 9.3: Página do produto e histórico

**Arquivos a criar:** `src/app/features/produtos/detalhe/produto-detalhe.page.ts|html|scss`,
`src/app/shared/ui/grafico-historico/grafico-historico.ts`

**O que fazer:**
1. Resumo com `computed()` sobre os preços: **menor, médio e maior** (RF-15), em
   R$/unidade base quando houver conteúdo (RF-19), senão por item.
2. Tabela por estabelecimento: **último preço observado**, data e
   `<cp-badge-preco>` relativo ao menor. Fonte `comunidade` (ou `minhas-notas`
   quando o preço veio de uma nota do próprio usuário, cruzando com as notas dele).
3. Bloco "Preços perto de mim agora", que reusa `FontePrecosRegiao.porGtin` quando o
   produto tem EAN (em `@defer (on viewport)`).
4. `grafico-historico`: **SVG próprio** (sem lib, RNF-01), com uma linha por
   estabelecimento (até 5, o resto agrupado), eixo de datas, tooltip acessível
   (`<title>`) e tabela equivalente para leitor de tela. Carregado com
   `@defer (on viewport)`.

**Critério:** com seed de 3 estabelecimentos × 6 datas, os valores de
menor/médio/maior conferem, o gráfico desenha 3 séries e o chunk do gráfico é lazy.

---

### Tarefa 9.4: Vincular produtos equivalentes (RF-18)

**Arquivos a criar:** `functions/src/produtos/vincular-produto.ts` (+ spec),
`src/app/features/produtos/vincular/vincular-dialog.ts`

**O que fazer:**
1. Callable `vincularProduto({ origem, destino })`. Resolve o canônico do destino
   (segue `vinculadoA` até a raiz, evitando ciclo), grava `produtos/{origem}.vinculadoA
   = canonico` e reaponta quem apontava para a origem. Não permite vincular um
   `ean:` a outro `ean:` diferente (EANs distintos são produtos distintos). Aplica o
   rate limit da 6.4 e registra em log (anônimo).
2. Callable `desvincularProduto({ id })`.
3. No detalhe do produto sem EAN, a ação "Este produto é o mesmo que…" abre um
   `mat-dialog` com busca (reusa a 9.1), sugerindo por `jaccard` os candidatos com
   o mesmo `conteudo`/`unidadeBase`.

**Critério:** vincular "LEITE UHT INT 1L" (loc do mercado A) ao EAN do leite faz a
página do EAN passar a mostrar o preço do mercado A. Tentar vincular dois EANs
distintos é recusado. Não há ciclo possível.

---

### Tarefa 9.5: Estabelecimentos

**Arquivos a criar:** `src/app/features/estabelecimentos/lista/…`,
`src/app/features/estabelecimentos/detalhe/…`, `data-access/estabelecimentos.service.ts`

**O que fazer:**
- Lista (RF-20): nome, cidade e data da última observação, com busca por nome no
  cliente. Paginada.
- Detalhe (RF-21): dados do estabelecimento e **produtos com preço mais recente**
  (`precos where cnpj == x orderBy emissao desc limit 50`), deduplicados por
  produto. Índice `precos(cnpj, emissao desc)`.

**Critério:** o estabelecimento de uma nota importada aparece na lista com os
produtos dessa nota no detalhe.

---

### Tarefa 9.6: Painel (RF-23)

**Arquivo a criar:** `src/app/features/painel/painel.page.ts|html|scss`

**O que fazer:**
- **Total gasto no mês**: soma de `total` das notas do usuário com `emissao` no mês
  corrente, mais a comparação com o mês anterior.
- **Últimas 5 notas** (link para o detalhe) e pendentes, se houver.
- **Economia potencial do mês**: para os itens das notas do mês, a soma de
  `(vlUnit − produtos/{id}.menorPreco) × qtd` quando positiva, usando o **menor
  preço conhecido na base comunitária**. Leitura em lote dos produtos com `in` em
  grupos de 30. Não chama o Menor Preço aqui, para evitar N requisições a cada
  abertura do painel.
- Atalhos grandes: **"Importar nota"** e **"Preços perto de mim"**.
- Estado inicial (sem notas): explica o app em 3 passos e mostra o botão de importar.

**Critério:** com seed de notas em 2 meses, o total e a variação conferem, e a
economia é igual ao cálculo manual sobre o seed.

---

## Critérios de Aceitação da Fase

- [ ] Produto com EAN comprado em 2 mercados mostra os dois, com menor, médio e maior.
- [ ] Preço por unidade base exibido quando a descrição tem conteúdo.
- [ ] Produto sem EAN vinculável; a comparação passa a considerar os dois; sem ciclos.
- [ ] Gráfico e scanner fora do chunk inicial.
- [ ] Estabelecimentos listados a partir das notas, com detalhe.
- [ ] Painel com total do mês, últimas notas, pendentes e economia potencial.
