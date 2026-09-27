# Execução: Fase 10 — Qualidade, CI e deploy

**Data:** 2026-09-27
**Plano:** docs/plano/compara-precos-nfce-fase-10.md (via `compara-precos-nfce-executar-tudo.md`)
**Branch:** main
**Executor:** Claude Code

---

## Resumo

Fechamento do MVP: e2e dos fluxos principais (com SEFAZ, Menor Preço e Functions
interceptados), axe nas telas, Lighthouse mobile ajustado até a meta, workflows de CI e
deploy por Workload Identity Federation, PWA com ícones verdes e sem cache das APIs, e a
documentação (CLAUDE.md, análise, README e roteiro manual do dv) atualizada.

---

## Tarefas Executadas

| Fase | Tarefa | Status | Observações |
|------|--------|--------|-------------|
| 10.1 | e2e dos fluxos principais | ✅ / ⛔ | `auth`, `importar`, `regiao`, `navegacao`, `a11y`, `smoke` + `support/{env,login,mocks}`. Mocks por `page.route` para Menor Preço (fixtures reais), callables (protocolo `{data}`→`{result}`) e App Check; SEFAZ e Functions reais bloqueadas. Sem `.env.e2e` os testes logados são pulados com o motivo. Roteiro manual em `docs/qualidade/roteiro-manual-dv.md`. ⛔ Execução dos testes logados: depende do usuário de teste |
| 10.2 | Acessibilidade e desempenho | ✅ / ⛔ | axe (`wcag2a/aa`, `21a/aa`, `22aa`): 0 violações `serious`/`critical` em `/login`, `/cadastro`, `/redefinir-senha` e na página de erro, desktop e mobile. Teclado no login. Lighthouse mobile no build de produção servido com gzip: **login 91 / 100**, raiz (redireciona ao login) **90 / 100** (Performance / Accessibility). ⛔ axe e Lighthouse das telas logadas (painel, lista de notas): usuário de teste |
| 10.3 | CI e deploy | ✅ / ⛔ | `ci.yml` (lint, contraste, `test:ci`, Functions typecheck/testes/build, build de produção; e2e com secrets opcionais) e `deploy.yml` (após CI verde: `develop` → build `dv` → `-P dev`; `main` → `production` → `-P prod`; WIF, sem chave JSON). YAML validado. ⛔ Configurar WIF, variáveis, secrets e a proteção de `main` no GitHub: usuário |
| 10.4 | PWA mínima | ✅ / ⛔ | `@angular/pwa`, manifest pt-BR ("Compara Preços", `theme_color` shell-900, `background_color` bg), ícones verdes gerados por `scripts/gerar-icones.mjs`, `ngsw-config` sem `dataGroups` (Menor Preço e Functions nunca cacheados; `.wasm`/JSON lazy), `no-cache` para o service worker no Hosting. O aviso "Importar precisa de conexão" já existia (Fase 7). ⛔ Instalar no Android e abrir offline: usuário |
| 10.5 | Documentação | ✅ | `CLAUDE.md` sem seções pendentes (comandos, rotas, PWA/CI), análise com a seção 8 (decisões e discrepâncias), README em pt-BR |

---

## Discrepâncias do Plano

- **Desempenho: duas mudanças para atingir Performance ≥ 85** (começou em 68):
  1. **Firebase Auth sem `popupRedirectResolver` na inicialização** (`initializeAuth` só
     com persistência). O `getAuth()` padrão carregava um iframe do `authDomain` antes do
     primeiro `onAuthStateChanged`, segurando a primeira tela. O resolvedor entra só no
     login com Google; o retorno de um redirect é concluído quando o próprio app o
     iniciou (marca em `sessionStorage`).
  2. **Subset do Material Symbols** (`icon_names=` com os 43 ícones usados): a fonte caiu
     de 374 kB para poucos kB.
  A medição usa o build servido com gzip (`http-server -g` sobre arquivos pré-comprimidos),
  como o Firebase Hosting serve; sem compressão a nota era 72–79.
- **Lighthouse do painel** não pôde ser medido: sem sessão, `/` redireciona para o login.
- **Login do e2e por teste** (`entrar(page)`), sem `globalSetup` com `storageState`: o
  Firebase Auth guarda a sessão no IndexedDB, e o fluxo por teste é o que dá para
  garantir sem rodar contra o dv.
- **Build `dv`** acrescentado ao `angular.json` (produção otimizada sem trocar o
  `environment`), para o deploy de `develop` publicar no projeto dv.
- O teste de teclado roda só no projeto desktop (no `mobile` emulado não há Tab).

---

## Análise de Lint

```
npm run lint → All files pass linting.
npm run contraste → 52 pares aprovados em WCAG AA.
```

## Verificações

```
npm run test:ci → 25 arquivos, 260 testes verdes (cobertura total 86,5%; shared/ 100%)
functions: typecheck ok; 70 testes; cobertura importar 95,2% · parsers 100% · pendentes 95,8% · produtos 96,6%; build ok
ng build -c production → initial 480.80 kB (< 500 kB, sem aviso de budget)
npm run e2e → 23 passed, 33 skipped (logados, sem .env.e2e), chromium + mobile
Lighthouse mobile → login: Performance 91, Accessibility 100, Best Practices 100
```

## Boas Práticas Angular 20

| Critério | Status |
|----------|--------|
| OnPush em todos os componentes | ✅ |
| inject() sem construtor | ✅ |
| takeUntilDestroyed() | ✅ |
| trackBy/track em @for | ✅ |
| loading="lazy" em imagens | ✅ (nenhuma `<img>` no app) |
| Sem any implícito | ✅ |

---

## Critérios de Aceitação

- ✅ / ⛔ e2e dos fluxos principais sem acesso a serviços reais: verdes em desktop e mobile os que não exigem conta; os logados estão escritos e pulam sem `.env.e2e`.
- ✅ / ⛔ axe sem violações graves e Lighthouse Performance ≥ 85 / Accessibility ≥ 95 nas telas públicas; painel e lista de notas dependem do usuário de teste.
- ⛔ CI builda, testa e bloqueia merge quebrado; deploy automático em `main`: workflows escritos; configuração no GitHub e no GCP é do usuário.
- ⛔ PWA instalável com a lista de notas offline: configurada; teste no Android é do usuário.
- ✅ Documentação atualizada.

---

## Arquivos Criados/Modificados

```
e2e/{a11y,navegacao,importar,regiao}.spec.ts e2e/support/{mocks,login,env}.ts
.github/workflows/{ci,deploy}.yml
ngsw-config.json public/manifest.webmanifest public/icons/*.png scripts/gerar-icones.mjs
src/index.html src/app/app.config.ts firebase.json angular.json package.json
src/app/core/firebase/firebase.providers.ts src/app/core/auth/{auth-api,auth.store}.ts (+ spec)
docs/qualidade/roteiro-manual-dv.md docs/analise/compara-precos-nfce-analise.md
CLAUDE.md README.md
```
