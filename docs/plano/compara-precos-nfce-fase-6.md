# Fase 6: Importação (backend, Firebase Functions)

**Plano:** [índice](./compara-precos-nfce-plano.md)
**Pré-requisito:** [Fase 4](./compara-precos-nfce-fase-4.md) (e Fase 3 para `shared/`)
**Próxima fase:** [Fase 7](./compara-precos-nfce-fase-7.md)
**Requisitos:** RF-06 a RF-10a, RF-17, RF-19 · RNF-04, RNF-14, RNF-18, RNF-21 a RNF-27, RNF-29, RNF-30

---

## Objetivo

As Functions que buscam a página da SEFAZ-PR com segurança, interpretam a nota,
gravam a nota do usuário, publicam os preços anônimos uma única vez por chave e
**enfileiram** a nota quando o portal estiver fora, reprocessando-a sozinhas depois.

### ⛔ Bloqueio externo

A **Tarefa 6.3 (parser)** precisa do portal SEFAZ-PR no ar, que estava fora em
27/09/2026 (análise 6.1). Todas as outras tarefas desta fase andam com as fixtures
de erro já salvas em `docs/analise/spike-sefaz-pr-2026-09-27/` e com um
`NfceParsed` escrito à mão. **Se o portal ainda estiver fora, execute 6.1, 6.2 e
6.4–6.8 e deixe 6.3 para depois.** A confirmação real ponta a ponta fica pendente só
disso.

---

### Tarefa 6.1: Estrutura das Functions

**Arquivos a criar:** `functions/package.json`, `functions/tsconfig.json`,
`functions/vitest.config.ts`, `functions/src/index.ts`, `functions/src/config.ts`

**O que fazer:**
1. `functions/` com Node 22, `firebase-functions@7`, `firebase-admin@14` e
   `cheerio@1`. Dev: `esbuild`, `vitest` e `typescript`.
2. Build por **esbuild em bundle** (resolve `@shared/*` e inclui `shared/` no
   artefato):

   ```json
   "build": "esbuild src/index.ts --bundle --platform=node --target=node22 --format=cjs --outfile=lib/index.js --external:firebase-admin --external:firebase-functions --alias:@shared=../shared",
   "main": "lib/index.js"
   ```

   `tsc --noEmit` roda antes (`predeploy` no `firebase.json`).
3. `config.ts`: `setGlobalOptions({ region: 'southamerica-east1', maxInstances: 5 })`
   (RNF-29) e `initializeApp()` do Admin.
4. `onCall` sempre com `{ enforceAppCheck: true, consumeAppCheckToken: false }`.
5. **Sem emulador** (decisão do usuário): todo acesso ao Firestore Admin fica atrás
   de `functions/src/dados/repositorio.ts`, uma interface pequena (`obter`, `gravar`,
   `transacao`, `consultarPendentesVencidos`…) com duas implementações:
   `repositorio-firestore.ts` (real) e `test/fakes/repositorio-memoria.ts` (fake em
   memória, com transação simulada). As regras de negócio (6.4 a 6.6) recebem o
   repositório por parâmetro e são testadas com o fake. O relógio também entra
   por parâmetro (`agora: () => Date`).

**Critério:** `npm --prefix functions run build` gera `lib/index.js`, e `npm --prefix
functions test` roda (ainda sem testes de negócio).

---

### Tarefa 6.2: Fetch seguro e classificação da resposta

**Arquivos a criar:** `functions/src/importar/allowlist.ts`, `fetch-sefaz.ts`,
`classificar-resposta.ts` (+ specs), `functions/test/fixtures/sefaz-pr/erro-*.html`
(copiadas do spike)

**O que fazer:**
1. `allowlist.ts`: `urlPermitida(url)` só aceita `https?://www.fazenda.pr.gov.br/nfce/qrcode`
   com parâmetro `p` válido por `lerUrlQr` (Fase 3.2). Normaliza para **https** e
   reconstrói a URL a partir das partes validadas. Nunca repassa a string recebida
   (RNF-21).
2. `fetch-sefaz.ts`: `fetch` com `redirect: 'manual'`. Segue até 3 redirects **só se**
   o `Location` passar na allowlist. Timeout de 15s via `AbortSignal.timeout`, 1
   retry com backoff (RNF-04), decodificação correta de charset (o portal mistura
   UTF-8 e Latin-1, então olhar o `Content-Type` e o `<meta>`) e limite de 2 MB no
   corpo.
3. `classificar-resposta.ts`: `(status, html) → 'ok' | { erro: ErroImportacao['codigo'] }`.
   Regras por **conteúdo**, porque o portal responde erro com HTTP 200 (análise 6.1):
   - "Url do QRCode mal formatado" **com chave de DV válido** →
     `sefaz-indisponivel` (vai para a fila);
   - "Problemas na Chave de Consulta" / "206" → `sefaz-indisponivel`;
   - "não consta na base de dados" → `sefaz-indisponivel` nas primeiras 48 h após a
     emissão, `nao-encontrada` depois;
   - HTTP 5xx, timeout, `GenericJDBCException` → `sefaz-indisponivel`;
   - "cancelad" → `cancelada`;
   - página sem a estrutura esperada pelo parser → `layout-inesperado`.

**Critério:** specs cobrem: host fora da allowlist, `http://169.254.169.254`,
redirect para host externo (bloqueado), redirect interno (seguido), cada fixture de
erro real classificada, e timeout.

---

### Tarefa 6.3: ⛔ Parser da NFC-e do PR (spike + implementação)

**Arquivos a criar:** `functions/src/parsers/index.ts`, `functions/src/parsers/pr.ts`
(+ spec), `functions/test/fixtures/sefaz-pr/nota-*.html`

**Pré-condição:** portal SEFAZ-PR respondendo.

**O que fazer:**
1. **Spike:** com as duas URLs reais do usuário e pelo menos mais uma, salvar o
   HTML. **Antes de commitar, apagar CPF/nome do consumidor** com um script
   (`scripts/anonimizar-fixture.mjs`, que troca o conteúdo do bloco do consumidor
   por `***`).
2. Responder por escrito em `docs/analise/spike-sefaz-pr-AAAA-MM-DD.md`:
   - quais seletores trazem emitente, itens, totais, emissão e chave;
   - **o EAN aparece?** Olhar a aba resumida e o "Visualizar em abas";
   - a URL **v3 montada só com a chave** (`montarUrlQrV3`) abre a mesma nota? Isso
     define o RF-06.
3. `parsers/pr.ts`: função pura `parsePr(html: string): NfceParsed` com `cheerio`,
   usando `.text().trim()` (nunca HTML cru, RNF-26), números no formato brasileiro
   (`1.234,56`), quantidade decimal (`0,452 KG`) e data com fuso de Brasília para ISO.
   Se a estrutura mínima não for encontrada, lança `LayoutInesperadoError`.
4. `parsers/index.ts`: `parserPara(uf)` devolve `parsePr` para `'PR'` e
   `uf-nao-suportada` para o resto.
5. Se o EAN **não** vier no HTML: `ean: null` em todos os itens, e o RF-17 cai no
   `loc:{cnpj}:{codigo}`. Registrar a conclusão na análise.

**Critério:** ≥ 3 fixtures reais anonimizadas, cobertura ≥ 80% em `parsers/`, e a
soma dos `vlTotal` bate com o `total` menos o desconto de cada fixture.

---

### Tarefa 6.4: Callable `previewNfce`

**Arquivos a criar:** `functions/src/importar/preview-nfce.ts`,
`functions/src/importar/rate-limit.ts` (+ specs)

**O que fazer:**
- Entrada: `{ url?: string; chave?: string }`. Exige `request.auth`.
- Com `chave`: `validarChave` e `montarUrlQrV3` (se o spike da 6.3 mostrar que v3
  não funciona, responder `{ erro: 'chave-sem-qr' }` e o front pede o QR).
- **Rate limit** (RNF-25): documento `rateLimit/{uid}` com janela de 1 h e máximo
  de 30. Estourou, responde `rate-limit`.
- Se `usuarios/{uid}/notas/{chave}` já existe, responde `ja-importada` com a chave.
- Fetch (6.2), classificação e parse (6.3). O resultado vai para `previews/{uid}_{chave}`
  (só Admin, TTL de 30 min via política de TTL do Firestore em `expiraEm`) e volta
  ao cliente **sem** dados do consumidor.
- Em `sefaz-indisponivel`, **não** enfileira aqui: devolve o erro, e o front
  oferece "Guardar e importar quando a SEFAZ voltar", que chama `enfileirarNfce`
  (6.6).

**Critério:** specs com fetch mockado cobrem: sucesso, `ja-importada`,
`rate-limit` na 31ª chamada, `sefaz-indisponivel` e `layout-inesperado` (este
registra o HTML em Storage/log só em dev, RF-10).

---

### Tarefa 6.5: Callable `confirmarNfce` e publicação de preços

**Arquivos a criar:** `functions/src/importar/confirmar-nfce.ts`,
`functions/src/importar/publicar-precos.ts` (+ specs)

**O que fazer:**
1. Entrada: `{ chave }`. Lê `previews/{uid}_{chave}`, **nunca** dados enviados pelo
   cliente. Se não existir ou tiver expirado, erro `preview-expirado`.
2. Numa **transação**:
   - grava `usuarios/{uid}/notas/{chave}` (modelo 5.3, com `produtoId` por item via
     `produtoIdDe`) e `usuarios/{uid}` (perfil mínimo, se não existir);
   - faz upsert de `estabelecimentos/{cnpj}`;
   - lê `nfceImportadas/{chave}`. **Se não existir**, cria o documento e chama
     `publicarPrecos`. Se existir, só incrementa `qtdUsuarios` (RF-09).
3. `publicarPrecos`: para cada item, faz upsert de `produtos/{produtoId}`
   (`descricao`, `descricaoNorm`, `tokens`, `conteudo`, `unidadeBase`, e atualiza
   `menorPreco` e `ultimaObservacao` se for o caso) e cria `precos/{chave}_{n}` com
   `{ produtoId, cnpj, vlUnit, unidade, precoPorUnidadeBase, emissao }`, **sem uid
   nem referência ao usuário** (RNF-24). Mais de 500 escritas vão em lotes.
4. Apaga o preview.

**Critério:** testes com o repositório em memória: primeira importação cria nota, produtos,
estabelecimento e preços; a mesma chave por outro usuário cria só a nota dele e
`qtdUsuarios: 2`, sem novos `precos`; nenhum documento de `precos` tem `uid`.

---

### Tarefa 6.6: Fila de pendentes (RF-10a)

**Arquivos a criar:** `functions/src/pendentes/enfileirar.ts`,
`functions/src/pendentes/reprocessar-pendentes.ts` (+ specs)

**O que fazer:**
1. Callable `enfileirarNfce({ url | chave })`: valida (allowlist/DV), grava
   `usuarios/{uid}/pendentes/{chave}` com `{ url, status: 'aguardando', tentativas: 0,
   proximaTentativa: agora + 15min, criadaEm }`. É idempotente por chave.
2. `onSchedule('every 15 minutes')` `reprocessarPendentes`: `collectionGroup('pendentes')`
   com `status == 'aguardando'`, `proximaTentativa <= agora` e `limit(20)`, com um
   intervalo de 1s entre fetches para não martelar o portal. Para cada pendente:
   - **ok**: parse, mais a mesma rotina de gravação da 6.5 (extrair a função comum;
     aqui sem preview, porque o usuário já decidiu importar). Marca a nota com
     `veioDaFila: true` e apaga o pendente;
   - **`sefaz-indisponivel`**: `tentativas++`, backoff 15 min → 1 h → 6 h → 24 h
     (depois, 24 h). Passando de **7 dias** desde `criadaEm`, `status: 'falhou'`;
   - **outros erros** (`nao-encontrada`, `cancelada`, `layout-inesperado`): `status:
     'falhou'` com `ultimoErro`.
3. Índice em `firestore.indexes.json` para o `collectionGroup` (`status` +
   `proximaTentativa`).
4. Callable `retentarPendente({ chave })`: volta um `falhou` para `aguardando`, com
   `proximaTentativa: agora` (RF-10a, "tentar de novo manualmente").

**Critério:** teste com relógio controlado: SEFAZ fora (fixture) → backoff aplicado
nas tentativas; SEFAZ volta (fixture de nota) → nota criada, pendente apagado,
preços publicados; 7 dias sem sucesso → `falhou`.

---

### Tarefa 6.7: App Check

**Arquivos a modificar:** `src/app/core/firebase/firebase.providers.ts`,
`src/environments/*.ts`

**O que fazer:** `initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(siteKey),
isTokenAutoRefreshEnabled: true })`, com a site key do `environment` (uma por
projeto). No **`localhost`** (que bate no dv), usar o **debug token**:
`self.FIREBASE_APPCHECK_DEBUG_TOKEN = true` só quando `location.hostname ===
'localhost'`. O token aparece no console do navegador, e o usuário o registra no dv em
App Check → Apps → Gerenciar tokens de depuração.

Chaves de site (públicas, vão no `environment`), criadas e registradas no App Check
em 27/09/2026:

| Ambiente | Projeto | Chave reCAPTCHA Enterprise |
|---|---|---|
| dev (`environment.ts`) | `fed-catalogo-compara-precos-dv` | `6Ldt-NEtAAAAAExrwyqrZy1HiNJK7lYq2hrE3z5y` |
| prod (`environment.prod.ts`) | `fed-catalogo-compara-precos` | `6Ldp-NEtAAAAANNm0_eoxIcpKcN9Yb3HZraY6fxh` |

**Critério:** no dv publicado e em produção, uma callable sem token do App Check é
rejeitada (teste manual documentado na execução). No `localhost`, tudo funciona com o
debug token registrado.

---

### Tarefa 6.8: Log estruturado

**Arquivo a criar:** `functions/src/importar/log.ts`

**O que fazer:** `logImportacao({ etapa, uf, duracaoMs, qtdItens?, resultado, erro? })`
com `logger.info/warn` do `firebase-functions`. **Sem** chave completa (só os 6
primeiros dígitos, UF + AAMM), sem uid e sem CNPJ do consumidor (RNF-30). Chamar em
preview, confirmação e reprocessamento.

**Critério:** um teste captura as chamadas do `logger` (mock) numa importação completa:
uma linha por etapa, sem chave completa, uid ou CNPJ do consumidor.

---

## Critérios de Aceitação da Fase

- [ ] URL fora da allowlist, IP interno e redirect externo são rejeitados (specs).
- [ ] Cada página de erro real do spike é classificada corretamente.
- [ ] ⛔ Parser do PR com ≥ 3 fixtures reais anonimizadas e cobertura ≥ 80% (depende da SEFAZ).
- [ ] Preview, confirmação, dedup por usuário e dedup de preços cobertos por testes com o repositório em memória.
- [ ] (Usuário, após Blaze no dv + `npm run deploy:functions:dev`) Importação ponta a ponta funcionando no dv.
- [ ] Nenhum `precos/*` com `uid`; nenhum CPF em nenhum documento.
- [ ] Fila: backoff, importação automática quando a SEFAZ volta, `falhou` após 7 dias, retentativa manual.
- [ ] Rate limit de 30/h por usuário.
- [ ] App Check exigido em produção.
- [ ] `CLAUDE.md` com a seção **Functions** (build por esbuild, repositório + fake, callables, a fila e o deploy no dv).
