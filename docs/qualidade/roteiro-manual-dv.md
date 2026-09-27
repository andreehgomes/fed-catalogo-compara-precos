# Roteiro manual no projeto dv

**Projeto:** `fed-catalogo-compara-precos-dv` · **Quem roda:** o usuário, depois dos deploys.
O e2e automatizado (`npm run e2e`) intercepta SEFAZ, Menor Preço e Functions e não grava
nada no dv; este roteiro cobre o que só dá para ver com os serviços reais.

## Pré-requisitos

- [ ] Plano Blaze no dv e alerta de orçamento.
- [ ] `npm run deploy:rules:dev` e `npm run deploy:functions:dev`.
- [ ] Debug token do App Check registrado (ver `functions-dv-checklist.md`).
- [ ] Dois usuários de teste no Authentication do dv (A e B). Um deles vai no `.env.e2e`.
- [ ] Provedor **Google** habilitado e `localhost` em Domínios autorizados.
- [ ] `npm start` e o app aberto no celular (mesma rede) ou no navegador do computador.

## 1. Conta

| # | Passo | Esperado | OK |
|---|---|---|---|
| 1.1 | Entrar com e-mail e senha do usuário A | vai para o painel | [ ] |
| 1.2 | Recarregar a página no `/notas` | não pisca a tela de login | [ ] |
| 1.3 | Sair e "Continuar com Google" | popup do Google; volta logado no painel | [ ] |
| 1.4 | "Esqueci a senha" com o e-mail do A | e-mail de redefinição chega | [ ] |

## 2. Importação real (depende do portal da SEFAZ-PR estar no ar)

| # | Passo | Esperado | OK |
|---|---|---|---|
| 2.1 | Importar → Ler QR Code → apontar para um cupom real do PR | prévia com estabelecimento, data, itens e total **iguais ao cupom impresso** | [ ] |
| 2.2 | Confirmar | abre o detalhe da nota; snackbar "Nota importada" | [ ] |
| 2.3 | Importar a mesma nota de novo | "Você já importou essa nota." → "Abrir a nota" | [ ] |
| 2.4 | Importar o mesmo cupom por **foto da galeria** e por **link colado** (em outra conta) | mesma prévia | [ ] |
| 2.5 | Digitar a chave de 44 dígitos | prévia (se o portal aceitar a URL v3) ou "Com a chave sozinha não deu" | [ ] |
| 2.6 | No console do Firestore, abrir `precos/{chave}_1` | sem `uid`, sem chave da nota nos campos, sem CPF | [ ] |

Se o parser provisório falhar ("Não conseguimos ler essa nota"), salvar o HTML da página
(Cloud Logging, `html-layout-inesperado`, só no dv), anonimizar com
`node scripts/anonimizar-fixture.mjs` e retomar a Tarefa 6.3.

## 3. Fila de pendentes

| # | Passo | Esperado | OK |
|---|---|---|---|
| 3.1 | Com o portal fora do ar, importar um QR real → "Guardar e importar quando voltar" | bloco "Aguardando a SEFAZ-PR (1)" com a próxima tentativa | [ ] |
| 3.2 | Esperar a function agendada (15 min) com o portal ainda fora | "Próxima tentativa" passa para ~1 h depois | [ ] |
| 3.3 | Quando o portal voltar, deixar o app aberto | snackbar "Nota de … importada"; nota com a marca "Nova" | [ ] |
| 3.4 | "Excluir" um pendente | some da lista | [ ] |

## 4. Isolamento entre usuários

| # | Passo | Esperado | OK |
|---|---|---|---|
| 4.1 | Usuário B abre `/notas/<chave do A>` | "Nota não encontrada" (regras negam a leitura) | [ ] |
| 4.2 | Usuário B importa a mesma nota do A | nota criada na área do B; `nfceImportadas/{chave}.qtdUsuarios` = 2; nenhum `precos` novo | [ ] |
| 4.3 | Rodar o checklist `regras-firestore-checklist.md` no Rules Playground | 30 cenários conferidos | [ ] |

## 5. Comparação

| # | Passo | Esperado | OK |
|---|---|---|---|
| 5.1 | Produtos → buscar um item da nota | resultado com menor preço e nº de estabelecimentos | [ ] |
| 5.2 | Página do produto com preços de 2 mercados | menor/médio/maior, tabela por estabelecimento, gráfico | [ ] |
| 5.3 | Produto sem EAN → "Este produto é o mesmo que…" → escolher o do outro mercado | a página passa a mostrar os preços dos dois | [ ] |
| 5.4 | Tentar ligar dois produtos com EANs diferentes | recusado com mensagem | [ ] |
| 5.5 | Detalhe da nota → "Comparar com mercados perto" | badges por item, fonte "Menor Preço – Nota Paraná", economia da nota | [ ] |
| 5.6 | Preços perto de mim → ler o EAN de um produto na prateleira | lista em até 3 s, divergentes ocultos | [ ] |

## 6. Celular

| # | Passo | Esperado | OK |
|---|---|---|---|
| 6.1 | Instalar a PWA pelo Chrome do Android ("Adicionar à tela inicial") | ícone verde; abre em tela cheia | [ ] |
| 6.2 | Modo avião → abrir o app → Minhas notas | notas já vistas aparecem (cache do Firestore) | [ ] |
| 6.3 | Modo avião → Importar | aviso "Sem conexão" | [ ] |
| 6.4 | Scanner: câmera abre, lanterna liga, ao sair da tela o LED apaga | ok | [ ] |
| 6.5 | 375×812: ação "Ler QR Code do cupom" acima da dobra, tudo alcançável com uma mão | ok | [ ] |

Resultado: ____ itens conferidos em ___/___/2026.
