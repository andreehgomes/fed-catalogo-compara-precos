# Spike: API Menor Preço (Nota Paraná) — 27/09/2026

**Tarefa:** 5.1 do plano (`docs/plano/compara-precos-nfce-fase-5.md`)
**Base:** `https://menorpreco.notaparana.pr.gov.br/api/v1`
**Volume:** 6 chamadas à API e 2 downloads do site (HTML + `main.*.bundle.js`), sem varredura.

## Fixtures salvas (`src/testing/fixtures/menor-preco/`)

Local de todas: centro de Curitiba (`-25.4284, -49.2733`) → geohash 9 `6gkzqfbkb`, 7 `6gkzqfb`.

| Arquivo | Requisição | total | itens |
|---|---|---|---|
| `termo-leite-integral-p1.json` | `/produtos?local=6gkzqfb&termo=leite integral&raio=2&data=-1&offset=0` | 340 | 39 |
| `termo-leite-integral-p2.json` | idem, `offset=29` | 340 | 47 |
| `gtin-coca-cola.json` | `/produtos?local=6gkzqfb&gtin=7894900011517&raio=20&data=-1&offset=0` | 330 | 44 |
| `termo-vazio-total-0.json` | `termo=xyzqwvutsrpo` | 0 | 0 |
| `categorias-leite-integral.json` | `/categorias?local=6gkzqfb&termo=leite integral&raio=2&data=-1` | — | 3 categorias |
| `termo-leite-integral-geohash9.json` | a p1 com `local=6gkzqfbkb` | 341 | 40 |

Nenhum dado pessoal: a API devolve só dados de estabelecimentos (razão social,
fantasia, endereço) e da nota (`nrdoc`), sem consumidor. Todas as respostas vieram com
`access-control-allow-origin: *`.

## Respostas às dúvidas

### Valores de `data` (período)

Extraídos do bundle do site (`periodText`): `-1` = **últimos 2 meses** (padrão do site),
`0` = último mês, `1` = últimos 15 dias, `2` = última semana, `3` = últimas 24 horas,
`4` = últimas 12 horas, `5` = últimas 6 horas, `6` = última hora. O app usa `-1`.

### Valores de `ordem`

O `md-select` do site lista, nesta ordem: **Menor Preço**, **Distância**, **Data da venda**
e **Maior Preço**; o padrão (`_orderBy = 0`) é Menor Preço. Os valores numéricos das
opções são atribuídos no template compilado e não aparecem literais; pela ordem e pelo
padrão, o mapeamento provável é `0` menor preço, `1` distância, `2` data, `3` maior
preço. As fixtures (sem `ordem`) confirmam o `0`: os itens vêm em preço crescente. O app
não envia `ordem` (usa o padrão).

### `local` com geohash de 7 caracteres (RNF-35)

Funciona: com 7 caracteres vieram 340 resultados e com 9 vieram 341, com a mesma faixa
de preço. A diferença vem da distância ser medida a partir do centro da célula (7
caracteres ≈ 150 m). **O app envia 7.**

## Observações novas (atualizam a análise 2.1)

- **Página não tem 29 itens fixos.** O `offset` anda de 29 em 29, mas a resposta traz
  a página inteira mais os itens empatados no preço de corte: 39 itens na 1ª e 47 na
  2ª, com **19 ids repetidos** entre elas. A paginação precisa deduplicar por `id`
  (já previsto no plano) e avançar o `offset` de 29 em 29, não pelo tamanho recebido.
- `valor`, `valor_tabela`, `valor_desconto` e `distkm` chegam como **string**
  (`"5.99"`, `"0.844"`). `precos.min`/`max` também, e vêm `""` quando `total` é 0.
- `gtin` vazio (`""`) é comum; `nm_fan` vazio também (cair para `nm_emp`).
- `nr_logr` pode vir com sujeira (`"127-"`).
- Existe um campo `tempo` por item ("há 21 horas") e `local` do estabelecimento
  (geohash de 11). O app calcula o "há N dias" pela `datahora` e não usa o `local`.
- O caso da Coca-Cola se confirmou na fixture real: "AGUA", "AGUA C GAS", "CAFE
  VIAGEM", "CAFE C LEITE VIAGEM", "BOMBOM", "H2O LIMAO" e "CALDO DE CANA 300 ML"
  aparecem com o GTIN `7894900011517`.
