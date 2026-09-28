# Plano de Desenvolvimento: Vínculo automático de produtos pelo Menor Preço

**Data:** 28/09/2026
**Projeto:** fed-catalogo-compara-precos
**Análise base:** sem análise dedicada. Base: [compara-precos-nfce-analise.md](../analise/compara-precos-nfce-analise.md) (RF-18) e [spike-menor-preco-2026-09-27.md](../analise/spike-menor-preco-2026-09-27.md), mais as consultas de 28/09 descritas abaixo
**Branch alvo:** `main`

---

## Visão Geral

A página da NFC-e do PR não traz EAN, então todo item importado vira `loc:{cnpj}:{código}`
(`shared/gtin.ts`). O mesmo produto comprado em dois mercados vira dois produtos, e o
histórico, o resumo e a busca por GTIN não se juntam. Hoje eles só se juntam pelo vínculo
manual (RF-18, `vincularProduto`).

A feature cria um **job agendado nas Functions** que, para cada produto `loc:` novo,
consulta o Menor Preço pela descrição na região do estabelecimento e tenta descobrir o
**GTIN**. Com um GTIN confiável, o `loc:` é vinculado a `ean:{gtin}`, criando o produto
`ean:` quando ele ainda não existe. Assim, o mesmo item em mercados diferentes cai no mesmo
canônico. Quando há mais de um GTIN possível, nada é vinculado: os candidatos ficam como
**sugestões** no diálogo de vínculo, a um clique.

### O que as consultas de 28/09 mostraram (Santo Antônio da Platina, geohash `6gu7krj`, raio 10 km)

| Achado | Consequência para o desenho |
|---|---|
| A API **não devolve CNPJ**. O estabelecimento vem por razão social, endereço e um `codigo` opaco | Comparar a mesma loja por `nm_emp` normalizado + município + logradouro |
| Mostra só a **última venda de cada GTIN por loja**, com `nrdoc` da nota dessa venda | Casar pelo número da nota do usuário quase nunca funciona. Não usar `nrdoc` |
| O Sanches e Vecchiate (CNPJ 03.644.587/0008-36) **não apareceu** em 5 buscas (café, detergente, desodorante, Coca 2l, "itamaraty") | Não depender da mesma loja: o caminho principal é o **consenso regional** |
| "CAFE ITAMARATY 500G" aparece com **4 GTINs** (`7896045102501` trad., `7896045102495` extraforte, `7896005806012`, `7896045111060`) | Descrição curta é ambígua: vira **sugestão**, não vínculo |
| "DETERGENTE YPE … COCO 500ML" aparece sempre com `7896098900239`, em 4 lojas | Um GTIN só em ≥ 2 lojas pode ser vinculado com segurança |
| Descrições variam por loja ("CAFE ITAMARATY VACUO 500G TRADICIONAL", "YPE COCO DETERGENTE 500ML") | Casar por conjunto de tokens (contido) + mesmo conteúdo, não por string |

### Revisão após o spike (28/09, Tarefa 1.1)

- **Sem portão:** o vínculo automático fica sempre ligado (decisão do usuário); o
  `VINCULO_AUTO_ATIVO` previsto na 1.1 e na 3.2 não existe.
- **Respostas envenenadas:** sob volume, a API devolve ofertas sintéticas com HTTP 200.
  Qualquer oferta com UF ≠ PR condena a resposta; o job para e pausa 2 h.
- **Ritmo:** 12 consultas por execução, 10 s entre elas (não 40 com 1 s).
- **2º termo de busca** (as duas palavras mais longas) quando o 1º não traz nada.
- **Sem resultado:** novas tentativas em 1, 7 e 30 dias (não 24 h e 72 h).
- **Backfill** dos `loc:` que já estavam na base, pela própria agendada.
- Detalhes em [spike-vinculo-automatico-2026-09.md](../analise/spike-vinculo-automatico-2026-09.md).

---

## Convenções Obrigatórias

- Functions: regras de negócio recebem `Contexto`; Firestore só por `Repositorio`
  (fake em memória nos testes); **sem Emulator Suite**; Vitest com **fixtures reais**
  (as respostas do Menor Preço nunca são buscadas de verdade num teste).
- Região `southamerica-east1`, `maxInstances` do `config.ts`; agendada com `maxInstances: 1`.
- O cliente **nunca escreve** em `produtos`; o vínculo automático é feito só pelas Functions.
- `precos`/`produtos` continuam **sem uid**. A fila nova também não leva uid.
- Log sem dado do usuário (só `produtoId`, que já é público, e contadores).
- Front: standalone, OnPush, `inject()`, signals, Signal Forms, textos pt-BR no template,
  cor só por token `$cp-*`, classe global primeiro, e2e por papel/label, ícone novo no
  subset do `index.html`.
- `shared/` continua TypeScript puro (sem valibot, sem Firebase).

---

## Fases de Implementação

### Fase 1 — Spike de cobertura (portão de decisão)

**Objetivo:** medir, com as duas notas reais do usuário, quantos itens o algoritmo
consegue vincular, antes de escrever a feature.

#### Tarefa 1.1 — Fixtures reais e medição

**Arquivo(s) a criar/modificar:** `functions/test/fixtures/menor-preco/*.json`,
`docs/analise/spike-vinculo-automatico-2026-09.md`

**O que fazer:**
- Consultar o Menor Preço (`/produtos?local=6gu7krj&termo=…&raio=10&data=-1`) para uns 15
  itens das notas `41260903644587000836652100000168701620438547` e
  `41260803644587000836652030000088681310226239`, com o termo montado como na Tarefa 2.2.
  Guardar como fixtures pelo menos: café Itamaraty (ambíguo), detergente Ypê coco
  (único), um item sem resultado e um com termo abreviado (`Des Rexona 50ml Form`).
- Confirmar o **raio máximo** aceito pela API (10, 20, 50) e se o termo com medida
  ("500ML") melhora ou piora a busca.
- Registrar a taxa: vinculado / ambíguo / sem resultado.

**Critério:** documento do spike com a taxa medida e a decisão. Se **< 25%** dos itens
forem vinculáveis, a Fase 3 (sugestões) vira o entregável principal e o vínculo
automático fica desligado por padrão (`VINCULO_AUTO_ATIVO = false` no `config.ts`).

---

### Fase 2 — Fundação: cliente, fila e algoritmo puro

**Objetivo:** tudo testável sem rede: cliente do Menor Preço nas Functions, decisão de
GTIN em função pura e fila por produto.

#### Tarefa 2.1 — Cliente do Menor Preço nas Functions

**Arquivo(s) a criar/modificar:** `functions/src/menor-preco/cliente.ts`,
`functions/src/menor-preco/oferta.ts`, `functions/src/importar/contexto.ts`

**O que fazer:**
- `buscarOfertas({termo, local, raioKm}): Promise<OfertaMp[]>` com `fetch` para a URL
  fixa `https://menorpreco.notaparana.pr.gov.br/api/v1/produtos` (host constante, sem
  entrada do usuário na URL além de `termo` codificado), `data=-1`, timeout 10 s,
  sem retry. Só a 1ª página (`offset=0`).
- `oferta.ts`: validação manual **por item** (mesmo contrato do
  `menor-preco.schema.ts` do front: `valor` em string, `gtin` vazio vira `null`,
  `nm_fan` vazio cai para `nm_emp`). Item inválido é descartado.
  ```ts
  export interface OfertaMp {
    descricao: string; gtin: string | null; valor: number;
    estabelecimento: { razaoSocial: string; logradouro: string; municipio: string };
  }
  ```
- Falha de rede/HTTP/formato → `FonteIndisponivelError` (novo, em `oferta.ts`).
- Acrescentar `buscarMenorPreco` ao `Contexto` (e ao `contextoPadrao`), para os testes
  injetarem as fixtures.

**Critério:** spec com as fixtures da Fase 1: mapeia os itens, descarta os inválidos e
converte timeout/HTTP 500 em `FonteIndisponivelError`.

#### Tarefa 2.2 — Decisão do GTIN (função pura em `shared/`)

**Arquivo(s) a criar/modificar:** `shared/vinculo-auto.ts`, `shared/vinculo-auto.spec.ts`,
`shared/normalizar.ts`

**O que fazer:**
- `termoDeBusca(descricao)`: `tokensSemMedida` já expandidos pelas `ABREVIACOES`.
  Acrescentar ao dicionário as abreviações que aparecerem no spike (ex.: `DES` →
  `DESODORANTE`, `MOL` → `MOLHO`, `CR` só quando seguido de `D` → `CREME DENTAL`, se
  valer a pena; nada ambíguo como `SAB`).
- `decidirGtin(item, ofertas, loja)` → `{ tipo: 'vincular', gtin, motivo } |
  { tipo: 'ambiguo', candidatos } | { tipo: 'sem-resultado' }`:
  1. **Candidatas:** ofertas com GTIN válido (`normalizarGtin`), **mesmo conteúdo**
     (`extrairConteudo`, quando os dois têm) e cujos tokens contêm ≥ 80% dos tokens sem
     medida do item.
  2. **Mesma loja** (razão social normalizada igual + mesmo município) com um único
     GTIN → `vincular` (`motivo: 'mesma-loja'`).
  3. **Consenso regional:** um único GTIN entre as candidatas e presente em
     **≥ 2 estabelecimentos** → `vincular` (`motivo: 'consenso'`).
  4. Mais de um GTIN → `ambiguo` com até 3 candidatos (GTIN, descrição dominante via
     `descricaoDominante`, nº de lojas), ordenados por nº de lojas.
  5. Nada → `sem-resultado`.

**Critério:** spec com as fixtures reais: `Det Ype 500ml Coco` → `vincular`
`7896098900239`; `Cafe Itamaraty 500g` → `ambiguo` com os GTINs
`7896045102501`/`7896045102495`/`7896005806012` entre os candidatos; oferta com GTIN
inválido é ignorada; conteúdo diferente (1l × 500ml) nunca casa.

#### Tarefa 2.3 — Fila `vinculosAuto/{produtoId}`

**Arquivo(s) a criar/modificar:** `functions/src/importar/publicar-precos.ts`,
`shared/model.ts`, `firestore.indexes.json`

**O que fazer:**
- Novo tipo `VinculoAuto { produtoId, cnpj, status: 'aguardando' | 'concluido',
  tentativas, proximaTentativa, criadoEm, resultado?: 'vinculado' | 'ambiguo' |
  'sem-resultado' }`, **sem uid**.
- Em `publicarPrecos`, para cada produto `loc:` **criado agora** (`atual == null`),
  acrescentar ao lote a gravação de `vinculosAuto/{id}` com `proximaTentativa = emissão
  + 2 h` (o Menor Preço demora para refletir a venda).
- Índice composto `vinculosAuto`: `status ==` + `proximaTentativa asc`.
- `firestore.rules`: nada a mudar (o `/{document=**}` já nega ao cliente). Conferir.

**Critério:** spec do `publicarPrecos`: nota com 3 produtos novos e 1 já existente
enfileira exatamente 3; reimportar não enfileira de novo.

---

### Fase 3 — Vínculo automático e sugestões

**Objetivo:** job que consome a fila, vincula quando é seguro e grava sugestões quando é
ambíguo.

#### Tarefa 3.1 — Extrair o núcleo do vínculo

**Arquivo(s) a criar/modificar:** `functions/src/produtos/vincular-produto.ts`

**O que fazer:**
- Extrair de `executarVincular` uma `vincular(ctx, origem, destino, origemVinculo)` sem
  uid nem rate limit (resolve raízes, recusa `ean` × `ean` diferente, grava
  `vinculadoA`, reaponta). A callable passa a chamá-la com `'manual'`.
- `garantirProdutoEan(ctx, gtin, base: Produto, descricao)`: cria `produtos/ean:{gtin}`
  quando não existe, com `ean`, descrição do Menor Preço, `tokens`, `conteudo` e as
  observações (`menorPreco`, `ultimaObservacao`, `cnpjs`) copiadas do `loc:`.
- Gravar no filho `vinculoOrigem: 'manual' | 'auto'`. `desvincular` grava
  `vinculoBloqueado: true`, e o job nunca vincula um produto bloqueado.

**Critério:** specs atuais do vínculo passam sem mudança de comportamento; spec nova:
`ean:` inexistente é criado e o `loc:` aponta para ele.

#### Tarefa 3.2 — Agendada `vincularProdutosAuto`

**Arquivo(s) a criar/modificar:** `functions/src/produtos/vincular-auto.ts`,
`functions/src/index.ts`, `functions/src/dados/repositorio.ts`,
`functions/src/dados/repositorio-firestore.ts`, `functions/test/fakes/repositorio-memoria.ts`

**O que fazer:**
- `onSchedule('every 30 minutes', maxInstances: 1, timeoutSeconds: 300)`.
- Repositório: `consultarVinculosVencidos(agora, limite)` (real + fake).
- Até **40 produtos por execução**, **1 s entre consultas** (`ctx.esperar`). Para cada um:
  lê `produtos/{id}` (pula se já tem `vinculadoA` ou `vinculoBloqueado`) e
  `estabelecimentos/{cnpj}`, e acha o `local` pelo município (centroide de
  `src/assets/data/municipios-pr.json`, importado pelo esbuild; geohash 7 de
  `shared/geohash.ts`, raio conforme a Fase 1).
- Resultado de `decidirGtin`:
  - `vincular` → `garantirProdutoEan` + `vincular(…, 'auto')`; fila `concluido`.
  - `ambiguo` → grava `sugestoesEan` (até 3) no `produtos/{id}` (merge); `concluido`.
  - `sem-resultado` → nova tentativa em 24 h e depois em 72 h; na 3ª, `concluido`.
  - `FonteIndisponivelError` → para a execução (não gasta tentativa) e reagenda em 1 h.
- Log `etapa: 'vinculo-auto'` com contadores por resultado.
- Respeitar `VINCULO_AUTO_ATIVO` (Fase 1): desligado, grava só as sugestões.

**Critério:** spec com repositório em memória e fixtures: detergente vinculado a
`ean:7896098900239` (criado); café com 3 `sugestoesEan` e sem `vinculadoA`; Menor Preço
fora não gasta tentativa; o limite de 40 e o intervalo de 1 s são respeitados.

#### Tarefa 3.3 — Vincular a uma sugestão pela callable

**Arquivo(s) a criar/modificar:** `functions/src/produtos/vincular-produto.ts`

**O que fazer:** em `executarVincular`, aceitar `destino = ean:{gtin}` **inexistente**
somente quando o GTIN estiver em `origem.sugestoesEan`. Nesse caso, criar o `ean:` com
`garantirProdutoEan` antes de vincular.

**Critério:** spec: GTIN sugerido e inexistente → vinculado; GTIN fora das sugestões e
inexistente → `produto-inexistente`.

---

### Fase 4 — Front: mostrar o vínculo e as sugestões

**Objetivo:** o usuário enxerga o que foi vinculado automaticamente, pode desfazer, e
resolve os ambíguos com um clique.

#### Tarefa 4.1 — Modelo e página do produto

**Arquivo(s) a criar/modificar:** `shared/model.ts` (`Produto.vinculoOrigem`,
`sugestoesEan`, `vinculoBloqueado`), `src/app/features/produtos/detalhe/produto-detalhe.page.html`

**O que fazer:** em produto vinculado com `vinculoOrigem === 'auto'`, mostrar
"Código de barras identificado pelo Menor Preço: 789…" (`.cp-source`) com o botão de
desvincular que já existe.

**Critério:** spec do componente: o texto aparece só com `vinculoOrigem: 'auto'`.

#### Tarefa 4.2 — Sugestões no diálogo de vínculo

**Arquivo(s) a criar/modificar:** `src/app/features/produtos/vincular/vincular-dialog.ts`
(+ template/spec)

**O que fazer:** quando o produto tem `sugestoesEan`, mostrar antes das sugestões por
Jaccard uma seção "Possíveis códigos de barras", com descrição, GTIN, "vista em N
mercados" e o botão "É este". O botão chama `ProdutosService.vincular(id, 'ean:'+gtin)`.

**Critério:** spec: com `sugestoesEan` a seção aparece e o clique chama `vincular` com o
`ean:` certo; e2e (`e2e/produtos.spec.ts`) com a callable mockada, selecionando por
`getByRole('button', { name: 'É este' })`.

---

### Fase 5 — Qualidade e verificação no dv

#### Tarefa 5.1 — Checklist manual do dv

**Arquivo(s) a criar/modificar:** `docs/qualidade/functions-dv-checklist.md`

**O que fazer:** acrescentar um roteiro. Depois de `npm run deploy:functions:dev` (rodado
pelo usuário), importar uma nota nova, esperar a janela de 2 h mais a próxima execução,
conferir `vinculosAuto`, `produtos/ean:*` criados e os logs `vinculo-auto`, e rodar o
índice novo (`firebase deploy --only firestore:indexes`, pelo usuário).

**Critério:** seção no checklist com passos e resultado esperado.

#### Tarefa 5.2 — CLAUDE.md

**Arquivo(s) a criar/modificar:** `CLAUDE.md` (seções Functions e Produtos)

**O que fazer:** documentar a agendada, a fila `vinculosAuto`, o `decidirGtin` (mesma
loja / consenso ≥ 2 lojas / ambíguo → sugestões) e que o Menor Preço agora também é
chamado pelas Functions (só pela agendada).

**Critério:** `npm run lint`, `npm run test:ci`, `npm --prefix functions test`,
`npm --prefix functions run typecheck` e `ng build --configuration=production` verdes.

---

## Estrutura Final de Arquivos

```
shared/
├── model.ts                         (2.3, 4.1) VinculoAuto, Produto.vinculoOrigem/sugestoesEan/vinculoBloqueado
├── normalizar.ts                    (2.2) abreviações novas
├── vinculo-auto.ts                  (2.2) termoDeBusca, decidirGtin
└── vinculo-auto.spec.ts             (2.2)
functions/
├── src/
│   ├── index.ts                     (3.2) export vincularProdutosAuto
│   ├── config.ts                    (1.1) VINCULO_AUTO_ATIVO
│   ├── importar/contexto.ts         (2.1) buscarMenorPreco
│   ├── importar/publicar-precos.ts  (2.3) enfileira produtos loc: novos
│   ├── dados/repositorio.ts         (3.2) consultarVinculosVencidos
│   ├── dados/repositorio-firestore.ts (3.2)
│   ├── menor-preco/cliente.ts       (2.1)
│   ├── menor-preco/oferta.ts        (2.1)
│   ├── produtos/vincular-produto.ts (3.1, 3.3) núcleo, garantirProdutoEan, sugestões
│   └── produtos/vincular-auto.ts    (3.2) agendada
└── test/
    ├── fakes/repositorio-memoria.ts (3.2)
    └── fixtures/menor-preco/*.json  (1.1)
src/app/features/produtos/
├── detalhe/produto-detalhe.page.html (4.1)
└── vincular/vincular-dialog.ts      (4.2)
e2e/produtos.spec.ts                 (4.2)
firestore.indexes.json               (2.3)
docs/analise/spike-vinculo-automatico-2026-09.md (1.1)
docs/qualidade/functions-dv-checklist.md (5.1)
CLAUDE.md                            (5.2)
```

---

## Ordem de Execução Recomendada

```
1.1 spike ──► 2.2 decidirGtin ──┐
     │                          ├──► 3.2 agendada ──► 5.1 checklist ──► 5.2 docs
     └──► 2.1 cliente ──────────┤        ▲
          2.3 fila ─────────────┘        │
          3.1 núcleo do vínculo ─────────┼──► 3.3 callable ──► 4.2 diálogo
                                         └──► 4.1 página do produto
```

2.1, 2.3 e 3.1 são independentes entre si e podem ser feitas em paralelo depois da 1.1.

---

## Critérios de Aceitação Globais

- [ ] Spike registrado com a taxa de vinculação das duas notas reais e a decisão do `VINCULO_AUTO_ATIVO`.
- [ ] Produto `loc:` novo é enfileirado uma única vez, sem uid.
- [ ] Item com um único GTIN em ≥ 2 lojas (ou na mesma loja) é vinculado a `ean:{gtin}`, criando o `ean:` quando não existe.
- [ ] Item com GTINs concorrentes **não** é vinculado e ganha até 3 `sugestoesEan`.
- [ ] Conteúdo diferente (ex.: 500 ml × 1 l) nunca é vinculado.
- [ ] Produto desvinculado manualmente nunca volta a ser vinculado pelo job.
- [ ] Menor Preço fora do ar não gasta tentativa e interrompe a execução.
- [ ] No máximo 40 consultas por execução, 1 s entre elas.
- [ ] Página do produto indica o vínculo automático; o diálogo oferece as sugestões com "É este".
- [ ] Buscar pelo GTIN em Produtos encontra o `ean:` com os `loc:` de mercados diferentes como equivalentes.
- [ ] Testes (front, `shared/`, Functions) só com fixtures reais, sem rede; lint, typecheck e build de produção verdes.
