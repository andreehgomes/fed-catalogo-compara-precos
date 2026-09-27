import { TestBed } from '@angular/core/testing';
import { Preco } from './preco';

function criar(valor: number, unidade: string | null = null, porUnidade: number | null = null) {
  const fixture = TestBed.createComponent(Preco);
  fixture.componentRef.setInput('valor', valor);
  fixture.componentRef.setInput('unidade', unidade);
  fixture.componentRef.setInput('precoPorUnidade', porUnidade);
  fixture.detectChanges();
  return [...(fixture.nativeElement as HTMLElement).querySelectorAll('span')]
    .map((s) => s.textContent?.replace(/\s+/g, ' ').trim())
    .join(' | ');
}

describe('Preco', () => {
  it('formata o valor em BRL', () => {
    expect(criar(12.9)).toBe('R$ 12,90');
  });

  it('mostra o preço por unidade base quando informado', () => {
    expect(criar(4.49, 'kg', 8.98)).toBe('R$ 4,49 | R$ 8,98/kg');
  });

  it('não mostra a linha de unidade sem unidade', () => {
    expect(criar(4.49, null, 8.98)).toBe('R$ 4,49');
  });
});
