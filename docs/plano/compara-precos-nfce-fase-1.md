# Fase 1: Fundação do repositório

**Plano:** [índice](./compara-precos-nfce-plano.md)
**Pré-requisito:** nenhum
**Próxima fase:** [Fase 2](./compara-precos-nfce-fase-2.md) e [Fase 3](./compara-precos-nfce-fase-3.md) (independentes)

---

## Objetivo

Um projeto Angular 22.2 vazio mas completo: builda sem `zone.js`, tem lint,
formatação, stylelint, Vitest e Playwright rodando, locale pt-BR, a pasta
`shared/` ligada por alias e um `CLAUDE.md` com as convenções. Nenhuma tela de
produto ainda.

---

### Tarefa 1.1: `git init` e `ng new`

**Arquivo(s) a criar:** raiz do projeto (`package.json`, `angular.json`,
`tsconfig*.json`, `src/**`), `.gitignore`

**O que fazer:**
1. `git init -b main`. O `.gitignore` do CLI já ignora `dist/`, `node_modules/` e
   `.angular/`. Acrescentar `functions/lib/`, `.firebase/`, `*-debug.log`,
   `coverage/`, `test-results/` e `playwright-report/`. **`dist/` não é versionado**
   (diferente do confeccoes, porque aqui o CI builda).
2. Gerar o app **dentro da pasta existente** (que já tem `docs/`):

   ```bash
   npx @angular/cli@22.2 new fed-catalogo-compara-precos --directory . \
     --style=scss --ssr=false --routing --skip-git --prefix=cp
   ```

   Aceitar os padrões do v22: standalone, zoneless, Vitest.
3. Conferir em `src/app/app.config.ts` que **não** há `provideZoneChangeDetection`,
   e no `angular.json` que **não** há `zone.js` em `polyfills`.
4. Adicionar em `package.json` → `engines: { "node": ">=22" }`.
5. `git remote add origin https://github.com/andreehgomes/fed-catalogo-compara-precos.git`
   (repositório já criado e vazio). Primeiro commit com `docs/` e o app gerado,
   e `git push -u origin main` **só com confirmação do usuário**.

**Critério:** `npm start` sobe em `localhost:4200`, e `ng build` gera o bundle sem
`zone.js` (conferir `grep -r "zone.js" dist/` sem resultado).

---

### Tarefa 1.2: ESLint, Prettier e Stylelint

**Arquivo(s) a criar/modificar:** `eslint.config.js`, `.prettierrc`,
`.prettierignore`, `.stylelintrc.json`, `package.json` (scripts)

**O que fazer:**
1. `ng add angular-eslint`. No `eslint.config.js`, ativar as regras que garantem as
   convenções:
   - `@angular-eslint/prefer-on-push-component-change-detection: error`
   - `@angular-eslint/prefer-signals: error`
   - `@angular-eslint/template/prefer-control-flow: error`
   - `@angular-eslint/prefer-inject: error`
   - `@typescript-eslint/no-explicit-any: error`
   - `@angular-eslint/component-selector` com prefixo `cp`
2. Prettier: `singleQuote`, `printWidth: 100`.
3. Stylelint (`stylelint`, `stylelint-config-standard-scss`) com `color-no-hex:
   true` e `color-named: never`, **exceto** em `src/app/shared/style/_tokens.scss`
   (via `overrides`).
4. Scripts: `lint` (ng lint + stylelint `src/**/*.scss`) e `format`.

**Critério:** `npm run lint` passa no projeto recém-gerado. Um `color: #fff` num
SCSS de componente faz o lint falhar.

---

### Tarefa 1.3: Testes (Vitest + Playwright) e budgets

**Arquivo(s) a criar/modificar:** `angular.json`, `playwright.config.ts`,
`e2e/smoke.spec.ts`, `package.json`

**O que fazer:**
1. Confirmar que `ng test` usa o builder `@angular/build:unit-test` com Vitest (padrão
   do v22). Habilitar cobertura (`coverage: true` no target `test`) e o script
   `test:ci` (`ng test --watch=false --coverage`).
2. `npm i -D @playwright/test` e `npx playwright install chromium`. Configurar
   `webServer` com `npm start`, `baseURL http://localhost:4200` e projetos
   `chromium` e `mobile` (`devices['Pixel 7']`). Script `e2e`.
3. `e2e/smoke.spec.ts`: a página inicial carrega e tem `<title>` "Compara Preços".
4. Budgets em `angular.json` → `production`:

   ```json
   { "type": "initial", "maximumWarning": "500kb", "maximumError": "1mb" },
   { "type": "anyComponentStyle", "maximumWarning": "6kb", "maximumError": "10kb" }
   ```

**Critério:** `npm run test:ci` e `npm run e2e` verdes, e o build de produção
passa sem aviso de budget.

---

### Tarefa 1.4: Pasta `shared/` com alias

**Arquivo(s) a criar/modificar:** `shared/index.ts`, `tsconfig.json`,
`angular.json` (test include)

**O que fazer:**
1. Criar `shared/` na raiz, com código **TypeScript puro**, sem Angular e sem
   Firebase. É usado pelo front e pelas Functions.
2. Em `tsconfig.json` → `compilerOptions.paths`: `"@shared/*": ["shared/*"]`.
3. Incluir `shared/**/*.spec.ts` no target de teste do Angular (opção `include`),
   para rodar junto com `npm test`.
4. Criar `shared/index.ts` vazio (barrel). As funções entram na Fase 3.

> As Functions consomem `shared/` por **bundle com esbuild** (Fase 6.1), porque o
> Node não resolve `paths` do TS em runtime. Não publicar `shared/` como pacote npm.

**Critério:** `import { } from '@shared/index'` compila no app e o `npm test` enxerga
um `shared/exemplo.spec.ts` temporário (apagar em seguida).

---

### Tarefa 1.5: Locale pt-BR e metadados

**Arquivo(s) a modificar:** `src/app/app.config.ts`, `src/main.ts`, `src/index.html`

**O que fazer:**
1. `registerLocaleData(localePt)` em `main.ts` e, no `app.config.ts`,
   `{ provide: LOCALE_ID, useValue: 'pt-BR' }` e
   `{ provide: DEFAULT_CURRENCY_CODE, useValue: 'BRL' }`.
2. `index.html`: `lang="pt-BR"`, `<title>Compara Preços</title>`,
   `<meta name="theme-color">` (valor definido na Fase 2), viewport com
   `viewport-fit=cover`.
3. `provideHttpClient(withFetch())` no `app.config.ts`.

**Critério:** `{{ 1234.5 | currency }}` renderiza `R$ 1.234,50`.

---

### Tarefa 1.6: `CLAUDE.md`

**Arquivo a criar:** `CLAUDE.md`

**O que fazer:** escrever o guia do repositório no mesmo formato do confeccoes:
- **Commands:** `npm start`, `npm test`, `npm run test:ci`, `npm run lint`,
  `npm run e2e`, `ng build --configuration=production`,
  os deploys no dv (`deploy:rules:dev`, `deploy:functions:dev`, a partir da Fase 4,
  **rodados pelo usuário**) e os comandos das Functions (Fase 6). **Sem Firebase
  Emulator Suite**: o `npm start` usa o projeto `fed-catalogo-compara-precos-dv`.
- **Architecture Overview:** Angular 22 zoneless, `features/` lazy, `core/`,
  `shared/` (TS puro, alias `@shared`), `functions/`.
- **Convenções:** copiar a seção "Convenções Obrigatórias" do índice do plano.
- **Fontes de dados:** SEFAZ-PR via QR (só pelas Functions) e Menor Preço (direto
  do navegador), com link para a análise.
- **Não fazer:** `@angular/fire`, escrita do cliente em coleção compartilhada,
  `window.innerWidth`, hex fora de `_tokens.scss`, OCR de cupom.

Seções de Firebase e Theming ficam como "a completar na Fase 2/4", atualizadas no
fim de cada fase.

**Critério:** o arquivo existe e cobre comandos, arquitetura e convenções.

---

## Critérios de Aceitação da Fase

- [ ] Repositório git com `.gitignore` sem `dist/` versionado.
- [ ] `npm start`, `npm run lint`, `npm run test:ci`, `npm run e2e` e `ng build --configuration=production` passam.
- [ ] Nenhuma ocorrência de `zone.js` no bundle.
- [ ] Moeda formatada em BRL.
- [ ] `@shared/*` resolve no app e nos testes.
- [ ] `CLAUDE.md` presente.
