import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { AuthStore } from '../../core/auth/auth.store';
import { digitar, enviar, porRotulo, texto } from '../../../testing/dom';
import CadastroPage from './cadastro/cadastro.page';
import LoginPage from './login/login.page';
import RedefinirSenhaPage from './redefinir-senha/redefinir-senha.page';

function montar() {
  const auth = {
    entrar: vi.fn(async () => undefined),
    cadastrar: vi.fn(async () => undefined),
    redefinirSenha: vi.fn(async () => undefined),
  };
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: AuthStore, useValue: auth }],
  });
  const router = TestBed.inject(Router);
  const navegar = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
  return { auth, navegar };
}

describe('LoginPage', () => {
  it('valida e-mail e senha antes de chamar o Firebase, com erro acessível', async () => {
    const { auth } = montar();
    const fixture = TestBed.createComponent(LoginPage);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    await enviar(fixture);
    expect(texto(el.querySelector('#login-email-erro'))).toBe('Informe o e-mail.');
    expect(texto(el.querySelector('#login-senha-erro'))).toBe('Informe a senha.');

    digitar(porRotulo(el, 'E-mail'), 'nao-e-email');
    digitar(porRotulo(el, 'Senha'), '123');
    fixture.detectChanges();
    await enviar(fixture);

    const email = porRotulo(el, 'E-mail');
    expect(texto(el.querySelector('#login-email-erro'))).toBe('E-mail inválido.');
    expect(email.getAttribute('aria-invalid')).toBe('true');
    expect(email.getAttribute('aria-describedby')).toBe('login-email-erro');
    expect(texto(el.querySelector('#login-senha-erro'))).toBe(
      'A senha tem pelo menos 8 caracteres.',
    );
    expect(auth.entrar).not.toHaveBeenCalled();
  });

  it('entra e navega para a URL de retorno', async () => {
    const { auth, navegar } = montar();
    const fixture = TestBed.createComponent(LoginPage);
    fixture.componentRef.setInput('voltar', '/notas/123');
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    digitar(porRotulo(el, 'E-mail'), 'ana@exemplo.com');
    digitar(porRotulo(el, 'Senha'), 'segredo123');
    await enviar(fixture);
    expect(auth.entrar).toHaveBeenCalledWith('ana@exemplo.com', 'segredo123');
    expect(navegar).toHaveBeenCalledWith('/notas/123');
  });

  it('ignora URL de retorno externa', async () => {
    const { navegar } = montar();
    const fixture = TestBed.createComponent(LoginPage);
    fixture.componentRef.setInput('voltar', '//evil.com');
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    digitar(porRotulo(el, 'E-mail'), 'ana@exemplo.com');
    digitar(porRotulo(el, 'Senha'), 'segredo123');
    await enviar(fixture);
    expect(navegar).toHaveBeenCalledWith('/');
  });

  it('mostra o erro do Firebase em pt-BR', async () => {
    const { auth, navegar } = montar();
    auth.entrar.mockRejectedValueOnce({ code: 'auth/invalid-credential' });
    const fixture = TestBed.createComponent(LoginPage);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    digitar(porRotulo(el, 'E-mail'), 'ana@exemplo.com');
    digitar(porRotulo(el, 'Senha'), 'errada123');
    await enviar(fixture);
    expect(texto(el.querySelector('[role="alert"]'))).toContain('E-mail ou senha incorretos.');
    expect(navegar).not.toHaveBeenCalled();
  });
});

describe('CadastroPage', () => {
  it('exige e-mail válido e senha de 8 caracteres', async () => {
    const { auth } = montar();
    const fixture = TestBed.createComponent(CadastroPage);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    digitar(porRotulo(el, 'E-mail'), 'x@');
    digitar(porRotulo(el, 'Senha'), 'curta');
    await enviar(fixture);
    expect(texto(el.querySelector('#cadastro-email-erro'))).toBe('E-mail inválido.');
    expect(texto(el.querySelector('#cadastro-senha-erro'))).toBe(
      'A senha precisa ter pelo menos 8 caracteres.',
    );
    expect(auth.cadastrar).not.toHaveBeenCalled();
  });

  it('cadastra e vai para o painel', async () => {
    const { auth, navegar } = montar();
    const fixture = TestBed.createComponent(CadastroPage);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    digitar(porRotulo(el, 'Nome (opcional)'), 'Ana');
    digitar(porRotulo(el, 'E-mail'), 'ana@exemplo.com');
    digitar(porRotulo(el, 'Senha'), 'segredo123');
    await enviar(fixture);
    expect(auth.cadastrar).toHaveBeenCalledWith('Ana', 'ana@exemplo.com', 'segredo123');
    expect(navegar).toHaveBeenCalledWith('/');
  });

  it('e-mail já usado vira mensagem em pt-BR', async () => {
    const { auth } = montar();
    auth.cadastrar.mockRejectedValueOnce({ code: 'auth/email-already-in-use' });
    const fixture = TestBed.createComponent(CadastroPage);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    digitar(porRotulo(el, 'E-mail'), 'ana@exemplo.com');
    digitar(porRotulo(el, 'Senha'), 'segredo123');
    await enviar(fixture);
    expect(texto(el.querySelector('[role="alert"]'))).toContain(
      'Já existe uma conta com este e-mail.',
    );
  });
});

describe('RedefinirSenhaPage', () => {
  it('envia o link e confirma sem revelar se a conta existe', async () => {
    const { auth } = montar();
    const fixture = TestBed.createComponent(RedefinirSenhaPage);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    digitar(porRotulo(el, 'E-mail'), 'ana@exemplo.com');
    await enviar(fixture);
    expect(auth.redefinirSenha).toHaveBeenCalledWith('ana@exemplo.com');
    expect(texto(el.querySelector('[role="status"]'))).toContain(
      'Se houver uma conta com este e-mail',
    );
  });

  it('usuário inexistente mostra a mesma confirmação', async () => {
    const { auth } = montar();
    auth.redefinirSenha.mockRejectedValueOnce({ code: 'auth/user-not-found' });
    const fixture = TestBed.createComponent(RedefinirSenhaPage);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    digitar(porRotulo(el, 'E-mail'), 'ana@exemplo.com');
    await enviar(fixture);
    expect(el.querySelector('[role="status"]')).not.toBeNull();
  });

  it('outros erros aparecem', async () => {
    const { auth } = montar();
    auth.redefinirSenha.mockRejectedValueOnce({ code: 'auth/too-many-requests' });
    const fixture = TestBed.createComponent(RedefinirSenhaPage);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    digitar(porRotulo(el, 'E-mail'), 'ana@exemplo.com');
    await enviar(fixture);
    expect(texto(el.querySelector('[role="alert"]'))).toContain('Muitas tentativas');
  });
});
