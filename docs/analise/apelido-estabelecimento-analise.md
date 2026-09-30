# Análise: Apelido do estabelecimento

**Data:** 2026-09-30
**Projeto:** fed-catalogo-compara-precos (Cupom Esperto)
**Escopo:** permitir que o usuário dê um **nome próprio (apelido)** a um estabelecimento que não
tem nome fantasia na Receita. O apelido é sugerido na prévia da importação e pode ser editado
depois. Ele vale **só para esse usuário**: não altera `estabelecimentos/{cnpj}`, que é
compartilhado, e os outros usuários continuam vendo o nome da Receita. Retoma a decisão D-05 da
[análise do nome fantasia](nome-fantasia-estabelecimento-analise.md), que deixou o apelido fora
do escopo.

---

## 1. Contexto

**Motivação.** O nome fantasia vem do cadastro da Receita (BrasilAPI → minhareceita). Muitas
empresas não preenchem esse campo. Um exemplo é o CONDOR SUPER CENTER LTDA
(76.189.406/0001-26): em 30/09/2026 o `nome_fantasia` veio vazio na BrasilAPI (`""`), na
minhareceita (`""`) e na publica.cnpj.ws (`null`). Trocar ou somar fontes não resolve, porque
todas leem a mesma base. Nesses casos o app mostra a razão social.

**Onde o nome aparece para o usuário**

| Tela / uso | De onde vem o nome |
|---|---|
| Prévia (`preview-nota.page.html`) | `emitente.fantasia \|\| emitente.nome` (resposta da `previewNfce`) |
| Minhas notas, detalhe da nota, painel (últimas notas) | `nota.estabelecimentoNome` |
| Filtro por estabelecimento (`NotasService.estabelecimentos()`) | `nota.estabelecimentoNome` das últimas 200 notas |
| Histórico pessoal e sugestões (`historico-pessoal.ts` → `mercado`) | `nota.estabelecimentoNome` |
| Snackbar da fila (`pendentes.service.ts`) | `nota.estabelecimentoNome` |
| Lista e detalhe de Estabelecimentos | `estabelecimentos/{cnpj}`: `fantasia \|\| nome` |
| Página do produto (`resumo.ts`) | `estabelecimentos/{cnpj}`: `fantasia \|\| nome` |

Quase tudo o que é pessoal lê o `estabelecimentoNome` gravado na nota. Hoje
`montarNota` (`publicar-precos.ts`) grava `fantasia || nome`. Portanto, se o apelido entrar
nesse campo, ele aparece em notas, painel, filtro, histórico e sugestões sem mudar essas telas.
Só as telas que leem a base compartilhada (estabelecimentos e produto) precisam sobrepor o
apelido no cliente.

**Restrições já em vigor**

- O cliente **não escreve** nas notas nem em coleções compartilhadas (`firestore.rules`:
  `usuarios/{uid}` é só leitura para o dono; `notas` e `pendentes` aceitam só leitura e
  exclusão). Toda escrita passa por callable.
- A confirmação grava a partir do `previews/{uid}_{chave}` guardado no servidor, **nunca** de
  dados da nota enviados pelo cliente (`confirmar-nfce.ts`).
- `gravarNota` é comum à confirmação e à fila (`reprocessarPendentes`); a fila roda sem o
  usuário presente.
- Há outros dois pontos que gravam `estabelecimentoNome = fantasia || nome` e **passariam por
  cima do apelido**:
  - `atualizarNaReimportacao` (`functions/src/cnpj/`);
  - o script `functions/scripts/preencher-fantasia.ts`.
- Rate limit por uid em `rateLimit/{uid}` (`consumirRateLimit`), já usado por `previewNfce` e
  `vincularProduto`.

**O que falta**

- Um lugar para guardar o apelido do usuário por CNPJ.
- Uma callable que grava o apelido e propaga para as notas do usuário daquela loja.
- Um campo na prévia, quando a loja não tem nome fantasia, e o caminho desse valor até a
  gravação da nota.
- A edição posterior (detalhe do estabelecimento) e a sobreposição do apelido nas telas que leem
  a base compartilhada.
- Respeitar o apelido nos pontos que hoje reescrevem `estabelecimentoNome`.

## 2. Dados Disponíveis

| Fonte | Acesso | Conteúdo | Uso |
|---|---|---|---|
| `estabelecimentos/{cnpj}` | leitura por logado; escrita só Functions | `nome`, `fantasia?`, `fantasiaConsultadaEm?`, endereço | nome oficial (fallback do apelido) |
| **`usuarios/{uid}/estabelecimentos/{cnpj}`** (novo) | leitura pelo dono; escrita só Functions | `{ cnpj, apelido, atualizadoEm }` | apelido pessoal |
| `usuarios/{uid}/notas/{chave}` | leitura/exclusão pelo dono; escrita só Functions | `cnpj`, `estabelecimentoNome` (desnormalizado) | onde o apelido aparece |
| `previews/{uid}_{chave}` | só Functions | nota interpretada | origem da confirmação |
| `NotasService`, `HistoricoPessoalStore`, `SugestoesStore` | front | leem `estabelecimentoNome`; `HistoricoPessoalStore.invalidar()` | recarga após renomear |
| `EstabelecimentosService` (`listar`, `obter`) e `ProdutosService.estabelecimentosPorCnpj` | front | base compartilhada | recebem a sobreposição do apelido |
| Token `FIRESTORE_API` e padrão `onSnapshot` → `toSignal` (`pendentes.service.ts`) | front | leitura em tempo real | modelo para ler os apelidos |

## 3. Requisitos Funcionais

**Modelo e regra**

- **RF-01** O apelido fica em `usuarios/{uid}/estabelecimentos/{cnpj}` =
  `{ cnpj, apelido, atualizadoEm }`. Um apelido por usuário e CNPJ. Só as Functions gravam; o
  dono lê.
- **RF-02** Nome exibido para o usuário, em ordem: **apelido** → nome fantasia da Receita →
  razão social. A regra fica numa função pura em `shared/` (`nomeExibido(estab, apelido)`),
  usada nas Functions e no front.
- **RF-03** Validação do apelido (função pura em `shared/`, igual no front e no servidor):
  - trim e espaços colapsados;
  - de 2 a **60** caracteres;
  - pelo menos uma letra (`\p{L}`);
  - sem caracteres de controle;
  - apelido igual (normalizado) ao nome oficial é tratado como "sem apelido". A sugestão do
    RF-05a normalmente difere da razão social (o sufixo sai), então é gravada como apelido.

  A caixa digitada é mantida.

**Na importação**

- **RF-04** A `previewNfce` devolve também o apelido que o usuário já tenha para aquele CNPJ
  (`apelido?`). A prévia mostra no título `apelido || fantasia || nome`.
- **RF-05** Quando a loja **não tem nome fantasia** e o usuário **ainda não tem apelido** para
  ela, a prévia mostra, abaixo do título, o campo opcional "Como você chama esta loja?", com a
  razão social como contexto ("Razão social: CONDOR SUPER CENTER LTDA"). O campo já vem
  **preenchido com a sugestão** do RF-05a; o usuário pode confirmar, editar ou apagar (apagado =
  sem apelido, segue a razão social). Com nome fantasia ou apelido já definido, o campo não
  aparece: o nome é trocado depois, pelo detalhe do estabelecimento (RF-09).
- **RF-05a** Sugestão a partir da razão social (função pura `sugerirApelido(razaoSocial)` em
  `shared/apelido.ts`), nesta ordem:
  1. tira números e pontuação do início (MEI costuma começar pelo CNPJ ou CPF:
     "12.345.678 JOSE DA SILVA");
  2. tira o sufixo societário no fim, repetindo enquanto houver: `LTDA`, `LTDA ME`, `LTDA EPP`,
     `S/A`, `S.A.`, `SA`, `EIRELI`, `ME`, `EPP`, `MEI`, `& CIA`, `E CIA`, `CIA`;
  3. passa para "Primeira Maiúscula", com `de`, `da`, `do`, `das`, `dos`, `e` em minúsculas (fora
     da primeira palavra); palavras com dígito ficam como estão;
  4. se o resultado não passar em `limparApelido` (RF-03), não há sugestão e o campo vem vazio.

  Exemplos: "CONDOR SUPER CENTER LTDA" → "Condor Super Center"; "SANCHES E VECCHIATE LTDA" →
  "Sanches e Vecchiate"; "SUPERMERCADO BOM DIA LTDA - ME" → "Supermercado Bom Dia". Para siglas
  (ex.: "ABC"), o resultado sai "Abc"; o usuário corrige no campo.
  O diálogo de renomear (RF-09) usa a mesma sugestão quando ainda não há apelido.
- **RF-06** "Confirmar importação" envia `confirmarNfce({ chave, apelido? })`. Com apelido
  válido, a confirmação grava o apelido (RF-01) e, **na mesma transação** de `gravarNota`, grava a
  nota com `estabelecimentoNome = apelido`. Apelido inválido devolve o erro `apelido-invalido`
  sem gravar a nota, e o front mostra o erro no campo (validação local antes, RF-03). Campo vazio
  segue o fluxo de hoje.
- **RF-07** Com o apelido novo, a confirmação também atualiza `estabelecimentoNome` das **outras
  notas do usuário** daquele CNPJ (RF-10). Isso acontece fora da transação, em lote, e uma falha
  não desfaz a importação.
- **RF-08** `gravarNota` lê `usuarios/{uid}/estabelecimentos/{cnpj}` na transação e usa
  `nomeExibido` (RF-02). Assim, toda nota nova da loja já nasce com o apelido, inclusive pela
  **fila** (`reprocessarPendentes`), sem o usuário presente.

**Edição depois**

- **RF-09** O detalhe do estabelecimento (`/estabelecimentos/:cnpj`) tem a ação "Dar um nome" ou
  "Renomear" (ícone de lápis ao lado do título). Ela abre um diálogo com o campo preenchido e os
  botões "Salvar", "Cancelar" e, se houver apelido, "Usar o nome oficial" (remove o apelido).
  Vale para qualquer loja, com ou sem nome fantasia (D-03, confirmada pelo usuário). O detalhe da nota tem um link para o
  estabelecimento, sem edição própria.
- **RF-10** Callable `definirApelido({ cnpj, apelido | null })`:
  - valida o CNPJ (`validarCnpj`) e exige que `estabelecimentos/{cnpj}` exista;
  - valida o apelido (RF-03). `null` ou "sem apelido" apaga o documento;
  - grava ou apaga `usuarios/{uid}/estabelecimentos/{cnpj}`;
  - atualiza `estabelecimentoNome = nomeExibido(...)` nas notas **do uid** daquele CNPJ
    (`consultar` `usuarios/{uid}/notas where cnpj ==`), só nas que mudam, via `repo.lote`;
  - consome o rate limit da importação;
  - responde `{ ok: true, notasAtualizadas }` ou `{ ok: false, erro }`.
- **RF-11** Depois de `definirApelido` ou de uma confirmação com apelido, o front chama
  `HistoricoPessoalStore.invalidar()`, para Minhas notas, painel, filtro e sugestões mostrarem o
  nome novo. Um snackbar confirma: "Nome salvo. N notas atualizadas.".

**Sobreposição nas telas compartilhadas**

- **RF-12** `ApelidosService` (root) lê `usuarios/{uid}/estabelecimentos` em tempo real
  (`onSnapshot` → `toSignal`), como `Map<cnpj, apelido>`, com carga preguiçosa só nas telas que
  usam. A lista e o detalhe de Estabelecimentos e a página do produto (`resumo.ts`) mostram
  `nomeExibido`. A busca por nome da lista também procura no apelido.
- **RF-13** No detalhe do estabelecimento com apelido, o título é o apelido e abaixo aparecem
  "Nome na Receita: <fantasia>" (se houver) e "Razão social: <nome>". Isso completa o RF-10 da
  análise anterior.

**Consistência com o nome fantasia**

- **RF-14** `atualizarNaReimportacao` e `preencher-fantasia.ts` passam a usar `nomeExibido`:
  - na reimportação, o apelido do uid é lido;
  - no script, as notas de um usuário com apelido para o CNPJ são puladas (o script lê
    `collectionGroup('estabelecimentos')` filtrando pelo caminho `usuarios/*`, ou os apelidos de
    cada uid).

  Um nome fantasia que chegue depois **não** substitui o apelido.
- **RF-15** A exclusão de uma nota não mexe no apelido. O apelido continua valendo para as
  próximas notas da loja.

## 4. Requisitos Não Funcionais

- **RNF-01 Desempenho:**
  - a prévia ganha uma leitura (o apelido do CNPJ);
  - a confirmação ganha uma leitura dentro da transação e, só com apelido novo, uma consulta às
    notas do uid daquele CNPJ;
  - `ApelidosService` escuta uma subcoleção pequena (uma entrada por loja renomeada);
  - o diálogo de renomear é carregado sob demanda (`import()` do componente, como os outros
    diálogos) e não entra no bundle inicial;
  - o budget do `main` não muda, porque tudo fica nas rotas lazy.
- **RNF-02 Responsividade:**
  - o campo da prévia ocupa a largura do cabeçalho no celular e respeita a barra de ação fixa
    (`.cp-action-bar`);
  - o diálogo usa o `MatDialog` do tema M3, com largura máxima de 480 px e tela quase cheia
    abaixo de 600 px;
  - nomes longos quebram linha, sem truncar.
- **RNF-03 Acessibilidade (WCAG AA):**
  - `<label>` visível + `<input class="cp-field">`, com texto de ajuda
    (`aria-describedby`: "Só você vê esse nome.") e erro em `.cp-field-error` com
    `aria-invalid`;
  - o botão de lápis tem `aria-label="Renomear estabelecimento"`;
  - o diálogo tem título, foco inicial no campo, `Esc` fecha e o foco volta ao botão;
  - o snackbar usa `aria-live`, padrão do Material;
  - sem par de cor novo.
- **RNF-04 Manutenibilidade:**
  - regra pura em `shared/apelido.ts` (`limparApelido`, `nomeExibido`);
  - callable no módulo `functions/src/estabelecimentos/` com `Contexto` e `Repositorio`;
  - front standalone, OnPush, `inject()`, Signal Forms no campo, signals no estado;
  - o componente do campo é reaproveitado entre a prévia e o diálogo
    (`<cp-campo-apelido>` em `shared/ui/` ou na feature);
  - classes globais `.cp-field*` e `.cp-btn-*`, sem CSS novo relevante.
- **RNF-05 Testabilidade:**
  - 100 % em `shared/apelido.ts` (inclusive `sugerirApelido`, com razões sociais reais das
    fixtures de CNPJ e da SEFAZ);
  - Functions (fake em memória, sem emulador): apelido na confirmação, na fila, na reimportação,
    em `definirApelido` (grava, apaga, propaga só para as notas do uid, recusa CNPJ inválido ou
    inexistente, rate limit), apelido inválido sem gravar a nota;
  - front: prévia com e sem campo, diálogo, sobreposição na lista/detalhe e `invalidar()`;
  - e2e com `mockCallables`, seletores por label e papel;
  - axe no diálogo e na prévia com o campo.
- **RNF-06 Segurança:**
  - o apelido é texto livre do cliente: validado no servidor (RF-03) e exibido só por
    interpolação escapada do Angular (sem `innerHTML`);
  - só é gravado sob o `uid` autenticado; `definirApelido` nunca toca notas de outro uid nem
    `estabelecimentos/{cnpj}`;
  - a callable exige App Check (`enforceAppCheck`, via `OPCOES_CALLABLE`) e consome o rate
    limit;
  - `confirmarNfce` continua gravando a nota a partir do preview do servidor: o único dado novo
    do cliente é o apelido, que só afeta o `estabelecimentoNome` da nota do próprio usuário;
  - regras: acrescentar `match /estabelecimentos/{cnpj} { allow read: if dono(uid); allow write:
    if false; }` dentro de `usuarios/{uid}`.
- **RNF-07 Privacidade:**
  - o apelido é dado do usuário: nunca vai para o log (só contagens, como hoje) nem para
    coleções compartilhadas;
  - fica sob `usuarios/{uid}`, como as notas.
- **RNF-08 Resiliência:**
  - falha na propagação para as notas antigas (RF-07) não desfaz a importação: a nota nova e o
    apelido já estão gravados, e a próxima edição ou importação corrige as demais;
  - acima de 500 notas da loja, a propagação vai em mais de um lote (não atômica entre lotes,
    aceitável).
- **RNF-09 i18n:** textos em pt-BR no template, como no resto do app (sem ngx-translate).

## 5. Estrutura de Componentes Proposta

```
shared/
  apelido.ts                    limparApelido(bruto, nomeOficial) · nomeExibido(estab, apelido?)
                                sugerirApelido(razaoSocial)
                                MAX_APELIDO (60), MIN_APELIDO (2)
  apelido.spec.ts
  model.ts                      ApelidoEstabelecimento { cnpj, apelido, atualizadoEm }
                                PreviewResposta ok + apelido?; CodigoErroImportacao + 'apelido-invalido'
                                DefinirApelidoResposta

functions/src/
  estabelecimentos/
    definir-apelido.ts          callable: valida, grava/apaga, propaga para as notas do uid
    propagar-nome.ts            nomeExibido nas notas do uid de um CNPJ (usado pela callable,
                                pela confirmação e pela reimportação)
  importar/
    preview-nfce.ts             devolve o apelido existente
    confirmar-nfce.ts           aceita apelido?, valida, grava o apelido e propaga
    gravar-nota.ts              lê o apelido na transação; estabelecimentoNome = nomeExibido
    publicar-precos.ts          montarNota recebe o nome exibido
  cnpj/atualizar-na-reimportacao.ts   respeita o apelido (RF-14)
  index.ts                      export definirApelido
functions/scripts/preencher-fantasia.ts   pula notas com apelido (RF-14)
functions/test/
  apelido.spec.ts               callable, confirmação, fila, reimportação

firestore.rules                 usuarios/{uid}/estabelecimentos: leitura do dono

src/app/
  features/estabelecimentos/
    data-access/apelidos.service.ts     onSnapshot → Map<cnpj, apelido>; definir(cnpj, apelido|null)
    renomear/renomear-dialog.ts         diálogo (MatDialog), lazy
    detalhe/estabelecimento-detalhe.page.ts   lápis + linhas "Nome na Receita"/"Razão social"
    lista/estabelecimentos-lista.page.ts      nome exibido + busca pelo apelido
  features/importar/
    preview-nota/preview-nota.page.*    campo opcional quando não há nome fantasia
    importar.store.ts                   confirmar(apelido?) + invalidar
    data-access/importar.service.ts     confirmar(chave, apelido?)
    mensagens.ts                        'apelido-invalido'
  features/produtos/detalhe/resumo.ts   nome exibido com o apelido
  shared/ui/campo-apelido/              <cp-campo-apelido> (label, ajuda, erro, Signal Forms)
```

## 6. Dependências e Pré-condições

| Item | Estado atual | Ação necessária |
|---|---|---|
| Feature do nome fantasia | implementada, ainda sem deploy no dv | fazer o deploy antes ou junto (esta feature altera os mesmos arquivos) |
| `firestore.rules` | sem `usuarios/{uid}/estabelecimentos` | acrescentar a leitura do dono; o usuário roda `npm run deploy:rules:dev` e o checklist do Rules Playground |
| Índice para `usuarios/{uid}/notas where cnpj ==` | automático (campo único, escopo de coleção) | nada |
| Callable nova `definirApelido` | não existe | deploy das Functions pelo usuário; App Check igual às outras |
| Script `preencher-fantasia.ts` | sobrescreve `estabelecimentoNome` | ajustar antes de alguém rodá-lo com `--gravar` |
| `MatDialog` e Signal Forms | já usados (`vincular-dialog`, `confirm-dialog`) | reutilizar |
| Material Symbols (`icon_names`) | subset no `index.html` | acrescentar `edit` se ainda não estiver na lista |
| Nova dependência npm | — | nenhuma |

**Decisões**

| # | Decisão | Motivo |
|---|---|---|
| D-01 | Apelido **pessoal**, em `usuarios/{uid}/estabelecimentos/{cnpj}` | escolha do usuário; evita que um usuário renomeie a loja de todos |
| D-02 | O apelido vai para o `estabelecimentoNome` da nota (desnormalizado) | notas, painel, filtro, histórico e sugestões funcionam sem mudança; é o mesmo padrão do nome fantasia |
| D-03 | Na prévia, o campo só aparece sem nome fantasia e sem apelido; no detalhe, renomear vale para qualquer loja (**confirmado pelo usuário em 30/09/2026**) | a prévia fica limpa no caso comum; quem prefere outro nome (ex.: "Box da Av. Brasil") ainda consegue |
| D-04 | O apelido vence o nome fantasia (inclusive um que chegue depois) | foi o usuário que escolheu |
| D-05 | O apelido chega por `confirmarNfce`, e não por uma chamada separada antes | uma chamada só; a nota nasce com o nome certo e sem janela de inconsistência |
| D-06 | O campo vem **preenchido com a razão social limpa** (RF-05a), editável (**decisão do usuário em 30/09/2026**) | confirmar sem mexer já dá um nome melhor que a razão social em maiúsculas; o usuário corrige quando a limpeza não basta |

## 7. Critérios de Aceitação

- [ ] Importar uma nota do CONDOR SUPER CENTER LTDA (sem nome fantasia) mostra na prévia o campo
      "Como você chama esta loja?", já preenchido com "Condor Super Center". Trocando por "Condor
      Pinheirinho", a nota aparece com esse nome em Minhas notas, no painel, no filtro e nas
      sugestões. Confirmando sem mexer, aparece "Condor Super Center"; apagando o campo, aparece a
      razão social.
- [ ] `sugerirApelido` com 100 % de cobertura: sufixos (LTDA, ME, EPP, S/A, EIRELI, & CIA,
      combinados), prefixo numérico de MEI, preposições em minúsculas e caso sem sugestão.
- [ ] As notas anteriores do usuário dessa loja passam a mostrar "Condor Pinheirinho" logo depois
      da confirmação.
- [ ] Uma nota nova da mesma loja (prévia ou fila) já nasce com o apelido, e a prévia não mostra
      o campo de novo.
- [ ] Outro usuário que importa nota da mesma loja continua vendo "CONDOR SUPER CENTER LTDA";
      `estabelecimentos/{cnpj}` não muda.
- [ ] Loja com nome fantasia (ex.: BOX ATACADISTA) não mostra o campo na prévia.
- [ ] No detalhe do estabelecimento, "Renomear" troca o nome e atualiza as notas do usuário;
      "Usar o nome oficial" volta para nome fantasia ou razão social.
- [ ] Lista de Estabelecimentos e página do produto mostram o apelido para o dono dele; a busca
      da lista encontra a loja pelo apelido.
- [ ] Apelido vazio, só símbolos, com 1 caractere ou acima de 60 é recusado no front e no
      servidor (`apelido-invalido`), sem gravar a nota.
- [ ] Reimportação e script de preenchimento não sobrescrevem o apelido.
- [ ] Logs sem o apelido; regras só permitem ao dono ler os próprios apelidos (checklist do
      Rules Playground).
- [ ] `npm run lint`, `npm test`, testes/typecheck/build das Functions, build de produção e axe
      no e2e passam.
