# Fase 2: Design system "Compara Preços"

**Plano:** [índice](./compara-precos-nfce-plano.md)
**Pré-requisito:** [Fase 1](./compara-precos-nfce-fase-1.md)
**Próxima fase:** [Fase 4](./compara-precos-nfce-fase-4.md) (a 3 pode correr em paralelo)

---

## Objetivo

Portar a **estrutura** do design system do `fed-catalogo-confeccoes` com prefixo
`cp` e paleta verde: tokens, classes globais, mixins parametrizados, breakpoints,
fontes, ícones e tema M3. A fase entrega também um script que prova o contraste AA
de cada par de cores.

**Origem (ler antes de começar):**
`../fed-catalogo-confeccoes/src/app/shared/style/_tokens.scss`,
`../fed-catalogo-confeccoes/src/styles.scss`,
`../fed-catalogo-confeccoes/src/app/shared/style/_admin-ui.scss`,
`../fed-catalogo-confeccoes/src/app/shared/style/_breakpoints.scss`,
`../fed-catalogo-confeccoes/docs/execucao/2026-09-11-redesign-como-repetir.md`.

**Regra desta fase:** porta-se **estrutura e nomes de papel**, não valores. Nada de
terracota ou plum sobrevive. Nada de domínio de loja (sacola, parceiro, comprovante).

---

### Tarefa 2.1: `_tokens.scss` verde

**Arquivo a criar:** `src/app/shared/style/_tokens.scss`

**O que fazer:** recriar as mesmas seções do confeccoes (acento, casca,
superfícies e bordas, rampa de texto, semânticas, tipografia, raio, sombra, layout,
transições) com prefixo `$cp-`. Ponto de partida da paleta (ajustar até passar na 2.5):

| Token | Valor inicial | Papel |
|---|---|---|
| `$cp-accent` | `#1f7a4d` | CTA, FAB, foco |
| `$cp-accent-ink` | `#16603b` | preço, link, valor sobre branco |
| `$cp-accent-soft` / `-border` / `-hover` | `#effaf3` / `#c6e8d3` / `#dff3e7` | chip, opção ativa |
| `$cp-shell-900/800/700` | `#0a2418` / `#0f3a26` / `#15502f` | casca (sidebar, login) |
| `$cp-gradient-shell` | `linear-gradient(168deg, 900 0%, 800 55%, 700 100%)` | sidebar |
| `$cp-bg` | `#f3f6f3` | tela |
| `$cp-surface` / `-input` / `-subtle` / `-track` | `#fff` / `#fafcfa` / `#f6f9f6` / `#e6ede7` | cards e campos |
| `$cp-border` / `-input` / `-divider` | `#dfe7e1` / `#d2ddd5` / `#e9efeb` | bordas |
| `$cp-text` … `$cp-text-disabled` | `#18211c` → `#3a4640` → `#5d6a63` → `#76837c` → `#8f9b94` → `#b3bdb7` | rampa |
| `$cp-cheaper` | = `$cp-accent-ink` | "mais barato" (+ ícone `trending_down`) |
| `$cp-pricier` / `-soft` | `#a51d13` / `#f8d7da` | "mais caro" (+ ícone `trending_up`) |
| `$cp-success` / `-soft` | `#0f6e6a` / `#e0f4f2` | **teal**, para não se confundir com o acento |
| `$cp-info` / `-soft` | `#3174da` / `#e3f2fd` | informativo |
| `$cp-warn` / `-soft` | `#a54600` / `#ffecb3` | "Aguardando SEFAZ", avisos |
| `$cp-danger-action` | `#d0281b` | excluir |

Manter os mesmos tokens de raio, sombra (recalcular o rgba da sombra do acento com o
verde), layout (`$cp-rail-width: 76px`, `$cp-nav-width: 264px`,
`$cp-breakpoint-narrow: 900px` etc.) e tipografia (`$cp-font` Instrument Sans).
Cada token leva comentário de papel, como no original.

**Critério:** nenhum valor do confeccoes (`#a34a33`, `#2a0b30`…) aparece no arquivo.
`node scripts/contraste.mjs` (2.5) passa.

---

### Tarefa 2.2: Breakpoints e mixins parametrizados

**Arquivos a criar:** `src/app/shared/style/_breakpoints.scss`,
`src/app/shared/style/_mixins.scss`

**O que fazer:**
1. `_breakpoints.scss`: cópia do confeccoes (`mobile` ≤599, `tablet-up`, `desktop`
   ≥1024) mais `narrow` (≤ `$cp-breakpoint-narrow`), usado pelo shell.
2. `_mixins.scss`: **só os parametrizados** que este app usa: `cp-grid($min)`,
   `cp-chip($ink, $bg)`, `cp-btn-icon-ghost(…)`, `cp-segmented`, `cp-card-clickable`.
   Não portar `ep-progress`, `ep-icon-block` ou `ep-value` enquanto nenhuma tela
   precisar deles.

**Critério:** os arquivos compilam com `@use '.../tokens' as *` e nenhum mixin
fica sem uso previsto em alguma fase.

---

### Tarefa 2.3: `styles.scss` com classes globais e tema M3

**Arquivo a modificar:** `src/styles.scss`, `src/index.html`

**O que fazer:**
1. Fontes no `index.html`: Instrument Sans e Material Symbols Rounded (mesmos
   `<link>` do confeccoes). **Sem Font Awesome**, porque não há glifo de marca aqui.
2. `ng add @angular/material` (22.2, sem tipografia global do Material). Tema **M3**
   com `mat.theme((color: (primary: <paleta verde>), typography: Instrument Sans,
   density: 0))` e `color-scheme: light`. Gerar a paleta customizada a partir de
   `#1f7a4d` com `ng generate @angular/material:theme-color` e salvar em
   `src/app/shared/style/_m3-palette.scss`.
3. Remapear `.material-icons` e `.material-symbols-rounded` para Material Symbols
   Rounded (mesma regra do confeccoes).
4. Portar as **classes globais**, renomeando `ep` → `cp`:

   ```
   .cp-page (+ --detalhe, --form)  .cp-page-header  .cp-detail-header
   .cp-block  .cp-section-top  .cp-section-title  .cp-label
   .cp-field (+ -compact, -prefix, -hint, -error)
   .cp-btn-primary (+ -compact)  .cp-btn-secondary  .cp-btn-ghost
   .cp-btn-danger  .cp-btn-icon
   .cp-card  .cp-empty-state  .cp-empty-inline  .cp-list  .cp-list-row
   .cp-summary  .cp-info-block  .cp-panel
   .cp-form-grid  .cp-form-actions  .cp-loading
   ```

   Deixar de fora `.ep-btn-plum`, `.ep-btn-success` e `.ep-expansion` (sem uso aqui).
5. Acrescentar as classes deste domínio:
   - `.cp-price` (valor, `font-variant-numeric: tabular-nums`, `$cp-accent-ink`);
   - `.cp-price-unit` (R$/kg, menor e em `$cp-text-muted`);
   - `.cp-source` (rótulo de fonte do preço, RF "fonte sempre identificada");
   - `.cp-status--aguardando` / `--falhou` (chips da fila de pendentes).
6. `:focus-visible` com anel de 2px `$cp-accent` e offset de 2px em botões, links e
   `.cp-list-row` clicável.

**Critério:** uma página de teste com todas as classes (criar temporariamente em
`/dev/ds`, remover no fim da fase) renderiza sem estilo quebrado. O build passa
sem aviso de budget.

---

### Tarefa 2.4: Componentes de apresentação base

**Arquivos a criar:** `src/app/shared/ui/preco/preco.ts`,
`src/app/shared/ui/badge-preco/badge-preco.ts`,
`src/app/shared/ui/fonte-preco/fonte-preco.ts`,
`src/app/shared/ui/empty-state/empty-state.ts`,
`src/app/shared/pipes/brl.pipe.ts` (+ `.spec.ts` de cada)

**O que fazer:**
- `<cp-preco [valor] [unidade]? [precoPorUnidade]?>`: formata BRL e, se houver, a
  linha R$/kg ou R$/L.
- `<cp-badge-preco [tipo]="'mais-barato' | 'mais-caro' | 'igual'" [diferenca]>`:
  **ícone + texto + cor** (RNF-09), por exemplo "R$ 1,20 mais barato".
- `<cp-fonte-preco [fonte]="'minhas-notas' | 'comunidade' | 'menor-preco'" [data]>`:
  "Menor Preço – Nota Paraná · há 3 dias".
- `<cp-empty-state [icone] [titulo]>` com `<ng-content>` para a ação.
- Pipe `brl` só se o `currency` padrão não bastar. Se bastar, não criar.

Todos com `input()` / `input.required()` e `OnPush`, e o estilo pelas classes globais.

**Critério:** testes Vitest renderizam cada componente e conferem texto e ícone. O
badge nunca depende só de cor (o teste checa a presença do texto).

---

### Tarefa 2.5: Script de contraste

**Arquivo a criar:** `scripts/contraste.mjs`, script `npm run contraste`

**O que fazer:** script Node, sem dependências, que lê os hex de `_tokens.scss` por
regex, calcula a razão de contraste WCAG 2.x para uma **lista explícita de pares**
(texto × superfície em uso: `text*` × `bg`/`surface`/`surface-subtle`, `accent-ink` ×
`surface`, branco × `accent`, branco × `shell-900..700`, `pricier` × `surface`,
`warn` × `warn-soft`, `success` × `success-soft`) e falha com `exit 1` se algum
par de texto ficar abaixo de 4.5:1 (ou de 3:1 para os marcados como "texto grande
ou ícone").

**Critério:** `npm run contraste` passa e imprime a tabela de pares. Rebaixar
`$cp-text-muted` para um cinza claro faz o script falhar.

---

## Critérios de Aceitação da Fase

- [ ] `_tokens.scss` é a única fonte de cor; o stylelint passa.
- [ ] `npm run contraste` aprova todos os pares.
- [ ] Classes globais `.cp-*` disponíveis, mais as de preço, fonte e status.
- [ ] Tema M3 verde aplicado (um `mat-button` de teste sai verde).
- [ ] Material Symbols Rounded carregando via `mat-icon`.
- [ ] Componentes `preco`, `badge-preco`, `fonte-preco` e `empty-state` testados.
- [ ] `ng build --configuration=production` sem aviso de budget.
- [ ] `CLAUDE.md` com a seção **Theming** preenchida (tokens, classes, mixins e a regra "classe global primeiro").
