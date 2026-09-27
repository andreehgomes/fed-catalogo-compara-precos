# Fase 4: Firebase, autenticação e shell

**Plano:** [índice](./compara-precos-nfce-plano.md)
**Pré-requisito:** [Fase 2](./compara-precos-nfce-fase-2.md) e [Fase 3](./compara-precos-nfce-fase-3.md)
**Próxima fase:** [Fase 5](./compara-precos-nfce-fase-5.md)

---

## Objetivo

Um app navegável e autenticado: Firebase pelo SDK modular (sem `@angular/fire`),
login/cadastro/redefinição com Signal Forms, guards, o **shell
portado do confeccoes** (rail, sidebar, drawer, header) com todas as rotas da
análise como esqueleto e as regras do Firestore com teste.

**Ambientes:** `npm start` usa o projeto de **desenvolvimento na nuvem**
(`fed-catalogo-compara-precos-dv`), como nos outros projetos. **Não há Firebase
Emulator Suite neste projeto** (decisão do usuário em 27/09/2026): testes unitários
mockam o SDK, e o que precisa de Firebase de verdade é verificado no dv.

---

### Tarefa 4.1: Projetos Firebase e ambientes

**Arquivos a criar:** `firebase.json`, `.firebaserc`,
`src/environments/environment.ts`, `environment.prod.ts`,
`angular.json` (configuração `production` com `fileReplacements`)

**O que fazer:**
1. `npm i firebase@12` e `npm i -D firebase-tools`.
2. **Dois ambientes**, no mesmo padrão dos outros projetos:

   | Comando | Arquivo | Firebase | Uso |
   |---|---|---|---|
   | `npm start` | `environment.ts` | **`fed-catalogo-compara-precos-dv`** (nuvem) | desenvolvimento do dia a dia |
   | `ng build -c production` | `environment.prod.ts` | **`fed-catalogo-compara-precos`** | produção |

3. `.firebaserc`: `default` e `dev` → `fed-catalogo-compara-precos-dv`, e `prod` →
   `fed-catalogo-compara-precos`. Qualquer `firebase deploy` sem `-P` vai para o
   **dev**, nunca para produção.
4. `firebase.json`:
   - `hosting.public`: `dist/fed-catalogo-compara-precos/browser`, com rewrite SPA
     `** → /index.html` e cache longo para `*.js|*.css` com hash;
   - `firestore.rules` e `firestore.indexes.json`;
   - `functions.source: functions` (a pasta nasce na Fase 6);
   - **sem** bloco `emulators`.
5. Config web (pública por natureza; segredos só nas Functions, RNF-27):
   - **dev** (`environment.ts`):

     ```ts
     firebase: {
       apiKey: 'AIzaSyAjWysSHMShGEJzE6TVj3p-U-373kMmkOo',
       authDomain: 'fed-catalogo-compara-precos-dv.firebaseapp.com',
       projectId: 'fed-catalogo-compara-precos-dv',
       storageBucket: 'fed-catalogo-compara-precos-dv.firebasestorage.app',
       messagingSenderId: '655682139362',
       appId: '1:655682139362:web:5d3de9eaf2910d18881abb',
     },
     ```

   - **prod** (`environment.prod.ts`):

     ```ts
     firebase: {
       apiKey: 'AIzaSyAyqVulrgteRElM5ygDhuGHPlq95RqGk54',
       authDomain: 'fed-catalogo-compara-precos.firebaseapp.com',
       projectId: 'fed-catalogo-compara-precos',
       storageBucket: 'fed-catalogo-compara-precos.firebasestorage.app',
       messagingSenderId: '36149188144',
       appId: '1:36149188144:web:8b44e0133696e9b5eb3ff5',
     },
     ```

   **Sem `measurementId` e sem `getAnalytics`.** O snippet do console inclui o
   Analytics, mas ele não está na análise (RNF-24).
6. Configuração do console (**usuário**):
   - **dv:** API key restrita a `fed-catalogo-compara-precos-dv.web.app/*`,
     `fed-catalogo-compara-precos-dv.firebaseapp.com/*` e **`localhost:4200/*`**
     (necessário, porque o `npm start` bate no dv). Em Authentication →
     Configurações → Domínios autorizados, confirmar que `localhost` está na lista.
   - **prod:** API key restrita só aos domínios de produção, **sem localhost**.
7. Scripts: `start` (`ng serve`), `deploy:rules:dev` (`firebase deploy --only
   firestore:rules,firestore:indexes -P dev`) e `deploy:functions:dev` (`firebase deploy
   --only functions -P dev`). **Quem roda os deploys é o usuário.**

> **Functions em dev:** com o `npm start` apontando para o dv, uma mudança nas Functions
> só vale depois do `npm run deploy:functions:dev`. A lógica delas é coberta por testes
> unitários (Fase 6), então o deploy serve para validar a integração, não para depurar.

**Critério:** `npm start` loga no projeto dv (usuário aparece em Authentication do
dv) e `ng build -c production` gera o bundle com o `projectId` de produção (`grep` no `dist`).

---

### Tarefa 4.2: Providers do Firebase via `InjectionToken`

**Arquivo a criar:** `src/app/core/firebase/firebase.providers.ts`

**O que fazer:**

```ts
export const FIREBASE_AUTH = new InjectionToken<Auth>('FIREBASE_AUTH');
export const FIRESTORE = new InjectionToken<Firestore>('FIRESTORE');
export const FUNCTIONS = new InjectionToken<Functions>('FUNCTIONS');

export function provideFirebase(): EnvironmentProviders {
  const app = initializeApp(environment.firebase);
  return makeEnvironmentProviders([
    { provide: FIREBASE_AUTH, useFactory: () => getAuth(app) },
    { provide: FIRESTORE, useFactory: () => initializeFirestore(app, {
        localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) }) },
    { provide: FUNCTIONS, useFactory: () => getFunctions(app, 'southamerica-east1') },
  ]);
}
```

- Firestore com `persistentLocalCache({ tabManager: persistentMultipleTabManager() })`,
  para a lista de notas abrir offline no mercado.
- App Check entra na Tarefa 6.7, não aqui.
- Registrar `provideFirebase()` em `app.config.ts`.

**Critério:** um teste injeta `FIRESTORE` com `TestBed` e recebe a instância. Nenhum
import de `@angular/fire` no projeto (`grep`).

---

### Tarefa 4.3: `AuthStore` e guards

**Arquivos a criar:** `src/app/core/auth/auth.store.ts`,
`src/app/core/auth/auth.guards.ts` (+ specs)

**O que fazer:**
- `AuthStore` (`providedIn: 'root'`) com `usuario = signal<User | null | undefined>(undefined)`
  (`undefined` = ainda resolvendo), alimentado por `onAuthStateChanged` e com cleanup
  via `DestroyRef`. Expõe `usuario.asReadonly()`, `logado = computed(...)`,
  `pronto = computed(...)` e os métodos `entrar`, `cadastrar`, `sair` e
  `redefinirSenha`, que delegam ao SDK.
- **Sem login anônimo e sem token em `localStorage`** (o SDK já persiste a sessão;
  o padrão base64 do confeccoes não é portado).
- Guards funcionais `authGuard` e `guestGuard`, que **esperam `pronto()`**
  (`toObservable(pronto).pipe(filter(Boolean), take(1))`) antes de decidir, para não
  redirecionar para o login num refresh.

**Critério:** specs com o SDK mockado cobrem logado, deslogado e "resolvendo". Um
refresh numa rota protegida com sessão válida não pisca a tela de login.

---

### Tarefa 4.4: Telas de login, cadastro e redefinição

**Arquivos a criar:** `src/app/features/auth/login/login.page.ts|html|scss`,
`cadastro/…`, `redefinir-senha/…`, `auth.routes.ts`

**O que fazer:**
- Layout fora do shell, com fundo `$cp-gradient-shell` e card central (mesmo
  arranjo do login do confeccoes, com a paleta nova).
- **Signal Forms**: `form(signal({ email: '', senha: '' }), (p) => { required(p.email);
  email(p.email); minLength(p.senha, 8); })`. Os campos usam `<label>` + `<input
  class="cp-field">` com `[field]`, e os erros aparecem sob o campo com
  `aria-describedby`.
- Mapear os códigos de erro do Firebase Auth para mensagens em pt-BR
  (`auth/invalid-credential`, `auth/email-already-in-use`, `auth/too-many-requests`…).
- Ao cadastrar, **não** criar `usuarios/{uid}` pelo cliente. O perfil nasce na
  primeira callable (Fase 6) ou não é necessário antes disso.

**Critério:** specs dos componentes (Vitest, `AuthStore` mockado) cobrem validação,
mensagens de erro mapeadas e navegação após login. e2e (Playwright contra `npm start`,
ou seja, o **dv**) com o **usuário de teste** de `.env.e2e` (`E2E_EMAIL`, `E2E_SENHA`;
arquivo no `.gitignore`, com um `.env.e2e.example` versionado; a conta é **criada pelo
usuário** no Authentication do dv): login → painel → sair. O cadastro fica só em spec,
para o e2e não criar contas no dv a cada execução. Senha curta e e-mail inválido
mostram erro acessível (`getByLabel`).

---

### Tarefa 4.5: Shell, `BreakpointService`, rotas e página de erro

**Arquivos a criar/modificar:** `src/app/app.ts|html|scss`,
`src/app/core/layout/breakpoint.service.ts`, `src/app/app.routes.ts`,
`src/app/features/erro/erro.page.ts`, uma `*.page.ts` placeholder por rota

**O que fazer:**
1. Portar o shell de `../fed-catalogo-confeccoes/src/app/app.component.*`: `<aside>`
   irmão do conteúdo (rail de 76px ↔ expandida de 264px no desktop, drawer
   sobreposto abaixo de 900px), header sticky e **scroll interno em `.cp-content`**.
   Estado do shell em signals (`expandido`, `drawerAberto`). Fechar o drawer na
   navegação (`router.events` → `takeUntilDestroyed`) e com `Esc`.
2. `BreakpointService` com `estreito = toSignal(matchMedia('(max-width: 900px)'))`,
   via `fromEvent(mql, 'change')`, com valor inicial de `mql.matches`.
3. Itens de navegação: Painel, Importar, Minhas notas, Preços perto de mim,
   Produtos, Estabelecimentos. No mobile, **FAB "Importar nota"** fixo (RNF-05).
4. Rotas (todas `loadComponent`/`loadChildren`) conforme a análise 5.2: rotas de
   auth com `guestGuard` fora do shell, e o resto com `authGuard` dentro do shell.
   As telas ainda não implementadas usam `<cp-empty-state titulo="Em breve">`.
5. `**` → `features/erro`.

**Critério:** a navegação funciona em 1280×800 e em 375×812 (Playwright,
`resize_window`). O drawer fecha ao navegar e com `Esc`, o foco volta ao botão de
menu e o header continua visível ao rolar uma lista longa.

---

### Tarefa 4.6: Regras do Firestore e checklist de verificação

**Arquivos a criar:** `firestore.rules`, `firestore.indexes.json` (vazio por
enquanto), `docs/qualidade/regras-firestore-checklist.md`

**O que fazer:**

```
rules_version = '2';
service cloud.firestore {
  match /databases/{db}/documents {
    function logado() { return request.auth != null; }
    function dono(uid) { return logado() && request.auth.uid == uid; }

    match /usuarios/{uid} {
      allow read: if dono(uid);
      allow write: if false;
      match /notas/{chave}     { allow read, delete: if dono(uid); allow create, update: if false; }
      match /pendentes/{chave} { allow read, delete: if dono(uid); allow create, update: if false; }
    }
    match /produtos/{id}         { allow read: if logado(); allow write: if false; }
    match /estabelecimentos/{id} { allow read: if logado(); allow write: if false; }
    match /precos/{id}           { allow read: if logado(); allow write: if false; }
    match /{document=**}         { allow read, write: if false; }
  }
}
```

Sem emulador, as regras **não têm teste automatizado**. No lugar dele,
`docs/qualidade/regras-firestore-checklist.md` lista os cenários para rodar no
**Rules Playground** do console do dv, depois do `npm run deploy:rules:dev` (feito
pelo usuário). Cada cenário traz caminho, operação, `auth.uid` simulado e o resultado
esperado: A lê e exclui as próprias notas; A **não** lê nem exclui as de B; ninguém
cria nota pelo cliente; ninguém escreve em `produtos`, `precos` ou
`estabelecimentos`; anônimo não lê nada; `nfceImportadas`, `previews` e
`rateLimit` são inacessíveis.

**Critério:** `firestore.rules` escrito e checklist cobrindo todos os cenários acima.
A validação no dv (deploy + Playground) fica como pendência do usuário.

---

## Critérios de Aceitação da Fase

- [ ] Nenhum `@angular/fire` no projeto; Firebase por `InjectionToken`.
- [ ] Login e logout funcionam no dv (e2e com usuário de teste); cadastro e redefinição cobertos por spec.
- [ ] Refresh em rota protegida não pisca o login.
- [ ] Shell: rail/expandido no desktop, drawer abaixo de 900px, FAB no mobile, header sticky com scroll interno.
- [ ] Todas as rotas da análise existem e são lazy (conferir chunks no build).
- [ ] `firestore.rules` escrito e checklist do Rules Playground pronto (validação no dv pelo usuário).
- [ ] `CLAUDE.md` com as seções **Firebase & data access** e **Shell** preenchidas.
