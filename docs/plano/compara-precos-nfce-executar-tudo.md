# Plano mestre: executar todas as fases (execução autônoma)

**Uso:** `/executar-plano docs/plano/compara-precos-nfce-executar-tudo.md`
**Índice do plano:** [compara-precos-nfce-plano.md](./compara-precos-nfce-plano.md)
**Análise:** [../analise/compara-precos-nfce-analise.md](../analise/compara-precos-nfce-analise.md)
**Preparado em:** 27/09/2026

---

## Contexto para quem executa

Este arquivo existe para rodar **as 10 fases em sequência, sem o usuário presente**.
Quem executa começa num contexto novo, então tudo o que precisa saber está aqui, no
índice e nos arquivos de fase. **Leia o índice e a análise antes da Fase 1.**

O usuário não vai responder perguntas durante a execução. Onde houver dúvida, siga
a regra desta página. Se não houver regra, escolha a opção mais conservadora e
registre a decisão na execução da fase.

---

## Ordem

Execute cada fase **por completo** (todas as tarefas, lint, testes e documentação)
antes de começar a próxima:

| # | Arquivo |
|---|---|
| 1 | [compara-precos-nfce-fase-1.md](./compara-precos-nfce-fase-1.md) |
| 2 | [compara-precos-nfce-fase-2.md](./compara-precos-nfce-fase-2.md) |
| 3 | [compara-precos-nfce-fase-3.md](./compara-precos-nfce-fase-3.md) |
| 4 | [compara-precos-nfce-fase-4.md](./compara-precos-nfce-fase-4.md) |
| 5 | [compara-precos-nfce-fase-5.md](./compara-precos-nfce-fase-5.md) |
| 6 | [compara-precos-nfce-fase-6.md](./compara-precos-nfce-fase-6.md) |
| 7 | [compara-precos-nfce-fase-7.md](./compara-precos-nfce-fase-7.md) |
| 8 | [compara-precos-nfce-fase-8.md](./compara-precos-nfce-fase-8.md) |
| 9 | [compara-precos-nfce-fase-9.md](./compara-precos-nfce-fase-9.md) |
| 10 | [compara-precos-nfce-fase-10.md](./compara-precos-nfce-fase-10.md) |

As Fases 2 e 3 são independentes, mas execute em ordem numérica mesmo assim, para
manter a sequência simples de acompanhar.

---

## Regras de execução autônoma

### Permitido sem perguntar
- Criar e editar arquivos **dentro da pasta do projeto**.
- `npm install` / `npm i` de pacotes previstos no plano (e dependências de dev
  necessárias para eles).
- Rodar build, lint, testes, `ng generate`, `ng add` e scripts do projeto.
- `git init`, `git add` e **`git commit` local**: **um commit por fase**, no fim dela,
  com a mensagem `feat(fase-N): <resumo>` e o rodapé de coautoria padrão.
  Conferir `git status --short` antes de cada commit.
- Acessar o portal SEFAZ-PR e a API do Menor Preço **só** nos levantamentos
  previstos (Tarefas 5.1 e 6.3), com poucas requisições.

### Proibido (registrar como pendência para o usuário)
- **`git push`** ou qualquer operação no GitHub. O remoto `origin` pode ser
  configurado (1.1), mas nada é enviado.
- **`firebase deploy`**, `firebase login` ou qualquer comando que altere os projetos
  `fed-catalogo-compara-precos` ou `fed-catalogo-compara-precos-dv` na nuvem.
- Criar contas no Authentication do dv ou gravar dados no Firestore do dv (o e2e
  intercepta as Functions; ver bloqueios abaixo).
- Configurar ou iniciar o **Firebase Emulator Suite** (o projeto não usa emulador).
- Qualquer ação no **console do Firebase/Google Cloud**, mudança de plano de
  faturamento, criação de chaves ou credenciais.
- Instalar software de sistema (JDK, Chrome, winget, choco etc.).
- Varrer o Menor Preço ou a SEFAZ além do necessário para salvar as fixtures.

### Ao encontrar um bloqueio
1. **Não pare a execução inteira.** Marque a tarefa como ⛔ bloqueada, registre o
   motivo e o que falta, e siga para a próxima tarefa independente.
2. Tarefas que dependem da bloqueada também ficam ⛔, com referência à original.
3. Nunca "simule" um critério de aceitação. Se não deu para verificar, registre
   ❌ ou ⛔ com o motivo, **não** ✅.

---

## Bloqueios já conhecidos (27/09/2026)

| Bloqueio | Afeta | O que fazer |
|---|---|---|
| **Sem Firebase Emulator Suite** (decisão do usuário) | Todo o projeto | **Não** configurar nem usar emuladores. `npm start` aponta para o dv. Testes unitários com SDK mockado; Functions com repositório em memória (6.1) |
| **Usuário de teste do e2e** (`.env.e2e`) ainda não existe | e2e com login (4.4, 7.2, 10.1) | Criar `.env.e2e.example`. Se não houver `.env.e2e`, os testes com login são pulados (`test.skip`) e o critério fica ⛔ "usuário cria a conta de teste no dv e preenche `.env.e2e`". **Não** criar contas no dv |
| **Regras e Functions não publicadas no dv** | Verificações reais de 4.6, 6.x, 7.4 e do roteiro manual (10.1) | Escrever os checklists em `docs/qualidade/`. A execução deles fica ⛔ para o usuário (deploy + Blaze no dv) |
| **Portal SEFAZ-PR fora do ar** (erro de banco do lado deles; ver análise 6.1) | Tarefa 6.3 (parser) e o que depende de nota real | No início da Fase 6, testar a URL abaixo. Se ainda der "Url do QRCode mal formatado", executar o resto da Fase 6 com as fixtures de erro e um `NfceParsed` escrito à mão, e marcar 6.3 como ⛔ |
| **Projeto dv no plano Spark** | Deploy de Functions no dv | Não afeta a execução (deploy é proibido aqui). Registrar no resumo final |
| **Debug token do App Check** | Tarefa 6.7 | Implementar o código. O registro do token no console é do usuário: ⛔ pendente |
| **Câmera / celular real** | Critérios de 5.3, 7.x | Testar a leitura por imagem da galeria com uma imagem de QR gerada localmente. O teste com câmera real fica ⛔ para o usuário |
| **Workload Identity / proteção de branch no GitHub** | Tarefa 10.3 | Escrever os workflows. A configuração no GitHub fica ⛔ para o usuário |

URL de teste da SEFAZ-PR (cupom real do usuário):

```
https://www.fazenda.pr.gov.br/nfce/qrcode?p=41260903644587000836652100000168701620438547|2|1|1|E87B918B945714C101FE1D79B6BD32073BA8D651
```

Se o portal **voltar**: fazer o spike da 6.3 com as duas URLs do usuário (a segunda
é `...?p=41260803644587000836652030000088681310226239|2|1|1|20C20FABFA70252AD3A8910B6A2AC7513073F0A5`),
**anonimizar** o HTML antes de salvar como fixture e responder as três perguntas do
spike (seletores, EAN presente?, v3 só com a chave funciona?).

---

## Documentação

- **Uma execução por fase**, no formato do `/executar-plano`:
  `docs/execucao/AAAA-MM-DD-compara-precos-nfce-fase-N.md`.
- A cada fase, atualizar o `CLAUDE.md` do projeto conforme a fase pede.
- **No fim**, criar `docs/execucao/AAAA-MM-DD-compara-precos-nfce-resumo.md` com:
  - uma tabela das 10 fases (✅ concluída / ⚠️ parcial / ⛔ bloqueada) e o hash
    do commit de cada uma;
  - **a lista consolidada de pendências para o usuário**, agrupada por tipo:
    instalar, console Firebase/GCP, GitHub, teste em celular e SEFAZ;
  - os comandos para ele validar o resultado (`npm start`, `npm test`, `npm run
    lint`, `ng build -c production`);
  - discrepâncias relevantes em relação ao plano.

---

## Verificação entre fases

Antes do commit de cada fase:

```bash
npm run lint
npm run test:ci
ng build --configuration=production     # procurar "budget|exceeded|maximum"
```

Nas fases com Functions (6 em diante), rodar também:

```bash
npm --prefix functions run build
npm --prefix functions test
```

Uma fase **não é commitada com build quebrado**. Se não houver jeito de fechar o build
dentro da fase, registre, commite o que estiver estável em separado e siga.

---

## Critérios de Aceitação desta execução

- [ ] As 10 fases têm arquivo de execução em `docs/execucao/`.
- [ ] Um commit local por fase; nenhum push e nenhum deploy.
- [ ] Build de produção, lint e testes unitários verdes no último commit.
- [ ] Resumo final com o status das fases e as pendências do usuário consolidadas.
