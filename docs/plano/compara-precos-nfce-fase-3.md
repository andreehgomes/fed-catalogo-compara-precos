# Fase 3: Domínio puro (`shared/`)

**Plano:** [índice](./compara-precos-nfce-plano.md)
**Pré-requisito:** [Fase 1](./compara-precos-nfce-fase-1.md) (Tarefa 1.4)
**Próxima fase:** [Fase 4](./compara-precos-nfce-fase-4.md)

---

## Objetivo

Toda a regra de negócio que não depende de rede nem de framework, em TypeScript
puro, com cobertura ≥ 80%. O front e as Functions consomem os mesmos arquivos, e
eles são a base para validar a chave antes de chamar a function, identificar
produtos, comparar descrições e montar o geohash.

Cada arquivo tem um `*.spec.ts` ao lado. Sem Angular, sem Firebase e sem
dependências npm.

---

### Tarefa 3.1: Modelos

**Arquivo a criar:** `shared/model.ts`

**O que fazer:** tipos (só `interface`/`type`, sem classes) que espelham o modelo
Firestore da análise (seção 5.3) e o contrato das callables:

```ts
export type Uf = 'PR';
export interface ChaveInfo { chave: string; uf: Uf | string; cUf: string; anoMes: string;
  cnpj: string; modelo: '65' | '55' | string; serie: string; numero: string; tpEmis: string }
export interface ItemNfce { n: number; descricao: string; codigo: string; ean: string | null;
  qtd: number; unidade: string; vlUnit: number; vlTotal: number }
export interface NfceParsed { chave: string; emitente: { cnpj: string; nome: string;
  fantasia?: string; endereco: string; cidade: string; uf: string };
  emissao: string /* ISO */; itens: ItemNfce[]; total: number; desconto: number }
export type ProdutoId = `ean:${string}` | `loc:${string}:${string}`;
export type FontePreco = 'minhas-notas' | 'comunidade' | 'menor-preco';
export type StatusPendente = 'aguardando' | 'falhou';
// Nota, NotaResumo, Produto, Estabelecimento, Preco, Pendente, ErroImportacao…
```

`ErroImportacao` é uma **união discriminada** (`codigo: 'url-invalida' |
'uf-nao-suportada' | 'chave-invalida' | 'nao-encontrada' | 'cancelada' |
'sefaz-indisponivel' | 'layout-inesperado' | 'rate-limit' | 'ja-importada'`), usada
pelo front para montar as mensagens do RF-10.

**Critério:** compila em `strict`. Nenhum campo de CPF existe em nenhum tipo (RNF-24).

---

### Tarefa 3.2: Chave de acesso e URL do QR

**Arquivo a criar:** `shared/chave-acesso.ts`

**O que fazer:**
- `validarChave(chave): boolean`: 44 dígitos, com DV módulo 11 (pesos 2–9 da
  direita para a esquerda; resto < 2 → DV 0).
- `extrairChave(chave): ChaveInfo` (cUF `41` → `'PR'`).
- `lerUrlQr(url): { chave, versao, tpAmb, uf } | null`: aceita `p=` com `|` cru ou
  `%7C`, http ou https, e os formatos v2 (`chave|2|amb|id|hash`) e v3
  (`chave|3|amb`). Devolve `null` para qualquer outra coisa.
- `montarUrlQrV3(chave, tpAmb = 1)`: `https://www.fazenda.pr.gov.br/nfce/qrcode?p=<chave>|3|<amb>`.

**Testes obrigatórios:** as duas chaves reais do spike de 27/09/2026
(`41260903644587000836652100000168701620438547`, DV 7, e
`41260803644587000836652030000088681310226239`, DV 9), uma com o DV trocado, 43 e
45 dígitos, as URLs reais em v2 com `|` e com `%7C`, e uma URL de outro host
(retorna `null`).

**Critério:** cobertura 100% neste arquivo.

---

### Tarefa 3.3: GTIN

**Arquivo a criar:** `shared/gtin.ts`

**O que fazer:** `normalizarGtin(raw): string | null`. Remove não dígitos, trata
`"SEM GTIN"` e vazio como `null`, aceita 8/12/13/14 dígitos com DV válido (módulo
10 GS1) e rejeita sequências de zeros. `produtoIdDe(ean, cnpj, codigo): ProdutoId`
aplica a regra do RF-17.

**Critério:** testes com EAN-13 válido (`7894900011517`), inválido, "SEM GTIN",
EAN-8 e GTIN-14.

---

### Tarefa 3.4: Normalização de descrição e unidade

**Arquivos a criar:** `shared/normalizar.ts`, `shared/unidade.ts`

**O que fazer:**
- `normalizarDescricao(s)`: maiúsculas, sem acento (`NFD` + remoção de marcas), sem
  pontuação, espaços colapsados e abreviações comuns expandidas por tabela pequena
  e explícita (`INT`→`INTEGRAL`, `DESN`→`DESNATADO`, `UHT`, `PCT`→`PACOTE`,
  `REF`→`REFRIGERANTE`…). Nada de heurística genérica.
- `tokens(s): string[]`: tokens únicos da descrição normalizada, sem stopwords
  (`DE`, `DA`, `C/`…), para `array-contains` no Firestore.
- `extrairConteudo(descricao): { quantidade: number; unidadeBase: 'kg' | 'L' | 'un' } | null`:
  reconhece `500G`, `1KG`, `2L`, `350ML`, `1,5L`, `12UN`, `C/6`, `6X1L`.
- `precoPorUnidadeBase(vlUnit, unidadeNota, conteudo)`: combina a unidade do item
  (`KG` vendido a granel × `UN` embalado) com o conteúdo da descrição (RF-19).

**Critério:** tabela de casos com ≥ 25 descrições reais de cupom (usar as do Menor
Preço salvas na Fase 5 quando existirem; até lá, exemplos escritos à mão).

---

### Tarefa 3.5: Similaridade

**Arquivo a criar:** `shared/similaridade.ts`

**O que fazer:**
- `jaccard(a: string[], b: string[]): number`.
- `separarDivergentes<T>(itens: T[], descricao: (t: T) => string, limiar = 0.3)`:
  calcula a **descrição dominante** (tokens mais frequentes no grupo) e devolve
  `{ coerentes, divergentes }` (RF-27).
- `mesmoEstabelecimento(a, b)`: razão social + logradouro + número normalizados,
  para casar um estabelecimento do Menor Preço com um CNPJ das notas.

**Critério:** com os 5 itens reais da busca pelo GTIN da Coca-Cola ("AGUA", "AGUA C
GAS", "CAFE VIAGEM", "COCA LATA 350ML NORMAL", "COCA COLA PET 2L"), as três
primeiras saem como divergentes.

---

### Tarefa 3.6: Geohash

**Arquivo a criar:** `shared/geohash.ts`

**O que fazer:** `encodeGeohash(lat, lng, precisao = 7)` (base32 padrão, ~20
linhas, sem lib). **Não** implementar decode nem vizinhos, porque nada usa.

**Critério:** `encodeGeohash(-25.4284, -49.2733, 9)` (Curitiba) começa com `6gkz`, e
`precisao` 7 devolve 7 caracteres.

---

## Critérios de Aceitação da Fase

- [ ] `shared/` sem nenhum import de Angular, Firebase ou npm.
- [ ] Cobertura ≥ 80% em `shared/` (100% em `chave-acesso.ts`).
- [ ] As chaves e URLs reais do spike estão nos testes.
- [ ] O caso real da Coca-Cola separa os divergentes corretamente.
- [ ] `shared/index.ts` exporta o que o app e as Functions vão usar.
