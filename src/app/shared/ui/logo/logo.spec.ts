import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { temaFalso } from '../../../../testing/tema';
import { TemaService } from '../../../core/tema/tema.service';
import { Logo } from './logo';

@Component({
  imports: [Logo],
  template: `
    <cp-logo class="completa" prioritaria />
    <cp-logo class="simbolo" variante="simbolo" />
  `,
})
class Hospedeiro {}

function montar(fake = temaFalso()) {
  TestBed.configureTestingModule({ providers: fake.providers });
  const fixture = TestBed.createComponent(Hospedeiro);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const img = (classe: string) => el.querySelector<HTMLImageElement>(`.${classe} img`)!;
  return { fixture, img, ...fake };
}

describe('Logo', () => {
  afterEach(() => delete document.documentElement.dataset['tema']);

  it('no claro usa as imagens da marca para fundo claro', () => {
    const { img } = montar();
    expect(img('completa').getAttribute('src')).toBe('logo/logo.png');
    expect(img('completa').getAttribute('alt')).toBe('Cupom Esperto');
    expect(img('completa').getAttribute('fetchpriority')).toBe('high');
    expect(img('simbolo').getAttribute('src')).toBe('logo/simbolo.png');
    expect(img('simbolo').getAttribute('width')).toBe('40');
  });

  it('troca para as versões escuras quando o tema fica escuro', () => {
    const { fixture, img, prefereEscuro } = montar();
    prefereEscuro.set(true);
    fixture.detectChanges();
    expect(img('completa').getAttribute('src')).toBe('logo/logo-escuro.png');
    expect(img('simbolo').getAttribute('src')).toBe('logo/simbolo-escuro.png');

    TestBed.inject(TemaService).definir('claro');
    fixture.detectChanges();
    expect(img('completa').getAttribute('src')).toBe('logo/logo.png');
  });
});
