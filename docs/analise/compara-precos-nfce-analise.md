# Análise: Compara Preços: importação de NFC-e e comparação entre mercados

**Data:** 27/09/2026
**Projeto:** fed-catalogo-compara-precos (projeto novo, pasta vazia)
**Escopo:** app Angular 22 para importar a NFC-e de compras de supermercado,
inicialmente do **Paraná**, a partir do QR Code do cupom. O app extrai o
estabelecimento, os produtos, o código/EAN e os preços, guarda as notas de forma
**isolada por usuário** e alimenta uma **base de preços compartilhada** para
comparar o mesmo produto entre estabelecimentos. Uma **segunda fonte de preços**
complementa essa base: a API pública do **Menor Preço (Nota Paraná)**, que traz
preços em tempo real de todo o PR, com busca por código de barras e por texto perto
do usuário. O backend roda em Firebase Functions, com Firestore e Firebase Auth. O
design system repete a estrutura do `fed-catalogo-confeccoes` com paleta verde
própria.

> **Revisão 27/09/2026 (tarde):** entraram o Menor Preço como fonte (seção 2.1,
> RF-24 a RF-29 e RNF-31 a RNF-35), a avaliação dos web services SOAP da
> SEFAZ-PR (seção 1.3) e o spike de indisponibilidade do portal (seção 6.1).

---

## 1. Contexto

### 1.1 Estado do projeto

A pasta `fed-catalogo-compara-precos` está **vazia**: não há `package.json`,
`CLAUDE.md`, rotas nem serviços. Tudo nesta análise é **a criar**. As referências
vêm de dois lugares:

- **Projeto irmão `fed-catalogo-confeccoes`** (Angular 20, NgModules, Realtime DB,
  `@angular/fire`), de onde vem o **design system**:
  - `src/app/shared/style/_tokens.scss`: tokens `$ep-*` (acento, casca, superfícies,
    rampa de texto, semânticas, raios, sombras, layout);
  - `src/styles.scss`: classes globais `.ep-page`, `.ep-block`, `.ep-card`,
    `.ep-field`, `.ep-btn-*`, `.ep-list`, `.ep-empty-state`, `.ep-summary`…;
  - `src/app/shared/style/_admin-ui.scss`: mixins parametrizados (`ep-grid`,
    `ep-chip`, `ep-progress`, `ep-segmented`…);
  - `_breakpoints.scss`: `mobile` (≤599), `tablet-up`, `desktop` (≥1024);
  - shell com sidebar em **rail de 76px**, expandida de 264px e **drawer abaixo de 900px**,
    header sticky e scroll interno em `.ep-content`;
  - Instrument Sans, Material Symbols Rounded e tema Material **M3** (`mat.theme`).
  - A lição documentada em `docs/execucao/2026-09-11-redesign-como-repetir.md`
    vale aqui: **classes globais desde o dia 1, mixin só para o que é
    parametrizado**. Mixin expandido por componente estoura o budget
    `anyComponentStyle`.
- **Pesquisa sobre a fonte de dados** (feita nesta sessão; ver seção 2).

### 1.2 O que muda em relação ao confeccoes

| Tema | confeccoes | compara-precos |
|---|---|---|
| Angular | 20, NgModules, `zone.js` | **22.2** (latest em 27/09/2026): standalone, **zoneless** e **OnPush** por padrão |
| Estado | `BehaviorSubject` em service | **signals** (`signal`, `computed`, `linkedSignal`, `resource`) |
| Formulários | Reactive Forms | **Signal Forms** (estáveis no v22) |
| Templates | `*ngIf`/`*ngFor` | control flow `@if`/`@for`/`@defer` |
| DI | construtor | `inject()` |
| Testes | Karma + Jasmine | **Vitest** (padrão do CLI v22) + Playwright no e2e |
| Build | `browser` builder (webpack) | `application` builder (esbuild) |
| Firebase | `@angular/fire` 20 | **SDK modular direto** (ver 6.2: `@angular/fire` 20.1 só aceita `@angular/core ^20`) |
| Banco | Realtime DB | **Firestore** |
| Backend | nenhum | **Cloud Functions v2** (Node 22) |
| Prefixo DS | `$ep-` / `.ep-*` | **`$cp-` / `.cp-*`** (Compara Preços) |

### 1.3 NF-e × NFC-e (premissa do domínio)

O cupom de supermercado é **NFC-e (modelo 65)**. Não existe API pública do governo
que devolva a nota a partir do número:

- **NFeDistribuicaoDFe** atende só quem aparece na nota (emitente, destinatário
  ou autorizado), exige certificado ICP-Brasil do mesmo CPF/CNPJ e se limita a
  90 dias. **Não serve.**
- O **QR Code do cupom** aponta para uma **página HTML pública** da SEFAZ do estado.
  É essa página que o backend vai ler (scraping).
- Os **web services SOAP da NFC-e do PR**
  ([sped.fazenda.pr.gov.br/NFCe/Pagina/Web-Services-NFC-e](https://sped.fazenda.pr.gov.br/NFCe/Pagina/Web-Services-NFC-e),
  produção em `https://nfce.sefa.pr.gov.br/nfce/*4?wsdl`) são para o
  **emissor**: autorização, inutilização, eventos, status e cadastro. O único
  de consulta, `NFeConsultaProtocolo4`:
  - exige **certificado ICP-Brasil em mTLS**. Testado em 27/09/2026: sem
    certificado, o handshake TLS falha antes de qualquer resposta HTTP;
  - devolve só **situação e protocolo** (autorizada, cancelada, denegada) e os
    eventos. **Não devolve os itens.**

  **Fora do MVP.** Pode entrar no futuro para marcar notas canceladas, se houver
  um certificado A1 disponível no backend.

---

## 2. Dados Disponíveis

| Fonte | Tipo | Conteúdo | Observações |
|---|---|---|---|
| QR Code do cupom (NFC-e PR) | URL `http(s)://www.fazenda.pr.gov.br/nfce/qrcode?p=...` | **v2:** `p = chave(44)\|2\|tpAmb\|cIdToken\|hash` (hash SHA-1 com o **CSC**). **v3** (NT 2025.001, em produção desde 01/09/2025): consulta online `p = chave(44)\|3\|tpAmb`, **sem hash** | Os cupons reais do usuário (08 e 09/2026) ainda vêm em **v2**. Se o portal aceitar v3, **dá para montar a URL só com a chave** (RF-06). Isso foi testado em 27/09/2026, mas o portal estava fora do ar (ver 6.1) |
| Página de consulta SEFAZ-PR | HTML público (layout padrão NFC-e, como SVRS) | Emitente (razão social, CNPJ, endereço), itens (descrição, **código**, qtde, unidade, vl. unitário, vl. total), totais, forma de pagamento, nº/série, emissão, chave, protocolo | Sem API. O layout pode mudar sem aviso. **O EAN geralmente não aparece na aba resumida**: o "Código" costuma ser o código interno (`cProd`). Validar com cupom real (spike, seção 6) |
| Chave de acesso (44 dígitos) | Texto | cUF (2), AAMM (4), CNPJ (14), modelo (2), série (3), nº (9), tpEmis (1), código (8), DV (1) | Dá para **validar localmente** (DV módulo 11) e extrair UF, CNPJ e data sem rede. A consulta **só por chave** no portal PR costuma exigir captcha, então fica fora do fluxo automatizado |
| **API Menor Preço (Nota Paraná)** | REST/JSON público, sem login | Preço praticado por produto e estabelecimento em todo o PR, vindo das notas emitidas | Ver **2.1**. Não é documentada nem oficial. Não busca nota por chave |
| `NFeConsultaProtocolo4` (SOAP SEFAZ-PR) | SOAP + mTLS ICP-Brasil | Situação e protocolo da nota | Sem itens. **Fora do MVP** (ver 1.3) |
| APIs pagas (Infosimples "NFC-e Unificada", Qive…) | REST/JSON | Mesmos dados, vários estados | **Fora do escopo agora** (decisão: "algo próprio"). Plano B para outras UFs. Também dependem do portal da SEFAZ, então **caem junto** com ele |
| Firebase Auth | SDK | uid, e-mail | A criar |
| Firestore | Banco | ver modelo em 5.3 | A criar |
| Design system confeccoes | SCSS | tokens, classes, mixins, shell | Portar a **estrutura** e trocar os **valores** |

Projetos de referência open source que leem o QR do PR (úteis para comparar
seletores): `leonichel/nfce-scraper`, `brunopenso/python-nfce-get`,
`Flavio-Braga/qrcodemercado`.

### 2.1 API Menor Preço (levantada em 27/09/2026)

Base: `https://menorpreco.notaparana.pr.gov.br/api/v1`. Os endpoints foram
extraídos do bundle do site oficial e testados sem autenticação.

| Endpoint | Parâmetros | Retorno |
|---|---|---|
| `GET /produtos` | `local` (**geohash**, ex.: `6gkzwgjzn`), `termo` (texto), `gtin`, `categoria`, `raio` (km), `data` (período; `-1` = qualquer), `ordem`, `offset`, `valor_min`/`valor_max` | `{ tempo, local, total, precos: {min, max}, produtos: [...] }`, com **29 itens por página** |
| `GET /categorias` | `local`, `termo`, `raio`, `data` | `{ categorias: [{ id, qtd, desc }] }` |
| `GET /produtos/{id}` | id opaco do item | detalhe do item |
| `/listas/*`, `/favoritos/*` | exigem login do Nota Paraná | **não usar** |

Cada item de `produtos[]` traz:
`id`, `desc`, `gtin`, `ncm`, `valor`, `valor_tabela`, `valor_desconto`,
`datahora` (ISO), `distkm`, `nrdoc` (nº da nota) e `estabelecimento { codigo
(opaco, não é CNPJ), nm_fan, nm_emp, tp_logr, nm_logr, nr_logr, bairro, mun, uf }`.

**Observações medidas:**
- **CORS aberto** (`access-control-allow-origin: *`): o front pode chamar direto.
- Busca por `gtin=7894900011517` (Coca-Cola) num raio de 20 km: **310 resultados**,
  de R$ 4,50 a R$ 59,90. Vieram itens com descrição incompatível ("AGUA", "CAFE
  VIAGEM"), porque o mercado cadastrou o GTIN errado. **O dado é sujo e precisa de
  filtro.**
- `gtin` vazio é comum mesmo em produtos industrializados.
- `nm_fan` às vezes vem vazio. Nesse caso, usar `nm_emp`.
- O estabelecimento não traz CNPJ. Para casar com `estabelecimentos/{cnpj}` das
  notas, é preciso comparar razão social + endereço normalizados.

---

## 3. Requisitos Funcionais

**Conta**
- **RF-01:** cadastro, login e logout com e-mail/senha (Firebase Auth), mais
  redefinição de senha. Login com Google é opcional.
- **RF-02:** as rotas do app (fora login, cadastro e redefinição) exigem usuário
  autenticado (guard funcional).

**Importação de nota**
- **RF-03:** ler o **QR Code** do cupom pela câmera do celular.
- **RF-04:** importar a partir de uma **foto/imagem** do cupom (galeria), decodificando
  o QR na imagem.
- **RF-05:** **colar a URL** do QR (ex.: vinda de outro leitor).
- **RF-06:** aceitar a **chave de 44 dígitos** digitada: validar o DV e identificar
  UF, CNPJ e mês. O backend monta a URL no formato **v3 online**
  (`p=chave|3|1`). Se o portal PR recusar v3 para notas emitidas em v2, o app
  informa isso e pede o QR. Validar no spike (6.1).
- **Fora do escopo (decisão de 27/09/2026): ler os itens por foto/OCR do cupom
  impresso.** O cupom é pequeno, a foto sai ruim e o resultado sujaria a base
  compartilhada. A **única fonte dos itens é a página da SEFAZ** acessada pelo QR.
  Com o portal fora do ar, a nota espera na fila do RF-10a. O RF-04 continua
  valendo porque ali só se decodifica o **QR Code** contido na imagem, não o
  texto do cupom.
- **RF-07:** o backend busca a página da SEFAZ-PR, extrai os dados e devolve uma
  **pré-visualização** (estabelecimento, data, itens, total) antes de gravar.
- **RF-08:** ao confirmar, o backend grava a nota na área do usuário e publica
  os preços na base compartilhada.
- **RF-09:** **deduplicação**. Se o mesmo usuário importar a mesma chave de novo, o
  app avisa e abre a nota existente. Se **outro** usuário importar uma chave já
  importada, ele recebe a nota na própria área, mas os preços **não** são
  publicados de novo na base compartilhada.
- **RF-10:** mensagens de erro específicas para: URL não reconhecida, UF sem
  suporte ainda, nota não encontrada/cancelada, portal fora do ar e layout
  inesperado (falha de parsing). Neste último caso, registrar o HTML para
  diagnóstico.
- **RF-10a:** **fila de notas aguardando a SEFAZ**. Quando o portal estiver
  indisponível (erro 5xx, timeout ou página de erro conhecida, como
  "QRCode mal formatado" para uma URL cuja chave tem DV válido), a nota **não é
  descartada**. Ela vai para `usuarios/{uid}/pendentes/{chave}`, guardando a URL
  original, com status visível ("Aguardando SEFAZ-PR") na lista de notas. Uma
  function agendada tenta de novo com backoff (15 min → 1 h → 6 h → 24 h, por até
  7 dias). Ao conseguir, a nota é importada e publicada, e o usuário é avisado.
  Depois de 7 dias, a nota fica como "falhou", com opção de tentar de novo
  manualmente ou excluir.

**Minhas notas (isoladas por usuário)**
- **RF-11:** listar as notas do usuário, com estabelecimento, data, total e nº
  de itens, ordenadas por data e com filtro por estabelecimento e período.
- **RF-12:** detalhe da nota com itens, quantidades, unitário e total, além de um
  indicador por item de "mais barato em outro lugar" quando houver.
- **RF-13:** excluir uma nota da própria área. A exclusão **não** remove os preços já
  publicados, que são anônimos.

**Produtos e comparação (compartilhado)**
- **RF-14:** busca de produto por **descrição** e por **EAN** (digitado ou lido pela
  câmera com leitor de código de barras).
- **RF-15:** página do produto com **menor, médio e maior preço** e, por
  estabelecimento, o último preço observado e sua data.
- **RF-16:** histórico de preço do produto em gráfico simples (preço × data) por
  estabelecimento.
- **RF-17:** **identificação do produto**. Com EAN válido (GTIN-8/12/13/14, DV
  conferido), a identidade é o EAN. Sem EAN ("SEM GTIN"), a identidade provisória é
  `CNPJ + código interno`, com descrição normalizada (maiúsculas, sem acento,
  unidades padronizadas).
- **RF-18:** o usuário pode **vincular** manualmente um produto sem EAN a um produto
  com EAN ou a outro produto equivalente, por exemplo "LEITE UHT INT 1L" do mercado A
  e o do mercado B. O vínculo vale para a base compartilhada.
- **RF-19:** preços comparáveis por **unidade de medida** (R$/kg, R$/L, R$/un).
  O app extrai conteúdo e unidade da descrição quando possível (ex.: "500G", "2L").

**Estabelecimentos**
- **RF-20:** lista de estabelecimentos (CNPJ, nome, endereço, cidade) criada
  automaticamente a partir das notas.
- **RF-21:** detalhe do estabelecimento com os produtos mais recentes e seus preços.

**Lista de compras (evolução; pode ficar para uma fase posterior)**
- **RF-22:** montar uma lista de produtos e ver **em qual estabelecimento a cesta
  sai mais barata**, considerando só produtos com preço recente (ex.: ≤ 60 dias).

**Preços da região (Menor Preço)**
- **RF-24:** a **localização** do usuário vem da geolocalização do navegador (com
  permissão) ou, sem permissão, de uma cidade/bairro escolhido. O app converte em
  **geohash** e envia como `local`. O raio é configurável (1, 2, 5 ou 10 km; padrão
  2 km). A localização fica **só no aparelho** (ver RNF-35).
- **RF-25:** **buscar preço por código de barras**, lendo o EAN pela câmera ou
  digitando. O app mostra os estabelecimentos da região ordenados por preço, com
  valor, desconto, distância, "há N dias" e endereço, além de mínimo e máximo.
- **RF-26:** **buscar por texto** ("leite integral 1l"), com filtro por categoria
  (`/categorias`) e paginação infinita (29 por página, via `offset`).
- **RF-27:** **filtro de sujeira no GTIN**. Numa busca por EAN, os resultados cuja
  descrição não tem semelhança mínima com a descrição dominante do grupo (tokens
  normalizados, ex.: Jaccard < 0,3) ficam ocultos por padrão, atrás de um "mostrar
  N resultados divergentes".
- **RF-28:** **"Tem mais barato perto?"** No detalhe de uma nota importada (RF-12),
  cada item com EAN consulta o Menor Preço e mostra quanto teria custado no mais
  barato da região e onde. O painel (RF-23) soma essa economia potencial. As
  consultas são feitas sob demanda e ficam em cache (RNF-32).
- **RF-29:** a **lista de compras** (RF-22) usa o Menor Preço como fonte principal
  para montar a cesta mais barata da região. A base própria entra como complemento.
- **Fonte sempre identificada:** todo preço exibido mostra a origem ("Suas notas",
  "Comunidade" ou "Menor Preço – Nota Paraná") e a data da observação.

**Painel**
- **RF-23:** tela inicial com o total gasto no mês, as últimas notas, a economia
  potencial ("você pagou R$ X a mais do que o menor preço conhecido") e um atalho
  "Importar nota".

---

## 4. Requisitos Não Funcionais

**Desempenho**
- **RNF-01:** todas as features em rotas **lazy** (`loadComponent`/`loadChildren`).
  O leitor de QR (lib WASM) e o gráfico entram por `@defer` ou `import()` dinâmico
  e **não** vão para o bundle inicial.
- **RNF-02:** budgets no `angular.json`: `initial` com aviso em 500kb e erro em 1mb.
  `anyComponentStyle` com aviso em 6kb e erro em 10kb (mesmos do confeccoes). Medir
  no **build**, nunca pelo tamanho do arquivo-fonte.
- **RNF-03:** consultas no Firestore sempre **paginadas** (`limit` + cursor) e
  cobertas por índice composto declarado em `firestore.indexes.json`.
- **RNF-04:** a importação (fetch + parse + gravação) completa em até **8s** no p95.
  Timeout de 15s no fetch da SEFAZ, com retry exponencial (1 tentativa extra).

**Responsividade**
- **RNF-05:** **mobile-first**, porque o uso principal é no mercado, com o celular.
  Breakpoints do DS: mobile ≤599, tablet 600–1023, desktop ≥1024. O shell vira drawer
  abaixo de 900px. No celular, a ação "Importar nota" fica sempre acessível (FAB ou
  item fixo na barra inferior).
- **RNF-06:** breakpoints em TypeScript via `matchMedia`/`BreakpointObserver` (CDK).
  **Nunca** `window.innerWidth` (lição do confeccoes).

**Acessibilidade**
- **RNF-07:** WCAG 2.2 AA. Contraste ≥ 4.5:1 para texto, validado para **cada token**
  da nova paleta verde (o verde é traiçoeiro em contraste sobre branco). Foco visível
  e navegação por teclado no shell e nas listas.
- **RNF-08:** campos com `<label>` + `<input>` (padrão do DS), para funcionar com
  leitores de tela e com `getByLabel()` do Playwright. O leitor de QR precisa ter
  alternativa sem câmera (RF-04, RF-05, RF-06).
- **RNF-09:** preço nunca comunicado **só** por cor: "mais barato/mais caro" leva
  ícone e texto também.

**Manutenibilidade (Angular moderno)**
- **RNF-10:** componentes standalone (padrão), **zoneless** (padrão no v22) e
  **OnPush** (padrão no v22). `inject()` em vez de construtor. `input()`, `output()`
  e `model()` em vez de decorators. Control flow `@if`/`@for`/`@switch`/`@defer`.
- **RNF-11:** estado em **signals**. Leitura assíncrona com `resource`/`rxResource`.
  Stores por feature em services `providedIn: 'root'` que expõem apenas signals
  readonly. Sem NgRx e sem NGXS.
- **RNF-12:** formulários com **Signal Forms** (`@angular/forms/signals`).
- **RNF-13:** Firebase via **SDK modular** injetado por `InjectionToken` (`FIRESTORE`,
  `AUTH`, `FUNCTIONS`) em `provideFirebase()`, **sem `@angular/fire`**. Os services
  de dados não chamam o SDK espalhado: há uma camada `data-access` por feature.
- **RNF-14:** o **parser da SEFAZ é uma função pura** (`html → NfceParsed`) isolada
  do fetch, com um adaptador por UF (`parsers/pr.ts`). Adicionar uma UF não mexe no
  resto. Tipos compartilhados entre front e functions num pacote `shared/`.
- **RNF-15:** ESLint (angular-eslint) + Prettier. TypeScript `strict` e
  `strictTemplates`.
- **RNF-16:** estilos seguem o DS: **classe global primeiro, mixin só para o
  parametrizado**. Tokens `$cp-*` são a única fonte da paleta, e cor literal em
  componente é proibida (regra de lint via stylelint `color-no-hex` fora de `_tokens.scss`).

**Testabilidade**
- **RNF-17:** **Vitest** no front e nas functions. Cobertura ≥ **80%** em
  `functions/src/parsers`, `shared/` (chave, EAN, normalização, unidades) e stores.
  Em componentes, cobertura ≥ 60%.
- **RNF-18:** o parser é testado com **fixtures de HTML reais** (cupons do PR salvos
  em `functions/test/fixtures/`, com CPF do consumidor removido).
- **RNF-19:** **sem Firebase Emulator Suite** (decisão do usuário em 27/09/2026).
  Desenvolvimento e e2e usam o projeto `fed-catalogo-compara-precos-dv`. Testes
  unitários mockam o SDK, e as Functions acessam o Firestore por um repositório com
  fake em memória. Regras verificadas por checklist no Rules Playground do dv.
- **RNF-20:** Playwright no e2e contra o dv, com usuário de teste e Functions, SEFAZ
  e Menor Preço interceptados por `page.route`. Nunca bater no portal real nem
  escrever dados no dv pelo e2e.

**Segurança**
- **RNF-21:** **proteção contra SSRF** na function de importação. A URL recebida
  passa por **allowlist de host** (`www.fazenda.pr.gov.br`, caminho `/nfce/qrcode`,
  e as próximas UFs explicitamente). Redirecionamentos só são seguidos para host
  da allowlist. Nenhum outro host é buscado.
- **RNF-22:** coleções **compartilhadas** (`produtos`, `estabelecimentos`, `precos`)
  são **somente leitura** para clientes autenticados. Só as Functions (Admin SDK)
  escrevem, então nenhum usuário injeta preço falso direto.
- **RNF-23:** `usuarios/{uid}/**` pode ser lido e excluído só pelo dono, e é
  gravado só pelas Functions. Regras cobertas por testes (RNF-19).
- **RNF-24:** **privacidade/LGPD**. O **CPF do consumidor** que aparece na nota
  **não é armazenado**. Os preços publicados na base compartilhada **não carregam
  uid** nem chave da nota. O vínculo entre usuário e preço existe só na área privada.
- **RNF-25:** **App Check** (reCAPTCHA Enterprise) nas callables e **rate limit**
  por usuário (ex.: 30 importações/hora), para não transformar o app num proxy de
  scraping contra a SEFAZ.
- **RNF-26:** a descrição de produto vinda do HTML é tratada como texto (interpolação
  do Angular, nunca `innerHTML`). O parser remove as tags.
- **RNF-27:** credenciais do Firebase por ambiente (`environment.ts` dev/prod) e
  segredos das Functions no **Secret Manager** (`defineSecret`), nunca no repositório.

**Integração Menor Preço**
- **RNF-31:** o acesso ao Menor Preço fica isolado num **`MenorPrecoClient`**
  (`features/regiao/data-access/`) atrás de uma interface `FontePrecosRegiao`, com
  tipos próprios mapeados do JSON (nunca expor o formato cru à UI). Se a API mudar
  ou sair do ar, só essa classe muda, e a UI mostra "fonte indisponível" sem
  quebrar o resto.
- **RNF-32:** **chamada direto do navegador** (o CORS é aberto), com isso a carga
  sai do IP de cada usuário, não de um IP de Function, que seria bloqueável.
  **Cache** em memória + `sessionStorage` por `(gtin|termo, geohash5, raio)`
  por 30 minutos. **Debounce** de 400 ms na busca por texto e no máximo 1 requisição
  simultânea por tela. Proxy por Function só se o CORS for fechado no futuro.
- **RNF-33:** timeout de 10s e, em erro, estado vazio com "Menor Preço
  indisponível agora", sem retry automático em loop.
- **RNF-34:** resposta validada em runtime (schema leve, ex.: `valibot`) antes de
  mapear. Campo ausente ou com tipo errado descarta o item, não a página inteira.
  Contrato coberto por teste com **fixture real** salva em 27/09/2026.
- **RNF-35:** **privacidade da localização**. A posição exata não sai do aparelho.
  Para a API do Menor Preço vai só um geohash **reduzido a 7 caracteres (~150 m)**,
  já que o raio de busca é em km. O site oficial manda 9. Validar que a API aceita
  7. **Nada de
  localização é gravado no Firestore.** Na tela de permissão, explicar que a
  consulta vai para um serviço do Governo do PR.

**Internacionalização**
- **RNF-28:** o app é **pt-BR apenas**, sem ngx-translate. Usar `LOCALE_ID 'pt-BR'`
  e `registerLocaleData` para moeda (`BRL`), data e número. Os textos ficam no
  template. Se precisar de i18n no futuro, usar o `@angular/localize` nativo.

**Operação e custo**
- **RNF-29:** Functions na região **`southamerica-east1`**, com `minInstances: 0` e
  `maxInstances` baixo (ex.: 5). Isso exige o plano **Blaze**; configurar **alerta de
  orçamento** no GCP.
- **RNF-30:** log estruturado da importação (UF, duração, nº de itens, sucesso ou
  falha de parsing), sem dados pessoais, para detectar quando o layout da SEFAZ mudar.

---

## 5. Estrutura de Componentes Proposta

### 5.1 Repositório (monorepo simples, sem Nx)

```
fed-catalogo-compara-precos/
├── CLAUDE.md
├── angular.json · package.json · tsconfig*.json · eslint.config.js · .prettierrc
├── firebase.json · .firebaserc
├── firestore.rules · firestore.indexes.json
├── playwright.config.ts · e2e/
├── docs/{analise,plano,execucao}/
├── shared/                         # TS puro, usado pelo front e pelas functions
│   ├── chave-acesso.ts             # validar DV, extrair UF/CNPJ/AAMM/modelo
│   ├── gtin.ts                     # validar EAN-8/12/13/14
│   ├── normalizar.ts               # descrição, unidade de medida, conteúdo (500G → 0.5 kg)
│   ├── similaridade.ts             # tokens + Jaccard (RF-27, casar estabelecimentos)
│   ├── geohash.ts                  # encode lat/lng → geohash (sem lib)
│   └── model.ts                    # NfceParsed, Nota, Item, Produto, Estabelecimento, Preco
├── functions/
│   ├── package.json (Node 22, firebase-functions 7, firebase-admin 13, cheerio)
│   ├── src/
│   │   ├── index.ts                # exports das callables
│   │   ├── importar/
│   │   │   ├── preview-nfce.ts     # callable: URL → NfceParsed (não grava)
│   │   │   ├── confirmar-nfce.ts   # callable: grava nota + publica preços (transação)
│   │   │   ├── fetch-sefaz.ts      # fetch com allowlist, timeout e retry
│   │   │   └── rate-limit.ts
│   │   ├── parsers/
│   │   │   ├── index.ts            # resolve o parser pela UF/host
│   │   │   └── pr.ts               # html → NfceParsed (função pura)
│   │   └── produtos/
│   │       └── vincular-produto.ts # callable: RF-18
│   └── test/{fixtures/*.html, *.spec.ts}
└── src/
    ├── index.html · main.ts · styles.scss
    ├── environments/
    └── app/
        ├── app.config.ts           # provideZonelessChangeDetection (padrão), router, provideFirebase
        ├── app.routes.ts
        ├── app.ts / app.html / app.scss   # shell: rail/drawer + header (portado)
        ├── core/
        │   ├── firebase/           # tokens FIRESTORE/AUTH/FUNCTIONS + provideFirebase()
        │   ├── auth/               # AuthStore (signals), authGuard, guestGuard
        │   └── layout/             # BreakpointService (matchMedia → signal)
        ├── shared/
        │   ├── style/              # _tokens.scss ($cp-*), _mixins.scss, _breakpoints.scss
        │   ├── ui/                 # componentes de apresentação
        │   │   ├── preco/          # <cp-preco [valor] [unidade]>
        │   │   ├── badge-preco/    # mais barato / mais caro (ícone + texto + cor)
        │   │   ├── empty-state/
        │   │   ├── confirm-dialog/
        │   │   └── scanner/        # <cp-scanner> câmera + imagem (lazy, zxing-wasm)
        │   └── pipes/              # brl, unidade-medida
        └── features/
            ├── auth/               # login, cadastro, redefinir-senha (fora do shell)
            ├── painel/             # RF-23
            ├── importar/           # RF-03..10: scanner → preview → confirmar
            │   ├── importar.page.ts
            │   ├── preview-nota/
            │   └── data-access/importar.service.ts (httpsCallable)
            ├── notas/              # RF-11..13: lista + detalhe
            ├── produtos/           # RF-14..19: busca, detalhe, histórico, vincular
            ├── estabelecimentos/   # RF-20..21
            ├── regiao/             # RF-24..28: preços perto de mim (Menor Preço)
            │   ├── busca-regiao.page.ts        # texto + categoria + EAN
            │   ├── resultado-gtin/             # lista por preço + divergentes (RF-27)
            │   ├── localizacao/                # permissão, cidade manual, raio
            │   └── data-access/
            │       ├── fonte-precos-regiao.ts  # interface
            │       ├── menor-preco.client.ts   # HTTP + validação + mapeamento
            │       └── menor-preco.cache.ts
            └── lista-compras/      # RF-22 (fase posterior)
```

### 5.2 Rotas

```
/login  /cadastro  /redefinir-senha                (guestGuard, fora do shell)
/                  → painel                        (authGuard, dentro do shell)
/importar          → scanner / colar URL / chave
/importar/preview  → pré-visualização e confirmação
/notas             /notas/:chave
/produtos          /produtos/:id
/estabelecimentos  /estabelecimentos/:cnpj
/regiao            (?gtin=… | ?termo=…&categoria=…)   preços perto de mim
/lista             (fase posterior)
**                 → página de erro
```

### 5.3 Modelo Firestore

```
usuarios/{uid}                                  # perfil (nome, criadoEm)
usuarios/{uid}/notas/{chave}                    # PRIVADO
   { chave, cnpj, estabelecimentoNome, emissao, total, qtdItens,
     itens: [{ n, descricao, codigo, ean?, produtoId, qtd, unidade, vlUnit, vlTotal }],
     importadaEm }
usuarios/{uid}/pendentes/{chave}                # PRIVADO, RF-10a (gravado só pelas Functions)
   { chave, url, status: 'aguardando'|'falhou', tentativas, proximaTentativa,
     ultimoErro, criadaEm }
estabelecimentos/{cnpj}                         # COMPARTILHADO
   { cnpj, nome, fantasia?, endereco, cidade, uf, atualizadoEm }
produtos/{produtoId}                            # COMPARTILHADO
   # produtoId = "ean:7891234567895"  ou  "loc:{cnpj}:{codigo}"
   { ean?, descricao, descricaoNorm, tokens[], conteudo?, unidadeBase?,
     vinculadoA?: produtoId, menorPreco?, ultimaObservacao? }
precos/{chave}_{nItem}                          # COMPARTILHADO, anônimo
   { produtoId, cnpj, vlUnit, unidade, precoPorUnidadeBase?, emissao }
nfceImportadas/{chave}                          # só Functions (dedup RF-09)
   { importadaEm, qtdUsuarios }
rateLimit/{uid}                                 # só Functions
```

A busca por texto usa `tokens[]` + `array-contains`. É suficiente para o volume
inicial. Se crescer, avaliar a extensão de busca do Firebase (Algolia/Typesense).

### 5.4 Design system "Compara Preços" (`$cp-`)

A estrutura é portada do confeccoes: tokens, classes globais, mixins, shell,
Instrument Sans, Material Symbols Rounded e M3. A paleta proposta abaixo precisa
ser validada em contraste (RNF-07):

| Papel | confeccoes (`$ep-`) | compara-precos (`$cp-`) proposta |
|---|---|---|
| Acento (CTA, foco) | terracota `#a34a33` | verde `#1f7a4d` |
| Acento sobre branco (preço, link) | `#8a3a27` | verde escuro `#16603b` |
| Acento suave (chip) | `#fdf6f3` | `#effaf3` |
| Casca (sidebar/login) | gradiente plum `#2a0b30 → #4a1152` | gradiente floresta `#0a2418 → #0f3a26 → #15502f` |
| Fundo da tela | `#f7f2f2` (rosado) | `#f3f6f3` (cinza esverdeado) |
| Rampa de texto | tons de ameixa | tons de grafite esverdeado (`#18211c` … `#9aa59e`) |
| **Sucesso** | verde `#1b6942` | **conflita com o acento**: mover para **teal** `#0f6e6a` ou usar o próprio acento para "melhor preço" |
| Destaque "mais barato" | — | acento + ícone `trending_down` |
| Destaque "mais caro" | — | vermelho de dados `#a51d13` + ícone `trending_up` |
| Aviso | âmbar `#a54600` | mantém |

O M3 é gerado com `mat.theme` a partir de uma paleta verde (`mat.$green-palette`
ou uma paleta customizada gerada do `#1f7a4d`).

---

## 6. Dependências e Pré-condições

| Item | Estado atual | Ação necessária |
|---|---|---|
| **Spike do parser PR com cupom real** | ⛔ **bloqueado pela SEFAZ-PR** (ver 6.1) | **Bloqueante para o parser, não para a fundação.** Obter 2 ou 3 URLs de QR de cupons reais do PR, salvar o HTML como fixture e confirmar os seletores e **se o EAN aparece** (aba resumida × "Visualizar em abas"). Isso define se RF-17/RF-18 são o caminho principal ou o de exceção |
| Consulta só por chave no portal PR | ❓ incerto | Verificar no spike se existe consulta sem captcha. Se não existir, RF-06 fica em "validar chave + pedir QR" |
| Projeto Firebase | ✅ criado em 27/09/2026: `fed-catalogo-compara-precos` (app web `1:36149188144:web:8b44e0133696e9b5eb3ff5`) | Produção. **Desenvolvimento:** projeto `fed-catalogo-compara-precos-dv` (criado pelo usuário; `localhost` aponta para ele). **Sem Emulator Suite.** Ativar Auth (e-mail/senha), Firestore (`southamerica-east1`) e Functions nos dois |
| Repositório GitHub | ✅ `andreehgomes/fed-catalogo-compara-precos` (vazio) | `git remote add origin` na Tarefa 1.1 |
| Plano **Blaze** | ❌ | Obrigatório para Functions e para fetch externo. Configurar alerta de orçamento |
| App Check (reCAPTCHA Enterprise) | ❌ | Registrar o app web e obter a site key |
| Angular CLI 22.2 | ✅ disponível no npm (`latest` = 22.2.0) | `npx @angular/cli@22 new` com `--style=scss --ssr=false --zoneless` (padrão) |
| `@angular/fire` | ⚠️ 20.1.0, peer `@angular/core ^20` | **Não usar.** Firebase JS SDK 12.x direto + wrappers de DI próprios (RNF-13) |
| `@angular/material` / `cdk` | ✅ 22.2.0 | Instalar. Usar só dialog, menu, autocomplete, datepicker, snackbar e BreakpointObserver |
| Firebase JS SDK | ✅ 12.19.0 | Instalar |
| `firebase-functions` / `firebase-admin` | ✅ 7.4.0 / 14.5.0 | Instalar em `functions/` |
| `cheerio` | ✅ 1.2.0 | Parser HTML nas Functions |
| Leitor de QR/EAN no navegador | ❌ | `barcode-detector` (polyfill da BarcodeDetector API sobre `zxing-wasm`, 3.2.2). O iOS Safari não tem BarcodeDetector nativo. Carregar por `import()` |
| Gráfico de histórico | ❌ | Lib leve (ex.: Chart.js) via `@defer`, ou SVG próprio |
| Node | ✅ 22.18 | Mesma versão no runtime das Functions |
| API Menor Preço | ✅ respondendo em 27/09/2026, CORS aberto | Salvar fixtures reais (`/produtos` por termo e por GTIN, `/categorias`). Confirmar os valores válidos de `data` e `ordem` e se `local` aceita geohash de 7 caracteres |
| Validação de schema em runtime | ❌ | `valibot` (leve, tree-shakeable) para a resposta do Menor Preço (RNF-34) |
| Geolocalização | — | API nativa `navigator.geolocation` (exige HTTPS, que o Firebase Hosting tem). Geohash implementado em `shared/geohash.ts` |
| `NFeConsultaProtocolo4` | ⛔ exige certificado A1 | **Fora do MVP** (1.3) |
| Firebase CLI | ❓ | `npm i -D firebase-tools` (só para deploy, feito pelo usuário; sem emuladores) |
| Design system | ✅ no confeccoes | Portar `_tokens.scss`, `styles.scss`, `_admin-ui.scss`, `_breakpoints.scss` e shell (`app.component.*`), renomeando `ep → cp` e trocando os valores da paleta |
| Git | ❌ pasta não é repositório | `git init` + `.gitignore` (não versionar `dist/`, ao contrário do confeccoes) |
| CI | ❌ | GitHub Actions: lint + test + build + deploy (Hosting + Functions) |

### 6.1 Spike de 27/09/2026: portal SEFAZ-PR indisponível

Testado com 2 URLs lidas do QR de cupons reais (mesmo CNPJ, emissões em 08 e
09/2026; chaves com DV válido):

| Tentativa | Resposta do portal |
|---|---|
| URL do QR como veio (v2), via `curl` e via navegador | "Url do QRCode mal formatado" |
| A mesma URL com `\|` codificado, em http/https e com hash em minúsculas | idem |
| Formato v3 `p=chave\|3\|1` | idem |
| `dfeportal.fazenda.pr.gov.br/dfe-portal/rest/servico/consultaNFCe` | "206 – Problemas na Chave de Consulta da NFC-e via QR Code" |
| Formato v1 `chNFe=…&nVersao=100&tpAmb=1\|2` | "Chave de Acesso … não consta na base de dados da SEFAZ" |
| Leitura do QR pelo celular do usuário | "Url do QRCode mal formatado" |
| Consulta completa em `sped.fazenda.pr.gov.br/NFCe/webservices/sped/nfce/completa` (feita pelo usuário) | `org.hibernate.exception.GenericJDBCException: Error calling CallableStatement.getMoreResults` |

**Conclusão:** falha **do lado da SEFAZ-PR** (erro de banco de dados no backend deles). As URLs
estão corretas. Consequências para o projeto:

- O spike do parser (seletores, presença do EAN, aceitação do v3) fica
  **pendente até o portal voltar**. A fundação do app (Fases sem parser) não
  depende disso.
- O portal devolve **HTTP 200 com página de erro**, e não 5xx. Por isso o fetch
  precisa classificar a resposta pelo **conteúdo** (mensagens conhecidas) para
  distinguir "SEFAZ indisponível" (vai para a fila do RF-10a) de "nota inválida".
  As mensagens acima entram como fixtures de teste.
- Indisponibilidade prolongada é real, não hipotética: a **fila de pendentes
  (RF-10a)** é requisito do MVP, não evolução.

### Riscos

1. **Portal da SEFAZ-PR indisponível** (observado em 27/09/2026). Mitigação: fila de
   pendentes com retry agendado (RF-10a) e classificação da resposta pelo conteúdo.
2. **Layout da SEFAZ muda sem aviso.** Mitigação: parser isolado com fixtures,
   log de falha de parsing (RNF-30) e mensagem clara ao usuário.
3. **EAN ausente no HTML.** Nesse caso a comparação depende de normalização de
   descrição e do vínculo manual (RF-17/RF-18). É a parte mais difícil do produto.
4. **Bloqueio por volume/IP** do portal. Mitigação: rate limit, dedup por chave e
   `maxInstances` baixo.
5. **Custo do Blaze.** Mitigação: alerta de orçamento, sem `minInstances`, cache
   da consulta por chave.
6. **API do Menor Preço muda, fecha o CORS ou passa a exigir login.** Ela é interna,
   sem contrato. Mitigação: `MenorPrecoClient` isolado atrás de interface (RNF-31),
   validação de schema (RNF-34), degradação elegante (RNF-33) e proxy por Function
   como plano B. O app **continua útil sem ela** (notas próprias + base comunitária).
7. **Uso da API do Menor Preço sem termo de uso publicado.** Os dados são públicos e
   exibidos pelo próprio governo, mas não há permissão explícita para terceiros.
   Mitigação: volume baixo (cache + debounce), atribuição visível da fonte e nenhum
   armazenamento em massa. Não raspar a base inteira. **Se o app for publicado para
   o público geral, consultar a SEFA-PR.**
8. **GTIN errado cadastrado pelo mercado** polui a busca por código de barras
   (medido: "AGUA" com o GTIN da Coca-Cola). Mitigação: filtro de similaridade (RF-27).

---

## 7. Critérios de Aceitação

**Fundação**
- [ ] `ng new` em Angular 22.2 sem `zone.js` no bundle; `ng build --configuration=production` sem aviso de budget.
- [ ] Lint, Vitest e Playwright rodando; `npm test` verde.
- [ ] `npm start` autentica no projeto dv.
- [ ] Shell portado: rail de 76px, expandida de 264px e drawer abaixo de 900px; scroll interno em `.cp-content`.
- [ ] Todos os tokens `$cp-*` de texto passam em contraste AA sobre as superfícies em que são usados.

**Importação**
- [ ] No celular, apontar a câmera para o QR de um cupom real do PR abre a pré-visualização com estabelecimento, data, itens e total **idênticos ao cupom impresso**.
- [ ] Importar por foto da galeria e por URL colada produz o mesmo resultado.
- [ ] Chave com DV inválido é rejeitada no front, sem chamar a function.
- [ ] URL de host fora da allowlist é rejeitada pela function (teste unitário cobrindo SSRF, incluindo redirect).
- [ ] Reimportar a mesma chave pelo mesmo usuário não duplica a nota; por outro usuário, não duplica os preços.
- [ ] O CPF do consumidor não aparece em nenhum documento do Firestore.
- [ ] Parser do PR com cobertura ≥ 80% e ≥ 3 fixtures reais.
- [ ] Com a SEFAZ simulada fora do ar (fixtures de 6.1), a importação vira "Aguardando SEFAZ-PR". Quando a SEFAZ volta, a function agendada importa a nota sem ação do usuário.
- [ ] As páginas de erro da SEFAZ que chegam com HTTP 200 são classificadas corretamente (indisponível × nota inválida), com testes usando as mensagens reais de 6.1.

**Isolamento e segurança**
- [ ] Teste de regras: usuário A não lê nem exclui notas do usuário B.
- [ ] Teste de regras: nenhum cliente consegue escrever em `produtos`, `precos` ou `estabelecimentos`.
- [ ] Documentos de `precos` não contêm `uid` nem referência ao usuário.
- [ ] A 31ª importação na mesma hora é recusada com mensagem amigável.

**Comparação**
- [ ] Um produto com EAN comprado em 2 estabelecimentos mostra os dois preços, menor/médio/maior e a data da observação.
- [ ] Produto sem EAN pode ser vinculado a outro, e a comparação passa a considerar os dois.
- [ ] Preço por unidade (R$/kg, R$/L) aparece quando a descrição tem o conteúdo.
- [ ] "Mais barato/mais caro" é comunicado com ícone e texto, não só com cor.

**Preços da região (Menor Preço)**
- [ ] Ler o EAN de um produto na prateleira mostra, em até 3s, os estabelecimentos num raio de 2 km ordenados por preço, com distância e data.
- [ ] Resultados com descrição divergente do grupo ficam ocultos por padrão e aparecem ao tocar em "mostrar N divergentes".
- [ ] Busca por texto pagina de 29 em 29 sem repetir itens e respeita o filtro de categoria.
- [ ] Repetir a mesma busca em 30 minutos não gera nova requisição (conferido na aba Network).
- [ ] Com a API do Menor Preço bloqueada (simulada), a tela mostra "Menor Preço indisponível agora" e o resto do app segue funcionando.
- [ ] Negar a geolocalização leva à escolha manual de cidade/bairro, e nenhum documento do Firestore contém coordenadas ou geohash.
- [ ] No detalhe de uma nota importada, itens com EAN mostram "mais barato perto" com valor, estabelecimento e fonte "Menor Preço – Nota Paraná".
- [ ] Testes do `MenorPrecoClient` passam com as fixtures reais, incluindo item com `gtin` vazio e `nm_fan` vazio.

**Qualidade**
- [ ] Lighthouse mobile: Performance ≥ 85 e Accessibility ≥ 95 no painel e na lista de notas.
- [ ] Leitor de QR e gráfico ficam fora do chunk inicial (conferido na saída do build).
- [ ] Nenhuma cor literal fora de `_tokens.scss` (stylelint).
