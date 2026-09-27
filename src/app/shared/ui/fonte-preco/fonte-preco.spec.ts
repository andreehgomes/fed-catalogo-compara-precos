import { TestBed } from '@angular/core/testing';
import { FonteDoPreco, FontePrecoInfo, haQuantoTempo } from './fonte-preco';

function texto(fonte: FonteDoPreco, data: Date | string | null = null) {
  const fixture = TestBed.createComponent(FontePrecoInfo);
  fixture.componentRef.setInput('fonte', fonte);
  fixture.componentRef.setInput('data', data);
  fixture.detectChanges();
  return (fixture.nativeElement as HTMLElement).textContent?.replace(/\s+/g, ' ').trim();
}

describe('FontePrecoInfo', () => {
  it('identifica cada fonte com ícone e rótulo', () => {
    expect(texto('menor-preco')).toBe('account_balance Menor Preço – Nota Paraná');
    expect(texto('comunidade')).toBe('groups Comunidade');
    expect(texto('minhas-notas')).toBe('receipt_long Suas notas');
  });

  it('acrescenta há quanto tempo', () => {
    const tresDias = new Date(Date.now() - 3 * 86_400_000);
    expect(texto('menor-preco', tresDias)).toBe('account_balance Menor Preço – Nota Paraná · há 3 dias');
  });

  it('ignora data inválida', () => {
    expect(texto('comunidade', 'xx')).toBe('groups Comunidade');
  });
});

describe('haQuantoTempo', () => {
  const agora = new Date(2026, 8, 27, 10);
  it('hoje, ontem e dias', () => {
    expect(haQuantoTempo(new Date(2026, 8, 27, 1), agora)).toBe('hoje');
    expect(haQuantoTempo(new Date(2026, 8, 26, 23), agora)).toBe('ontem');
    expect(haQuantoTempo(new Date(2026, 8, 20), agora)).toBe('há 7 dias');
    expect(haQuantoTempo(new Date(2026, 8, 28), agora)).toBe('hoje');
  });
});
