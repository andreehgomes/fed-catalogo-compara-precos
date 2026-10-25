# Execução: Tema escuro — Fase 1 (tokens em variáveis CSS)

**Data:** 2026-10-25
**Plano:** [docs/plano/tema-escuro-plano.md](../plano/tema-escuro-plano.md) (só a Fase 1; a 4.1 — logos
escuras — foi feita antes, na mesma data)
**Branch:** main
**Executor:** Claude Code

---

## Resumo

Toda cor do app passou a sair de variáveis CSS: os valores ficam no mapa `$cp-cores`
(`nome: (claro, escuro)`) do `_tokens.scss`, cada `$cp-x` virou `var(--cp-x)` e o novo
`_tema.scss`, incluído só no `styles.scss`, declara `--cp-x: light-dark(claro, escuro)` no `:root`.
O `:root` segue com `color-scheme: light`, então o app está **idêntico** ao de antes (screenshot do
login igual byte a byte); forçar `color-scheme: dark` no `<html>` já mostra o escuro. O
`npm run contraste` confere os 56 pares nos dois temas. Nenhum SCSS de componente foi editado.

---

## Tarefas Executadas

| Fase | Tarefa | Status | Observações |
|------|--------|--------|-------------|
| 1.1 | Mapa claro/escuro em `_tokens.scss` | ✅ | 53 cores no mapa, valores do escuro da análise; aliases (`nav-*`, `cheaper`) seguem aliases; sombras montadas com as cores `sombra-*` |
| 1.2 | `_tema.scss` e `color-scheme` | ✅ | `@each` com `light-dark()`; `@use` em `styles.scss`; `color-scheme: light` saiu do `body` e foi para o `:root` |
| 1.3 | Contraste nos dois temas | ✅ | Lê o mapa (com CRLF normalizado e a última entrada sem vírgula, como o Prettier deixa); 56 pares × 2 temas; par novo `accent × bg` (foco); falha com código 1 conferida trocando um valor escuro |

---

## Discrepâncias do Plano

- **Sombras:** o plano previa 3 tokens de cor de sombra; ficaram 8 (`sombra-fina`, `-card`,
  `-painel`, `-hover`, `-segmented`, `-acento`, `-acento-fab`, `-forte`), um por opacidade já usada,
  porque `light-dark()` só aceita cor e não dá para aplicar opacidade sobre uma variável sem
  `color-mix`. `overlay` também entrou no mapa.
- **`shell-700` no escuro:** `#7fd3a3` (o mesmo do `accent-ink`). O único uso é a cor de ícone do
  botão de ação secundária sobre `surface`; o verde floresta original dava ~1,9:1 no escuro.
- **Comentários do mapa acima de cada entrada:** o Prettier move comentário de fim de linha para a
  linha seguinte dentro de mapa Sass, o que os fazia descrever o token errado.
- **`%NS%` do Angular:** o compilador reescreve `var(--cp-x)` dos estilos de componente como
  `var(--%NS%cp-x)`. Conferido no `@angular/platform-browser`: o namespace é vazio salvo com
  `provideCssVarNamespacing`, que o app não usa. Registrado no CLAUDE.md.
- **CLAUDE.md atualizado já nesta fase** (previsto para a 6.2) só nas linhas de tokens e contraste,
  que tinham ficado desatualizadas.
- **Budget:** initial total de 494,09 kB → 498,58 kB (aviso em 500 kB): o `styles` foi de 23,28 kB
  para 27,78 kB (bloco de variáveis + `var()` mais longo que hex). Nota de risco acrescentada na
  tarefa 3.2 do plano.

---

## Análise de Lint

```
npm run lint
Linting "fed-catalogo-compara-precos"...
All files pass linting.
(stylelint sem erros)
```

Prettier: `_tokens.scss`, `_tema.scss`, `styles.scss` e `scripts/contraste.mjs` formatados.

## Testes e build

- `npm run test:ci`: verde (Statements 94,23 %, Branches 90,85 %).
- `npm run contraste`: "56 pares aprovados em WCAG AA nos temas claro e escuro."
- `ng build -c production`: sem aviso de budget; `main` 252,03 kB (igual), `styles` 27,78 kB.
  O bloco `--cp-*` aparece só no `styles-*.css` e no CSS crítico inlinado no `index.html`, nunca nos
  chunks de componente.
- Visual: `/login` dos builds antes/depois servidos pelo Playwright → PNG idênticos; com
  `color-scheme: dark` forçado, fundo, card, campos, botões e links escuros e legíveis (a logo ainda é
  a clara, tarefa 4.2).

## Boas Práticas Angular 22

| Critério | Status |
|----------|--------|
| OnPush em todos os componentes | ✅ (nenhum componente alterado) |
| inject() sem construtor | ✅ (n/a) |
| takeUntilDestroyed() | ✅ (n/a) |
| track em @for | ✅ (n/a) |
| loading="lazy" em imagens | ✅ (n/a) |
| Sem any implícito | ✅ (n/a) |

---

## Critérios de Aceitação (Fase 1)

- ✅ 1.1 — `npm run lint` passa; `ng build -c production` compila; nenhum componente editado.
- ✅ 1.2 — `--cp-bg` resolve para `light-dark(…)`; forçar `color-scheme: dark` escurece fundo e
  textos; o CSS dos componentes só usa as variáveis; nenhum aviso de `anyComponentStyle`.
- ✅ 1.3 — o contraste lista os dois temas e passa; um valor escuro ruim faz o script falhar.

---

## Arquivos Criados/Modificados

```
src/app/shared/style/_tokens.scss   (modificado: mapa $cp-cores, $cp-x: var(--cp-x), sombras)
src/app/shared/style/_tema.scss     (novo)
src/styles.scss                     (@use tema; sem color-scheme no body)
scripts/contraste.mjs               (dois temas)
CLAUDE.md                           (tokens e contraste)
docs/plano/tema-escuro-plano.md     (Fase 1 marcada; nota de budget na 3.2)
docs/execucao/2026-10-25-tema-escuro-plano.md (este registro)
```
