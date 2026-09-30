# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Servidor de desenvolvimento (localhost:4200) — aponta para o Firebase dv (sem emulador)
npm start

# Testes unitários (Vitest via @angular/build:unit-test)
npm test
npm run test:ci            # uma execução, com cobertura

# Um arquivo só
ng test --include='**/chave-acesso.spec.ts'

# Lint (angular-eslint + stylelint)
npm run lint

# End-to-end (Playwright; sobe o npm start sozinho)
npm run e2e

# Build de produção (environment.prod.ts → projeto fed-catalogo-compara-precos)
ng build --configuration=production
# Build otimizado apontando para o dv (usado pelo deploy de develop)
ng build --configuration=dv

# Contraste AA dos tokens
npm run contraste

# Functions (ver seção Functions)
npm --prefix functions test

# Lighthouse mobile sobre o build servido com gzip (como no Hosting)
npx http-server dist/fed-catalogo-compara-precos/browser -p 8090 -s -g --proxy "http://localhost:8090?"
npx lighthouse http://localhost:8090/login --form-factor=mobile --chrome-flags="--headless=new"
```

Scripts auxiliares (rodar uma vez, resultado versionado): `scripts/gerar-municipios-pr.mjs`
(IBGE), `scripts/gerar-imagens-codigo.mjs` (QR/EAN de teste), `scripts/gerar-icones.mjs`
(ícones da PWA, favicon e `public/logo/logo.png`/`simbolo.png`, recortados da arte
`public/logo/logos.png`), `scripts/anonimizar-fixture.mjs` (HTML de NFC-e antes de virar fixture).

**Node:** o Angular 22.2 exige Node ≥ 22.22.3. O pacote `node` está em
`devDependencies` como runtime local: os scripts `npm run …` usam esse Node
(`node_modules/.bin` entra no PATH). Rodar `ng`/`npx` fora de `npm run` usa o Node
do sistema. Quando o Node do sistema for atualizado, o pacote `node` pode sair.

**Deploy (rodado pelo usuário, nunca pelo agente):** `npm run deploy:rules:dev` e
`npm run deploy:functions:dev`; o CI publica pelo `deploy.yml`. Uma vez por projeto,
`npm run artifacts:limpeza:dev|prod` (política de 1 dia nas imagens das Functions no
Artifact Registry `gcf-artifacts`). **Não há Firebase Emulator
Suite**: o `npm start` usa o projeto `fed-catalogo-compara-precos-dv`.

## Architecture Overview

App **Angular 22.2** standalone, **zoneless** e **OnPush**, que importa a NFC-e de
supermercado do Paraná pelo QR Code do cupom e compara preços entre mercados.

- `src/app/features/` — telas, todas em rotas lazy (`loadComponent`/`loadChildren`).
- `src/app/core/` — infraestrutura do app (Firebase, auth, layout).
- `src/app/shared/` — UI de apresentação, pipes e estilos (`style/`).
- `shared/` (raiz) — **TypeScript puro** de domínio (chave de acesso, GTIN,
  normalização, similaridade, geohash, modelos), sem Angular, Firebase ou npm.
  Alias `@shared/*`. Usado pelo front e pelas Functions (bundle com esbuild).
- `functions/` — Cloud Functions v2 (importação, fila, vínculo de produtos).
- `e2e/` — Playwright (`chromium` e `mobile`), com SEFAZ, Menor Preço e Functions
  interceptados (`e2e/support/mocks.ts`) e axe (`e2e/a11y.spec.ts`).
- `docs/qualidade/` — checklists manuais do dv (regras, Functions/App Check, roteiro).

**Rotas:** `/login`, `/cadastro`, `/redefinir-senha` (fora do shell); dentro do shell
com `authGuard`: `/` (painel), `/importar`, `/importar/preview`, `/notas`,
`/notas/:chave`, `/sugestoes`, `/listas`, `/listas/:id`, `/listas/:id/conferir`, `/regiao`,
`/produtos`, `/produtos/:id`, `/estabelecimentos`, `/estabelecimentos/:cnpj`; `**` → página de erro.

## PWA e CI

- `@angular/pwa`: `ngsw-config.json` faz prefetch só do app shell; ícones, JSON e o
  `.wasm` do scanner são `lazy`; fontes do Google em cache lazy. **Menor Preço e
  Functions nunca são cacheados** (não há `dataGroups`). Manifest pt-BR com
  `theme_color` branco (`$cp-surface`, como o header) e `background_color` = `$cp-bg`. O Hosting manda
  `no-cache` para `index.html`, `ngsw-worker.js` e `ngsw.json`.
- A lista de ícones do Material Symbols é um **subset** (`icon_names=` no `index.html`,
  em ordem alfabética): ao usar um ícone novo, acrescente o nome lá, senão aparece o
  texto da ligadura.
- `.github/workflows/ci.yml`: lint, contraste, `test:ci`, Functions (typecheck, testes,
  build) e build de produção; e2e com os secrets `E2E_EMAIL`/`E2E_SENHA` (sem eles os
  testes logados são pulados). `deploy.yml`: depois do CI verde, `firebase deploy` de
  Hosting, Functions, regras e índices — push em `develop` → dv (build `dv`), em `main` →
  produção (build `production`) — com a conta `github-action-1390935729` dos secrets
  `FIREBASE_SERVICE_ACCOUNT_FED_CATALOGO_COMPARA_PRECOS(_DV)` (criados no molde do
  `firebase init hosting:github`, com papéis extras para Functions; ver o cabeçalho do
  workflow).

Os specs de `shared/` rodam junto com o `npm test` (`include: ../shared/**/*.spec.ts`
no target `test`, relativo a `src/`).

## Convenções Obrigatórias

**Angular 22**
- Standalone em tudo, sem NgModules. **Zoneless** e **OnPush** são o padrão do v22
  e não devem ser desligados. Declarar `changeDetection: OnPush` explicitamente.
- `inject()`, nunca injeção por construtor.
- `input()`, `output()`, `model()`, `viewChild()`, sem decorators `@Input`/`@Output`.
- Control flow `@if`/`@for`/`@switch`/`@defer`, sempre com `track` em todo `@for`.
- Estado em **signals** (`signal`, `computed`, `linkedSignal`) e leitura assíncrona
  com `resource`/`rxResource`. Stores por feature em services `providedIn: 'root'`
  que expõem apenas `Signal` readonly (`asReadonly()`).
- Observable só quando a fonte for stream (Firestore `onSnapshot`, `HttpClient`).
  Na borda, converter com `toSignal()`. Toda subscription manual leva
  `takeUntilDestroyed()`.
- Formulários com **Signal Forms** (`@angular/forms/signals`).
- Rotas com `loadComponent`/`loadChildren` e guards funcionais (`CanActivateFn`).
- `provideHttpClient(withFetch())`, sem `HttpClientModule`.
- Imagens com `NgOptimizedImage` e `loading="lazy"` fora da dobra.
- Sem comentários, a não ser para invariantes não óbvias. Textos da UI em pt-BR, no
  template. `LOCALE_ID` `pt-BR` e moeda padrão `BRL`.

**Firebase**
- **Não usar `@angular/fire`** (não suporta o v22). SDK modular injetado por
  `InjectionToken` (`FIREBASE_AUTH`, `FIRESTORE`, `FUNCTIONS`).
- O cliente **nunca escreve** em coleções compartilhadas nem em `usuarios/{uid}/notas`.
  Toda escrita de nota ou preço passa por callable. A **única** escrita do cliente é em
  `usuarios/{uid}/listas/**` (lista de compras, validada nas regras).

**Estilo**
- **Classe global primeiro** (`src/styles.scss`, `.cp-*`). Mixin só para o que é
  parametrizado. No SCSS do componente fica só o que é daquela tela.
- Cor só por token `$cp-*` de `_tokens.scss`. O stylelint bloqueia hex e cor nomeada
  fora dele.
- Medir budget **no build**, nunca pelo tamanho do arquivo-fonte.
- Breakpoint em TS via `BreakpointService` (`matchMedia`), nunca `window.innerWidth`.

**Testes**
- Vitest no front e nas Functions. Fixtures reais em `functions/test/fixtures/` e
  `src/testing/fixtures/`. Nunca bater em SEFAZ, Menor Preço ou Claude API de verdade num teste.
- **Sem Firebase Emulator Suite.** Testes unitários mockam o SDK; as Functions
  acessam o Firestore por um repositório com fake em memória. O e2e roda contra o dv
  com usuário de teste e Functions/SEFAZ/Menor Preço interceptados. Regras e
  integração real são verificadas no dv por checklists manuais (`docs/qualidade/`).
- e2e com seletores por papel e label (`getByRole`, `getByLabel`), nunca por classe.

## Fontes de dados

- **SEFAZ-PR (página pública do QR Code da NFC-e)** — acessada **só pelas
  Functions** (allowlist de host, anti-SSRF). O portal responde erro com HTTP 200,
  então a resposta é classificada pelo conteúdo.
- **Menor Preço (Nota Paraná)** — API REST pública com CORS aberto, chamada **direto
  do navegador** com cache de 30 min e debounce, **só para a tela `/regiao` e o "Tem mais
  barato perto?"**. Não é usado no vínculo de produtos: para os IPs das Functions (Google
  Cloud) e sob volume a API devolve dados sintéticos (a tela `/regiao` detecta e mostra
  como indisponível, motivo `bloqueado`).
- **Claude API (Anthropic)** — só nas Functions, no vínculo automático, com o secret
  `ANTHROPIC_API_KEY` (Secret Manager, em `confirmarNfce` e `reprocessarPendentes`). Recebe
  só descrições de produto.
- **BrasilAPI → minhareceita.org (cadastro da Receita)** — só nas Functions, só pelo CNPJ
  do emitente, para o nome fantasia. Do payload só sai `nome_fantasia` (o QSA é descartado).

Detalhes: [docs/analise/compara-precos-nfce-analise.md](docs/analise/compara-precos-nfce-analise.md).

## Não fazer

- `@angular/fire`.
- Escrita do cliente em `produtos`, `precos`, `estabelecimentos` ou nas notas.
- `window.innerWidth` para breakpoint.
- Cor hex/nomeada fora de `_tokens.scss`.
- OCR do cupom impresso (a única fonte dos itens é a página da SEFAZ).
- Firebase Emulator Suite, `firebase deploy` ou `git push` pelo agente.

## Firebase & data access

- **Ambientes:** `npm start` → `src/environments/environment.ts` → projeto
  **`fed-catalogo-compara-precos-dv`**; `ng build -c production` troca pelo
  `environment.prod.ts` (`fileReplacements`) → **`fed-catalogo-compara-precos`**.
  `.firebaserc`: `default`/`dev` = dv, `prod` = produção (deploy sem `-P` vai para o dv).
  Sem `measurementId`/Analytics. Sem bloco `emulators` no `firebase.json`.
- **SDK modular por `InjectionToken`**, sem `@angular/fire`:
  - `provideFirebase()` (`core/firebase/firebase.providers.ts`) registra `FIREBASE_APP`
    e `FIREBASE_AUTH` — os únicos no bundle inicial (os guards precisam da sessão).
  - `FIRESTORE` (`firestore.token.ts`, cache persistente multi-aba) e `FUNCTIONS`
    (`functions.token.ts`, `southamerica-east1`) são tokens `providedIn: 'root'` em
    arquivos próprios. **Importe-os direto desses arquivos** (não reexporte em
    `firebase.providers.ts`), senão o SDK do Firestore volta para o `main` e estoura
    o budget de 500 kB.
- **Auth:** `AuthStore` (`core/auth/auth.store.ts`) com `usuario` (`undefined` =
  resolvendo), `pronto`, `logado`, `uid` e os métodos `entrar`, `entrarComGoogle`
  (popup; cai para redirect se o popup for bloqueado), `cadastrar`, `sair`,
  `redefinirSenha`. As funções do SDK chegam pelo token `AUTH_API` (`auth-api.ts`),
  que os testes trocam por fakes. **Não use `vi.mock` de módulos do Firebase:** o
  builder empacota o SDK num chunk compartilhado e o mock vaza/falha quando todos os
  specs rodam juntos.
- **Guards** `authGuard`/`guestGuard` esperam `pronto()` antes de decidir (refresh
  não pisca o login). O `authGuard` manda para `/login?voltar=<url>`.
- **Regras:** `firestore.rules` (dono lê/exclui as próprias notas e pendentes; dono só lê
  os apelidos em `usuarios/{uid}/estabelecimentos`; base compartilhada só leitura; o cliente só
  grava `usuarios/{uid}/listas/**`, com `keys().hasOnly` e tipos/tamanhos de cada campo). Sem teste automatizado:
  checklist do Rules Playground em `docs/qualidade/regras-firestore-checklist.md`,
  rodado pelo usuário após `npm run deploy:rules:dev`.
- **e2e:** usuário de teste em `.env.e2e` (`E2E_EMAIL`, `E2E_SENHA`; ver
  `.env.e2e.example`). Sem o arquivo, os testes com login são pulados.

## Shell

`core/layout/shell.ts` é o layout das rotas autenticadas (rota `''` com `authGuard`,
carregada por `loadComponent`). Login, cadastro, redefinição de senha e a página de
erro (`**`) ficam fora dele.

- Casca **clara** (tokens `$cp-nav-*`), porque o texto da logo é verde escuro: menu com a
  logo completa (`logo/logo.png`) e, no rail, só o símbolo (`logo/simbolo.png`); o header
  mostra a logo quando o menu não a mostra (tela estreita ou rail).
- `<aside>` irmão do conteúdo: **rail de 76px** ↔ **264px** no desktop (`expandido`)
  e **drawer de 272px sobreposto abaixo de 900px** (`drawerAberto`), com scrim. O
  drawer fecha ao navegar (`NavigationEnd` + `takeUntilDestroyed`), com `Esc` (o
  foco volta ao botão de menu) e no scrim. Fechado em tela estreita, o `<aside>` fica
  `inert`.
- Header sticky (fora da área de rolagem) e **scroll interno em `.cp-content`**.
- `BreakpointService.estreito` (`matchMedia('(max-width: 900px)')`) decide o modo.
- No celular, **FAB "Importar nota"** fixo (some em `/importar`, `/sugestoes`, `/listas/:id` e
  na conferência, que têm ação fixa no rodapé; fica em `/listas`).
- Itens: Painel, Importar nota, Minhas notas, Sugestão de compra, Lista de compras, Preços perto
  de mim, Produtos, Estabelecimentos (`ITENS_NAV`) e Sair.
- Telas ainda não implementadas usam `features/em-breve` (título pela `data.secao`
  da rota).

## Functions

```bash
npm --prefix functions run build      # esbuild em bundle → functions/lib/index.js (resolve @shared)
npm --prefix functions run typecheck  # tsc --noEmit (roda no predeploy)
npm --prefix functions test           # Vitest (Node), repositório em memória
npm --prefix functions run test:cov
```

Instale as dependências **de dentro da pasta** (`cd functions && npm install`): o
`npm install --prefix functions` sem pacote adiciona o projeto raiz como dependência.

- Node 22, `firebase-functions` 7, `firebase-admin` 14, `cheerio`, `@anthropic-ai/sdk` e
  `zod` (vínculo por IA). Secret `ANTHROPIC_API_KEY` (`defineSecret` em `src/config.ts`),
  criado em cada projeto com `npx firebase functions:secrets:set ANTHROPIC_API_KEY -P dev|prod`
  antes do deploy. Região
  `southamerica-east1`, `maxInstances: 5` (`src/config.ts`). Callables com
  `enforceAppCheck: true`.
- **Callables:** `previewNfce({url}|{chave})`, `confirmarNfce({chave, apelido?})`,
  `enfileirarNfce({url}|{chave})`, `retentarPendente({chave})`, `vincularProduto`,
  `desvincularProduto` e `definirApelido({cnpj, apelido})` (`confirmarNfce` com `timeoutSeconds: 120`, por
  causa da IA). **Agendada:** `reprocessarPendentes` (a cada 15 min, até 20 por execução,
  1 s entre fetches, timeout 540 s). Callables respondem `{ ok: true, … }` ou
  `{ ok: false, erro: ErroImportacao }`; só erro inesperado vira exceção.
- **Regras de negócio** recebem um `Contexto` (`importar/contexto.ts`): repositório,
  relógio (`agora`), `buscar`, adaptador por UF, `log`, `esperar` e `classificarVinculos`
  (IA; fake nos testes, nenhum teste chama a API). Todo acesso ao
  Firestore passa por `dados/repositorio.ts`; `repositorio-firestore.ts` é o real e
  `test/fakes/repositorio-memoria.ts` o fake (transação com commit no fim). **Sem
  emulador.**
- **Segurança:** `allowlist.ts` reconstrói a URL a partir das partes validadas (HTTPS);
  `fetch-sefaz.ts` usa `redirect: 'manual'` (até 3, só para hosts SEFA-PR), timeout
  15 s, 1 retry, 2 MB e decodificação UTF-8/Latin-1.
- **Classificação** (`classificar-resposta.ts`): o portal responde erro com HTTP 200, então
  é pelo conteúdo — "mal formatado" com DV válido, "206", JDBC e 5xx →
  `sefaz-indisponivel` (vai para a fila); "não consta" até 48 h após o mês da chave →
  indisponível, depois `nao-encontrada`.
- **Parser do PR (`parsers/pr.ts`)**: layout SVRS conferido com cupom real (fixture
  `nota-real-pr-2026-09.html`; descrição em `.txtTit2`, **sem EAN** na página). A URL v3
  só com a chave abre a nota. Fixtures reais passam antes por
  `node scripts/anonimizar-fixture.mjs`.
- **Gravação** (`gravar-nota.ts`, comum à confirmação e à fila): transação com nota,
  perfil, estabelecimento e `nfceImportadas/{chave}`; preços publicados só na 1ª
  importação da chave, em lotes ≤ 500 (`publicar-precos.ts`), **sem uid**.
- **Nome fantasia** (plano `docs/plano/nome-fantasia-estabelecimento-plano.md`): a SEFAZ só
  traz a razão social. `completarEmitente` (`functions/src/cnpj/`), no fim de
  `obterNotaDaSefaz` (prévia e fila; a confirmação reaproveita a prévia), consulta
  `consultarCnpj` do `Contexto` (`consultar-cnpj.ts`: BrasilAPI → minhareceita, CNPJ validado
  com DV, hosts fixos, `redirect: 'error'`, 3 s por fonte / 5 s no total, 256 kB, zod; 404 é
  definitivo). Cache em `estabelecimentos/{cnpj}.fantasiaConsultadaEm` por 180 dias; regra pura
  em `shared/nome-fantasia.ts` (`limparFantasia`, `precisaConsultar`, `avaliarEstabelecimento`).
  Falha nunca derruba a importação (log `etapa: 'cnpj'`, só contagens). Reimportação: no ramo
  `ja-importada` da prévia, `atualizarNaReimportacao` completa o estabelecimento incompleto
  (relê a SEFAZ ou só o CNPJ) e o nome nas notas **do uid**, e a resposta ganha
  `estabelecimentoAtualizado: true` (o front mostra o aviso e invalida o histórico).
  Retroativo manual: `functions/scripts/preencher-fantasia.ts` (`--simular` padrão, `--gravar`).
- **Apelido do estabelecimento** (plano `docs/plano/apelido-estabelecimento-plano.md`): nome
  próprio que o usuário dá a uma loja, só dele, em `usuarios/{uid}/estabelecimentos/{cnpj}`
  (`{ cnpj, apelido, atualizadoEm }`, gravado só pelas Functions; `estabelecimentos/{cnpj}` não
  muda). Regra pura em `shared/apelido.ts`: `limparApelido` (2 a 60 caracteres, com letra, sem
  controle; igual ao nome oficial = sem apelido), `nomeExibido` (apelido → fantasia → razão
  social) e `sugerirApelido` (razão social sem LTDA/ME/EIRELI… em "Primeira Maiúscula").
  A prévia devolve o `apelido` existente; `confirmarNfce({ chave, apelido })` valida
  (`apelido-invalido` antes de gravar) e `gravarNota` lê/grava o apelido na transação — toda
  nota nova (confirmação ou fila) nasce com `nomeExibido`. Apelido novo é propagado para as
  outras notas **do uid** daquela loja (`operacoesDeNome`, `functions/src/estabelecimentos/`),
  e uma falha aí só loga (`apelidoPropagacaoFalhou`). `apelido: null` na confirmação não apaga
  apelido; apagar é pelo `definirApelido` (`null` → volta para fantasia ou razão social, log
  `etapa: 'apelido'` só com contagens). A reimportação e o `preencher-fantasia.ts` respeitam
  o apelido. O apelido nunca vai para o log.
- **Fila:** backoff 15 min → 1 h → 6 h → 24 h; `falhou` após 7 dias (ou erro definitivo);
  `retentarPendente` reabre a janela (`retentadaEm`).
- Log (`importar/log.ts`): só `chavePrefixo` (UF + AAMM).
- **App Check no front:** ativado pela factory do token `FUNCTIONS`
  (`core/firebase/app-check.ts`), com debug token no `localhost`. Checklist do dv em
  `docs/qualidade/functions-dv-checklist.md`.

## Importação (front)

- `features/importar/`: `ImportarService` (único que conhece as callables, via token
  `CHAMAR_FUNCTION` de `core/firebase/callable.ts`; converte `FunctionsError` em
  `ErroImportacao`), `ImportarStore` (root; estado em união `ocioso | buscando |
  preview | confirmando | guardando | guardada | erro`, a prévia sobrevive à navegação),
  `mensagens.ts` (texto e ação por código — RF-10 — e `interpretarEntrada`, a validação
  local: **DV inválido nunca chama a function**).
- `/importar`: ação principal "Ler QR Code do cupom" (`<cp-scanner>` em `@defer`),
  alternativas "Colar link do QR" e "Digitar a chave" (máscara 4 em 4), aviso sem
  conexão (`ConexaoService`) e o bloco de pendentes. `/importar/preview` tem
  `previewGuard` (sem prévia volta para Importar); `preview-expirado` refaz a prévia uma
  vez sozinho.
- Lista em contexto (`/importar?lista=<id>`, RF-09 da lista de compras): `ImportarStore.lista`
  (`definirLista`; `reiniciar()` não limpa). Confirmar → `/listas/:id/conferir?chave=`;
  `ja-importada` oferece "Conferir com a lista"; guardar na fila → `ListasService.aguardarNota`.
- Pendentes: `features/notas/data-access/pendentes.service.ts` (`onSnapshot` →
  `toSignal`, snackbar quando um pendente some e a nota `veioDaFila` aparece),
  `<cp-pendentes-bloco>` e `<cp-pendente-row>` (usados em Importar, Minhas notas e
  painel).
- Firestore pelo token `FIRESTORE_API` (`core/firebase/firestore-api.ts`): as funções do
  SDK chegam injetadas e os testes usam fakes.
- e2e: `mockCallables(page, respostas)` em `e2e/support/mocks.ts` intercepta
  `**/*.cloudfunctions.net/**` no protocolo das callables e o App Check.

## Minhas notas

- `NotasService` (`features/notas/data-access/`): `listar({cnpj, de, ate, cursor})` com
  `where`/`orderBy('emissao','desc')`/`limit(20)`/`startAfter` (índice composto `cnpj +
  emissao desc` em `firestore.indexes.json`), `obter(chave)` em tempo real, `excluir`
  (os preços publicados continuam) e `estabelecimentos()` para o filtro.
- Lista (`/notas`): filtros de estabelecimento e período (`mes`, `mes-passado`,
  `3-meses`, `personalizado` com `<input type="date">`) em query params; "Carregar mais"
  por cursor; marca "Nova" para nota da fila ainda não aberta — guardada no
  `localStorage` (`NotasAbertasService`), porque o cliente não grava nas notas.
- Detalhe (`/notas/:chave`): link para estabelecimento e produto, copiar chave,
  exclusão com `<cp-confirm-dialog>` (`shared/ui/confirm-dialog`).
- "Comparado com a última vez" (histórico pessoal): `HistoricoPessoalStore`
  (`data-access/historico-pessoal.store.ts`) lê as notas dos últimos 12 meses (até 20 páginas =
  400 notas) uma vez por sessão e por `uid`, resolve os grupos de vínculo (`produtosPorIds` +
  `membrosDosGrupos`) e cacheia; `invalidar()` após excluir nota e após `confirmarNfce`. Regra
  pura em `detalhe/historico-pessoal.ts`: cada item compara com a **última compra anterior** do
  mesmo produto/grupo (a própria nota e compras posteriores não contam); base `vlUnit` (mesma
  unidade comercial e mesmo conteúdo) → R$/unidade base (impacto × `quantidadeNaUnidadeBase`)
  → "sem comparação". Resumo, destaques (`@defer on viewport`) e filtro em `?itens=`.
- "Tem mais barato perto?" (`detalhe/mais-barato-perto.ts`): sob demanda, item a item
  com `concatMap` (1 requisição em voo, cache do client), menor oferta **coerente**
  (`separarDivergentes`) e economia potencial = Σ diferença × qtd. Item sem EAN usa a
  busca por texto (`equivalentesPorTexto`: Jaccard ≥ 0,3 + mesmo conteúdo) marcada como
  "aproximado". Menor Preço fora → para e mostra aviso único.

## Sugestão de compra

Tela `/sugestoes` (plano `docs/plano/sugestao-compra-plano.md`): o que o usuário costuma
recomprar, **só com os preços das notas dele** (sem `precos` comunitário nem Menor Preço, D-05).
Tudo no cliente, nada gravado no Firestore.

- Regra pura em `features/sugestoes/sugestao.ts` (constantes `MIN_OCASIOES`, `JUNTAR_DIAS`,
  `CICLO_MIN_DIAS`/`CICLO_MAX_DIAS`, `EM_BREVE_A_PARTIR`, `PAROU_ACIMA`, `CV_INSTAVEL`,
  `DIAS_HORIZONTE`): ocasiões (< 2 dias juntam), ciclo = mediana dos intervalos, estado
  `repor`/`em-breve`/`parou` pelo atraso e pelo horizonte, confiança, quantidade (mediana, em
  kg/L só a granel; comprado por UN/CX/PCT fica na unidade comercial), faixa último/mais barato/mais caro (`baseComum` de `historico-pessoal.ts`),
  totais, agrupamento por mercado mais barato (último preço em cada `cnpj`) e cestas "um mercado
  só". `hoje` sempre por parâmetro; 100 % de cobertura com a fixture
  `src/testing/fixtures/sugestao/`.
- Dados: `HistoricoPessoalStore.indiceCompleto()` (mesmo cache de notas da sessão; resolve grupo
  só de `loc:` e de produto em ≥ 2 notas). `versao` muda no `invalidar()` e recarrega o
  `SugestoesStore` (root: `resource` + `computed`, seleção em `linkedSignal` que reinicia ao
  trocar o horizonte).
- Data de referência pelo token `RELOGIO` (`core/relogio.ts`), que os testes fixam.
- "Já tenho"/"Não sugerir mais": `DispensadosService`, `localStorage`
  `cp-sugestao-dispensados:<uid>`; `AuthStore.sair()` apaga essas chaves
  (`limparDispensados`).
- Confiança baixa (2 ocasiões ou intervalos irregulares) aparece nas seções normais, marcada
  "estimativa com N compras": com pouco histórico é tudo o que há. Período sem nada mostra
  "Ver o próximo mês (N itens)" (`SugestoesStore.noProximoMes`).
- Query params `horizonte` (`hoje|semana|quinzena|mes`) e `visao` (`lista|mercado`), padrão fora da
  URL. "Copiar lista"/"Compartilhar" (`navigator.share`) com `textoDaLista`.
- Painel: `<cp-hora-de-repor>` (até 5 vencidos) em `@defer (on viewport)`.
- "Criar lista com N itens" (`itensDaSugestao` → `ListasStore.criar`) e "Adicionar à lista";
  `SugestoesStore.naLista` (grupos em listas, lido só quando a tela chama `recarregarNaLista()`)
  marca "Na lista" e tira o item da pré-seleção.

## Lista de compras

Plano `docs/plano/lista-compras-plano.md` (análise `docs/analise/lista-compras-analise.md`).
Até 5 listas (`MAX_LISTAS`), 150 itens (`MAX_ITENS`) e 3 notas por lista, limites do cliente.

- **Dados:** `usuarios/{uid}/listas/{id}` (`ListaCompras`: nome, status `aberta|aguardando-nota`,
  contadores, `ultimaCompraEm`, `notas`, `pendentes`) e `…/itens/{itemId}` (`ItemLista`: texto,
  `grupo` canônico, quantidade/unidade/base, origem, ordem, marcação e `vinculo` — retrato do
  item da nota, que sobrevive à exclusão da nota). **Gravados direto pelo cliente** (única
  exceção à regra de escrita), com o cache persistente: funciona offline.
- **Escrita otimista:** `ListasService` devolve a promessa do `commit()` e a UI **não aguarda**
  (offline ela só resolve quando a conexão volta); o `onSnapshot` local já mostra a mudança e só
  o `catch` avisa (regra recusou). Contadores do cabeçalho no mesmo `writeBatch` do item, com
  valor **absoluto** (`contadores(itens)`), não `increment`: a regra recusa
  `qtdMarcados > qtdItens`, e um contador divergente travaria a lista.
- Regra pura em `features/listas/lista.ts` (100 % de cobertura, fixture da nota real em
  `src/testing/fixtures/lista/`): `planejarAdicao`/`mesclarItem` (mesmo grupo ou texto
  normalizado soma), `autocompletar` (prefixo das palavras sobre o índice do histórico),
  `precoDeReferencia`/`estimativa` (última compra, `precoNaQuantidade`), `conciliar`,
  ajustes (`confirmarPar`, `desfazerPar`, `ligarManual`, `alternarAdicionado`),
  `resumoDaConferencia` e `planoDeFinalizacao`.
- **Conciliação** (`conciliar`, D-04): só itens sem `vinculo`; 1) pelo grupo (`chaveDoGrupo`, o de
  maior valor); 2) por texto (Jaccard de `tokensSemMedida`, conteúdo compatível, melhor par
  primeiro): liga com score ≥ `LIGA_POR_TEXTO` (1/3) e um candidato só; de `PERGUNTA_POR_TEXTO`
  (0,2) para cima ou ambíguo vai para "Confirme". Salvar grava vínculo, marca o item e o `grupo`
  aprendido nos digitados (a próxima compra liga por grupo).
- **Finalização** (RF-13): excluir, guardar para usar de novo (desmarca, limpa vínculos, grava
  `ultimaCompraEm`), manter só o que faltou, ou ler outra nota (até 3).
- Stores: `ListasStore` (root; listas em tempo real, `criar` devolve o id na hora,
  `adicionarEmLista` cria/adiciona/pergunta com `escolher-lista-dialog`), `ListaStore` (provido
  na página; histórico só sob demanda) e `ConferenciaStore` (provido na conferência; ajustes em
  `linkedSignal` que só recomeça quando muda a nota ou o conjunto de itens livres).
  `HistoricoPessoalStore.gruposDaNota(nota)` resolve os grupos da nota.
- Tela acesa: `manterTelaAcesa(signal)` (`data-access/tela-acesa.ts`, token `WAKE_LOCK`) enquanto
  há pendentes e a aba está visível.
- Integrações: "Adicionar à lista" no produto (canônico), "Conferir com uma lista" no detalhe da
  nota, card `<cp-lista-em-andamento>` no painel (`@defer`).
- Testes: `src/testing/firestore-falso.ts` (Firestore em memória no protocolo do
  `FIRESTORE_API`, com commit `ok|erro|pendente` para simular offline) e `src/testing/listas.ts`
  (providers da feature). e2e `e2e/listas.spec.ts` grava no dv e apaga as listas que criou
  (precisa das regras publicadas).

## Produtos, estabelecimentos e painel

- `ProdutosService` (`features/produtos/data-access/`): `buscar` (GTIN válido → `getDoc`
  em `produtos/ean:<gtin>`; texto → `array-contains` no token mais específico +
  filtro dos demais no cliente), `equivalentes` (canônico + quem aponta para ele),
  `precos(ids)` (grupos de 30 no `in`, 90 dias, ≤ 300), `produtosPorIds`,
  `estabelecimentosPorCnpj`, `vincular`/`desvincular` (callables).
- Página do produto: resumo por `resumirPrecos` (`detalhe/resumo.ts`) — menor/médio/maior
  sobre o **último preço de cada estabelecimento**, em R$/unidade base quando todas as
  observações a têm; fonte `minhas-notas` quando o preço veio de uma nota do usuário
  (o id do preço é `{chave}_{n}`). `<cp-grafico-historico>` (SVG próprio, até 5 séries
  + "Outros", traço e marcador diferentes por série, tabela `cp-sr-only`) e
  `<cp-precos-perto>` em `@defer (on viewport)`. Cores das séries: `$cp-serie-1..5`.
- Vínculo (RF-18): callable `vincularProduto` (`functions/src/produtos/`) — o EAN vira o
  canônico, `ean:` × `ean:` diferente é recusado, cadeia seguida até a raiz sem ciclo,
  quem apontava para a origem é reapontado, rate limit da importação. Diálogo
  `vincular-dialog.ts` sugere por Jaccard com o mesmo conteúdo e, antes, os
  `sugestoesEan` do produto; destino `ean:` inexistente só é aceito se estiver nelas (o
  `ean:` é criado por `garantirProdutoEan`). Desvincular grava `vinculoBloqueado`.
- **Vínculo automático** (plano `docs/plano/vinculo-etiquetas-ia-plano.md`), síncrono na
  gravação (`gravarNota`, só na 1ª importação da chave): `publicarPrecos` grava em todo
  produto as `etiquetas` (`shared/etiquetas.ts`: `tipo`, `marca`, `tamanho`, `variantes`,
  com abreviações e sinônimos da NFC-e) e o `bloco` (`marca|tamanho`, ou `null`; o tipo fica
  fora porque há mercado que cadastra "COCA COLA 2L ZERO" sem "REFR"), e
  devolve os ids novos. `vincularNota` (`functions/src/vinculo/`) busca, para cada `loc:`
  novo, as raízes do mesmo bloco vistas em outro mercado (`bloco ==` + `vinculadoA ==
  null`) e decide com `decidirPorEtiquetas`: tipos diferentes dos dois lados → conflito;
  mesma variante com um só candidato → liga
  (`vinculoMotivo: 'etiquetas'`); conflito claro → nada; o resto (inclusive sem variante
  nenhuma: a mesma loja vende produtos diferentes com a mesma descrição) vai para **uma**
  chamada à IA por nota (`vinculo/ia.ts`: `claude-opus-5-5`, effort `low`, saída
  estruturada, fallback do servidor em recusa, ids curtos `c1..c5`, até 5 candidatos por
  item, 2 chamadas acima de 40 dúvidas). Resposta: id → vínculo `ia`; `A` →
  `candidatosVinculo` (até 3, oferecidos primeiro no diálogo como "Possíveis
  equivalentes"); `N` → nada. Custo somado em `controle/iaVinculo_AAAA-MM`; acima de
  `IA_TETO_MENSAL_USD` (`vinculo/config-ia.ts`) a IA é pulada. Qualquer falha só deixa os
  itens sem vínculo e loga `etapa: 'vinculo'` com contagens. `vinculoBloqueado` é
  respeitado. Medição no gabarito real: `functions/test/etiquetas-gabarito.spec.ts`;
  avaliação da IA real (manual, custa centavos): `functions/scripts/avaliar-ia-vinculo.ts`.
- `produtos/{id}.cnpjs` (até 50) é mantido pela publicação de preços, para contar
  estabelecimentos sem consulta extra.
- Estabelecimentos: lista por `atualizadoEm desc` (30 por página, busca por nome no
  cliente, inclusive pelo apelido) e detalhe com os produtos de preço mais recente (`precos where
  cnpj`). O detalhe tem "Renomear" (`renomear/renomear-dialog.ts`, carregado por `import()`),
  que vale para qualquer loja e chama `definirApelido`; o título é o nome exibido, com "Nome na
  Receita" e "Razão social" abaixo quando diferem.
- `ApelidosService` (`estabelecimentos/data-access/`): `apelidos` (mapa CNPJ → apelido,
  `onSnapshot` de `usuarios/{uid}/estabelecimentos` → `toSignal`), `nome(estab)` e `definir`
  (callable; invalida o `HistoricoPessoalStore`). Sobrepõe o apelido nas telas que leem a base
  compartilhada (lista e detalhe de Estabelecimentos, `resumirPrecos` da página do produto). As
  telas que leem `nota.estabelecimentoNome` já recebem o apelido gravado. Na prévia da importação,
  loja sem nome fantasia e sem apelido mostra `<cp-campo-apelido>` (`shared/ui/campo-apelido/`,
  Signal Forms) com `sugerirApelido`.
- Painel (`/`): total do mês e variação, notas do mês, economia potencial pela base
  comunitária (`menorPreco` dos produtos; **não** chama o Menor Preço), últimas 5 notas,
  pendentes, atalhos e estado inicial em 3 passos.

## Preços da região (Menor Preço)

- `features/regiao/data-access/`: `FontePrecosRegiao` (classe abstrata, `providedIn:
  'root'` com `useExisting: MenorPrecoClient` — não registrar no `app.config`, senão o
  client e o valibot vão para o bundle inicial), `MenorPrecoClient` (HttpClient,
  `timeout` de 10 s, **sem retry**, erros viram `FonteIndisponivelError` com
  `motivo`), `menor-preco.schema.ts` (valibot **por item**: item inválido é descartado
  e contado) e `MenorPrecoCache` (memória + `sessionStorage`, TTL 30 min, chave com
  geohash de 5, deduplica requisição em voo). Tipos em `regiao.model.ts` (evita ciclo
  de import com a classe abstrata).
- API: `data=-1` (últimos 2 meses), `local` = geohash de **7**; a página **não** tem
  29 itens fixos (vem com os empates de preço) — o `offset` anda de 29 em 29 e a lista
  deduplica por `id` (`RegiaoStore`). Ver `docs/analise/spike-menor-preco-2026-09-27.md`.
- `LocalizacaoStore`: GPS (`maximumAge` 5 min) ou município (`src/assets/data/municipios-pr.json`,
  gerado por `scripts/gerar-municipios-pr.mjs` a partir do IBGE). Guarda no
  `localStorage` só origem, município e raio — **nunca coordenadas** nem geohash.
- Tela `/regiao` (`busca-regiao.page`): query params `gtin`/`termo`/`categoria` são a
  fonte de verdade (`withComponentInputBinding`); campo com `debounce` de 400 ms do
  Signal Forms (confirma no `blur`); termo só de dígitos com GTIN válido vira `gtin`.
  Busca por GTIN usa `<cp-resultado-gtin>` (`separarDivergentes`, divergentes ocultos).
- Fixtures reais em `src/testing/fixtures/menor-preco/`; o e2e as serve por
  `page.route` (`e2e/support/mocks.ts`).

## Scanner

`<cp-scanner [formatos] (lido) (cancelado)>` (`shared/ui/scanner/`): câmera traseira,
leitura a cada ~250 ms, lanterna quando suportada, "Escolher imagem" (galeria) e
câmera liberada ao ler, cancelar ou destruir. O `scanner-engine.ts` usa o
`BarcodeDetector` nativo quando suporta os formatos, senão `import()` de
`barcode-detector/ponyfill` com o `.wasm` servido de `assets/zxing/` (copiado de
`zxing-wasm/dist/reader` pelo `angular.json`, sem CDN). Use sempre dentro de `@defer`
para ficar fora do bundle inicial. Câmera, `getUserMedia` e `createImageBitmap` chegam
pelo token `SCANNER_ENGINE` (fake nos testes). Imagens de teste (QR da NFC-e e EAN)
geradas por `scripts/gerar-imagens-codigo.mjs` em `e2e/fixtures/`.

## Theming

Nome do app: **Cupom Esperto** (domínio `cupomesperto.com.br`). O prefixo `cp`, os
projetos Firebase e o repositório mantêm o nome antigo (`compara-precos`).

Design system **"Cupom Esperto"**: a estrutura do DS do `fed-catalogo-confeccoes`
com prefixo `cp` e paleta verde.

- **Logo** (arte em `public/logo/logos.png`, recortes gerados por `scripts/gerar-icones.mjs`):
  `logo.png` (símbolo + "Cupom Esperto", fundo transparente) e `simbolo.png` só vão sobre
  fundo claro; os ícones da PWA usam o símbolo sobre floresta `#0d3320`.
- **Tokens** em `src/app/shared/style/_tokens.scss` — acento (`$cp-accent` `#1f7a4d`,
  `$cp-accent-ink` `#16603b`), casca clara (`$cp-nav-*`, `$cp-gradient-auth` nas telas de
  conta), floresta só para fundos escuros pontuais (`$cp-shell-900/700`: câmera do
  scanner), superfícies, rampa de texto grafite esverdeado, preço
  (`$cp-cheaper` = acento, `$cp-pricier` vermelho), semânticas (`$cp-success` é
  **teal** para não se confundir com o acento), raios, sombras e layout. **Única
  fonte de cor**: o stylelint (`color-no-hex`, `color-named`) só libera este arquivo
  e o `_m3-palette.scss`.
- **Contraste:** `npm run contraste` lê os hex dos tokens e confere a lista de pares
  texto × superfície (WCAG AA, 4.5:1; 3:1 para texto grande/ícone). Ao criar um
  token de texto ou um par novo, acrescente o par em `scripts/contraste.mjs`.
- **Classes globais** em `src/styles.scss` — `.cp-page` (`--detalhe`, `--form`),
  `.cp-page-header`, `.cp-detail-header`, `.cp-card`, `.cp-block`, `.cp-panel`,
  `.cp-section-top/-title`, `.cp-label`, `.cp-field` (`-compact`, `-prefix`, `-hint`,
  `-error`), `.cp-btn-primary` (`-compact`), `.cp-btn-secondary/-ghost/-danger/-icon`,
  `.cp-empty-state`, `.cp-empty-inline`, `.cp-list` + `.cp-list-row`, `.cp-summary`,
  `.cp-info-block` (`--warn`, `--erro`), `.cp-form-grid/-actions`, `.cp-loading`,
  `.cp-skeleton`, `.cp-sr-only`, e as do domínio: `.cp-price`, `.cp-price-unit`,
  `.cp-price-old`, `.cp-source`, `.cp-badge--mais-barato/--mais-caro/--igual`,
  `.cp-status--aguardando/--falhou/--novo`, `.cp-chip`, `.cp-segmented`.
- **Mixins** (`_mixins.scss`) só para o parametrizado: `cp-grid($min)`,
  `cp-chip($ink, $bg)`, `cp-btn-icon-ghost(…)`, `cp-segmented`, `cp-card-clickable`.
- **Breakpoints** (`_breakpoints.scss`): `mobile` (≤599), `tablet-up`, `desktop`
  (≥1024), `narrow` (≤900, shell em drawer) e `wide`.

**Classe global primeiro, mixin só para o parametrizado.** Mixin é expandido inline
em cada componente e conta contra o budget `anyComponentStyle` (6kB aviso, 10kB erro).
No SCSS do componente fica só o que é daquela tela.

Tema Material **M3** (`mat.theme` em `src/styles.scss`) com a paleta gerada de
`#1f7a4d` (`_m3-palette.scss`, via `ng generate @angular/material:theme-color`). Usado
só em dialog, menu, autocomplete, datepicker e snackbar. Os campos são `<label>` +
`<input class>` do DS (mantém `getByLabel()`).

Tipografia **Instrument Sans**; ícones **Material Symbols Rounded** (a classe
`.material-icons` é remapeada, então `mat-icon` funciona). Componentes base em
`src/app/shared/ui/`: `<cp-preco>`, `<cp-badge-preco>` (ícone + texto + cor, nunca só
cor), `<cp-fonte-preco>` e `<cp-empty-state>`. O `currency` padrão (pt-BR/BRL) basta;
não há pipe `brl`.
