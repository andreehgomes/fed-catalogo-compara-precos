# Plano de Desenvolvimento: Nome fantasia do estabelecimento

**Data:** 30/09/2026
**Projeto:** fed-catalogo-compara-precos (Cupom Esperto)
**Análise base:** [nome-fantasia-estabelecimento-analise.md](../analise/nome-fantasia-estabelecimento-analise.md)
**Branch alvo:** `main`

---

## Visão Geral

A página da NFC-e só traz a razão social do emitente (ex.: "Sanches e Vecchiate Ltda").
Com este plano, as Functions passam a consultar o **CNPJ** numa base pública da Receita:
primeiro a **BrasilAPI** e, se ela falhar, a **minhareceita.org**. O `nome_fantasia`
devolvido ("BOX ATACADISTA") preenche `emitente.fantasia`. A consulta acontece no fim de
`obterNotaDaSefaz`, ponto comum da prévia e da fila. A confirmação reaproveita a nota
completada que ficou guardada na prévia.

O resultado fica em cache no próprio `estabelecimentos/{cnpj}` (`fantasiaConsultadaEm`,
revalidado a cada 180 dias), então só a primeira nota de cada loja faz chamada externa.
Uma falha na consulta nunca derruba a importação.

Não há mudança no front, porque ele já exibe `fantasia || nome` e `montarNota` já grava
`estabelecimentoNome` assim. A única exceção é o detalhe do estabelecimento, que passa a
mostrar a razão social abaixo do nome fantasia. Um script manual preenche os
estabelecimentos e as notas que já existem. Não há dependência npm nova nem mudança nas
regras ou nos índices do Firestore. O Menor Preço não é usado (seção 2.2 da análise).

**Reimportação:** quando a prévia detecta uma nota que o usuário já tem, ela confere o
estabelecimento antes de responder `ja-importada`:
- faltam dados da SEFAZ → relê a página da nota;
- falta só o nome fantasia (ou a consulta venceu) → consulta só o CNPJ, que vem da chave.

Se algo mudar, a prévia grava o estabelecimento e o nome em todas as notas desse usuário
daquela loja, e a resposta ganha `estabelecimentoAtualizado: true`, que o front mostra.

**Custo:** a consulta roda dentro de invocações que já existem (D-06). Para o Artifact
Registry não acumular imagens de deploy, entram os scripts
`artifacts:limpeza:dev|prod` (política de 1 dia), rodados pelo usuário.

---

## Convenções Obrigatórias

- **Functions:**
  - regra de negócio recebe tudo pelo `Contexto`; a consulta entra como
    `consultarCnpj`, com fake nos testes;
  - acesso ao Firestore só pelo `Repositorio` (fake em memória, **sem emulador**);
  - rede externa com URL montada no servidor, host fixo HTTPS, timeout e limite de bytes
    (mesmo padrão de `fetch-sefaz.ts`);
  - log só com contagens, **nunca CNPJ, nome ou chave completa** (`importar/log.ts`).
- **Domínio puro** em `shared/` (sem Angular, Firebase ou npm), com spec rodando no
  `npm test`.
- **Testes:**
  - nunca chamar BrasilAPI ou minhareceita de verdade;
  - fixtures reais em `functions/test/fixtures/cnpj/`, **sem o QSA** (sócios);
  - sem `vi.mock` de módulos do Firebase.
- **Angular (tarefa 3.1):**
  - componente standalone e OnPush;
  - texto em pt-BR no template;
  - cor só por token `$cp-*`, classe global primeiro;
  - sem comentários, a não ser para invariantes não óbvias.
- **O agente não faz deploy nem push.** O deploy das Functions e o script de
  preenchimento são rodados pelo usuário.

---

## Fases de Implementação

### Fase 1 — Fundação (domínio e modelo)

**Objetivo:** a regra pura de limpeza e de "precisa consultar", a validação de CNPJ e os
campos novos do modelo.

#### Tarefa 1.1 — `validarCnpj`

**Arquivo(s) a criar/modificar:** `shared/chave-acesso.ts`, `shared/chave-acesso.spec.ts`

**O que fazer:** criar `validarCnpj(cnpj: string): boolean` ao lado de `formatarCnpj`.
A função exige 14 dígitos (depois de tirar o que não é dígito), recusa sequências
repetidas (`00000000000000`) e confere os dois DVs (pesos 5..2, 9..2 e 6..2, 9..2,
módulo 11).

**Critério:** o spec aceita `03644587000836` e `76189406000126`, e recusa DV errado,
todos os dígitos iguais, 13 ou 15 dígitos e string vazia.

#### Tarefa 1.2 — Regra pura do nome fantasia

**Arquivo(s) a criar/modificar:** `shared/nome-fantasia.ts`, `shared/nome-fantasia.spec.ts`

**O que fazer:**

```ts
export const REVALIDAR_FANTASIA_DIAS = 180;
export const MAX_FANTASIA = 120;

/** RF-04: undefined se vazio, sem letra ou igual à razão social (normalizada). */
export function limparFantasia(bruto: string | null | undefined, razaoSocial: string): string | undefined;

/** RF-02: sem fantasiaConsultadaEm ou consultada há mais de REVALIDAR_FANTASIA_DIAS. */
export function precisaConsultar(
  estab: Pick<Estabelecimento, 'fantasiaConsultadaEm'> | null,
  agora: Date,
): boolean;

/** RF-13: o que falta num estabelecimento já gravado (usado na reimportação). */
export function avaliarEstabelecimento(
  estab: Estabelecimento | null,
  agora: Date,
): 'sefaz' | 'fantasia' | 'completo';
```

- `avaliarEstabelecimento` devolve `'sefaz'` quando `estab` é `null` ou quando falta
  `nome`, `endereco` ou `cidade` (vazio ou só espaços).
- Senão, devolve `'fantasia'` se `precisaConsultar(estab, agora)`.
- Senão, devolve `'completo'`.

- `limparFantasia` faz o seguinte, nesta ordem:
  1. trim e espaços colapsados;
  2. corte em `MAX_FANTASIA`;
  3. descarte se não houver `/\p{L}/u`;
  4. descarte se `normalizarDescricao(fantasia) === normalizarDescricao(razaoSocial)`
     (de `shared/normalizar.ts`).

  A caixa é preservada (D-03).
- `precisaConsultar(null, …)` devolve `true`.

**Critério:** 100 % de cobertura. Casos:

- `"BOX ATACADISTA"` é mantido;
- `""`, `"  "`, `"****"` e `"."` viram `undefined`;
- `"Sanches e Vecchiate Ltda."` com razão `"SANCHES E VECCHIATE LTDA"` vira `undefined`;
- texto de 300 caracteres é cortado em 120;
- consultada há 179 dias → `false`; há 181 dias → `true`;
- `avaliarEstabelecimento`: `null` → `'sefaz'`; `cidade: ''` → `'sefaz'`; completo
  sem `fantasiaConsultadaEm` → `'fantasia'`; completo e consultado há 10 dias →
  `'completo'`.

#### Tarefa 1.3 — Campos do modelo

**Arquivo(s) a criar/modificar:** `shared/model.ts`

**O que fazer:** acrescentar `fantasiaConsultadaEm?: DataIso` em `Estabelecimento` e em
`Emitente`. Em `Emitente`, o campo só transita entre a prévia e a gravação, para
`gravarNota` saber que houve consulta. `montarNota` não o copia para a nota.

Em `ErroImportacao`, a variante `ja-importada` ganha um campo opcional:
`{ codigo: 'ja-importada'; chave: string; estabelecimentoAtualizado?: true }`.

**Critério:** `npm --prefix functions run typecheck` e `ng build` passam.

---

### Fase 2 — Consulta nas Functions

**Objetivo:** consultar o CNPJ com segurança, completar o emitente na prévia e na fila,
gravar o cache no estabelecimento e preencher os dados antigos.

#### Tarefa 2.1 — Fixtures reais

**Arquivo(s) a criar/modificar:** `functions/test/fixtures/cnpj/brasilapi-box-atacadista.json`,
`functions/test/fixtures/cnpj/brasilapi-sem-fantasia.json`,
`functions/test/fixtures/cnpj/minhareceita-box-atacadista.json`

**O que fazer:**
- baixar **uma vez** as respostas de:
  - `https://brasilapi.com.br/api/cnpj/v1/03644587000836`;
  - `…/76189406000126` (`nome_fantasia: ""`);
  - `https://minhareceita.org/03644587000836`.
- **remover `qsa`** (e qualquer campo com CPF ou nome de pessoa física) antes de
  salvar;
- manter os demais campos como vieram, porque isso testa que o zod ignora campos extras;
- o caso 404 é montado no próprio teste, sem arquivo.

**Critério:** `grep -i qsa functions/test/fixtures/cnpj/` não acha nada.

#### Tarefa 2.2 — Cliente de CNPJ

**Arquivo(s) a criar/modificar:** `functions/src/cnpj/consultar-cnpj.ts`,
`functions/test/consultar-cnpj.spec.ts`

**O que fazer:**

```ts
export type ResultadoCnpj =
  | { status: 'ok'; fonte: 'brasilapi' | 'minhareceita'; nomeFantasia: string }
  | { status: 'nao-encontrado'; fonte: 'brasilapi' | 'minhareceita' };

export type ConsultarCnpj = (cnpj: string) => Promise<ResultadoCnpj>;   // lança se as duas falharem

export function criarConsultaCnpj(deps: { fetch: typeof fetch; agora: () => number }): ConsultarCnpj;
```

- Antes de qualquer fetch, `validarCnpj(cnpj)`; se o CNPJ for inválido, lança.
- `FONTES` fixas:
  `[{ nome: 'brasilapi', url: (c) => `https://brasilapi.com.br/api/cnpj/v1/${c}` },
  { nome: 'minhareceita', url: (c) => `https://minhareceita.org/${c}` }]`.
  A URL leva só os 14 dígitos validados (anti-SSRF).
- Cada fonte:
  - `fetch` com `redirect: 'error'`, `headers: { accept: 'application/json' }` e
    `AbortSignal.timeout(min(TIMEOUT_FONTE_MS = 3000, restante do teto TETO_MS = 5000))`;
  - leitura do corpo com limite de **256 kB** (reaproveitar a ideia de `lerCorpo` de
    `fetch-sefaz.ts`; se for simples extrair, exportar de lá em vez de duplicar);
  - validação com zod
    `z.object({ cnpj: z.string(), nome_fantasia: z.string().nullish() })`
    (sem `.strict()`), exigindo `cnpj` só com dígitos igual ao pedido.
- Status:
  - **404** → `nao-encontrado`, sem tentar a reserva;
  - **200** válido → `ok`;
  - 429, 5xx, timeout, erro de rede, JSON inválido ou CNPJ divergente → passa para a
    próxima fonte;
  - sem tempo restante ou sem fonte → lança `Error('cnpj-indisponivel')`.
- Não logar nada aqui (quem loga é o chamador) e não devolver o payload bruto.

**Critério:** o spec, com `fetch` falso servindo as fixtures, cobre:
- 200 com nome fantasia;
- 200 com `""`;
- 404 sem chamar a minhareceita;
- BrasilAPI 503 → minhareceita;
- BrasilAPI em timeout (fake que nunca resolve + `AbortSignal`) → minhareceita;
- as duas fora → lança;
- corpo acima de 256 kB → próxima fonte;
- CNPJ da resposta diferente → próxima fonte;
- CNPJ inválido → lança **sem** chamar `fetch`;
- URL chamada exatamente igual à esperada.

#### Tarefa 2.3 — Contexto e log

**Arquivo(s) a criar/modificar:** `functions/src/importar/contexto.ts`,
`functions/src/importar/log.ts`, `functions/test/apoio.ts`

**O que fazer:**
- `Contexto` ganha `consultarCnpj: ConsultarCnpj`.
- `contextoPadrao` usa `criarConsultaCnpj({ fetch, agora: Date.now })`.
- `EtapaImportacao` ganha `'cnpj'`.
- Em `apoio.ts`, `criarContexto` expõe
  `consultarCnpj: vi.fn<ConsultarCnpj>(async () => ({ status: 'ok', fonte: 'brasilapi', nomeFantasia: 'BOX ATACADISTA' }))`
  e o tipo é acrescentado em `ContextoTeste`.

**Critério:** a suíte atual de `npm --prefix functions test` continua verde sem outras
mudanças.

#### Tarefa 2.4 — `completarEmitente`

**Arquivo(s) a criar/modificar:** `functions/src/cnpj/completar-emitente.ts`,
`functions/src/importar/obter-nota.ts`

**O que fazer:**

```ts
/** Nunca lança: qualquer falha devolve o emitente como veio (RF-07, RNF-08). */
export async function completarEmitente(ctx: Contexto, emitente: Emitente): Promise<Emitente>;
```

A função recebe o `Emitente`, e não a nota, porque a reimportação (tarefa 2.8) a chama
com um emitente montado do estabelecimento gravado.

1. `const estab = await ctx.repo.obter<Estabelecimento>(`estabelecimentos/${cnpj}`)`.
2. Se `!precisaConsultar(estab, agora)`:
   - devolve a nota com `emitente.fantasia = estab.fantasia` (se houver);
   - loga `contagens: { cache: 1 }`.
3. Senão, chama `ctx.consultarCnpj(cnpj)`:
   - `ok` → `fantasia = limparFantasia(r.nomeFantasia, emitente.nome)` e
     `fantasiaConsultadaEm = agora`;
   - `nao-encontrado` → só `fantasiaConsultadaEm`;
   - se a consulta lançar → devolve a nota com `estab?.fantasia` (se houver) **sem**
     `fantasiaConsultadaEm`, e loga `resultado: 'falha'`.
4. Log `etapa: 'cnpj'`, `uf`, `duracaoMs`, `contagens` (`cache`, `brasilapi`,
   `minhareceita`, `semFantasia`, `naoEncontrado`). O log **não leva** `chave`, CNPJ ou
   nome.

Em `obterNotaDaSefaz`, depois de conferir `nota.chave !== alvo.qr.chave`, fazer
`return { ...nota, emitente: await completarEmitente(ctx, nota.emitente) }`.

**Critério:** coberto pela tarefa 2.6.

#### Tarefa 2.5 — Gravação do cache no estabelecimento

**Arquivo(s) a criar/modificar:** `functions/src/importar/gravar-nota.ts`

**O que fazer:** no objeto `estabelecimento`, acrescentar
`...(parsed.emitente.fantasiaConsultadaEm ? { fantasiaConsultadaEm: … } : {})`, ao lado
do `fantasia` que já existe. Com `merge: true`, uma nota sem esses campos não apaga o
cache. `montarNota` não muda: continua `fantasia || nome` e não copia
`fantasiaConsultadaEm`.

**Critério:** coberto pela tarefa 2.6.

#### Tarefa 2.6 — Testes de integração da importação

**Arquivo(s) a criar/modificar:** `functions/test/importacao.spec.ts` (ou
`functions/test/nome-fantasia.spec.ts`, se ficar grande)

**O que fazer:** usando `criarContexto`, cobrir estes casos:
- **Loja nova:**
  - a prévia devolve `emitente.fantasia = 'BOX ATACADISTA'`;
  - `previews/…` guarda a nota com esse nome;
  - depois de `confirmarNfce`, `estabelecimentos/{cnpj}` tem `fantasia` e
    `fantasiaConsultadaEm`, e a nota tem `estabelecimentoNome = 'BOX ATACADISTA'`;
  - `consultarCnpj` foi chamado **1 vez** (a confirmação não consulta).
- **Cache:** com o estabelecimento consultado há 10 dias, `consultarCnpj` não é
  chamado e o nome vem do cache.
- **Vencido:** consultado há 200 dias → consulta de novo.
- **Falha:**
  - `consultarCnpj` lançando → prévia e confirmação `ok: true`;
  - `estabelecimentoNome` = razão social;
  - `fantasiaConsultadaEm` não é gravado;
  - log `{ etapa: 'cnpj', resultado: 'falha' }`.
- **Falha com cache vencido e nome antigo:** o nome antigo é mantido.
- **`nao-encontrado`:** grava `fantasiaConsultadaEm` sem `fantasia`.
- **Nome fantasia igual à razão social:** não é gravado.
- **Fila (`reprocessarPendentes`):** também completa o nome fantasia.
- **Log:** nenhum registro da etapa `cnpj` contém o CNPJ ou `BOX` (serializar e
  procurar).

**Critério:** `npm --prefix functions test` e `npm --prefix functions run typecheck`
verdes, e `npm --prefix functions run build` gera o bundle.

#### Tarefa 2.7 — Script de preenchimento retroativo

**Arquivo(s) a criar/modificar:** `functions/scripts/preencher-fantasia.ts`

**O que fazer:**
- Script manual, fora do `npm test`, no molde de `avaliar-ia-vinculo.ts` (cabeçalho com
  o comando `esbuild` e o `node` para rodar). Usa `firebase-admin` com ADC
  (`gcloud auth application-default login`) e o projeto de `GOOGLE_CLOUD_PROJECT`.
- Passos:
  1. lê `estabelecimentos` e filtra no código os que não têm `fantasiaConsultadaEm`;
  2. para cada um, `criarConsultaCnpj` + `limparFantasia`, com **1 s** entre as
     consultas;
  3. lê `collectionGroup('notas')` inteiro (sem `where`, para não exigir índice de
     collection group; o volume atual é pequeno) e seleciona as notas cujo `cnpj` ganhou
     nome fantasia.
- `--simular` (padrão) imprime `cnpj → nome` e a quantidade de notas afetadas.
- `--gravar` aplica o seguinte, em lotes de até 500:
  - `estabelecimentos/{cnpj}`: `{ fantasia?, fantasiaConsultadaEm }` com merge;
  - `notas`: `{ estabelecimentoNome }` com update.
- Falha num CNPJ só pula esse CNPJ, que é contado no resumo final.

**Critério:** compila com o comando do cabeçalho. **Não rodar contra o dv**: quem roda é
o usuário. O agente só confere que o `--simular` é o padrão lendo o código.

#### Tarefa 2.8 — Atualização na reimportação

**Arquivo(s) a criar/modificar:** `functions/src/cnpj/atualizar-na-reimportacao.ts`,
`functions/src/importar/preview-nfce.ts`, `functions/src/importar/erros.ts`

**O que fazer:**

```ts
/** RF-13..17. Devolve true se gravou algo. Nunca lança. */
export async function atualizarNaReimportacao(
  ctx: Contexto,
  uid: string,
  alvo: UrlValidada,
): Promise<boolean>;
```

1. `cnpj = extrairChave(alvo.qr.chave).cnpj`, e
   `estab = repo.obter<Estabelecimento>(`estabelecimentos/${cnpj}`)`.
2. `avaliarEstabelecimento(estab, agora)`:
   - `'completo'` → `return false`, sem nenhuma chamada externa;
   - `'sefaz'` → `emitente = (await obterNotaDaSefaz(ctx, alvo)).emitente`. Essa leitura
     já traz o nome fantasia (tarefa 2.4);
   - `'fantasia'` → `emitente = await completarEmitente(ctx, { cnpj, nome: estab.nome,
     endereco: estab.endereco, cidade: estab.cidade, uf: estab.uf })`.
3. Se nada mudou em relação ao `estab` (mesmos campos e sem `fantasiaConsultadaEm`
   novo) → `false`.
4. Senão:
   - grava `estabelecimentos/{cnpj}` com merge: os campos do emitente, mais
     `fantasia` e `fantasiaConsultadaEm` quando houver, mais `atualizadoEm`;
   - `repo.consultar<Nota>(`usuarios/${uid}/notas`, [{ campo: 'cnpj', op: '==', valor: cnpj }])`
     e, via `repo.lote`, grava `{ estabelecimentoNome: fantasia || nome,
     estabelecimentoCidade: cidade }` com merge nas notas em que o valor mudou;
   - `return true`.
5. Todo o corpo fica em `try/catch`. Um erro (`ErroNegocio` da SEFAZ, layout, repo)
   devolve `false` e loga `etapa: 'cnpj', resultado: 'falha', erro: codigo`. Como a
   gravação só acontece no fim, o caminho de erro não deixa nada pela metade.

Em `executarPreview`, no ramo da nota existente:

```ts
if (await ctx.repo.obter(`usuarios/${uid}/notas/${chave}`)) {
  const atualizado = await atualizarNaReimportacao(ctx, uid, alvo);
  throw new ErroNegocio('ja-importada', undefined, chave, atualizado);
}
```

`ErroNegocio` ganha um 4º parâmetro opcional `estabelecimentoAtualizado?: boolean`, e
`paraResposta()` o inclui quando for `true`. O `enfileirarNfce` não muda: a fila é o
caminho da SEFAZ fora do ar e continua respondendo `ja-importada` puro.

**Critério:** coberto pela tarefa 2.9.

#### Tarefa 2.9 — Testes da reimportação

**Arquivo(s) a criar/modificar:** `functions/test/reimportacao.spec.ts`

**O que fazer:** com `criarContexto`, uma nota já gravada para o uid e o estabelecimento
em cada estado, cobrir:
- **Completo** (consultado há 10 dias):
  - `buscar` e `consultarCnpj` não são chamados;
  - a resposta é `ja-importada` sem o flag.
- **Só falta o nome fantasia** (sem `fantasiaConsultadaEm`):
  - `buscar` não é chamado e `consultarCnpj` é chamado 1 vez;
  - o estabelecimento ganha `fantasia` e `fantasiaConsultadaEm`;
  - as **2 notas do uid** desse CNPJ ficam com `estabelecimentoNome = 'BOX ATACADISTA'`;
  - a nota de **outro uid** do mesmo CNPJ não muda;
  - a nota do uid de **outro CNPJ** não muda;
  - a resposta traz `estabelecimentoAtualizado: true`.
- **Estabelecimento sem cidade:**
  - `buscar` é chamado e a cidade é completada a partir da SEFAZ;
  - `estabelecimentoCidade` das notas é atualizada.
- **Estabelecimento inexistente:** relê a SEFAZ e cria o documento.
- **SEFAZ indisponível no caso `'sefaz'`:** `ja-importada` sem o flag, nada gravado e
  log de falha.
- **`consultarCnpj` lançando no caso `'fantasia'`:** `ja-importada` sem o flag e nada
  gravado.
- **Rate limit:** a reimportação continua consumindo o rate limit (comportamento atual
  preservado).

**Critério:** `npm --prefix functions test` e `typecheck` verdes.

---

### Fase 3 — Front e qualidade

**Objetivo:** mostrar a razão social no detalhe do estabelecimento e fechar a
verificação.

#### Tarefa 3.1 — Razão social no detalhe do estabelecimento

**Arquivo(s) a criar/modificar:**
`src/app/features/estabelecimentos/detalhe/estabelecimento-detalhe.page.ts`,
`src/app/features/painel/paginas-fase9.spec.ts`

**O que fazer:** no cabeçalho, abaixo do `<h1>`:

```html
@if (v.estabelecimento.fantasia) {
  <p>Razão social: {{ v.estabelecimento.nome }}</p>
}
<p>CNPJ {{ cnpjFormatado() }} · {{ v.estabelecimento.endereco }}</p>
```

Usar o mesmo estilo do `<p>` que já existe, sem CSS novo. No spec do detalhe (em
`paginas-fase9.spec.ts`), acrescentar dois casos:
- com nome fantasia: o `<h1>` mostra o nome fantasia e aparece "Razão social: …";
- sem nome fantasia: o `<h1>` mostra a razão social e a linha não aparece.

**Critério:** `npm test` verde e `npm run lint` sem erro.

#### Tarefa 3.2 — Aviso da reimportação no front

**Arquivo(s) a criar/modificar:** `src/app/features/importar/mensagens.ts`,
`src/app/features/importar/importar.store.ts`, specs correspondentes

**O que fazer:**
- `mensagemDe(erro)`: para `ja-importada` com `estabelecimentoAtualizado`, o texto é
  "Você já importou essa nota. Aproveitamos para atualizar os dados do
  estabelecimento.", com a mesma ação `abrir-nota`.
- `ImportarStore`, nos pontos que recebem erro de prévia: se for `ja-importada` com o
  flag, chama `this.historico.invalidar()` (o store já injeta o
  `HistoricoPessoalStore`).
- O detalhe da nota lê em tempo real (`obter(chave)`), então mostra o nome novo sem mais
  mudanças.

**Critério:** specs:
- `mensagemDe` com e sem o flag;
- o store invalida o histórico só com o flag.

`npm test` verde.

#### Tarefa 3.3 — Limpeza das imagens no Artifact Registry

**Arquivo(s) a criar/modificar:** `package.json`,
`docs/qualidade/functions-dv-checklist.md`

**O que fazer:**
- Acrescentar os scripts:
  ```json
  "artifacts:limpeza:dev": "firebase functions:artifacts:setpolicy --location southamerica-east1 --days 1 --force -P dev",
  "artifacts:limpeza:prod": "firebase functions:artifacts:setpolicy --location southamerica-east1 --days 1 --force -P prod"
  ```
- No checklist do dv, um item: "Artifact Registry `gcf-artifacts` (southamerica-east1)
  com política de limpeza de 1 dia (`npm run artifacts:limpeza:dev`; conferir no
  console, em Artifact Registry → gcf-artifacts → Políticas de limpeza)".
- **O agente não roda os scripts**: eles mudam a configuração do projeto na nuvem.

**Critério:**
- `npx firebase help functions:artifacts:setpolicy` confirma as opções usadas;
- os scripts aparecem em `npm run`.

#### Tarefa 3.4 — Mock do e2e e documentação

**Arquivo(s) a criar/modificar:** `e2e/support/mocks.ts` (se a prévia mockada ainda não
tiver `fantasia`), `CLAUDE.md`

**O que fazer:**
- Se o mock de `previewNfce` tiver só `nome`, acrescentar `fantasia` para o e2e da
  prévia refletir o fluxo novo, sem mudar asserções que dependam do nome antigo.
- Em `CLAUDE.md`, seção **Functions**, acrescentar um item curto sobre o nome fantasia:
  - `completarEmitente` em `obterNotaDaSefaz`;
  - BrasilAPI → minhareceita, com `consultarCnpj` no `Contexto`;
  - cache `fantasiaConsultadaEm` de 180 dias;
  - falha nunca derruba a importação;
  - script `preencher-fantasia.ts`;
  - reimportação atualiza o estabelecimento incompleto e as notas do uid
    (`atualizarNaReimportacao`, `estabelecimentoAtualizado`).
- Na seção **Commands** (deploy), acrescentar `npm run artifacts:limpeza:dev|prod`,
  rodado pelo usuário.
- Em **Fontes de dados**, acrescentar a BrasilAPI/minhareceita (só Functions, só CNPJ
  do emitente).

**Critério:** `npm run e2e` verde (ou pulado sem `.env.e2e`, como hoje) e `CLAUDE.md`
atualizado.

#### Tarefa 3.5 — Verificação final

**O que fazer:** rodar `npm run lint`, `npm test`, `npm --prefix functions run
typecheck`, `npm --prefix functions test`, `npm --prefix functions run build` e
`ng build --configuration=production`.

**Critério:** tudo verde. O budget do bundle inicial praticamente não muda: no front, só
entram um template, um texto e uma chamada ao `invalidar()`, tudo em rotas lazy.

---

## Estrutura Final de Arquivos

```
shared/
  chave-acesso.ts ................. validarCnpj                         (1.1)
  chave-acesso.spec.ts ............ casos de CNPJ                       (1.1)
  nome-fantasia.ts ................ limparFantasia, precisaConsultar,
                                    avaliarEstabelecimento              (1.2)  novo
  nome-fantasia.spec.ts ...........                                     (1.2)  novo
  model.ts ........................ fantasiaConsultadaEm, flag ja-importada (1.3)
functions/
  src/cnpj/
    consultar-cnpj.ts ............. BrasilAPI → minhareceita            (2.2)  novo
    completar-emitente.ts ......... cache + consulta + log              (2.4)  novo
    atualizar-na-reimportacao.ts .. RF-13..17                           (2.8)  novo
  src/importar/
    contexto.ts ................... + consultarCnpj                     (2.3)
    log.ts ........................ + etapa 'cnpj'                      (2.3)
    obter-nota.ts ................. chama completarEmitente             (2.4)
    gravar-nota.ts ................ grava fantasiaConsultadaEm          (2.5)
    preview-nfce.ts ............... reimportação no ramo ja-importada   (2.8)
    erros.ts ...................... estabelecimentoAtualizado           (2.8)
  scripts/preencher-fantasia.ts ... retroativo, --simular/--gravar      (2.7)  novo
  test/
    fixtures/cnpj/*.json .......... respostas reais sem QSA             (2.1)  novo
    consultar-cnpj.spec.ts ........                                     (2.2)  novo
    apoio.ts ...................... fake consultarCnpj                  (2.3)
    importacao.spec.ts ............ casos de nome fantasia              (2.6)
    reimportacao.spec.ts ..........                                     (2.9)  novo
src/app/features/estabelecimentos/detalhe/
  estabelecimento-detalhe.page.ts . linha "Razão social"                (3.1)
src/app/features/painel/paginas-fase9.spec.ts                          (3.1)
src/app/features/importar/
  mensagens.ts .................... texto com estabelecimentoAtualizado (3.2)
  importar.store.ts ............... invalida o histórico               (3.2)
package.json ...................... artifacts:limpeza:dev|prod         (3.3)
docs/qualidade/functions-dv-checklist.md .. política de limpeza       (3.3)
e2e/support/mocks.ts .............. fantasia no mock da prévia          (3.4)
CLAUDE.md ......................... Functions, Fontes, Commands        (3.4)
```

---

## Ordem de Execução Recomendada

```
1.1 validarCnpj ─┐
1.2 regra pura ──┼─► 2.2 cliente CNPJ ─► 2.3 contexto/log ─► 2.4 completarEmitente ─┬─► 2.6 testes ─► 2.7 script
1.3 modelo ──────┘        ▲                                    2.5 gravar-nota ─────┤
2.1 fixtures ─────────────┘                                                         └─► 2.8 reimportação ─► 2.9 testes
1.3 ─► 3.1 detalhe · 3.2 aviso da reimportação · 3.3 limpeza de imagens (independentes)
tudo ─► 3.4 docs/e2e ─► 3.5 verificação
```

As tarefas 3.1, 3.2 e 3.3 só dependem do modelo e podem ser feitas em paralelo com a
Fase 2.

---

## Critérios de Aceitação Globais

- [ ] Nota nova de uma loja com nome fantasia na Receita → prévia, Minhas notas, painel
      e detalhe da nota mostram o nome fantasia (teste 2.6 e, no dv, a nota real
      03.644.587/0008-36 → **BOX ATACADISTA**).
- [ ] Detalhe do estabelecimento mostra o nome fantasia no título e "Razão social: …"
      abaixo; sem nome fantasia, só a razão social.
- [ ] A segunda nota da mesma loja não faz chamada externa (cache de 180 dias).
- [ ] A confirmação não consulta de novo; usa a nota completada da prévia.
- [ ] BrasilAPI fora → minhareceita; 404 → sem reserva; as duas fora → a importação
      segue com a razão social e loga `etapa: 'cnpj', resultado: 'falha'`.
- [ ] Nome fantasia vazio, só símbolos ou igual à razão social não é gravado.
- [ ] Anti-SSRF: CNPJ validado com DV antes do fetch, hosts fixos, `redirect: 'error'`,
      timeout 3 s por fonte e 5 s no total, limite de 256 kB.
- [ ] Log da etapa `cnpj` sem CNPJ, nome ou chave; fixtures sem QSA; nenhum teste chama
      as APIs reais.
- [ ] `preencher-fantasia.ts` é `--simular` por padrão e só grava com `--gravar`.
- [ ] Reimportar uma nota de loja incompleta atualiza o estabelecimento e o nome em todas
      as notas do usuário dessa loja, e mostra "Aproveitamos para atualizar os dados do
      estabelecimento."; notas de outros usuários não mudam.
- [ ] Reimportar com o estabelecimento completo não chama a SEFAZ nem a Receita.
- [ ] Na reimportação, uma falha não muda a resposta e não grava nada.
- [ ] Scripts `artifacts:limpeza:dev|prod` no `package.json` e item no checklist do dv.
- [ ] Lint, testes do front e das Functions, typecheck, build das Functions e build de
      produção verdes.
- [ ] Depois da implementação, o **usuário**:
      - faz `npm run deploy:functions:dev`;
      - roda `npm run artifacts:limpeza:dev` (e `:prod` quando for para produção);
      - reimporta uma nota no dv para ver a atualização;
      - opcionalmente, roda o script de preenchimento.
