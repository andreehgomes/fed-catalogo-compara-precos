# Execução: Fase 7 — Importação (front)

**Data:** 2026-09-27
**Plano:** docs/plano/compara-precos-nfce-fase-7.md (via `compara-precos-nfce-executar-tudo.md`)
**Branch:** main
**Executor:** Claude Code

---

## Resumo

Fluxo do mercado no front: ler o QR (câmera ou galeria), colar o link ou digitar a chave
→ validação local → prévia → confirmação, com mensagem e ação própria para cada erro,
"Guardar e importar quando voltar" com a SEFAZ fora e o bloco "Aguardando a SEFAZ-PR" em
tempo real.

---

## Tarefas Executadas

| Fase | Tarefa | Status | Observações |
|------|--------|--------|-------------|
| 7.1 | `ImportarService` | ✅ | `preview`, `confirmar`, `enfileirar`, `retentar` sobre o token `CHAMAR_FUNCTION` (httpsCallable); `FunctionsError` → `ErroImportacao`. Spec cobre sucesso e cada código |
| 7.2 | Tela "Importar nota" | ✅ | Ação principal com scanner em `@defer`; colar (clipboard com fallback no campo) e chave com máscara; validação local por `lerUrlQr`/`validarChave`; `ImportarStore` em união de estados; tabela de mensagens do plano (+ `chave-invalida`, `preview-expirado`, `nao-autenticado`, `desconhecido`); aviso sem conexão |
| 7.3 | Prévia e confirmação | ✅ | Cabeçalho (nome, CNPJ, endereço), resumo (emissão, itens, total, desconto), itens com `qtd × unitário` e preço por unidade base; confirmar → `/notas/:chave` + snackbar; `previewGuard`; `preview-expirado` refaz a prévia uma vez |
| 7.4 | Pendentes visíveis | ✅ / ⛔ | `PendentesService` (`onSnapshot` ordenado por `criadaEm`), bloco com chips `aguardando` ("Próxima tentativa às HH:mm") e `falhou`, "Tentar de novo" e "Excluir"; snackbar "Nota de X importada". ⛔ Ponta a ponta no dv (enfileirar → agendada → nota): usuário, após deploy |

---

## Discrepâncias do Plano

- **Tokens de SDK para testes:** `CHAMAR_FUNCTION` (callables) e `FIRESTORE_API`
  (Firestore) no lugar de chamar o SDK direto, pelo mesmo motivo do `AUTH_API`
  (`vi.mock` do Firebase falha com todos os specs juntos).
- **Campo da chave fora do Signal Forms:** a máscara em blocos de 4 reescreve o valor a
  cada tecla; ficou um `<input>` com `(input)` e signal. O link do QR usa Signal Forms.
- **Mensagens a mais:** além da tabela do plano, `chave-invalida`, `preview-expirado`,
  `nao-autenticado` (ação "Entrar") e `desconhecido`.
- **Aviso "Importar precisa de conexão"** (previsto para a Fase 10.4) entrou já aqui.
- O bloco de pendentes virou o componente `<cp-pendentes-bloco>` (além do
  `<cp-pendente-row>` previsto), para Importar, Minhas notas e painel usarem igual.
- O `previewGuard` fica em arquivo próprio para a página de prévia continuar lazy.

---

## Análise de Lint

```
npm run lint → All files pass linting.
```

## Verificações

```
npm run test:ci → 22 arquivos, 223 testes verdes (cobertura total 88,4%)
npm run e2e (chromium) → 7 passed, 7 skipped (fluxos logados sem .env.e2e)
ng build -c production → initial 474.06 kB (sem aviso); importar-page, importar-routes e
  preview-nota-page em chunks lazy
```

## Boas Práticas Angular 20

| Critério | Status |
|----------|--------|
| OnPush em todos os componentes | ✅ |
| inject() sem construtor | ✅ |
| takeUntilDestroyed() | ✅ (streams via `toSignal`) |
| trackBy/track em @for | ✅ |
| loading="lazy" em imagens | ✅ (nenhuma `<img>`) |
| Sem any implícito | ✅ |

---

## Critérios de Aceitação

- ✅ / ⛔ Câmera, galeria, URL colada e chave levam à mesma prévia: coberto por spec (store/página) e por e2e escrito (galeria com a imagem de QR gerada, URL colada) que roda com `.env.e2e`. Câmera real: usuário.
- ✅ Chave com DV inválido é rejeitada sem chamar a function (spec da página e do store; e2e escrito).
- ✅ Cada código de erro tem mensagem e ação próprias (spec parametrizado).
- ✅ SEFAZ fora → "Guardar e importar quando voltar" → `enfileirarNfce`; pendente com status e próxima tentativa (specs do store, página e `PendenteRow`).
- ✅ Nota reimportada leva à nota existente ("Abrir a nota" → `/notas/:chave`).
- ⛔ 375×812 com uma mão (ação principal acima da dobra, alvos ≥ 44 px): o CSS garante 44–56 px e o botão principal é o primeiro bloco da tela, mas a conferência visual logada depende do usuário de teste.

---

## Arquivos Criados/Modificados

```
src/app/core/firebase/{callable,firestore-api}.ts src/app/core/layout/conexao.service.ts
src/app/features/importar/{importar.page.ts,html,scss, importar.store.ts, importar.routes.ts, mensagens.ts, importar.spec.ts}
src/app/features/importar/data-access/importar.service.ts
src/app/features/importar/preview-nota/{preview-nota.page.ts,html,scss, preview.guard.ts}
src/app/features/notas/data-access/pendentes.service.ts
src/app/features/notas/ui/{pendentes-bloco.ts, pendente-row/pendente-row.ts} src/app/features/notas/pendentes.spec.ts
src/app/app.routes.ts e2e/importar.spec.ts e2e/support/mocks.ts CLAUDE.md
```
