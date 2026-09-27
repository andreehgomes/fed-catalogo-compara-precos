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
```

**Node:** o Angular 22.2 exige Node ≥ 22.22.3. O pacote `node` está em
`devDependencies` como runtime local: os scripts `npm run …` usam esse Node
(`node_modules/.bin` entra no PATH). Rodar `ng`/`npx` fora de `npm run` usa o Node
do sistema. Quando o Node do sistema for atualizado, o pacote `node` pode sair.

**Deploy (rodado pelo usuário, nunca pelo agente):** `npm run deploy:rules:dev` e
`npm run deploy:functions:dev` (a partir da Fase 4/6). **Não há Firebase Emulator
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
- `functions/` — Cloud Functions v2 (Fase 6).

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
  Toda escrita de nota ou preço passa por callable.

**Estilo**
- **Classe global primeiro** (`src/styles.scss`, `.cp-*`). Mixin só para o que é
  parametrizado. No SCSS do componente fica só o que é daquela tela.
- Cor só por token `$cp-*` de `_tokens.scss`. O stylelint bloqueia hex e cor nomeada
  fora dele.
- Medir budget **no build**, nunca pelo tamanho do arquivo-fonte.
- Breakpoint em TS via `BreakpointService` (`matchMedia`), nunca `window.innerWidth`.

**Testes**
- Vitest no front e nas Functions. Fixtures reais em `functions/test/fixtures/` e
  `src/testing/fixtures/`. Nunca bater em SEFAZ ou Menor Preço de verdade num teste.
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
  do navegador** com cache de 30 min e debounce.

Detalhes: [docs/analise/compara-precos-nfce-analise.md](docs/analise/compara-precos-nfce-analise.md).

## Não fazer

- `@angular/fire`.
- Escrita do cliente em `produtos`, `precos`, `estabelecimentos` ou nas notas.
- `window.innerWidth` para breakpoint.
- Cor hex/nomeada fora de `_tokens.scss`.
- OCR do cupom impresso (a única fonte dos itens é a página da SEFAZ).
- Firebase Emulator Suite, `firebase deploy` ou `git push` pelo agente.

## Firebase & data access

_A completar na Fase 4._

## Shell

_A completar na Fase 4._

## Theming

Design system **"Compara Preços"**: a estrutura do DS do `fed-catalogo-confeccoes`
com prefixo `cp` e paleta verde.

- **Tokens** em `src/app/shared/style/_tokens.scss` — acento (`$cp-accent` `#1f7a4d`,
  `$cp-accent-ink` `#16603b`), casca floresta (`$cp-shell-900/800/700`,
  `$cp-gradient-shell`), superfícies, rampa de texto grafite esverdeado, preço
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
