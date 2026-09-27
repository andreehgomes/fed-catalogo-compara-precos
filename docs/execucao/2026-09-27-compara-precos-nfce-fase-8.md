# Execução: Fase 8 — Minhas notas

**Data:** 2026-09-27
**Plano:** docs/plano/compara-precos-nfce-fase-8.md (via `compara-precos-nfce-executar-tudo.md`)
**Branch:** main
**Executor:** Claude Code

---

## Resumo

Área privada do usuário: lista paginada e filtrável das notas (com pendentes no topo),
detalhe com itens, chave e exclusão confirmada, e a comparação "Tem mais barato perto?"
com o Menor Preço, sequencial, com cache, fonte identificada e economia potencial.

---

## Tarefas Executadas

| Fase | Tarefa | Status | Observações |
|------|--------|--------|-------------|
| 8.1 | `NotasService` e índices | ✅ | `listar` com `where`/`orderBy`/`limit(20)`/`startAfter`, `obter` (onSnapshot), `excluir`, `estabelecimentos`. Índice `notas (cnpj ↑, emissao ↓)`. Spec confere as restrições por filtro e o cursor com 45 notas sem repetir |
| 8.2 | Lista de notas | ✅ | Pendentes no topo, filtro de estabelecimento e período em query params (restaurados pelo input binding), "Nova" para `veioDaFila`, "Carregar mais", estados de carregando/erro/vazio ("Importar primeira nota") |
| 8.3 | Detalhe e exclusão | ✅ | Cabeçalho com link para o estabelecimento, total, desconto, itens com link para `/produtos/:produtoId`, preço por unidade base, chave com copiar; `confirm-dialog` criado (`mat-dialog`, `MAT_DIALOG_DATA`, botão `.cp-btn-danger`); exclusão volta para a lista |
| 8.4 | "Tem mais barato perto?" | ✅ | Sob demanda, `concatMap` (1 em voo), `separarDivergentes` e menor coerente, badge "R$ X mais barato no Mercado Y (1,2 km)" + fonte Menor Preço, "Você pagou o menor preço", economia da nota, aviso único se a API cair, seletor de localização se faltar |

---

## Discrepâncias do Plano

- **Itens sem EAN comparados por texto já agora.** O plano condicionava a busca por
  texto ao spike da 6.3 confirmar que o PR não traz EAN. Como o parser provisório (layout
  SVRS) devolve `ean: null` em todos os itens, sem isso a comparação ficaria vazia. A
  busca por texto usa a descrição normalizada e só aceita ofertas com Jaccard ≥ 0,3 e o
  mesmo conteúdo (ex.: 1 L), marcadas como "aproximado".
- **"Nova" guardada no `localStorage`** (`NotasAbertasService`): marcar a nota como aberta
  no Firestore exigiria escrita do cliente em `usuarios/{uid}/notas`, que as regras
  proíbem.
- **Período personalizado com `<input type="date">`** nativo em vez de `mat-datepicker`:
  no celular abre o seletor do sistema, é acessível e não traz o `DateAdapter` para o
  chunk.
- **`resource` (Promise) em vez de `rxResource`** na lista: `getDocs` é Promise; o
  detalhe usa `rxResource` sobre o `onSnapshot`.
- **Valor manual da economia no teste:** a "COCA LATA 350ML" (R$ 6,50) é tratada como
  divergente numa busca pelo GTIN da Coca PET 2 L; o menor coerente é R$ 6,70.

---

## Análise de Lint

```
npm run lint → All files pass linting.
```

## Verificações

```
npm run test:ci → 23 arquivos, 237 testes verdes (cobertura total 87,0%)
ng build -c production → initial 474.17 kB, sem aviso; notas-lista-page e nota-detalhe-page lazy
```

## Boas Práticas Angular 20

| Critério | Status |
|----------|--------|
| OnPush em todos os componentes | ✅ |
| inject() sem construtor | ✅ |
| takeUntilDestroyed() | ✅ (a comparação encerra a assinatura no `DestroyRef`) |
| trackBy/track em @for | ✅ |
| loading="lazy" em imagens | ✅ (nenhuma `<img>`) |
| Sem any implícito | ✅ |

---

## Critérios de Aceitação

- ✅ Lista paginada e filtrável, com pendentes no topo.
- ✅ Detalhe fiel à nota; exclusão com confirmação e só da própria área (spec; a regra do Firestore é o checklist do dv).
- ✅ Comparação com o Menor Preço sob demanda, sequencial, com cache e fonte identificada (spec com `HttpTestingController`: 10 itens → 1 requisição em voo por vez; repetir → nenhuma).
- ✅ Economia potencial calculada por nota (confere com o cálculo manual).
- ✅ Nenhuma informação comunicada só por cor (badges com ícone e texto; "Nova" e status com texto).

---

## Arquivos Criados/Modificados

```
src/app/features/notas/{notas.routes.ts, notas.spec.ts}
src/app/features/notas/data-access/{notas.service.ts, notas-abertas.service.ts}
src/app/features/notas/lista/{notas-lista.page.ts,html,scss, periodo.ts}
src/app/features/notas/detalhe/{nota-detalhe.page.ts,html,scss, mais-barato-perto.ts}
src/app/shared/ui/confirm-dialog/confirm-dialog.ts
firestore.indexes.json src/app/app.routes.ts CLAUDE.md
```
