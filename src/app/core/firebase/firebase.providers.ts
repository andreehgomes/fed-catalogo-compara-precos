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
    { provide: FIREBASE_APP, useFactory: () => initializeApp(environment.firebase) },
    {
      provide: FIREBASE_AUTH,
      useFactory: () =>
        initializeAuth(inject(FIREBASE_APP), {
          persistence: [indexedDBLocalPersistence, browserLocalPersistence],
        }),
    },
  ]);
}
