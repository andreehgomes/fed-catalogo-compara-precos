# Plano de Desenvolvimento: Vínculo de produtos por etiquetas + IA (síncrono na importação)

**Data:** 28/09/2026
**Projeto:** fed-catalogo-compara-precos
**Análise base:** sem análise dedicada. Histórico em
[spike-vinculo-automatico-2026-09.md](../analise/spike-vinculo-automatico-2026-09.md),
[vinculo-automatico-menor-preco-plano.md](vinculo-automatico-menor-preco-plano.md) e
[execução de 28/09](../execucao/2026-09-28-vinculo-automatico-menor-preco.md). Este plano
**substitui** o vínculo pelo Menor Preço.
**Branch alvo:** `main`

---

## Visão Geral

### Problema

A NFC-e do PR não traz o código de barras (EAN). Cada item vira `produtos/loc:{cnpj}:{código}`,
e o mesmo produto em mercados diferentes fica em produtos separados, que só se juntam pelo
vínculo (`vinculadoA`, RF-18). Já foi tentado e descartado:

| Tentativa | Por que saiu |
|---|---|
| Menor Preço pelas Functions | a API devolve dados **sintéticos** (lojas falsas, UF de outros estados) para IPs do Google Cloud |
| Menor Preço pelo navegador | funciona, mas é lento (1 consulta a cada 5 s) e assíncrono; o usuário rejeitou |
| Consulta completa da SEFAZ-PR, XML, CCG/GS1, Cosmos | sem EAN, exige certificado, só busca por GTIN ou é pago por cota |

**Decisão do usuário:** relacionar pela **própria base, síncrono na importação**: primeiro
por **etiquetas e palavra-chave** (grátis) e só o que ficar em dúvida vai para a **IA**,
com prompts enxutos e custo controlado. O único CTA continua sendo "Confirmar importação".

### Medições que orientam o plano (28/09, gabarito real)

Gabarito: `functions/test/fixtures/vinculo/gabarito-menor-preco-2026-09.json` tem 29
buscas reais do Menor Preço em Santo Antônio da Platina, com 545 ofertas
`{desc, gtin, loja, valor}`. Mesmo GTIN = mesmo produto. É um gabarito **ruidoso**: há
produtos iguais com GTINs diferentes (ex.: "LEITE LIDER 1L INTEGRA" × "LEITE LIDER 1L INTEG")
e descrições idênticas com GTINs diferentes (ex.: "FEIJAO CALDO BOM 1KG").

Amostra de 200 itens, até 20 candidatos de outras lojas cada:

| Método | Itens ligados | Acerto pelo GTIN | Custo |
|---|---|---|---|
| Regra rígida (mesmas palavras nos dois sentidos + mesmo tamanho + 1 candidato) | 13,5% | 96% | 0 |
| Claude Opus 5.5 (effort low, 20 candidatos) | 43,5% | 67% (a maioria das "falhas" é o ruído acima; erros reais ~2–3) | ~US$ 0,22/nota de 95 itens (pior caso) |
| Claude Sonnet 5.5 | 47% | 48% | ~US$ 0,11/nota |
| Claude Haiku 4.5 | 47,5% | 45% | ~US$ 0,04/nota |

Conclusões: o modelo é o **Claude Opus 5.5** (os outros erram bem mais). Para baratear, o
que mais pesa é **mandar poucos candidatos, e só os plausíveis**. Daí as etiquetas e o bloco.

### O que será construído

Na gravação da nota (`gravarNota`, comum à confirmação e à fila), depois de publicar os
preços, para cada produto `loc:` **novo**:

1. **Etiquetar** a descrição: `tipo`, `marca`, `tamanho`, `variantes`, com o dicionário de
   abreviações e sinônimos. A chave de **bloco** é `tipo|marca|tamanho`, gravada no produto.
2. **Candidatos:** produtos-raiz (`vinculadoA == null`) do mesmo bloco, de outros mercados.
   É uma consulta por igualdade, e a raiz representa o grupo.
3. **Regra:**
   - bloco vazio → não liga e **não chama IA**;
   - variantes iguais com um único candidato → liga;
   - variantes em conflito claro → não liga;
   - o resto é dúvida.
4. **IA** só para as dúvidas: **uma chamada por nota**, 2–5 candidatos por item, saída
   estruturada mínima. Teto mensal de gasto. Qualquer falha da IA só deixa o item sem
   vínculo, **nunca** derruba a importação.
5. Ambíguo segundo a IA → `candidatosVinculo` no produto, oferecidos primeiro no diálogo
   "Este produto é o mesmo que…".

E **remover** todo o caminho do Menor Preço criado em 28/09 (fila, agendada, callables,
serviço do navegador), mantendo só a detecção de resposta envenenada na tela `/regiao`.

---

## Convenções Obrigatórias

- **Functions:** regra de negócio recebe `Contexto` (`functions/src/importar/contexto.ts`),
  Firestore só por `Repositorio` (`dados/repositorio.ts`, fake em
  `test/fakes/repositorio-memoria.ts`), **sem Emulator Suite**, Vitest, fixtures reais,
  **nunca** chamar API externa de verdade num teste (a IA entra por dependência injetada no
  `Contexto` e os testes usam fake).
- `shared/` é TypeScript puro: sem Angular, Firebase ou npm. Etiquetas e regra ficam lá; o
  SDK da Anthropic fica só em `functions/`.
- `precos`/`produtos` sem uid. A IA recebe **só descrições de produto** (dado público da
  base): nada de uid, CNPJ ou chave.
- Log sem dado pessoal (`importar/log.ts`).
- Front: standalone, OnPush, `inject()`, signals, textos pt-BR no template, cor só por token
  `$cp-*`, classe global primeiro, e2e por papel/label.
- **Deploy é do usuário** (`npm run deploy:functions:dev`, `deploy:rules:dev`); o agente nunca
  roda `firebase deploy` nem `git push`.
- **Claude API** (`@anthropic-ai/sdk`, TypeScript): antes de escrever o código, carregar a
  skill `claude-api` e seguir o `typescript/claude-api/README.md` e `tool-use.md` (saída
  estruturada com `client.messages.parse` + `zodOutputFormat`). Modelo **exatamente**
  `claude-opus-5-5`; thinking não pode ser desligado nesse modelo (só `output_config.effort`);
  sem prefill; conferir `stop_reason` antes de ler o conteúdo.

---

## Fases de Implementação

### Fase 1 — Remover o caminho do Menor Preço

**Objetivo:** base limpa. Parte do código abaixo **ainda não foi commitada** (está no working
tree); confira com `git status` antes de apagar.

#### Tarefa 1.1 — Functions

**Arquivo(s) a criar/modificar:**
- apagar `functions/src/produtos/vinculo-navegador.ts`, `functions/test/vinculo-navegador.spec.ts`
- apagar `functions/src/produtos/vincular-auto.ts`, `functions/test/vincular-auto.spec.ts`
- apagar `functions/src/menor-preco/` (cliente e oferta) e `functions/test/fixtures/menor-preco/`
- `functions/src/index.ts`: tirar `vincularProdutosAuto`, `itensParaVincular`, `registrarVinculos`
- `functions/src/importar/contexto.ts` e `functions/test/apoio.ts`: tirar `buscarMenorPreco`
- `functions/src/importar/publicar-precos.ts`: tirar a fila `vinculosAuto` (`filaVinculo`,
  `ESPERA_VINCULO_AUTO_MS`, o enfileiramento no laço final)
- `functions/test/importacao.spec.ts`: tirar o teste "só produto loc: novo entra na fila…"
- `functions/src/dados/repositorio.ts`, `repositorio-firestore.ts`,
  `test/fakes/repositorio-memoria.ts`: tirar `consultarVinculosVencidos` e `listarIds`
- `functions/src/importar/rate-limit.ts`: tirar o parâmetro `escopo`
- `firestore.indexes.json`: tirar o índice de `vinculosAuto`

Ficam: `garantirProdutoEan`, `vincular()` (núcleo), `vinculoOrigem`, `vinculoBloqueado` e
`sugestoesEan` em `vincular-produto.ts`, com os testes de `functions/test/vincular.spec.ts`.

**Critério:** `npm --prefix functions run typecheck` e `npm --prefix functions test` verdes;
`grep -r "vinculosAuto\|MenorPreco\|buscarMenorPreco" functions/src` vazio.

#### Tarefa 1.2 — shared e front

**Arquivo(s) a criar/modificar:**
- apagar `src/app/features/produtos/data-access/vinculo-auto.service.ts` (+ `.spec.ts`)
- `src/app/features/importar/importar.store.ts`: tirar `VinculoAutoService` e o
  `processar` depois da confirmação; `importar.spec.ts`: tirar o fake e o `expect` do `processar`
- `src/app/core/layout/shell.ts`: tirar `retomarVinculos`, o `afterNextRender`/timer,
  `ESPERA_RETOMAR_VINCULOS_MS` e os `inject(Injector)`/`inject(DestroyRef)` sem uso
- apagar `src/testing/fixtures/menor-preco/cafe-itamaraty.json` e `detergente-ype-coco.json`
  (só o spec apagado os usava)
- `shared/vinculo-auto.ts` (+ spec): apagar. Mover `tokensContidos` (útil nas etiquetas) para
  `shared/etiquetas.ts` (Fase 2) e tirar o `export` de `shared/index.ts`
- `shared/model.ts`: tirar `VinculoAuto`, `StatusVinculoAuto`, `ResultadoVinculoAuto`
  (manter `SugestaoEan`, `vinculoOrigem`, `vinculoBloqueado`, `sugestoesEan`)

**Manter:** detecção de resposta envenenada em
`src/app/features/regiao/data-access/menor-preco.schema.ts`/`.client.ts` (motivo `bloqueado`),
o teste em `menor-preco.client.spec.ts` e a fixture `envenenada-leite-lider.json`.

**Critério:** `npm run lint` e `npm test` verdes; `ng build -c production` com o bundle
inicial ≤ 500 kB.

---

### Fase 2 — Etiquetas e regra (shared, sem IA)

**Objetivo:** decidir de graça o máximo possível e medir no gabarito quanto sobra para a IA.

#### Tarefa 2.1 — `etiquetar()`

**Arquivo(s) a criar/modificar:** `shared/etiquetas.ts`, `shared/etiquetas.spec.ts`,
`shared/normalizar.ts` (abreviações), `shared/index.ts`

**O que fazer:**
```ts
export interface Etiquetas {
  tipo: string | null;      // "DETERGENTE"
  marca: string | null;     // "YPE"
  tamanho: string | null;   // "0.5L" (de extrairConteudo: quantidade + unidadeBase)
  variantes: string[];      // ["COCO"] — normalizadas por SINONIMOS
  bloco: string | null;     // "DETERGENTE|YPE|0.5L", null se faltar tipo, marca ou tamanho
}
export function etiquetar(descricao: string): Etiquetas;
export function tokensContidos(nossos: readonly string[], deles: readonly string[]): boolean; // prefixo
```
- **Abreviações compostas** antes das simples, porque a NFC-e abrevia o tipo em duas
  palavras: `CR D` → CREME DENTAL, `GE D`/`GEL D` → GEL DENTAL, `PAP HIG` → PAPEL HIGIENICO,
  `SAB PO` → SABAO PO, `SAB BAR` → SABAO BARRA, `LV ROU` → LAVA ROUPAS, `DOCE LE` → DOCE LEITE…
  Acrescentar em `ABREVIACOES` as simples que faltam (`DES` → DESODORANTE, `REQ` → REQUEIJAO,
  `MOL` → MOLHO, `BEB` → BEBIDA, `FERM` → FERMENTO, `DESINF` → DESINFETANTE…). Montar a lista
  olhando as descrições do gabarito e das duas notas reais (`functions/test/fixtures/sefaz-pr/`).
- **`tipo`:** a primeira palavra (ou composta) depois de expandir, se estiver no conjunto
  `TIPOS` (lista fechada, ~150 tipos de supermercado: LEITE, CAFE, DETERGENTE, REFRIGERANTE,
  PAO, FEIJAO, ARROZ…). Descrições como "YPE COCO DETERGENTE" procuram o primeiro token de
  `TIPOS` em qualquer posição.
- **`marca`:** o primeiro token que não é tipo, variante conhecida, medida nem stopword.
  Marca errada só faz o item cair em bloco vazio (**perde** a ligação, nunca liga errado).
- **`variantes`:** o resto, normalizado por `SINONIMOS` (TRAD → TRADICIONAL, DESN/DESNATA →
  DESNATADO, INTEG/INTEGRA → INTEGRAL, SEMI/S DES → SEMIDESNATADO, ZE → ZERO, LIGH → LIGHT,
  S G/SG → SEMGAS, C G/CG → COMGAS, EXTRA/EXTRAF → EXTRAFORTE, LV → LAVANDA…). O último
  token pode estar cortado (NFC-e corta em ~20 caracteres): compare por prefixo.

**Critério:** spec com casos reais: "Det Ype 500ml Coco" → `DETERGENTE|YPE|0.5L` + `[COCO]`;
"Cafe Itamaraty 500g" → `CAFE|ITAMARATY|0.5kg` + `[]`; "Leite Lider 1l Desn" →
`LEITE|LIDER|1L` + `[DESNATADO]`; "YPE COCO DETERGENTE 500ML" → mesmo bloco do primeiro;
"Cr d Close Up 130g" → tipo CREME DENTAL; descrição sem tamanho → `bloco: null`.

#### Tarefa 2.2 — `compararVariantes()` e `decidirPorEtiquetas()`

**Arquivo(s) a criar/modificar:** `shared/etiquetas.ts`, `shared/etiquetas.spec.ts`

**O que fazer:**
```ts
export type Relacao = 'igual' | 'conflito' | 'duvida';
export function compararVariantes(a: string[], b: string[]): Relacao;
export interface Candidato { id: string; descricao: string; variantes: string[] }
export type DecisaoEtiquetas =
  | { tipo: 'ligar'; id: string }
  | { tipo: 'nenhum' }
  | { tipo: 'ia'; candidatos: Candidato[] }; // 1..MAX_CANDIDATOS_IA (5), sem os 'conflito'
export function decidirPorEtiquetas(variantes: string[], candidatos: Candidato[]): DecisaoEtiquetas;
```
- `igual`: cada lado contido no outro (por prefixo, depois dos sinônimos), incluindo os dois vazios.
- `conflito`: os dois lados têm variante e há um token de cada lado sem par no outro (COCO ×
  LIMAO, ZERO × nada **não** é conflito: é dúvida).
- `duvida`: o resto (um lado tem variante e o outro não, por exemplo).
- Decisão: sem candidatos → `nenhum`; exatamente um `igual` e nenhum `duvida` → `ligar`; só
  `conflito` → `nenhum`; senão → `ia` com os `igual`/`duvida` mais parecidos (Jaccard), até 5.

**Critério:** spec cobrindo cada ramo, com os pares reais: "LEITE LIDER 1L INTEGRA" ×
"LEITE LIDER 1L INTEG" = igual; "REFR COCA COLA 1L" × "REFR COCA COLA ZERO 1L" = dúvida;
"DET YPE COCO" × "DET YPE LIMAO" = conflito.

#### Tarefa 2.3 — Medição no gabarito (spec, sem IA)

**Arquivo(s) a criar/modificar:** `functions/test/etiquetas-gabarito.spec.ts`

**O que fazer:** para cada grupo do gabarito, simular cada oferta como "produto novo" contra
as ofertas de **outras lojas do mesmo grupo** (agrupadas por bloco, como na base) e contar
quantas a regra liga (e o acerto pelo GTIN), quantas vão para a IA (e com quantos
candidatos) e quantas ficam em bloco vazio. Imprimir o resumo (`console.info`) e fixar
limites de regressão:
- acerto pelo GTIN nas ligações da regra **≥ 90%** (o ruído do gabarito explica o resto);
- média de candidatos por item enviado à IA **≤ 5**.

Ajustar dicionários e `TIPOS` até atingir os limites. **Registrar os números finais** na
seção "Resultado da medição" deste plano (substituir o `TODO`).

**Critério:** spec verde com os números impressos; seção preenchida.

---

### Fase 3 — IA para as dúvidas

**Objetivo:** uma chamada por nota, barata, com falha silenciosa.

#### Tarefa 3.1 — Dependência, segredo e contexto

**Arquivo(s) a criar/modificar:** `functions/package.json` (`@anthropic-ai/sdk`, `zod`,
instalando **de dentro da pasta** `functions/`), `functions/src/config.ts`,
`functions/src/importar/contexto.ts`, `functions/test/apoio.ts`

**O que fazer:**
- `config.ts`: `export const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY')`
  (`firebase-functions/params`), `IA_MODELO = 'claude-opus-5-5'`,
  `IA_TETO_MENSAL_USD = 5`, `IA_TIMEOUT_MS = 25_000`.
- `Contexto` ganha `classificarVinculos: (itens: ItemIa[]) => Promise<RespostaIa>` (ver 3.2),
  com o fake em `apoio.ts` devolvendo `{ decisoes: [], custoUsd: 0 }` por padrão.
- `confirmarNfce` e `reprocessarPendentes` (as duas chamam `gravarNota`) declaram
  `secrets: [ANTHROPIC_API_KEY]`. `confirmarNfce` passa a `timeoutSeconds: 120`, porque a IA
  pode levar até ~25 s.

**Critério:** typecheck verde; os testes existentes não mudam de comportamento.

#### Tarefa 3.2 — Cliente da IA

**Arquivo(s) a criar/modificar:** `functions/src/vinculo/ia.ts`, `functions/test/vinculo-ia.spec.ts`

**O que fazer:** carregar a skill `claude-api` antes. Uma função que recebe os itens em
dúvida da nota e devolve a decisão por item:
```ts
export interface ItemIa { i: number; d: string; c: { id: string; d: string }[] }
export interface RespostaIa {
  decisoes: { i: number; r: string | 'N' | 'A' }[]; // id do candidato | N=nenhum | A=ambíguo
  custoUsd: number;
}
```
- `client.messages.parse` com `model: IA_MODELO`, `max_tokens: 4000`,
  `output_config: { effort: 'low', format: zodOutputFormat(Schema) }`, sem `thinking`
  (no Opus 5.5 ele é adaptativo e não desliga), cliente com
  `{ timeout: IA_TIMEOUT_MS, maxRetries: 1 }`.
- **Fallback de recusa:** a skill manda ligar `fallbacks: "default"` com o beta
  `server-side-fallback-2026-07-01` no Opus 5.5. Verifique na skill se `parse` aceita isso no
  namespace beta; se não, trate `stop_reason === 'refusal'` como "sem decisão" (itens ficam
  sem vínculo). Descrição de produto dificilmente é recusada.
- **Prompt enxuto** (system fixo, sem nada variável; ids curtos `c1..c5`; itens numerados):
  ```
  Você compara produtos de supermercado brasileiros pelas descrições das notas fiscais
  (abreviadas e às vezes cortadas: DET=detergente, REFR=refrigerante, TRAD=tradicional,
  S/G=sem gás). Para cada item, escolha o candidato que é EXATAMENTE o mesmo produto:
  mesma marca, variante (sabor, zero/diet, tradicional/extraforte, integral/desnatado),
  tamanho e embalagem quando muda o produto.
  Responda r = id do candidato; "N" se nenhum é o mesmo; "A" se a descrição do item não
  diz a variante e o produto costuma ter variantes (ex.: "CAFE ITAMARATY 500G" diante de
  tradicional e extraforte). Na dúvida, "A": ligar errado é pior que não ligar.
  ```
  Mensagem do usuário: uma linha por item, `i. DESCRICAO` seguida de `  c1: …` por candidato.
- `custoUsd = (input_tokens * 4 + output_tokens * 20) / 1e6` (preço do Opus 5.5 por milhão).
- Qualquer erro (rede, 4xx/5xx, timeout, recusa, JSON inválido) → **lança**. Quem chama
  captura (3.3).
- O cliente real é criado dentro do handler com `ANTHROPIC_API_KEY.value()` e injetado no
  `Contexto`; o teste injeta um fake e **nunca** chama a API.

**Critério:** spec do mapeamento (monta a mensagem esperada a partir de `ItemIa[]`, converte
uma resposta falsa em `RespostaIa`, calcula o custo) sem rede.

#### Tarefa 3.3 — Orquestração em `gravarNota`

**Arquivo(s) a criar/modificar:** `functions/src/vinculo/vincular-nota.ts`,
`functions/src/importar/publicar-precos.ts`, `functions/src/importar/gravar-nota.ts`,
`functions/src/dados/repositorio*.ts` (+ fake), `shared/model.ts`,
`functions/test/vincular-nota.spec.ts`

**O que fazer:**
- `Produto` ganha `etiquetas?: Etiquetas`, `bloco?: string | null` (campo de topo, para
  consultar), `candidatosVinculo?: ProdutoId[]` (ambíguos, até 3) e
  `vinculoMotivo?: 'etiquetas' | 'ia' | 'manual'`. `publicarPrecos` grava `etiquetas` e
  `bloco` em todo produto que escreve.
- `vincularNota(ctx, nota, idsNovos)`:
  1. para cada `loc:` **novo** desta nota, sem `vinculoBloqueado`, com `bloco`: buscar raízes
     do bloco em outros mercados, com
     `repo.consultar('produtos', [{campo:'bloco',op:'==',valor}, {campo:'vinculadoA',op:'==',valor:null}])`
     e descartando os `cnpjs` que só contêm o CNPJ da nota;
  2. `decidirPorEtiquetas` → `ligar`: `vincular(ctx, novo, candidato, 'auto')` com
     `vinculoMotivo: 'etiquetas'`; `nenhum`: nada; `ia`: acumula;
  3. se houver dúvidas **e** o teto do mês não estourou: **uma** chamada `classificarVinculos`
     (até 40 itens; se passar, divide em 2 chamadas em paralelo); `r` = id → vincula com
     `vinculoMotivo: 'ia'`; `A` → grava `candidatosVinculo`; `N` → nada;
  4. soma o custo em `controle/iaVinculo_{AAAA-MM}` (`{ custoUsd, chamadas }`, por transação);
     antes de chamar, se `custoUsd >= IA_TETO_MENSAL_USD`, pula a IA;
  5. **tudo dentro de try/catch**: erro da IA ou da vinculação vira log (`etapa:
     'vinculo'`, sem descrições nem CNPJ) e a importação segue.
- `gravarNota` chama `vincularNota` só quando `publicou` (1ª importação da chave), depois de
  `publicarPrecos`, que passa a devolver os ids criados agora.
- Consulta por `bloco` + `vinculadoA` (duas igualdades) não precisa de índice composto;
  confirme no dv (checklist).

**Critério:** spec com repositório em memória e IA fake:
- mesmo bloco e variante igual → liga **sem** chamar a IA;
- bloco vazio → não chama a IA;
- dúvida → uma chamada com os itens certos, e as respostas id/N/A aplicadas;
- teto estourado → não chama;
- IA lançando erro → nota gravada, preços publicados, nenhum vínculo, log de falha;
- produto com `vinculoBloqueado` → intocado;
- reimportar a mesma chave → não chama a IA de novo.

---

### Fase 4 — Front

**Objetivo:** mostrar o vínculo automático e oferecer os ambíguos.

#### Tarefa 4.1 — Página do produto e diálogo

**Arquivo(s) a criar/modificar:**
`src/app/features/produtos/detalhe/produto-detalhe.page.html`,
`src/app/features/produtos/vincular/vincular-dialog.ts`,
`src/app/features/produtos/produtos.spec.ts`

**O que fazer:**
- Trocar o texto "Código de barras identificado automaticamente pelo Menor Preço…" por
  "Ligado automaticamente a produtos de outros mercados. Se estiver errado, desfaça o
  vínculo." (quando `vinculoOrigem === 'auto'`). O aviso de `sugestoesEan` continua.
- `VincularDialog`: quando o produto tem `candidatosVinculo`, buscar esses produtos
  (`ProdutosService.produtosPorIds`) e mostrá-los antes das sugestões por Jaccard, numa lista
  "Possíveis equivalentes", no mesmo fluxo de seleção + "É o mesmo produto".

**Critério:** specs de componente: o texto novo aparece com `vinculoOrigem: 'auto'`; os
`candidatosVinculo` aparecem e o vínculo chama `vincularProduto` com o id certo.

---

### Fase 5 — Qualidade, custo e documentação

#### Tarefa 5.1 — Avaliação opcional da IA (custa centavos; pedir OK ao usuário)

**Arquivo(s) a criar/modificar:** `functions/scripts/avaliar-ia-vinculo.ts`

**O que fazer:** script manual (fora do `npm test`) que roda o pipeline da Fase 2 no
gabarito, manda só as dúvidas para a IA real (chave lida de `ANTHROPIC_API_KEY` ou do arquivo
`~/.anthropic_api_key`, que o usuário já criou em 28/09) e imprime: itens ligados pela regra e
pela IA, acerto pelo GTIN, ambíguos e custo real (tokens × preço). Bundle com
`functions/node_modules/.bin/esbuild` e `--external:@anthropic-ai/sdk --external:zod`. Rodar
só com o OK do usuário. Estimativa: < US$ 0,20.

**Critério:** números registrados na seção "Resultado da medição".

#### Tarefa 5.2 — Checklist do dv e documentação

**Arquivo(s) a criar/modificar:** `docs/qualidade/functions-dv-checklist.md`, `CLAUDE.md`

**O que fazer:**
- Checklist: trocar os cenários 8–15 (fila, agendada, navegador) por:
  - importar uma nota de um mercado novo e ver os produtos ligados na hora pela regra ou
    pela IA;
  - tempo do "Confirmar importação" (alvo < 30 s);
  - `controle/iaVinculo_AAAA-MM` somando o custo;
  - teto (baixar `IA_TETO_MENSAL_USD` para testar);
  - chave inválida → importação segue sem vínculo.
- `CLAUDE.md`:
  - reescrever o bullet "Vínculo automático" (seção Produtos) com o pipeline novo;
  - tirar `itensParaVincular`/`registrarVinculos`/`vincularProdutosAuto` da seção Functions;
  - em Fontes de dados, dizer que o Menor Preço não é usado para vínculo;
  - citar o secret `ANTHROPIC_API_KEY`.

**Critério:** `npm run lint`, `npm run test:ci`, `npm --prefix functions test`,
`npm --prefix functions run typecheck`, `npm --prefix functions run build` e
`ng build -c production` verdes.

---

## Pré-condições (usuário)

1. **Secret nos dois projetos** (antes do primeiro deploy das Functions novas, senão o deploy
   falha). Pode ser **a mesma chave da Anthropic** no dv e na produção (decisão do usuário);
   o teto mensal é por projeto, então o gasto máximo somado é 2 × `IA_TETO_MENSAL_USD`:
   ```bash
   npx firebase functions:secrets:set ANTHROPIC_API_KEY -P dev
   npx firebase functions:secrets:set ANTHROPIC_API_KEY -P prod
   ```
2. **CI:** a conta `github-action-1390935729` pode precisar do papel **Secret Manager Admin**
   (ou `secretmanager.secrets.get` + `setIamPolicy`) para publicar Functions com secret. Se o
   `deploy.yml` falhar com erro de Secret Manager, conceder no IAM de cada projeto.
3. O deploy do CI usa `--force` e vai **apagar** as funções removidas
   (`vincularProdutosAuto`, `itensParaVincular`, `registrarVinculos`). No deploy manual, a CLI
   pergunta.
4. Opcional: apagar no Firestore dos dois projetos a coleção `vinculosAuto` e o documento
   `controle/vinculoAuto`.
5. Créditos na conta da Anthropic.

---

## Estrutura Final de Arquivos

```
shared/
├── etiquetas.ts / etiquetas.spec.ts              (2.1, 2.2) novo
├── normalizar.ts                                 (2.1) abreviações
├── model.ts                                      (1.2, 3.3) −VinculoAuto; +etiquetas, bloco, candidatosVinculo, vinculoMotivo
├── index.ts                                      (1.2, 2.1)
└── vinculo-auto.ts / .spec.ts                    (1.2) APAGAR
functions/
├── package.json                                  (3.1) +@anthropic-ai/sdk, +zod
├── scripts/avaliar-ia-vinculo.ts                 (5.1) novo, manual
├── src/
│   ├── config.ts                                 (3.1) secret, modelo, teto, timeout
│   ├── index.ts                                  (1.1, 3.1) −3 funções; secrets + timeout
│   ├── importar/contexto.ts                      (1.1, 3.1) −buscarMenorPreco; +classificarVinculos
│   ├── importar/publicar-precos.ts               (1.1, 3.3) −fila; +etiquetas/bloco; devolve ids novos
│   ├── importar/gravar-nota.ts                   (3.3) chama vincularNota
│   ├── importar/rate-limit.ts                    (1.1) −escopo
│   ├── dados/repositorio*.ts                     (1.1) −consultarVinculosVencidos, −listarIds
│   ├── vinculo/ia.ts                             (3.2) novo
│   ├── vinculo/vincular-nota.ts                  (3.3) novo
│   ├── produtos/vincular-auto.ts                 (1.1) APAGAR
│   ├── produtos/vinculo-navegador.ts             (1.1) APAGAR
│   └── menor-preco/                              (1.1) APAGAR
└── test/
    ├── etiquetas-gabarito.spec.ts                (2.3) novo
    ├── vinculo-ia.spec.ts / vincular-nota.spec.ts (3.2, 3.3) novos
    ├── apoio.ts, fakes/repositorio-memoria.ts, importacao.spec.ts (1.1, 3.1)
    ├── vincular-auto.spec.ts / vinculo-navegador.spec.ts (1.1) APAGAR
    ├── fixtures/menor-preco/                     (1.1) APAGAR
    └── fixtures/vinculo/gabarito-menor-preco-2026-09.json (já existe)
src/app/
├── core/layout/shell.ts                          (1.2) −retomada
├── features/importar/importar.store.ts / .spec.ts (1.2) −processar
├── features/produtos/data-access/vinculo-auto.service.ts / .spec.ts (1.2) APAGAR
├── features/produtos/detalhe/produto-detalhe.page.html (4.1)
├── features/produtos/vincular/vincular-dialog.ts (4.1)
└── features/produtos/produtos.spec.ts            (4.1)
src/testing/fixtures/menor-preco/{cafe-itamaraty,detergente-ype-coco}.json (1.2) APAGAR
firestore.indexes.json                            (1.1) −índice vinculosAuto
docs/qualidade/functions-dv-checklist.md, CLAUDE.md (5.2)
```

---

## Ordem de Execução Recomendada

```
1.1 ─┐
1.2 ─┴─► 2.1 ─► 2.2 ─► 2.3 (medição; ajustar dicionários até os limites)
                          │
                 3.1 ─► 3.2 ─► 3.3 ─► 4.1 ─► 5.2
                                  └──► 5.1 (opcional, com OK do usuário)
```

---

## Resultado da medição

**Tarefa 2.3 (28/09, `functions/test/etiquetas-gabarito.spec.ts`)** — 545 ofertas do gabarito,
cada uma como produto novo contra as ofertas de outras lojas do mesmo bloco (ofertas com as
mesmas variantes contam como uma raiz só, porque a regra já as teria ligado):

| Resultado | Itens | % |
|---|---|---|
| Bloco vazio (sem tipo, marca ou tamanho) — não chama a IA | 242 | 44,4% |
| Sem candidato ou só conflitos | 76 | 13,9% |
| Ligados pela regra | 24 | 4,4% — acerto pelo GTIN **95,8%** |
| Enviados à IA | 203 | 37,2% — **2,32 candidatos/item** |

A única divergência da regra é "DESINF PINHO BRIL LV 500ML" × "… LAVANDA 500ML" (GTINs
diferentes no gabarito). Antes de a regra exigir variante, ela ligava 43 itens com 81,4%:
os "erros" eram descrições sem variante, como "GEL D CLOSE UP 90G", que **a mesma loja vende
com dois GTINs e dois preços** — a descrição não identifica o produto. Por isso vazio × vazio
vai para a IA (que tende a responder "A").

**Ajuste de 28/09 (bloco `marca|tamanho`)** — com o tipo fora do bloco e comparado à parte:
bloco vazio 208 (38,2%), sem candidato/conflito 62 (11,4%), regra 24 (4,4%, acerto 95,8%),
IA 251 (46,1%, 2,52 candidatos/item).

**Tarefa 5.1** — script pronto (`functions/scripts/avaliar-ia-vinculo.ts`), ainda não rodado:
aguarda o OK do usuário (custa centavos).

---

## Critérios de Aceitação Globais

- [ ] Nenhum resto do caminho Menor Preço/fila/navegador (código, índices, exports, docs); a detecção de resposta envenenada em `/regiao` continua.
- [ ] Todo produto novo tem `etiquetas` e `bloco` (ou `bloco: null`).
- [ ] Produto novo com o mesmo bloco e a mesma variante de um produto de outro mercado é ligado **na confirmação**, sem IA.
- [ ] Bloco vazio nunca chama a IA; uma nota gera no máximo 1 chamada (2 se tiver mais de 40 dúvidas).
- [ ] A IA recebe só descrições, com no máximo 5 candidatos por item.
- [ ] Respostas da IA aplicadas: id → vínculo `ia`; `A` → `candidatosVinculo`; `N` → nada.
- [ ] Teto mensal respeitado; custo somado em `controle/iaVinculo_AAAA-MM`.
- [ ] Falha, timeout ou recusa da IA nunca impede a importação.
- [ ] `vinculoBloqueado` é respeitado; reimportar não chama a IA.
- [ ] Página do produto e diálogo mostram o vínculo automático e os possíveis equivalentes.
- [ ] Regra no gabarito: acerto ≥ 90% nas ligações; ≤ 5 candidatos por item enviado à IA.
- [ ] Nenhum teste chama a API da Anthropic, a SEFAZ ou o Menor Preço de verdade.
- [ ] Lint, testes (front, shared, Functions), typecheck, build das Functions e build de produção (≤ 500 kB inicial) verdes.
