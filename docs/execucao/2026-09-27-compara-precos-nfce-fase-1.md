# Execução: Fase 1 — Fundação do repositório

**Data:** 2026-09-27
**Plano:** docs/plano/compara-precos-nfce-fase-1.md (via `compara-precos-nfce-executar-tudo.md`)
**Branch:** main
**Executor:** Claude Code

---

## Resumo

App Angular 22.2 gerado na pasta existente (standalone, zoneless, Vitest), com
angular-eslint + regras das convenções, Prettier, Stylelint bloqueando hex, Vitest com
cobertura, Playwright (chromium + Pixel 7), locale pt-BR/BRL, alias `@shared/*` e
`CLAUDE.md`.

---

## Tarefas Executadas

| Fase | Tarefa | Status | Observações |
|------|--------|--------|-------------|
| 1.1 | `git init` e `ng new` | ✅ | `git init -b main`, remoto `origin` configurado (sem push). `.gitignore` com `functions/lib`, `.firebase/`, `coverage`, `test-results`, `playwright-report`, `.env.e2e`. Sem `zone.js` em `polyfills` nem `provideZoneChangeDetection` |
| 1.2 | ESLint, Prettier, Stylelint | ✅ | Regras `prefer-on-push…`, `prefer-signals`, `prefer-inject`, `no-explicit-any`, `template/prefer-control-flow`, seletor `cp`. Stylelint com `color-no-hex`/`color-named` e override para `_tokens.scss` e `_m3-palette.scss` |
| 1.3 | Vitest + Playwright + budgets | ✅ | `coverage: true` no target `test`, `test:ci`, `setupFiles` com `registerLocaleData`. Playwright com `webServer: npm start`, projetos `chromium` e `mobile`. Budgets 500kB/1MB e 6kB/10kB |
| 1.4 | `shared/` com alias | ✅ | `paths` `@shared/*`; `include` do teste com `../shared/**/*.spec.ts`. Spec temporário `shared/exemplo.spec.ts` executado e apagado |
| 1.5 | Locale pt-BR e metadados | ✅ | `registerLocaleData` no `main.ts`, `LOCALE_ID`/`DEFAULT_CURRENCY_CODE`, `provideHttpClient(withFetch())`, `index.html` com `lang`, título, `theme-color` e `viewport-fit=cover` |
| 1.6 | `CLAUDE.md` | ✅ | Comandos, arquitetura, convenções, fontes de dados, "não fazer". Firebase/Shell/Theming marcados como "a completar" |

---

## Discrepâncias do Plano

- **Node do sistema (22.18.0) abaixo do mínimo do Angular 22 (≥ 22.22.3).** Instalar
  software de sistema é proibido nesta execução, então foi adicionado o pacote npm
  `node@22.23.3` como `devDependency` (runtime local, dentro de `node_modules`). Todos
  os `npm run …` usam esse Node; `engines.node` ficou `>=22.22.3`. **Pendência do
  usuário:** atualizar o Node do sistema e, se quiser, remover o pacote `node`.
- **`include` dos testes:** o builder resolve os padrões a partir de `src/`, por isso
  o `shared/` entra como `../shared/**/*.spec.ts` (o plano previa `shared/**/*.spec.ts`).
- **`strict`/`strictTemplates`** foram declarados explicitamente no `tsconfig.json`
  (o `ng new` do v22 não os escreve).
- **`no-empty-source`** desligado no stylelint (arquivos SCSS vazios gerados pelo CLI).

---

## Análise de Lint

```
npm run lint → All files pass linting. (stylelint sem erros)
Verificação: `a { color: #fff; }` num SCSS de componente → "Disallowed hex color "#fff" color-no-hex"
```

## Verificações

```
npm run test:ci  → 2 arquivos, 3 testes verdes (incluindo o spec temporário de @shared)
npm run e2e      → 2 passed (chromium, mobile)
ng build -c production → main 212.50 kB, sem aviso de budget; nenhum "zone.js" no dist
```

## Boas Práticas Angular 20

| Critério | Status |
|----------|--------|
| OnPush em todos os componentes | ✅ |
| inject() sem construtor | ✅ (nenhuma injeção ainda) |
| takeUntilDestroyed() | ✅ (nenhuma subscription) |
| trackBy/track em @for | ✅ (nenhum @for) |
| loading="lazy" em imagens | ✅ (nenhuma imagem) |
| Sem any implícito | ✅ |

---

## Critérios de Aceitação

- ✅ Repositório git com `.gitignore` sem `dist/` versionado.
- ✅ `npm start` (via webServer do e2e), `npm run lint`, `npm run test:ci`, `npm run e2e` e `ng build --configuration=production` passam.
- ✅ Nenhuma ocorrência de `zone.js` no bundle.
- ✅ Moeda formatada em BRL (`R$ 1.234,50`, spec do `App`).
- ✅ `@shared/*` resolve no app e nos testes.
- ✅ `CLAUDE.md` presente.

---

## Arquivos Criados/Modificados

```
.gitignore .prettierrc .prettierignore .stylelintrc.json .editorconfig .vscode/*
angular.json package.json package-lock.json tsconfig.json tsconfig.app.json tsconfig.spec.json
eslint.config.js playwright.config.ts e2e/smoke.spec.ts
shared/index.ts
src/main.ts src/index.html src/styles.scss src/testing/setup.ts
src/app/app.ts src/app/app.html src/app/app.scss src/app/app.spec.ts src/app/app.config.ts src/app/app.routes.ts
public/favicon.ico README.md CLAUDE.md
```
