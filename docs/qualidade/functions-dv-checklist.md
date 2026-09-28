# Checklist: Functions e App Check no projeto dv

**Projeto:** `fed-catalogo-compara-precos-dv` · **Quem roda:** o usuário (o agente não faz deploy).

## Pré-requisitos

1. Plano **Blaze** no dv, com alerta de orçamento no GCP (Functions e fetch externo exigem).
2. `npm run deploy:rules:dev` (regras + índices; o índice de `pendentes` é de collection
   group e a política de TTL de `previews.expiraEm` vem do `firestore.indexes.json`).
3. `npm run deploy:functions:dev` (roda `typecheck` + `build` no `predeploy`).
4. Em **App Check → Apps**, conferir que o app web está com o provedor reCAPTCHA Enterprise
   (chave `6Ldt-NEtAAAAAExrwyqrZy1HiNJK7lYq2hrE3z5y`).

## Debug token do localhost (Tarefa 6.7)

1. `npm start`, entrar e abrir **Importar nota** (é quando o App Check é ativado).
2. No console do navegador aparece `App Check debug token: <uuid>`.
3. Console do Firebase (dv) → App Check → Apps → ⋮ → **Gerenciar tokens de depuração** →
   adicionar o token.

## Cenários

| # | Cenário | Esperado | OK |
|---|---|---|---|
| 1 | Chamar `previewNfce` pelo app no localhost, com o debug token registrado | responde (prévia ou erro de negócio) | [ ] |
| 2 | Chamar `previewNfce` por `curl` sem header `X-Firebase-AppCheck` | HTTP 401 / `unauthenticated` (App Check exigido) | [ ] |
| 3 | Idem em produção, depois do deploy da Fase 10 | rejeitado | [ ] |
| 4 | Importar um cupom real do PR (quando o portal voltar) | prévia igual ao cupom impresso; confirmar grava a nota | [ ] |
| 5 | Com o portal fora, "Guardar e importar quando voltar" | pendente em `usuarios/{uid}/pendentes`; `reprocessarPendentes` roda a cada 15 min (Logs) | [ ] |
| 6 | Logs da importação (Cloud Logging, `importacao`) | só `chavePrefixo` (6 dígitos), sem uid, CNPJ ou chave completa | [ ] |
| 7 | 31 prévias em menos de 1 h pelo mesmo usuário | a 31ª responde `rate-limit` | [ ] |

`curl` do cenário 2 (substitua o token de ID de um usuário de teste):

```bash
curl -s -X POST https://southamerica-east1-fed-catalogo-compara-precos-dv.cloudfunctions.net/previewNfce -H "Content-Type: application/json" -H "Authorization: Bearer <ID_TOKEN>" -d "{\"data\":{\"chave\":\"41260903644587000836652100000168701620438547\"}}"
```

## Vínculo automático pelo Menor Preço

Depois de `npm run deploy:rules:dev` (índice novo de `vinculosAuto`) e
`npm run deploy:functions:dev` (agendada `vincularProdutosAuto`, a cada 30 min):

| # | Cenário | Esperado | OK |
|---|---|---|---|
| 8 | Importar uma nota nova no dv | um `vinculosAuto/{loc:…}` por produto novo, `status: aguardando`, `proximaTentativa` = emissão + 2 h; nenhum campo com uid | [ ] |
| 9 | Primeira execução depois de `controle/vinculoAuto` ainda não existir | Logs `vinculo-auto` com `enfileiradosBackfill` > 0 (produtos `loc:` antigos entram na fila) | [ ] |
| 10 | Execuções seguintes | no máximo 12 `consultas` por execução; itens como "Det Ype 500ml Coco" viram `vinculadoA: ean:7896098900239` e o `produtos/ean:…` é criado | [ ] |
| 11 | Item ambíguo (ex.: "Cafe Itamaraty 500g") | sem `vinculadoA`, com `sugestoesEan`; no app, "Este produto é o mesmo que…" mostra os códigos e o vínculo com um deles funciona | [ ] |
| 12 | "Desfazer vínculo" num produto vinculado automaticamente | `vinculoBloqueado: true`; o job não o vincula de novo | [ ] |
| 13 | Menor Preço devolvendo dados sintéticos (bloqueio por volume) | Logs com `parada: 'bloqueio'`, `controle/vinculoAuto.pausadoAte` = +2 h, nenhum vínculo novo nesse intervalo | [ ] |
