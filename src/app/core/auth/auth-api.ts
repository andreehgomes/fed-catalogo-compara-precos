import { InjectionToken } from '@angular/core';
import {
  Auth,
  AuthProvider,
  GoogleAuthProvider,
  browserPopupRedirectResolver,
  getRedirectResult,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  updateProfile,
} from 'firebase/auth';

function criarAuthApi() {
  return {
    onAuthStateChanged,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    updateProfile,
    signOut,
    sendPasswordResetEmail,
    signInWithPopup: (auth: Auth, p: AuthProvider) =>
      signInWithPopup(auth, p, browserPopupRedirectResolver),
    signInWithRedirect: (auth: Auth, p: AuthProvider) =>
      signInWithRedirect(auth, p, browserPopupRedirectResolver),
    getRedirectResult: (auth: Auth) => getRedirectResult(auth, browserPopupRedirectResolver),
    novoProvedorGoogle: () => new GoogleAuthProvider(),
  };
}

export type AuthApi = ReturnType<typeof criarAuthApi>;

/** Funções do SDK de Auth usadas pelo app, injetáveis para os testes trocarem por fakes. */
export const AUTH_API = new InjectionToken<AuthApi>('AUTH_API', {
  providedIn: 'root',
  factory: criarAuthApi,
});
