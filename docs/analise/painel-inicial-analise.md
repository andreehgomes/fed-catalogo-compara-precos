# Análise: Painel inicial com gráficos e destaques

**Data:** 2026-10-25
**Projeto:** fed-catalogo-compara-precos (Cupom Esperto)
**Escopo:** enriquecer o painel (`/`) com **gráficos de gastos**, **economia e gasto a mais** contra o
melhor preço do próprio usuário, **preços que mais subiram** e **onde mais gasta**, e mostrar nas
**últimas notas** se cada compra saiu mais cara ou mais barata (o saldo que a lista de notas já
mostra). Tudo com **os preços das notas do próprio usuário** (mesma regra da sugestão de compra e do
"comparado com seu melhor preço"): nada de base comunitária sem recorte regional nem Menor Preço.

---

## 1. Contexto

**O que existe hoje no painel** (`features/painel/`)

- `painel.page.ts`: um `resource` que lê, a cada abertura, as notas do **mês atual**, as do **mês
  passado** (`NotasService.todas`) e a primeira página da lista (`listar({})`), e depois
  `produtosPorIds` dos itens do mês.
- Resumo (`.cp-summary`) com três números: **gasto no mês** (com variação % contra o mês passado
  inteiro), **notas no mês** e **economia possível**.
- **Últimas notas**: 5 linhas com mercado, data, nº de itens e total. **Sem saldo**: não diz se a
  compra saiu mais cara ou mais barata.
- Blocos que já existem: pendentes, `<cp-lista-em-andamento>`, `<cp-hora-de-repor>` (ambos em
  `@defer`), atalhos e o estado inicial em 3 passos.

**Problemas do painel atual**

1. **"Economia possível" usa a base comunitária** (`produto.menorPreco`, `economiaPotencial` em
   `painel.calculos.ts`): o menor preço de qualquer mercado do Paraná. Isso contraria a decisão de
   que features pessoais usam só os preços do usuário (o preço de outra região não serve) e diverge
   do número que o usuário vê no detalhe da nota e na lista de notas ("a mais" / "de economia").
2. **Variação injusta**: compara o mês corrente **parcial** com o mês passado **inteiro**. No dia 5,
   quase sempre aparece "−80 %".
3. **Mês vazio**: o usuário compra **uma vez por mês** (histórico curto no dv). Nos dias antes da
   compra do mês, o resumo mostra R$ 0,00 e "você pagou o menor preço conhecido", que não informa
   nada.
4. Nenhum gráfico e nenhum destaque de preço no painel; a informação existe só dentro de cada nota.

**O que já está pronto e pode ser reaproveitado**

- `HistoricoPessoalStore` (`features/notas/data-access/historico-pessoal.store.ts`): notas dos
  últimos **12 meses** (até 400), lidas **uma vez por sessão** e compartilhadas com a lista de notas,
  o detalhe e a sugestão de compra; `versao` muda no `invalidar()` (após confirmar ou excluir nota).
  - `resumir(notas)` → `Map<chave, ResumoHistorico>` (`aMais`, `economia`, `saldo`, `itensAcima`,
    `itensNovoMelhor`, `comparados`): **é exatamente o saldo que falta nas últimas notas**, e somado
    dá o saldo do mês.
  - `comparar(nota)` / `compararNota` → `ComparacaoComValores` por item (`impacto`, `economia`,
    `percentual`, `referencia` com mercado e data do melhor preço) e `destaques()` (altas por impacto,
    quedas por economia), já usados nos cards "Ficaram mais caros/baratos" do detalhe.
  - `indiceCompleto()` → `{ notas, grupos, indice }`: todas as compras da janela agrupadas por
    produto/grupo de vínculo, com `vlUnit`, `porUnidade`, `cnpj`, `mercado`, `emissao`. Base para
    "preços que mais subiram" e "onde mais gasta".
  - `baseComum(compras)` decide se as compras de um grupo são comparáveis (mesma unidade comercial ou
    R$/unidade base).
- Saldo na lista de notas (`notas-lista.page.html`, classes `.notas-saldo--mais-caro/--mais-barato`,
  ícones `trending_up`/`trending_down`, "a mais" / "de economia" / "Saldo zerado"): hoje está
  **inline** na página; precisa virar componente para o painel usar o mesmo visual.
- `<cp-grafico-historico>` (`shared/ui/grafico-historico/`): gráfico de linhas em **SVG próprio, sem
  biblioteca**, com tabela `cp-sr-only`, traço/marcador diferente por série e tokens `$cp-serie-1..5`.
  É o padrão a seguir para os gráficos novos (barras).
- Tokens de preço `$cp-cheaper`/`$cp-pricier` (+ `-soft`), `<cp-badge-preco>` (ícone + texto + cor),
  `.cp-summary`, `.cp-block`, `.cp-list-row`, `.cp-segmented`, `.cp-skeleton`.
- `intervaloDe` / query params de `/notas` (`periodo`, `de`, `ate`, `cnpj`, `itens`): os gráficos podem
  levar à lista já filtrada.
- `nomeDoItem` / `item.nome || item.descricao` para exibir o nome legível.

**O que falta**

- Funções puras de agregação por período (gasto por mês, por mercado, saldo do período, maiores
  altas do período, produtos que mais subiram, onde mais gasta).
- Componentes de gráfico de **barras** (vertical por mês, horizontal por mercado).
- Componente de saldo reutilizável.
- Categoria de produto: **não existe** (`etiquetas.tipo` é a primeira palavra da descrição, granular
  demais: "REFR", "ARROZ", "DES"). "Gasto por categoria" fica fora desta análise (ver D-06).

## 2. Dados Disponíveis

| Fonte | O que dá | Acesso | Observação |
|---|---|---|---|
| `HistoricoPessoalStore.indiceCompleto()` | Notas dos 12 meses + índice grupo → compras | Cache da sessão (1 leitura de até 20 páginas) | **Fonte principal** de todos os blocos novos |
| `HistoricoPessoalStore.resumir(notas)` | Saldo, a mais e economia por nota | Mesmo cache + grupos dos produtos das notas | Saldo das últimas notas e do mês |
| `compararNota` / `destaques` (puras) | Itens acima do melhor preço e novos melhores | Em memória | "Onde você pagou mais" / "Onde economizou" |
| `usuarios/{uid}/notas` (`NotasService`) | Notas por período | Leitura do dono | Hoje lido 3× por abertura; passa a vir do histórico |
| `produtos/{id}` | `nome`, `descricao`, `vinculadoA`, `menorPreco` | Só leitura | `menorPreco` **deixa de ser usado** no painel (D-02) |
| `ApelidosService` | Apelido por CNPJ | `onSnapshot` | `nota.estabelecimentoNome` já vem com o apelido gravado |
| `precos` comunitário / Menor Preço | — | — | **Não usados** (sem recorte regional) |

Volume esperado: histórico curto (dezenas de notas no dv, compra mensal); o pior caso suportado é o
teto do histórico (400 notas × ~30 itens = 12 mil itens), agregado em memória em poucos ms.

## 3. Requisitos Funcionais

**Período de referência**

- **RF-01** — O painel resume um **mês de referência**: o mês atual quando já tem nota; senão, o
  **último mês com nota** (rotulado, ex.: "Setembro"), para que o painel não fique zerado antes da
  compra do mês. Um seletor `.cp-segmented` permite trocar entre "Este mês" e "Mês passado" (D-03).

**Resumo**

- **RF-02** — Card **Gasto no mês**: total do mês de referência e a variação contra o **mesmo período
  do mês anterior** (do dia 1 até o mesmo dia) quando o mês está em curso, e contra o mês anterior
  inteiro quando o mês já fechou. O texto diz qual comparação está sendo feita. Sem base → sem
  variação.
- **RF-03** — Card **Saldo contra seu melhor preço** (substitui "Economia possível"): soma do
  `ResumoHistorico` das notas do mês — saldo líquido em destaque ("R$ 12,40 a mais", "R$ 3,10 de
  economia" ou "zerado"), com as duas parcelas abaixo ("R$ 15,50 a mais em 6 itens · R$ 3,10 de
  economia em 2 itens"). Cor e ícone de `$cp-pricier`/`$cp-cheaper` com texto (nunca só cor). Sem
  item comparável → "Importe mais notas para comparar preços" em vez de R$ 0,00.
- **RF-04** — Card **Notas e ticket médio**: nº de notas do mês e valor médio por compra.

**Gráficos**

- **RF-05** — **Gastos por mês**: barras verticais dos **últimos 6 meses** (até 12 no desktop, D-04),
  mês de referência destacado, mês em curso marcado como parcial, linha da média dos meses fechados.
  Cada barra mostra o valor (rótulo ou `<title>`) e é um link para `/notas?periodo=personalizado&de=…&ate=…`.
  Com menos de 2 meses com nota, mostra as barras **por compra** (uma por nota) em vez de por mês.
- **RF-06** — **Saldo por mês** (no mesmo bloco, alternado por `.cp-segmented` "Gasto | Saldo"): barras
  divergentes a partir do zero — para cima "a mais" (`$cp-pricier`), para baixo "economia"
  (`$cp-cheaper`) — mostrando se o usuário está comprando melhor com o tempo.
- **RF-07** — **Onde você gastou**: barras horizontais por mercado no mês de referência (top 5 +
  "Outros"), com valor, % do total e nº de notas; cada linha leva a `/notas?cnpj=…`.

**Destaques de preço**

- **RF-08** — **Onde você pagou mais** no mês: até 5 itens acima do seu melhor preço recente, por
  impacto (diferença × quantidade), com nome legível, "R$ X a mais", percentual e onde estava mais
  barato ("R$ 7,99 no Mercado Y em 02/10"). Link para o produto. Reaproveita `compararNota` +
  `destaques` sobre as notas do mês.
- **RF-09** — **Onde você economizou** no mês: até 5 novos melhores preços, por economia. Some se não
  houver.
- **RF-10** — **Preços que mais subiram**: produtos comprados **2 vezes ou mais** nos 12 meses (mesma
  base em `baseComum`), ordenados pela alta percentual entre a **primeira** compra da janela e a
  **última** (D-05), só altas ≥ 5 % e diferença ≥ R$ 0,10; até 5, com "de R$ A para R$ B (+N %)" e as
  datas. Funciona com 2 compras (histórico curto).
- **RF-11** — **Onde mais gasta**: produtos com maior valor somado nos últimos 3 meses (top 5), com
  quantidade comprada e nº de compras. Ajuda a ver onde vale a pena prestar atenção.

**Últimas notas**

- **RF-12** — Cada linha das **Últimas notas** mostra o saldo da nota contra o melhor preço (mesmo
  componente e texto da lista de notas: "R$ X a mais", "R$ X de economia", "Saldo zerado"); nota sem
  item comparável não mostra nada. Falha no histórico só esconde o saldo, a lista continua.

**Estados e comportamento**

- **RF-13** — Cada bloco carrega e falha **de forma independente**: skeleton próprio; erro no
  histórico mostra aviso compacto com "Tentar de novo" só naquele bloco; resumo e últimas notas não
  esperam os gráficos.
- **RF-14** — Bloco sem dado suficiente some ou mostra uma frase curta do que falta (ex.: "Os preços
  que subiram aparecem quando você comprar o mesmo produto duas vezes"), nunca um gráfico vazio.
- **RF-15** — Após confirmar ou excluir nota (`HistoricoPessoalStore.versao` muda), o painel recalcula
  sem recarregar a página.
- **RF-16** — Ordem no celular: atalhos → pendentes → lista em andamento → resumo (RF-02..04) →
  últimas notas → gastos por mês → onde você pagou mais/economizou → preços que mais subiram → onde
  gastou → onde mais gasta → hora de repor. No desktop, os cards em grade de 2 colunas.
- **RF-17** — Estado sem nenhuma nota (3 passos) continua igual.

## 4. Requisitos Não Funcionais

- **RNF-01 (Desempenho — leituras)** — O painel deixa de fazer as 3 leituras próprias por abertura e
  passa a usar o cache do `HistoricoPessoalStore` (a mesma leitura serve lista de notas, detalhe e
  sugestões). As últimas notas continuam vindo de `listar({})` (1 página) para não depender da
  janela de 12 meses e aparecerem rápido; o resumo e os gráficos esperam o histórico. Os grupos são os
  do `indiceCompleto()` (`loc:` e produtos em ≥ 2 notas) mais os das notas do mês (`resumir`).
- **RNF-02 (Desempenho — bundle)** — **Sem biblioteca de gráfico**: barras em SVG próprio, no padrão
  do `<cp-grafico-historico>`. Painel continua lazy; blocos abaixo da dobra em `@defer (on viewport)`
  com placeholder de altura fixa (sem CLS). Nada novo no bundle inicial (500 kB). Estilo de cada
  componente < 6 kB (`anyComponentStyle`); mixin só para o parametrizado.
- **RNF-03 (Desempenho — cálculo)** — Agregações em funções puras, `computed` sobre o índice; 400
  notas agregadas em < 20 ms num celular médio. Nada gravado no Firestore.
- **RNF-04 (Responsividade)** — Celular (≤ 599): uma coluna, gráfico de meses com 6 barras e rótulos
  de mês abreviados ("set", "out"); tablet/desktop: grade de 2 colunas (`cp-grid`), até 12 meses.
  Sem rolagem horizontal; SVG com `viewBox` e largura 100 %. Breakpoint em TS só pelo
  `BreakpointService`.
- **RNF-05 (Acessibilidade — WCAG AA)** — Todo gráfico com `role="img"` + `aria-label` resumido e uma
  **tabela equivalente** `cp-sr-only`; barras-link focáveis com nome acessível ("Outubro: R$ 812,40,
  ver notas"). Cor nunca é a única pista (ícone + texto "a mais"/"de economia"; barras com padrão ou
  rótulo). Pares novos de cor no `scripts/contraste.mjs` (texto 4,5:1, barras/ícones 3:1). Títulos
  `h2` por bloco com `aria-labelledby`.
- **RNF-06 (Manutenibilidade)** — Standalone, OnPush, `inject()`, `input()`, signals; estado do painel
  num store provido na página (`resource` + `computed`), regras puras em `painel.calculos.ts`. O
  saldo da nota vira componente compartilhado usado pelo painel **e** pela lista de notas (sem
  duplicar template). Cor só por token `$cp-*`; textos pt-BR no template; `currency` padrão BRL.
- **RNF-07 (Testabilidade)** — 100 % de cobertura nas funções puras novas, com a fixture de 12 meses
  da sugestão (`src/testing/fixtures/sugestao/`) **e** um cenário de histórico curto (2 notas em 2
  meses, compra mensal) e mês atual vazio. `RELOGIO` fixa a data. Specs de componente com o store
  falso; e2e do painel com seletores por papel/label e axe sem violações.
- **RNF-08 (Segurança/privacidade)** — Só leitura das notas do dono (regras atuais bastam); nenhuma
  escrita nova; nenhum dado sai do aparelho; nada de `innerHTML` (nomes de produto e mercado
  interpolados pelo Angular).
- **RNF-09 (i18n)** — O app não usa ngx-translate: textos pt-BR no template, `LOCALE_ID` pt-BR, nomes
  de mês pelo `DatePipe` (`MMM`/`MMMM`).

## 5. Estrutura de Componentes Proposta

```
src/app/features/painel/
├── painel.page.ts|html|scss        # orquestra; provê o PainelStore
├── painel.store.ts                 # resource sobre indiceCompleto()/resumir(), versao, mês de referência
├── painel.calculos.ts              # puro: mesDeReferencia, totalDe, variacaoComparavel,
│                                   #   gastosPorMes, saldosPorMes, gastoPorMercado, saldoDoPeriodo,
│                                   #   destaquesDoPeriodo, precosQueSubiram, ondeMaisGasta
├── painel.calculos.spec.ts
├── hora-de-repor.ts                # (existente)
└── ui/
    ├── lista-em-andamento.ts       # (existente)
    ├── resumo-mes.ts               # cards RF-02..04 + seletor do mês
    ├── grafico-meses.ts            # barras verticais (gasto | saldo divergente) + tabela sr-only
    ├── gasto-por-mercado.ts        # barras horizontais (HTML/CSS, sem SVG)
    ├── destaques-precos.ts         # "pagou mais" / "economizou" (RF-08/09)
    ├── precos-que-subiram.ts       # RF-10
    └── onde-mais-gasta.ts          # RF-11

src/app/shared/ui/saldo-nota/
└── saldo-nota.ts                   # <cp-saldo-nota [saldo]> — extraído de notas-lista (RF-12)
```

`HistoricoPessoalStore` não muda de forma: usa-se `indiceCompleto()` e `resumir()`. Se for preciso
expor as notas sem os grupos, acrescentar um método público fino em vez de duplicar a leitura.

## 6. Dependências e Pré-condições

| Item | Estado atual | Ação necessária |
|---|---|---|
| `HistoricoPessoalStore` (`indiceCompleto`, `resumir`, `versao`) | Pronto | Reaproveitar; nenhuma mudança obrigatória |
| `compararNota`, `destaques`, `baseComum`, `chaveDoGrupo` | Prontos e testados | Reaproveitar nas funções do painel |
| Saldo da nota | Inline em `notas-lista.page.html` | Extrair `<cp-saldo-nota>` e usar nas duas telas |
| Gráfico de barras | Não existe (só linhas) | Criar em SVG próprio no padrão do `<cp-grafico-historico>` |
| `economiaPotencial` (base comunitária) | Em uso no painel | Remover do painel (D-02) |
| Tokens de cor | `$cp-cheaper`, `$cp-pricier`, `$cp-serie-*` existem | Talvez um token para a barra "parcial"/média; registrar pares no `contraste.mjs` |
| Ícones Material Symbols | Subset no `index.html` | Acrescentar os novos em ordem alfabética (ex.: `bar_chart`, `storefront`, `show_chart`) |
| Categoria de produto | Não existe | Fora do escopo (D-06) |
| Dados no dv | Histórico curto, compra mensal | Validar o painel com os dados reais do usuário no dv antes de fechar |

**Decisões propostas (confirmar no plano)**

- **D-01** — Tudo com os preços do próprio usuário (histórico pessoal); nada comunitário nem Menor
  Preço no painel.
- **D-02** — "Economia possível" pela base comunitária sai; entra o saldo contra o melhor preço
  pessoal (mesmo número da nota e da lista).
- **D-03** — Mês de referência = mês atual com nota, senão o último mês com nota; seletor só "Este mês
  / Mês passado" (períodos maiores ficam nos gráficos e na lista de notas).
- **D-04** — Gráfico de meses: 6 meses no celular, 12 no desktop; por compra quando há menos de 2 meses
  com nota.
- **D-05** — "Preços que mais subiram" compara a **primeira** compra da janela de 12 meses com a
  **última**: é a tendência do preço no período e não acusa alta só porque a menor compra foi uma
  promoção. Com 2 compras, primeira = penúltima. **Alternativa:** penúltima × última (mais recente,
  porém mais ruidosa). As duas datas aparecem no texto.
- **D-06** — Gasto por categoria fica para depois: exige um campo de categoria por produto (IA de nome
  já devolve `tipo`; dá para pedir uma categoria fechada — hortifrúti, carnes, bebidas, limpeza… — numa
  fase própria, com retroativo no `reprocessar-vinculos.ts`).

## 7. Critérios de Aceitação

- [ ] As últimas notas do painel mostram "R$ X a mais", "R$ X de economia" ou "Saldo zerado" com o
      mesmo valor e visual da lista de notas; nota sem comparação não mostra saldo.
- [ ] O card de saldo do mês mostra o líquido e as duas parcelas, e o valor bate com a soma dos saldos
      das notas do mês na lista de notas.
- [ ] Nenhum número do painel usa `produto.menorPreco`, `precos` comunitário ou Menor Preço.
- [ ] No dia 5 de um mês sem nota, o painel mostra o mês anterior rotulado, não R$ 0,00.
- [ ] A variação do mês em curso compara com o mesmo período do mês anterior e diz isso no texto.
- [ ] O gráfico de gastos mostra 6 meses no celular (12 no desktop), destaca o mês de referência,
      marca o mês parcial e cada barra abre a lista de notas daquele mês.
- [ ] O modo "Saldo" do gráfico mostra barras para cima (a mais) e para baixo (economia) com ícone/texto.
- [ ] "Onde você gastou" lista os mercados do mês com valor, % e nº de notas e leva a `/notas?cnpj=`.
- [ ] "Onde você pagou mais" e "Onde economizou" batem com os cards "Ficaram mais caros/baratos" das
      notas do mês.
- [ ] "Preços que mais subiram" aparece com só 2 compras do mesmo produto e some sem altas ≥ 5 %.
- [ ] Com histórico curto (2 notas, compra mensal) nenhum bloco aparece vazio ou quebrado.
- [ ] Erro ao ler o histórico afeta só os blocos que dependem dele; atalhos, pendentes e últimas notas
      continuam.
- [ ] Confirmar ou excluir uma nota atualiza o painel sem recarregar.
- [ ] Cada gráfico tem tabela equivalente para leitor de tela; axe sem violações no e2e;
      `npm run contraste` passa com os pares novos.
- [ ] Bundle inicial sem aumento relevante (painel lazy, sem lib de gráfico); estilos de componente
      < 6 kB no build.
- [ ] `npm run lint`, `npm test` (100 % nas funções puras novas) e `npm run e2e` verdes.
