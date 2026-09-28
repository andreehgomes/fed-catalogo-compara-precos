# Execução: Vínculo automático de produtos pelo Menor Preço

**Data:** 2026-09-28
**Plano:** [docs/plano/vinculo-automatico-menor-preco-plano.md](../plano/vinculo-automatico-menor-preco-plano.md)
**Branch:** main
**Executor:** Claude Code

---

## Resumo

Produto `loc:` novo (item sem EAN) entra na fila `vinculosAuto`. A agendada
`vincularProdutosAuto` busca a descrição no Menor Preço e, quando há um GTIN seguro (mesma
loja pelo mesmo preço ou um único GTIN em ≥ 2 lojas), vincula o `loc:` a `ean:{gtin}`,
criando o `ean:` se preciso. GTINs concorrentes viram sugestões, que o usuário confirma no
diálogo de vínculo. O spike com as duas notas reais descobriu que o Menor Preço devolve
**dados sintéticos sob volume**: o job detecta isso, pausa e consulta devagar.

---

## Tarefas Executadas

| Fase | Tarefa | Status | Observações |
|------|--------|--------|-------------|
| 1.1 | Spike de cobertura | ✅ | 103 itens: 60 respostas reais (6 vinculados, 18 ambíguos, 36 sem resultado) e 43 envenenadas. Fixtures reais salvas |
| 2.1 | Cliente do Menor Preço nas Functions | ✅ | `menor-preco/cliente.ts` + `oferta.ts` (validação por item e recusa de resposta envenenada) |
| 2.2 | `decidirGtin` em `shared/` | ✅ | + `termosDeBusca` (2º termo), `tokensContidos` (prefixo), `municipioIgual` (abreviação) |
| 2.3 | Fila `vinculosAuto` | ✅ | Enfileirada em `publicarPrecos` para `loc:` novo; índice composto novo |
| 3.1 | Núcleo do vínculo | ✅ | `vincular()` e `garantirProdutoEan()`; `vinculoOrigem` e `vinculoBloqueado` |
| 3.2 | Agendada `vincularProdutosAuto` | ✅ | A cada 30 min; 12 consultas, 10 s entre elas; pausa de 2 h no bloqueio; backfill |
| 3.3 | Callable aceita sugestão | ✅ | `ean:` inexistente só se estiver em `sugestoesEan` |
| 4.1 | Página do produto | ✅ | Aviso de vínculo automático ou de sugestões pendentes (`.cp-source`) |
| 4.2 | Sugestões no diálogo | ✅ | Lista "Códigos de barras encontrados no Menor Preço" no fluxo de seleção existente |
| 5.1 | Checklist do dv | ✅ | Cenários 8–13 em `docs/qualidade/functions-dv-checklist.md` |
| 5.2 | CLAUDE.md | ✅ | Functions, Fontes de dados e Produtos |

---

## Discrepâncias do Plano

- **Portão de 25% / `VINCULO_AUTO_ATIVO`:** removidos. O usuário pediu que o vínculo seja
  sempre tentado.
- **Respostas envenenadas (novo):** não previsto. Depois de ~60 consultas a API respondeu
  HTTP 200 com lojas e GTINs inventados; um "vínculo" do spike saiu disso. `lerOfertas`
  recusa a resposta com UF ≠ PR, e o job pausa 2 h (`controle/vinculoAuto`).
- **Ritmo:** o plano previa 40 consultas por execução com 1 s; ficou 12 com 10 s.
- **Retentativas sem resultado:** 1, 7 e 30 dias, em vez de 24 h e 72 h (a base do Menor
  Preço e a nossa crescem).
- **2º termo de busca:** a busca exige palavras inteiras; a NFC-e abrevia/corta.
- **Backfill** dos `loc:` já existentes: acrescentado pela própria agendada (cursor por id,
  `listarIds` no repositório).
- **Diálogo:** em vez de um botão "É este" por sugestão, as sugestões entram no fluxo já
  existente (selecionar + "É o mesmo produto").
- **e2e (4.2):** não acrescentado. O e2e lê o Firestore real do dv, que não tem produto
  com `sugestoesEan` antes do deploy. Coberto por teste de componente em `produtos.spec.ts`
  e pelo cenário 11 do checklist.
- **Localização:** geohash 7 do centro do município (`municipios-pr.json` importado no
  bundle das Functions); o spike usou `6gu7krj`, a célula vizinha do `6gu7kr1` correto.
- **Achado paralelo:** a tela `/regiao` do front também exibiria respostas envenenadas;
  ficou como tarefa separada (chip "Detectar respostas envenenadas do Menor Preço no front").

---

## Análise de Lint

```
All files pass linting.
```

Prettier aplicado nos arquivos tocados. `shared/model.ts` já estava fora do padrão no HEAD
e não foi reformatado.

## Boas Práticas Angular 20

| Critério | Status |
|----------|--------|
| OnPush em todos os componentes | ✅ |
| inject() sem construtor | ✅ |
| takeUntilDestroyed() | ✅ (sem subscription nova) |
| trackBy/track em @for | ✅ (`track s.gtin`) |
| loading="lazy" em imagens | ✅ (sem imagem nova) |
| Sem any implícito | ✅ |

---

## Critérios de Aceitação

- ✅ Spike registrado com a taxa de vinculação das duas notas reais (decisão: sempre ligado).
- ✅ Produto `loc:` novo é enfileirado uma única vez, sem uid.
- ✅ Item com um único GTIN em ≥ 2 lojas (ou na mesma loja pelo mesmo preço) é vinculado a `ean:{gtin}`, criando o `ean:` quando não existe.
- ✅ Item com GTINs concorrentes não é vinculado e ganha até 3 `sugestoesEan`.
- ✅ Conteúdo diferente (ex.: 500 ml × 5 l) nunca é vinculado.
- ✅ Produto desvinculado manualmente nunca volta a ser vinculado pelo job.
- ✅ Menor Preço fora do ar não gasta tentativa e interrompe a execução.
- ✅ Limite de consultas por execução e intervalo entre elas (12 e 10 s).
- ✅ Página do produto indica o vínculo automático; o diálogo oferece as sugestões.
- ⏳ Buscar pelo GTIN em Produtos encontra o `ean:` com os `loc:` como equivalentes: depende do deploy no dv (checklist, cenários 10–11).
- ✅ Testes só com fixtures reais, sem rede: front 282, Functions 90; lint, typecheck e build de produção (inicial 480,84 kB) verdes.

---

## Arquivos Criados/Modificados

```
shared/model.ts                                  (M) Produto.vinculoOrigem/vinculoBloqueado/sugestoesEan, SugestaoEan, VinculoAuto
shared/index.ts                                  (M)
shared/vinculo-auto.ts                           (A)
shared/vinculo-auto.spec.ts                      (A)
functions/src/menor-preco/cliente.ts             (A)
functions/src/menor-preco/oferta.ts              (A)
functions/src/produtos/vincular-auto.ts          (A)
functions/src/produtos/vincular-produto.ts       (M)
functions/src/importar/publicar-precos.ts        (M)
functions/src/importar/contexto.ts               (M)
functions/src/dados/repositorio.ts               (M)
functions/src/dados/repositorio-firestore.ts     (M)
functions/src/index.ts                           (M)
functions/test/vincular-auto.spec.ts             (A)
functions/test/vincular.spec.ts                  (M)
functions/test/importacao.spec.ts                (M)
functions/test/apoio.ts                          (M)
functions/test/fakes/repositorio-memoria.ts      (M)
functions/test/fixtures/menor-preco/*.json       (A) 6 respostas reais (2 envenenadas)
src/app/features/produtos/vincular/vincular-dialog.ts        (M)
src/app/features/produtos/detalhe/produto-detalhe.page.html  (M)
src/app/features/produtos/produtos.spec.ts                   (M)
firestore.indexes.json                           (M) índice vinculosAuto
docs/analise/spike-vinculo-automatico-2026-09.md (A)
docs/plano/vinculo-automatico-menor-preco-plano.md (M) revisão após o spike
docs/qualidade/functions-dv-checklist.md         (M)
CLAUDE.md                                        (M)
```
