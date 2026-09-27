# Execução: Fase 2 — Design system "Compara Preços"

**Data:** 2026-09-27
**Plano:** docs/plano/compara-precos-nfce-fase-2.md (via `compara-precos-nfce-executar-tudo.md`)
**Branch:** main
**Executor:** Claude Code

---

## Resumo

Estrutura do DS do confeccoes portada com prefixo `cp` e paleta verde: tokens,
breakpoints, mixins parametrizados, classes globais (incluindo preço, fonte, badge e
status), tema M3 verde, Instrument Sans + Material Symbols Rounded, quatro componentes
de apresentação testados e o script de contraste AA.

---

## Tarefas Executadas

| Fase | Tarefa | Status | Observações |
|------|--------|--------|-------------|
| 2.1 | `_tokens.scss` verde | ✅ | Seções do original com `$cp-`. Nenhum valor terracota/plum. Acrescentados `$cp-on-shell`, `$cp-on-shell-muted`, `$cp-overlay`, `$cp-header-height`, `$cp-touch-target` |
| 2.2 | Breakpoints e mixins | ✅ | `mobile`, `tablet-up`, `desktop` + `narrow`/`wide`. Mixins `cp-grid`, `cp-chip`, `cp-btn-icon-ghost`, `cp-segmented`, `cp-card-clickable` |
| 2.3 | `styles.scss` + M3 | ✅ | `ng add @angular/material` (22.2), paleta de `#1f7a4d` em `_m3-palette.scss`, classes globais portadas + domínio, `:focus-visible` 2px acento. Página `/dev/ds` criada, conferida em screenshot (botões, campos, lista, badges, chips, empty state, `mat-flat-button` verde) e removida |
| 2.4 | Componentes base | ✅ | `cp-preco`, `cp-badge-preco`, `cp-fonte-preco` (+ `haQuantoTempo`), `cp-empty-state`. Pipe `brl` **não criado** (o `currency` com `LOCALE_ID`/`DEFAULT_CURRENCY_CODE` basta) |
| 2.5 | Script de contraste | ✅ | `npm run contraste`: 43 pares aprovados. Com `$cp-text-muted` rebaixado para `#b3bdb7`, 4 pares falham e o script sai com código 1 |

---

## Discrepâncias do Plano

- **Rampa de texto ajustada para passar em AA:** a sugestão do plano (`#76837c`,
  `#8f9b94` como texto) não passa 4.5:1 sobre `$cp-bg`. Ficou: `text-muted #5d6a63`,
  `text-label #5f6c65` (rótulo de 10px precisa de AA), `text-placeholder #76837c`
  (3:1) e `text-disabled #8f9b94` (só ícone desabilitado, isento pela WCAG 1.4.3).
- **`$cp-info`** passou de `#3174da` (4.4:1 sobre branco) para `#2a65c2`.
- **Componente de fonte** chama-se `FontePrecoInfo` e o tipo local `FonteDoPreco`,
  para não colidir com o tipo `FontePreco` de `shared/model.ts` (Fase 3).
- **Providers globais de teste:** `src/testing/providers.ts` (`providersFile` no
  target `test`) fornece `LOCALE_ID` e `DEFAULT_CURRENCY_CODE` a todos os specs.
- Stylelint: `--fix` alinhou os `$token: valor` (o padrão SCSS não aceita colunas
  alinhadas).

---

## Análise de Lint

```
npm run lint → All files pass linting. (stylelint sem erros)
npm run contraste → 43 pares aprovados em WCAG AA.
```

## Verificações

```
npm run test:ci → 5 arquivos, 14 testes verdes
ng build -c production → main 212.50 kB + styles 19.96 kB (initial 232.46 kB), sem aviso de budget
```

## Boas Práticas Angular 20

| Critério | Status |
|----------|--------|
| OnPush em todos os componentes | ✅ |
| inject() sem construtor | ✅ |
| takeUntilDestroyed() | ✅ (nenhuma subscription) |
| trackBy/track em @for | ✅ (nenhum @for) |
| loading="lazy" em imagens | ✅ (nenhuma imagem) |
| Sem any implícito | ✅ |

---

## Critérios de Aceitação

- ✅ `_tokens.scss` é a única fonte de cor; o stylelint passa.
- ✅ `npm run contraste` aprova todos os pares.
- ✅ Classes globais `.cp-*` disponíveis, mais as de preço, fonte e status.
- ✅ Tema M3 verde aplicado (o `mat-flat-button` da página de teste saiu verde).
- ✅ Material Symbols Rounded carregando via `mat-icon`.
- ✅ Componentes `preco`, `badge-preco`, `fonte-preco` e `empty-state` testados.
- ✅ `ng build --configuration=production` sem aviso de budget.
- ✅ `CLAUDE.md` com a seção **Theming** preenchida.

---

## Arquivos Criados/Modificados

```
src/app/shared/style/_tokens.scss _breakpoints.scss _mixins.scss _m3-palette.scss
src/styles.scss src/index.html
src/app/shared/ui/{preco,badge-preco,fonte-preco,empty-state}/*.ts (+ specs)
src/testing/providers.ts
scripts/contraste.mjs
package.json angular.json .stylelintrc.json .claude/launch.json CLAUDE.md
```
