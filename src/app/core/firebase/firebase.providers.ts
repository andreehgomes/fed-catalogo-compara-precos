import {
  EnvironmentProviders,
  InjectionToken,
  inject,
  makeEnvironmentProviders,
} from '@angular/core';
import { initializeApp } from 'firebase/app';
import {
  Auth,
  browserLocalPersistence,
  indexedDBLocalPersistence,
  initializeAuth,
} from 'firebase/auth';
import { environment } from '../../../environments/environment';
import { FIREBASE_APP } from './firebase-app.token';

export { FIREBASE_APP } from './firebase-app.token';

export const FIREBASE_AUTH = new InjectionToken<Auth>('FIREBASE_AUTH');

/**
 * O Auth é inicializado sem popupRedirectResolver: o padrão (getAuth) carrega um iframe
 * do authDomain antes de resolver a sessão, o que atrasava a primeira tela em segundos. O
 * resolvedor só entra no login com Google (AUTH_API).
 *
 * App e Auth entram no bundle inicial (os guards precisam da sessão). FIRESTORE e
 * FUNCTIONS são tokens `providedIn: 'root'` em arquivos próprios (`firestore.token.ts`,
 * `functions.token.ts`): só as features lazy que os importam puxam aquele SDK.
 */
export function provideFirebase(): EnvironmentProviders {
  return makeEnvironmentProviders([
    {
      provide: FIREBASE_APP,
      useFactory: () => initializeApp({ ...environment.firebase, authDomain: dominioAuth() }),
    },
    {
      provide: FIREBASE_AUTH,
      useFactory: () =>
        initializeAuth(inject(FIREBASE_APP), {
          persistence: [indexedDBLocalPersistence, browserLocalPersistence],
        }),
    },
  ]);
}

const HOSTS_LOCAIS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * Fora do localhost o authDomain é o próprio host: o Hosting serve `/__/auth/handler` em
 * todo domínio dele, e o redirect do Google fica same-origin. Com o `*.firebaseapp.com`, o
 * Safari (PWA instalado no iOS) particiona o storage e o login nunca completa.
 */
function dominioAuth(): string {
  const { host, hostname } = globalThis.location ?? {};
  return host && !HOSTS_LOCAIS.has(hostname) ? host : environment.firebase.authDomain;
}
