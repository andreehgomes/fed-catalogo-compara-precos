import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Observable, Subject, of, throwError } from 'rxjs';
import { vi } from 'vitest';
import coca from '../../../testing/fixtures/menor-preco/gtin-coca-cola.json';
import p1 from '../../../testing/fixtures/menor-preco/termo-leite-integral-p1.json';
import p2 from '../../../testing/fixtures/menor-preco/termo-leite-integral-p2.json';
import { texto } from '../../../testing/dom';
import { FontePrecosRegiao } from './data-access/fonte-precos-regiao';
import { mapearProdutos } from './data-access/menor-preco.schema';
import { FonteIndisponivelError, ResultadoBusca } from './data-access/regiao.model';
import { LocalizacaoStore } from './localizacao/localizacao.store';
import { RegiaoStore, TAMANHO_PAGINA } from './regiao.store';
import { ResultadoGtin } from './resultado-gtin/resultado-gtin';
import { formatarDistancia } from './ui/oferta-row';

function fonteFalsa(respostas: Record<number, Observable<ResultadoBusca>>) {
  return {
    porGtin: vi.fn(
      ({ offset = 0 }: { offset?: number }) =>
        respostas[offset] ?? of(mapearProdutos({ total: 0, produtos: [] })),
    ),
    porTermo: vi.fn(
      ({ offset = 0 }: { offset?: number }) =>
        respostas[offset] ?? of(mapearProdutos({ total: 0, produtos: [] })),
    ),
    categorias: vi.fn(() => of([{ id: 2, desc: 'Leite e derivados', qtd: 291 }])),
  };
}

function montarStore(fonte: ReturnType<typeof fonteFalsa>) {
  const loc = { geohash: signal<string | null>('6gkzqfb'), raioKm: signal(2) };
  TestBed.configureTestingModule({
    providers: [
      RegiaoStore,
      { provide: FontePrecosRegiao, useValue: fonte },
      { provide: LocalizacaoStore, useValue: loc },
    ],
  });
  return { store: TestBed.inject(RegiaoStore), loc };
}

describe('RegiaoStore', () => {
  it('pagina de 29 em 29 sem repetir ofertas (as páginas reais se sobrepõem)', async () => {
    const fonte = fonteFalsa({ 0: of(mapearProdutos(p1)), 29: of(mapearProdutos(p2)) });
    const { store } = montarStore(fonte);
    store.buscar({ tipo: 'termo', valor: 'leite integral', categoria: null });
    await vi.waitFor(() => expect(store.resultado()).not.toBeNull());
    expect(store.ofertas()).toHaveLength(p1.produtos.length);
    expect(store.temMais()).toBe(true);

    store.carregarMais();
    const ids = store.ofertas().map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
    const unicos = new Set([...p1.produtos, ...p2.produtos].map((p) => p.id)).size;
    expect(ids).toHaveLength(unicos);
    expect(fonte.porTermo).toHaveBeenLastCalledWith(
      expect.objectContaining({ offset: TAMANHO_PAGINA, categoria: null }),
    );
  });

  it('no máximo 1 página extra em voo', async () => {
    const pendente = new Subject<ResultadoBusca>();
    const fonte = fonteFalsa({ 0: of(mapearProdutos(p1)), 29: pendente });
    const { store } = montarStore(fonte);
    store.buscar({ tipo: 'termo', valor: 'leite', categoria: null });
    await vi.waitFor(() => expect(store.resultado()).not.toBeNull());
    store.carregarMais();
    store.carregarMais();
    expect(fonte.porTermo).toHaveBeenCalledTimes(2);
    expect(store.carregandoMais()).toBe(true);
  });

  it('respeita a categoria e busca categorias só no modo texto', async () => {
    const fonte = fonteFalsa({ 0: of(mapearProdutos(p1)) });
    const { store } = montarStore(fonte);
    store.buscar({ tipo: 'termo', valor: 'leite', categoria: 2 });
    await vi.waitFor(() => expect(store.categorias.hasValue()).toBe(true));
    expect(fonte.porTermo).toHaveBeenCalledWith(
      expect.objectContaining({ categoria: 2, local: '6gkzqfb', raioKm: 2 }),
    );
    store.buscar({ tipo: 'gtin', valor: '7894900011517' });
    await vi.waitFor(() => expect(fonte.porGtin).toHaveBeenCalled());
    expect(fonte.categorias).toHaveBeenCalledTimes(1);
  });

  it('API fora do ar vira "indisponível", sem retry automático; "tentar de novo" é manual', async () => {
    const fonte = fonteFalsa({ 0: throwError(() => new FonteIndisponivelError('http')) });
    const { store } = montarStore(fonte);
    store.buscar({ tipo: 'gtin', valor: '7894900011517' });
    await vi.waitFor(() => expect(store.indisponivel()).toBe(true));
    expect(fonte.porGtin).toHaveBeenCalledTimes(1);
    store.tentarDeNovo();
    await vi.waitFor(() => expect(fonte.porGtin).toHaveBeenCalledTimes(2));
  });

  it('sem localização não busca', () => {
    const fonte = fonteFalsa({});
    const { store, loc } = montarStore(fonte);
    loc.geohash.set(null);
    store.buscar({ tipo: 'gtin', valor: '7894900011517' });
    TestBed.tick();
    expect(fonte.porGtin).not.toHaveBeenCalled();
  });
});

describe('ResultadoGtin', () => {
  it('fixture real da Coca-Cola: divergentes ocultos e o menor preço exibido é da Coca', () => {
    const fixture = TestBed.createComponent(ResultadoGtin);
    fixture.componentRef.setInput('ofertas', mapearProdutos(coca).ofertas);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const listas = el.querySelectorAll('ul');
    expect(listas).toHaveLength(1);
    const primeira = el.querySelector('li')!;
    expect(texto(primeira)).toContain('COCA');
    expect(texto(primeira)).toContain('Menor preço');
    expect(texto(el)).not.toContain('CAFE VIAGEM');

    const botao = [...el.querySelectorAll('button')].find((b) =>
      /Mostrar \d+ resultados/.test(texto(b)),
    )!;
    expect(botao.getAttribute('aria-expanded')).toBe('false');
    botao.click();
    fixture.detectChanges();
    expect(texto(el)).toContain('CAFE VIAGEM');
    expect(texto(el)).toContain('código de barras errado');
    const divergentes = fixture.componentInstance.divergentes().map((o) => o.descricao);
    expect(divergentes).toEqual(expect.arrayContaining(['AGUA', 'AGUA C GAS', 'CAFE VIAGEM']));
    expect(fixture.componentInstance.coerentes()[0].descricao).toMatch(/COCA/);
  });
});

describe('formatarDistancia', () => {
  it('metros abaixo de 1 km e km com vírgula', () => {
    expect(formatarDistancia(0.198)).toBe('200 m');
    expect(formatarDistancia(0.004)).toBe('10 m');
    expect(formatarDistancia(1.442)).toBe('1,4 km');
  });
});
