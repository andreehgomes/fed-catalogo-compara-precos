import { InjectionToken } from '@angular/core';
import {
  GoogleAuthProvider,
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
    signInWithPopup,
    signInWithRedirect,
    novoProvedorGoogle: () => new GoogleAuthProvider(),
  };
}

export type AuthApi = ReturnType<typeof criarAuthApi>;

/** Funções do SDK de Auth usadas pelo app, injetáveis para os testes trocarem por fakes. */
export const AUTH_API = new InjectionToken<AuthApi>('AUTH_API', {
  providedIn: 'root',
  factory: criarAuthApi,
});
