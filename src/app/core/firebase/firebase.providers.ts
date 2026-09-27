import {
  EnvironmentProviders,
  InjectionToken,
  inject,
  makeEnvironmentProviders,
} from '@angular/core';
import { initializeApp } from 'firebase/app';
import { Auth, getAuth } from 'firebase/auth';
import { environment } from '../../../environments/environment';
import { FIREBASE_APP } from './firebase-app.token';

export { FIREBASE_APP } from './firebase-app.token';

export const FIREBASE_AUTH = new InjectionToken<Auth>('FIREBASE_AUTH');

/**
 * App e Auth entram no bundle inicial (os guards precisam da sessão). FIRESTORE e
 * FUNCTIONS são tokens `providedIn: 'root'` em arquivos próprios (`firestore.token.ts`,
 * `functions.token.ts`): só as features lazy que os importam puxam aquele SDK.
 */
export function provideFirebase(): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: FIREBASE_APP, useFactory: () => initializeApp(environment.firebase) },
    { provide: FIREBASE_AUTH, useFactory: () => getAuth(inject(FIREBASE_APP)) },
  ]);
}
