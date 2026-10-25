# Plano de Desenvolvimento: Modelo de IA configurável pelo app (por chamada)

**Data:** 25/10/2026
**Projeto:** fed-catalogo-compara-precos (Cupom Esperto)
**Análise base:** sem análise dedicada. Parte de [nome-produto-ia-plano.md](nome-produto-ia-plano.md)
(D-10) e da medição no dv de 25/10/2026.
**Branch alvo:** `main`

---

## Visão Geral

Hoje o modelo da Claude API é uma constante em `functions/src/vinculo/config-ia.ts`
(`IA_MODELO = 'claude-opus-5-5'`, `IA_MODELO_NOME = IA_MODELO`): trocar exige editar o código e
publicar. No dv, a prévia de uma nota com 92 produtos novos levou **29 s** (26 s na IA de nome),
e o usuário quer poder testar modelos mais rápidos sem deploy.

O que será construído: um documento `controle/configIa` com o modelo de **cada chamada**
(`modeloNome` — nome legível; `modeloVinculo` — vínculo entre produtos), lido pelas Functions com
cache curto; uma lista fechada de modelos no código, cada um com preço e parâmetros certos; duas
callables só para administradores (ler e gravar a configuração); e a tela **Configurações de IA**
no app, visível só para o administrador, com os dois seletores e o gasto do mês por etapa.

### Decisões

| # | Decisão |
|---|---|
| D-01 | **Por chamada** (decisão do usuário): `modeloNome` e `modeloVinculo` independentes. |
| D-02 | **Lista fechada no código** (`functions/src/ia/modelos.ts`): `claude-opus-5-5` (US$ 4 / 20 por MTok), `claude-sonnet-5-5` (US$ 2 / 10), `claude-haiku-5-5` (US$ 0,10 / 0,50 até 100K de entrada). Cada um com `fallback: boolean` — Opus 5.5 e Sonnet 5.5 recebem `betas: ['server-side-fallback-2026-07-01']` + `fallbacks: 'default'`; **o Haiku 5.5 não tem fallback server-side em recusa** (os dois campos são omitidos). `effort: 'low'` nos três. Conferir ids, preços e parâmetros na skill `claude-api` antes de codificar. |
| D-03 | **Onde fica:** `controle/configIa` = `{ modeloNome, modeloVinculo, atualizadoEm }` (sem uid). O cliente não lê nem grava (regra `/{document=**}` já fecha). Ausente ou com id fora da lista → **padrão Opus 5.5** (comportamento de hoje). |
| D-04 | **Leitura nas Functions:** `obterModelos(ctx)` com cache em memória da instância por **60 s**; a troca vale em até 1 min sem deploy. Falha de leitura → padrão, sem derrubar a importação. |
| D-05 | **Custo pelo modelo usado:** `custoUsd(uso, modelo)` com o preço da lista. O gasto continua em `controle/ia_AAAA-MM`, por etapa. |
| D-06 | **Quem pode trocar:** parâmetro `ADMIN_UIDS` (`defineList` de `firebase-functions/params`) em `functions/.env.fed-catalogo-compara-precos-dv` e `functions/.env.fed-catalogo-compara-precos` (versionados: uid não é segredo). As callables `obterConfigIa` e `definirConfigIa` respondem `{ ok: false, erro: { codigo: 'nao-autorizado' } }` para quem não está na lista. |
| D-07 | **Como o front sabe que é admin:** `environment.adminUids` (só para **mostrar** o item do menu e a rota; a segurança é a callable). Um `adminGuard` funcional protege `/configuracoes/ia`. Sem custom claims (exigiriam script com Admin SDK). |
| D-08 | **Logs com o modelo:** os registros das etapas `nome` e `vinculo` ganham `modelo` (id da lista; não é dado pessoal). |
| D-09 | **Retroativo:** o script `reprocessar-vinculos` lê o mesmo `controle/configIa` e aceita `--modelo-nome=` / `--modelo-vinculo=` para testar sem gravar a config. |
| D-10 | **Medição de apoio:** a tarefa 2.3 do plano nome-produto-ia (`scripts/avaliar-ia-nome.ts`, Haiku × Sonnet × Opus) entra aqui como fase 5, para orientar a escolha na tela. |

---

## Convenções Obrigatórias

- **Functions:** regras de negócio recebem o `Contexto`; Firestore só por `dados/repositorio.ts`,
  testado com `RepositorioMemoria`; **nenhum teste chama a Claude API**. Callables respondem
  `{ ok: true, … }` / `{ ok: false, erro }`, com `OPCOES_CALLABLE` (App Check).
- O cliente nunca escreve em coleções compartilhadas: a configuração passa por callable.
- Log sem dado pessoal (sem uid, CNPJ, descrição).
- **Angular 22:** standalone, `inject()`, signals (`resource` para a leitura), `OnPush` explícito,
  `@if`/`@for` com `track`, Signal Forms nos seletores, rota `loadComponent` com guard funcional
  (`CanActivateFn`), textos pt-BR no template.
- Classe global primeiro (`.cp-page`, `.cp-card`, `.cp-field`, `.cp-segmented`, `.cp-summary`);
  cor só por token; ícone novo no `icon_names=` do `index.html`.
- `firebase deploy` e `git push` ficam com o usuário.

---

## Pré-condições

1. O uid do administrador no dv e na produção (Firebase Console → Authentication).
2. Deploy pelo usuário depois das fases 1 e 2 (`npm run deploy:functions:dev`).

---

## Fases de Implementação

### Fase 1 — Modelos e leitura da configuração (Functions)

**Objetivo:** as duas chamadas usam o modelo do documento, com preço e parâmetros certos.

#### Tarefa 1.1 — Lista de modelos

**Arquivo(s) a criar:** `functions/src/ia/modelos.ts`, `functions/test/modelos-ia.spec.ts`
**Arquivo(s) a modificar:** `functions/src/vinculo/config-ia.ts`, `shared/model.ts`

**O que fazer:** `MODELOS_IA` (id, rótulo, preço por MTok, `fallback`), `MODELO_PADRAO =
'claude-opus-5-5'`, `modeloValido(id)` e `parametrosDoModelo(id)` (devolve `{ model, betas?,
fallbacks?, output_config.effort }`). Em `shared/model.ts`: `IdModeloIa`, `ConfigIa { modeloNome;
modeloVinculo }` e as respostas das callables (o front mostra a mesma lista; os rótulos e preços
podem ficar em `shared/modelos-ia.ts`, TS puro, para os dois lados). `config-ia.ts` perde
`IA_MODELO`, `IA_MODELO_NOME` e `IA_USD_POR_MTOK`.

**Critério:** spec confere que só Opus e Sonnet recebem `fallbacks`, que um id desconhecido cai no
padrão e o preço de cada um.

#### Tarefa 1.2 — Clientes por modelo e custo pelo modelo

**Arquivo(s) a modificar:** `functions/src/vinculo/ia.ts`, `functions/src/nome/ia-nome.ts`,
`functions/test/vinculo-ia.spec.ts`, `functions/test/ia-nome.spec.ts`

**O que fazer:** `ClassificarVinculos` e `NormalizarNomes` passam a receber o modelo
(`(itens, modelo) => …`); `criarClassificador`/`criarNormalizador` montam o pedido com
`parametrosDoModelo(modelo)`. `custoUsd(uso, modelo)`.

**Critério:** testes de tradução e custo passam com os três modelos; nenhuma chamada real.

#### Tarefa 1.3 — `obterModelos` com cache de 60 s

**Arquivo(s) a criar:** `functions/src/ia/config-ia-firestore.ts`, `functions/test/config-ia.spec.ts`
**Arquivo(s) a modificar:** `functions/src/nome/nomear-itens.ts`, `functions/src/vinculo/vincular-nota.ts`,
`functions/src/importar/log.ts`

**O que fazer:** `obterModelos(ctx): Promise<ConfigIa>` lê `controle/configIa` (D-03/D-04) com cache
por instância (`agora` do `Contexto`, para os testes). `nomearItens` e `vincularNota` pegam o modelo
dali e põem `modelo` no log (D-08).

**Critério:** com o documento ausente usa Opus; com `modeloNome: 'claude-haiku-5-5'` o fake recebe
Haiku; trocar o documento só vale depois de 60 s; leitura que falha usa o padrão.

---

### Fase 2 — Callables de administrador

**Objetivo:** ler e gravar a configuração com segurança.

#### Tarefa 2.1 — `ADMIN_UIDS` e as callables

**Arquivo(s) a criar:** `functions/src/ia/configurar-ia.ts`, `functions/test/configurar-ia.spec.ts`,
`functions/.env.fed-catalogo-compara-precos-dv`, `functions/.env.fed-catalogo-compara-precos`
**Arquivo(s) a modificar:** `functions/src/config.ts`, `functions/src/index.ts`

**O que fazer:** `ADMIN_UIDS = defineList('ADMIN_UIDS')`. `executarObterConfigIa(uid, admins, ctx)` →
`{ ok: true, config, modelos, gasto }` (gasto = `controle/ia_AAAA-MM`). `executarDefinirConfigIa(uid,
admins, entrada, ctx)` valida os dois ids pela lista, grava `controle/configIa` e **zera o cache da
instância** (as outras instâncias pegam em até 60 s). Erros: `nao-autorizado`, `modelo-invalido`.
Log `etapa: 'config-ia'` só com os ids.

**Critério:** uid fora da lista é recusado nas duas; id fora da lista é recusado sem gravar; gravar
muda o modelo usado na próxima importação da mesma instância.

---

### Fase 3 — Tela Configurações de IA

**Objetivo:** o administrador troca os modelos pelo app.

#### Tarefa 3.1 — Admin no front

**Arquivo(s) a modificar:** `src/environments/environment.ts`, `src/environments/environment.prod.ts`,
`src/app/core/auth/auth.store.ts` (computed `admin`), `src/app/core/layout/shell.ts` (item
"Configurações de IA" só para admin), `src/app/app.routes.ts`
**Arquivo(s) a criar:** `src/app/core/auth/admin.guard.ts`

**O que fazer:** D-07. Rota `configuracoes/ia` com `loadComponent` e `adminGuard` (espera
`pronto()`, não admin → `/`). O FAB e o restante do menu não mudam para quem não é admin.

**Critério:** shell.spec: o item só aparece para o uid admin; guard nega e redireciona os outros.

#### Tarefa 3.2 — Página

**Arquivo(s) a criar:** `src/app/features/configuracoes/configuracoes-ia.page.ts` (+ `.html`/`.scss`
se precisar), `src/app/features/configuracoes/data-access/config-ia.service.ts`,
`src/app/features/configuracoes/configuracoes-ia.spec.ts`

**O que fazer:** `ConfigIaService` (callables via `CHAMAR_FUNCTION`). Página com `resource` da
leitura; dois blocos ("Nome legível dos produtos", "Vínculo entre produtos"), cada um com um
seletor (`.cp-segmented` ou `<select class="cp-field">`) mostrando rótulo, preço por MTok, "mais
rápido/mais preciso" e um aviso quando o modelo não tem fallback em recusa; botão "Salvar";
snackbar "Configuração salva. Vale em até 1 minuto."; resumo do gasto do mês por etapa
(`.cp-summary`).

**Critério:** spec com o service falso: carrega a config atual, salvar chama `definirConfigIa` com
os dois ids, erro `nao-autorizado` mostra aviso; lint e contraste passam.

---

### Fase 4 — Retroativo

#### Tarefa 4.1 — Script usa a configuração

**Arquivo(s) a modificar:** `functions/scripts/reprocessar-vinculos.ts`

**O que fazer:** D-09. Lê `controle/configIa`; `--modelo-nome=<id>` e `--modelo-vinculo=<id>`
sobrepõem (validados pela lista); imprime os modelos usados no cabeçalho da saída.

**Critério:** `--simular --com-ia --modelo-nome=claude-haiku-5-5` roda com Haiku e mostra o custo pelo
preço do Haiku.

---

### Fase 5 — Medição de apoio (manual)

#### Tarefa 5.1 — `avaliar-ia-nome.ts`

**Arquivo(s) a criar:** `functions/scripts/avaliar-ia-nome.ts`

**O que fazer:** a tarefa 2.3 do plano nome-produto-ia, agora com os três modelos da lista: mesmas
descrições (gabarito do Menor Preço e produtos do dv), tempo por parte de 40, custo, blocos
coincidentes dentro do mesmo GTIN e 30 nomes lado a lado. Roda fora do `npm test` (custa centavos).

**Critério:** saída colada na execução, com a recomendação de modelo por chamada.

---

### Fase 6 — Qualidade e documentação

#### Tarefa 6.1 — Checklist e CLAUDE.md

**Arquivo(s) a modificar:** `docs/qualidade/functions-dv-checklist.md`, `CLAUDE.md`

**O que fazer:** checklist: trocar o modelo de nome para Haiku na tela, importar uma nota e ver
`modelo: 'claude-haiku-5-5'` no log `nome` e o tempo da prévia; voltar para Opus; uid não admin não
vê o item. CLAUDE.md: `controle/configIa`, `obterModelos`, lista de modelos, callables de admin,
`ADMIN_UIDS`, tela e guard.

**Critério:** `npm run lint`, `npm run test:ci`, `npm --prefix functions test`, typecheck, build das
Functions e `ng build --configuration=production` passam, dentro do budget.

---

## Estrutura Final de Arquivos

```
shared/
├── model.ts                                       (1.1) IdModeloIa, ConfigIa, respostas
└── modelos-ia.ts                                  (1.1) rótulos e preços (front + Functions)
functions/
├── .env.fed-catalogo-compara-precos-dv            (2.1) ADMIN_UIDS
├── .env.fed-catalogo-compara-precos               (2.1) ADMIN_UIDS
├── src/
│   ├── ia/modelos.ts                              (1.1) lista, parâmetros por modelo
│   ├── ia/config-ia-firestore.ts                  (1.3) obterModelos + cache
│   ├── ia/configurar-ia.ts                        (2.1) callables de admin
│   ├── vinculo/config-ia.ts                       (1.1) sem constantes de modelo
│   ├── vinculo/ia.ts                              (1.2) modelo por chamada, custo
│   ├── vinculo/vincular-nota.ts                   (1.3) modelo da config, log
│   ├── nome/ia-nome.ts                            (1.2)
│   ├── nome/nomear-itens.ts                       (1.3)
│   ├── importar/log.ts                            (1.3, 2.1) modelo, etapa config-ia
│   ├── config.ts                                  (2.1) ADMIN_UIDS
│   └── index.ts                                   (2.1)
├── scripts/
│   ├── reprocessar-vinculos.ts                    (4.1)
│   └── avaliar-ia-nome.ts                         (5.1) novo
└── test/ modelos-ia, config-ia, configurar-ia     (1.x, 2.1) novos
src/
├── environments/environment(.prod).ts             (3.1) adminUids
└── app/
    ├── app.routes.ts                              (3.1)
    ├── core/auth/auth.store.ts, admin.guard.ts    (3.1)
    ├── core/layout/shell.ts                       (3.1)
    └── features/configuracoes/                    (3.2) página, service, spec
docs/qualidade/functions-dv-checklist.md, CLAUDE.md (6.1)
```

---

## Ordem de Execução Recomendada

```
1.1 ── 1.2 ── 1.3 ── 2.1 ──► (deploy dv)
                      │
                      ├── 3.1 ── 3.2
                      └── 4.1
5.1 (manual, a qualquer momento depois da 1.2)
6.1 por último
```

---

## Critérios de Aceitação Globais

- [ ] Sem `controle/configIa`, tudo funciona como hoje (Opus 5.5 nas duas chamadas).
- [ ] O administrador troca o modelo de nome para Haiku na tela e, em até 1 minuto, a próxima
      prévia usa Haiku (log `nome` com `modelo: 'claude-haiku-5-5'`), sem deploy.
- [ ] Nome e vínculo podem usar modelos diferentes.
- [ ] Haiku é chamado sem `betas`/`fallbacks`; Opus e Sonnet com o fallback.
- [ ] O custo em `controle/ia_AAAA-MM` usa o preço do modelo usado.
- [ ] Quem não é admin não vê o item, não abre a rota e recebe `nao-autorizado` nas callables.
- [ ] Id fora da lista nunca é gravado nem usado.
- [ ] Nenhum teste chama a Claude API; lint, testes, typecheck e builds passam.
