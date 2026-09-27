# Checklist: regras do Firestore no Rules Playground (projeto dv)

**Projeto:** `fed-catalogo-compara-precos-dv`
**Arquivo:** [`firestore.rules`](../../firestore.rules)
**Quem roda:** o usuário (o projeto não usa Firebase Emulator Suite, então as regras
não têm teste automatizado).

## Antes de começar

1. `npm run deploy:rules:dev` (publica `firestore.rules` e `firestore.indexes.json` no dv).
2. Console do Firebase → projeto **dv** → Firestore Database → **Regras** →
   **Rules Playground**.
3. Para os cenários "autenticado", marque **Authenticated** e informe o `uid` indicado
   (qualquer texto serve: `uidA`, `uidB`). Para "anônimo", desmarque.
4. Os documentos não precisam existir: o Playground avalia a regra pelo caminho.

Marque cada linha quando o resultado bater com a coluna **Esperado**.

## Área privada do usuário

| # | Operação | Caminho | Auth (`uid`) | Esperado | OK |
|---|---|---|---|---|---|
| 1 | get | `/usuarios/uidA` | `uidA` | ✅ permitido | [ ] |
| 2 | get | `/usuarios/uidA` | `uidB` | ⛔ negado | [ ] |
| 3 | create/update | `/usuarios/uidA` | `uidA` | ⛔ negado | [ ] |
| 4 | get | `/usuarios/uidA/notas/41260903644587000836652100000168701620438547` | `uidA` | ✅ permitido | [ ] |
| 5 | list (query) | `/usuarios/uidA/notas` | `uidA` | ✅ permitido | [ ] |
| 6 | delete | `/usuarios/uidA/notas/4126…8547` | `uidA` | ✅ permitido | [ ] |
| 7 | get | `/usuarios/uidA/notas/4126…8547` | `uidB` | ⛔ negado | [ ] |
| 8 | list (query) | `/usuarios/uidA/notas` | `uidB` | ⛔ negado | [ ] |
| 9 | delete | `/usuarios/uidA/notas/4126…8547` | `uidB` | ⛔ negado | [ ] |
| 10 | create | `/usuarios/uidA/notas/4126…8547` | `uidA` | ⛔ negado (nota só pela callable) | [ ] |
| 11 | update | `/usuarios/uidA/notas/4126…8547` | `uidA` | ⛔ negado | [ ] |
| 12 | get | `/usuarios/uidA/pendentes/4126…8547` | `uidA` | ✅ permitido | [ ] |
| 13 | delete | `/usuarios/uidA/pendentes/4126…8547` | `uidA` | ✅ permitido | [ ] |
| 14 | get / delete | `/usuarios/uidA/pendentes/4126…8547` | `uidB` | ⛔ negado | [ ] |
| 15 | create / update | `/usuarios/uidA/pendentes/4126…8547` | `uidA` | ⛔ negado | [ ] |

## Base compartilhada (somente leitura)

| # | Operação | Caminho | Auth | Esperado | OK |
|---|---|---|---|---|---|
| 16 | get | `/produtos/ean:7894900011517` | `uidA` | ✅ permitido | [ ] |
| 17 | create / update / delete | `/produtos/ean:7894900011517` | `uidA` | ⛔ negado | [ ] |
| 18 | get | `/estabelecimentos/03644587000836` | `uidA` | ✅ permitido | [ ] |
| 19 | create / update / delete | `/estabelecimentos/03644587000836` | `uidA` | ⛔ negado | [ ] |
| 20 | get / list | `/precos/4126…8547_1` | `uidA` | ✅ permitido | [ ] |
| 21 | create / update / delete | `/precos/4126…8547_1` | `uidA` | ⛔ negado | [ ] |

## Anônimo não lê nada

| # | Operação | Caminho | Auth | Esperado | OK |
|---|---|---|---|---|---|
| 22 | get | `/produtos/ean:7894900011517` | anônimo | ⛔ negado | [ ] |
| 23 | get | `/precos/4126…8547_1` | anônimo | ⛔ negado | [ ] |
| 24 | get | `/estabelecimentos/03644587000836` | anônimo | ⛔ negado | [ ] |
| 25 | get | `/usuarios/uidA/notas/4126…8547` | anônimo | ⛔ negado | [ ] |

## Coleções só das Functions

| # | Operação | Caminho | Auth | Esperado | OK |
|---|---|---|---|---|---|
| 26 | get / create | `/nfceImportadas/4126…8547` | `uidA` | ⛔ negado | [ ] |
| 27 | get / create | `/previews/uidA_4126…8547` | `uidA` | ⛔ negado | [ ] |
| 28 | get / create | `/rateLimit/uidA` | `uidA` | ⛔ negado | [ ] |
| 29 | get | `/qualquerOutra/x` | `uidA` | ⛔ negado | [ ] |

## Consulta de grupo (Fase 6)

| # | Operação | Caminho | Auth | Esperado | OK |
|---|---|---|---|---|---|
| 30 | list (collection group) | `pendentes` | `uidA` | ⛔ negado (só a Function agendada consulta o grupo, pelo Admin SDK) | [ ] |

Resultado: ____ de 30 cenários conferidos em ___/___/2026.
