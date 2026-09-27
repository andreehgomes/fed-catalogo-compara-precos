# Execução: Fase 6 — Importação (backend, Firebase Functions)

**Data:** 2026-09-27
**Plano:** docs/plano/compara-precos-nfce-fase-6.md (via `compara-precos-nfce-executar-tudo.md`)
**Branch:** main
**Executor:** Claude Code

---

## Resumo

Functions v2 em `functions/` (esbuild em bundle, Vitest, repositório com fake em memória):
fetch seguro da SEFAZ-PR com allowlist e redirects controlados, classificação das
respostas pelo conteúdo (com as páginas de erro reais do spike), prévia com rate limit,
confirmação transacional com dedup e publicação anônima de preços, fila de pendentes com
backoff e log estruturado. App Check no front (lazy). **O parser do PR ficou provisório:
o portal continuava fora do ar (Tarefa 6.3 ⛔).**

Teste do portal no início da fase (URL real do usuário): HTTP 200 com "Url do QRCode mal
formatado" — mesma falha do spike.

---

## Tarefas Executadas

| Fase | Tarefa | Status | Observações |
|------|--------|--------|-------------|
| 6.1 | Estrutura | ✅ | `functions/` com Node 22, firebase-functions 7.4, firebase-admin 14.5, cheerio 1.2; build esbuild com `--alias:@shared=../shared` (2,2 MB); `typecheck`; `config.ts` (região, `maxInstances: 5`, `initializeApp`); callables com `enforceAppCheck`; `Repositorio` + `RepositorioFirestore` + `RepositorioMemoria`; relógio por parâmetro |
| 6.2 | Fetch seguro e classificação | ✅ | `allowlist.ts` (reconstrói a URL em HTTPS), `fetch-sefaz.ts` (redirect manual ≤ 3 só para hosts SEFA-PR, timeout 15 s, 1 retry, 2 MB, UTF-8/Latin-1), `classificar-resposta.ts`. Fixtures reais copiadas para `functions/test/fixtures/sefaz-pr/` |
| 6.3 | Parser da NFC-e do PR | ⛔ | Portal fora do ar. Feito o que não depende dele: `parsers/index.ts` (`parserPara`, adaptador por UF), `parsers/pr.ts` **provisório** sobre o layout padrão SVRS, testado com uma fixture **sintética** (rotulada), e `scripts/anonimizar-fixture.mjs` (testado com CPF e nome inseridos). Falta: ≥ 3 fixtures reais anonimizadas, confirmar seletores, EAN e v3 só com a chave, e escrever `docs/analise/spike-sefaz-pr-AAAA-MM-DD.md` |
| 6.4 | `previewNfce` | ✅ | URL ou chave (v3), rate limit 30/h em `rateLimit/{uid}`, `ja-importada` com a chave, preview em `previews/{uid}_{chave}` com TTL (`expiraEm` + `fieldOverrides.ttl`), `layout-inesperado` registra o HTML só em dev. Não enfileira |
| 6.5 | `confirmarNfce` + publicação | ✅ | Lê só o preview; transação com nota, perfil mínimo, estabelecimento e `nfceImportadas`; preços só na 1ª importação da chave, em lotes ≤ 500, sem uid; apaga o preview |
| 6.6 | Fila de pendentes | ✅ | `enfileirarNfce` idempotente, `reprocessarPendentes` (every 15 minutes, ≤ 20, 1 s entre fetches), backoff 15 min → 1 h → 6 h → 24 h, `falhou` após 7 dias ou erro definitivo, `retentarPendente`. Índice de collection group em `firestore.indexes.json` |
| 6.7 | App Check | ✅ / ⛔ | Chaves por ambiente no `environment`; `initializeAppCheck` com reCAPTCHA Enterprise, debug token no `localhost`. ⛔ Registro do debug token e teste "callable sem token é rejeitada": usuário (checklist `docs/qualidade/functions-dv-checklist.md`) |
| 6.8 | Log estruturado | ✅ | `logImportacao` com `chavePrefixo` (6 dígitos), sem uid/CNPJ; chamado em prévia, confirmação, enfileiramento e reprocessamento |

---

## Discrepâncias do Plano

- **Parser provisório em vez de nenhum parser.** O executar-tudo pedia marcar 6.3 como ⛔
  e seguir com um `NfceParsed` escrito à mão — foi o que os testes de fluxo usam
  (`test/apoio.ts`). Além disso, para o app não responder sempre `layout-inesperado`
  quando o portal voltar, há um `parsePr` escrito sobre o layout SVRS conhecido,
  validado só com fixture sintética. **Não conta como critério cumprido.**
- **App Check ativado na factory de `FUNCTIONS`**, e não em `provideFirebase()`: o SDK
  de App Check fica fora do bundle inicial (467 kB) e só as callables o exigem.
- **"Não consta" em 48 h:** a chave só tem o mês de emissão (AAMM), então a janela conta
  a partir do fim desse mês (horário de Brasília).
- **Hosts de redirect permitidos** (`www.fazenda`, `www.dfeportal`, `dfeportal`,
  `www.dfews` `.fazenda.pr.gov.br`) são uma suposição a confirmar no spike da 6.3.
- **`ACEITA_V3_SO_COM_CHAVE = true`** em `preview-nfce.ts` até o spike responder; se o
  portal recusar v3, basta mudar para `false` e a prévia por chave responde `chave-sem-qr`.
- **`retentadaEm`** acrescentado ao `Pendente` para a retentativa manual reabrir a
  janela de 7 dias.
- `menorPreco` do produto é trocado por uma observação mais barata **ou** quando o atual
  tem mais de 90 dias (evita um preço antigo ficar para sempre).
- Callables respondem `{ ok, erro }` em vez de lançar `HttpsError` para erros de negócio;
  `unauthenticated` e erros inesperados continuam como exceção.
- `npm install --prefix functions` adicionou o projeto raiz como dependência
  (`file:..`); corrigido e registrado no CLAUDE.md.

---

## Análise de Lint

```
npm run lint → All files pass linting.
npm --prefix functions run typecheck → sem erros
```

## Verificações

```
npm --prefix functions run build → lib/index.js 2.2mb
npm --prefix functions test → 3 arquivos, 59 testes verdes
cobertura: importar/ 95,2% stmts · parsers/ 100% stmts (sintética) · pendentes/ 95,8%
npm run test:ci → 20 arquivos, 192 testes verdes
ng build -c production → initial 467.44 kB, sem aviso
```

## Boas Práticas Angular 20

| Critério | Status |
|----------|--------|
| OnPush em todos os componentes | ✅ (sem componentes novos) |
| inject() sem construtor | ✅ |
| takeUntilDestroyed() | ✅ (n/a) |
| trackBy/track em @for | ✅ (n/a) |
| loading="lazy" em imagens | ✅ (n/a) |
| Sem any implícito | ✅ (front e functions em `strict`) |

---

## Critérios de Aceitação

- ✅ URL fora da allowlist, IP interno e redirect externo são rejeitados (specs).
- ✅ Cada página de erro real do spike é classificada corretamente (specs com as 3 fixtures).
- ⛔ Parser do PR com ≥ 3 fixtures reais anonimizadas e cobertura ≥ 80% — depende da SEFAZ-PR voltar.
- ✅ Prévia, confirmação, dedup por usuário e dedup de preços cobertos por testes com o repositório em memória.
- ⛔ (Usuário, após Blaze no dv + `npm run deploy:functions:dev`) Importação ponta a ponta no dv.
- ✅ Nenhum `precos/*` com `uid`; nenhum campo de CPF no modelo (spec confere as chaves de `precos`).
- ✅ Fila: backoff, importação automática quando a SEFAZ volta, `falhou` após 7 dias, retentativa manual (relógio controlado).
- ✅ Rate limit de 30/h por usuário.
- ⛔ App Check exigido em produção: configurado no código (`enforceAppCheck`); a verificação é manual após o deploy.
- ✅ `CLAUDE.md` com a seção **Functions**.

---

## Arquivos Criados/Modificados

```
functions/package.json package-lock.json tsconfig.json vitest.config.ts
functions/src/{index,config}.ts
functions/src/dados/{repositorio,repositorio-firestore}.ts
functions/src/importar/{allowlist,classificar-resposta,confirmar-nfce,contexto,erros,fetch-sefaz,gravar-nota,log,obter-nota,preview-nfce,publicar-precos,rate-limit}.ts
functions/src/pendentes/{enfileirar,reprocessar-pendentes}.ts
functions/src/parsers/{index,pr}.ts
functions/test/{apoio.ts,seguranca.spec.ts,classificar-e-parser.spec.ts,importacao.spec.ts,fakes/repositorio-memoria.ts}
functions/test/fixtures/sefaz-pr/{erro-*.html (reais), nota-sintetica-svrs.html}
scripts/anonimizar-fixture.mjs
firestore.indexes.json shared/model.ts
src/app/core/firebase/{app-check.ts,functions.token.ts,firebase.providers.spec.ts}
src/environments/environment{,.prod}.ts
docs/qualidade/functions-dv-checklist.md CLAUDE.md .prettierignore
```
