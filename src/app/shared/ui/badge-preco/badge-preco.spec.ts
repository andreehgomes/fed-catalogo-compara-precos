import { TestBed } from '@angular/core/testing';
import { BadgePreco, TipoBadgePreco } from './badge-preco';

function criar(tipo: TipoBadgePreco, diferenca: number | null = null) {
  const fixture = TestBed.createComponent(BadgePreco);
  fixture.componentRef.setInput('tipo', tipo);
  fixture.componentRef.setInput('diferenca', diferenca);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  return {
    icone: el.querySelector('mat-icon')?.textContent?.trim(),
    texto: el.textContent?.replace(/\s+/g, ' ').trim(),
    classe: el.querySelector('span')?.className,
  };
}

describe('BadgePreco', () => {
  it('mais barato tem ícone, texto e cor', () => {
    const r = criar('mais-barato', 1.2);
    expect(r.icone).toBe('trending_down');
    expect(r.texto).toContain('R$ 1,20 mais barato');
    expect(r.classe).toContain('cp-badge--mais-barato');
  });

  it('mais caro tem ícone e texto, não só cor', () => {
    const r = criar('mais-caro', 0.8);
    expect(r.icone).toBe('trending_up');
    expect(r.texto).toContain('R$ 0,80 mais caro');
  });

  it('sem diferença mostra só o texto do tipo', () => {
    expect(criar('mais-barato').texto).toContain('Mais barato');
    expect(criar('mais-caro').texto).toContain('Mais caro');
  });

  it('igual mostra texto próprio', () => {
    const r = criar('igual');
    expect(r.icone).toBe('check');
    expect(r.texto).toContain('Mesmo preço');
  });
});
