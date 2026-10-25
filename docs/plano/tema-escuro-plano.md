# Plano de Desenvolvimento: Tema escuro

**Data:** 2026-10-25
**Projeto:** fed-catalogo-compara-precos (Cupom Esperto)
**Análise base:** [docs/analise/tema-escuro-analise.md](../analise/tema-escuro-analise.md)
**Branch alvo:** `main`

---

## Visão Geral

O app ganha um tema escuro com três modos — **Sistema** (padrão, segue o `prefers-color-scheme` e
muda ao vivo), **Claro** e **Escuro** — escolhidos em "Aparência", no menu do shell, e guardados no
`localStorage` do aparelho (`cp-tema`). Nada vai para o Firestore nem para as Functions.

A mudança é concentrada no design system: cada token `$cp-*` deixa de ser um hex e passa a ser
`var(--cp-*)`. Os pares (claro, escuro) ficam num mapa no `_tokens.scss`, e um partial `_tema.scss`,
incluído **só** no `styles.scss`, gera as variáveis com `light-dark()`. O `color-scheme` do `<html>`
(controlado por `data-tema`) escolhe o lado — o mesmo mecanismo do Material em
`theme-type: color-scheme`, então app e componentes do Material trocam juntos. Os SCSS das telas não
mudam.

Completam a feature: o `scripts/contraste.mjs` conferindo os dois temas, a logo para fundo escuro
(gerada da arte), um script inline no `index.html` que aplica o tema antes da primeira pintura, o
`theme-color` por tema e a checagem do axe no escuro.

---

## Convenções Obrigatórias

- Standalone, `inject()`, `ChangeDetectionStrategy.OnPush` explícito, `input()`/`output()`.
- Estado em signals (`signal`, `computed`); store `providedIn: 'root'` expondo só `Signal` readonly.
- Subscription manual (o `change` do `matchMedia`) com `takeUntilDestroyed()`/`toSignal`, como o
  `BreakpointService`. Media query só por `matchMedia`, nunca `window.innerWidth`.
- APIs do navegador (`matchMedia`, `localStorage`) por `InjectionToken`, trocadas por fakes nos
  testes (padrão do `WAKE_LOCK`). Nada de `vi.mock` de módulo.
- Cor **só** por token em `_tokens.scss` (o stylelint bloqueia hex fora dele e do
  `_m3-palette.scss`). Cor diferente no escuro = token novo, nunca `@media`/`[data-tema]` em SCSS de
  tela.
- Classe global primeiro; o mixin não pode carregar o bloco de variáveis (conta no
  `anyComponentStyle`).
- Imagens com `NgOptimizedImage`; `priority` só na imagem que aparece acima da dobra.
- Ícone novo do Material Symbols entra no `icon_names=` do `index.html`, em ordem alfabética.
- Textos da UI em pt-BR no template. Sem comentários, a não ser para invariantes não óbvias.
- e2e por papel e label. Budget medido **no build**.

---

## Fases de Implementação

### Fase 1 — Tokens em variáveis CSS (sem mudar o visual) ✅ (executada em 2026-10-25)

**Objetivo:** o app continua idêntico no claro, mas toda cor já passa por `var(--cp-*)` e o
contraste confere dois temas. Esta fase é a fundação; o escuro ainda não é acessível ao usuário.

> Registro: [docs/execucao/2026-10-25-tema-escuro-plano.md](../execucao/2026-10-25-tema-escuro-plano.md).
> Sombras viraram cores `sombra-*` no mapa (uma por opacidade usada), porque `light-dark()` só
> aceita cor. **Budget:** o initial total foi de 494,09 kB para 498,58 kB (aviso em 500 kB) — ver a
> nota na 3.2.

#### Tarefa 1.1 — Mapa de cores claro/escuro em `_tokens.scss`

**Arquivo(s) a modificar:** `src/app/shared/style/_tokens.scss`

**O que fazer:**

- Criar o mapa `$cp-cores` com **todos** os tokens de cor (acento, floresta, superfícies, bordas,
  rampa de texto, casca, preço, séries, grade, semânticas, `header-bg`, `overlay`), cada um com o par
  `(claro, escuro)`. Os valores do escuro vêm da tabela da seção 5 da análise; os da casca (`nav-*`)
  continuam derivados (`nav-bg` = `surface` etc.) e não entram no mapa.
- Cada token de cor vira referência à variável: `$cp-bg: var(--cp-bg);`. Os aliases continuam
  aliases (`$cp-nav-bg: $cp-surface;`, `$cp-cheaper: $cp-accent-ink;`).
- `$cp-gradient-auth` continua um `linear-gradient` sobre os tokens (já funciona com `var()`).
- Sombras: separar a **cor** da sombra em tokens (`sombra`, `sombra-forte`, `sombra-acento`) no
  mapa e montar `$cp-shadow-*` com eles. No escuro, preto com opacidade maior.
- `$cp-shell-900`, `$cp-shell-700`, `$cp-on-shell` iguais nos dois lados (scanner e ícone já são
  escuros).
- O arquivo **não emite CSS** (nenhum seletor), porque é `@use`d por todo componente.

```scss
$cp-cores: (
  bg: (#f3f6f3, #0f1512),
  surface: (#fff, #171f1b),
  text: (#18211c, #e6ece8),
  accent: (#1f7a4d, #238154),
  accent-ink: (#16603b, #7fd3a3),
  header-bg: (rgb(255 255 255 / 88%), rgb(23 31 27 / 88%)),
  // …
);

$cp-bg: var(--cp-bg);
$cp-surface: var(--cp-surface);
```

**Critério:** `npm run lint` passa; `ng build -c production` compila; nenhum componente foi editado.

#### Tarefa 1.2 — Partial `_tema.scss` e `color-scheme`

**Arquivo(s) a criar/modificar:** `src/app/shared/style/_tema.scss` (novo), `src/styles.scss`

**O que fazer:**

- `_tema.scss` gera as variáveis a partir de `$cp-cores` com `light-dark()` e define o
  `color-scheme`:

```scss
@use 'sass:list';
@use 'tokens' as *;

:root {
  color-scheme: light dark;

  @each $nome, $par in $cp-cores {
    --cp-#{$nome}: light-dark(#{list.nth($par, 1)}, #{list.nth($par, 2)});
  }
}

:root[data-tema='claro'] {
  color-scheme: light;
}

:root[data-tema='escuro'] {
  color-scheme: dark;
}
```

- No `styles.scss`: `@use './app/shared/style/tema';` logo após os `@use` existentes; remover o
  `color-scheme: light` do `body` (o `:root` passa a mandar, inclusive em inputs nativos e
  scrollbar).
- **Nesta fase**, para não ligar o escuro antes da hora, o `:root` começa com `color-scheme: light`
  (o `light dark` entra na tarefa 3.3, junto com o script de inicialização).

**Critério:** no DevTools, `--cp-bg` resolve para `light-dark(…)`; forçar `color-scheme: dark` no
`<html>` à mão já escurece o fundo e os textos; o CSS dos componentes não contém `--cp-` declarado
(só usado). Budget `anyComponentStyle` igual ao de antes (comparar a saída do build).

#### Tarefa 1.3 — Contraste nos dois temas

**Arquivo(s) a modificar:** `scripts/contraste.mjs`

**O que fazer:**

- Trocar a leitura `$cp-x: #hex;` pela leitura do mapa `$cp-cores` (`nome: (#claro, #escuro)`) e
  manter a resolução de aliases (`$cp-nav-bg: $cp-surface` → `surface`).
- Rodar a mesma lista de pares para `claro` e `escuro`, imprimindo o tema em cada linha; código de
  saída ≠ 0 se qualquer par falhar em qualquer tema.
- Valores não-hex do mapa (`header-bg`, `overlay`, sombras) ficam fora dos pares (como hoje).
- Acrescentar os pares que a análise apontou: `shell-700 × surface` no escuro (se falhar, o uso em
  `styles.scss:445` passa para `accent-ink`), e os `*-soft` dos semânticos com o texto deles.

**Critério:** `npm run contraste` lista os dois temas e passa com a paleta da análise; trocar um
valor escuro para um que reprova faz o script falhar.

---

### Fase 2 — Material e ajustes de superfície

**Objetivo:** com o `color-scheme: dark` forçado no `<html>` (DevTools), o app inteiro fica
coerente no escuro, inclusive o Material.

#### Tarefa 2.1 — Material em `color-scheme`

**Arquivo(s) a modificar:** `src/styles.scss`

**O que fazer:** em `mat.theme`, `theme-type: light` → `theme-type: color-scheme`. Conferir os
overrides existentes (ex.: `.mat-mdc-dialog-container .mat-mdc-dialog-surface`) para que usem
tokens `$cp-*`, não valores fixos.

**Critério:** com `color-scheme: dark` no `<html>`, dialog (`confirm-dialog`, renomear, vincular,
escolher lista), `mat-menu` (item da lista), autocomplete (adicionar item), datepicker, tooltip do
rail e snackbar ficam escuros e legíveis.

#### Tarefa 2.2 — Revisão visual tela a tela

**Arquivo(s) a modificar:** `src/app/shared/style/_tokens.scss` (só valores), eventualmente
`src/styles.scss` e SCSS de tela **apenas** para trocar um token por outro mais adequado

**O que fazer:** percorrer, com o escuro forçado, em desktop e mobile: login/cadastro/redefinir
(gradiente), shell (header translúcido, rail, drawer + scrim), painel e gráficos, notas (lista,
detalhe, destaques, "Tem mais barato perto?"), importar/prévia/pendentes, sugestões, listas e
conferência, produtos (gráfico de histórico), estabelecimentos, região, configurações de IA, página
de erro, skeletons, `type="date"`. Ajustar valores de borda/superfície/sombra no mapa até ficar
legível; profundidade por superfície mais clara + borda.

**Critério:** nenhuma tela com texto ilegível, borda invisível em input ou card "colado" no fundo;
`npm run contraste` continua passando após os ajustes.

#### Tarefa 2.3 — Botão do Google

**Arquivo(s) a modificar:** `src/app/features/auth/google/botao-google.ts` (estilo) ou `src/styles.scss`

**O que fazer:** manter as cores oficiais do "G"; no escuro o botão usa `$cp-surface`/`$cp-border`
dos tokens (o "G" colorido sobre superfície escura é aceito pelas diretrizes do Google). Sem hex
novo.

**Critério:** botão legível nos dois temas, axe sem violação.

---

### Fase 3 — Preferência, aplicação e controle

**Objetivo:** o usuário escolhe o tema, a escolha persiste e a abertura não pisca.

#### Tarefa 3.1 — `TemaService`

**Arquivo(s) a criar:** `src/app/core/tema/tema.service.ts`, `src/app/core/tema/tema-ambiente.ts`

**O que fazer:**

- `tema-ambiente.ts`: tokens `ARMAZENAMENTO_TEMA` (`Pick<Storage, 'getItem' | 'setItem'> | null`,
  default `localStorage` dentro de `try/catch`) e `PREFERE_ESCURO` (`Signal<boolean>` a partir de
  `matchMedia('(prefers-color-scheme: dark)')`, no molde do `BreakpointService.observar`).
- `TemaService` (`providedIn: 'root'`):
  - `type PreferenciaTema = 'sistema' | 'claro' | 'escuro'`; `CHAVE_TEMA = 'cp-tema'`.
  - `preferencia` (signal, lida do armazenamento; valor inválido/ausente/erro → `'sistema'`),
    `escuro = computed(...)` sobre a preferência e o `PREFERE_ESCURO`, `definir(p)`.
  - `definir` grava (`'sistema'` remove a chave) e um `effect` aplica `data-tema` no
    `document.documentElement` (`claro`/`escuro`, removido em `sistema`) e o conteúdo do
    `<meta name="theme-color">` (cor do header no tema efetivo, constantes do mesmo par do mapa —
    exportar de um único lugar para não divergir do SCSS, ex. `TEMA_COR_BARRA = { claro: '#ffffff',
    escuro: '#171f1b' }` em `tema-ambiente.ts`, conferido por teste contra `_tokens.scss`).
- Iniciado cedo: injetado pelo `provideAppInitializer` já existente em `app.config.ts` (ou
  instanciado pelo shell e pelas telas de conta) — o script inline cobre a primeira pintura, o
  serviço assume depois.

**Critério:** os testes da tarefa 5.1 passam; trocar a preferência no console do serviço muda o
tema sem recarregar.

#### Tarefa 3.2 — Item "Aparência" no menu do shell

**Arquivo(s) a modificar:** `src/app/core/layout/shell.html`, `shell.ts`, `shell.scss` (se preciso),
`src/index.html` (ícones)

> **Atenção ao budget:** depois da Fase 1 sobram ~1,4 kB até o aviso de 500 kB do initial total, e o
> shell está no bundle inicial. Medir o build com o `MatMenuModule` no shell; se estourar, trocar o
> `mat-menu` por um `cp-segmented` (Sistema | Claro | Escuro) dentro do próprio menu lateral, que só
> usa classes globais.

**O que fazer:**

- Entre "Verificar atualizações" e "Sair", um `button.cp-nav-item` com `[matMenuTriggerFor]`,
  ícone do tema efetivo (`dark_mode`/`light_mode`, ou `brightness_auto` em Sistema), rótulo
  "Aparência" e, no rail, tooltip/`aria-label` "Aparência: Sistema" como os vizinhos.
- `mat-menu` com três `button mat-menu-item role="menuitemradio"` (`[attr.aria-checked]`), ícone de
  check na opção atual, chamando `tema.definir(...)`. Importar `MatMenuModule` no shell.
- Acrescentar `brightness_auto`, `dark_mode` e `light_mode` ao `icon_names=` do `index.html`, em
  ordem alfabética.

**Critério:** no drawer, no rail e no menu expandido, o item abre as três opções, só com teclado
(Enter/setas/Esc), e a escolha aplica na hora e sobrevive ao reload.

#### Tarefa 3.3 — Script inline e `theme-color` no `index.html`

**Arquivo(s) a modificar:** `src/index.html`, `src/app/shared/style/_tema.scss`

**O que fazer:**

- No `<head>`, antes das folhas de estilo:

```html
<script>
  try {
    var t = localStorage.getItem('cp-tema');
    if (t === 'claro' || t === 'escuro') document.documentElement.dataset.tema = t;
  } catch (e) {}
</script>
```

- Trocar a meta única por duas:
  `<meta name="theme-color" media="(prefers-color-scheme: light)" content="#ffffff">` e
  `… media="(prefers-color-scheme: dark)" content="#171f1b">`. O `TemaService` atualiza as duas para
  a mesma cor quando o modo é forçado.
- `_tema.scss`: `:root` passa para `color-scheme: light dark` (liga o modo Sistema).
- Fundo antes do Angular: o `body` já usa `$cp-bg` em `styles.scss` (CSS global no `<head>`), então
  não precisa de CSS inline.
- Manifest: sem mudança (`theme_color` único; registrar a limitação no CLAUDE.md na fase 6).

**Critério:** com o SO escuro ou `cp-tema=escuro`, recarregar (inclusive com rede lenta/Slow 4G no
DevTools) não mostra quadro branco; barra do navegador no Android acompanha o tema.

---

### Fase 4 — Marca no escuro

**Objetivo:** logo e símbolo legíveis nos dois temas, com um download por posição.

#### Tarefa 4.1 — Gerar as versões escuras da logo ✅ (feita em 2026-10-25)

**Arquivo(s):** `scripts/gerar-icones.mjs`, `public/logo/logo-escuro.png`,
`public/logo/simbolo-escuro.png`

**Feito:** o usuário escolheu a versão **B** entre duas opções (B: papel branco e texto claro; C:
logo atual sobre placa clara), comparadas em
[`docs/analise/tema-escuro-logos/comparativo-logos.png`](../analise/tema-escuro-logos/comparativo-logos.png).

- `recortar` ganhou a opção `escuro` (`LOGO_ESCURO`, `SIMBOLO_ESCURO`): parte da mesma conversão do
  branco em transparência e (1) mantém **opaco o papel do cupom** — o claro que não é alcançável a
  partir da borda da imagem (flood fill), só na região do símbolo, dilatado 2 px para levar o
  antisserrilhado; (2) repinta o texto por faixa de coluna, mantendo o alfa: "Cupom" em `#7fd3a3`
  (`accent-ink` do escuro) e "Esperto" em `#e6ece8` (`text` do escuro).
- Mesmas dimensões das versões claras (720×151 e 128×128). Rodar o script de novo regenera os PNGs
  existentes byte a byte iguais.
- Se os valores escuros de `accent-ink`/`text` mudarem na 2.2, atualizar `LOGO_ESCURO.cores` e rodar
  `node scripts/gerar-icones.mjs`.

#### Tarefa 4.2 — `<cp-logo>` por tema

**Arquivo(s) a criar/modificar:** `src/app/shared/ui/logo/logo.ts` (novo),
`src/app/core/layout/shell.html`, `shell.ts`,
`src/app/features/auth/{login,cadastro,redefinir-senha}/*.page.{html,ts}`

**O que fazer:**

- Componente `cp-logo` com `variante = input<'completa' | 'simbolo'>('completa')` e
  `prioritaria = input(false)`; `src` é `computed` do `TemaService.escuro()`; uma única `<img
  [ngSrc]>` (troca de `src`, sem duas imagens no DOM). `alt="Cupom Esperto"`, largura/altura fixas
  da variante; classe de layout recebida pelo host.
- Substituir as 3 imagens do shell e as 3 das telas de conta (estas com `prioritaria`).

**Critério:** no claro, nada muda visualmente; no escuro, todas as posições mostram a versão escura;
no Network, só a versão do tema atual é baixada no carregamento.

---

### Fase 5 — Testes

**Objetivo:** cobrir o serviço, o shell e o comportamento real no navegador.

#### Tarefa 5.1 — Unitários do `TemaService`

**Arquivo(s) a criar:** `src/app/core/tema/tema.service.spec.ts`

**O que fazer:** fakes de `ARMAZENAMENTO_TEMA` e `PREFERE_ESCURO` (`signal` controlável). Casos:
padrão `sistema`; valor salvo `claro`/`escuro`; valor inválido e armazenamento que lança → `sistema`;
`definir` grava/remove a chave; `data-tema` aplicado/removido; `escuro` acompanha o SO ao vivo só em
`sistema`; metas `theme-color` atualizadas; `TEMA_COR_BARRA` igual aos valores de `header`/`surface`
lidos do `_tokens.scss` (lido como texto no teste).

**Critério:** 100 % de cobertura em `core/tema/` no `npm run test:ci`.

#### Tarefa 5.2 — Shell e logo

**Arquivo(s) a modificar/criar:** `src/app/core/layout/shell.spec.ts`,
`src/app/shared/ui/logo/logo.spec.ts`

**O que fazer:** shell — o item "Aparência" abre o menu com as três opções (`menuitemradio`), a atual
com `aria-checked="true"`, e o clique chama `definir`. Logo — `src` muda com o tema; `alt` presente.

**Critério:** `npm test` verde.

#### Tarefa 5.3 — e2e do tema e axe no escuro

**Arquivo(s) a criar/modificar:** `e2e/tema.spec.ts` (novo), `e2e/a11y.spec.ts`

**O que fazer:**

- `tema.spec.ts`: sem login, `page.emulateMedia({ colorScheme: 'dark' })` em `/login` → fundo do
  `body` escuro (computed style), logo escura. Logado: menu → "Aparência" → "Claro" com o SO escuro →
  recarregar → `html[data-tema="claro"]`; "Sistema" remove o atributo.
- `a11y.spec.ts`: repetir as rotas existentes com `colorScheme: 'dark'` (laço sobre
  `['light', 'dark']`).

**Critério:** `npm run e2e` verde em `chromium` e `mobile`; axe sem violações graves nos dois temas.

---

### Fase 6 — Fechamento

**Objetivo:** budget conferido e documentação atualizada.

#### Tarefa 6.1 — Budget e build

**O que fazer:** `ng build -c production` antes (main atual) e depois; comparar `main`, `styles` e o
maior `anyComponentStyle`. Rodar `npm run lint`, `npm run contraste`, `npm run test:ci`.

**Critério:** sem aviso novo de budget; todos verdes.

#### Tarefa 6.2 — CLAUDE.md

**Arquivo(s) a modificar:** `CLAUDE.md`

**O que fazer:** na seção Theming, documentar: mapa `$cp-cores (claro, escuro)` como única fonte de
cor, `$cp-x: var(--cp-x)`, `_tema.scss` só no `styles.scss`, `light-dark()` + `data-tema`, regra
"cor diferente no escuro = token novo", contraste nos dois temas, `TemaService`/`cp-tema`, script
inline do `index.html`, logo escura e `<cp-logo>`, Material em `color-scheme`, limitação do manifest.
Atualizar a linha do PWA sobre `theme_color`.

**Critério:** CLAUDE.md descreve o mecanismo sem precisar abrir o plano.

---

## Estrutura Final de Arquivos

```
src/
├── index.html                                  # [3.2] ícones · [3.3] script inline + 2 metas theme-color
├── styles.scss                                 # [1.2] @use tema, sem color-scheme no body · [2.1] theme-type
└── app/
    ├── core/
    │   ├── tema/
    │   │   ├── tema-ambiente.ts                # [3.1] ARMAZENAMENTO_TEMA, PREFERE_ESCURO, TEMA_COR_BARRA
    │   │   ├── tema.service.ts                 # [3.1]
    │   │   └── tema.service.spec.ts            # [5.1]
    │   └── layout/
    │       ├── shell.html / shell.ts           # [3.2] Aparência · [4.2] <cp-logo>
    │       └── shell.spec.ts                   # [5.2]
    ├── features/auth/
    │   ├── google/botao-google.ts              # [2.3]
    │   └── login|cadastro|redefinir-senha/     # [4.2] <cp-logo>
    └── shared/
        ├── ui/logo/logo.ts + logo.spec.ts      # [4.2] [5.2]
        └── style/
            ├── _tokens.scss                    # [1.1] mapa $cp-cores · [2.2] ajustes de valor
            └── _tema.scss                      # [1.2] novo · [3.3] light dark
public/logo/
├── logo-escuro.png                             # [4.1]
└── simbolo-escuro.png                          # [4.1]
scripts/
├── contraste.mjs                               # [1.3]
└── gerar-icones.mjs                            # [4.1]
e2e/
├── tema.spec.ts                                # [5.3]
└── a11y.spec.ts                                # [5.3]
CLAUDE.md                                       # [6.2]
```

---

## Ordem de Execução Recomendada

```
1.1 tokens ──► 1.2 _tema.scss ──► 1.3 contraste
                     │
                     ▼
               2.1 Material ──► 2.2 revisão visual ──► 2.3 Google
                     │
                     ▼
               3.1 TemaService ──► 3.2 Aparência ──► 3.3 script + theme-color
                     │
                     ├──► 4.1 logos (feita) ──► 4.2 <cp-logo>
                     │
                     ▼
               5.1 ─ 5.2 ─ 5.3 testes ──► 6.1 budget ──► 6.2 CLAUDE.md
```

A 4.1 (gerar as logos) já está feita; a 4.2 precisa do `TemaService` (3.1).

---

## Critérios de Aceitação Globais

- [ ] Com o SO escuro e preferência "Sistema", o app abre escuro sem quadro branco (PWA fria,
      refresh, telas fora do shell).
- [ ] Trocar o tema do SO com o app aberto muda o app sem recarregar.
- [ ] "Aparência" no menu (drawer, rail e expandido) com Sistema/Claro/Escuro, operável por teclado,
      estado anunciado; a escolha sobrevive a reload e a sair/entrar.
- [ ] No claro, o app é visualmente igual ao de antes.
- [ ] Nenhum SCSS de tela usa `prefers-color-scheme` ou `[data-tema]`; o bloco `--cp-*` aparece só
      no CSS global.
- [ ] `npm run contraste` confere e passa nos dois temas; `npm run lint` passa.
- [ ] Todas as telas, estados e componentes do Material legíveis no escuro (desktop e mobile).
- [ ] Gráficos com séries, grade e rótulos legíveis no escuro.
- [ ] Logo e símbolo legíveis no escuro em todas as posições, um download por posição.
- [ ] Barra do navegador/PWA na cor do header em cada tema.
- [ ] axe sem violações graves nos dois temas; e2e do tema verde em `chromium` e `mobile`.
- [ ] `core/tema/` com 100 % de cobertura; `npm run test:ci` verde.
- [ ] Budgets de produção sem aviso novo; CLAUDE.md atualizado.
