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

## Vínculo automático (etiquetas + IA)

Pré-requisito: secret `ANTHROPIC_API_KEY` no dv (`npx firebase functions:secrets:set ANTHROPIC_API_KEY -P dev`),
depois `npm run deploy:functions:dev`. O deploy apaga `vincularProdutosAuto`, `itensParaVincular` e
`registrarVinculos` (a CLI pergunta). Opcional: apagar a coleção `vinculosAuto` e `controle/vinculoAuto`.

| # | Cenário | Esperado | OK |
|---|---|---|---|
| 8 | Importar uma nota de um mercado novo, com produtos já vistos em outro mercado | produtos novos com `etiquetas` e `bloco` (ou `bloco: null`); os de mesma variante ligados na hora (`vinculoMotivo: 'etiquetas'`), os em dúvida decididos pela IA (`vinculoMotivo: 'ia'`) ou com `candidatosVinculo` | [ ] |
| 9 | Tempo do "Confirmar importação" nesse cenário | abaixo de 30 s | [ ] |
| 10 | Consulta `produtos` por `bloco` + `vinculadoA == null` | roda sem pedir índice composto (sem erro `FAILED_PRECONDITION` nos logs) | [ ] |
| 11 | `controle/iaVinculo_AAAA-MM` depois de algumas importações | `custoUsd` e `chamadas` somando; no máximo 1 chamada por nota (2 com mais de 40 dúvidas) | [ ] |
| 12 | Teto: baixar `IA_TETO_MENSAL_USD` (em `functions/src/vinculo/config-ia.ts`) para 0,01, publicar e importar | log `vinculo` com `erro: 'teto-ia'`; nenhuma chamada nova | [ ] |
| 13 | Chave inválida no secret | importação conclui normalmente; log `vinculo` com `resultado: 'falha'` e produtos sem vínculo | [ ] |
| 14 | Produto com `candidatosVinculo` no app | "Este produto é o mesmo que…" mostra "Possíveis equivalentes" e o vínculo com um deles funciona | [ ] |
| 15 | "Desfazer vínculo" num produto ligado automaticamente | `vinculoBloqueado: true`; aparecer em outra nota não religa nem apaga o campo | [ ] |
| 16 | Logs `importacao` da etapa `vinculo` | só contagens e `chavePrefixo`; nenhuma descrição, CNPJ ou uid | [ ] |
