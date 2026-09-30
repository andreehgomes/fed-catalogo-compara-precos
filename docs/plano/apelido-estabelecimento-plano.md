# Plano de Desenvolvimento: Apelido do estabelecimento

**Data:** 30/09/2026
**Projeto:** fed-catalogo-compara-precos (Cupom Esperto)
**Análise base:** [apelido-estabelecimento-analise.md](../analise/apelido-estabelecimento-analise.md)
**Branch alvo:** `main`

---

## Visão Geral

O usuário passa a poder dar um **nome próprio (apelido)** a uma loja. Esse apelido vale só para
ele e fica em `usuarios/{uid}/estabelecimentos/{cnpj}`, gravado apenas pelas Functions.

- **Na prévia da importação:** se a loja não tem nome fantasia e o usuário ainda não deu um
  apelido a ela, aparece o campo "Como você chama esta loja?". O campo já vem com a razão social
  limpa ("CONDOR SUPER CENTER LTDA" → "Condor Super Center"). O valor segue em
  `confirmarNfce({ chave, apelido })`.
- **Depois da importação:** o detalhe do estabelecimento ganha "Renomear", que funciona para
  qualquer loja e chama a callable nova `definirApelido`.

O nome exibido é `apelido → nome fantasia → razão social` (`nomeExibido`, em `shared/`). Ele é
gravado no `estabelecimentoNome` das notas **do usuário**:

- a nota nova já nasce com ele, inclusive quando vem pela fila;
- a confirmação com apelido e o `definirApelido` propagam o nome para as notas antigas da loja.

Assim, Minhas notas, painel, filtro, histórico e sugestões funcionam sem mudança. As telas que
leem a base compartilhada (lista e detalhe de Estabelecimentos, página do produto) sobrepõem o
apelido no cliente, com o `ApelidosService`.

`estabelecimentos/{cnpj}` não muda. A reimportação e o script `preencher-fantasia.ts` passam a
respeitar o apelido. As regras do Firestore ganham só a leitura da subcoleção pelo dono. Não há
dependência npm nova.

---

## Convenções Obrigatórias

- **Functions:**
  - regras de negócio recebem o `Contexto`;
  - Firestore só pelo `Repositorio` (fake em memória, **sem emulador**);
  - callables com `OPCOES_CALLABLE` (App Check);
  - resposta `{ ok: true, … } | { ok: false, erro }`;
  - o log leva só contagens: **o apelido nunca vai para o log**.
- **Cliente:** nunca escreve em `usuarios/{uid}/estabelecimentos` nem nas notas. Tudo por
  callable, via `CHAMAR_FUNCTION`.
- **Domínio puro:** fica em `shared/`, sem Angular, Firebase ou npm, com spec no `npm test` e
  100 % de cobertura em `shared/apelido.ts`.
- **Angular 22:**
  - standalone, **OnPush**, `inject()`;
  - `input()`/`output()`/`model()`;
  - estado em signals;
  - Signal Forms no campo;
  - `@if`/`@for` com `track`;
  - Firestore `onSnapshot` convertido com `toSignal()`; subscription manual com
    `takeUntilDestroyed()`;
  - diálogo pelo `MatDialog` do tema M3;
  - sem comentários, a não ser para invariantes não óbvias.
- **Estilo:**
  - classe global primeiro (`.cp-field*`, `.cp-btn-*`, `.cp-detail-header`);
  - cor só por token `$cp-*`, sem par de contraste novo;
  - ícone novo acrescentado ao `icon_names=` do `index.html` (`edit`), em ordem alfabética.
- **Testes:**
  - Vitest, sem `vi.mock` de módulos do Firebase (fakes pelos tokens);
  - e2e por papel e label, com `mockCallables`.
- **O agente não faz deploy nem push.** Regras e Functions são publicadas pelo usuário.

---

## Fases de Implementação

### Fase 1 — Fundação (domínio, modelo e regras)

**Objetivo:** a regra pura do apelido, os tipos novos e a regra de leitura.

#### Tarefa 1.1 — Regra pura do apelido

**Arquivo(s) a criar/modificar:** `shared/apelido.ts`, `shared/apelido.spec.ts`

**O que fazer:**

```ts
export const MIN_APELIDO = 2;
export const MAX_APELIDO = 60;

/** RF-03. `apelido: null` = sem apelido (vazio ou igual ao nome oficial). */
export function limparApelido(
  bruto: string | null | undefined,
  nomeOficial: string,
): { valido: true; apelido: string | null } | { valido: false };

/** RF-02: apelido → nome fantasia → razão social. */
export function nomeExibido(
  estab: { nome: string; fantasia?: string },
  apelido?: string | null,
): string;

/** RF-05a: razão social limpa, ou null se não sobrar um apelido válido. */
export function sugerirApelido(razaoSocial: string): string | null;
```

- `limparApelido` faz o seguinte, nesta ordem:
  1. trim e espaços colapsados;
  2. vazio → `{ valido: true, apelido: null }`;
  3. caractere de controle (`/\p{Cc}/u`), menos de `MIN_APELIDO`, mais de `MAX_APELIDO` ou sem
     `\p{L}` → `{ valido: false }`;
  4. `normalizarDescricao(apelido) === normalizarDescricao(nomeOficial)` →
     `{ valido: true, apelido: null }`.

  A caixa digitada é mantida.
- `sugerirApelido` segue o RF-05a:
  1. tira o prefixo `/^[\d\s.\-/]+/`;
  2. tira os sufixos em laço, com regex âncora no fim, sem diferenciar maiúsculas e aceitando
     `-`, `.` ou espaço antes: `LTDA`, `S/A`, `S.A.`, `SA`, `EIRELI`, `ME`, `EPP`, `MEI`,
     `& CIA`, `E CIA`, `CIA`;
  3. aplica "Primeira Maiúscula" (`de|da|do|das|dos|e` em minúsculas fora da 1ª palavra; palavra
     com dígito fica como veio);
  4. valida com `limparApelido(resultado, razaoSocial)` e devolve `null` se não for válido ou não
     sobrar apelido.

**Critério:** 100 % de cobertura. Casos:
- "CONDOR SUPER CENTER LTDA" → "Condor Super Center";
- "SANCHES E VECCHIATE LTDA" → "Sanches e Vecchiate";
- "SUPERMERCADO BOM DIA LTDA - ME" → "Supermercado Bom Dia";
- "MERCADO X EIRELI EPP" → "Mercado X"; "PAO & CIA" → "Pao";
- "12.345.678 JOSE DA SILVA" → "Jose da Silva";
- "LTDA" → `null`; "MERCADO 2000 LTDA" → "Mercado 2000";
- `limparApelido`: `""` → null válido; `"a"` inválido; 61 caracteres inválido; `"***"`
  inválido; `"x\u0007y"` inválido; `"Condor super center ltda"` com oficial igual → null
  válido; `"  Condor   Pinheirinho "` → "Condor Pinheirinho";
- `nomeExibido`: com apelido, só fantasia e só razão social.

#### Tarefa 1.2 — Modelo

**Arquivo(s) a criar/modificar:** `shared/model.ts`

**O que fazer:**

```ts
/** `usuarios/{uid}/estabelecimentos/{cnpj}` — privado, gravado só pelas Functions. */
export interface ApelidoEstabelecimento { cnpj: string; apelido: string; atualizadoEm: DataIso }
```

- `CodigoErroImportacao` ganha `'apelido-invalido'`.
- `PreviewResposta`: `{ ok: true; nota: NfceParsed; apelido?: string }`.
- Tipos da callable nova:
  - `DefinirApelidoEntrada = { cnpj?: string; apelido?: string | null }`;
  - `DefinirApelidoResposta = { ok: true; apelido: string | null; notasAtualizadas: number } | { ok: false; erro: ErroImportacao }`.

**Critério:** `npm --prefix functions run typecheck` e `ng build` passam. O `MENSAGENS` do front
exige a entrada nova (tarefa 3.6).

#### Tarefa 1.3 — Regras do Firestore

**Arquivo(s) a criar/modificar:** `firestore.rules`,
`docs/qualidade/regras-firestore-checklist.md`

**O que fazer:** dentro de `match /usuarios/{uid}`:

```
match /estabelecimentos/{cnpj} { allow read: if dono(uid); allow write: if false; }
```

No checklist, acrescentar três casos:
- dono lê → permitido;
- outro uid lê → negado;
- dono grava → negado.

**Critério:** o arquivo compila (conferido pelo usuário no deploy). **O agente não publica.**

---

### Fase 2 — Functions

**Objetivo:** gravar o apelido, aplicá-lo nas notas do usuário e protegê-lo dos pontos que
reescrevem o nome.

#### Tarefa 2.1 — Propagação do nome para as notas do uid

**Arquivo(s) a criar/modificar:** `functions/src/estabelecimentos/propagar-nome.ts`

**O que fazer:**

```ts
/** Operações que acertam `estabelecimentoNome` nas notas do uid daquele CNPJ (só as que mudam). */
export async function operacoesDeNome(
  repo: Repositorio,
  uid: string,
  cnpj: string,
  nome: string,
  extra?: Partial<Pick<Nota, 'estabelecimentoCidade'>>,
): Promise<Operacao[]>;
```

- A função usa `repo.consultar<Nota>(`usuarios/${uid}/notas`, [{ campo: 'cnpj', op: '==', valor: cnpj }])`.
- Cada operação grava com `merge: true`.
- Se `extra` vier, a comparação também considera a cidade (é o caso da reimportação).

**Critério:** coberto pela tarefa 2.7.

#### Tarefa 2.2 — `gravarNota` e `montarNota` com o apelido

**Arquivo(s) a criar/modificar:** `functions/src/importar/gravar-nota.ts`,
`functions/src/importar/publicar-precos.ts`

**O que fazer:**
- `montarNota(nota, importadaEm, veioDaFila, nome = nota.emitente.fantasia || nota.emitente.nome)`:
  o 4º parâmetro vira o `estabelecimentoNome`.
- `gravarNota(ctx, uid, parsed, { veioDaFila, apelido? })`:
  - dentro da transação, lê também `usuarios/${uid}/estabelecimentos/${cnpj}` no
    `Promise.all` das leituras;
  - `apelidoFinal = opcoes.apelido !== undefined ? opcoes.apelido : existente?.apelido ?? null`;
  - monta a nota com `nomeExibido(parsed.emitente, apelidoFinal)`;
  - com `opcoes.apelido` (string), grava `{ cnpj, apelido, atualizadoEm }` no doc do apelido,
    na mesma transação;
  - devolve `apelidoNovo: boolean` em `ResultadoGravacao`;
  - depois da transação, com `apelidoNovo` e sem `jaExistia`, grava por `repo.lote` as
    `operacoesDeNome` das outras notas. Isso fica num `try/catch` que só loga `etapa:
    'confirmacao'` com `contagens: { apelidoPropagacaoFalhou: 1 }` (RNF-08).
- `montarNota` precisa do nome antes da transação. Por isso ela passa a ser chamada **dentro**
  da transação, depois das leituras. A escrita da nota continua depois de todas as leituras
  (regra do fake: sem leitura depois de escrita).

**Critério:** tarefa 2.7. A suíte atual continua verde: sem apelido, o nome continua
`fantasia || nome`.

#### Tarefa 2.3 — Prévia devolve o apelido existente

**Arquivo(s) a criar/modificar:** `functions/src/importar/preview-nfce.ts`

**O que fazer:** depois de `obterNotaDaSefaz`, ler
`usuarios/${uid}/estabelecimentos/${nota.emitente.cnpj}`. Se houver apelido, responder
`{ ok: true, nota, apelido }`. O `DocPreview` não muda: o apelido é relido na gravação (2.2).

**Critério:** tarefa 2.7.

#### Tarefa 2.4 — Confirmação aceita o apelido

**Arquivo(s) a criar/modificar:** `functions/src/importar/confirmar-nfce.ts`,
`functions/src/index.ts`

**O que fazer:**
- A entrada passa a ser `{ chave?: unknown; apelido?: unknown }`.
- Se `apelido` não for `undefined`:
  - tem de ser string ou `null`; qualquer outro tipo → `apelido-invalido`;
  - aplicar `limparApelido(apelido, preview.nota.emitente.nome)`;
  - `valido: false` → `throw new ErroNegocio('apelido-invalido', undefined, chave)`, **antes**
    de `gravarNota`.
- Com `apelido: null` válido (campo apagado ou igual ao nome oficial), a nota segue sem apelido
  novo. Um apelido que já existia **não** é apagado pela confirmação: apagar é só pelo
  `definirApelido`.
- No `index.ts`, trocar o tipo do `CallableRequest` para `{ chave?: string; apelido?: string | null }`.

**Critério:** tarefa 2.7.

#### Tarefa 2.5 — Callable `definirApelido`

**Arquivo(s) a criar/modificar:** `functions/src/estabelecimentos/definir-apelido.ts`,
`functions/src/index.ts`

**O que fazer:** `executarDefinirApelido(uid, entrada, ctx): Promise<DefinirApelidoResposta>`.
1. `cnpj = String(entrada?.cnpj ?? '').replace(/\D/g, '')`. Se `!validarCnpj(cnpj)` →
   `nao-encontrada`.
2. `consumirRateLimit` → `rate-limit`.
3. `estab = repo.obter<Estabelecimento>(`estabelecimentos/${cnpj}`)`. Se não existir →
   `nao-encontrada`.
4. `limparApelido(entrada.apelido, estab.nome)`. Se inválido → `apelido-invalido`.
5. `nome = nomeExibido(estab, apelido)`. As operações são:
   - `apelido` string → gravar `usuarios/${uid}/estabelecimentos/${cnpj}`;
   - `null` → apagar esse documento;
   - mais `operacoesDeNome(repo, uid, cnpj, nome)`.

   Tudo vai num `repo.lote`.
6. Log `etapa: 'apelido'` (acrescentar em `EtapaImportacao`) com `uf: estab.uf`,
   `resultado` e `contagens: { notasAtualizadas, removido }`. **Sem** CNPJ e sem o apelido.
7. Resposta `{ ok: true, apelido, notasAtualizadas }`.

Export no `index.ts`: `definirApelido = onCall(OPCOES_CALLABLE, (req) =>
executarDefinirApelido(uidDe(req), req.data, contexto()))`. Erro inesperado é propagado, como
nas outras callables.

**Critério:** tarefa 2.7.

#### Tarefa 2.6 — Reimportação e script respeitam o apelido

**Arquivo(s) a criar/modificar:** `functions/src/cnpj/atualizar-na-reimportacao.ts`,
`functions/scripts/preencher-fantasia.ts`

**O que fazer:**
- **Reimportação:**
  - ler `usuarios/${uid}/estabelecimentos/${cnpj}` junto com o estabelecimento;
  - calcular o nome das notas com `nomeExibido(emitente, apelido?.apelido)`;
  - trocar o laço atual por `operacoesDeNome(repo, uid, cnpj, nome, { estabelecimentoCidade })`.
- **Script:**
  - ler `db.collectionGroup('estabelecimentos').get()` e ficar só com os documentos cujo
    `ref.parent.parent?.parent.id === 'usuarios'`;
  - montar o `Set` de `"${uid}|${cnpj}"` com apelido;
  - pular as notas desses pares (e contá-las no resumo como "com apelido").

**Critério:**
- teste da reimportação: com apelido, a nota fica com o apelido mesmo depois de o nome fantasia
  chegar;
- o script compila com o comando do cabeçalho (não rodado).

#### Tarefa 2.7 — Testes das Functions

**Arquivo(s) a criar/modificar:** `functions/test/apelido.spec.ts`,
`functions/test/reimportacao.spec.ts`

**O que fazer:** com `criarContexto`, cobrir:
- **Prévia:**
  - sem apelido, a resposta não tem `apelido`;
  - com o documento do apelido, a resposta traz `apelido`.
- **Confirmação:**
  - `apelido: 'Condor Pinheirinho'` → grava `usuarios/{uid}/estabelecimentos/{cnpj}`, a nota tem
    `estabelecimentoNome = 'Condor Pinheirinho'` e as **outras 2 notas** do uid daquela loja
    são atualizadas;
  - a nota de outro uid e `estabelecimentos/{cnpj}` não mudam.
- **Confirmação com apelido inválido** (`'x'`, `42`, 61 caracteres): `apelido-invalido`, e
  nenhuma nota, preço ou apelido gravado. O preview continua lá.
- **Confirmação com `apelido: null`** ou igual à razão social: nada de apelido. Um apelido
  existente é mantido.
- **Nota nova da loja com apelido já gravado:** pela confirmação e pela **fila**
  (`reprocessarPendentes`), já nasce com o apelido.
- **Falha na propagação** (`repo.lote` lançando depois da transação): a confirmação responde
  `ok: true`, e a nota nova e o apelido ficam gravados.
- **`definirApelido`:**
  - grava e propaga;
  - `null` apaga e volta para `fantasia || nome`;
  - CNPJ inválido ou inexistente → `nao-encontrada`;
  - apelido inválido → `apelido-invalido`;
  - rate limit;
  - não toca notas de outro uid.
- **Log:** nenhum registro contém o apelido nem o CNPJ (serializar e procurar).
- **Reimportação:** com apelido gravado, `estabelecimentoNome` continua o apelido depois da
  atualização.

**Critério:** `npm --prefix functions test`, `typecheck` e `build` verdes.

---

### Fase 3 — Front

**Objetivo:** o campo na prévia, o "Renomear" e a sobreposição do apelido.

#### Tarefa 3.1 — `ApelidosService`

**Arquivo(s) a criar/modificar:**
`src/app/features/estabelecimentos/data-access/apelidos.service.ts` (+ spec)

**O que fazer:** service `providedIn: 'root'`, no molde do `pendentes.service.ts`:
- `apelidos: Signal<ReadonlyMap<string, string>>`: `onSnapshot` de
  `usuarios/{uid}/estabelecimentos` pelo `FIRESTORE_API`, convertido com `toSignal`. O listener
  só nasce na primeira leitura do signal e é refeito quando o `uid` muda (sem uid, mapa vazio).
- `nome(estab: { cnpj; nome; fantasia? }): string`, que devolve
  `nomeExibido(estab, this.apelidos().get(estab.cnpj))`.
- `definir(cnpj, apelido: string | null)`: chama `definirApelido` pelo `CHAMAR_FUNCTION`, devolve
  `Resultado<{ apelido; notasAtualizadas }>` e, com `ok`, chama `HistoricoPessoalStore.invalidar()`.

**Critério:** o spec, com fakes de `FIRESTORE_API` e `CHAMAR_FUNCTION`, cobre:
- o mapa a partir do snapshot;
- `nome()` nos três casos;
- `definir` com sucesso (e `invalidar`) e com erro (sem `invalidar`).

#### Tarefa 3.2 — Componente do campo

**Arquivo(s) a criar/modificar:** `src/app/shared/ui/campo-apelido/campo-apelido.ts` (+ spec)

**O que fazer:** `<cp-campo-apelido [(valor)] [nomeOficial] [erroServidor]>`, standalone e
OnPush:
- `model<string>('valor')` com Signal Forms, validação local por `limparApelido` e erro em
  `.cp-field-error` com `aria-invalid`/`aria-describedby`;
- label "Como você chama esta loja?" e ajuda "Só você vê esse nome. Deixe em branco para usar
  o nome oficial.";
- `maxlength` = `MAX_APELIDO`;
- expõe `valido: Signal<boolean>` para o pai desabilitar a ação.

**Critério:** o spec cobre:
- o valor inicial (sugestão);
- o erro com 1 caractere e com "***";
- o vazio válido;
- o label acessível (`getByLabel` equivalente no DOM).

#### Tarefa 3.3 — Campo na prévia e confirmação com o apelido

**Arquivo(s) a criar/modificar:** `src/app/features/importar/data-access/importar.service.ts`,
`src/app/features/importar/importar.store.ts`,
`src/app/features/importar/preview-nota/preview-nota.page.{ts,html}`,
`src/app/features/importar/importar.spec.ts`

**O que fazer:**
- **`ImportarService`:**
  - `preview` passa a devolver `Resultado<{ nota: NfceParsed; apelido: string | null }>`;
  - `confirmar(chave, apelido?: string | null)` envia `{ chave, apelido }` só quando
    `apelido !== undefined`.
- **Store:**
  - o estado `preview`/`confirmando` guarda `apelido`;
  - `confirmar(apelido?)` repassa o valor, e o refazer da prévia (`preview-expirado`) mantém o
    apelido digitado;
  - `apelido-invalido` volta o estado para `preview` com o erro, sem perder a nota.
- **Página:**
  - título `apelido || emitente.fantasia || emitente.nome`;
  - `mostrarCampo = !emitente.fantasia && !apelido`;
  - com o campo, `<cp-campo-apelido>` vem inicializado com `sugerirApelido(emitente.nome) ?? ''`
    e a linha "Razão social: …";
  - "Confirmar importação" envia o valor do campo (vazio → `null`) e fica desabilitado com o
    campo inválido;
  - sem o campo, envia `undefined`.

**Critério:** o spec cobre:
- loja sem nome fantasia: campo com "Supermercado Exemplo" e `confirmarNfce` chamado com
  `{ chave, apelido: 'Supermercado Exemplo' }`;
- campo apagado → `apelido: null`;
- loja com fantasia ou prévia com `apelido`: sem campo e `confirmarNfce` só com `{ chave }`;
- `apelido-invalido` mantém a prévia e mostra o erro.

#### Tarefa 3.4 — Diálogo "Renomear" no detalhe do estabelecimento

**Arquivo(s) a criar/modificar:**
`src/app/features/estabelecimentos/renomear/renomear-dialog.ts` (+ spec),
`src/app/features/estabelecimentos/detalhe/estabelecimento-detalhe.page.ts`,
`src/app/features/painel/paginas-fase9.spec.ts`, `src/index.html`

**O que fazer:**
- **Diálogo** (`MAT_DIALOG_DATA`: `{ cnpj, nome, fantasia?, apelido? }`), no molde do
  `VincularDialog`:
  - título "Nome da loja" e `<cp-campo-apelido>` iniciado com
    `apelido ?? fantasia ?? sugerirApelido(nome) ?? ''`;
  - botões "Cancelar", "Salvar" e, se houver apelido, "Usar o nome oficial";
  - o diálogo chama `ApelidosService.definir` e fecha com `true` no sucesso;
  - um erro do servidor aparece no campo (`mensagemDe`).
- **Detalhe:**
  - `<h1>` com `apelidos.nome(estab)` e, ao lado, `<button class="cp-btn-icon"
    aria-label="Renomear estabelecimento">` com o ícone `edit`;
  - abaixo, "Nome na Receita: <fantasia>" quando há apelido e fantasia, e "Razão social:
    <nome>" quando o título não é a razão social;
  - o diálogo abre com `import()` dinâmico, fora do chunk da página, e
    `{ maxWidth: '480px', width: '95vw' }`;
  - no sucesso, snackbar "Nome salvo. N notas atualizadas." (ou "Nome oficial restaurado.").
- **`index.html`:** acrescentar `edit` ao `icon_names=`, em ordem alfabética.

**Critério:** os specs cobrem:
- título com apelido, com as linhas de "Nome na Receita" e "Razão social";
- botão com o `aria-label`;
- diálogo: salvar chama `definirApelido` com `{ cnpj, apelido }`, "Usar o nome oficial" chama
  com `apelido: null` e erro de servidor mantém o diálogo aberto.

#### Tarefa 3.5 — Apelido na lista de estabelecimentos e na página do produto

**Arquivo(s) a criar/modificar:**
`src/app/features/estabelecimentos/lista/estabelecimentos-lista.page.ts`,
`src/app/features/produtos/detalhe/resumo.ts`,
`src/app/features/produtos/detalhe/produto-detalhe.page.ts` (e specs)

**O que fazer:**
- **Lista:**
  - o nome da linha vem de `apelidos.nome(e)`;
  - o filtro normaliza `apelido + fantasia + nome`.
- **`resumirPrecos`:**
  - recebe um parâmetro opcional `nomes?: ReadonlyMap<string, string>` (apelidos);
  - a função `nome` passa a usar `nomeExibido(e, nomes?.get(cnpj))`;
  - a página do produto passa `apelidos.apelidos()`.

**Critério:** os specs cobrem:
- lista com apelido e busca pelo apelido;
- `resumirPrecos` com o mapa de apelidos, mantendo os casos atuais.

#### Tarefa 3.6 — Mensagem do erro novo

**Arquivo(s) a criar/modificar:** `src/app/features/importar/mensagens.ts`

**O que fazer:** em `MENSAGENS`, acrescentar
`'apelido-invalido': { texto: 'Esse nome não serve. Use de 2 a 60 caracteres, com letras.', acao: null }`.

**Critério:** o `it.each` de `MENSAGENS` no `importar.spec.ts` continua verde. O
`pendente-row` e o `vincular-dialog` não precisam mudar.

---

### Fase 4 — Qualidade e documentação

**Objetivo:** e2e, a11y, documentação e verificação final.

#### Tarefa 4.1 — e2e e acessibilidade

**Arquivo(s) a criar/modificar:** `e2e/importar.spec.ts`, `e2e/a11y.spec.ts`

**O que fazer:**
- **`importar.spec.ts`:** caso novo em que o mock da prévia vem **sem** `fantasia`:
  - o campo `getByLabel('Como você chama esta loja?')` aparece com "Supermercado Exemplo";
  - o teste troca o valor para "Mercado da Esquina";
  - `confirmarNfce` recebe `{ chave, apelido: 'Mercado da Esquina' }`.
- **`a11y.spec.ts`:** incluir a prévia com o campo (mock sem fantasia) na varredura do axe.

**Critério:** `npm run e2e` verde, ou pulado sem `.env.e2e`, como hoje.

#### Tarefa 4.2 — Documentação

**Arquivo(s) a criar/modificar:** `CLAUDE.md`, `docs/qualidade/functions-dv-checklist.md`

**O que fazer:**
- **`CLAUDE.md`:**
  - seção **Functions**: item "Apelido do estabelecimento", com `usuarios/{uid}/estabelecimentos`,
    `definirApelido`, `confirmarNfce({ chave, apelido })`, `nomeExibido`, propagação para as notas
    do uid, e reimportação e script respeitando o apelido;
  - lista de **Callables**: acrescentar `definirApelido`;
  - seção **Produtos, estabelecimentos e painel**: "Renomear" e `ApelidosService`;
  - seção **Firebase & data access**: a regra nova.
- **Checklist do dv:** cenários do Condor:
  - campo sugerido na prévia;
  - apelido nas notas antigas;
  - outro usuário vê a razão social;
  - renomear e voltar ao nome oficial;
  - log sem apelido.

**Critério:** documentos atualizados.

#### Tarefa 4.3 — Verificação final

**O que fazer:** rodar `npm run lint`, `npm test`, `npm run contraste`, `npm --prefix functions
run typecheck`, `npm --prefix functions test`, `npm --prefix functions run build` e
`ng build --configuration=production`.

**Critério:**
- tudo verde;
- o budget do `main` não muda (o diálogo e o `ApelidosService` ficam em chunks lazy).

---

## Estrutura Final de Arquivos

```
shared/
  apelido.ts ...................... limparApelido, nomeExibido, sugerirApelido     (1.1) novo
  apelido.spec.ts .................                                                 (1.1) novo
  model.ts ........................ ApelidoEstabelecimento, apelido-invalido,
                                    PreviewResposta.apelido, DefinirApelido*        (1.2)
firestore.rules ................... usuarios/{uid}/estabelecimentos (leitura)      (1.3)
docs/qualidade/regras-firestore-checklist.md                                        (1.3)
functions/
  src/estabelecimentos/
    propagar-nome.ts .............. operacoesDeNome                                 (2.1) novo
    definir-apelido.ts ............ callable                                        (2.5) novo
  src/importar/
    publicar-precos.ts ............ montarNota(…, nome)                             (2.2)
    gravar-nota.ts ................ lê/grava o apelido na transação, propaga        (2.2)
    preview-nfce.ts ............... devolve o apelido                               (2.3)
    confirmar-nfce.ts ............. aceita e valida o apelido                       (2.4)
    log.ts ........................ etapa 'apelido'                                 (2.5)
  src/cnpj/atualizar-na-reimportacao.ts .. respeita o apelido                       (2.6)
  src/index.ts .................... confirmarNfce tipado, definirApelido            (2.4, 2.5)
  scripts/preencher-fantasia.ts ... pula notas com apelido                          (2.6)
  test/apelido.spec.ts ............                                                 (2.7) novo
  test/reimportacao.spec.ts .......  + caso com apelido                             (2.7)
src/index.html .................... ícone edit                                      (3.4)
src/app/
  shared/ui/campo-apelido/ ........ <cp-campo-apelido> (+ spec)                     (3.2) novo
  features/estabelecimentos/
    data-access/apelidos.service.ts (+ spec)                                        (3.1) novo
    renomear/renomear-dialog.ts (+ spec)                                            (3.4) novo
    detalhe/estabelecimento-detalhe.page.ts .. título, lápis, linhas                (3.4)
    lista/estabelecimentos-lista.page.ts ..... nome e busca com apelido             (3.5)
  features/importar/
    data-access/importar.service.ts .......... preview com apelido, confirmar(apelido) (3.3)
    importar.store.ts ........................ apelido no estado                    (3.3)
    preview-nota/preview-nota.page.{ts,html} . campo com sugestão                   (3.3)
    mensagens.ts ............................. apelido-invalido                      (3.6)
    importar.spec.ts .........................                                      (3.3)
  features/produtos/detalhe/{resumo.ts,produto-detalhe.page.ts} .. nomes            (3.5)
  features/painel/paginas-fase9.spec.ts .......                                     (3.4, 3.5)
e2e/importar.spec.ts, e2e/a11y.spec.ts                                              (4.1)
CLAUDE.md, docs/qualidade/functions-dv-checklist.md                                 (4.2)
```

---

## Ordem de Execução Recomendada

```
1.1 regra pura ─┐
1.2 modelo ─────┼─► 2.1 propagar ─► 2.2 gravarNota ─► 2.3 prévia ─► 2.4 confirmação ─┐
1.3 regras      │                   2.5 definirApelido ◄── 2.1                         ├─► 2.7 testes
                │                   2.6 reimportação/script ◄── 2.1                    ┘
                └─► 3.6 mensagem ─► 3.2 campo ─► 3.3 prévia
                                    3.1 service ─► 3.4 renomear ─► 3.5 lista/produto
Fases 2 e 3 ─► 4.1 e2e/a11y ─► 4.2 docs ─► 4.3 verificação
```

A Fase 3 depende da Fase 2 só pelos contratos (tipos da 1.2). Com os fakes, ela pode andar em
paralelo.

---

## Critérios de Aceitação Globais

- [ ] Nota do CONDOR SUPER CENTER LTDA: a prévia mostra o campo com "Condor Super Center".
  - Confirmando sem mexer, a nota fica "Condor Super Center".
  - Com "Condor Pinheirinho", a nota fica "Condor Pinheirinho".
  - Apagando o campo, a nota fica com a razão social.
- [ ] Ao confirmar com apelido, as notas anteriores do usuário daquela loja mudam de nome em
      Minhas notas, painel, filtro e sugestões.
- [ ] A próxima nota da loja (prévia ou fila) nasce com o apelido, e a prévia não mostra o campo.
- [ ] Loja com nome fantasia não mostra o campo; no detalhe, "Renomear" funciona para ela.
- [ ] "Usar o nome oficial" apaga o apelido e volta para nome fantasia ou razão social nas notas.
- [ ] Outro usuário vê o nome oficial, e `estabelecimentos/{cnpj}` nunca muda por causa de
      apelido.
- [ ] Lista de Estabelecimentos e página do produto mostram o apelido para o dono; a busca da
      lista acha pelo apelido.
- [ ] Apelido inválido é recusado no front e no servidor (`apelido-invalido`), sem gravar nada.
- [ ] Reimportação e `preencher-fantasia.ts` não sobrescrevem o apelido.
- [ ] Logs sem apelido e sem CNPJ; regras: só o dono lê e ninguém grava pelo cliente.
- [ ] `sugerirApelido` e `limparApelido` com 100 % de cobertura.
- [ ] Lint, contraste, testes do front e das Functions, typecheck, build das Functions, build de
      produção e axe no e2e verdes.
- [ ] Depois da implementação, o **usuário**:
  - faz `npm run deploy:rules:dev` e o checklist do Rules Playground;
  - faz `npm run deploy:functions:dev` (depois do deploy da feature do nome fantasia, ou junto
    com ele);
  - roda o checklist do dv.
