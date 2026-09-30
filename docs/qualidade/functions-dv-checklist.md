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

## Nome fantasia (BrasilAPI → minhareceita)

Pré-requisito: `npm run deploy:functions:dev`.

| # | Cenário | Esperado | OK |
|---|---|---|---|
| 17 | Importar a nota real de 03.644.587/0008-36 | prévia, Minhas notas e detalhe do estabelecimento mostram **BOX ATACADISTA**; o detalhe mostra "Razão social: …" abaixo; `estabelecimentos/{cnpj}` com `fantasia` e `fantasiaConsultadaEm` | [ ] |
| 18 | Segunda nota do mesmo CNPJ | log `importacao` da etapa `cnpj` com `contagens.cache = 1` | [ ] |
| 19 | Reimportar uma nota de uma loja sem `fantasiaConsultadaEm` | "Aproveitamos para atualizar os dados do estabelecimento."; todas as notas do usuário dessa loja com o nome fantasia | [ ] |
| 20 | Logs da etapa `cnpj` | só `uf`, `duracaoMs`, `resultado` e contagens; nenhum CNPJ, nome ou chave | [ ] |
| 21 | Artifact Registry `gcf-artifacts` (southamerica-east1) com política de limpeza de 1 dia | `npm run artifacts:limpeza:dev` (e `:prod` na produção); conferir no console, em Artifact Registry → gcf-artifacts → Políticas de limpeza | [ ] |

## Apelido do estabelecimento

Pré-requisitos: `npm run deploy:rules:dev` (leitura de `usuarios/{uid}/estabelecimentos`) e
`npm run deploy:functions:dev` (`definirApelido` e `confirmarNfce` com apelido). Loja de teste:
CONDOR SUPER CENTER LTDA (76.189.406/0001-26), sem nome fantasia na Receita.

| # | Cenário | Esperado | OK |
|---|---|---|---|
| 22 | Prévia de uma nota do Condor sem apelido | campo "Como você chama esta loja?" com **Condor Super Center** e a linha "Razão social: …" | [ ] |
| 23 | Trocar para "Condor Pinheirinho" e confirmar | `usuarios/{uid}/estabelecimentos/76189406000126` criado; a nota nova e as notas **antigas** do Condor com "Condor Pinheirinho" em Minhas notas, painel, filtro e sugestões | [ ] |
| 24 | Próxima nota do Condor (prévia ou fila) | prévia sem o campo, título "Condor Pinheirinho"; a nota nasce com o apelido | [ ] |
| 25 | Outro usuário com nota do Condor | vê a razão social; `estabelecimentos/76189406000126` sem nenhum campo de apelido | [ ] |
| 26 | Detalhe do estabelecimento → "Renomear" → outro nome → Salvar | snackbar "Nome salvo. N notas atualizadas."; lista de Estabelecimentos e página do produto com o apelido; a busca da lista acha pelo apelido | [ ] |
| 27 | "Renomear" → "Usar o nome oficial" | documento do apelido apagado; notas voltam para o nome fantasia ou a razão social | [ ] |
| 28 | "Renomear" numa loja com nome fantasia (ex.: BOX ATACADISTA) | aceita; o detalhe mostra "Nome na Receita: BOX ATACADISTA" | [ ] |
| 29 | Logs `importacao` das etapas `confirmacao` e `apelido` | só contagens (`notasAtualizadas`, `removido`) e `chavePrefixo`; nenhum apelido, CNPJ ou uid | [ ] |
