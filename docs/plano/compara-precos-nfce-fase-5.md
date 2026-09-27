# Fase 5: Preços da região (Menor Preço)

**Plano:** [índice](./compara-precos-nfce-plano.md)
**Pré-requisito:** [Fase 4](./compara-precos-nfce-fase-4.md)
**Próxima fase:** [Fase 6](./compara-precos-nfce-fase-6.md)
**Requisitos:** RF-24, RF-25, RF-26, RF-27 · RNF-31 a RNF-35

---

## Objetivo

A primeira funcionalidade de valor, **sem depender da SEFAZ**. Na tela "Preços perto
de mim", o usuário lê o código de barras de um produto (ou digita um texto) e vê os
mercados da região ordenados por preço, com dados do Menor Preço (Nota Paraná). A
fase também entrega o `<cp-scanner>`, que a Fase 7 reaproveita para o QR da nota.

Referência da API: análise, **seção 2.1**.

---

### Tarefa 5.1: Fixtures reais e confirmação dos parâmetros

**Arquivos a criar:** `src/testing/fixtures/menor-preco/*.json`,
`docs/analise/spike-menor-preco-AAAA-MM-DD.md`

**O que fazer:** um único levantamento manual com `curl` (sem automatizar
varredura; ver o risco 7 da análise) para:
1. Salvar como fixture: `/produtos` por `termo` (1ª e 2ª página, `offset=0` e `29`),
   por `gtin` (o da Coca-Cola, que traz os divergentes), uma busca com
   `total: 0`, e `/categorias`.
2. Descobrir no bundle do site (`main.*.bundle.js`) os **valores válidos de `data`
   e `ordem`**, isto é, os rótulos que o site mostra para cada valor.
3. Testar se `local` aceita geohash de **7** caracteres com o mesmo resultado que
   com 9 (RNF-35).
4. Registrar as conclusões no arquivo `spike-menor-preco-*.md` e atualizar a seção
   2.1 da análise.

**Critério:** fixtures salvas, sem dado pessoal (a API não devolve nenhum), e as
dúvidas de `data`, `ordem` e geohash de 7 respondidas por escrito.

---

### Tarefa 5.2: `MenorPrecoClient` (interface, schema, mapeamento e cache)

**Arquivos a criar:** `src/app/features/regiao/data-access/fonte-precos-regiao.ts`,
`menor-preco.schema.ts`, `menor-preco.client.ts`, `menor-preco.cache.ts` (+ specs)

**O que fazer:**
1. `npm i valibot`.
2. Interface de domínio, que não conhece o formato cru:

   ```ts
   export interface OfertaRegiao { descricao: string; gtin: string | null; valor: number;
     valorTabela: number; desconto: number; dataHora: Date; distanciaKm: number;
     estabelecimento: { nome: string; razaoSocial: string; endereco: string; bairro: string; municipio: string } }
   export interface ResultadoBusca { total: number; min: number | null; max: number | null; ofertas: OfertaRegiao[] }
   export abstract class FontePrecosRegiao {
     abstract porGtin(q: { gtin: string; local: string; raioKm: number; offset?: number }): Observable<ResultadoBusca>;
     abstract porTermo(q: { termo: string; categoria?: number; local: string; raioKm: number; offset?: number }): Observable<ResultadoBusca>;
     abstract categorias(q: { termo: string; local: string; raioKm: number }): Observable<{ id: number; desc: string; qtd: number }[]>;
   }
   ```

   Em `app.config.ts`: `{ provide: FontePrecosRegiao, useClass: MenorPrecoClient }`.
3. `menor-preco.schema.ts`: schema valibot **por item**. `valor` chega como string
   (`"1.67"`) e vira number. `gtin` `""` vira `null`. `nm_fan` vazio cai para
   `nm_emp`. Item inválido é **descartado e contado**, sem derrubar a página (RNF-34).
4. `MenorPrecoClient`: `HttpClient` com `timeout(10_000)`, **sem retry** (RNF-33).
   Erro de rede, HTTP ≠ 200 ou JSON sem `produtos` vira um `FonteIndisponivelError`
   tipado.
5. `menor-preco.cache.ts`: cache em memória + `sessionStorage` (com `try/catch`),
   chave `(tipo, gtin|termo|categoria, geohash[0..5], raio, offset)`, TTL de 30 min,
   com **deduplicação da requisição em voo** (`shareReplay` por chave).

**Critério:** specs com `HttpTestingController` e as fixtures da 5.1: mapeamento
correto, item com `gtin` vazio e `nm_fan` vazio, item inválido descartado, timeout
vira `FonteIndisponivelError`, e a segunda chamada idêntica não gera requisição.

---

### Tarefa 5.3: `<cp-scanner>` (câmera + imagem da galeria)

**Arquivos a criar:** `src/app/shared/ui/scanner/scanner.ts|html|scss`,
`scanner-engine.ts` (+ spec)

**O que fazer:**
1. `npm i barcode-detector` (polyfill da BarcodeDetector API sobre `zxing-wasm`).
2. `scanner-engine.ts` carrega **por `import()` dinâmico** e usa o `BarcodeDetector`
   nativo quando `'BarcodeDetector' in window` e o formato é suportado. Senão, usa o
   polyfill. Configurar o polyfill para servir o `.wasm` de `assets/`, não de CDN
   (copiar via `angular.json` → `assets`).
3. Componente com `formatos = input.required<('qr_code' | 'ean_13' | 'ean_8')[]>()`,
   `lido = output<string>()` e `cancelado = output<void>()`:
   - câmera traseira (`getUserMedia({ video: { facingMode: 'environment' } })`),
     detecção a cada ~250 ms via `requestAnimationFrame` com throttle, moldura
     guia, botão de lanterna quando `torch` for suportado;
   - botão **"Escolher imagem"** (`<input type="file" accept="image/*">`) que roda o
     mesmo detector sobre a imagem (RF-04);
   - para a câmera e libera o stream no `DestroyRef` e ao ler;
   - câmera negada ou inexistente gera uma mensagem clara e deixa a opção da imagem
     em destaque.
4. Uso sempre dentro de `@defer (on interaction)` na tela, para o chunk do scanner
   não entrar no bundle inicial (RNF-01).

**Critério:** no celular real, lê o EAN de um produto e o QR de um cupom. Uma imagem
da galeria com QR emite a URL. A aba da câmera some ao sair da tela (sem LED aceso).
O build mostra `barcode-detector`/`zxing` num chunk lazy.

---

### Tarefa 5.4: Localização

**Arquivos a criar:** `src/app/features/regiao/localizacao/localizacao.store.ts`,
`localizacao-seletor.ts`, `src/assets/data/municipios-pr.json`

**O que fazer:**
1. `municipios-pr.json`: os 399 municípios do PR com nome e centróide (lat/lng),
   gerado **uma vez** a partir da base pública do IBGE, com o script salvo em
   `scripts/`. Arquivo estático, carregado sob demanda.
2. `LocalizacaoStore`: `origem = signal<'gps' | 'municipio' | null>`,
   `geohash = signal<string | null>` (**7 caracteres**, RNF-35) e `raioKm = signal(2)`.
   Persistir **só** o município escolhido e o raio em `localStorage` (com try/catch).
   **Nunca** coordenadas.
3. `localizacao-seletor`: explica que a busca usa o serviço Menor Preço do Governo do
   PR, oferece "Usar minha localização" (`navigator.geolocation.getCurrentPosition`,
   `maximumAge` de 5 min) ou "Escolher cidade" (autocomplete sobre o JSON) e o raio
   1/2/5/10 km (`cp-segmented`).

> A análise previa "cidade/bairro". O plano entrega **cidade**, porque bairro exigiria
> uma base de bairros com coordenadas. Registrar como discrepância na execução.

**Critério:** negar a permissão leva ao seletor de cidade. Após escolher Curitiba, o
geohash tem 7 caracteres. Nenhuma coordenada aparece em `localStorage`.

---

### Tarefa 5.5: Tela "Preços perto de mim"

**Arquivos a criar:** `src/app/features/regiao/busca-regiao.page.ts|html|scss`,
`regiao.store.ts`

**O que fazer:**
1. Rota `/regiao` com query params `gtin` | `termo` + `categoria`, que são a fonte
   de verdade do estado (`input()` ligados por `withComponentInputBinding()`).
2. Campo de busca (Signal Forms) com **debounce de 400 ms** e botão "Ler código de
   barras" (`<cp-scanner [formatos]="['ean_13','ean_8']">`). Um termo só de dígitos
   com GTIN válido vira busca por `gtin`.
3. Chips de categoria (`/categorias`) quando a busca for por texto.
4. Lista com `rxResource` (`params` = termo/gtin + geohash + raio), resumo "N ofertas ·
   de R$ X a R$ Y", e cada linha com preço, desconto riscado quando houver,
   estabelecimento, bairro, distância, "há N dias" e `<cp-fonte-preco
   fonte="menor-preco">`.
5. **Paginação infinita** por `offset` de 29 em 29, com `IntersectionObserver` num
   sentinela (evitar repetição por `id` da oferta) e no máximo 1 requisição em voo.
6. Estados: sem localização (mostra o seletor), carregando (skeleton), vazio
   (`cp-empty-state`) e **"Menor Preço indisponível agora"** com botão "Tentar de
   novo" manual.

**Critério:** buscar "leite integral" em Curitiba com raio 2 km lista ofertas,
pagina sem repetir e filtra por categoria. Com a API bloqueada (DevTools → block
request), aparece o estado de indisponível e a navegação do app segue normal.

---

### Tarefa 5.6: Resultado por código de barras com divergentes

**Arquivo a criar:** `src/app/features/regiao/resultado-gtin/resultado-gtin.ts|html`

**O que fazer:** quando a busca for por GTIN, aplicar `separarDivergentes` (Fase 3.5)
sobre as ofertas carregadas. Mostrar os **coerentes ordenados por preço**, com
destaque para o menor (`<cp-badge-preco>`), e um botão "Mostrar N resultados com
descrição diferente" que expande os divergentes com um aviso curto de que o mercado
pode ter cadastrado o código errado (RF-27).

**Critério:** com a fixture da Coca-Cola, "AGUA", "AGUA C GAS" e "CAFE VIAGEM" ficam
ocultos por padrão, e o menor preço exibido é o da Coca-Cola.

---

## Critérios de Aceitação da Fase

- [ ] Ler um EAN na prateleira mostra, em até 3s, os mercados num raio de 2 km ordenados por preço.
- [ ] Divergentes ocultos por padrão e acessíveis por um toque.
- [ ] Busca por texto pagina de 29 em 29 sem repetir e respeita a categoria.
- [ ] Repetir a busca em 30 min não gera requisição (aba Network).
- [ ] API bloqueada gera o estado "indisponível", sem retry em loop e sem quebrar o app.
- [ ] Negar a geolocalização leva à escolha de cidade; nenhuma coordenada em storage nem no Firestore.
- [ ] Scanner e WASM num chunk lazy; câmera liberada ao sair da tela.
- [ ] Specs do `MenorPrecoClient` verdes com as fixtures reais.
