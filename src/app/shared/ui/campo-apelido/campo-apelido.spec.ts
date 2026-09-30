import { Component, signal, viewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { digitar, porRotulo, texto } from '../../../../testing/dom';
import { CampoApelido } from './campo-apelido';

@Component({
  imports: [CampoApelido],
  template: `<cp-campo-apelido
    [(valor)]="valor"
    nomeOficial="CONDOR SUPER CENTER LTDA"
    [erroServidor]="erroServidor()"
  />`,
})
class Hospedeiro {
  readonly valor = signal('Condor Super Center');
  readonly erroServidor = signal<string | null>(null);
  readonly campo = viewChild.required(CampoApelido);
}

function montar() {
  const fixture = TestBed.createComponent(Hospedeiro);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const input = porRotulo(el, 'Como você chama esta loja?');
  return { fixture, el, input, host: fixture.componentInstance };
}

describe('CampoApelido', () => {
  it('label acessível, ajuda e valor inicial (sugestão)', () => {
    const { el, input, host } = montar();
    expect(input.value).toBe('Condor Super Center');
    expect(input.getAttribute('maxlength')).toBe('60');
    expect(texto(el)).toContain('Só você vê esse nome. Deixe em branco para usar o nome oficial.');
    const ajuda = el.querySelector(`#${input.getAttribute('aria-describedby')}`);
    expect(texto(ajuda)).toContain('Só você vê esse nome');
    expect(host.campo().valido()).toBe(true);
  });

  it.each([['a'], ['***']])('"%s" mostra o erro e fica inválido', (valor) => {
    const { fixture, el, input, host } = montar();
    digitar(input, valor);
    fixture.detectChanges();
    expect(host.valor()).toBe(valor);
    expect(host.campo().valido()).toBe(false);
    expect(input.getAttribute('aria-invalid')).toBe('true');
    const erro = el.querySelector('.cp-field-error');
    expect(texto(erro)).toBe('Esse nome não serve. Use de 2 a 60 caracteres, com letras.');
    expect(input.getAttribute('aria-describedby')).toContain(erro!.id);
  });

  it('vazio é válido (usa o nome oficial)', () => {
    const { fixture, el, input, host } = montar();
    digitar(input, '');
    fixture.detectChanges();
    expect(host.campo().valido()).toBe(true);
    expect(el.querySelector('.cp-field-error')).toBeNull();
    expect(input.getAttribute('aria-invalid')).toBe('false');
  });

  it('mostra o erro do servidor', () => {
    const { fixture, el, host } = montar();
    host.erroServidor.set('Esse nome não serve.');
    fixture.detectChanges();
    expect(texto(el.querySelector('.cp-field-error'))).toBe('Esse nome não serve.');
  });
});
