import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import p1 from '../../../testing/fixtures/menor-preco/termo-leite-integral-p1.json';
import { digitar, porRotulo, texto } from '../../../testing/dom';
import BuscaRegiaoPage, { DEBOUNCE_MS } from './busca-regiao.page';
import { FontePrecosRegiao } from './data-access/fonte-precos-regiao';
import { mapearProdutos } from './data-access/menor-preco.schema';
import { FonteIndisponivelError } from './data-access/regiao.model';
import { LocalizacaoStore } from './localizacao/localizacao.store';

function montar(opcoes: { pronta?: boolean; falhar?: boolean } = {}) {
  const fonte = {
    porGtin: vi.fn(() =>
      opcoes.falhar ? throwError(() => new FonteIndisponivelError('http')) : of(mapearProdutos(p1)),
    ),
    porTermo: vi.fn(() => of(mapearProdutos(p1))),
    categorias: vi.fn(() =>
      of([
        { id: 2, desc: 'Leite e derivados', qtd: 291 },
        { id: 13, desc: 'Preparos', qtd: 24 },
      ]),
    ),
  };
  const pronta = opcoes.pronta ?? true;
  const loc = {
    pronta: signal(pronta),
    geohash: signal(pronta ? '6gkzqfb' : null),
    raioKm: signal(2),
    descricao: signal('Curitiba'),
    status: signal('ocioso'),
    municipio: signal('Curitiba'),
    municipios: vi.fn(async () => []),
    definirRaio: vi.fn(),
    usarGps: vi.fn(),
  };
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: FontePrecosRegiao, useValue: fonte },
      { provide: LocalizacaoStore, useValue: loc },
    ],
  });
  const navegar = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  const fixture = TestBed.createComponent(BuscaRegiaoPage);
  return { fixture, el: fixture.nativeElement as HTMLElement, fonte, navegar };
}

describe('BuscaRegiaoPage', () => {
  afterEach(() => vi.useRealTimers());

  it('sem localização mostra o seletor explicando o serviço', () => {
    const { fixture, el } = montar({ pronta: false });
    fixture.detectChanges();
    expect(texto(el)).toContain('Onde você está?');
    expect(texto(el)).toContain('Menor Preço, do Governo do Paraná');
    expect(el.querySelector('input[type="search"]')).toBeNull();
  });

  it('texto vira termo depois do debounce de 400 ms', async () => {
    vi.useFakeTimers();
    const { fixture, el, navegar } = montar();
    fixture.detectChanges();
    const campo = porRotulo(el, 'Produto ou código de barras');
    campo.value = 'leite integral';
    campo.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    vi.advanceTimersByTime(DEBOUNCE_MS - 50);
    TestBed.tick();
    expect(navegar).not.toHaveBeenCalled();
    vi.advanceTimersByTime(DEBOUNCE_MS + 1);
    fixture.detectChanges();
    await Promise.resolve();
    TestBed.tick();
    expect(navegar).toHaveBeenCalledWith(
      [],
      expect.objectContaining({
        queryParams: { termo: 'leite integral', gtin: null, categoria: null },
      }),
    );
  });

  it('um termo só de dígitos com GTIN válido vira busca por gtin', async () => {
    vi.useFakeTimers();
    const { fixture, el, navegar } = montar();
    fixture.detectChanges();
    digitar(porRotulo(el, 'Produto ou código de barras'), '7894900011517');
    vi.advanceTimersByTime(DEBOUNCE_MS + 1);
    TestBed.tick();
    expect(navegar).toHaveBeenCalledWith(
      [],
      expect.objectContaining({
        queryParams: { gtin: '7894900011517', termo: null, categoria: null },
      }),
    );
  });

  it('query param termo busca, mostra resumo, chips de categoria e fonte', async () => {
    const { fixture, el, fonte } = montar();
    fixture.componentRef.setInput('termo', 'leite integral');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fonte.porTermo).toHaveBeenCalledWith(
      expect.objectContaining({ termo: 'leite integral', offset: 0 }),
    );
    expect(texto(el)).toContain('340 ofertas');
    expect(texto(el)).toContain('Leite e derivados (291)');
    expect(texto(el)).toContain('Menor Preço – Nota Paraná');
  });

  it('API bloqueada mostra "Menor Preço indisponível agora" com tentar de novo manual', async () => {
    const { fixture, el, fonte } = montar({ falhar: true });
    fixture.componentRef.setInput('gtin', '7894900011517');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(texto(el)).toContain('Menor Preço indisponível agora');
    const botao = [...el.querySelectorAll('button')].find((b) => texto(b) === 'Tentar de novo')!;
    botao.click();
    await fixture.whenStable();
    expect(fonte.porGtin).toHaveBeenCalledTimes(2);
  });
});
