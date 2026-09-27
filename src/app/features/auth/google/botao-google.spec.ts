import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { AuthStore } from '../../../core/auth/auth.store';
import { botao, texto } from '../../../../testing/dom';
import { BotaoGoogle } from './botao-google';

function montar(destino = '/') {
  const auth = { entrarComGoogle: vi.fn(async (): Promise<'ok' | 'redirecionando'> => 'ok') };
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: AuthStore, useValue: auth }],
  });
  const navegar = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  const fixture = TestBed.createComponent(BotaoGoogle);
  fixture.componentRef.setInput('destino', destino);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const clicar = async () => {
    botao(el, 'Continuar com Google').click();
    await fixture.whenStable();
    fixture.detectChanges();
  };
  return { auth, navegar, el, clicar };
}

describe('BotaoGoogle', () => {
  it('entra e navega para o destino', async () => {
    const { auth, navegar, clicar } = montar('/notas');
    await clicar();
    expect(auth.entrarComGoogle).toHaveBeenCalled();
    expect(navegar).toHaveBeenCalledWith('/notas');
  });

  it('no redirect não navega (a página vai sair)', async () => {
    const { auth, navegar, clicar } = montar();
    auth.entrarComGoogle.mockResolvedValueOnce('redirecionando');
    await clicar();
    expect(navegar).not.toHaveBeenCalled();
  });

  it('popup fechado pelo usuário não mostra erro', async () => {
    const { auth, el, clicar } = montar();
    auth.entrarComGoogle.mockRejectedValueOnce({ code: 'auth/popup-closed-by-user' });
    await clicar();
    expect(el.querySelector('[role="alert"]')).toBeNull();
  });

  it('outros erros aparecem em pt-BR', async () => {
    const { auth, el, clicar } = montar();
    auth.entrarComGoogle.mockRejectedValueOnce({
      code: 'auth/account-exists-with-different-credential',
    });
    await clicar();
    expect(texto(el.querySelector('[role="alert"]'))).toContain(
      'Este e-mail já tem conta com senha',
    );
  });
});
