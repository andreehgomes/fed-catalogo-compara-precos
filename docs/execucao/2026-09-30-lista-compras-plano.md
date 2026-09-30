# Execução: Lista de compras

**Data:** 2026-09-30
**Plano:** [docs/plano/lista-compras-plano.md](../plano/lista-compras-plano.md)
**Branch:** main
**Executor:** Claude Code

---

## Resumo

Área nova `/listas` com até 5 listas gravadas direto pelo cliente em `usuarios/{uid}/listas/**`
(offline primeiro, escrita otimista), uso no mercado com marcação, estimativa pelo último preço
pago, autocompletar do histórico e tela acesa. "Ler a nota desta compra" leva à importação com a
lista em contexto e à conferência (`/listas/:id/conferir`), que liga itens da lista aos da nota
por grupo e por texto, com ajustes manuais, e termina na finalização (excluir, guardar, manter só
o que faltou, ler outra nota). Integrações em Sugestão de compra, Produto, detalhe da Nota e Painel.

---

## Tarefas Executadas

| Fase | Tarefa | Status | Observações |
|------|--------|--------|-------------|
| 1.1 | Modelo (`shared/model.ts`) | ✅ | `StatusLista`, `OrigemItemLista`, `ListaCompras`, `ItemLista`, `VinculoItemLista`, `ComId` |
| 1.2 | Escrita no `FIRESTORE_API` | ✅ | `updateDoc`, `writeBatch`, `arrayUnion`, `arrayRemove`; fake novo `src/testing/firestore-falso.ts` (ver discrepâncias) |
| 1.3 | Regras do Firestore | ✅ | `match /listas/{id}` e `/itens/{itemId}` com validação; checklist com 12 cenários novos (34–45). **Deploy pendente (usuário)** |
| 1.4 | Rota, menu, FAB e ícones | ✅ | `listas.routes.ts`, item "Lista de compras", FAB some em `/listas/:id` e na conferência, 13 ícones no subset |
| 2.1–2.5 | Regra pura (`lista.ts`) | ✅ | 100 % de cobertura (statements, branches, functions) |
| 2.6 | Fixture e calibração (D-04) | ✅ | Nota real em `src/testing/fixtures/lista/`; limiares 1/3 e 0,2 registrados no D-04 |
| 3.1 | `ListasService` | ✅ | 100 %; `criar` devolve o id sem esperar o commit |
| 3.2 | `ListasStore` | ✅ | Inclui `adicionarEmLista` (7.1), `pedirNome`, `confirmarExclusao`, `escolher` |
| 3.3 | `ListaStore` | ✅ | Histórico só sob demanda; marcar/remover com "Desfazer" |
| 3.4 | `gruposDaNota` no histórico | ✅ | Sem mudança em `comparar`/`resumir` |
| 3.5 | Tela acesa | ✅ | Token `WAKE_LOCK` + `manterTelaAcesa` |
| 4.1 | Minhas listas | ✅ | Estados vazio/cheio/erro, progresso, menu Renomear/Excluir |
| 4.2 | `<cp-adicionar-item>` | ✅ | Combobox acessível (`aria-activedescendant`, setas, Enter, Esc) |
| 4.3 | `<cp-item-lista>` e editar | ✅ | Checkbox nativo na linha, "no carrinho" para o leitor, stepper no diálogo |
| 4.4 | Página da lista | ✅ | Pendentes/"No carrinho (N)" recolhível, foco no próximo, rodapé com estimativa, avisos |
| 5.1 | `ImportarStore` com lista | ✅ | Confirmar → conferência; guardar → `aguardarNota` |
| 5.2 | Página de importação | ✅ | Faixa com "Não conferir", "Conferir com a lista" no `ja-importada`, "Importar e conferir" |
| 5.3 | Lista aguardando a nota | ✅ | "A nota chegou — Conferir agora"; falhou → "Ler de novo"/"Dispensar" |
| 6.1 | `ConferenciaStore` | ✅ | Ajustes em `linkedSignal`, modo leitura, limite de 3 notas |
| 6.2 | Página da conferência | ✅ | Resumo, 4 seções, duas colunas no desktop, nota excluída (RF-15) |
| 6.3 | Finalização | ✅ | `<cp-finalizar-compra>` na conferência e na faixa da lista |
| 7.1 | `escolher-lista-dialog` | ✅ | 0 → cria, 1 → adiciona, > 1 → pergunta |
| 7.2 | Sugestão de compra | ✅ | "Criar lista com N itens", "Adicionar à lista", chip "Na lista" fora da pré-seleção |
| 7.3 | Página do produto | ✅ | "Adicionar à lista" com o canônico |
| 7.4 | Detalhe da nota | ✅ | "Conferir com uma lista" (botão no cabeçalho) |
| 7.5 | Card no painel | ✅ | `<cp-lista-em-andamento>` em `@defer (on viewport)` |
| 8.1 | Cobertura | ✅ | `lista.ts` 100 %; 650 testes verdes |
| 8.2 | e2e | ⚠️ | `e2e/listas.spec.ts` + 2 casos no `a11y.spec.ts` escritos; **pulados** (sem `.env.e2e` nesta máquina) |
| 8.3 | Lint, contraste, build e budgets | ✅ | Ver abaixo |
| 8.4 | Verificação no navegador (dv) | ⚠️ | Só a rota e o guard (sem login e sem as regras publicadas); resto depende do usuário |
| 8.5 | Documentação | ✅ | `CLAUDE.md` (rotas, Firebase, Shell, Importação, Sugestão, seção "Lista de compras") e D-04 da análise |

---

## Discrepâncias do Plano

- **Contadores do cabeçalho (convenção e 1.2):** o plano pedia `increment()`; os contadores são
  gravados no mesmo batch, mas com valor **absoluto** calculado dos itens (`contadores()`). A regra
  recusa `qtdMarcados > qtdItens`; com `increment`, qualquer divergência travaria a lista para
  sempre, e o valor absoluto se corrige na próxima escrita. Por isso `increment` e `setDoc` não
  entraram no `FIRESTORE_API` (ficariam sem uso).
- **Fake do Firestore (1.2):** não havia fake compartilhado; foi criado
  `src/testing/firestore-falso.ts` (em memória, `onSnapshot` reativo, batch registrado, commit
  `ok|erro|pendente`) e `src/testing/listas.ts` com os providers da feature.
- **Limite de 5 listas (3.1):** checado no `ListasStore.criar` (que tem o sinal das listas), não no
  service, para não precisar ler do servidor antes de criar.
- **`adicionar` (3.1):** recebe os itens existentes; quem não tem a lista aberta lê antes com
  `ListasService.itens(id)`. A mesclagem e o corte em 150 ficaram numa função pura
  (`planejarAdicao`), que também soma repetidos entre os próprios itens novos.
- **Autocompletar (2.3):** Jaccard com casamento pelo **começo** da palavra ("leit" → LEITE), para
  sugerir enquanto o usuário digita; com igualdade exata, nada aparecia até a palavra completa.
- **Limiares (2.4/2.6, D-04):** `LIGA_POR_TEXTO = 1/3` e `PERGUNTA_POR_TEXTO = 0,2` (o plano partia de
  0,4/0,25): na nota real os acertos óbvios de uma palavra ficam em 0,33. "Empate" foi definido
  como mais de um candidato ≥ `PERGUNTA_POR_TEXTO` para o item (vai para "Confirme").
- **`mesclarItem` (2.2):** além de `id` e `quantidade`, devolve `unidade`/`base` (quando o
  existente não tinha quantidade, vale a do novo). Item já ligado a nota não recebe soma.
- **`so-faltou` (2.5):** não gera `update` dos itens que ficam — por definição já estão
  desmarcados e sem vínculo.
- **Ajustes da conferência (6.1):** ficaram como funções puras em `lista.ts` (`confirmarPar`,
  `desfazerPar`, `ligarManual`, `alternarAdicionado`), com 100 % de cobertura; `recusar` e
  `desfazer` do plano são a mesma operação (`desfazerPar`). `resumoDaConferencia` ganhou o
  parâmetro `adicionados`.
- **Detalhe da nota (7.4):** a tela não tem menu; a ação virou um botão de ícone no cabeçalho, ao
  lado de "Excluir nota", visível só com listas.
- **Duas colunas (6.2):** por CSS (`@include desktop`), sem `BreakpointService` — não há decisão em
  TypeScript.
- **"Manter para a próxima" (RF-11 da análise)** não virou ação por item: "Manter só o que faltou"
  na finalização cobre o caso.
- **`firestore.indexes.json`:** sem mudança; as consultas (`orderBy('atualizadaEm')`,
  `orderBy('ordem')`) usam índices de campo único.

---

## Análise de Lint

```
> ng lint && stylelint "src/**/*.scss" --allow-empty-input
Linting "fed-catalogo-compara-precos"...
All files pass linting.
```

0 erros (ESLint e stylelint). `npm run contraste`: 55 pares aprovados (nenhum token novo).
`ng build --configuration=production`: initial total **490,67 kB** (< 500 kB; nada da lista no
bundle inicial), sem aviso de `anyComponentStyle`. `npm --prefix functions run typecheck`: ok.
`npm run test:ci`: **43 arquivos, 650 testes** verdes.

## Boas Práticas Angular 20

| Critério | Status |
|----------|--------|
| OnPush em todos os componentes | ✅ |
| inject() sem construtor | ✅ |
| takeUntilDestroyed() | ✅ (sem subscription manual nova com ciclo de componente; `onAction()` do snackbar completa sozinho) |
| trackBy/track em @for | ✅ |
| loading="lazy" em imagens | ✅ (nenhuma imagem nova) |
| Sem any implícito | ✅ |

---

## Critérios de Aceitação

- ✅ "Lista de compras" no menu abre `/listas`; o FAB não aparece em `/listas/:id` nem na
  conferência.
- ✅ Criar, renomear e excluir lista (com confirmação); com 5 listas não dá para criar outra (nem
  pela sugestão) e o aviso explica.
- ✅ Autocompletar sugere o que o usuário já comprou; texto livre funciona; item repetido soma.
- ✅ "Criar lista com N itens" na sugestão leva itens e quantidades ajustadas; itens em lista
  aparecem como "Na lista".
- ✅ "Adicionar à lista" funciona na página do produto e em "Fora da lista".
- ✅ Marcar/desmarcar move o item de seção, atualiza e anuncia o progresso; "Desfazer" funciona.
- ⚠️ Offline: coberto nos testes (commit pendente + snapshot local); falta a prova no navegador
  (DevTools → Offline) no dv, depois do deploy das regras.
- ✅ A tela fica acesa na lista com pendentes e volta ao normal ao sair (testado com wake lock falso).
- ✅ Estimativa com último preço pago e contagem de itens sem preço.
- ✅ "Ler a nota desta compra" → importar → conferência; `ja-importada` oferece conferir; nota na
  fila deixa a lista "aguardando nota" e avisa quando chega.
- ✅ "Conferir com uma lista" no detalhe da nota.
- ✅ Conferência liga por grupo, por texto (aproximado) e pergunta nos incertos; ajustes manuais
  funcionam; totais batem.
- ✅ Salvar grava vínculos, marca os itens e o produto aprendido; guardada, o item antes digitado
  liga por grupo na próxima compra.
- ✅ Finalização: excluir, guardar para usar de novo, manter só o que faltou e ler outra nota.
- ⚠️ Regras: escritas e com checklist atualizado; **falta** o usuário publicar
  (`npm run deploy:rules:dev`) e rodar os cenários 34–45 no Rules Playground.
- ⚠️ `lista.ts` 100 %; lint, contraste, `test:ci` e build de produção verdes; `main` < 500 kB. O e2e
  foi escrito, mas não rodou com login (sem `.env.e2e`).
- ✅ `CLAUDE.md` atualizado.

---

## Arquivos Criados/Modificados

```
Criados
docs/execucao/2026-09-30-lista-compras-plano.md
e2e/listas.spec.ts
e2e/support/listas.ts
src/app/features/listas/listas.routes.ts
src/app/features/listas/lista.ts
src/app/features/listas/lista.spec.ts
src/app/features/listas/listas.spec.ts
src/app/features/listas/data-access/listas.service.ts (+ .spec.ts)
src/app/features/listas/data-access/listas.store.ts (+ .spec.ts)
src/app/features/listas/data-access/lista.store.ts (+ .spec.ts)
src/app/features/listas/data-access/tela-acesa.ts (+ .spec.ts)
src/app/features/listas/minhas-listas/minhas-listas.page.ts|html|scss
src/app/features/listas/lista/lista.page.ts|html|scss
src/app/features/listas/lista/ui/adicionar-item.ts
src/app/features/listas/lista/ui/item-lista.ts|scss
src/app/features/listas/lista/ui/editar-item-dialog.ts
src/app/features/listas/conferencia/conferencia.store.ts
src/app/features/listas/conferencia/conferencia.page.ts|html|scss
src/app/features/listas/conferencia/conferencia.spec.ts
src/app/features/listas/conferencia/ui/par-conferido.ts
src/app/features/listas/conferencia/ui/escolher-par-dialog.ts
src/app/features/listas/ui/escolher-lista-dialog.ts
src/app/features/listas/ui/finalizar-compra.ts
src/app/features/listas/ui/renomear-lista-dialog.ts
src/app/features/painel/ui/lista-em-andamento.ts
src/testing/firestore-falso.ts
src/testing/listas.ts
src/testing/fixtures/lista/nota.ts
src/testing/fixtures/lista/lista.ts
src/testing/fixtures/lista/grupos.ts

Modificados
CLAUDE.md
docs/analise/lista-compras-analise.md (D-04 calibrado)
docs/qualidade/regras-firestore-checklist.md
e2e/a11y.spec.ts
firestore.rules
shared/model.ts
src/index.html
src/app/app.routes.ts
src/app/core/firebase/firestore-api.ts
src/app/core/layout/shell.ts | shell.spec.ts
src/app/features/importar/importar.store.ts | importar.page.ts | importar.page.html | importar.spec.ts
src/app/features/importar/preview-nota/preview-nota.page.html
src/app/features/notas/data-access/historico-pessoal.store.ts
src/app/features/notas/detalhe/historico-pessoal.ts (exporta conteudoCompativel)
src/app/features/notas/detalhe/nota-detalhe.page.ts | nota-detalhe.page.html
src/app/features/notas/notas.spec.ts
src/app/features/painel/painel.page.ts | painel.page.html | paginas-fase9.spec.ts
src/app/features/produtos/detalhe/produto-detalhe.page.ts | produto-detalhe.page.html
src/app/features/sugestoes/data-access/sugestoes.store.ts | sugestoes.store.spec.ts
src/app/features/sugestoes/sugestoes.page.ts | sugestoes.page.html | sugestoes.page.scss | sugestoes.spec.ts
src/app/features/sugestoes/ui/lista-completa.ts | sugestao-item.ts
```
