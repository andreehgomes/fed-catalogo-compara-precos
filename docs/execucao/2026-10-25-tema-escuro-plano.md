# Execução: Tema escuro (Fases 1 a 6)

**Data:** 2026-10-25
**Plano:** [docs/plano/tema-escuro-plano.md](../plano/tema-escuro-plano.md)
**Branch:** main (commits locais, sem push: `f3c81b5` Fase 1 + análise/plano/logos, `a26fd75` Fase 2,
`f5edfe8` Fases 3 e 4.2, `d3146ec` Fase 5 e o commit da Fase 6 com esta documentação)
**Executor:** Claude Code

---

## Resumo

O app ganhou tema escuro com três modos — **Sistema** (padrão), **Claro** e **Escuro** — escolhidos em
"Aparência", no menu do shell, e guardados por aparelho (`localStorage` `cp-tema`). Toda cor sai de
variáveis CSS (`$cp-x: var(--cp-x)`, pares no mapa `$cp-cores`, `light-dark()` no `:root`); o
`color-scheme` do `<html>` escolhe o lado, e o Material segue junto. Um script inline no `index.html`
aplica a preferência antes da primeira pintura; a logo troca para a versão escura pelo `<cp-logo>`;
a barra do navegador acompanha pelas duas `<meta theme-color>`. No claro o app ficou idêntico
(screenshot do login igual byte a byte).

---

## Tarefas Executadas

| Fase | Tarefa | Status | Observações |
|------|--------|--------|-------------|
| 1.1 | Mapa claro/escuro em `_tokens.scss` | ✅ | 53 cores; sombras por cores `sombra-*` |
| 1.2 | `_tema.scss` e `color-scheme` | ✅ | Só no `styles.scss`; nenhum chunk de componente declara `--cp-*` |
| 1.3 | Contraste nos dois temas | ✅ | 56 pares × 2 temas; falha conferida com valor ruim |
| 2.1 | Material em `color-scheme` | ✅ | + tipografia por `var(--cp-font)` (−1,1 kB no `styles`) |
| 2.2 | Revisão visual | ⚠️ parcial | Telas sem login conferidas (desktop e mobile, claro/escuro); logadas só por auditoria do SCSS — ver discrepâncias. Borda de input/hover mais forte no escuro |
| 2.3 | Botão do Google | ✅ | Sem mudança: legível no escuro, axe sem violação |
| 3.1 | `TemaService` | ✅ | `preferencia`, `escuro`, `definir`; `aplicarTema` exportado |
| 3.2 | "Aparência" no shell | ✅ | `mat-menu` com `menuitemradio`; ícones `brightness_auto`, `dark_mode`, `light_mode` no subset |
| 3.3 | Script inline e `theme-color` | ✅ | Duas metas com `data-tema`; o script e o serviço trocam a `media` |
| 4.1 | Logos escuras | ✅ | Feita antes (versão B aprovada pelo usuário) |
| 4.2 | `<cp-logo>` | ✅ | 3 posições do shell e 3 telas de conta |
| 5.1 | Unitários do `TemaService` | ✅ | `core/tema/` com 100 % (instruções, ramos e funções) |
| 5.2 | Shell e logo | ✅ | 3 casos novos no shell; `logo.spec.ts` |
| 5.3 | e2e e axe no escuro | ✅ | `e2e/tema.spec.ts`; axe em todas as rotas × `light`/`dark` |
| 6.1 | Budget e build | ✅ | 494,09 kB → 498,75 kB no initial total, sem aviso |
| 6.2 | CLAUDE.md | ✅ | Theming, shell, PWA, scripts, Material, classes globais |

---

## Discrepâncias do Plano

- **Revisão visual das telas logadas (2.2) não foi feita no navegador:** não há `.env.e2e` neste
  ambiente, e o agente não entra com credenciais reais. Foram conferidos no navegador `/login`,
  `/cadastro`, `/redefinir-senha` e a página de erro (desktop e mobile, nos dois temas). As telas
  logadas passaram por uma auditoria do SCSS: nenhum texto sobre preenchimento com token que
  inverte, nenhuma cor fixa fora do botão do Google, gráficos só por token/`currentcolor`. **Falta
  conferir à mão** painel e gráficos, notas, importação/prévia, sugestões, listas/conferência,
  produtos, estabelecimentos, região, configurações de IA e os diálogos/menus do Material.
- **Cores da barra do navegador:** em vez de `TEMA_COR_BARRA` em TS, as cores ficam só nas duas
  `<meta name="theme-color" data-tema>` do `index.html`; o `TemaService` e o script inline só trocam
  a `media` (`all`/`not all`, ou a media query no modo Sistema). O `contraste.mjs` confere que elas
  são o `$cp-surface` de cada tema.
- **`TemaService` não entra no `provideAppInitializer`:** o script inline cobre a primeira pintura,
  e o serviço nasce com o shell ou o `<cp-logo>`. Assim ele fica fora do bundle inicial.
- **Budget:** a nota de risco da 3.2 não se confirmou. O shell é carregado por `loadComponent`, então
  o `mat-menu` foi para um chunk lazy. O `main` não mudou (252,03 kB).
- **Tipografia do Material por `var(--cp-font)`** (não previsto): o `mat.theme` repetia a pilha de
  fontes 30 vezes; com a variável, o `styles` caiu 1,1 kB e a margem do budget voltou.
- **Opção marcada do menu:** o check fica dentro de `.cp-menu-opcao`, no texto do item, porque um
  `mat-icon` solto no `mat-menu-item` é projetado antes do rótulo.
- **e2e rodado contra um servidor novo (porta 4210):** o servidor que já estava na 4200 (processo do
  usuário, não mexido) servia JS antigo. Usei um config temporário, já apagado.
- **Commit da Fase 2 com um erro de stylelint** (linha em branco antes de comentário em `_tema.scss`),
  corrigido no commit seguinte.
- `e2e/painel.spec.ts` não passa no `prettier --check`; isso já vinha do commit `painel`, e não mexi.

---

## Análise de Lint

```
npm run lint
Linting "fed-catalogo-compara-precos"...
All files pass linting.
(stylelint sem erros)
```

## Testes e build

- `npm run test:ci`: 53 arquivos, 766 testes verdes (Statements 94,22 %, Branches 90,93 %).
- `npm run contraste`: "56 pares aprovados em WCAG AA nos temas claro e escuro", metas conferidas.
- `ng build -c production`: `main` 252,03 kB, `styles` 27,95 kB, initial total 498,75 kB, sem aviso.
- e2e (servidor novo): 35 passaram e 79 foram pulados por falta do usuário de teste. Inclui o axe sem
  violações graves em `/login`, `/cadastro`, `/redefinir-senha` e `/nao-existe` nos dois esquemas, e os
  testes do tema sem login.
- Visual (build de produção servido pelo Playwright): sistema escuro → fundo `rgb(15, 21, 18)` e
  `logo-escuro.png`; `cp-tema=escuro` com sistema claro → `data-tema="escuro"`, meta `#171f1b` em
  `media="all"`; `cp-tema=claro` com sistema escuro → claro e `logo.png`.

## Boas Práticas Angular 22

| Critério | Status |
|----------|--------|
| OnPush em todos os componentes | ✅ (`Logo`, `Shell`) |
| inject() sem construtor | ✅ (o construtor do `TemaService` só registra o `effect`) |
| takeUntilDestroyed() / toSignal | ✅ (`PREFERE_ESCURO` por `toSignal`) |
| track em @for | ✅ (`track opcao.valor`) |
| loading="lazy" em imagens | ✅ (logos acima da dobra; `priority` nas telas de conta) |
| Sem any implícito | ✅ |

---

## Critérios de Aceitação Globais

- ✅ Com o SO escuro e "Sistema", o app abre escuro já no carregamento (script inline + CSS crítico com o `:root`).
- ✅ Trocar o tema do SO muda o app sem recarregar (`light-dark()` + `PREFERE_ESCURO` para a logo).
- ✅ "Aparência" com Sistema/Claro/Escuro, estado em `aria-checked`; a escolha sobrevive ao reload (testado sem login; o e2e logado aguarda `.env.e2e`).
- ✅ No claro, o app é igual ao de antes.
- ✅ Nenhum SCSS de tela usa `prefers-color-scheme`/`[data-tema]`; o bloco `--cp-*` só no CSS global.
- ✅ `npm run contraste` e `npm run lint` passam.
- ⚠️ Todas as telas legíveis no escuro: conferido nas telas sem login; nas logadas, **pendente de conferência manual**.
- ⚠️ Gráficos legíveis no escuro: tokens das séries com AA; **não vistos com dados** (precisa de login).
- ✅ Logo e símbolo no escuro em todas as posições, uma imagem por posição.
- ✅ Barra do navegador na cor do header em cada tema.
- ✅ axe sem violações graves nos dois temas (rotas sem login; as logadas aguardam `.env.e2e`).
- ✅ `core/tema/` com 100 %; `test:ci` verde.
- ✅ Budget sem aviso; CLAUDE.md atualizado.

---

## Arquivos Criados/Modificados

```
src/app/shared/style/_tokens.scss, _tema.scss (novo)
src/styles.scss
src/index.html
src/app/core/tema/tema-ambiente.ts, tema.service.ts (+ specs)          (novos)
src/app/shared/ui/logo/logo.ts (+ spec)                                  (novo)
src/app/core/layout/shell.{ts,html,spec.ts}
src/app/features/auth/{login,cadastro,redefinir-senha}/*.page.{ts,html}
src/testing/tema.ts                                                       (novo)
scripts/contraste.mjs, scripts/gerar-icones.mjs
public/logo/logo-escuro.png, simbolo-escuro.png                          (novos)
e2e/tema.spec.ts (novo), e2e/a11y.spec.ts
CLAUDE.md
docs/analise/tema-escuro-analise.md, docs/analise/tema-escuro-logos/
docs/plano/tema-escuro-plano.md
docs/execucao/2026-10-25-tema-escuro-plano.md
```
