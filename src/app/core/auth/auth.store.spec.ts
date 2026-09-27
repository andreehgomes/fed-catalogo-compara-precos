import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { FIREBASE_AUTH } from '../firebase/firebase.providers';
import { AUTH_API, AuthApi } from './auth-api';
import { AuthStore, mensagemErroAuth } from './auth.store';

function criarApi() {
  let ouvinte: ((u: unknown) => void) | null = null;
  const cancelar = vi.fn();
  const provedor = { parametros: null as unknown, setCustomParameters: vi.fn() };
  provedor.setCustomParameters.mockImplementation((p: unknown) => (provedor.parametros = p));
  const api = {
    onAuthStateChanged: vi.fn((_a: unknown, cb: (u: unknown) => void) => {
      ouvinte = cb;
      return cancelar;
    }),
    signInWithEmailAndPassword: vi.fn(async () => ({})),
    createUserWithEmailAndPassword: vi.fn(async () => ({ user: { uid: 'novo' } })),
    updateProfile: vi.fn(async () => undefined),
    signOut: vi.fn(async () => undefined),
    sendPasswordResetEmail: vi.fn(async () => undefined),
    signInWithPopup: vi.fn(async (): Promise<unknown> => ({})),
    signInWithRedirect: vi.fn(async () => undefined),
    novoProvedorGoogle: vi.fn(() => provedor),
  };
  return { api, cancelar, provedor, emitir: (u: unknown) => ouvinte?.(u) };
}

describe('AuthStore', () => {
  const auth = { nome: 'auth-fake' };
  let fake: ReturnType<typeof criarApi>;
  let store: AuthStore;

  beforeEach(() => {
    fake = criarApi();
    TestBed.configureTestingModule({
      providers: [
        { provide: FIREBASE_AUTH, useValue: auth },
        { provide: AUTH_API, useValue: fake.api as unknown as AuthApi },
      ],
    });
    store = TestBed.inject(AuthStore);
  });

  it('começa resolvendo (undefined), sem decidir logado', () => {
    expect(store.usuario()).toBeUndefined();
    expect(store.pronto()).toBe(false);
    expect(store.logado()).toBe(false);
  });

  it('fica logado quando o SDK emite um usuário', () => {
    fake.emitir({ uid: 'u1' });
    expect(store.pronto()).toBe(true);
    expect(store.logado()).toBe(true);
    expect(store.uid()).toBe('u1');
  });

  it('fica deslogado quando o SDK emite null', () => {
    fake.emitir(null);
    expect(store.pronto()).toBe(true);
    expect(store.logado()).toBe(false);
    expect(store.uid()).toBeNull();
  });

  it('delega ao SDK', async () => {
    await store.entrar(' a@b.com ', 'segredo123');
    expect(fake.api.signInWithEmailAndPassword).toHaveBeenCalledWith(auth, 'a@b.com', 'segredo123');
    await store.cadastrar('Ana', 'a@b.com', 'segredo123');
    expect(fake.api.createUserWithEmailAndPassword).toHaveBeenCalledWith(
      auth,
      'a@b.com',
      'segredo123',
    );
    expect(fake.api.updateProfile).toHaveBeenCalledWith({ uid: 'novo' }, { displayName: 'Ana' });
    await store.cadastrar('', 'c@d.com', 'segredo123');
    expect(fake.api.updateProfile).toHaveBeenCalledTimes(1);
    await store.redefinirSenha('a@b.com');
    expect(fake.api.sendPasswordResetEmail).toHaveBeenCalledWith(auth, 'a@b.com');
    await store.sair();
    expect(fake.api.signOut).toHaveBeenCalledWith(auth);
  });

  it('entra com Google por popup, escolhendo a conta', async () => {
    expect(await store.entrarComGoogle()).toBe('ok');
    expect(fake.provedor.parametros).toEqual({ prompt: 'select_account' });
    expect(fake.api.signInWithPopup).toHaveBeenCalledWith(auth, fake.provedor);
    expect(fake.api.signInWithRedirect).not.toHaveBeenCalled();
  });

  it('cai para redirect quando o popup é bloqueado', async () => {
    fake.api.signInWithPopup.mockRejectedValueOnce({ code: 'auth/popup-blocked' });
    expect(await store.entrarComGoogle()).toBe('redirecionando');
    expect(fake.api.signInWithRedirect).toHaveBeenCalledWith(auth, fake.provedor);
  });

  it('propaga outros erros do popup', async () => {
    fake.api.signInWithPopup.mockRejectedValueOnce({ code: 'auth/popup-closed-by-user' });
    await expect(store.entrarComGoogle()).rejects.toEqual({ code: 'auth/popup-closed-by-user' });
  });

  it('cancela o listener ao destruir', () => {
    TestBed.resetTestingModule();
    expect(fake.cancelar).toHaveBeenCalled();
  });
});

describe('mensagemErroAuth', () => {
  it('mapeia os códigos do Firebase para pt-BR', () => {
    expect(mensagemErroAuth({ code: 'auth/invalid-credential' })).toBe(
      'E-mail ou senha incorretos.',
    );
    expect(mensagemErroAuth({ code: 'auth/email-already-in-use' })).toBe(
      'Já existe uma conta com este e-mail.',
    );
    expect(mensagemErroAuth({ code: 'auth/too-many-requests' })).toContain('Muitas tentativas');
    expect(mensagemErroAuth({ code: 'outro' })).toBe('Não foi possível concluir. Tente de novo.');
    expect(mensagemErroAuth(null)).toBe('Não foi possível concluir. Tente de novo.');
  });
});
