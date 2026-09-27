# Fase 10: Qualidade, CI e deploy

**Plano:** [índice](./compara-precos-nfce-plano.md)
**Pré-requisito:** [Fase 9](./compara-precos-nfce-fase-9.md)
**Próxima fase:** nenhuma (fim do MVP)

---

## Objetivo

Fechar o MVP com rede de segurança: e2e dos fluxos principais contra o projeto dv,
auditoria de acessibilidade e desempenho, CI que builda e testa (não se versiona
`dist/`), deploy de Hosting + Functions + regras e uma PWA mínima para abrir rápido
no mercado.

---

### Tarefa 10.1: e2e dos fluxos principais

**Arquivos a criar:** `e2e/{auth,importar,regiao,navegacao}.spec.ts`,
`e2e/support/mocks.ts`, `e2e/support/login.ts`

**O que fazer:**
- **Sem emulador.** Playwright com `webServer` = `npm start` (projeto **dv**) e login
  pelo **usuário de teste** de `.env.e2e` (4.4), feito uma vez em `globalSetup` com
  `storageState` reaproveitado.
- **Nunca** acessar SEFAZ, Menor Preço ou as Functions reais (RNF-20). Tudo por
  `page.route`:
  - Menor Preço: `**/menorpreco.notaparana.pr.gov.br/**` servindo as fixtures da 5.1;
  - Functions: `**/*.cloudfunctions.net/**` com respostas fixas por callable (prévia,
    confirmação, erros e enfileiramento).
- O e2e **não escreve dados no Firestore do dv**: as escritas passam pelas callables,
  e elas estão mockadas. Leituras de telas que dependem de dados (notas, produtos,
  estabelecimentos) ficam nos specs de componente com services mockados.
- Cenários: login/logout; importar por URL colada → prévia → confirmar → navega para
  o detalhe; SEFAZ fora → guardar; chave com DV inválido sem chamada à function;
  busca por EAN na região com divergentes; navegação do shell no projeto `mobile`.
- **Checklist manual** em `docs/qualidade/roteiro-manual-dv.md`, para o usuário rodar
  no dv depois dos deploys: importação real, fila de pendentes, isolamento entre dois
  usuários, vínculo de produtos e comparação na base comunitária.
- Seletores por papel e label (`getByRole`, `getByLabel`), nunca por classe CSS
  (lição do confeccoes: e2e acoplado a classe quebra no redesign).

**Critério:** com `.env.e2e` preenchido, `npm run e2e` verde localmente nos projetos
`chromium` e `mobile`. Sem o arquivo, os testes que precisam de login são pulados com
aviso claro (`test.skip`), não falham. Roteiro manual do dv escrito.

---

### Tarefa 10.2: Acessibilidade e desempenho

**Arquivos a criar/modificar:** `e2e/a11y.spec.ts`, ajustes pontuais nas telas

**O que fazer:**
1. `@axe-core/playwright` em painel, importar, lista de notas, detalhe, região e
   produto. **Zero violações** `serious`/`critical`.
2. Teclado: percorrer o shell e a importação só com Tab, Enter e Esc (e2e).
3. Lighthouse mobile (`npx lighthouse` sobre o `ng build -c production` servido
   localmente por `npx http-server dist/fed-catalogo-compara-precos/browser`) em login
   e painel: **Performance ≥ 85 e Accessibility ≥ 95**.
   Registrar os números na execução.
4. Conferir na saída do build que `barcode-detector`/`zxing`, `grafico-historico`
   e cada feature estão em chunks lazy, e que o `initial` está abaixo de 500 kB.

**Critério:** axe sem violações graves, metas do Lighthouse atingidas e budgets sem
aviso.

---

### Tarefa 10.3: CI e deploy (GitHub Actions)

**Arquivos a criar:** `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`

**O que fazer:**
- `ci.yml` (PR e push): `npm ci`, `npm ci --prefix functions`, `npm run lint`,
  `npm run contraste`, `npm run test:ci`, `npm --prefix functions test` e
  `ng build --configuration=production`. O e2e roda no CI **só** se os secrets
  `E2E_EMAIL`/`E2E_SENHA` existirem (configurados pelo usuário no GitHub), contra
  `npm start` do dv e com os mocks da 10.1.
- `deploy.yml`, depois do CI verde, autenticado por **Workload Identity Federation**
  (sem chave JSON em secret), com `firebase deploy --only
  hosting,functions,firestore:rules,firestore:indexes`:
  - push em **`develop`** → build dev (`environment.ts`) → `-P dev`
    (`fed-catalogo-compara-precos-dv`);
  - push em **`main`** → `ng build -c production` → `-P prod`
    (`fed-catalogo-compara-precos`).
- Proteção de branch em `main` exigindo o CI verde (configurada pelo usuário no GitHub).

**Critério:** um PR com lint quebrado falha no CI, e o merge em `main` publica em
produção.

---

### Tarefa 10.4: PWA mínima

**Arquivos a criar/modificar:** `ng add @angular/pwa` → `ngsw-config.json`,
`public/manifest.webmanifest`, ícones

**O que fazer:** instalar a PWA com `name` "Compara Preços", `theme_color` =
`$cp-shell-900`, `background_color` = `$cp-bg` e ícones verdes. No `ngsw-config`,
**não** cachear chamadas ao Menor Preço nem às Functions (só o app shell e os
assets, incluindo o `.wasm` do scanner, com `installMode: lazy`).

**Critério:** o app instala no Android pelo Chrome, abre offline na lista de notas
(cache do Firestore da 4.2) e a tela Importar avisa que precisa de conexão.

---

### Tarefa 10.5: Fechamento de documentação

**Arquivos a modificar:** `CLAUDE.md`, `docs/analise/compara-precos-nfce-analise.md`

**O que fazer:** atualizar o `CLAUDE.md` com tudo o que ficou "a completar", e na
análise marcar o que foi decidido nos spikes (EAN no PR, v3 só com chave, geohash de
7) e as discrepâncias registradas nas execuções.

**Critério:** o `CLAUDE.md` descreve o app como ele está, sem seções pendentes.

---

## Critérios de Aceitação da Fase

- [ ] e2e dos fluxos principais verde em desktop e mobile, sem acesso a serviços reais.
- [ ] axe sem violações graves; Lighthouse Performance ≥ 85 e Accessibility ≥ 95.
- [ ] CI builda, testa e bloqueia merge quebrado; deploy automático em `main`.
- [ ] PWA instalável, com a lista de notas offline.
- [ ] Documentação atualizada.
