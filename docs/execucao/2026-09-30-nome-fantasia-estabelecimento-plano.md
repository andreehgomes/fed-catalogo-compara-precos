# Execução: Nome fantasia do estabelecimento

**Data:** 2026-09-30
**Plano:** [docs/plano/nome-fantasia-estabelecimento-plano.md](../plano/nome-fantasia-estabelecimento-plano.md)
**Branch:** main
**Executor:** Claude Code

---

## Resumo

As Functions passam a completar o nome fantasia do emitente pelo CNPJ (BrasilAPI →
minhareceita.org) no fim de `obterNotaDaSefaz`, com cache de 180 dias em
`estabelecimentos/{cnpj}.fantasiaConsultadaEm`. Uma falha na consulta nunca derruba a
importação. A reimportação de uma nota já importada completa o estabelecimento incompleto e o
nome nas notas do próprio usuário (`estabelecimentoAtualizado: true`). No front, o detalhe do
estabelecimento mostra a razão social e a tela de importação mostra o aviso da atualização.

---

## Tarefas Executadas

| Fase | Tarefa | Status | Observações |
|------|--------|--------|-------------|
| 1.1 | `validarCnpj` | ✅ | Reaproveita `digitoChave` (os pesos do CNPJ são os mesmos 2..9 cíclicos). |
| 1.2 | Regra pura `shared/nome-fantasia.ts` | ✅ | Data inválida conta como "precisa consultar". |
| 1.3 | Campos do modelo | ✅ | `fantasiaConsultadaEm` em `Emitente` e `Estabelecimento`; `estabelecimentoAtualizado?: true` em `ja-importada`. |
| 2.1 | Fixtures reais | ✅ | 3 JSON em `functions/test/fixtures/cnpj/`, sem `qsa` (`grep -i qsa` vazio). |
| 2.2 | Cliente de CNPJ | ✅ | `lerCorpo` de `fetch-sefaz.ts` exportado com limite parametrizado (sem duplicar). |
| 2.3 | Contexto e log | ✅ | `consultarCnpj` no `Contexto`, etapa `'cnpj'`, fake em `apoio.ts`. |
| 2.4 | `completarEmitente` | ✅ | Chamado no fim de `obterNotaDaSefaz`. |
| 2.5 | Gravação do cache | ✅ | `fantasiaConsultadaEm` só quando veio no emitente. |
| 2.6 | Testes de integração | ✅ | Novo `functions/test/nome-fantasia.spec.ts` (11 casos). |
| 2.7 | Script retroativo | ✅ | Compila com o comando do cabeçalho; `--simular` é o padrão. **Não rodado.** |
| 2.8 | Atualização na reimportação | ✅ | Tudo num `repo.lote` no fim; `ErroNegocio` ganhou o 4º parâmetro. |
| 2.9 | Testes da reimportação | ✅ | Novo `functions/test/reimportacao.spec.ts` (8 casos). |
| 3.1 | Razão social no detalhe | ✅ | Sem CSS novo; 2 casos no `paginas-fase9.spec.ts`. |
| 3.2 | Aviso da reimportação no front | ✅ | `mensagemDe` + `estabelecimentoAtualizado()`; o store invalida o histórico só com o flag. |
| 3.3 | Limpeza do Artifact Registry | ✅ | Opções conferidas com `firebase help`; item 21 no checklist do dv. **Scripts não rodados.** |
| 3.4 | Mock do e2e e documentação | ✅ | `CLAUDE.md` (Commands, Fontes de dados, Functions). |
| 3.5 | Verificação final | ✅ | e2e não rodado (ver Verificação). |

---

## Discrepâncias do Plano

- **Fallback do nome (2.4):** quando a consulta volta sem nome fantasia utilizável (vazio, igual
  à razão social ou `nao-encontrado`), o emitente mantém o `fantasia` já gravado. O plano só
  previa isso na falha, mas o RF-06 diz que o nome antigo é mantido; assim a nota nova e o
  estabelecimento não divergem.
- **Timeout testável (2.2):** `criarConsultaCnpj` aceita `sinal?: (ms) => AbortSignal` opcional
  (padrão `AbortSignal.timeout`), usado no teste do timeout e do teto de 5 s.
- **CNPJ inválido:** lança `Error('cnpj-invalido')`. O log só usa `cnpj-invalido` e
  `cnpj-indisponivel`; qualquer outro erro vira `desconhecido`, para nenhuma mensagem com CNPJ
  chegar ao log.
- **Reimportação (2.8):** também loga o sucesso (`contagens: { reimportacao, notasAtualizadas }`)
  e aborta sem gravar se o CNPJ relido da SEFAZ diferir do CNPJ da chave.
- **Testes existentes ajustados** (`importacao.spec.ts`): a prévia devolve o emitente com
  `fantasia`/`fantasiaConsultadaEm`; o log completo tem a linha `cnpj`; o caso "ja-importada
  devolve a chave" grava antes um estabelecimento completo.
- **Mock do e2e (3.4):** fica em `e2e/importar.spec.ts`, não em `e2e/support/mocks.ts`. Com
  `fantasia` no mock, o título da prévia muda, então a asserção do heading passou para
  `BOX ATACADISTA`.
- **Script (2.7):** as notas são gravadas com `set(..., { merge: true })` no mesmo lote.

---

## Análise de Lint

```
> ng lint && stylelint "src/**/*.scss" --allow-empty-input
Linting "fed-catalogo-compara-precos"...
All files pass linting.
```

## Verificação

| Comando | Resultado |
|---|---|
| `npm run lint` | 0 erros |
| `npm run test:ci` | 33 arquivos, 447 testes verdes |
| `npm --prefix functions run typecheck` | ok |
| `npm --prefix functions test` | 10 arquivos, 129 testes verdes |
| `npm --prefix functions run build` | `lib/index.js` gerado |
| `ng build --configuration=production` | ok (bundle gerado em `dist/`) |
| `npm run e2e` | não rodado |

## Boas Práticas Angular 20

| Critério | Status |
|----------|--------|
| OnPush em todos os componentes | ✅ (nenhum componente novo) |
| inject() sem construtor | ✅ |
| takeUntilDestroyed() | ✅ (nenhuma subscription nova) |
| trackBy/track em @for | ✅ (nenhum `@for` novo) |
| loading="lazy" em imagens | ✅ (nenhuma imagem nova) |
| Sem any implícito | ✅ |

---

## Critérios de Aceitação

- ✅ Nota nova de loja com nome fantasia → nome fantasia na prévia e na nota (teste 2.6). No dv: depende do deploy.
- ✅ Detalhe do estabelecimento com "Razão social: …"; sem nome fantasia, só a razão social.
- ✅ Segunda nota da mesma loja sem chamada externa (cache de 180 dias).
- ✅ A confirmação não consulta de novo.
- ✅ BrasilAPI fora → minhareceita; 404 sem reserva; as duas fora → razão social e log de falha.
- ✅ Nome fantasia vazio, só símbolos ou igual à razão social não é gravado.
- ✅ Anti-SSRF: DV antes do fetch, hosts fixos, `redirect: 'error'`, 3 s / 5 s, 256 kB.
- ✅ Log `cnpj` sem CNPJ, nome ou chave; fixtures sem QSA; nenhum teste chama as APIs reais.
- ✅ `preencher-fantasia.ts` é `--simular` por padrão.
- ✅ Reimportação atualiza estabelecimento e notas do uid, com o aviso; outros usuários intactos.
- ✅ Reimportação com estabelecimento completo não chama SEFAZ nem Receita.
- ✅ Falha na reimportação não muda a resposta e não grava nada.
- ✅ Scripts `artifacts:limpeza:dev|prod` e item no checklist do dv.
- ✅ Lint, testes do front e das Functions, typecheck, build das Functions e build de produção verdes.
- ⏳ Usuário: `npm run deploy:functions:dev`, `npm run artifacts:limpeza:dev` (e `:prod`), reimportar uma nota no dv e, opcionalmente, o script de preenchimento.

---

## Arquivos Criados/Modificados

```
shared/chave-acesso.ts, shared/chave-acesso.spec.ts
shared/nome-fantasia.ts, shared/nome-fantasia.spec.ts   (novos)
shared/model.ts
functions/src/cnpj/consultar-cnpj.ts                    (novo)
functions/src/cnpj/completar-emitente.ts                (novo)
functions/src/cnpj/atualizar-na-reimportacao.ts         (novo)
functions/src/importar/{contexto,log,obter-nota,gravar-nota,preview-nfce,erros,fetch-sefaz}.ts
functions/scripts/preencher-fantasia.ts                 (novo)
functions/test/fixtures/cnpj/*.json                     (novos, sem QSA)
functions/test/{consultar-cnpj,nome-fantasia,reimportacao}.spec.ts (novos)
functions/test/apoio.ts, functions/test/importacao.spec.ts
src/app/features/estabelecimentos/detalhe/estabelecimento-detalhe.page.ts
src/app/features/painel/paginas-fase9.spec.ts
src/app/features/importar/{mensagens,importar.store,importar.spec}.ts
e2e/importar.spec.ts
package.json
docs/qualidade/functions-dv-checklist.md
CLAUDE.md
```
