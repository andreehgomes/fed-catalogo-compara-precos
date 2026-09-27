# Execução: Fase 5 — Preços da região (Menor Preço)

**Data:** 2026-09-27
**Plano:** docs/plano/compara-precos-nfce-fase-5.md (via `compara-precos-nfce-executar-tudo.md`)
**Branch:** main
**Executor:** Claude Code

---

## Resumo

Primeira funcionalidade de valor sem depender da SEFAZ: tela "Preços perto de mim" com
busca por texto (categorias, paginação) e por código de barras (digitado ou lido pelo
`<cp-scanner>`), divergentes ocultos, localização por GPS ou cidade e dados do Menor
Preço validados em runtime, com cache e degradação quando a API cai. Spike da API
registrado com fixtures reais.

---

## Tarefas Executadas

| Fase | Tarefa | Status | Observações |
|------|--------|--------|-------------|
| 5.1 | Fixtures e parâmetros | ✅ | 6 fixtures reais + `docs/analise/spike-menor-preco-2026-09-27.md`; análise 2.1 atualizada. `data` (−1…6) e `ordem` (padrão 0 = menor preço) respondidos; geohash de 7 funciona (340 × 341 resultados). 6 chamadas à API + 2 ao site |
| 5.2 | `MenorPrecoClient` | ✅ | Interface `FontePrecosRegiao`, schema valibot por item, client com timeout 10 s e sem retry, `FonteIndisponivelError`, cache memória + `sessionStorage` 30 min com dedupe em voo. 16 specs com as fixtures |
| 5.3 | `<cp-scanner>` | ✅ / ⛔ | `barcode-detector` (ponyfill por `import()`), nativo quando suporta os formatos, `.wasm` em `assets/zxing`. Câmera traseira, throttle 250 ms, lanterna, galeria, liberação da câmera. Specs com engine falso; e2e decodifica no Chromium as imagens de QR/EAN geradas localmente usando o `.wasm` servido pelo app. ⛔ Teste com câmera de celular real: usuário |
| 5.4 | Localização | ✅ | `municipios-pr.json` (399, IBGE, script em `scripts/`), `LocalizacaoStore` (geohash 7, persiste só origem/cidade/raio), seletor com GPS, `mat-autocomplete` de cidade e raio 1/2/5/10 km |
| 5.5 | Tela "Preços perto de mim" | ✅ | Query params como estado, debounce 400 ms (Signal Forms), GTIN detectado no texto, chips de categoria, `rxResource` + paginação infinita (`IntersectionObserver` + botão "Carregar mais"), skeleton, vazio e "Menor Preço indisponível agora" com "Tentar de novo" manual |
| 5.6 | Resultado por GTIN | ✅ | `separarDivergentes` sobre as ofertas; coerentes por preço com badge "Menor preço"; divergentes atrás de "Mostrar N resultados com descrição diferente" com aviso |

---

## Discrepâncias do Plano

- **Página do Menor Preço não tem 29 itens.** A API devolve a página mais os empates no
  preço de corte (39 e 47 itens, 19 ids repetidos entre a 1ª e a 2ª). O `offset` anda
  de 29 em 29 e a lista deduplica por `id`; a página só é dada como esgotada quando o
  `offset` passa do `total` ou vem vazia.
- **Provedor de `FontePrecosRegiao`:** `@Injectable({ providedIn: 'root', useExisting:
  MenorPrecoClient })` na própria classe abstrata, em vez de
  `{ provide: FontePrecosRegiao, useClass: MenorPrecoClient }` no `app.config` (que
  levaria client + valibot para o bundle inicial). Tipos em `regiao.model.ts` para não
  haver ciclo de import.
- **Cidade, não bairro** (previsto no plano): a análise falava em "cidade/bairro".
- Centróide do município é o **geométrico** da malha do IBGE (Curitiba sai em
  −25,48/−49,29, e não no marco zero).
- O `.wasm` foi para `assets/zxing/` (o `public/` é a raiz de assets do CLI v22; o
  `src/assets` foi acrescentado como entrada para o JSON de municípios).
- O critério "no celular real lê o EAN e o QR" foi coberto no navegador desktop com
  imagens geradas localmente (`scripts/gerar-imagens-codigo.mjs`); câmera real fica
  para o usuário.
- `BadgePreco` ganhou o input opcional `rotulo` ("Menor preço").

---

## Análise de Lint

```
npm run lint → All files pass linting. (stylelint sem erros)
```

## Verificações

```
npm run test:ci → 20 arquivos, 191 testes verdes; cobertura total 90,9%
npm run e2e (regiao) → 4 passed (assets sem CDN + leitura real de QR/EAN no Chromium,
  desktop e mobile), 4 skipped (fluxos logados sem .env.e2e)
ng build -c production → initial 467.38 kB (sem aviso); busca-regiao-page, scanner e
  ponyfill (barcode-detector/zxing) em chunks lazy; zxing_reader.wasm em assets/zxing
```

## Boas Práticas Angular 20

| Critério | Status |
|----------|--------|
| OnPush em todos os componentes | ✅ |
| inject() sem construtor | ✅ |
| takeUntilDestroyed() | ✅ (sem subscription manual de longa duração; `carregarMais` completa sozinho) |
| trackBy/track em @for | ✅ |
| loading="lazy" em imagens | ✅ (nenhuma `<img>`) |
| Sem any implícito | ✅ |

---

## Critérios de Aceitação

- ⛔ Ler um EAN na prateleira em até 3 s (câmera real no celular): usuário. A leitura por imagem e a busca por GTIN estão cobertas por spec/e2e.
- ✅ Divergentes ocultos por padrão e acessíveis por um toque (spec com a fixture real da Coca-Cola).
- ✅ Busca por texto pagina de 29 em 29 sem repetir e respeita a categoria (spec do store com as páginas reais sobrepostas).
- ✅ Repetir a busca em 30 min não gera requisição (spec do client; e2e logado ⛔ sem `.env.e2e`).
- ✅ API bloqueada gera "indisponível", sem retry em loop (spec do store e da página).
- ✅ Negar a geolocalização leva à cidade; nenhuma coordenada em storage (spec). Nada é gravado no Firestore.
- ✅ Scanner e WASM em chunk lazy; câmera liberada ao sair (spec).
- ✅ Specs do `MenorPrecoClient` verdes com as fixtures reais.

---

## Arquivos Criados/Modificados

```
docs/analise/spike-menor-preco-2026-09-27.md docs/analise/compara-precos-nfce-analise.md
src/testing/fixtures/menor-preco/*.json
src/assets/data/municipios-pr.json scripts/gerar-municipios-pr.mjs scripts/gerar-imagens-codigo.mjs
src/app/features/regiao/{busca-regiao.page.*, regiao.store.ts, data-access/*, localizacao/*, resultado-gtin/*, ui/oferta-row.ts} (+ specs)
src/app/shared/ui/scanner/{scanner.ts,html,scss, scanner-engine.ts} (+ spec)
src/app/shared/ui/visivel/visivel.ts src/app/shared/ui/badge-preco/badge-preco.ts
e2e/regiao.spec.ts e2e/support/{login,mocks}.ts e2e/fixtures/*.png
angular.json package.json tsconfig.json src/app/app.routes.ts CLAUDE.md
```
