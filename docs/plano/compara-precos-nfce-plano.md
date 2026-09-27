# Plano de Desenvolvimento: Compara Preços (NFC-e + Menor Preço)

**Data:** 27/09/2026
**Projeto:** fed-catalogo-compara-precos (projeto novo, ainda sem `package.json`)
**Análise base:** [docs/analise/compara-precos-nfce-analise.md](../analise/compara-precos-nfce-analise.md)
**Branch alvo:** `main` (a pasta ainda não é repositório git; `git init` na Tarefa 1.1)

---

## Visão Geral

O app Angular 22 lê o **QR Code** do cupom de supermercado (NFC-e do Paraná) e
importa estabelecimento, itens e preços pela página pública da SEFAZ-PR, que as
Firebase Functions buscam e interpretam. As notas ficam **isoladas por usuário**
em `usuarios/{uid}/notas`. Os preços alimentam uma **base compartilhada e
anônima** (`produtos`, `estabelecimentos`, `precos`), que só as Functions gravam.
Quando o portal está fora do ar (situação observada em 27/09/2026), a nota entra
numa **fila de pendentes** com retry agendado.

A comparação tem uma segunda fonte, a API pública do **Menor Preço (Nota Paraná)**,
chamada direto do navegador. Com ela o usuário busca o preço de um produto (por
código de barras ou por texto) nos mercados perto dele, e cada item das notas
importadas mostra se havia opção mais barata na região.

O visual repete a **estrutura** do design system do `fed-catalogo-confeccoes`
(tokens, classes globais, mixins parametrizados, shell com rail e drawer, Instrument
Sans, Material Symbols, M3) com prefixo `cp` e **paleta verde**. O resultado é um
app mobile-first, publicado no Firebase Hosting, em que a parte que não depende da
SEFAZ (Fases 1–5) já é útil sozinha.

### Organização deste plano

Este arquivo é o **índice**. Cada fase tem um arquivo próprio com as tarefas
detalhadas, para ser executado com `/executar-plano docs/plano/compara-precos-nfce-fase-N.md`.
Para rodar **todas as fases de uma vez, sem acompanhamento**, use
[compara-precos-nfce-executar-tudo.md](./compara-precos-nfce-executar-tudo.md).

| Fase | Arquivo | Entrega | Depende da SEFAZ? |
|---|---|---|---|
| 1 | [Fundação do repositório](./compara-precos-nfce-fase-1.md) | Angular 22 + tooling + `shared/` + CLAUDE.md | não |
| 2 | [Design system "Compara Preços"](./compara-precos-nfce-fase-2.md) | tokens `$cp-*`, classes globais, M3 verde | não |
| 3 | [Domínio puro](./compara-precos-nfce-fase-3.md) | chave, GTIN, normalização, similaridade, geohash, modelos | não |
| 4 | [Firebase, autenticação e shell](./compara-precos-nfce-fase-4.md) | SDK modular, Auth, guards, shell, regras | não |
| 5 | [Preços da região (Menor Preço)](./compara-precos-nfce-fase-5.md) | scanner, localização, busca por EAN/texto | não |
| 6 | [Importação: backend](./compara-precos-nfce-fase-6.md) | Functions: fetch seguro, parser PR, gravação, fila | **sim** (Tarefa 6.3) |
| 7 | [Importação: front](./compara-precos-nfce-fase-7.md) | tela Importar, preview, pendentes | via Fase 6 |
| 8 | [Minhas notas](./compara-precos-nfce-fase-8.md) | lista, detalhe, excluir, "mais barato perto" | via Fase 6 |
| 9 | [Produtos, estabelecimentos e painel](./compara-precos-nfce-fase-9.md) | comparação na base própria, vínculo, painel | via Fase 6 |
| 10 | [Qualidade, CI e deploy](./compara-precos-nfce-fase-10.md) | e2e, Lighthouse, GitHub Actions, produção | não |

### Fora deste plano

- **Lista de compras (RF-22, RF-29).** A análise a marca como evolução e ela fica
  para um plano próprio depois do MVP.
- **Leitura de itens por foto/OCR do cupom.** Rejeitada em 27/09/2026 (análise, RF-04).
- **`NFeConsultaProtocolo4`** (exige certificado A1, não traz itens) e **outras UFs**.

---

## Convenções Obrigatórias

Viram o `CLAUDE.md` do projeto na Tarefa 1.6.

**Angular 22**
- Standalone em tudo, sem NgModules. **Zoneless** e **OnPush** são o padrão do v22
  e não devem ser desligados. Declarar `changeDetection: OnPush` explicitamente
  mesmo assim, porque o `/executar-plano` confere isso.
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
  template.

**Firebase**
- **Não usar `@angular/fire`**, que ainda não suporta o v22. SDK modular injetado por
  `InjectionToken` (`FIREBASE_AUTH`, `FIRESTORE`, `FUNCTIONS`).
- O cliente **nunca escreve** em coleções compartilhadas nem em `usuarios/{uid}/notas`.
  Toda escrita de nota ou preço passa por callable.

**Estilo (lição do confeccoes)**
- **Classe global primeiro** (`src/styles.scss`, `.cp-*`). Mixin só para o que é
  parametrizado. No SCSS do componente fica só o que é daquela tela.
- Cor só por token `$cp-*` de `_tokens.scss`. O stylelint bloqueia hex fora dele.
- Medir budget **no build**, nunca pelo tamanho do arquivo-fonte.
- Breakpoint em TS via `BreakpointService` (`matchMedia`), nunca `window.innerWidth`.

**Testes**
- Vitest no front e nas Functions. Fixtures reais em `functions/test/fixtures/` e
  `src/testing/fixtures/`. Nunca bater em SEFAZ ou Menor Preço de verdade num teste.
- **Sem Firebase Emulator Suite** (decisão do usuário, 27/09/2026). O `npm start`
  usa o projeto dv. Testes unitários mockam o SDK; as Functions acessam o Firestore
  por um repositório com fake em memória. O e2e roda contra o dv com usuário de
  teste e Functions/SEFAZ/Menor Preço interceptados. Regras e integração real são
  verificadas no dv por checklists manuais do usuário (`docs/qualidade/`).

---

## Pré-condições e bloqueios

| Item | Quem | Bloqueia |
|---|---|---|
| ✅ Projeto Firebase de produção `fed-catalogo-compara-precos` | feito em 27/09/2026 | — |
| ✅ Projeto Firebase de desenvolvimento `fed-catalogo-compara-precos-dv` (config na Tarefa 4.1) | feito em 27/09/2026 | — |
| Nos **dois** projetos: Auth (e-mail/senha), Firestore em **`southamerica-east1`** (a região não muda depois), API key restrita (dv com `localhost:4200`, prod sem) | **usuário** (console) | Tarefa 4.1 |
| Plano **Blaze** + alerta de orçamento **nos dois projetos** | **usuário** | Deploy das Functions no dv (Fase 6) e em prod (Fase 10) |
| ✅ App Check: chave reCAPTCHA Enterprise criada e registrada **nos dois projetos** (chaves na Tarefa 6.7) | feito em 27/09/2026 | — |
| ✅ API key restrita: dv (`localhost:4200` + domínios do dv) e prod (só domínios de prod) | feito em 27/09/2026 | — |
| **Debug token** do App Check registrado no dv para o `localhost` | **usuário**, na execução da 6.7 (o token só existe depois que o app roda) | Tarefa 6.7 |
| **Portal SEFAZ-PR voltar ao ar** | externo | **Tarefa 6.3** (parser) e tudo que precisa de nota real. O restante da Fase 6 anda com as fixtures de erro já salvas |
| ✅ Repositório GitHub `andreehgomes/fed-catalogo-compara-precos` | feito em 27/09/2026 (vazio) | — |

---

## Estrutura Final de Arquivos

```
fed-catalogo-compara-precos/
├── CLAUDE.md                                        [1.6]
├── package.json · angular.json · tsconfig*.json     [1.1–1.3]
├── eslint.config.js · .prettierrc · .stylelintrc.json [1.2]
├── vitest-base.config.ts                            [1.3]
├── playwright.config.ts · e2e/                      [1.3, 10.1]
├── firebase.json · .firebaserc                      [4.1]
├── firestore.rules · firestore.indexes.json         [4.6, 8.1, 9.1]
├── .github/workflows/ci.yml · deploy.yml            [10.3]
├── scripts/contraste.mjs                            [2.5]
├── scripts/anonimizar-fixture.mjs                   [6.3]
├── scripts/gerar-municipios-pr.mjs                  [5.4]
├── ngsw-config.json · public/manifest.webmanifest   [10.4]
├── docs/{analise,plano,execucao}/
├── shared/                                          [1.4, 3.x]
│   ├── chave-acesso.ts · gtin.ts · normalizar.ts
│   ├── similaridade.ts · geohash.ts · unidade.ts
│   ├── model.ts
│   └── *.spec.ts
├── functions/                                       [6.x]
│   ├── package.json · tsconfig.json · vitest.config.ts
│   ├── src/index.ts
│   ├── src/importar/{fetch-sefaz,classificar-resposta,allowlist,
│   │                 preview-nfce,confirmar-nfce,publicar-precos,rate-limit}.ts
│   ├── src/pendentes/{enfileirar,reprocessar-pendentes}.ts
│   ├── src/parsers/{index,pr}.ts
│   ├── src/produtos/vincular-produto.ts             [9.4]
│   └── test/{fixtures/*.html, *.spec.ts}
└── src/
    ├── index.html · main.ts · styles.scss           [1.1, 2.x]
    ├── environments/environment{,.prod}.ts          [4.1]
    ├── testing/fixtures/menor-preco/*.json          [5.1]
    ├── assets/data/municipios-pr.json               [5.4]
    └── app/
        ├── app.config.ts · app.routes.ts            [1.1, 4.x]
        ├── app.ts · app.html · app.scss (shell)     [4.5]
        ├── core/
        │   ├── firebase/firebase.providers.ts       [4.2]
        │   ├── auth/{auth.store,auth.guards}.ts     [4.3]
        │   └── layout/breakpoint.service.ts         [4.5]
        ├── shared/
        │   ├── style/_tokens.scss · _mixins.scss · _breakpoints.scss [2.x]
        │   ├── ui/{preco,badge-preco,empty-state,fonte-preco}/ [2.4]
        │   ├── ui/scanner/                          [5.3]
        │   ├── ui/confirm-dialog/                   [8.3]
        │   ├── ui/grafico-historico/                [9.3]
        │   └── pipes/brl.pipe.ts                    [2.4]
        └── features/
            ├── auth/{login,cadastro,redefinir-senha}/ [4.4]
            ├── erro/                                [4.5]
            ├── regiao/                              [5.x]
            ├── importar/                            [7.x]
            ├── notas/                               [8.x]
            ├── produtos/ · estabelecimentos/        [9.x]
            └── painel/                              [9.6]
```

---

## Ordem de Execução Recomendada

```
Fase 1 ──► Fase 2 ──┐
   │                ├──► Fase 4 ──► Fase 5 ─────────────────────────┐
   └──► Fase 3 ─────┘       │                                       │
                            └──► Fase 6 ──► Fase 7 ──► Fase 8 ──► Fase 9 ──► Fase 10
                                  │
                                  └─ 6.3 (parser) ⛔ espera a SEFAZ-PR voltar;
                                     6.1/6.2/6.4–6.8 seguem com fixtures
```

- As Fases 2 e 3 são independentes entre si e podem correr em paralelo depois da 1.
- A Fase 5 (Menor Preço) **não depende da SEFAZ**. Ela vem antes da importação
  justamente para entregar valor enquanto o portal estiver instável, e porque
  cria o `<cp-scanner>` que a Fase 7 reaproveita.
- A Tarefa 6.3 é a única com bloqueio externo. Se a SEFAZ continuar fora quando a
  Fase 6 começar, execute o resto da fase e deixe 6.3 e o fluxo de confirmação
  real para quando o portal voltar. A fila de pendentes (6.6) cobre o usuário
  nesse intervalo.

---

## Critérios de Aceitação Globais

Consolidados da análise (seção 7). Cada fase repete os seus.

**Fundação e DS**
- [ ] `ng build --configuration=production` sem `zone.js` no bundle e sem aviso de budget.
- [ ] `npm run lint`, `npm test` e `npm run e2e` verdes.
- [ ] Shell com rail de 76px, expandida de 264px e drawer abaixo de 900px; scroll interno em `.cp-content`.
- [ ] `node scripts/contraste.mjs` aprova todos os pares texto/superfície em AA.
- [ ] Nenhuma cor literal fora de `_tokens.scss` (stylelint).

**Importação**
- [ ] QR de cupom real do PR, lido pela câmera, pela galeria ou colado como URL, gera pré-visualização idêntica ao cupom impresso.
- [ ] Chave com DV inválido é rejeitada no front, sem chamar a function.
- [ ] URL fora da allowlist, inclusive via redirect, é rejeitada pela function.
- [ ] Reimportar a mesma chave não duplica a nota do usuário nem os preços da base.
- [ ] Com a SEFAZ simulada fora do ar, a nota vira "Aguardando SEFAZ-PR" e é importada sozinha quando o portal volta.
- [ ] Nenhum documento do Firestore contém CPF do consumidor, coordenadas ou geohash.

**Isolamento e segurança**
- [ ] Usuário A não lê nem exclui notas do usuário B (checklist do Rules Playground no dv).
- [ ] Nenhum cliente escreve em `produtos`, `precos` ou `estabelecimentos` (checklist do Rules Playground no dv).
- [ ] `precos` não carrega `uid` nem chave da nota.
- [ ] A 31ª importação na mesma hora é recusada com mensagem amigável.

**Comparação**
- [ ] Produto com EAN comprado em 2 mercados mostra os dois preços, com menor, médio e maior.
- [ ] Produto sem EAN pode ser vinculado, e a comparação passa a considerar os dois.
- [ ] Preço por unidade (R$/kg, R$/L) aparece quando a descrição traz o conteúdo.
- [ ] "Mais barato/mais caro" usa ícone + texto, não só cor.
- [ ] Busca por EAN no Menor Preço lista os mercados num raio de 2 km em até 3s, com divergentes ocultos.
- [ ] Repetir uma busca do Menor Preço em até 30 min não gera nova requisição.
- [ ] Menor Preço fora do ar mostra "indisponível agora" sem quebrar o resto do app.

**Qualidade**
- [ ] Lighthouse mobile: Performance ≥ 85 e Accessibility ≥ 95 no painel e na lista de notas.
- [ ] Scanner e gráfico fora do chunk inicial (conferido na saída do build).
- [ ] Cobertura ≥ 80% em `shared/`, `functions/src/parsers` e `functions/src/importar`.
