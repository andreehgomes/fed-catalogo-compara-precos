# Execução: Vínculo de produtos por etiquetas + IA (síncrono na importação)

**Data:** 2026-09-28
**Plano:** [docs/plano/vinculo-etiquetas-ia-plano.md](../plano/vinculo-etiquetas-ia-plano.md)
**Branch:** main
**Executor:** Claude Code

---

## Resumo

Removido o caminho do vínculo pelo Menor Preço (fila `vinculosAuto`, agendada, callables e
serviço do navegador), mantendo a detecção de resposta envenenada em `/regiao`. No lugar, a
gravação da nota etiqueta cada produto (`tipo|marca|tamanho` + variantes, em `shared/`), liga
de graça o que a regra decide e manda as dúvidas numa única chamada à Claude API
(`claude-opus-5-5`, effort `low`, saída estruturada) com teto mensal de gasto e falha
silenciosa. O front mostra o vínculo automático e oferece os "Possíveis equivalentes".

---

## Tarefas Executadas

| Fase | Tarefa | Status | Observações |
|------|--------|--------|-------------|
| 1.1 | Remover Menor Preço das Functions | ✅ | Arquivos apagados pelo usuário (a exclusão de arquivos não commitados foi bloqueada para o agente); `index.ts`, `contexto.ts`, `publicar-precos.ts`, repositórios, `rate-limit.ts`, índice e teste da fila ajustados |
| 1.2 | Remover do shared e do front | ✅ | `shell.ts`, `ImportarStore` e spec voltaram ao estado do HEAD; `VinculoAuto*` fora do `model.ts`; detecção de envenenada mantida |
| 2.1 | `etiquetar()` | ✅ | `shared/etiquetas.ts` com abreviações compostas, `ABREV_TIPO` (só 1ª palavra), `TIPOS`, `SINONIMOS`, marcas compostas |
| 2.2 | `compararVariantes()` e `decidirPorEtiquetas()` | ✅ | Pares reais do plano no spec |
| 2.3 | Medição no gabarito | ✅ | Acerto 95,8% nas ligações; 2,32 candidatos/item para a IA; números no plano |
| 3.1 | Dependência, secret e contexto | ✅ | `@anthropic-ai/sdk` 0.129 e `zod` 4 (instalados dentro de `functions/`); `ANTHROPIC_API_KEY` em `confirmarNfce` (timeout 120 s) e `reprocessarPendentes` |
| 3.2 | Cliente da IA | ✅ | `client.beta.messages.parse` + `betaZodOutputFormat`, `fallbacks: 'default'`, `stop_reason` conferido, custo por tokens |
| 3.3 | Orquestração em `gravarNota` | ✅ | `vincularNota` com regra, IA, teto, `candidatosVinculo`, log só com contagens |
| 4.1 | Página do produto e diálogo | ✅ | Texto novo; lista "Possíveis equivalentes" |
| 5.1 | Avaliação da IA real | ⏸️ | Script pronto e compilando; **não rodado** (custa centavos, aguarda OK) |
| 5.2 | Checklist do dv e CLAUDE.md | ✅ | Cenários 8–16 novos; CLAUDE.md reescrito nos pontos pedidos |

---

## Discrepâncias do Plano

- **Regra sem variante não liga:** o plano liga "um igual e nenhuma dúvida", inclusive com
  as variantes vazias dos dois lados. No gabarito isso dava 81,4% de acerto, porque a mesma
  loja vende produtos diferentes com a mesma descrição sem variante ("GEL D CLOSE UP 90G",
  dois GTINs e dois preços). `compararVariantes([], [])` continua `'igual'`, mas
  `decidirPorEtiquetas` só liga quando o item tem variante; o resto vai para a IA. Resultado:
  95,8% de acerto.
- **Simulação da medição:** ofertas de outras lojas com as mesmas variantes contam como uma
  raiz só (na base elas já estariam ligadas entre si).
- **`DES` e outras abreviações de tipo:** ficaram em `ABREV_TIPO` de `etiquetas.ts`, valendo
  só na 1ª palavra ("S DES" é semidesnatado). Em `ABREVIACOES` de `normalizar.ts` entraram só
  as sem ambiguidade (`BEB`, `DESINF`, `FERM`, `MAION`, `MOL`, `ODORIZ`, `REFR`, `REQ`).
- **Prefixo com 3 letras ou mais:** `tokensContidos` compara por prefixo só a partir de 3
  letras, senão "AA" casaria com "AAA" (pilhas). Tamanho "1 5L" (vírgula perdida) vira 1.5L,
  senão 1,5 L e 2,5 L caíam no mesmo bloco.
- **Constantes da IA em `vinculo/config-ia.ts`:** o plano as punha em `config.ts`, mas ele
  chama `initializeApp()`/`setGlobalOptions()` ao ser importado, o que os testes não podem
  fazer. `config.ts` ficou só com o secret.
- **Fallback de recusa:** o SDK 0.129 aceita `fallbacks: 'default'` no `beta.messages.parse`,
  então ficou ligado (beta `server-side-fallback-2026-07-01`). Recusa final, corte ou JSON
  inválido lançam `IaSemDecisaoError` (com o custo, que é somado ao gasto do mês).
- **Ids reais nunca vão à IA:** `ia.ts` troca os ids (que contêm CNPJ) por `c1..c5` e traduz de
  volta; resposta com id desconhecido é descartada.
- **`publicarPrecos` preservava mal os campos:** regravava o produto inteiro, apagando
  `vinculoBloqueado`, `vinculoOrigem`, `sugestoesEan` e os novos `candidatosVinculo` quando o
  produto aparecia em outra nota. Agora parte do documento atual (`...atual`). Teste em
  `vincular-nota.spec.ts`.
- **`reprocessarPendentes` com timeout 540 s:** até 20 notas por execução, cada uma com uma
  chamada de até ~25 s, não cabiam nos 300 s.
- **Log:** `RegistroImportacao` ganhou `contagens` (só números) para a etapa `vinculo`; o teste
  de log estruturado passou a esperar a linha `vinculo`.
- **Spec da página do produto:** ficou em `features/painel/paginas-fase9.spec.ts`, onde está
  o harness da `ProdutoDetalhePage`; o do diálogo em `produtos.spec.ts`, como no plano.
- **`functions/tsconfig.json`** passou a incluir `scripts/`, para o typecheck cobrir o script
  da 5.1.

---

- **Bloco sem o tipo (ajuste depois do teste no dv):** o plano usava `tipo|marca|tamanho`, e
  "COCA COLA 2L ZERO" (sem "REFR") ficava sem bloco e nunca era comparado com "Refr Coca Cola
  2l Ze". O bloco virou `marca|tamanho`; o tipo só bloqueia a ligação quando os dois lados o
  têm e são diferentes (`compararEtiquetas`). No gabarito: bloco vazio 44,4% → 38,2%, regra
  com 24 ligações e 95,8% de acerto, 251 itens (46,1%) para a IA com 2,52 candidatos/item.
- **Base anterior ao deploy:** produtos gravados antes não têm `bloco` e não viram candidatos;
  o usuário optou por apagar a base do dv e reimportar (sem script de migração).

## Análise de Lint

```
Linting "fed-catalogo-compara-precos"...
All files pass linting.
(stylelint sem erros)
```

## Verificações

| Comando | Resultado |
|---|---|
| `npm run lint` | ✅ |
| `npm test -- --watch=false` (front + shared) | ✅ 26 arquivos, 295 testes |
| `npm --prefix functions test` | ✅ 7 arquivos, 90 testes |
| `npm --prefix functions run typecheck` | ✅ |
| `npm --prefix functions run build` | ✅ `lib/index.js` 3,6 MB (SDK e zod no bundle) |
| `ng build -c production` | ✅ inicial 480,84 kB (≤ 500 kB) |

## Boas Práticas Angular

| Critério | Status |
|----------|--------|
| OnPush em todos os componentes | ✅ |
| inject() sem construtor | ✅ |
| takeUntilDestroyed() | ✅ (nenhuma subscription nova) |
| trackBy/track em @for | ✅ |
| loading="lazy" em imagens | ✅ (sem imagens novas) |
| Sem any implícito | ✅ |

---

## Critérios de Aceitação

- ✅ Nenhum resto do caminho Menor Preço/fila/navegador (código, índices, exports, docs); a detecção de resposta envenenada em `/regiao` continua.
- ✅ Todo produto novo tem `etiquetas` e `bloco` (ou `bloco: null`).
- ✅ Produto novo com o mesmo bloco e a mesma variante de um produto de outro mercado é ligado **na confirmação**, sem IA (quando há variante; ver discrepâncias).
- ✅ Bloco vazio nunca chama a IA; uma nota gera no máximo 1 chamada (2 se tiver mais de 40 dúvidas).
- ✅ A IA recebe só descrições, com no máximo 5 candidatos por item.
- ✅ Respostas da IA aplicadas: id → vínculo `ia`; `A` → `candidatosVinculo`; `N` → nada.
- ✅ Teto mensal respeitado; custo somado em `controle/iaVinculo_AAAA-MM`.
- ✅ Falha, timeout ou recusa da IA nunca impede a importação.
- ✅ `vinculoBloqueado` é respeitado; reimportar não chama a IA.
- ✅ Página do produto e diálogo mostram o vínculo automático e os possíveis equivalentes.
- ✅ Regra no gabarito: acerto ≥ 90% nas ligações (95,8%); ≤ 5 candidatos por item enviado à IA (2,32).
- ✅ Nenhum teste chama a API da Anthropic, a SEFAZ ou o Menor Preço de verdade.
- ✅ Lint, testes (front, shared, Functions), typecheck, build das Functions e build de produção (≤ 500 kB inicial) verdes.

**Pendências do usuário:** criar o secret `ANTHROPIC_API_KEY` no dv e na produção antes do
deploy; papel de Secret Manager para a conta do CI, se o `deploy.yml` falhar; rodar o
checklist do dv (cenários 8–16); autorizar (ou não) a avaliação da 5.1.

---

## Arquivos Criados/Modificados

```
Criados
  shared/etiquetas.ts, shared/etiquetas.spec.ts
  functions/src/vinculo/config-ia.ts, ia.ts, vincular-nota.ts
  functions/test/etiquetas-gabarito.spec.ts, vinculo-ia.spec.ts, vincular-nota.spec.ts
  functions/scripts/avaliar-ia-vinculo.ts
  docs/execucao/2026-09-28-vinculo-etiquetas-ia.md

Modificados
  shared/model.ts, shared/index.ts, shared/normalizar.ts
  functions/package.json, package-lock.json, tsconfig.json
  functions/src/config.ts, index.ts
  functions/src/importar/contexto.ts, gravar-nota.ts, log.ts, publicar-precos.ts, rate-limit.ts
  functions/src/dados/repositorio.ts, repositorio-firestore.ts
  functions/src/produtos/vincular-produto.ts
  functions/test/apoio.ts, fakes/repositorio-memoria.ts, importacao.spec.ts
  src/app/core/layout/shell.ts, src/app/features/importar/importar.store.ts, importar.spec.ts
    (as alterações não commitadas de 28/09 foram desfeitas; os três voltaram ao HEAD)
  src/app/features/produtos/detalhe/produto-detalhe.page.html
  src/app/features/produtos/vincular/vincular-dialog.ts, produtos.spec.ts
  src/app/features/painel/paginas-fase9.spec.ts
  firestore.indexes.json, CLAUDE.md, docs/qualidade/functions-dv-checklist.md
  docs/plano/vinculo-etiquetas-ia-plano.md (resultado da medição)

Apagados (pelo usuário)
  functions/src/menor-preco/, functions/src/produtos/vincular-auto.ts, vinculo-navegador.ts
  functions/test/vincular-auto.spec.ts, vinculo-navegador.spec.ts, fixtures/menor-preco/
  shared/vinculo-auto.ts (+ spec)
  src/app/features/produtos/data-access/vinculo-auto.service.ts (+ spec)
  src/testing/fixtures/menor-preco/cafe-itamaraty.json, detergente-ype-coco.json
```
