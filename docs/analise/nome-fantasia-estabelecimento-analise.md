# Análise: Nome fantasia do estabelecimento

**Data:** 2026-09-30
**Projeto:** fed-catalogo-compara-precos (Cupom Esperto)
**Escopo:** preencher o **nome fantasia** do estabelecimento na importação da NFC-e,
consultando o **CNPJ do emitente** numa base pública da Receita (BrasilAPI, com reserva
na minhareceita.org), **nas Functions**. A página da SEFAZ só traz a razão social. O Menor
Preço foi avaliado e **descartado** como fonte (seção 2.2). Inclui também:
- **reimportação:** quando o usuário tenta importar de novo uma nota que já tem e os
  dados do estabelecimento estão incompletos, eles são completados com essa nota;
- **custo:** limpeza automática das imagens das Functions no Artifact Registry.

---

## 1. Contexto

**O que já existe**

- `Emitente.fantasia?` e `Estabelecimento.fantasia?` existem em `shared/model.ts`, mas
  **nenhum código preenche o campo**: o parser do PR (`functions/src/parsers/pr.ts`) lê só
  `#u20.txtTopo` (razão social), CNPJ e endereço. Na nota real da fixture
  (`nota-real-pr-2026-09.html`) aparece "Sanches e Vecchiate Ltda", e o nome da loja
  (Box Atacadista) não aparece em lugar nenhum.
- A exibição já prefere o nome fantasia quando ele existe:
  - prévia (`preview-nota.page.html`: `emitente.fantasia || emitente.nome`);
  - lista e detalhe de estabelecimentos, e a busca por nome da lista;
  - `resumo.ts` da página do produto;
  - `montarNota` (`publicar-precos.ts`) grava `estabelecimentoNome = fantasia || nome`
    na nota do usuário. Esse nome desnormalizado é o que aparece em Minhas notas, no
    detalhe da nota, no painel, no filtro por estabelecimento, no histórico pessoal, nas
    sugestões e no snackbar da fila.
- `gravarNota` grava `estabelecimentos/{cnpj}` com `merge: true` e só inclui `fantasia`
  quando ela vem no `parsed`. Portanto, uma nota sem nome fantasia não apaga o que já
  foi gravado.
- Fluxo da importação:
  - **prévia:** `executarPreview` → `obterNotaDaSefaz` → grava `previews/{uid}_{chave}`
    com a nota interpretada;
  - **confirmação:** `confirmarNfce` → `gravarNota(preview.nota)`, sem consultar a
    SEFAZ de novo;
  - **fila:** `reprocessarPendentes` → `obterNotaDaSefaz` → `gravarNota`.

  Como `obterNotaDaSefaz` é o ponto comum da prévia e da fila, completar o emitente
  ali atende às três rotas.
- **Reimportação hoje:** `executarPreview` consome o rate limit e, se
  `usuarios/{uid}/notas/{chave}` já existe, lança `ja-importada` **antes** de ir à SEFAZ.
  O front mostra "Você já importou essa nota." com a ação "Abrir nota"
  (`mensagens.ts`, `importar.page.ts`). Os pontos que importam para a feature:
  - o CNPJ do emitente está na própria chave (`extrairChave(chave).cnpj`, posições 7 a
    20);
  - a nota existente tem `cnpj`, `estabelecimentoNome` e `estabelecimentoCidade`.
- **Custo das Functions:** a consulta roda dentro de invocações que já existem (prévia,
  fila), sem criar invocação nova. A cota gratuita do Blaze é de 2 milhões de
  invocações, 400 mil GB-s e 200 mil CPU-s por mês; no Firestore, 50 mil leituras e 20
  mil escritas por dia. O custo que aparece mesmo com pouco uso é o **Artifact
  Registry** (`gcf-artifacts`), que guarda a imagem de cada deploy das Functions. A CLI
  (`firebase-tools` 15.31) tem `firebase functions:artifacts:setpolicy`. O CI faz deploy
  com `--non-interactive --force`, mas não há registro no repositório de que a política
  exista no dv e na produção (não há `gcloud` na máquina para conferir).
- `Contexto` (`importar/contexto.ts`) já injeta as dependências externas (`buscar`,
  `classificarVinculos`) e tem fakes em `functions/test/apoio.ts`. A consulta de CNPJ
  entra do mesmo jeito.

**O que falta**

- Uma consulta de CNPJ com as mesmas proteções do fetch da SEFAZ: URL montada no
  servidor, host fixo, timeout e limite de tamanho.
- Uma regra para saber **quando consultar**: uma vez por estabelecimento, com
  revalidação espaçada, sem repetir a consulta a cada nota.
- A exibição da razão social quando ela for diferente do nome fantasia (detalhe do
  estabelecimento).
- O preenchimento dos estabelecimentos e das notas que já estão no dv.
- Na reimportação: conferir se o estabelecimento está completo e, se não estiver,
  completar e propagar o nome para as notas do usuário.
- Política de limpeza do Artifact Registry no dv e na produção.

## 2. Dados Disponíveis

### 2.1 Fontes

| Fonte | Acesso | O que entrega | Uso |
|---|---|---|---|
| Página da NFC-e (SEFAZ-PR) | Functions, `obterNotaDaSefaz` | razão social, CNPJ, endereço | já usado |
| **BrasilAPI** `GET https://brasilapi.com.br/api/cnpj/v1/{cnpj}` | pública, sem chave, CORS `*` | `razao_social`, `nome_fantasia`, endereço, situação, CNAE, QSA… | **fonte principal** |
| **minhareceita.org** `GET https://minhareceita.org/{cnpj}` | pública, sem chave | mesmo formato (`nome_fantasia`, 48 campos) | **reserva** |
| `estabelecimentos/{cnpj}` (Firestore) | Functions (admin) | `fantasia` e `fantasiaConsultadaEm` (novo) | cache da consulta |
| Menor Preço | só do navegador | `nm_fan`, `nm_emp`, endereço, **sem CNPJ** | **descartado** |

Teste feito em 30/09/2026:

| CNPJ | BrasilAPI | minhareceita |
|---|---|---|
| 03.644.587/0008-36 (nota real) | 200 em ~0,1 s · `SANCHES E VECCHIATE LTDA` · **`BOX ATACADISTA`** | mesmo resultado |
| 76.189.406/0001-26 | 200 · `CONDOR SUPER CENTER LTDA` · `nome_fantasia: ""` | — |
| 00.000.000/0000-00 | **404** em ~0,2 s | — |

### 2.2 Por que não o Menor Preço

Conferido nas fixtures reais de `src/testing/fixtures/menor-preco/`:

1. **Não há CNPJ.** A loja vem com um `codigo` opaco, `nm_emp` e o endereço. Achar a loja
   da nota exigiria comparar razão social e endereço sujo (`"127-"`, `"CEL-AV, JOSE…"`).
2. **`nm_fan` vazio em 25 das 37 lojas** (busca por GTIN) e em cerca de 40 % das lojas
   nas buscas por termo.
3. **Não existe busca por estabelecimento.** A loja só aparece numa busca de produto
   feita perto dela.
4. **Das Functions, a API devolve dados sintéticos** (`envenenada-leite-lider.json`).
   Portanto, só o navegador poderia consultar.
5. Como o cliente não escreve em `estabelecimentos`, o nome teria de chegar por
   callable. Qualquer usuário poderia renomear uma loja compartilhada, e o servidor não
   teria como conferir.

### 2.3 Formato da resposta (campos usados)

```jsonc
{ "cnpj": "03644587000836", "razao_social": "SANCHES E VECCHIATE LTDA",
  "nome_fantasia": "BOX ATACADISTA", "uf": "PR", "municipio": "SANTO ANTONIO DA PLATINA",
  "descricao_situacao_cadastral": "ATIVA", "qsa": [ … ] }
```

Só `cnpj` e `nome_fantasia` são lidos. O **QSA** (sócios, às vezes pessoa física) e o
resto da resposta são descartados na hora e **nunca gravados nem logados**.

## 3. Requisitos Funcionais

- **RF-01** Ao obter uma nota da SEFAZ, na prévia ou na fila, as Functions completam
  `emitente.fantasia` com o nome fantasia do CNPJ do emitente, quando ele existir.
- **RF-02** A consulta externa acontece **só quando é necessária**:
  - `estabelecimentos/{cnpj}` com `fantasiaConsultadaEm` há menos de
    **`REVALIDAR_FANTASIA_DIAS` (180)** → usa o `fantasia` gravado, que pode estar
    ausente, e não consulta;
  - sem `fantasiaConsultadaEm` (estabelecimento novo ou anterior à feature), ou
    consulta vencida → consulta.
- **RF-03** Ordem das fontes: BrasilAPI primeiro. Se ela falhar (timeout, erro de rede,
  5xx ou 429), tenta a minhareceita.org. **404** ("CNPJ não encontrado") é resposta
  definitiva e não aciona a reserva.
- **RF-04** O nome fantasia é **descartado** (tratado como ausente) quando, depois de
  limpo (trim e espaços colapsados):
  - fica vazio;
  - não tem nenhuma letra (ex.: `"********"`, `"."`);
  - é igual à razão social, comparando por `normalizarDescricao` (sem acento, caixa e
    pontuação).
- **RF-05** O nome fantasia é guardado **como a Receita devolve** (em maiúsculas),
  depois da limpeza do RF-04. Não há conversão de caixa (D-03).
- **RF-06** Consulta bem-sucedida (200 com ou sem nome fantasia, ou 404): o
  estabelecimento recebe `fantasiaConsultadaEm = agora` e, se houver, `fantasia`. Com
  isso, o CNPJ não é consultado de novo até vencer o prazo. Se a Receita deixar de
  informar um nome fantasia que já estava gravado, o nome antigo é mantido: o `merge`
  não apaga campos, e o caso é raro demais para justificar um "apagar campo" no
  repositório.
- **RF-07** Consulta que falhou nas duas fontes: a importação **segue normalmente**, sem
  nome fantasia novo. O `fantasia` já gravado é mantido, `fantasiaConsultadaEm` não muda
  e a próxima nota desse CNPJ tenta de novo.
- **RF-08** A prévia mostra o nome fantasia (o template já faz isso). O
  `previews/{uid}_{chave}` guarda a nota já completada, então a confirmação **não
  consulta de novo**.
- **RF-09** `montarNota` continua gravando `estabelecimentoNome = fantasia || nome`. As
  notas novas já nascem com o nome fantasia em Minhas notas, no painel, nas sugestões
  etc.
- **RF-10** Detalhe do estabelecimento: o título é o nome fantasia (já é assim) e,
  quando houver nome fantasia, a razão social aparece numa linha abaixo ("Razão social:
  Sanches e Vecchiate Ltda").
- **RF-11** Preenchimento retroativo: um script manual
  (`functions/scripts/preencher-fantasia.ts`), rodado pelo usuário contra um projeto,
  faz o seguinte:
  - consulta os `estabelecimentos` sem `fantasiaConsultadaEm`, com 1 s entre as
    consultas, e grava o mesmo que o RF-06;
  - atualiza `estabelecimentoNome` das notas desses CNPJs (`collectionGroup('notas')
    where cnpj ==`).

  O script tem **`--simular`** (padrão: só lista o que mudaria) e **`--gravar`**.
- **RF-12** Log estruturado da etapa `cnpj`, **sem CNPJ e sem nome**: `resultado`
  (`sucesso`/`falha`), `duracaoMs` e `contagens` (`{ cache, brasilapi, minhareceita,
  semFantasia, naoEncontrado }`).

**Reimportação (nota que o usuário já tem)**

- **RF-13** Ao detectar a nota já importada, a prévia confere
  `estabelecimentos/{cnpj}` (CNPJ tirado da chave) **antes** de responder `ja-importada`.
  A função pura `avaliarEstabelecimento(estab, agora)` devolve:
  - **`'sefaz'`**: o documento não existe, ou falta `nome`, `endereco` ou `cidade`.
    Esses dados só existem na página da nota;
  - **`'fantasia'`**: os dados da SEFAZ estão completos, mas `precisaConsultar` (RF-02)
    é verdadeiro;
  - **`'completo'`**: nada a fazer, e nenhuma chamada externa é feita.
- **RF-14** `'sefaz'`: busca a página da nota de novo (`obterNotaDaSefaz`, que já
  completa o nome fantasia pelo RF-01) e usa o emitente dessa leitura. `'fantasia'`:
  **não** vai à SEFAZ; completa só o nome fantasia pelo CNPJ (`completarEmitente` sobre o
  emitente montado a partir do estabelecimento gravado).
- **RF-15** Se algo mudou:
  - grava `estabelecimentos/{cnpj}` com `merge` (os campos da SEFAZ, se relidos,
    `fantasia`, `fantasiaConsultadaEm` e `atualizadoEm`);
  - atualiza `estabelecimentoNome` (e `estabelecimentoCidade`, se relida) em **todas as
    notas desse usuário daquele CNPJ** (`usuarios/{uid}/notas where cnpj ==`), em lote.
    As notas dos outros usuários ficam para a importação deles ou para o script do
    RF-11.
- **RF-16** A resposta continua `ok: false` com `ja-importada`, agora com
  `estabelecimentoAtualizado: true` quando houve atualização. O front mostra "Você já
  importou essa nota. Aproveitamos para atualizar os dados do estabelecimento.", mantém a
  ação "Abrir nota" e invalida o `HistoricoPessoalStore`, para Minhas notas, painel e
  sugestões mostrarem o nome novo.
- **RF-17** Qualquer falha na atualização (SEFAZ fora, layout inesperado, CNPJ fora)
  **não muda a resposta**: continua `ja-importada`, sem o flag, e nada é gravado. A
  reimportação consome o rate limit como hoje. Não é aberto pendente na fila para isso.

**Custo**

- **RF-18** Política de limpeza no repositório `gcf-artifacts` (`southamerica-east1`) do
  dv e da produção:
  - manter as imagens por **1 dia** (padrão da CLI). O rollback do projeto é por novo
    deploy a partir do git, não por revisão antiga;
  - scripts `npm run artifacts:limpeza:dev` / `:prod` com
    `firebase functions:artifacts:setpolicy --location southamerica-east1 --days 1 --force -P dev|prod`,
    **rodados pelo usuário** (mudam a configuração do projeto na nuvem);
  - registro no `CLAUDE.md` e no checklist de Functions do dv.

## 4. Requisitos Não Funcionais

- **RNF-01 Desempenho:**
  - timeout de **3 s por fonte** e teto de **5 s** para a consulta inteira (a segunda
    fonte só recebe o tempo que sobrou);
  - com cache (RF-02), a grande maioria das notas não faz chamada externa (as lojas se
    repetem);
  - a prévia fica mais lenta **apenas na primeira nota de cada loja**;
  - na reimportação, estabelecimento completo custa **uma leitura** e nenhuma chamada
    externa. Só o caso `'sefaz'` repete o fetch da SEFAZ (até 15 s, como numa prévia
    normal);
  - o bundle do front não muda (nenhuma dependência nova no app);
  - `confirmarNfce` (120 s) e `reprocessarPendentes` (540 s) têm folga de tempo.
- **RNF-02 Responsividade:** a linha "Razão social" do detalhe do estabelecimento quebra
  como o restante do cabeçalho (`.cp-detail-header`). Nomes longos quebram linha e não
  são truncados.
- **RNF-03 Acessibilidade (WCAG AA):**
  - a razão social é texto comum com rótulo visível ("Razão social:");
  - o `<h1>` continua sendo um só;
  - cores só por tokens já existentes (`$cp-text-*`), sem par novo de contraste.
- **RNF-04 Manutenibilidade:**
  - a consulta fica num módulo próprio `functions/src/cnpj/` e entra no `Contexto` como
    `consultarCnpj`;
  - a regra pura (limpeza e decisão de "precisa consultar") fica em
    `shared/nome-fantasia.ts`, TypeScript puro;
  - o front segue as convenções do projeto (OnPush, standalone, sem comentários
    supérfluos);
  - nenhuma dependência npm nova: `fetch` nativo do Node 22, validação com o `zod` que
    as Functions já usam.
- **RNF-05 Testabilidade:**
  - fixtures reais em `functions/test/fixtures/cnpj/`, gravadas **sem QSA** (200 com
    nome fantasia, 200 com `nome_fantasia: ""`, 404);
  - o fake de `consultarCnpj` fica em `apoio.ts`, e **nenhum teste chama as APIs de
    verdade**;
  - o cliente HTTP é testado com um `fetch` falso (timeout, 5xx → reserva, 404 sem
    reserva, corpo grande demais, JSON inválido, CNPJ da resposta diferente do pedido);
  - 100 % de cobertura em `shared/nome-fantasia.ts`;
  - o e2e não muda: as Functions são interceptadas e o mock da prévia pode trazer
    `fantasia`.
- **RNF-06 Segurança:**
  - **anti-SSRF:** a URL é montada no servidor com o CNPJ já validado (14 dígitos e DV
    ok, `validarCnpj`) em hosts fixos HTTPS, com `redirect: 'error'`;
  - o CNPJ vem do HTML da SEFAZ ou da chave já validada (DV) na reimportação, e nunca
    de um campo livre do cliente;
  - a reimportação só grava nas notas **do próprio uid** e no estabelecimento
    compartilhado. O que é gravado vem da SEFAZ ou da Receita, nunca do payload;
  - limite de **256 kB** na resposta e validação do formato com zod (ex.: um
    `nome_fantasia` gigante é cortado em 120 caracteres);
  - o nome fantasia gravado é só texto, e o Angular faz a interpolação escapada;
  - regras do Firestore sem mudança: `estabelecimentos` continua só leitura para o
    cliente.
- **RNF-07 Privacidade:**
  - do payload só saem CNPJ e nome fantasia; o QSA e os demais campos são descartados
    na hora;
  - o log não traz CNPJ, nome nem chave completa (RF-12);
  - não é preciso consentimento do usuário: os dados são do cadastro público de pessoa
    jurídica.
- **RNF-08 Resiliência:**
  - uma falha da consulta **nunca** falha a prévia, a confirmação ou a fila (RF-07), e
    não gera `ErroImportacao`;
  - na reimportação, a falha também não muda a resposta (RF-17);
  - sem retry na mesma fonte (a reserva faz esse papel);
  - rate limit: é no máximo uma consulta por loja nova ou vencida, então o volume fica
    muito abaixo de qualquer limite público.
- **RNF-09 i18n:** textos da UI em pt-BR no template, como no resto do app (o projeto
  não usa ngx-translate).

## 5. Estrutura de Componentes Proposta

```
shared/
  nome-fantasia.ts            limparFantasia(bruto, razao) · precisaConsultar(estab, agora)
                              avaliarEstabelecimento(estab, agora) → 'sefaz'|'fantasia'|'completo'
                              REVALIDAR_FANTASIA_DIAS
  nome-fantasia.spec.ts
  model.ts                    Estabelecimento.fantasiaConsultadaEm?: DataIso
                              Emitente.fantasiaConsultadaEm?: DataIso  (só entre prévia e gravação)
                              ErroImportacao ja-importada + estabelecimentoAtualizado?: true

functions/src/
  cnpj/
    consultar-cnpj.ts         consultarCnpj(cnpj, deps) → { status: 'ok', fantasia? }
                              | { status: "nao-encontrado" } | lança em falha
                              fontes BrasilAPI → minhareceita, timeout/limite/zod
    completar-emitente.ts     completarEmitente(ctx, emitente): lê estabelecimentos/{cnpj},
                              decide (precisaConsultar), consulta, loga; nunca lança
    atualizar-na-reimportacao.ts  RF-13..17: avalia, relê SEFAZ ou só o CNPJ, grava
                              estabelecimento + notas do uid; devolve boolean; nunca lança
  importar/
    preview-nfce.ts           no ramo ja-importada chama atualizarNaReimportacao
    erros.ts                  ErroNegocio carrega estabelecimentoAtualizado
    contexto.ts               + consultarCnpj
    obter-nota.ts             chama completarEmitente no fim
    gravar-nota.ts            grava fantasia (se houver) + fantasiaConsultadaEm quando vierem
    log.ts                    EtapaImportacao + 'cnpj'
functions/scripts/
  preencher-fantasia.ts       RF-11 (--simular | --gravar, -P via GOOGLE_CLOUD_PROJECT)
functions/test/
  fixtures/cnpj/brasilapi-box-atacadista.json · brasilapi-sem-fantasia.json · (404 no teste)
  consultar-cnpj.spec.ts
  importacao.spec.ts          + casos de fantasia (novo, cache, vencido, falha, 404)
  apoio.ts                    fake consultarCnpj

src/app/features/estabelecimentos/detalhe/
  estabelecimento-detalhe.page.ts   linha "Razão social" quando houver fantasia (RF-10)
src/app/features/importar/
  mensagens.ts                texto de ja-importada com estabelecimentoAtualizado (RF-16)
  importar.store.ts           invalida o HistoricoPessoalStore nesse caso (RF-16)

package.json                  artifacts:limpeza:dev / :prod (RF-18)
docs/qualidade/functions-dv-checklist.md   conferir a política de limpeza
```

## 6. Dependências e Pré-condições

| Item | Estado atual | Ação necessária |
|---|---|---|
| BrasilAPI / minhareceita | públicas, testadas em 30/09/2026 | gravar as fixtures (sem QSA) na execução |
| `validarCnpj` em `shared/` | não existe (o parser só confere o tamanho de 14 dígitos) | criar em `shared/chave-acesso.ts`, ao lado de `formatarCnpj`, com DV |
| `zod` nas Functions | instalado (vínculo por IA) | reutilizar |
| Saída de rede das Functions | já existe (SEFAZ e Claude API) | nada |
| Regras do Firestore | `estabelecimentos` só leitura | sem mudança |
| Deploy das Functions no dv | feito pelo usuário | `npm run deploy:functions:dev` depois da implementação |
| Preenchimento retroativo | estabelecimentos e notas do dv sem nome fantasia | usuário roda o script do RF-11 (credencial ADC), ou reimporta uma nota de cada loja (RF-13) |
| Consulta `usuarios/{uid}/notas where cnpj ==` | índice de campo único automático (escopo de coleção) | nada |
| Política de limpeza do Artifact Registry | desconhecida no dv e na produção | usuário roda `npm run artifacts:limpeza:dev` e `:prod` uma vez |

**Decisões**

| # | Decisão | Motivo |
|---|---|---|
| D-01 | Fonte = cadastro da Receita pelo CNPJ, **não** o Menor Preço | chave exata, acessível das Functions, sem escrita pelo cliente (2.2) |
| D-02 | Consultar em `obterNotaDaSefaz` (prévia e fila); a confirmação reaproveita a prévia | um ponto só e nenhuma consulta duplicada |
| D-03 | Guardar em maiúsculas, como a Receita devolve | converter a caixa erra siglas ("DROGARIA NISSEI S/A", "BOX"); pode ser revisto depois |
| D-04 | Revalidar a cada 180 dias | o nome fantasia muda pouco; custo de consulta desprezível |
| D-05 | Apelido da loja por usuário: **fora do escopo** | o nome fantasia da Receita pode não ser o da fachada; seria uma feature própria |
| D-06 | Consulta nas Functions, não no navegador | não cria invocação nova (roda dentro da prévia e da fila) e o custo fica dentro da cota grátis; no navegador o nome não poderia ser gravado (o cliente não escreve em `estabelecimentos` nem nas notas) |
| D-07 | "Completo" = `nome`, `endereco` e `cidade` preenchidos **e** nome fantasia consultado dentro do prazo | a SEFAZ só é relida quando falta dado que só ela tem |
| D-08 | Na reimportação, só as notas do próprio usuário são atualizadas | não varre notas de outros usuários numa callable; o script do RF-11 cobre o resto |
| D-09 | Imagens das Functions mantidas por 1 dia | sem uso de rollback por revisão; mantém o Artifact Registry dentro da cota |

## 7. Critérios de Aceitação

- [ ] Importar a nota real de teste (CNPJ 03.644.587/0008-36) no dv mostra **BOX
      ATACADISTA** no título da prévia, em Minhas notas e no detalhe do estabelecimento,
      com "Razão social: Sanches e Vecchiate Ltda" abaixo.
- [ ] Uma segunda nota do mesmo CNPJ não faz chamada externa (log `contagens.cache = 1`).
- [ ] CNPJ sem nome fantasia na Receita → continua a razão social, e
      `fantasiaConsultadaEm` é gravado.
- [ ] Com as duas fontes fora (fake lançando), a prévia, a confirmação e a fila
      funcionam como hoje e o log mostra `etapa: 'cnpj', resultado: 'falha'`.
- [ ] BrasilAPI com timeout ou 5xx → a minhareceita é usada; 404 → a reserva não é
      chamada.
- [ ] Nome fantasia vazio, só símbolos ou igual à razão social não é gravado.
- [ ] Nenhum teste chama BrasilAPI ou minhareceita de verdade; fixtures sem QSA.
- [ ] O log da etapa `cnpj` não contém CNPJ nem nome.
- [ ] `preencher-fantasia.ts --simular` lista as mudanças sem gravar; `--gravar`
      atualiza os estabelecimentos e o `estabelecimentoNome` das notas.
- [ ] Reimportar uma nota cuja loja está sem nome fantasia mostra "Você já importou essa
      nota. Aproveitamos para atualizar os dados do estabelecimento." Depois disso, Minhas
      notas e o painel mostram o nome fantasia em todas as notas do usuário dessa loja.
- [ ] Reimportar com o estabelecimento completo faz só a leitura do estabelecimento:
      nenhuma chamada à SEFAZ nem à Receita, e a mensagem é a de sempre.
- [ ] Estabelecimento sem endereço ou cidade → a reimportação relê a SEFAZ e completa os
      dados.
- [ ] Na reimportação, uma falha da SEFAZ ou da Receita mantém a resposta `ja-importada`
      sem o flag e sem gravar nada.
- [ ] Notas de outros usuários não são tocadas pela reimportação.
- [ ] `npm run artifacts:limpeza:dev` e `:prod` existem. Depois de rodados pelo
      usuário, o `gcf-artifacts` de cada projeto tem política de 1 dia.
- [ ] `npm run lint`, `npm test`, `npm --prefix functions test`, `typecheck` e o build
      de produção passam.
