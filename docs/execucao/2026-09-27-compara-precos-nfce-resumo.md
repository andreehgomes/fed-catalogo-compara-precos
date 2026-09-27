# Resumo: execução completa do plano Compara Preços (NFC-e + Menor Preço)

**Data:** 2026-09-27
**Plano:** docs/plano/compara-precos-nfce-executar-tudo.md
**Branch:** main (local; nada foi enviado ao GitHub)
**Executor:** Claude Code

---

## Status das fases

| # | Fase | Status | Commit | Execução |
|---|---|---|---|---|
| 1 | Fundação do repositório | ✅ concluída | `a020cff` | [fase-1](./2026-09-27-compara-precos-nfce-fase-1.md) |
| 2 | Design system "Compara Preços" | ✅ concluída | `3e767da` | [fase-2](./2026-09-27-compara-precos-nfce-fase-2.md) |
| 3 | Domínio puro (`shared/`) | ✅ concluída | `d9af461` | [fase-3](./2026-09-27-compara-precos-nfce-fase-3.md) |
| 4 | Firebase, autenticação e shell | ⚠️ parcial | `90006da` (+ `dc66ab2` doc) | [fase-4](./2026-09-27-compara-precos-nfce-fase-4.md) |
| 5 | Preços da região (Menor Preço) | ⚠️ parcial | `6d36957` | [fase-5](./2026-09-27-compara-precos-nfce-fase-5.md) |
| 6 | Importação: backend (Functions) | ⚠️ parcial — 6.3 ⛔ | `2e87fa9` | [fase-6](./2026-09-27-compara-precos-nfce-fase-6.md) |
| 7 | Importação: front | ⚠️ parcial | `5719055` | [fase-7](./2026-09-27-compara-precos-nfce-fase-7.md) |
| 8 | Minhas notas | ✅ concluída | `d7bf79c` | [fase-8](./2026-09-27-compara-precos-nfce-fase-8.md) |
| 9 | Produtos, estabelecimentos e painel | ✅ concluída | `7a862bc` | [fase-9](./2026-09-27-compara-precos-nfce-fase-9.md) |
| 10 | Qualidade, CI e deploy | ⚠️ parcial | `e1989c6` | [fase-10](./2026-09-27-compara-precos-nfce-fase-10.md) |

"Parcial" = todo o código e os testes locais estão prontos; faltam só verificações que
dependem de conta de teste, deploy, celular real, GitHub/GCP ou da SEFAZ-PR (lista abaixo).
Nenhum critério foi dado como cumprido sem ter sido verificado.

**Estado no último commit:** lint e stylelint sem erros; `npm run contraste` com 52 pares
AA; 260 testes do app (cobertura 86,5%, `shared/` 100%) e 70 das Functions (importar 95%,
parsers 100% sobre fixture sintética); `ng build -c production` com initial de 480,8 kB,
sem aviso de budget; e2e com 23 testes verdes e 33 pulados (precisam do usuário de teste);
Lighthouse mobile no login: Performance 91, Accessibility 100.

---

## Pendências do usuário

### Instalar
- **Atualizar o Node do sistema para ≥ 22.22.3** (está 22.18.0; o Angular 22 exige
  22.22.3). Até lá o projeto usa o pacote `node` em `devDependencies` e tudo funciona pelos
  `npm run …`. Depois de atualizar, dá para remover o pacote `node`.

### Console Firebase / Google Cloud
- **Plano Blaze + alerta de orçamento** no dv (e em produção antes do primeiro deploy de `main`).
- Nos dois projetos: **Authentication** com e-mail/senha e **Google** habilitados (o Google
  já está, segundo o usuário), `localhost` em Domínios autorizados no dv; **Firestore em
  `southamerica-east1`**.
- Publicar no dv: `npm run deploy:rules:dev` e `npm run deploy:functions:dev`.
- Rodar o checklist do **Rules Playground**: `docs/qualidade/regras-firestore-checklist.md` (30 cenários).
- **App Check:** abrir o app no `localhost`, copiar o debug token do console do navegador e
  registrar no dv; conferir que callable sem token é rejeitada
  (`docs/qualidade/functions-dv-checklist.md`).
- Criar a **conta de teste** no Authentication do dv e preencher `.env.e2e` (modelo em
  `.env.e2e.example`); rodar `npm run e2e` para executar os 33 testes pulados.
- Rodar o roteiro manual `docs/qualidade/roteiro-manual-dv.md` depois dos deploys.
- Para o deploy automático: criar o **Workload Identity Pool/Provider** e as contas de
  serviço de deploy (Firebase Admin + Cloud Functions Admin + Service Account User) nos
  dois projetos.

### GitHub
- `git push -u origin main` (o remoto `origin` está configurado; nada foi enviado).
- Criar o branch `develop`, se for usar o deploy no dv pelo CI.
- Variáveis `WIF_PROVIDER`, `WIF_SERVICE_ACCOUNT`, `WIF_SERVICE_ACCOUNT_DV`; secrets
  `E2E_EMAIL`, `E2E_SENHA` (opcionais) e ambientes `dv`/`producao`.
- Proteção de branch em `main` exigindo o job "Lint, testes e build" verde.

### Teste em celular
- Scanner com **câmera real**: EAN na prateleira e QR de cupom; lanterna; LED apaga ao sair.
- Uso com uma mão em 375×812 (ação principal acima da dobra).
- **PWA**: instalar pelo Chrome do Android e abrir Minhas notas offline.

### SEFAZ-PR (quando o portal voltar)
- **Tarefa 6.3 (bloqueada):** salvar ≥ 3 HTML reais de cupons do PR, anonimizar com
  `node scripts/anonimizar-fixture.mjs`, confirmar/ajustar os seletores de
  `functions/src/parsers/pr.ts` (hoje provisórios, sobre o layout SVRS), responder se o
  **EAN** aparece e se a **URL v3 só com a chave** abre a nota (ajustar
  `ACEITA_V3_SO_COM_CHAVE`), confirmar os hosts de redirect em `allowlist.ts` e registrar
  em `docs/analise/spike-sefaz-pr-AAAA-MM-DD.md`.
- Importação ponta a ponta no dv (prévia igual ao cupom impresso; fila importando sozinha).

---

## Como validar

```bash
npm install
npm start
npm test
npm run lint
ng build -c production
npm --prefix functions test
npm run e2e
```

(`ng build -c production` pode ser rodado como `npm run build -- --configuration=production`
enquanto o Node do sistema não for atualizado.)

---

## Discrepâncias relevantes em relação ao plano

- **Node local por pacote npm** (sistema abaixo do mínimo do Angular 22).
- **Login com Google** acrescentado a pedido do usuário durante a execução.
- **Parser do PR provisório** (layout SVRS, fixture sintética) em vez de nenhum; 6.3 segue ⛔.
- **Firestore, Functions e App Check fora do bundle inicial** (tokens `providedIn: 'root'`,
  App Check na primeira callable) e **Auth sem `popupRedirectResolver`** no boot — foi o
  que levou o inicial para < 500 kB e o Lighthouse de 68 para 91 (com o subset de ícones).
- **SDK do Firebase por tokens injetáveis** (`AUTH_API`, `FIRESTORE_API`,
  `CHAMAR_FUNCTION`): `vi.mock` de módulos do Firebase falha com todos os specs juntos.
- **Menor Preço:** a página não tem 29 itens fixos; paginação por `offset` de 29 com
  deduplicação por `id`. Geohash de 7 confirmado.
- **Comparação de itens sem EAN por texto** ("aproximado"), já que o parser provisório não
  traz EAN.
- **Localização por cidade** (sem bairro); **marca "Nova" no `localStorage`**; **último preço
  por estabelecimento** no menor/médio/maior; **EAN como canônico** no vínculo;
  **`produtos.cnpjs`** para contar estabelecimentos.
- **Shell como layout de rota** (não no `app.ts`), **placeholder único** até a Fase 9
  (removido no fim), **input `type="date"`** no período personalizado.
