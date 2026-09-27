# Execução: Fase 3 — Domínio puro (`shared/`)

**Data:** 2026-09-27
**Plano:** docs/plano/compara-precos-nfce-fase-3.md (via `compara-precos-nfce-executar-tudo.md`)
**Branch:** main
**Executor:** Claude Code

---

## Resumo

Regra de negócio sem rede nem framework em `shared/`: modelos do Firestore e das
callables, chave de acesso e URL do QR, GTIN, normalização de descrição, conteúdo e
preço por unidade, similaridade (Jaccard, divergentes, mesmo estabelecimento) e
geohash. 95 testes novos; cobertura de `shared/` em 100% (o relatório `text` omite os
arquivos com 100%).

---

## Tarefas Executadas

| Fase | Tarefa | Status | Observações |
|------|--------|--------|-------------|
| 3.1 | Modelos | ✅ | `ChaveInfo`, `QrNfce`, `ItemNfce`, `NfceParsed`, `Nota`, `NotaResumo`, `Pendente`, `Estabelecimento`, `Produto`, `Preco`, `ErroImportacao` (união discriminada) e contratos das callables. Nenhum campo de CPF |
| 3.2 | Chave e URL do QR | ✅ | `validarChave`, `extrairChave`, `lerUrlQr` (v2/v3, `|`/`%7C`, http/https, host e caminho da allowlist), `montarUrlQr`, `montarUrlQrV3`, `formatarChave`, `formatarCnpj`. 100% de cobertura |
| 3.3 | GTIN | ✅ | `normalizarGtin` (8/12/13/14, DV GS1, zeros, "SEM GTIN") e `produtoIdDe` |
| 3.4 | Normalização e unidade | ✅ | `normalizarDescricao` (tabela explícita de abreviações), `tokens`, `tokensSemMedida`, `extrairConteudo`, `precoPorUnidadeBase`. 27 descrições na tabela de conteúdo + 10 na de normalização |
| 3.5 | Similaridade | ✅ | `jaccard`, `descricaoDominante`, `separarDivergentes`, `mesmoEstabelecimento`. Caso real da Coca-Cola separa "AGUA", "AGUA C GAS" e "CAFE VIAGEM" |
| 3.6 | Geohash | ✅ | `encodeGeohash(lat, lng, 7)`; Curitiba começa com `6gkz` |

---

## Discrepâncias do Plano

- **Descrição dominante (RF-27).** Com os 5 itens reais, "AGUA" e "COCA" empatam em
  frequência (2 cada), então "tokens mais frequentes" não decide. A regra
  implementada: a semente é o token em mais itens e, no empate, o que co-ocorre com
  mais tokens distintos; a descrição dominante são os tokens presentes em ≥ metade
  dos itens que contêm a semente. Tokens com dígito (medidas) ficam fora da
  comparação. A similaridade continua sendo Jaccard com limiar 0,3.
- **GTIN canônico:** GTIN-12 e GTIN-14 com zero à esquerda viram GTIN-13, para o
  mesmo produto ter um só `ean:`.
- **`lerUrlQr` exige DV válido e UF da chave igual à do host**, além do host e
  caminho da allowlist. URL com DV errado devolve `null`.
- **Datas** no modelo são ISO 8601 UTC (`DataIso`), para ordenar como texto no
  Firestore sem depender do `Timestamp` em `shared/`.
- **Abreviações ambíguas** (`LT` = lata ou litro, `PC` = pacote ou peça) ficaram
  fora da tabela de normalização; `LT` é tratado como litro em `extrairConteudo`.
- `ErroImportacao` ganhou `chave-sem-qr`, `preview-expirado`, `nao-autenticado` e
  `desconhecido`, usados pelas Fases 6 e 7.
- `<cp-fonte-preco>` passou a usar o tipo `FontePreco` de `@shared/model`.

---

## Análise de Lint

```
npm run lint → All files pass linting.
```

## Verificações

```
npm run test:ci → 9 arquivos, 109 testes verdes; cobertura total 98,44% (shared/ 100%)
ng build -c production → initial 232.45 kB, sem aviso de budget
grep "from '[^.]" shared/ → nenhum import externo
```

## Boas Práticas Angular 20

| Critério | Status |
|----------|--------|
| OnPush em todos os componentes | ✅ |
| inject() sem construtor | ✅ |
| takeUntilDestroyed() | ✅ (n/a) |
| trackBy/track em @for | ✅ (n/a) |
| loading="lazy" em imagens | ✅ (n/a) |
| Sem any implícito | ✅ |

---

## Critérios de Aceitação

- ✅ `shared/` sem nenhum import de Angular, Firebase ou npm.
- ✅ Cobertura ≥ 80% em `shared/` (100% em `chave-acesso.ts`).
- ✅ As chaves e URLs reais do spike estão nos testes.
- ✅ O caso real da Coca-Cola separa os divergentes corretamente.
- ✅ `shared/index.ts` exporta o que o app e as Functions vão usar.

---

## Arquivos Criados/Modificados

```
shared/model.ts chave-acesso.ts gtin.ts normalizar.ts unidade.ts similaridade.ts geohash.ts index.ts
shared/chave-acesso.spec.ts gtin.spec.ts normalizar.spec.ts similaridade.spec.ts
src/app/shared/ui/fonte-preco/fonte-preco.ts
```
