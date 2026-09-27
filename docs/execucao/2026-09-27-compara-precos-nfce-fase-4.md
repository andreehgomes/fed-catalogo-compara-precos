# Execução: Fase 4 — Firebase, autenticação e shell

**Data:** 2026-09-27
**Plano:** docs/plano/compara-precos-nfce-fase-4.md (via `compara-precos-nfce-executar-tudo.md`)
**Branch:** main
**Executor:** Claude Code

---

## Resumo

Firebase pelo SDK modular com tokens de DI (sem `@angular/fire`), ambientes dv/prod,
`AuthStore` com signals, guards que esperam a sessão, telas de login/cadastro/redefinição
com Signal Forms **e login com Google** (pedido do usuário durante a execução), shell
portado do confeccoes (rail, drawer, header, FAB), todas as rotas da análise como
esqueleto lazy e `firestore.rules` com checklist do Rules Playground.

---

## Tarefas Executadas

| Fase | Tarefa | Status | Observações |
|------|--------|--------|-------------|
| 4.1 | Projetos e ambientes | ✅ | `firebase@12`, `firebase-tools` (dev). `environment.ts` (dv) / `environment.prod.ts` (prod) via `fileReplacements`; `.firebaserc` com `default`/`dev`/`prod`; `firebase.json` com hosting SPA, cache longo para assets com hash, regras, índices e functions; scripts `deploy:rules:dev` e `deploy:functions:dev`. Sem Analytics e sem `emulators` |
| 4.2 | Providers por `InjectionToken` | ✅ | `FIREBASE_APP`, `FIREBASE_AUTH` em `provideFirebase()`; `FIRESTORE` e `FUNCTIONS` em tokens `providedIn: 'root'` próprios (ver discrepâncias). Spec injeta `FIRESTORE` com o SDK real e confere o projeto dv |
| 4.3 | `AuthStore` e guards | ✅ | `usuario` (`undefined` = resolvendo), `pronto`, `logado`, `uid`; `entrar`, `entrarComGoogle`, `cadastrar`, `sair`, `redefinirSenha`. Guards esperam `pronto()`. Specs cobrem logado, deslogado e resolvendo |
| 4.4 | Login, cadastro, redefinição | ✅ | Signal Forms (`form`, `FormField`, `FormRoot`, `required`, `email`, `minLength`), erros sob o campo com `aria-invalid`/`aria-describedby`, erros do Firebase em pt-BR, `voltar` seguro (só caminho interno). **Botão "Continuar com Google"** no login e no cadastro. Cadastro não grava `usuarios/{uid}` |
| 4.5 | Shell, breakpoints, rotas, erro | ✅ | Shell com rail/expandido/drawer, scrim, `Esc`, foco de volta ao menu, `inert` no drawer fechado, header fora da rolagem, FAB no celular. Rotas da análise 5.2 todas lazy; `**` → página de erro |
| 4.6 | Regras e checklist | ✅ / ⛔ | `firestore.rules` escrito e `docs/qualidade/regras-firestore-checklist.md` com 30 cenários. ⛔ Validação no dv (deploy + Playground) é do usuário |

---

## Discrepâncias do Plano

- **Login com Google (fora do plano, pedido do usuário em 27/09/2026).** O provedor já
  está habilitado no Firebase. `AuthStore.entrarComGoogle()` usa `signInWithPopup` e
  cai para `signInWithRedirect` se o navegador bloquear o popup; popup fechado pelo
  usuário não mostra erro. Botão `<cp-botao-google>` no login (respeita o `voltar`) e
  no cadastro. O logotipo do Google é SVG com as cores da marca (exceção à regra
  "cor só por token", que vale para o SCSS; o stylelint não se aplica a SVG inline).
- **`FIRESTORE`/`FUNCTIONS` fora do `provideFirebase()`.** Registrados no
  `app.config`, os SDKs de Firestore e Functions levaram o bundle inicial a 941 kB
  (budget de 500 kB). Viraram tokens `providedIn: 'root'` com factory, em arquivos
  próprios; o inicial caiu para 440 kB.
- **SDK de Auth por token `AUTH_API`.** `vi.mock('firebase/auth')` funcionou em cada
  spec isolado, mas falhou com todos os specs juntos (o builder empacota o SDK num
  chunk compartilhado). O `AuthStore` recebe as funções do SDK por token e os
  testes injetam fakes.
- **Shell como componente de layout** (`core/layout/shell.ts`, rota pai com
  `authGuard` e `loadComponent`), e não no `app.ts`. O `App` ficou só com
  `<router-outlet>`. Assim as telas de conta e a de erro ficam fora do shell sem
  flag, e o shell (com `MatTooltip`) sai do bundle inicial.
- **Placeholder único** (`features/em-breve`) para as rotas ainda não implementadas,
  com o nome da seção vindo de `data.secao`, em vez de um `*.page.ts` por rota.
- Telas de conta **sem `.scss` próprio**: tudo vem das classes globais `.cp-auth*`
  (regra "classe global primeiro").
- O scrim do drawer é um `<button tabindex="-1">` (o lint de acessibilidade não aceita
  clique em `div`).

---

## Análise de Lint

```
npm run lint → All files pass linting. (stylelint sem erros)
npm run contraste → 46 pares aprovados em WCAG AA.
```

## Verificações

```
npm run test:ci → 16 arquivos, 150 testes verdes
npm run e2e     → 10 passed, 2 skipped (login real sem .env.e2e), chromium + mobile
ng build -c production → initial 440.85 kB (main 419.62 kB), sem aviso de budget;
  shell, login, cadastro, redefinir-senha e em-breve em chunks lazy;
  dist contém só o projectId de produção
grep "@angular/fire" src shared → 0
```

## Boas Práticas Angular 20

| Critério | Status |
|----------|--------|
| OnPush em todos os componentes | ✅ |
| inject() sem construtor | ✅ (construtores só registram listeners) |
| takeUntilDestroyed() | ✅ (eventos do router no shell) |
| trackBy/track em @for | ✅ |
| loading="lazy" em imagens | ✅ (nenhuma imagem) |
| Sem any implícito | ✅ |

---

## Critérios de Aceitação

- ✅ Nenhum `@angular/fire` no projeto; Firebase por `InjectionToken`.
- ⛔ Login e logout no dv por e2e: o teste existe e é pulado sem `.env.e2e` — **usuário cria a conta de teste no dv e preenche `.env.e2e`**. Cadastro, redefinição e Google cobertos por spec.
- ✅ Refresh em rota protegida não pisca o login (guard espera `pronto()`, spec cobre o estado "resolvendo").
- ✅ Shell: rail/expandido no desktop, drawer abaixo de 900px, FAB no mobile, header fora da rolagem (specs do shell). A navegação visual em 1280×800 e 375×812 logada depende do usuário de teste (⛔ mesma pendência).
- ✅ Todas as rotas da análise existem e são lazy.
- ✅ / ⛔ `firestore.rules` e checklist prontos; validação no dv pelo usuário.
- ✅ `CLAUDE.md` com **Firebase & data access** e **Shell**.

---

## Arquivos Criados/Modificados

```
.firebaserc firebase.json firestore.rules firestore.indexes.json .env.e2e.example
src/environments/environment.ts environment.prod.ts
src/app/app.config.ts app.routes.ts
src/app/core/firebase/{firebase.providers,firebase-app.token,firestore.token,functions.token}.ts (+ spec)
src/app/core/auth/{auth-api,auth.store,auth.guards}.ts (+ specs)
src/app/core/layout/{breakpoint.service,shell}.ts shell.html shell.scss (+ spec)
src/app/features/auth/{auth.routes.ts, login/*, cadastro/*, redefinir-senha/*, google/botao-google.ts} (+ specs)
src/app/features/em-breve/em-breve.page.ts src/app/features/erro/erro.page.ts
src/app/shared/forms/erro-campo.ts src/testing/dom.ts
src/styles.scss src/app/shared/style/_tokens.scss scripts/contraste.mjs
e2e/auth.spec.ts e2e/smoke.spec.ts e2e/support/env.ts
docs/qualidade/regras-firestore-checklist.md CLAUDE.md angular.json package.json
```
