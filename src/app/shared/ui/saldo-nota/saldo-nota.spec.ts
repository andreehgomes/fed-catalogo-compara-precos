import { TestBed } from '@angular/core/testing';
import { texto } from '../../../../testing/dom';
import { SaldoNota } from './saldo-nota';

function criar(saldo: number, grande = false) {
  const fixture = TestBed.createComponent(SaldoNota);
  fixture.componentRef.setInput('saldo', saldo);
  fixture.componentRef.setInput('grande', grande);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  return {
    icone: texto(el.querySelector('mat-icon')),
    texto: texto(el),
    classe: el.querySelector('span')?.className ?? '',
  };
}

describe('SaldoNota', () => {
  it('positivo: gastou a mais, com ícone e cor', () => {
    const r = criar(3.2);
    expect(r.icone).toBe('trending_up');
    expect(r.texto).toContain('R$ 3,20 a mais');
    expect(r.classe).toContain('saldo--mais-caro');
  });

  it('negativo: economia em valor absoluto', () => {
    const r = criar(-30.2, true);
    expect(r.icone).toBe('trending_down');
    expect(r.texto).toContain('R$ 30,20 de economia');
    expect(r.classe).toContain('saldo--mais-barato');
    expect(r.classe).toContain('saldo--grande');
  });

  it('zero: saldo zerado', () => {
    const r = criar(0);
    expect(r.icone).toBe('check');
    expect(r.texto).toContain('Saldo zerado');
  });
});
