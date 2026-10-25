# Plano de Desenvolvimento: Nome legível do produto por IA + vínculo mais inteligente

**Data:** 25/10/2026
**Projeto:** fed-catalogo-compara-precos (Cupom Esperto)
**Análise base:** sem análise dedicada. Parte de
[vinculo-etiquetas-ia-plano.md](vinculo-etiquetas-ia-plano.md) (vínculo atual) e do diagnóstico
no dv de 24/10/2026 (resumo abaixo).
**Branch alvo:** `main`

---

## Visão Geral

### Problema

A NFC-e traz a descrição cortada em ~20 caracteres e cheia de abreviações ("Det Ype 500ml Coco",
"Ge d Close Up 100g c", "Req Batavo 200g Ligh"). Isso tem dois efeitos:

1. **Leitura ruim** em todas as telas que mostram itens (nota, lista, sugestões, produto).
2. **Vínculo fraco.** A regra das etiquetas (`shared/etiquetas.ts`) tenta achar tipo, marca e
   tamanho por regex. Quando falta marca ou tamanho, `bloco` fica `null` e o produto **nunca**
   entra no vínculo, nem pela regra nem pela IA.

### Diagnóstico real do dv (24/10/2026)

| Medida | Valor |
|---|---|
| Produtos / notas / mercados | 132 / 5 / 3 (≈100 produtos de um mercado só) |
| Produtos com `bloco: null` (fora do vínculo) | 31 — hortifruti e carne a granel ("Cebola Kg" × "FEIRA CEBOLA KG", "Repolho Verde Un" × "FEIRA REPOLHO VERDE UNID") |
| Blocos vistos em mais de um mercado | 1 de 90 (`COCA COLA\|0.2L`) |
| Chamadas à IA | 1, em 01/10, **falhou**: log `etapa: vinculo, erro: ia-erro, custoUsd: 0`; `controle/iaVinculo_2026-10 = { chamadas: 1, custoUsd: 0 }` |

Custo zero = a API recusou antes de cobrar tokens. O log não diz o motivo porque `vincularNota`
gravava só `ia-erro` (corrigido na tarefa 2.1). Hipóteses: chave de uma organização do Console sem
saldo, chave inválida ou erro passageiro. O plano **Max 5x do usuário inclui US$ 100/mês de
créditos de API**, mas só na organização do Console **vinculada** em claude.ai → Configurações →
Faturamento → "Créditos de API" (ver
[créditos para assinantes](https://platform.claude.com/docs/pt-BR/about-claude/api-credits-for-subscribers)).

### O que será construído

Na importação, os itens cujo produto **ainda não tem nome** vão em **uma chamada à IA por nota**,
que devolve para cada um um **nome legível** e **campos estruturados** (tipo, marca, variantes,
tamanho, a granel). Isso é gravado em `produtos/{id}` (`nome`, e as `etiquetas` passam a vir da IA)
e no item da nota do usuário (`nome`). As telas mostram o nome legível com a descrição original da
nota em letra menor. O vínculo usa as etiquetas da IA, e produtos a granel ganham bloco próprio,
entrando no vínculo. Um nome errado pode ser corrigido pelo usuário. O script
`functions/scripts/reprocessar-vinculos.ts` (já escrito, sem commit) ganha o passo de normalizar
os produtos que já existem.

### Decisões

| # | Decisão |
|---|---|
| D-01 | **Onde:** no fim de `obterNotaDaSefaz` (`importar/obter-nota.ts`), em paralelo ao `completarEmitente`. Vale para a prévia e para a fila; a confirmação reaproveita a prévia (`previews/{uid}_{chave}` já guarda o `NfceParsed`). A prévia mostra os nomes. |
| D-02 | **Só o que falta:** lê `produtos/{produtoIdDe(…)}` dos itens; produto com `nome` empresta o nome ao item sem chamar a IA. Só os itens sem nome vão para a IA. Produto com `nomeOrigem: 'manual'` nunca é sobrescrito. |
| D-03 | **Falha nunca derruba a importação** (igual ao CNPJ): sem resposta, o item fica sem `nome`, a tela mostra a descrição, as etiquetas voltam para a regra (`etiquetar`) e a próxima nota com o mesmo produto tenta de novo. Log `etapa: 'nome'` só com contagens e o motivo do erro. |
| D-04 | **Saída da IA** por item: `{ i, nome, tipo, marca, variantes[], tamanho: { quantidade, unidade } \| null, granel }`, validada por zod. A IA recebe só as descrições, com números curtos, como no vínculo. O **tamanho da regex vence** quando a descrição tem um conteúdo legível (`extrairConteudo`) e a IA diz outro: a regex não alucina número. |
| D-05 | **Etiquetas da IA no formato atual** (`Etiquetas` de `shared/etiquetas.ts`, com `origem: 'ia' \| 'regra'`), então `decidirPorEtiquetas` e `vincularNota` seguem iguais. Bloco: `MARCA\|tamanho` com marca e tamanho; a granel, **`MARCA\|GRANEL`** com marca (linguiça Siqueirense × Sadia não podem cair no mesmo bloco sem variante) ou **`GRANEL\|TIPO`** sem marca; senão `null`. |
| D-06 | **Granel liga pela regra:** dois produtos a granel do mesmo tipo e **sem variante dos dois lados** ligam direto ("Cebola Kg" × "FEIRA CEBOLA KG"). Com variante de um lado ("cebola roxa"), segue a regra atual (dúvida → IA do vínculo). |
| D-07 | **Sem trava de custo** (decisão do usuário, uso só dele): sai a checagem de `IA_TETO_MENSAL_USD` em `vincularNota`. O gasto continua registrado, agora em `controle/ia_AAAA-MM` com `{ custoUsd, chamadas, porEtapa: { nome, vinculo } }`, para acompanhar. |
| D-08 | **Motivo do erro no log:** `erroIa(e)` traduz o erro do SDK em `ia-<status>` (`ia-400`, `ia-401`, `ia-429`, `ia-529`), `ia-timeout` ou `ia-conexao`, mais o `tipo` da API (`authentication_error`, `invalid_request_error`…). Nunca a chave, a mensagem livre nem as descrições. Vale para o vínculo e para o nome. |
| D-09 | **Correção do nome:** callable `renomearProduto({ id, nome })` grava `produtos/{id}.nome` com `nomeOrigem: 'manual'` e propaga o nome às notas **do uid** que têm esse produto (molde de `operacoesDeNome`). É uma correção da base compartilhada, não um apelido pessoal: hoje só o usuário usa o app. **Revisitar quando houver outros usuários** (virar nome pessoal em `usuarios/{uid}/…`, como o apelido). Validação pura em `shared/nome-produto.ts` (`limparNomeProduto`: 2 a 80 caracteres, com letra, sem controle). |
| D-10 | **Modelo:** constante própria `IA_MODELO_NOME` em `vinculo/config-ia.ts`. A prévia espera a resposta, então começar pelo modelo rápido (Haiku 5.5) e comparar com o do vínculo (Opus 5.5) no gabarito (tarefa 2.3). Conferir ids, parâmetros (`effort`, saída estruturada) e preços na skill `claude-api` antes de codificar. Timeout 20 s, 1 retry. |
| D-11 | **Desnormalizado no item da nota** (`ItemNota.nome`), como o `estabelecimentoNome`: todas as telas que leem itens de nota (detalhe, histórico, sugestões, lista, conferência, painel) só trocam `descricao` por `nomeDoItem(item)`, sem ler `produtos`. Telas que leem `produtos` usam `produto.nome`. |

---

## Convenções Obrigatórias

- **Functions:** toda regra de negócio recebe o `Contexto`; a IA chega por uma função injetada
  (`normalizarNomes`, como `classificarVinculos`), com fake nos testes. **Nenhum teste chama a
  Claude API.** Firestore só por `dados/repositorio.ts`, testado com `RepositorioMemoria`.
- Secret `ANTHROPIC_API_KEY` declarado em toda function que chama a IA. `obterNotaDaSefaz` é
  usado pela prévia (inclusive na reimportação, via `atualizarNaReimportacao`) e pela fila
  (`reprocessarPendentes`, que já tem o secret): só `previewNfce` passa a declará-lo.
- Log sem dado pessoal: só `chavePrefixo` e contagens (RNF-30). Descrição e nome de produto não
  vão para o log.
- O cliente **nunca escreve** em `produtos` nem nas notas: renomear é callable.
- Domínio puro em `shared/` (sem Angular, Firebase ou npm), usado pelo front e pelas Functions.
- **Angular 22:** standalone, `inject()`, `input()`/`output()`, signals, `OnPush` explícito,
  `@if`/`@for` com `track`, Signal Forms no diálogo de correção, diálogo carregado por `import()`.
- Classe global primeiro (`src/styles.scss`); cor só por token `$cp-*`; textos em pt-BR no template.
- Ícone novo do Material Symbols entra no `icon_names=` do `index.html`, em ordem alfabética.
- Sem Firebase Emulator Suite; `firebase deploy` e `git push` ficam com o usuário.

---

## Pré-condições

1. **Saldo na organização da chave:** a chave do secret `ANTHROPIC_API_KEY` precisa ser de uma
   organização do Console com saldo — a vinculada ao plano Max (créditos mensais em
   platform.claude.com/settings/billing → "Promotional credits") ou com créditos comprados. Sem
   saldo a API responde `ia-400` (`invalid_request_error`, "credit balance is too low"); tudo
   funciona, mas sem nome e sem IA no vínculo.
2. **Deploy pelo usuário:** `npm run deploy:functions:dev` depois das fases 2 a 4.
3. ADC local (`gcloud auth application-default login`, já feito em 24/10) para o script da fase 6.

---

## Fases de Implementação

### Fase 1 — Modelo e regra pura

**Objetivo:** tipos e funções puras que o front e as Functions compartilham.

#### Tarefa 1.1 — Campos novos no modelo

**Arquivo(s) a modificar:** `shared/model.ts`, `shared/etiquetas.ts`

**O que fazer:**
- `ItemNfce.nome?: string` (herdado por `ItemNota`): nome legível, ausente quando a IA não respondeu.
- `Produto.nome?: string` e `Produto.nomeOrigem?: 'ia' | 'manual'`.
- `Etiquetas.origem?: 'ia' | 'regra'` (ausente = regra, compatível com os produtos já gravados).
- Tipos da callable: `RenomearProdutoEntrada { id: ProdutoId; nome: string }`.

**Critério:** `npm --prefix functions run typecheck` e `ng build` passam sem outras mudanças.

#### Tarefa 1.2 — `shared/nome-produto.ts`

**Arquivo(s) a criar:** `shared/nome-produto.ts`, `shared/nome-produto.spec.ts`

**O que fazer:**
- `nomeDoItem(item: { nome?: string; descricao: string }): string` → `nome ?? descricao`.
- `limparNomeProduto(nome: string): string | null` (D-09): espaços colapsados, 2 a 80
  caracteres, pelo menos uma letra, sem caractere de controle; senão `null`.
- `etiquetasDaIa(r: NomeIa, descricao: string): Etiquetas` (D-04/D-05): marca e tipo em
  maiúsculas sem acento (`semAcento`, como a regra), variantes pelo `sinonimo` da regra,
  tamanho no formato de `formatarTamanho` (`0.5L`, `1kg`), com a regex vencendo quando
  `extrairConteudo(descricao)` acha outro valor; bloco `MARCA|tamanho`, `MARCA|GRANEL`, `GRANEL|TIPO` ou `null`;
  `origem: 'ia'`.
- Exportar de `shared/etiquetas.ts` o que for preciso (`sinonimo` e `formatarTamanho`, hoje
  privados), sem duplicar.

```ts
export interface NomeIa {
  nome: string;
  tipo: string | null;
  marca: string | null;
  variantes: string[];
  tamanho: { quantidade: number; unidade: 'g' | 'kg' | 'ml' | 'L' | 'un' } | null;
  granel: boolean;
}
```

**Critério:** specs cobrem "Det Ype 500ml Coco" (bloco `YPE|0.5L`), "FEIRA CEBOLA KG" (granel →
`GRANEL|CEBOLA`), tamanho divergente da regex (regex vence), nome inválido (vazio, só números,
81 caracteres). 100 % de cobertura do arquivo.

#### Tarefa 1.3 — Regra do granel no `decidirPorEtiquetas`

**Arquivo(s) a modificar:** `shared/etiquetas.ts`, `functions/test/etiquetas-gabarito.spec.ts`
(ou spec própria em `shared/`)

**O que fazer:** D-06. Quando o alvo e o único candidato `igual` são do mesmo bloco a granel (`MARCA|GRANEL` ou `GRANEL|TIPO`) e
nenhum dos dois tem variante, devolver `ligar`. O `Candidato` passa a levar o `bloco` (ou um
`granel: boolean`) para a regra saber. Os outros casos não mudam.

**Critério:** "Cebola Kg" × "FEIRA CEBOLA KG" liga; "Cebola Kg" × "Cebola Roxa Kg" vai para a
IA; o gabarito (`etiquetas-gabarito.spec.ts`) não piora.

---

### Fase 2 — IA nas Functions: erro legível, sem teto e normalização

**Objetivo:** a IA passa a dizer por que falhou, não tem mais teto, e existe a função que dá nome
aos produtos. Pode ir para o dv logo após a 2.1, para diagnosticar a chave.

#### Tarefa 2.1 — Motivo do erro e fim do teto

**Arquivo(s) a modificar:** `functions/src/vinculo/ia.ts`, `functions/src/vinculo/vincular-nota.ts`,
`functions/src/vinculo/config-ia.ts`, `functions/test/vincular-nota.spec.ts`,
`functions/test/vinculo-ia.spec.ts`

**O que fazer:**
- `erroIa(e: unknown): { erro: string; tipo?: string }` em `ia.ts` (D-08): `Anthropic.APIError`
  → `ia-${status}` + `error.type`; timeout → `ia-timeout`; conexão → `ia-conexao`;
  `IaSemDecisaoError` → `ia-${motivo}` (como hoje); resto → `ia-erro`.
- `vincularNota` usa `erroIa` no log (`erro`, `tipoErro`).
- Remover a checagem `IA_TETO_MENSAL_USD` e a constante (D-07). O gasto passa para
  `controle/ia_AAAA-MM` com `porEtapa` (`registrarGasto(ctx, etapa, custo, chamadas)` exportado
  para a etapa do nome usar).
- Atualizar o `reprocessar-vinculos.ts` (script e regra) que lê o gasto e cita o teto.

**Critério:** teste com o fake rejeitando um `APIError` 400 `invalid_request_error` loga
`erro: 'ia-400', tipoErro: 'invalid_request_error'`; o teste "teto do mês estourado" vira "chama a
IA mesmo com gasto alto"; o log continua sem descrição nem CNPJ.

#### Tarefa 2.2 — `normalizarNomes` (a chamada)

**Arquivo(s) a criar:** `functions/src/nome/ia-nome.ts`, `functions/test/ia-nome.spec.ts`
**Arquivo(s) a modificar:** `functions/src/importar/contexto.ts`, `functions/src/index.ts`,
`functions/src/vinculo/config-ia.ts`, `functions/test/apoio.ts`

**O que fazer:**
- `type NormalizarNomes = (itens: { i: number; d: string }[]) => Promise<{ nomes: Map<number, NomeIa>; custoUsd: number }>`
  no `Contexto` (fake em `criarContexto`, devolvendo vazio por padrão).
- `criarNormalizador(apiKey)` no molde de `criarClassificador`: `IA_MODELO_NOME` (D-10), saída
  estruturada com zod, prompt de sistema curto com o glossário da NFC-e (o de `SISTEMA_IA` +
  hortifruti/açougue: "KG", "UN", "BDJ", "S OSSO", "C PELE"), regra "nome em português, marca com
  a grafia oficial quando souber, sem inventar o que a descrição não diz; descrição cortada fica
  sem a parte que falta". Partes de até 40 itens, no máximo 3 chamadas em paralelo.
- Itens com `i` desconhecido ou repetido são descartados (como `traduzirDecisoes`).
- `index.ts`: o normalizador nasce na 1ª chamada, como o classificador.

**Critério:** specs da tradução (`interpretar…`) com mensagens montadas à mão: resposta válida,
recusa (`stop_reason` ≠ `end_turn`), JSON inválido, item desconhecido. Nenhum teste chama a API.

#### Tarefa 2.3 — Medição no gabarito (manual)

**Arquivo(s) a criar:** `functions/scripts/avaliar-ia-nome.ts`

**O que fazer:** no molde de `avaliar-ia-vinculo.ts`, mandar as descrições do gabarito
(`functions/test/fixtures/vinculo/gabarito-menor-preco-2026-09.json`) e das fixtures reais para a
API com Haiku e com Opus e imprimir, por modelo: tempo médio por parte de 40, custo, quantos blocos
coincidem dentro do mesmo GTIN e uma amostra de 30 nomes para conferência visual.

**Critério:** saída do script colada na execução do plano, com a escolha do modelo registrada em
`config-ia.ts`. Roda fora do `npm test`.

---

### Fase 3 — Importação com nome

**Objetivo:** toda nota nova (prévia, fila e confirmação) já nasce com nomes e etiquetas da IA.

#### Tarefa 3.1 — Nomear itens em `obterNotaDaSefaz`

**Arquivo(s) a criar:** `functions/src/nome/nomear-itens.ts`, `functions/test/nomear-itens.spec.ts`
**Arquivo(s) a modificar:** `functions/src/importar/obter-nota.ts`, `functions/src/index.ts`
(secret em `previewNfce`)

**O que fazer:** `nomearItens(ctx, nota): Promise<NfceParsed>` (D-01/D-02/D-03):
1. ids pelos itens (`produtoIdDe`), `obterVarios` de `produtos/*`;
2. item cujo produto tem `nome` recebe esse nome;
3. o resto vai para `ctx.normalizarNomes`; guarda as etiquetas da IA (`etiquetasDaIa`) num campo
   interno do item que a gravação usa (ex.: `ItemNfce.etiquetasIa?`, removido do item da nota em
   `montarNota`) — ou devolve um mapa à parte, se o `DocPreview` puder guardá-lo;
4. falha → itens sem nome, log `etapa: 'nome'` com `erroIa`; gasto em `registrarGasto(…, 'nome')`.

Rodar em paralelo com `completarEmitente`.

**Critério:** testes com `RepositorioMemoria`: produto já nomeado não chama a IA; produto
`nomeOrigem: 'manual'` mantém o nome; IA falhando não muda o resto da nota e loga o motivo; a
prévia (`executarPreview`) devolve os itens com `nome`.

#### Tarefa 3.2 — Gravar nome e etiquetas da IA

**Arquivo(s) a modificar:** `functions/src/importar/publicar-precos.ts`,
`functions/test/importacao.spec.ts`, `functions/test/vincular-nota.spec.ts`

**O que fazer:**
- `montarNota` mantém `nome` no item da nota (D-11).
- `publicarPrecos`: `nome` do item vai para `produto.nome` com `nomeOrigem: 'ia'` (sem sobrescrever
  `manual`); etiquetas da IA quando houver, senão `etiquetar` (regra). **Atenção:** hoje
  `publicarPrecos` só roda na 1ª importação da chave; produto que já existia sem nome ganha o nome
  na próxima nota nova que o contenha.
- `vincularNota` não muda além da 1.3 e da 2.1: `comoCandidato` já lê `p.etiquetas`.

**Critério:** importar a nota real (fixture `nota-real-pr-2026-09.html`) com o fake da IA grava
`nome`, `nomeOrigem: 'ia'`, `etiquetas.origem: 'ia'`; a mesma nota com a IA falhando grava como hoje.
Dois mercados com "Cebola Kg" e "FEIRA CEBOLA KG" ligam pela regra (`vinculoMotivo: 'etiquetas'`).

---

### Fase 4 — Correção do nome

**Objetivo:** o usuário corrige um nome errado, e a IA não desfaz.

#### Tarefa 4.1 — Callable `renomearProduto`

**Arquivo(s) a criar:** `functions/src/produtos/renomear-produto.ts`,
`functions/test/renomear-produto.spec.ts`
**Arquivo(s) a modificar:** `functions/src/index.ts`, `functions/src/estabelecimentos/propagar-nome.ts`
(se der para reaproveitar o laço por notas do uid)

**O que fazer:** D-09. Valida com `limparNomeProduto` (`{ ok: false, erro: 'nome-invalido' }`),
exige produto existente, grava `nome` + `nomeOrigem: 'manual'` e atualiza `itens[].nome` nas
notas do uid com esse `produtoId` (em lotes ≤ 500). Mesmo rate limit do `vincularProduto`. Log
`etapa: 'nome-manual'` só com contagens.

**Critério:** nome inválido é recusado antes de gravar; notas de outro uid não mudam; reimportar
o produto depois não troca o nome manual.

---

### Fase 5 — Front

**Objetivo:** todas as telas mostram o nome legível, com a descrição original discreta, e o
produto pode ser renomeado.

#### Tarefa 5.1 — Classe global e helper

**Arquivo(s) a modificar:** `src/styles.scss`

**O que fazer:** `.cp-descricao-original` (texto pequeno, `$cp-text-muted`, quebra longa) para a
linha da descrição da nota abaixo do nome. Mostrar a linha só quando `nome` existe e difere da
descrição.

**Critério:** `npm run lint` e `npm run contraste` passam (par novo em `scripts/contraste.mjs` se
o token não estiver lá).

#### Tarefa 5.2 — Telas que leem itens de nota

**Arquivo(s) a modificar:** `features/notas/detalhe/nota-detalhe.page.html`,
`features/notas/detalhe/historico-pessoal.ts` (descrição da compra), `features/importar/preview-nota/preview-nota.page.html`,
`features/sugestoes/sugestao.ts` e `ui/*`, `features/painel/hora-de-repor.ts`,
`features/listas/lista.ts` (`itemDaNota`, `itemDoHistorico` usam `nomeDoItem`),
`features/listas/conferencia/*`, `features/notas/detalhe/mais-barato-perto.ts` (a busca por texto
continua pela **descrição**, que é como o Menor Preço conhece o produto)

**O que fazer:** trocar a exibição de `item.descricao` por `nomeDoItem(item)` e, onde houver espaço
(detalhe da nota, prévia, produto), a linha `.cp-descricao-original`. Lógica de comparação
(normalização, tokens, Jaccard, conciliação da lista) continua sobre a **descrição**, que é estável.

**Critério:** specs existentes passam; novos casos em `notas.spec.ts` e `lista.spec.ts`: item com
`nome` mostra o nome e a descrição pequena; item sem `nome` mostra só a descrição; item adicionado
à lista a partir da nota usa o nome.

#### Tarefa 5.3 — Telas que leem `produtos`

**Arquivo(s) a modificar:** `features/produtos/busca/produtos-busca.page.html`,
`features/produtos/detalhe/produto-detalhe.page.html`, `features/produtos/vincular/vincular-dialog.ts`,
`features/estabelecimentos/detalhe/estabelecimento-detalhe.page.ts`, `features/listas/lista.ts`
(`itemDoProduto`)

**O que fazer:** `produto.nome ?? produto.descricao` na exibição; a busca por texto continua pelos
`tokens` da descrição.

**Critério:** página do produto mostra o nome como título e "Na nota: …" abaixo.

#### Tarefa 5.4 — "Corrigir nome" na página do produto

**Arquivo(s) a criar:** `features/produtos/renomear/renomear-produto-dialog.ts`
**Arquivo(s) a modificar:** `features/produtos/data-access/produtos.service.ts`
(`renomear(id, nome)` via `CHAMAR_FUNCTION`), `features/produtos/detalhe/produto-detalhe.page.*`,
`src/index.html` (ícone, se for novo)

**O que fazer:** botão "Corrigir nome" no cabeçalho do produto, diálogo com Signal Forms
(`limparNomeProduto` como validação local, mostrando a descrição da nota como referência), no
molde de `estabelecimentos/renomear/renomear-dialog.ts`. Após salvar, recarrega o produto e
`HistoricoPessoalStore.invalidar()` (as notas do uid mudaram).

**Critério:** spec do diálogo (nome inválido desabilita salvar; salvar chama a callable e fecha);
spec da página (botão abre o diálogo por `import()`).

---

### Fase 6 — Retroativo

**Objetivo:** os 132 produtos e as notas que já existem ganham nome e etiquetas da IA, e o vínculo
roda de novo com elas.

#### Tarefa 6.1 — Passo de normalização no reprocessamento

**Arquivo(s) a modificar:** `functions/src/vinculo/reprocessar-vinculos.ts`,
`functions/scripts/reprocessar-vinculos.ts`, `functions/test/reprocessar-vinculos.spec.ts`

**O que fazer:**
- Antes do vínculo: produtos sem `nome` (e sem `nomeOrigem: 'manual'`) vão para
  `ctx.normalizarNomes` em partes de 40; grava `nome`, `nomeOrigem: 'ia'`, `etiquetas` (IA) e
  `bloco`. Falha numa parte só pula aquela parte.
- O script, com `--gravar`, também atualiza `itens[].nome` nas notas de todos os usuários
  (`collectionGroup('notas')`), em lotes ≤ 500, sem tocar item com nome manual já propagado.
- Flags: `--simular` (padrão, sem IA), `--com-ia` (simulação com IA), `--gravar` (com IA),
  `--gravar --sem-ia` (só regra). Imprime uma amostra "descrição → nome".

**Critério:** testes com o fake: produto sem nome ganha nome e etiquetas da IA e só então passa
pelo vínculo; produto manual não muda; falha da IA numa parte não impede o resto. Simulação no dv
listando os nomes e quantos produtos a granel passam a ter bloco.

---

### Fase 7 — Qualidade e documentação

**Objetivo:** tudo verificado e documentado.

#### Tarefa 7.1 — e2e

**Arquivo(s) a modificar:** `e2e/support/mocks.ts`, `e2e/importar.spec.ts` (ou o spec da prévia)

**O que fazer:** a resposta mockada de `previewNfce` passa a trazer `nome` nos itens; o teste da
prévia confere o nome legível (`getByText`) e a descrição original.

**Critério:** `npm run e2e` passa (com `.env.e2e`).

#### Tarefa 7.2 — Checklist do dv e CLAUDE.md

**Arquivo(s) a modificar:** `docs/qualidade/functions-dv-checklist.md`, `CLAUDE.md`

**O que fazer:**
- Checklist: organização da chave vinculada ao Max e com saldo; secret nas functions novas; importar uma nota e ver os nomes na
  prévia; conferir `controle/ia_AAAA-MM`; forçar erro (chave inválida num projeto de teste não é
  necessário: basta conferir o log de uma falha real) e ver `ia-<status>`; renomear um produto e
  reimportar.
- CLAUDE.md: seção de Functions (etapa `nome`, `normalizarNomes` no `Contexto`, `renomearProduto`,
  sem teto, `controle/ia_AAAA-MM`, `erroIa`), seção "Produtos" (nome legível, granel no vínculo,
  correção) e as telas que usam `nomeDoItem`.

**Critério:** `npm run lint`, `npm run test:ci`, `npm --prefix functions test`,
`npm --prefix functions run typecheck`, `npm --prefix functions run build` e
`ng build --configuration=production` passam, dentro do budget.

---

## Estrutura Final de Arquivos

```
shared/
├── model.ts                                   (1.1) nome, nomeOrigem, origem
├── etiquetas.ts                               (1.1, 1.3) origem, granel liga
├── nome-produto.ts                            (1.2) novo
└── nome-produto.spec.ts                       (1.2) novo
functions/
├── src/
│   ├── importar/contexto.ts                   (2.2) normalizarNomes
│   ├── importar/obter-nota.ts                 (3.1)
│   ├── importar/publicar-precos.ts            (3.2)
│   ├── nome/ia-nome.ts                        (2.2) novo
│   ├── nome/nomear-itens.ts                   (3.1) novo
│   ├── produtos/renomear-produto.ts           (4.1) novo
│   ├── vinculo/config-ia.ts                   (2.1, 2.2) sem teto, IA_MODELO_NOME
│   ├── vinculo/ia.ts                          (2.1) erroIa
│   ├── vinculo/vincular-nota.ts               (2.1) log do erro, gasto por etapa
│   ├── vinculo/reprocessar-vinculos.ts        (6.1)
│   └── index.ts                               (2.2, 3.1, 4.1)
├── scripts/
│   ├── avaliar-ia-nome.ts                     (2.3) novo
│   └── reprocessar-vinculos.ts                (2.1, 6.1)
└── test/
    ├── apoio.ts                               (2.2)
    ├── ia-nome.spec.ts                        (2.2) novo
    ├── nomear-itens.spec.ts                   (3.1) novo
    ├── renomear-produto.spec.ts               (4.1) novo
    ├── importacao.spec.ts                     (3.2)
    ├── vincular-nota.spec.ts                  (2.1, 3.2)
    ├── vinculo-ia.spec.ts                     (2.1)
    └── reprocessar-vinculos.spec.ts           (6.1)
src/
├── styles.scss                                (5.1) .cp-descricao-original
├── index.html                                 (5.4) ícone, se novo
└── app/features/
    ├── notas/detalhe/…                        (5.2)
    ├── importar/preview-nota/…                (5.2)
    ├── sugestoes/…                            (5.2)
    ├── painel/hora-de-repor.ts                (5.2)
    ├── listas/lista.ts, conferencia/…         (5.2, 5.3)
    ├── estabelecimentos/detalhe/…             (5.3)
    └── produtos/
        ├── busca/…, detalhe/…, vincular/…     (5.3, 5.4)
        ├── data-access/produtos.service.ts    (5.4) renomear
        └── renomear/renomear-produto-dialog.ts (5.4) novo
e2e/support/mocks.ts, e2e/importar.spec.ts     (7.1)
docs/qualidade/functions-dv-checklist.md       (7.2)
CLAUDE.md                                      (7.2)
```

---

## Ordem de Execução Recomendada

```
1.1 ──┬── 1.2 ── 1.3 ──────────────┐
      │                            ▼
      └── 2.1 ──► (deploy dv: ver o motivo do erro da IA)
                │
                ▼
               2.2 ── 2.3 (manual: escolher o modelo)
                │
                ▼
               3.1 ── 3.2 ──► (deploy dv)
                │       │
                │       ├── 4.1 ──► 5.4
                │       │
                ▼       ▼
               5.1 ── 5.2 ── 5.3
                               │
                               ▼
                              6.1 ──► (simular e gravar no dv)
                               │
                               ▼
                         7.1 ── 7.2
```

A 2.1 é pequena e independente: vale fazer e publicar primeiro, para o próximo erro da IA no dv
dizer se é crédito, chave ou outra coisa.

---

## Critérios de Aceitação Globais

- [ ] Uma nota nova importada no dv mostra, na prévia e no detalhe, o nome legível de cada item com
      a descrição original em letra menor.
- [ ] Produto já nomeado não gera chamada à IA numa nota nova (log `etapa: 'nome'` com 0 itens).
- [ ] Com a IA fora (sem crédito, timeout), a importação conclui igual a hoje, os itens mostram a
      descrição, e o log traz `ia-<status>` e o tipo do erro, sem descrição nem CNPJ.
- [ ] Não há mais trava de gasto; `controle/ia_AAAA-MM` registra custo e chamadas por etapa.
- [ ] "Cebola Kg" e "FEIRA CEBOLA KG" de mercados diferentes ficam ligados pela regra.
- [ ] O vínculo usa as etiquetas da IA quando existem; o gabarito
      (`etiquetas-gabarito.spec.ts`) não piora.
- [ ] "Corrigir nome" na página do produto grava o nome, atualiza as notas do usuário, e uma
      reimportação não desfaz.
- [ ] A lista de compras, as sugestões e o painel mostram o nome legível.
- [ ] O script `reprocessar-vinculos` em `--simular --com-ia` lista "descrição → nome" dos produtos
      do dv; com `--gravar`, produtos e notas ficam nomeados e o vínculo roda de novo.
- [ ] Nenhum teste chama a Claude API; `npm run lint`, `npm run test:ci`,
      `npm --prefix functions test`, typecheck, build das Functions e build de produção passam.
