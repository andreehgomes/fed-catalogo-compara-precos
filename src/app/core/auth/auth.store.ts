import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import type { User } from 'firebase/auth';
import { FIREBASE_AUTH } from '../firebase/firebase.providers';
import { AUTH_API } from './auth-api';

@Injectable({ providedIn: 'root' })
export class AuthStore {
  private readonly auth = inject(FIREBASE_AUTH);
  private readonly api = inject(AUTH_API);
  private readonly _usuario = signal<User | null | undefined>(undefined);

  readonly usuario = this._usuario.asReadonly();
  readonly pronto = computed(() => this._usuario() !== undefined);
  readonly logado = computed(() => !!this._usuario());
  readonly uid = computed(() => this._usuario()?.uid ?? null);

  constructor() {
    const cancelar = this.api.onAuthStateChanged(this.auth, (u) => this._usuario.set(u));
    inject(DestroyRef).onDestroy(cancelar);
    if (lerMarca()) {
      limparMarca();
      void this.api.getRedirectResult(this.auth).catch(() => undefined);
    }
  }

  async entrar(email: string, senha: string): Promise<void> {
    await this.api.signInWithEmailAndPassword(this.auth, email.trim(), senha);
  }

  async entrarComGoogle(): Promise<'ok' | 'redirecionando'> {
    const provedor = this.api.novoProvedorGoogle();
    provedor.setCustomParameters({ prompt: 'select_account' });
    try {
      await this.api.signInWithPopup(this.auth, provedor);
      return 'ok';
    } catch (erro) {
      if ((erro as { code?: string }).code !== 'auth/popup-blocked') throw erro;
      marcarRedirect();
      await this.api.signInWithRedirect(this.auth, provedor);
      return 'redirecionando';
    }
  }

  async cadastrar(nome: string, email: string, senha: string): Promise<void> {
    const { user } = await this.api.createUserWithEmailAndPassword(this.auth, email.trim(), senha);
    if (nome.trim()) await this.api.updateProfile(user, { displayName: nome.trim() });
  }

  async sair(): Promise<void> {
    await this.api.signOut(this.auth);
  }

  async redefinirSenha(email: string): Promise<void> {
    await this.api.sendPasswordResetEmail(this.auth, email.trim());
  }
}

const MARCA_REDIRECT = 'cp-login-google-redirect';

/** Só completa o redirect do Google quando foi este app que o iniciou (evita o iframe no boot). */
function marcarRedirect(): void {
  try {
    sessionStorage.setItem(MARCA_REDIRECT, '1');
  } catch {
    /* sem storage: o redirect ainda autentica pela persistência */
  }
}

function lerMarca(): boolean {
  try {
    return sessionStorage.getItem(MARCA_REDIRECT) === '1';
  } catch {
    return false;
  }
}

function limparMarca(): void {
  try {
    sessionStorage.removeItem(MARCA_REDIRECT);
  } catch {
    /* nada a limpar */
  }
}

const MENSAGENS: Readonly<Record<string, string>> = {
  'auth/invalid-credential': 'E-mail ou senha incorretos.',
  'auth/wrong-password': 'E-mail ou senha incorretos.',
  'auth/user-not-found': 'E-mail ou senha incorretos.',
  'auth/invalid-email': 'E-mail inválido.',
  'auth/user-disabled': 'Esta conta foi desativada.',
  'auth/email-already-in-use': 'Já existe uma conta com este e-mail.',
  'auth/weak-password': 'A senha precisa ter pelo menos 8 caracteres.',
  'auth/too-many-requests': 'Muitas tentativas. Aguarde alguns minutos e tente de novo.',
  'auth/network-request-failed': 'Sem conexão. Verifique a internet e tente de novo.',
  'auth/missing-email': 'Informe o e-mail.',
  'auth/popup-closed-by-user': 'O login com Google foi cancelado.',
  'auth/cancelled-popup-request': 'O login com Google foi cancelado.',
  'auth/account-exists-with-different-credential':
    'Este e-mail já tem conta com senha. Entre com e-mail e senha.',
  'auth/unauthorized-domain': 'Este endereço não está autorizado para login com Google.',
};

export function mensagemErroAuth(erro: unknown): string {
  const codigo = (erro as { code?: unknown } | null)?.code;
  return (
    (typeof codigo === 'string' && MENSAGENS[codigo]) || 'Não foi possível concluir. Tente de novo.'
  );
}
