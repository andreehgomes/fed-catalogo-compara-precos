# Análise: Sugestão de compra

**Data:** 2026-09-29
**Projeto:** fed-catalogo-compara-precos (Cupom Esperto)
**Escopo:** a partir das notas do **próprio usuário**, prever o que ele provavelmente precisa
comprar agora (produtos recorrentes cujo ciclo de recompra venceu ou está vencendo), sugerir a
quantidade habitual e mostrar a **lista completa** dos itens com o último preço pago, o mais
barato e o mais caro **que ele mesmo pagou**, e, como visão alternativa, a sugestão **por
mercado** baseada nesses mesmos preços. **Só entram preços das notas do usuário**: a base
comunitária e o Menor Preço ficam fora (D-05). É a primeira versão da "lista de compras"
(RF-22 da análise geral), montada automaticamente em vez de digitada.

---

## 1. Contexto

**O que já existe**

- **Histórico pessoal pronto no cliente.** `HistoricoPessoalStore`
  (`features/notas/data-access/historico-pessoal.store.ts`) lê as notas dos últimos 12 meses
  (até 20 páginas = 400 notas) uma vez por sessão e por `uid`, com cache e `invalidar()` após
  excluir nota e após `confirmarNfce`. As funções puras de `detalhe/historico-pessoal.ts` já
  fazem quase tudo o que esta feature precisa:
  - `consolidarItens` junta itens repetidos na mesma nota;
  - `montarGrupos` + `chaveDoGrupo` resolvem o grupo de equivalência (`vinculadoA`, inclusive
    vínculo automático por etiquetas/IA), de modo que o mesmo produto comprado em mercados
    diferentes vira uma série só;
  - `indexarCompras` monta `grupo → CompraPessoal[]` ordenado por data (com `cnpj`, `mercado`,
    `qtd`, `unidade`, `vlUnit`, `porUnidade`).
- `@shared/unidade`: `extrairConteudo` e `quantidadeNaUnidadeBase` permitem somar quantidades
  de embalagens diferentes (2 × 1 L + 1 × 2 L = 4 L).
- `ProdutosService`: `produtosPorIds` e `membrosDosGrupos` (lotes de 30 no `in`), para
  resolver os grupos de equivalência.
- Cada `CompraPessoal` já traz `vlUnit`, `porUnidade`, `cnpj`, `mercado` e `emissao`: os três
  preços do item (último, mais barato, mais caro) e o "por mercado" saem **do índice pessoal,
  sem nenhuma leitura extra**.
- Padrão de estado só no aparelho: `NotasAbertasService` (`localStorage`) para o "Nova", porque
  o cliente não grava em `usuarios/{uid}`.
- UI: `.cp-list-row`, `.cp-summary`, `.cp-chip`, `.cp-segmented`, `.cp-empty-state`,
  `<cp-preco>`, `<cp-fonte-preco>`, `<cp-badge-preco>`, `.cp-skeleton`.

**O que falta**

- Nenhuma regra de **recorrência**: hoje o histórico só responde "paguei mais ou menos que da
  última vez?", não "quando costumo comprar isto de novo?".
- O `HistoricoPessoalStore` resolve grupos **só dos produtos de uma nota**
  (`grupos(notas)` privado). A sugestão precisa dos grupos de **todos** os produtos da janela
  (ver RNF-01 e D-01).
- Não há tela nem item de menu para a sugestão, nem card no painel.
- Não há onde guardar "já tenho" / "não sugerir mais": as regras bloqueiam qualquer escrita do
  cliente em `usuarios/{uid}` (ver D-03).

## 2. Dados Disponíveis

| Fonte | O que dá | Acesso | Observação |
|---|---|---|---|
| `usuarios/{uid}/notas/{chave}` | Itens (`produtoId`, `qtd`, `unidade`, `vlUnit`, `precoPorUnidadeBase`), `cnpj`, `estabelecimentoNome`, `emissao` | Leitura do dono — via `HistoricoPessoalStore` (cache da sessão) | **Fonte principal**: datas e quantidades de cada compra |
| `produtos/{id}` | `vinculadoA`, `descricao`, `conteudo`, `menorPreco`, `ultimaObservacao`, `cnpjs` | Só leitura — `produtosPorIds`, `membrosDosGrupos` | Agrupa o mesmo produto entre mercados; nome canônico para exibir |
| `precos` (comunitário) | Preço por produto × estabelecimento × data | — | **Não usado** (D-05): mistura mercados do estado inteiro |
| `localStorage` | Itens dispensados / "já tenho até" | Só no aparelho | Padrão do `NotasAbertasService` (D-03) |
| Menor Preço | Ofertas da região | Navegador | **Não usado** (D-05); a regra do projeto o restringe a `/regiao` e "Tem mais barato perto?" |
| Claude API | — | Só Functions | **Não usada**: a regra é determinística e roda no cliente |

## 3. Requisitos Funcionais

**Detecção**

- **RF-01 — Produtos recorrentes.** Um produto (grupo de equivalência, `chaveDoGrupo`) é
  **recorrente** quando aparece em pelo menos **3 ocasiões de compra** na janela de 12 meses.
  Com 2 ocasiões ele pode aparecer só como "baixa confiança" (RF-05), nunca no topo.
- **RF-02 — Ocasião de compra.** Compras do mesmo grupo com menos de **2 dias** de diferença
  (ex.: dois mercados no mesmo fim de semana) contam como **uma ocasião**, somando as
  quantidades. Evita que um intervalo de 0–1 dia derrube o ciclo.
- **RF-03 — Ciclo de recompra.** Ciclo = **mediana** dos intervalos (em dias) entre ocasiões
  consecutivas (robusta a uma compra fora do padrão). Ciclos menores que 3 dias são tratados
  como 3. Produtos com ciclo acima de 120 dias ficam de fora (compra esporádica).
- **RF-04 — Quando comprar.** Próxima compra prevista = última ocasião + ciclo. Com
  `atraso = dias desde a última ocasião / ciclo`:
  - `atraso ≥ 1` → **"Hora de repor"** (vencido; mostra "comprou há N dias, costuma comprar a
    cada M");
  - `0,8 ≤ atraso < 1`, ou previsto dentro do **horizonte** (RF-10) → **"Em breve"**;
  - `atraso > 3` → não sugere (provavelmente parou de comprar); aparece só em "Parou de
    comprar?" colapsado, para o usuário dispensar.
- **RF-05 — Confiança.** Cada sugestão tem confiança `alta | media | baixa`, pela quantidade
  de ocasiões (≥ 5 / 3–4 / 2) e pela dispersão dos intervalos (coeficiente de variação > 0,6
  rebaixa um nível). A lista ordena por estado (vencido → em breve) e, dentro dele, por
  confiança e atraso. "Baixa" fica atrás de um "Mostrar mais N sugestões".
- **RF-06 — Quantidade sugerida.** Mediana da quantidade por ocasião. Quando todas as
  ocasiões têm quantidade na unidade base (`quantidadeNaUnidadeBase`), a mediana é calculada
  em kg/L/un e exibida como "≈ 2 L"; senão, na unidade comercial mais frequente
  ("≈ 3 UN"). Produto a granel (KG na unidade comercial) mostra "≈ 1,2 kg".

**Onde e quanto**

- **RF-07 — Três preços por item, só do que o usuário pagou.** Toda sugestão mostra, lado a
  lado, calculados sobre as compras do próprio usuário na janela de 12 meses (todas as
  ocasiões do grupo, em qualquer mercado onde ele comprou):
  - **Último preço pago** — a compra mais recente (data e mercado);
  - **Mais barato que pagou** — o menor preço entre as compras (data e mercado);
  - **Mais caro que pagou** — o maior preço entre as compras (data e mercado).
  Comparação por R$/unidade base quando todas as compras a têm (mesma regra de
  `escolherBase`), senão por `vlUnit` com mesma unidade comercial e mesmo conteúdo; compra
  incomparável (ex.: `UN` × `KG` sem unidade base) fica fora do mais barato/mais caro, mas
  continua no histórico. Toda data aparece junto do valor, porque um "mais barato" de 10 meses
  atrás pode não valer mais. Quando todas as compras têm o mesmo preço, mostra um valor só
  ("Sempre R$ 5,49"). O último pago ganha `<cp-badge-preco>` em relação ao mais barato que o
  usuário pagou ("R$ 0,80 acima do seu menor preço" / "É o seu menor preço").
- **RF-08 — Visão "Lista completa" (padrão).** Todos os itens sugeridos numa lista única,
  **sem agrupar por mercado**, nas seções "Hora de repor" e "Em breve" (RF-04). Cada linha:
  nome, quantidade sugerida, **último pago · mais barato · mais caro** (RF-07) e as ações
  (RF-12). No rodapé, dois totais estimados (preço × quantidade sugerida, só itens com preço):
  "pagando como da última vez" e "pagando o seu menor preço de cada item", com a diferença
  entre eles ("seu melhor cenário: R$ X a menos").
- **RF-09 — Visão "Por mercado".** Alternativa à lista (`.cp-segmented` "Lista completa ·
  Por mercado", em query param `?visao=`), baseada **só nos mercados onde o usuário já
  comprou** e no **último preço que ele pagou em cada um** (um por `cnpj`, para refletir o
  preço atual do mercado e não uma promoção antiga), com duas partes:
  - **Onde cada item saiu mais barato:** os itens selecionados agrupados pelo mercado onde o
    usuário pagou menos da última vez que comprou lá ("Mercado A — 7 itens, R$ 84,30";
    "Mercado B — 4 itens, R$ 31,10"), e o total "comprando cada item onde saiu mais barato:
    R$ X em N mercados". Item comprado num mercado só fica no grupo desse mercado.
  - **Um mercado só:** até 3 mercados (dos que o usuário frequenta) com itens cobertos (que ele
    já comprou lá), total estimado e o que falta, ordenados por **cobertura** e depois por
    **total**. O total de dois mercados só é comparado sobre os **mesmos itens** (os que os
    dois cobrem), para não premiar quem cobre menos.
  A visão por mercado não esconde nada: todo item da lista completa aparece em algum grupo.
- **RF-10 — Horizonte.** Seletor "Para comprar: **hoje** · **esta semana** · **próximos 15
  dias**" (`.cp-segmented`, padrão "esta semana"), em query param `?horizonte=`. Define até
  quando uma previsão entra como "Em breve".

**Interação**

- **RF-11 — Selecionar e ajustar.** Cada item tem checkbox (entra ou não nos totais do RF-08 e no RF-09)
  e a quantidade sugerida editável (stepper), sem persistir.
- **RF-12 — "Já tenho" e "Não sugerir mais".** Por item:
  - **Já tenho** → some até o próximo ciclo (guarda `grupo → data`; volta quando
    `hoje ≥ data + ciclo`);
  - **Não sugerir mais** → some sempre; listado em "Itens ocultos" com "Voltar a sugerir".
  Guardado por `uid` no `localStorage` (D-03). Importar uma nota com o produto reinicia o
  ciclo naturalmente (a última ocasião muda) e invalida o "já tenho".
- **RF-13 — Exportar a lista.** "Copiar lista" gera o texto da visão atual (lista completa:
  item, quantidade, último pago e mais barato com o mercado; por mercado: itens agrupados por
  mercado, com o total de cada um) e, onde houver `navigator.share`, "Compartilhar". Não salva
  a lista em lugar nenhum.
- **RF-14 — Detalhe do item.** Tocar no nome leva a `/produtos/:id` (canônico). Uma linha
  expansível mostra as últimas ocasiões (data, mercado, quantidade, preço) que justificam a
  sugestão ("Por que esta sugestão?").

**Onde aparece**

- **RF-15 — Tela `/sugestoes`.** Item de menu **"Sugestão de compra"** (`ITENS_NAV`, depois de
  "Minhas notas"), com: resumo (N itens para repor, total estimado, mercado sugerido), seletor
  de horizonte, seções "Hora de repor", "Em breve", "Mostrar mais" (baixa confiança) e
  "Parou de comprar?", alternância "Lista completa · Por mercado" (RF-08, RF-09), ações de
  exportar.
- **RF-16 — Card no painel.** "Hora de repor" com até 5 itens vencidos (nome, "há N dias") e
  link "Ver sugestão completa". Em `@defer (on viewport)`; some se não houver sugestão.
- **RF-17 — Estados.**
  - Carregando: skeleton na lista.
  - **Histórico insuficiente** (menos de 3 notas ou nenhum recorrente): estado vazio
    explicando "Importe suas notas por algumas semanas; a sugestão aparece quando um produto
    se repete" + atalho "Importar nota".
  - Item sem compra comparável (unidades incompatíveis): mostra só o último preço pago e fica
    fora do "no seu menor preço".
  - Erro na leitura: `cp-info-block--erro` com "Tentar de novo".
- **RF-18 — Atualização.** Usa o cache do `HistoricoPessoalStore`: importar ou excluir nota
  (que já chamam `invalidar()`) refaz a sugestão na próxima abertura. A data de referência é
  "hoje" do aparelho.

## 4. Requisitos Não Funcionais

- **RNF-01 — Custo de leitura e desempenho.** As notas vêm do cache da sessão (≤ 400
  leituras, compartilhadas com o histórico da nota). Resolver grupos de **todos** os produtos
  distintos da janela custa ≈ `produtos distintos / 30` consultas `in` (ex.: 600 produtos →
  20 consultas / 600 leituras) mais os `membrosDosGrupos`, também com cache no store. Para
  reduzir: resolver grupos só dos `produtoId` com **≥ 2 ocasiões** por si ou que sejam `loc:`
  (o `ean:` já é canônico na maioria dos casos). Os preços saem do índice pessoal, **sem
  leitura extra**. O cálculo (índice + ciclos + cestas) é função pura em `Map`,
  **< 50 ms** para 400 notas × 30 itens.
- **RNF-02 — Bundle.** Rota lazy (`loadComponent`), nada no `main`. O card do painel em
  `@defer (on viewport)` e importando só a função pura + o store. Estilos por classes globais;
  SCSS da tela abaixo do aviso de 6 kB do `anyComponentStyle`.
- **RNF-03 — Responsividade.** Mobile (≤ 599): lista em linhas com checkbox, nome, "≈ qtd" e
  último pago · mais barato · mais caro em linha própria abaixo do nome; visão por mercado
  em blocos empilhados; ações de exportar num botão fixo
  sem colidir com o FAB "Importar nota" (esconder o FAB nesta rota ou posicionar acima).
  Desktop (≥ 1024): os três preços em colunas alinhadas; na visão por mercado, "Um mercado
  só" como painel lateral (`cp-grid`).
  Breakpoint em TS só por `BreakpointService`.
- **RNF-04 — Acessibilidade (WCAG AA).** Checkboxes e stepper nativos com `<label>`; seções
  com `<h2>`; resumo e total estimado em `role="status"` (anuncia ao mudar seleção/horizonte);
  expansão com `<button aria-expanded aria-controls>`; estados "Hora de repor"/"Em breve" com
  ícone + texto (nunca só cor); ações "Já tenho"/"Não sugerir mais" com texto acessível que
  inclui o nome do produto; axe sem violações; par novo de cor → `scripts/contraste.mjs`.
- **RNF-05 — Manutenibilidade.** Standalone, OnPush explícito, `inject()`, `input()`/`output()`,
  signals (`resource` para a carga, `computed` para sugestões e cestas, `linkedSignal` para a
  seleção que se reinicia quando o horizonte muda), control flow com `track`. Regra toda em
  funções puras (`sugestao.ts`) sem Angular; o store só orquestra. Reaproveitar
  `indexarCompras`/`montarGrupos` e extrair de `escolherBase` uma função exportada de
  comparabilidade em vez de duplicar a regra.
- **RNF-06 — Testabilidade.** Vitest com 100 % das funções puras: ocasiões (junção < 2 dias),
  mediana de intervalos, limites de 3/120 dias, estados por `atraso` (0,79 / 0,8 / 1 / 3,01),
  confiança e coeficiente de variação, quantidade em unidade base × comercial, preços
  (mais barato/mais caro/último pago sobre as compras do usuário, compra incomparável fora,
  todas iguais → "Sempre R$ X", unidade base × `vlUnit`), último preço por mercado, totais da
  lista completa, agrupamento pelo mercado onde saiu mais barato, cesta por cobertura e total sobre os mesmos itens,
  "já tenho" expirando no ciclo seguinte. Relógio injetado (parâmetro `hoje`), nunca
  `new Date()` dentro da regra. Componente com `FIRESTORE_API` fake (sem `vi.mock` de
  Firebase). Fixture sintética de 12 meses com produtos semanais, quinzenais, esporádicos e
  abandonados (gerada, não anonimizada: não há cupom real que cubra isso). e2e: um cenário
  por papel/label.
- **RNF-07 — Segurança e privacidade.** Só lê as notas do próprio usuário e coleções de
  leitura pública. **Nada é gravado no Firestore** e nada sai do aparelho (sem Functions, sem
  Claude API, sem Menor Preço, sem base comunitária). O `localStorage` guarda só ids de grupo e datas, com
  chave por `uid`, e é limpo no `sair()`. Sem mudança em `firestore.rules`.
- **RNF-08 — Internacionalização.** O projeto não usa ngx-translate: textos em pt-BR no
  template, `LOCALE_ID` pt-BR, `currency` BRL, datas `dd/MM`, plural por `@switch`/`ICU`
  simples ("1 item" / "N itens").
- **RNF-09 — Transparência.** Toda sugestão é explicável na tela ("costuma comprar a cada 7
  dias, última vez há 9 dias no Mercado X") e todo preço mostra fonte e data.

## 5. Estrutura de Componentes Proposta

```
shared/                                   # (sem mudança; unidade.ts e model.ts reaproveitados)

src/app/features/notas/detalhe/
└── historico-pessoal.ts                  # exportar a regra de comparabilidade de unidade
                                          #   (hoje dentro de escolherBase) para reuso

src/app/features/notas/data-access/
└── historico-pessoal.store.ts            # novo método público: indice() → notas da janela +
                                          #   grupos de todos os produtos (cache por sessão)

src/app/features/sugestoes/
├── sugestoes.routes.ts                   # rota '' → sugestoes.page (title "Sugestão de compra")
├── sugestao.ts                           # PURO: ocasioes, ciclo, estadoDaSugestao, confianca,
│                                         #   quantidadeSugerida, sugerir(indice, hoje, horizonte,
│                                         #   dispensados), faixaDePreco
│                                         #   (último pago · mais barato · mais caro),
│                                         #   totaisDaLista, agruparPorMaisBarato, montarCestas
├── sugestao.spec.ts
├── data-access/
│   ├── sugestoes.store.ts                # root: resource (histórico + grupos + preços),
│   │                                     #   computed de sugestões e cestas
│   └── dispensados.service.ts            # localStorage por uid: 'ja-tenho' (com data) e
│                                         #   'nunca'; limpo no sair()
├── sugestoes.page.ts|html|scss           # resumo, horizonte (?horizonte=), visão (?visao=
│                                         #   lista|mercado), seções, exportar
├── ui/
│   ├── sugestao-item.ts                  # <cp-sugestao-item>: checkbox, qtd, ações,
│   │                                     #   "Por que esta sugestão?"
│   ├── faixa-preco.ts                    # <cp-faixa-preco [faixa]>: último pago · mais
│   │                                     #   barato · mais caro, com mercado e data
│   ├── lista-completa.ts                 # <cp-lista-completa>: seções + totais (RF-08)
│   └── por-mercado.ts                    # <cp-por-mercado>: grupos por onde saiu mais barato +
│                                         #   "um mercado só" (RF-09)
└── sugestoes.spec.ts

src/app/features/painel/
└── hora-de-repor.ts                      # <cp-hora-de-repor> em @defer (on viewport)

src/app/core/layout/shell.ts              # ITENS_NAV + "Sugestão de compra"
src/app/app.routes.ts                     # path 'sugestoes' (loadChildren)
src/testing/fixtures/sugestao/            # notas sintéticas de 12 meses
e2e/sugestoes.spec.ts
```

Tipos principais (em `sugestao.ts`):

```ts
type EstadoSugestao = 'repor' | 'em-breve' | 'parou';
type Confianca = 'alta' | 'media' | 'baixa';
type Horizonte = 'hoje' | 'semana' | 'quinzena';

interface Ocasiao { data: string; compras: CompraPessoal[]; quantidade: number | null }

interface Sugestao {
  grupo: string;                 // chaveDoGrupo (produto canônico)
  descricao: string;
  estado: EstadoSugestao;
  confianca: Confianca;
  cicloDias: number;
  diasDesdeUltima: number;
  proximaPrevista: string;
  quantidade: { valor: number; unidade: string };   // "≈ 2 L" / "≈ 3 UN"
  ultimaCompra: CompraPessoal;
  ocasioes: Ocasiao[];
}

interface FaixaDePreco {
  ultimoPago: CompraPessoal;
  maisBarato: CompraPessoal | null;         // null = nenhuma compra comparável
  maisCaro: CompraPessoal | null;           // igual ao maisBarato → "Sempre R$ X"
  base: BaseComparacao;
}

/** Último preço que o usuário pagou em cada mercado, para a visão por mercado. */
type UltimoPorMercado = ReadonlyMap<string /* cnpj */, CompraPessoal>;

interface TotaisDaLista { comoDaUltimaVez: number; noMenorPreco: number; economia: number;
  itensComPreco: number; itens: number }

interface GrupoPorMercado { cnpj: string; itens: string[]; total: number }

interface Cesta { cnpj: string; cobertos: string[]; faltando: string[]; total: number }
```

## 6. Dependências e Pré-condições

| Item | Estado atual | Ação necessária |
|---|---|---|
| Notas da janela em cache | `HistoricoPessoalStore` (privado) | Expor leitura das notas + grupos de todos os produtos, mantendo o cache e o `invalidar()` |
| Grupos de todos os produtos | Só por nota (`grupos(notas)`) | Generalizar para uma lista de ids com os caches existentes (`produtosCache`, `membrosCache`) |
| Regra de comparabilidade de unidade | Privada em `escolherBase` | Extrair e exportar; reusar em `precoRecente` |
| `quantidadeNaUnidadeBase` | `@shared/unidade` | Nenhuma |
| Persistência de "já tenho"/"não sugerir" | Regras proíbem escrita em `usuarios/{uid}` | v1 em `localStorage` (D-03); limpar em `AuthStore.sair()` |
| Ícones novos (`event_repeat`, `share`, `visibility_off`) | Subset em `index.html` (`content_copy`, `shopping_basket`, `schedule` já existem) | Acrescentar em `icon_names=` (ordem alfabética) |
| Item de menu e rota | Não existem | `ITENS_NAV` + `app.routes.ts`; atualizar `shell.spec.ts` (lista de rótulos) |
| FAB "Importar nota" no mobile | Fixo no shell | Evitar sobreposição com a barra de ações da tela |
| Volume de histórico no dv | Poucas notas do usuário de teste | Validar a regra com a fixture sintética; no dv, conferir manualmente com as notas reais |
| Firestore rules / Functions / índices | Suficientes | Nenhuma mudança |

**Decisões em aberto**

- **D-01 — Cálculo no cliente (recomendado para a v1)** × agregado por Function
  (`usuarios/{uid}/recorrencia/{grupo}` atualizado em `gravarNota`). O cliente reaproveita o
  cache do histórico pessoal e não cria infraestrutura; custa as leituras de `produtos` para
  resolver grupos (RNF-01). O agregado só compensa se o usuário passar de ~400 notas/ano ou
  se quisermos notificação push "hora de repor" (que exige servidor).
- **D-02 — Parâmetros da regra.** Mínimo de 3 ocasiões, junção < 2 dias, ciclo entre 3 e 120
  dias, "em breve" a partir de 0,8 do ciclo, "parou" acima de 3 ciclos. Ficam como constantes exportadas em `sugestao.ts`; ajustar depois de ver notas reais.
- **D-03 — Onde guardar "já tenho"/"não sugerir mais".** v1 no `localStorage` (só no
  aparelho, como `NotasAbertasService`). Alternativa: subcoleção
  `usuarios/{uid}/preferencias` com regra de escrita do dono — muda a regra "cliente não
  escreve em `usuarios/{uid}`" e exige checklist novo de regras; só se o usuário usar em mais
  de um aparelho.
- **D-04 — Janela dos preços.** Mais barato/mais caro sobre os 12 meses inteiros (é o
  histórico que o usuário tem), com a data sempre visível. Se a inflação tornar o "mais
  barato" pouco útil, restringir a faixa aos últimos 6 meses é só mudar uma constante.
- **D-05 — Só preços do usuário (decidido pelo usuário em 2026-09-29).** A base comunitária
  `precos` e o Menor Preço **não entram**: o Paraná é grande e o preço varia por região (a
  Coca-Cola de Pato Branco não diz nada a quem compra em Joaquim Távora ou Santo Antônio da
  Platina). Comparar com preços de outros compradores fica para **outra funcionalidade**, que
  precisa de recorte regional: `precos` hoje só tem `cnpj`, e a cidade está em
  `estabelecimentos/{cnpj}`; exigiria gravar `cidade`/`geohash` no preço (atributo novo na
  publicação, com índice) ou filtrar pelos mercados da cidade do usuário.

**Riscos**

- **R-01 — Vínculo incompleto.** Produto `loc:` sem vínculo comprado em dois mercados vira
  duas séries com poucas ocasiões cada e pode não ser sugerido. A qualidade depende do
  vínculo automático; a expansão "Por que esta sugestão?" ajuda o usuário a perceber.
- **R-02 — Nem toda compra vira nota.** Compras sem cupom importado alongam o ciclo aparente;
  o "Já tenho" é a correção manual.
- **R-03 — Poucos mercados.** Quem compra quase sempre no mesmo mercado terá uma visão "por
  mercado" pobre (tudo num grupo só); é esperado, e a lista completa continua útil.
- **R-04 — Leituras.** Usuário com muitas notas e muitos produtos distintos pode chegar a
  ~1.000 leituras na primeira abertura da sessão; medir no dv antes de decidir entre D-01 e o
  agregado.

## 7. Critérios de Aceitação

- [ ] Produto comprado em ≥ 3 ocasiões com ciclo regular aparece em "Hora de repor" quando
      os dias desde a última compra passam do ciclo, com o texto "costuma comprar a cada N
      dias, última vez há M dias".
- [ ] Produto com 0,8 ≤ atraso < 1, ou previsto dentro do horizonte, aparece em "Em breve";
      trocar o horizonte muda a lista e o query param.
- [ ] Compras do mesmo produto com menos de 2 dias de diferença contam como uma ocasião.
- [ ] Produto comprado em mercados diferentes e vinculado (mesmo canônico) forma uma série só.
- [ ] Produtos com ciclo > 120 dias, com menos de 2 ocasiões ou com atraso > 3 não aparecem
      nas seções principais (os de atraso > 3 ficam em "Parou de comprar?").
- [ ] A quantidade sugerida é a mediana das ocasiões, em unidade base quando possível
      ("≈ 2 L", "≈ 1,2 kg").
- [ ] Cada item mostra **último preço pago**, **mais barato** e **mais caro** calculados só
      sobre as compras do próprio usuário, cada um com data e mercado; preços iguais mostram
      "Sempre R$ X".
- [ ] Nenhuma leitura de `precos` nem chamada ao Menor Preço (verificável pelos fakes).
- [ ] A visão "Lista completa" (padrão) mostra todos os itens sugeridos sem agrupar por
      mercado, com os totais "como da última vez" e "no seu menor preço" e a diferença.
- [ ] A visão "Por mercado" usa só os mercados onde o usuário comprou e o último preço pago em
      cada um, agrupa os itens por onde saíram mais barato e mostra até 3 mercados com
      cobertura e total ("um mercado só"); todo item da lista aparece em algum
      grupo; a visão fica em `?visao=`.
- [ ] Desmarcar um item recalcula os totais das duas visões.
- [ ] "Já tenho" esconde o item até o próximo ciclo; "Não sugerir mais" esconde até "Voltar a
      sugerir"; ambos sobrevivem a recarregar a página e são por `uid`.
- [ ] "Copiar lista" gera o texto da visão atual (lista completa ou por mercado); "Compartilhar" só aparece
      com `navigator.share`.
- [ ] Menos de 3 notas ou nenhum recorrente → estado vazio com atalho "Importar nota".
- [ ] O painel mostra "Hora de repor" com até 5 itens e link para `/sugestoes`, e some sem
      sugestão.
- [ ] Abrir `/sugestoes` depois do detalhe de uma nota na mesma sessão não relê as notas
      (verificável pelo fake de `getDocs`).
- [ ] Nenhuma escrita no Firestore e nenhuma chamada a Functions, Menor Preço ou Claude API.
- [ ] Axe sem violações em `/sugestoes`; estados com ícone + texto.
- [ ] `npm run lint`, `npm run test:ci`, `npm run contraste` e build de produção verdes, sem
      estourar budget; `main` não cresce.
