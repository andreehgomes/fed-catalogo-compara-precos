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

## Apelido do estabelecimento (privado)

| # | Operação | Caminho | Auth (`uid`) | Esperado | OK |
|---|---|---|---|---|---|
| 31 | get / list | `/usuarios/uidA/estabelecimentos/76189406000126` | `uidA` | ✅ permitido | [ ] |
| 32 | get / list | `/usuarios/uidA/estabelecimentos/76189406000126` | `uidB` | ⛔ negado | [ ] |
| 33 | create / update / delete | `/usuarios/uidA/estabelecimentos/76189406000126` | `uidA` | ⛔ negado (apelido só pela callable) | [ ] |

## Lista de compras (privada, gravada pelo cliente)

Nos cenários de create/update, cole o documento no campo **Document** do Playground. Base
válida da lista (`L`):

```json
{ "nome": "Compras de 30/09", "status": "aberta", "criadaEm": "2026-09-30T12:00:00.000Z",
  "atualizadaEm": "2026-09-30T12:00:00.000Z", "qtdItens": 1, "qtdMarcados": 0,
  "ultimaCompraEm": null, "notas": [], "pendentes": [] }
```

Base válida do item (`I`):

```json
{ "texto": "Leite integral", "grupo": null, "quantidade": 6, "unidade": "un", "base": "un",
  "origem": "manual", "ordem": 1, "marcado": false, "marcadoEm": null, "vinculo": null }
```

| # | Operação | Caminho | Auth (`uid`) | Documento | Esperado | OK |
|---|---|---|---|---|---|---|
| 34 | create | `/usuarios/uidA/listas/l1` | `uidA` | `L` | ✅ permitido | [ ] |
| 35 | create | `/usuarios/uidA/listas/l1/itens/i1` | `uidA` | `I` | ✅ permitido | [ ] |
| 36 | get / list / delete | `/usuarios/uidA/listas/l1` e `/itens/i1` | `uidA` | — | ✅ permitido | [ ] |
| 37 | get / list | `/usuarios/uidA/listas/l1` e `/itens/i1` | `uidB` | — | ⛔ negado | [ ] |
| 38 | create / update / delete | `/usuarios/uidA/listas/l1` e `/itens/i1` | `uidB` | `L` / `I` | ⛔ negado | [ ] |
| 39 | create | `/usuarios/uidA/listas/l1` | `uidA` | `L` + `"extra": 1` | ⛔ negado (campo extra) | [ ] |
| 40 | create | `/usuarios/uidA/listas/l1/itens/i1` | `uidA` | `I` com `texto` de 81 caracteres | ⛔ negado | [ ] |
| 41 | create | `/usuarios/uidA/listas/l1/itens/i1` | `uidA` | `I` com `"quantidade": 0` | ⛔ negado | [ ] |
| 42 | create | `/usuarios/uidA/listas/l1` | `uidA` | `L` com `"qtdItens": 151` | ⛔ negado | [ ] |
| 43 | create | `/usuarios/uidA/listas/l1` | `uidA` | `L` com `"qtdMarcados": 2` (maior que `qtdItens`) | ⛔ negado | [ ] |
| 44 | create | `/usuarios/uidA/listas/l1/itens/i1` | `uidA` | `I` com `vinculo.chave` de 43 dígitos (demais campos do vínculo válidos) | ⛔ negado | [ ] |
| 45 | create | `/usuarios/uidA/notas/4126…8547` | `uidA` | qualquer | ⛔ negado (continua só pela callable) | [ ] |

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

Resultado: ____ de 45 cenários conferidos em ___/___/2026.
