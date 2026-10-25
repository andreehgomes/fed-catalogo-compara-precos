# Análise: Tema escuro

**Data:** 2026-10-25
**Projeto:** fed-catalogo-compara-precos (Cupom Esperto)
**Escopo:** oferecer um **tema escuro** em todo o app (shell, telas de conta, telas internas,
diálogos e componentes do Material, gráficos, scanner e PWA), escolhido entre **Sistema** (padrão,
segue o `prefers-color-scheme`), **Claro** e **Escuro**, sem quebrar o design system "Cupom
Esperto", o contraste AA nem o budget do bundle.

---

## 1. Contexto

**Como a cor funciona hoje**

- `src/app/shared/style/_tokens.scss` é a **única fonte de cor** (o stylelint bloqueia hex e cor
  nomeada fora dele e do `_m3-palette.scss`). Os tokens são **variáveis Sass** (`$cp-*`), resolvidas
  **na compilação**: o CSS gerado tem os hex fixos, não há como trocá-los em tempo de execução.
- 21 arquivos SCSS usam tokens de cor (`styles.scss` com ~130 usos, `shell.scss` 25,
  `nota-detalhe.page.scss` 14, `grafico-meses.scss` 12…). **Nenhum** passa token por função de cor
  do Sass (`rgba($cp-…)`, `color.adjust`, `mix`…): trocar o valor de `$cp-x` por `var(--cp-x)` não
  quebra a compilação.
- Cores fora dos tokens: as **sombras** são `rgb(24 33 28 / x%)` literais dentro do `_tokens.scss`;
  `$cp-header-bg` é `rgb(255 255 255 / 88%)`; `$cp-overlay` é floresta translúcida;
  `$cp-gradient-auth` é um gradiente de `accent-soft` para `bg`. Em TS/HTML só o
  `botao-google.ts` tem hex (as cores oficiais do "G", que ficam iguais nos dois temas).
- Os gráficos próprios (`grafico-meses`, `grafico-historico`) pintam o SVG por CSS (`fill`/`stroke`
  com token ou `currentcolor`): seguem o tema de graça, desde que os tokens mudem.
- **Material M3** (`mat.theme` em `src/styles.scss`) com `theme-type: light`, usado em dialog, menu,
  autocomplete, datepicker, tooltip e snackbar. O `body` declara `color-scheme: light`.
- `npm run contraste` (`scripts/contraste.mjs`) lê os hex de `_tokens.scss` por regex
  (`$cp-x: #hex;`) e confere ~60 pares texto × superfície. Só conhece **um** valor por token.

**Marca e PWA**

- `public/logo/logo.png` e `simbolo.png` foram gerados de `logos.png` convertendo o **branco em
  transparência**: o papel do cupom fica transparente e o texto "Esperto" é verde quase preto. Num
  fundo escuro o papel some e o texto não tem contraste. A arte original **não tem** versão do
  wordmark para fundo escuro, só o **ícone escuro** (símbolo com papel branco sobre floresta
  `#0d3320`), que já é a fonte dos ícones da PWA.
- `index.html` tem `<meta name="theme-color" content="#ffffff">` e o manifest `theme_color` branco
  (a barra do navegador/PWA fica branca, igual ao header).
- O scanner já é escuro (`$cp-shell-900`) nos dois temas.

**Preferências do usuário hoje**

- Preferências locais vão para o `localStorage` (`NotasAbertasService`, `DispensadosService`,
  `LocalizacaoStore`). O cliente **não** grava em `usuarios/{uid}` fora das listas (regra do
  projeto), então a escolha de tema é **por aparelho**.
- O menu do shell tem "Verificar atualizações" e "Sair" depois dos itens de navegação: lugar natural
  para "Aparência".

**O que falta**

1. Tokens em **CSS custom properties** com dois valores (claro e escuro).
2. Paleta escura conferida (AA) e o script de contraste para os dois temas.
3. Material em `theme-type: color-scheme`.
4. Logo para fundo escuro.
5. Serviço de preferência, controle no menu e aplicação **antes do bootstrap** (sem piscar branco).
6. `theme-color` por tema; e2e/axe no escuro.

---

## 2. Dados Disponíveis

| Fonte | Tipo | Uso no tema escuro |
| --- | --- | --- |
| `_tokens.scss` | variáveis Sass | passam a apontar para `var(--cp-*)`; os valores vão para o mapa claro/escuro |
| `_m3-palette.scss` | paletas M3 geradas de `#1f7a4d` | já tem os tons 10–100: o M3 escolhe os tons escuros sozinho com `theme-type: color-scheme` |
| `scripts/contraste.mjs` | script Node | passa a ler os dois valores e conferir os pares em cada tema |
| `public/logo/logos.png` | arte da marca | fonte para gerar `logo-escuro.png`/`simbolo-escuro.png` em `scripts/gerar-icones.mjs` |
| `prefers-color-scheme` | media query do SO | valor do modo **Sistema** (e sua mudança ao vivo) |
| `localStorage` `cp-tema` | preferência local | `sistema` \| `claro` \| `escuro`, lido pelo script inline e pelo `TemaService` |
| `BreakpointService` (`core/layout/`) | `matchMedia` | modelo para o `matchMedia('(prefers-color-scheme: dark)')` do serviço |

Nenhuma coleção do Firestore, Function ou API externa é envolvida.

---

## 3. Requisitos Funcionais

- **RF-01 — Três modos.** O usuário escolhe **Sistema** (padrão), **Claro** ou **Escuro**. Em
  Sistema, o app segue o `prefers-color-scheme` e **muda ao vivo** quando o SO troca (ex.: modo
  escuro automático ao anoitecer), sem recarregar.
- **RF-02 — Onde escolher.** No menu do shell, entre "Verificar atualizações" e "Sair", um item
  "Aparência" que abre um `mat-menu` (ou um `cp-segmented` no drawer) com as três opções e a atual
  marcada (`aria-checked`/`role="menuitemradio"`). No rail, só o ícone com tooltip, como os vizinhos.
  Ícones novos no subset do `index.html` (`dark_mode`, `light_mode`, `contrast` ou
  `brightness_auto`).
- **RF-03 — Telas fora do shell.** Login, cadastro, redefinir senha e a página de erro respeitam a
  preferência salva (e o Sistema), sem controle próprio na primeira versão.
- **RF-04 — Persistência por aparelho.** A escolha fica no `localStorage` (`cp-tema`) e vale para
  todos os usuários do aparelho; o `AuthStore.sair()` **não** a apaga (não é dado da conta).
- **RF-05 — Sem flash.** Na abertura (inclusive PWA fria e refresh), a página já nasce no tema
  certo: um script inline no `<head>` do `index.html` aplica `data-tema` no `<html>` antes do CSS
  pintar. Fundo do `body` escuro desde o primeiro quadro.
- **RF-06 — Cobertura total.** Todas as telas, estados (vazio, carregando/skeleton, erro, aviso,
  "Nova"), badges de preço, chips, segmented, inputs (inclusive `type="date"` e o ícone do
  calendário nativo), scrollbar, foco visível, diálogos, menus, autocomplete, datepicker, tooltip e
  snackbar ficam legíveis no escuro.
- **RF-07 — Gráficos.** `grafico-meses` e `grafico-historico` usam séries, grade e rótulos próprios
  do escuro (tons mais claros, mesmo traço/marcador por série). A tabela `cp-sr-only` não muda.
- **RF-08 — Marca.** Logo completa e símbolo com versão para fundo escuro (texto claro, papel
  branco), trocada por tema no shell (menu, rail, header) e nas telas de conta. A troca não pode
  gerar dois downloads no carregamento inicial (ver RNF-01).
- **RF-09 — Barra do sistema.** `<meta name="theme-color">` acompanha o tema (cor do header em cada
  um): duas metas com `media="(prefers-color-scheme: …)"` para o Sistema e ajuste pelo
  `TemaService` quando o modo é forçado. O manifest segue com um só `theme_color` (limitação do
  formato; o `<meta>` vence enquanto o app está aberto).
- **RF-10 — Conteúdo que não muda.** O botão do Google mantém as cores oficiais (sobre superfície
  própria clara, como manda a marca do Google), o scanner continua floresta, e o `<cp-badge-preco>`
  segue com ícone + texto + cor.
- **RF-11 — Transição.** A troca de tema é instantânea; sem animação de cor global (evita repintar
  tudo com transição). Com `prefers-reduced-motion` nada muda.

---

## 4. Requisitos Não Funcionais

**Desempenho**

- **RNF-01 — Bundle.** As variáveis CSS são declaradas **uma vez**, em `styles.scss` (partial novo
  `_tema.scss` incluído só lá), nunca dentro de `_tokens.scss`, que é `@use`d por cada componente e
  duplicaria o bloco em todos (estoura o `anyComponentStyle`). O `TemaService` é pequeno e entra no
  `main` (o shell e as telas de conta precisam dele); sem dependência nova. Budget de 500 kB do
  `main` e dos estilos medido **no build**, antes e depois.
- **RNF-02 — Logo sem download duplo.** Trocar por `<picture>` com
  `<source media="(prefers-color-scheme: dark)">` só resolve o modo Sistema; para o modo forçado,
  renderizar **uma** `<img>` com `ngSrc` vindo de um `computed` do tema (o `@if` do Angular só
  cria a imagem do tema atual). Logo do header/login continua `priority` só na versão que aparece.
- **RNF-03 — Custo de pintura.** `color-scheme` no `<html>` e tokens por `light-dark()` (ou
  seletor `[data-tema]`): trocar o tema é uma mudança de atributo, sem recalcular SCSS nem recarregar.

**Responsividade**

- **RNF-04** — O controle funciona no drawer (< 900 px), no rail (76 px, só ícone + tooltip) e no
  menu expandido. Sem diferença de paleta por breakpoint. Conferido em `mobile` e `chromium` do
  Playwright.

**Acessibilidade**

- **RNF-05 — Contraste AA nos dois temas.** `npm run contraste` confere **todos os pares nos dois
  temas** (4,5:1 texto; 3:1 ícone/texto grande/borda de foco) e falha o CI se um tema reprovar.
  Proposta inicial já medida (seção 5).
- **RNF-06 — Sem branco puro no escuro.** Texto principal ≈ `#e6ece8` (não `#fff`) e fundo
  ≈ `#0f1512` (não `#000`), para evitar halo/ofuscamento em OLED. Profundidade por **superfícies mais
  claras** (bg < surface < subtle) e borda, porque as sombras somem no escuro.
- **RNF-07** — Foco visível (`outline` com `$cp-accent`) mantém 3:1 contra `bg` e `surface` escuros.
- **RNF-08** — O seletor de tema é acessível por teclado, anuncia o estado (`menuitemradio` /
  `aria-checked`) e o nome ("Aparência: Sistema").
- **RNF-09** — O axe roda também com `colorScheme: 'dark'` (`page.emulateMedia`) nas rotas do
  `e2e/a11y.spec.ts`.

**Manutenibilidade**

- **RNF-10 — Componentes não mudam.** Os componentes continuam escrevendo `$cp-text`,
  `$cp-surface` etc.; só o **valor** de cada token vira `var(--cp-…)`. Nenhum SCSS de tela ganha
  `@media (prefers-color-scheme)` ou `[data-tema]`: se uma tela precisar de cor diferente no escuro,
  isso vira **token novo**.
- **RNF-11 — Uma fonte de verdade.** Os pares claro/escuro de cada token ficam lado a lado no
  `_tokens.scss` (mapa `$cp-cores: (nome: (claro, escuro))`), gerando o bloco de variáveis em
  `_tema.scss` por `@each`. O stylelint continua liberando hex só nesses arquivos.
- **RNF-12** — Angular 22: `TemaService` `providedIn: 'root'`, `inject()`, estado em `signal`
  (`preferencia`, `escuro` como `computed` sobre a preferência e o `matchMedia`), `effect` para
  aplicar o atributo, `DestroyRef` no listener do `matchMedia`. Componentes OnPush.
- **RNF-13** — Material: `theme-type: color-scheme` (o M3 gera `light-dark()` e segue o
  `color-scheme` do `<html>`). Sem segundo `mat.theme`, sem `*-overrides` por tema.

**Testabilidade**

- **RNF-14** — `TemaService` com 100 % de cobertura: `matchMedia` e `localStorage` injetados por
  token (padrão do `BreakpointService`/`WAKE_LOCK`), fakes nos testes; cobre os três modos, troca do
  SO ao vivo, `localStorage` indisponível/valor inválido (→ Sistema) e o `theme-color`.
- **RNF-15** — Teste do shell: o item "Aparência" lista as três opções e chama o serviço.
- **RNF-16** — e2e: escolher Escuro, recarregar e conferir `html[data-tema="escuro"]` e o fundo
  computado do `body`; axe nas rotas com `colorScheme: 'dark'`. Seletores por papel/label.
- **RNF-17** — `scripts/contraste.mjs` com os dois temas roda no CI (`ci.yml` já chama
  `npm run contraste`).

**Segurança**

- **RNF-18** — O script inline do `index.html` só lê `localStorage.getItem('cp-tema')` e aceita uma
  lista fechada (`claro|escuro`), dentro de `try/catch`; nada vai para `innerHTML`. Se um dia houver
  CSP no Hosting, ele precisa de hash (`'sha256-…'`) — anotar no `firebase.json`.
- **RNF-19** — Sem dado pessoal: a preferência não é enviada a lugar nenhum nem ao Firestore.

**Internacionalização**

- **RNF-20** — Não há ngx-translate no projeto: textos em pt-BR no template ("Aparência",
  "Sistema", "Claro", "Escuro").

---

## 5. Estrutura de Componentes Proposta

```
src/
├── index.html                                 # script inline (aplica data-tema) + 2 metas theme-color
├── styles.scss                                # @use 'tema'; mat.theme theme-type: color-scheme;
│                                              # body sem color-scheme fixo
└── app/
    ├── core/
    │   ├── tema/
    │   │   ├── tema.service.ts                # preferencia, escuro, definir(); aplica no <html>
    │   │   ├── tema.service.spec.ts
    │   │   └── tema-ambiente.ts               # tokens PREFERE_ESCURO (matchMedia) e ARMAZENAMENTO_TEMA
    │   └── layout/
    │       ├── shell.html / shell.ts          # item "Aparência" + logo por tema
    │       └── shell.spec.ts
    ├── features/auth/*/                       # logo por tema (componente de logo compartilhado)
    └── shared/
        ├── ui/logo/logo.ts                    # <cp-logo variante="completa|simbolo">: escolhe o png do tema
        └── style/
            ├── _tokens.scss                   # mapa $cp-cores (claro, escuro) + $cp-x: var(--cp-x)
            └── _tema.scss                     # :root / [data-tema] gerados por @each (só em styles.scss)
public/logo/
├── logo-escuro.png                            # gerado por scripts/gerar-icones.mjs
└── simbolo-escuro.png
scripts/
├── gerar-icones.mjs                           # + recorte para fundo escuro
└── contraste.mjs                              # lê (claro, escuro) e confere os pares nos dois
e2e/
├── tema.spec.ts                               # escolher, recarregar, sem flash
└── a11y.spec.ts                               # + rodada com colorScheme dark
```

**Mecânica dos tokens (recomendada)**

```scss
// _tokens.scss — ÚNICA fonte de cor (claro, escuro)
$cp-cores: (
  bg: (#f3f6f3, #0f1512),
  surface: (#fff, #171f1b),
  text: (#18211c, #e6ece8),
  // …
);
$cp-bg: var(--cp-bg);
$cp-surface: var(--cp-surface);
$cp-text: var(--cp-text);

// _tema.scss — incluído só em styles.scss
:root {
  color-scheme: light dark;
  @each $nome, $par in $cp-cores {
    --cp-#{$nome}: light-dark(#{list.nth($par, 1)}, #{list.nth($par, 2)});
  }
}
:root[data-tema='claro'] { color-scheme: light; }
:root[data-tema='escuro'] { color-scheme: dark; }
```

`light-dark()` + `color-scheme` é o mesmo mecanismo que o Material usa com
`theme-type: color-scheme`, então app e Material trocam juntos por um único atributo. Suporte:
Chrome/Edge 123+, Firefox 120+, Safari/iOS 17.5+. Se o browserslist do projeto precisar de iOS
mais antigo, a alternativa é gerar **dois blocos** (`:root` claro e
`@media (prefers-color-scheme: dark) { :root:not([data-tema='claro']) {…} }` +
`:root[data-tema='escuro'] {…}`), com o mesmo `@each`; o custo é ~3 × o bloco de variáveis no CSS
global (poucos kB).

**Paleta escura proposta (contraste medido contra `surface #171f1b`)**

| Papel | Claro | Escuro | Razão no escuro |
| --- | --- | --- | --- |
| `bg` | `#f3f6f3` | `#0f1512` | — |
| `surface` / `nav-bg` | `#fff` | `#171f1b` | — |
| `surface-subtle` | `#f6f9f6` | `#1d2621` | — |
| `surface-input` | `#fafcfa` | `#141b17` | — |
| `surface-track` | `#e6ede7` | `#26302a` | — |
| `text` | `#18211c` | `#e6ece8` | 14,0 |
| `text-body` | `#3a4640` | `#c9d3cd` | 11,0 |
| `text-secondary` | `#4f5c55` | `#b3bfb8` | 8,9 |
| `text-muted` | `#5d6a63` | `#a1ada6` | 7,2 |
| `text-label` | `#5f6c65` | `#9eaaa3` | 7,0 |
| `text-placeholder` | `#76837c` | `#7f8b84` | 4,95 (input) |
| `accent` (preenchimento) | `#1f7a4d` | `#238154` | branco sobre: 4,84; sobre surface: 3,48 |
| `accent-ink` / `cheaper` / `serie-1` | `#16603b` | `#7fd3a3` | 9,4 (7,4 sobre `accent-soft`) |
| `accent-soft` | `#effaf3` | `#183626` | — |
| `accent-hover` | `#dff3e7` | `#1f3f2d` | ink 6,5 |
| `pricier` | `#a51d13` | `#ff8a80` | 7,4 (6,9 sobre `pricier-soft #3a1a19`) |
| `warn` | `#a54600` | `#f0a860` | 8,4 (6,9 sobre `warn-soft #3a2a12`) |
| `success` / `serie-5` | `#0f6e6a` | `#5fd0c6` | 9,1 (7,3 sobre `#123331`) |
| `info` / `serie-2` | `#2a65c2` | `#8ab4f8` | 8,0 (6,9 sobre `#172a45`) |
| `danger-action` | `#d0281b` | `#ff6b5e` | 6,0 (5,6 sobre `#3a1a19`) |
| `serie-3` / `serie-4` | `#a54600` / `#7b3fa0` | `#f0a860` / `#c9a0f0` | 8,4 / 7,8 |
| `grafico-grade` | `#e1e8e3` | `#2a342e` | (decorativa) |
| `header-bg` | branco 88 % | `rgb(23 31 27 / 88%)` | — |
| `overlay` | floresta 55 % | `rgb(0 0 0 / 60%)` | — |
| sombras | grafite 4–35 % | preto 30–60 % + borda `border` | — |

Bordas no escuro: `border #2a342e`, `border-input #35413a`, `border-divider #232c27`,
`border-hover #45524a`, `scrollbar #35413a` (a validar visualmente; não são texto).
`shell-900`, `shell-700` e `on-shell` ficam iguais nos dois temas (scanner e ícone já são escuros;
`shell-700` sobre `surface` escura precisa de par novo no contraste ou passa a usar `accent-ink`).

---

## 6. Dependências e Pré-condições

| Item | Estado atual | Ação necessária |
| --- | --- | --- |
| Tokens em CSS custom properties | variáveis Sass com hex | mapa `(claro, escuro)` + `$cp-x: var(--cp-x)`; partial `_tema.scss` só em `styles.scss` |
| Uso de tokens em funções Sass | nenhum | garantir com regra/revisão que ninguém passe `$cp-*` a `rgba()`/`color.*` (com `var()` quebra) |
| `scripts/contraste.mjs` | lê `$cp-x: #hex;` (um valor) | ler o mapa e conferir os pares nos dois temas (pré-condição para o CI aceitar a mudança) |
| Tema Material | `theme-type: light` | `theme-type: color-scheme`; conferir dialog, menu, datepicker, tooltip, snackbar no escuro |
| `color-scheme` | fixo `light` no `body` | sai do `body`; vai para o `:root` por `data-tema` (controla também inputs nativos e scrollbar) |
| Logo para fundo escuro | só versão clara (papel transparente, texto escuro) | gerar `logo-escuro.png`/`simbolo-escuro.png` em `gerar-icones.mjs` (símbolo do ícone escuro + texto recolorido claro); **validar a arte com o usuário** |
| `theme-color` | `#ffffff` fixo | duas metas com `media` + ajuste pelo serviço no modo forçado |
| Suporte a `light-dark()` | sem `.browserslistrc` (padrão do Angular 22) | conferir os navegadores alvo; abaixo de iOS 17.5 usar a variante de dois blocos |
| Ícones do seletor | fora do subset | acrescentar no `icon_names=` do `index.html`, em ordem alfabética |
| Script inline no `index.html` | não há CSP no `firebase.json` | ok hoje; documentar o hash se a CSP vier |
| e2e/axe | só claro | rodada com `colorScheme: 'dark'` |
| Gráficos | SVG por token/`currentcolor` | nada além dos tokens das séries e grade; validar visualmente |
| Botão do Google | hex oficiais em `botao-google.ts` | manter; conferir o botão (fundo/borda) no escuro |

Nenhuma dependência npm nova, Function ou regra do Firestore.

---

## 7. Critérios de Aceitação

- [ ] Com o SO em escuro e preferência "Sistema", o app abre escuro **sem piscar branco** (PWA fria,
      refresh e rotas fora do shell).
- [ ] Trocar o SO de claro para escuro com o app aberto muda o tema sem recarregar.
- [ ] "Aparência" no menu (drawer, rail e expandido) oferece Sistema/Claro/Escuro, marca a atual e é
      usável só por teclado; a escolha sobrevive a recarregar e a sair/entrar na conta.
- [ ] Nenhum SCSS de componente ganhou `prefers-color-scheme`/`[data-tema]`; os componentes seguem
      usando `$cp-*`.
- [ ] `npm run contraste` confere os dois temas e passa; `npm run lint` passa.
- [ ] Painel, notas (lista e detalhe), importação e prévia, sugestões, listas e conferência,
      produtos, estabelecimentos, região, configurações de IA e telas de conta conferidos no escuro
      (desktop e mobile): textos, badges de preço, chips, segmented, skeleton, avisos, inputs e
      `type="date"`, scrollbar e foco visível legíveis.
- [ ] Dialogs, menus, autocomplete, datepicker, tooltip e snackbar do Material no escuro.
- [ ] Gráficos do painel e do produto com séries, grade e rótulos legíveis no escuro, mantendo traço
      e marcador por série.
- [ ] Logo e símbolo legíveis no escuro (menu, rail, header, login/cadastro/redefinir), com um só
      download de imagem por posição.
- [ ] Barra do navegador/PWA na cor do header em cada tema.
- [ ] axe sem violações graves nas rotas do `a11y.spec.ts` também com `colorScheme: 'dark'`.
- [ ] `TemaService` com 100 % de cobertura; e2e do tema passa em `chromium` e `mobile`.
- [ ] Budgets do build de produção (`main` 500 kB, `anyComponentStyle`) dentro do limite, medidos no
      build antes e depois.
