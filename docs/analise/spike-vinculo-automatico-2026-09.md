# Spike: vínculo automático pelo Menor Preço — 28/09/2026

**Tarefa:** 1.1 do plano [vinculo-automatico-menor-preco-plano.md](../plano/vinculo-automatico-menor-preco-plano.md)
**Base:** `https://menorpreco.notaparana.pr.gov.br/api/v1/produtos`, `data=-1`, `raio=10`,
`local` = centro de Santo Antônio da Platina (geohash 7 `6gu7kr1`; o spike usou `6gu7krj`,
a célula vizinha, sem diferença prática).
**Itens:** os 103 produtos distintos das notas `41260903644587000836652100000168701620438547`
(26/09) e `41260803644587000836652030000088681310226239` (28/08), do Sanches e Vecchiate
(CNPJ 03.644.587/0008-36). Uma consulta por item, 1 por segundo, com o termo de
`termosDeBusca` (a 1ª opção) e a decisão de `decidirGtin` (`shared/vinculo-auto.ts`).

## Resultado

| | itens |
|---|---|
| Resposta real | 60 |
| Resposta **envenenada** (dados sintéticos) | 43 |
| — dessas 60: **vinculado** | 6 |
| — ambíguo (GTINs concorrentes → sugestões) | 18 |
| — sem resultado | 36 (27 com 0 ofertas) |

Vinculados: detergente Ypê coco (`7896098900239`), fermento Royal 100g, leite Batavo
desnatado 1l, milho Fugini 170g, óleo de soja Coamo 900ml e requeijão Batavo light 200g.
Ambíguos típicos: café Itamaraty 500g (tradicional × extraforte × outros),
papel higiênico Duetto, pilhas Duracell, páprica Dona Nena, Coca-Cola 200ml/2l.

Taxa efetiva ≈ 10% das respostas reais vinculadas e 30% com sugestões. Por decisão do
usuário, o vínculo automático fica **sempre ligado** (a base de produtos ainda é pequena e
vai crescer).

## Achados

1. **Bloqueio por volume com dados falsos.** Depois de ~60 consultas em ~2,5 min, a API
   passou a responder HTTP 200 com ofertas sintéticas: estabelecimentos de nome embaralhado
   ("RESTZURANTE TEGPERO DO CHEFQR"), UFs de outros estados misturadas com falsas do PR,
   `desc` igual ao termo buscado, GTINs inventados (alguns com dígito verificador válido) e
   preços aleatórios. O campo de topo `tempo` sobe (~3.900 contra ~30–55 numa real). Um
   "vínculo" do spike (milho Predilecta → GTIN `780…`) saiu de uma resposta dessas. O
   bloqueio tinha passado ~17 min depois. **Regra adotada:** qualquer oferta com
   `estabelecimento.uf` ≠ `PR` condena a resposta inteira; o job para e pausa 2 h.
   Fixtures: `functions/test/fixtures/menor-preco/envenenada-*.json`.
2. **O Sanches e Vecchiate não aparece** no Menor Preço (0 ocorrências em 5 buscas), então
   o caminho "mesma loja pelo mesmo preço" não serve para esse mercado. O caminho principal é
   o **consenso regional** (um único GTIN em ≥ 2 lojas).
3. **Busca por palavra inteira.** Termos abreviados ou cortados pela NFC-e ("des rexona
   form", "mist fleisc cho") voltam vazios. Por isso há um 2º termo, só com as duas
   palavras mais longas, usado quando o 1º não traz nada.
4. A API mostra só a **última venda de cada GTIN por loja** (`nrdoc` da nota dessa venda):
   casar pelo número da nota do usuário não é viável.
5. A cidade da NFC-e vem abreviada ("St Anton Da Platina"): `municipioIgual` compara por
   abreviação (mesma inicial e letras na ordem).

## Fixtures reais salvas (`functions/test/fixtures/menor-preco/`)

| Arquivo | Termo |
|---|---|
| `detergente-ype-coco.json` | `detergente ype coco` (8 ofertas, 1 GTIN) |
| `cafe-itamaraty.json` | `cafe itamaraty` (32 ofertas, 4+ GTINs) |
| `requeijao-batavo.json` | `req batavo ligh` |
| `vazio-des-rexona.json` | `des rexona form` (0) |
| `envenenada-leite-lider.json`, `envenenada-milho-predilecta.json` | respostas sintéticas |
