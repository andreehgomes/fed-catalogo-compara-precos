import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import categorias from '../../../../testing/fixtures/menor-preco/categorias-leite-integral.json';
import coca from '../../../../testing/fixtures/menor-preco/gtin-coca-cola.json';
import p1 from '../../../../testing/fixtures/menor-preco/termo-leite-integral-p1.json';
import vazio from '../../../../testing/fixtures/menor-preco/termo-vazio-total-0.json';
import { FontePrecosRegiao } from './fonte-precos-regiao';
import { MenorPrecoCache, TTL_CACHE_MS } from './menor-preco.cache';
import { MENOR_PRECO_API, MenorPrecoClient, TIMEOUT_MS } from './menor-preco.client';
import { FonteIndisponivelError, ResultadoBusca } from './regiao.model';

const LOCAL = '6gkzqfb';

describe('MenorPrecoClient', () => {
  let fonte: FontePrecosRegiao;
  let http: HttpTestingController;

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    fonte = TestBed.inject(FontePrecosRegiao);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    vi.useRealTimers();
  });

  function pedirGtin(gtin = '7894900011517', raioKm = 20) {
    let resultado: ResultadoBusca | undefined;
    let erro: unknown;
    fonte
      .porGtin({ gtin, local: LOCAL, raioKm })
      .subscribe({ next: (r) => (resultado = r), error: (e) => (erro = e) });
    return { obter: () => resultado, erro: () => erro };
  }

  it('o provedor padrão da interface é o MenorPrecoClient', () => {
    expect(fonte).toBe(TestBed.inject(MenorPrecoClient));
  });

  it('busca por GTIN com geohash, raio e período e mapeia a fixture real', () => {
    const r = pedirGtin();
    const req = http.expectOne((x) => x.url === `${MENOR_PRECO_API}/produtos`);
    expect(req.request.params.get('gtin')).toBe('7894900011517');
    expect(req.request.params.get('local')).toBe(LOCAL);
    expect(req.request.params.get('raio')).toBe('20');
    expect(req.request.params.get('data')).toBe('-1');
    expect(req.request.params.get('offset')).toBe('0');
    req.flush(coca);

    const res = r.obter()!;
    expect(res.total).toBe(330);
    expect(res.ofertas).toHaveLength(coca.produtos.length);
    expect(res.descartados).toBe(0);
    expect(res.min).toBe(Number(coca.precos.min));
    const primeira = res.ofertas[0];
    expect(primeira.descricao).toBe('AGUA');
    expect(typeof primeira.valor).toBe('number');
    expect(primeira.dataHora).toBeInstanceOf(Date);
    expect(typeof primeira.distanciaKm).toBe('number');
  });

  it('gtin vazio vira null e nm_fan vazio cai para nm_emp', () => {
    const r = pedirGtin();
    http.expectOne(() => true).flush(p1);
    const semFantasia = p1.produtos.findIndex((p) => !p.estabelecimento.nm_fan);
    const semGtin = p1.produtos.findIndex((p) => !p.gtin);
    const res = r.obter()!;
    expect(semFantasia).toBeGreaterThanOrEqual(0);
    expect(res.ofertas[semFantasia].estabelecimento.nome).toBe(
      p1.produtos[semFantasia].estabelecimento.nm_emp.trim(),
    );
    expect(res.ofertas[semGtin].gtin).toBeNull();
    expect(res.ofertas[0].estabelecimento.endereco).toBe('AV CANDIDO DE ABREU, 127');
  });

  it('item inválido é descartado e contado, sem derrubar a página', () => {
    const r = pedirGtin();
    const quebrado = structuredClone(coca);
    (quebrado.produtos[1] as Record<string, unknown>)['valor'] = 'abc';
    delete (quebrado.produtos[2] as Record<string, unknown>)['estabelecimento'];
    http.expectOne(() => true).flush(quebrado);
    expect(r.obter()!.ofertas).toHaveLength(coca.produtos.length - 2);
    expect(r.obter()!.descartados).toBe(2);
  });

  it('total 0 tem min/max nulos', () => {
    const r = pedirGtin('00000000');
    http.expectOne(() => true).flush(vazio);
    expect(r.obter()).toEqual({ total: 0, min: null, max: null, ofertas: [], descartados: 0 });
  });

  it('JSON sem produtos vira FonteIndisponivelError de formato', () => {
    const r = pedirGtin();
    http.expectOne(() => true).flush({ erro: 'x' });
    expect(r.erro()).toBeInstanceOf(FonteIndisponivelError);
    expect((r.erro() as FonteIndisponivelError).motivo).toBe('formato');
  });

  it('HTTP 503 vira FonteIndisponivelError http, sem retry', () => {
    const r = pedirGtin();
    http.expectOne(() => true).flush('fora', { status: 503, statusText: 'Service Unavailable' });
    expect((r.erro() as FonteIndisponivelError).motivo).toBe('http');
    http.expectNone(() => true);
  });

  it('erro de rede vira FonteIndisponivelError rede', () => {
    const r = pedirGtin();
    http.expectOne(() => true).error(new ProgressEvent('error'));
    expect((r.erro() as FonteIndisponivelError).motivo).toBe('rede');
  });

  it('timeout de 10s vira FonteIndisponivelError timeout', () => {
    vi.useFakeTimers();
    const r = pedirGtin();
    const req = http.expectOne(() => true);
    vi.advanceTimersByTime(TIMEOUT_MS + 1);
    expect((r.erro() as FonteIndisponivelError).motivo).toBe('timeout');
    expect(req.cancelled).toBe(true);
  });

  it('a segunda chamada idêntica não gera requisição (cache de 30 min)', () => {
    pedirGtin();
    http.expectOne(() => true).flush(coca);
    const segunda = pedirGtin();
    http.expectNone(() => true);
    expect(segunda.obter()!.ofertas[0].dataHora).toBeInstanceOf(Date);
  });

  it('chamadas simultâneas idênticas compartilham a mesma requisição', () => {
    const a = pedirGtin();
    const b = pedirGtin();
    http.expectOne(() => true).flush(coca);
    expect(a.obter()).toEqual(b.obter());
  });

  it('o cache vence depois de 30 minutos', () => {
    vi.useFakeTimers();
    pedirGtin();
    http.expectOne(() => true).flush(coca);
    vi.setSystemTime(Date.now() + TTL_CACHE_MS + 1);
    pedirGtin();
    http.expectOne(() => true).flush(coca);
  });

  it('o cache sobrevive em sessionStorage (novo client, mesma aba)', () => {
    pedirGtin();
    http.expectOne(() => true).flush(coca);
    const cacheNovo = new MenorPrecoCache();
    let valor: ResultadoBusca | undefined;
    const chave = Object.keys(sessionStorage).find((k) => k.startsWith('cp-mp:gtin'));
    expect(chave).toBeDefined();
    cacheNovo
      .obter<ResultadoBusca>(chave!.slice('cp-mp:'.length), () => {
        throw new Error('não deveria buscar');
      })
      .subscribe((r) => (valor = r));
    expect(valor?.total).toBe(330);
  });

  it('busca por termo, categoria e paginação por offset', () => {
    let res: ResultadoBusca | undefined;
    fonte
      .porTermo({ termo: ' leite integral ', categoria: 2, local: LOCAL, raioKm: 2, offset: 29 })
      .subscribe((r) => (res = r));
    const req = http.expectOne(() => true);
    expect(req.request.params.get('termo')).toBe('leite integral');
    expect(req.request.params.get('categoria')).toBe('2');
    expect(req.request.params.get('offset')).toBe('29');
    req.flush(p1);
    expect(res!.ofertas.length).toBe(p1.produtos.length);
  });

  it('categorias', () => {
    let lista: { id: number; desc: string; qtd: number }[] = [];
    fonte
      .categorias({ termo: 'leite integral', local: LOCAL, raioKm: 2 })
      .subscribe((c) => (lista = c));
    const req = http.expectOne((x) => x.url.endsWith('/categorias'));
    req.flush(categorias);
    expect(lista[0]).toEqual({ id: 2, desc: 'Leite e derivados', qtd: 291 });
  });

  it('categorias em formato inesperado viram erro de formato', () => {
    let erro: unknown;
    fonte
      .categorias({ termo: 'x', local: LOCAL, raioKm: 2 })
      .subscribe({ error: (e) => (erro = e) });
    http.expectOne(() => true).flush({ outra: [] });
    expect((erro as FonteIndisponivelError).motivo).toBe('formato');
  });
});
