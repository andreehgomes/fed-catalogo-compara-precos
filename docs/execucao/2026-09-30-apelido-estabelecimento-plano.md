# Execução: Apelido do estabelecimento

**Data:** 2026-09-30
**Plano:** [docs/plano/apelido-estabelecimento-plano.md](../plano/apelido-estabelecimento-plano.md)
**Branch:** main
**Executor:** Claude Code

---

## Resumo

O usuário pode dar um nome próprio (apelido) a uma loja, guardado só para ele em
`usuarios/{uid}/estabelecimentos/{cnpj}` e gravado apenas pelas Functions. A prévia da importação
mostra o campo "Como você chama esta loja?" quando a loja não tem nome fantasia nem apelido. O
campo já vem com a razão social limpa, e o valor segue em `confirmarNfce({ chave, apelido })`. O
detalhe do estabelecimento ganhou "Renomear", que chama a callable nova `definirApelido`. O nome
exibido (`apelido → fantasia → razão social`) é gravado nas notas do usuário. Lista de
Estabelecimentos e página do produto sobrepõem o apelido pelo `ApelidosService`.

---

## Tarefas Executadas

| Fase | Tarefa | Status | Observações |
|------|--------|--------|-------------|
| 1.1 | Regra pura (`shared/apelido.ts`) | ✅ | `limparApelido`, `nomeExibido`, `sugerirApelido`; 33 casos e 100 % de cobertura |
| 1.2 | Modelo | ✅ | `ApelidoEstabelecimento`, `apelido-invalido`, `PreviewResposta.apelido`, `DefinirApelidoEntrada/Resposta` |
| 1.3 | Regras do Firestore | ✅ | Leitura pelo dono e escrita negada; cenários 31–33 no checklist do Rules Playground (não publicado) |
| 2.1 | `operacoesDeNome` | ✅ | `functions/src/estabelecimentos/propagar-nome.ts` |
| 2.2 | `gravarNota` / `montarNota` com o apelido | ✅ | Lê e grava o apelido na transação e propaga depois dela (falha só loga `apelidoPropagacaoFalhou`) |
| 2.3 | Prévia devolve o apelido | ✅ | |
| 2.4 | Confirmação aceita o apelido | ✅ | Valida antes de `gravarNota` |
| 2.5 | Callable `definirApelido` | ✅ | Etapa de log `apelido`, só com contagens |
| 2.6 | Reimportação e script | ✅ | O script compila com o comando do cabeçalho (não foi rodado) |
| 2.7 | Testes das Functions | ✅ | `functions/test/apelido.spec.ts` (29 casos) + caso novo em `reimportacao.spec.ts` |
| 3.1 | `ApelidosService` (+ spec) | ✅ | |
| 3.2 | `<cp-campo-apelido>` (+ spec) | ✅ | Signal Forms (`validate` + `maxLength`) |
| 3.3 | Campo na prévia e confirmação | ✅ | `apelido-invalido` volta para `preview` com o erro; o `preview-expirado` mantém o apelido |
| 3.4 | Diálogo "Renomear" e detalhe | ✅ | `import()` dinâmico; ícone `edit` no subset |
| 3.5 | Lista e página do produto | ✅ | `resumirPrecos(…, apelidos?)` |
| 3.6 | Mensagem `apelido-invalido` | ✅ | |
| 4.1 | e2e e a11y | ✅ | Escritos. Sem `.env.e2e` nesta máquina, então não foram executados |
| 4.2 | Documentação | ✅ | `CLAUDE.md` e cenários 22–29 no `functions-dv-checklist.md` |
| 4.3 | Verificação final | ✅ | Ver abaixo |

---

## Discrepâncias do Plano

- **`apelido: null` na confirmação com apelido já existente:** o plano (2.2) previa
  `opcoes.apelido !== undefined ? opcoes.apelido : existente`. Com isso, `null` daria à nota a
  razão social mesmo que o usuário já tivesse um apelido. Foi implementado
  `opcoes.apelido ?? existente ?? null`, que mantém o apelido e dá o nome certo à nota, como pede
  a 2.4 ("um apelido que já existia não é apagado"). Há teste para isso.
- **`apelidoNovo`:** fica `true` só quando o apelido muda. Reenviar o mesmo apelido não grava de
  novo nem propaga.
- **Diálogo fecha com o resultado, não com `true`:** `RenomearDialog` fecha com
  `{ apelido, notasAtualizadas }`, porque o snackbar do detalhe precisa desses dados ("Nome salvo.
  N notas atualizadas." / "Nome oficial restaurado.").
- **`ApelidosService.apelidos`:** o listener nasce quando o service é criado (`toSignal`), e não
  na primeira leitura do signal. O service só é injetado em páginas lazy (Estabelecimentos,
  produto e diálogo), então o efeito é o mesmo sem um `toSignal` preguiçoso.
- **`nomeOficial` do campo:** o input é `input('')`, e não `required`. O pai lê `valido()` pelo
  `viewChild` antes de os inputs do filho serem aplicados, e um input `required` estouraria
  NG0950 nesse momento.
- **Página do produto:** o `resource` passou a devolver os dados brutos. O `resumirPrecos` roda
  num `computed`, para o apelido que chega pelo `onSnapshot` depois do carregamento também
  aparecer.
- **Teste de log sem CNPJ:** o `ctx.log` do fake recebe a chave completa, que contém o CNPJ. O
  teste aplica o mesmo corte do `logImportacao` real (só `chavePrefixo`) antes de procurar.
- **`vincular-nota.spec.ts`:** a expectativa do `ResultadoGravacao` ganhou `apelidoNovo: false`.
- **Checklist do dv:** os cenários novos ficaram numerados de 22 a 29 no
  `functions-dv-checklist.md`, seguindo a numeração que já existia.

---

## Análise de Lint

```
Linting "fed-catalogo-compara-precos"...
All files pass linting.
```

Um erro (`_f` sem uso no `e2e/importar.spec.ts`) foi corrigido antes da rodada final.

Demais verificações:

| Comando | Resultado |
|---|---|
| `npm run contraste` | 55 pares aprovados em WCAG AA (sem par novo) |
| `npm run test:ci` | 36 arquivos, 507 testes verdes |
| `npm --prefix functions run typecheck` | sem erros |
| `npm --prefix functions test` | 11 arquivos, 157 testes verdes |
| `npm --prefix functions run build` | `lib/index.js` gerado |
| `ng build --configuration=production` | ok, sem aviso de budget; `main` 248,94 kB, inicial 485,29 kB. `definirApelido` e o diálogo só aparecem em chunks lazy |
| `npm run e2e` | não executado (sem `.env.e2e`; os testes logados seriam pulados) |

## Boas Práticas Angular 20

| Critério | Status |
|----------|--------|
| OnPush em todos os componentes | ✅ |
| inject() sem construtor | ✅ |
| takeUntilDestroyed() | ✅ (sem subscription manual nova: `onSnapshot` → `toSignal`, diálogo por `firstValueFrom`) |
| trackBy/track em @for | ✅ (nenhum `@for` novo) |
| loading="lazy" em imagens | ✅ (nenhuma imagem nova) |
| Sem any implícito | ✅ |

---

## Critérios de Aceitação

- ✅ Nota do CONDOR SUPER CENTER LTDA: a prévia mostra o campo com "Condor Super Center"; confirmar
  sem mexer, com "Condor Pinheirinho" ou com o campo apagado dá o nome esperado. Coberto nos
  testes; falta a conferência no dv (cenários 22–23).
- ✅ Ao confirmar com apelido, as notas anteriores do usuário daquela loja mudam de nome.
- ✅ A próxima nota da loja, pela prévia ou pela fila, nasce com o apelido, e a prévia não mostra o
  campo.
- ✅ Loja com nome fantasia não mostra o campo; "Renomear" funciona para ela.
- ✅ "Usar o nome oficial" apaga o apelido e volta para o nome fantasia ou a razão social.
- ✅ Outro usuário vê o nome oficial, e `estabelecimentos/{cnpj}` não muda por causa de apelido.
- ✅ Lista de Estabelecimentos e página do produto mostram o apelido; a busca da lista acha pelo
  apelido.
- ✅ Apelido inválido é recusado no front e no servidor (`apelido-invalido`), sem gravar nada.
- ✅ Reimportação e `preencher-fantasia.ts` não sobrescrevem o apelido. A reimportação tem teste;
  o script foi só compilado.
- ✅ Logs sem apelido e sem CNPJ; regras só com leitura pelo dono. As regras ainda serão
  conferidas pelo usuário no Rules Playground.
- ✅ `sugerirApelido` e `limparApelido` com 100 % de cobertura.
- ⚠️ Lint, contraste, testes do front e das Functions, typecheck, build das Functions e build de
  produção verdes. O axe no e2e foi escrito, mas não rodou nesta máquina (sem `.env.e2e`).
- ⏳ Pendente do usuário: `npm run deploy:rules:dev` + checklist do Rules Playground (31–33),
  `npm run deploy:functions:dev` (junto com a feature do nome fantasia, ou depois dela) e o
  checklist do dv (22–29).

---

## Arquivos Criados/Modificados

```
Criados
  shared/apelido.ts
  shared/apelido.spec.ts
  functions/src/estabelecimentos/propagar-nome.ts
  functions/src/estabelecimentos/definir-apelido.ts
  functions/test/apelido.spec.ts
  src/app/shared/ui/campo-apelido/campo-apelido.ts
  src/app/shared/ui/campo-apelido/campo-apelido.spec.ts
  src/app/features/estabelecimentos/data-access/apelidos.service.ts
  src/app/features/estabelecimentos/data-access/apelidos.service.spec.ts
  src/app/features/estabelecimentos/renomear/renomear-dialog.ts
  docs/execucao/2026-09-30-apelido-estabelecimento-plano.md

Modificados
  shared/model.ts
  firestore.rules
  docs/qualidade/regras-firestore-checklist.md
  functions/src/importar/publicar-precos.ts
  functions/src/importar/gravar-nota.ts
  functions/src/importar/preview-nfce.ts
  functions/src/importar/confirmar-nfce.ts
  functions/src/importar/log.ts
  functions/src/index.ts
  functions/src/cnpj/atualizar-na-reimportacao.ts
  functions/scripts/preencher-fantasia.ts
  functions/test/reimportacao.spec.ts
  functions/test/vincular-nota.spec.ts
  src/index.html
  src/app/features/importar/data-access/importar.service.ts
  src/app/features/importar/importar.store.ts
  src/app/features/importar/mensagens.ts
  src/app/features/importar/preview-nota/preview-nota.page.ts
  src/app/features/importar/preview-nota/preview-nota.page.html
  src/app/features/importar/importar.spec.ts
  src/app/features/estabelecimentos/detalhe/estabelecimento-detalhe.page.ts
  src/app/features/estabelecimentos/lista/estabelecimentos-lista.page.ts
  src/app/features/produtos/detalhe/resumo.ts
  src/app/features/produtos/detalhe/produto-detalhe.page.ts
  src/app/features/produtos/produtos.spec.ts
  src/app/features/painel/paginas-fase9.spec.ts
  e2e/importar.spec.ts
  e2e/a11y.spec.ts
  CLAUDE.md
  docs/qualidade/functions-dv-checklist.md
```
