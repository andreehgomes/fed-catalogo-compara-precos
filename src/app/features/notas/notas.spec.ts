import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router, provideRouter } from '@angular/router';
import type { ItemNota, Nota, Produto } from '@shared/model';
import { of } from 'rxjs';
import { vi } from 'vitest';
import coca from '../../../testing/fixtures/menor-preco/gtin-coca-cola.json';
import p1 from '../../../testing/fixtures/menor-preco/termo-leite-integral-p1.json';
import notasHistorico from '../../../testing/fixtures/notas-historico/notas.json';
import produtosHistorico from '../../../testing/fixtures/notas-historico/produtos.json';
import { botao, texto } from '../../../testing/dom';
import { AuthStore } from '../../core/auth/auth.store';
import { FIRESTORE_API, FirestoreApi } from '../../core/firebase/firestore-api';
import { FIRESTORE } from '../../core/firebase/firestore.token';
import { ProdutosService } from '../produtos/data-access/produtos.service';
import { LocalizacaoStore } from '../regiao/localizacao/localizacao.store';
import { HistoricoPessoalStore } from './data-access/historico-pessoal.store';
import { NotasService, TAMANHO_PAGINA_NOTAS } from './data-access/notas.service';
import { PendentesService } from './data-access/pendentes.service';
import { HistoricoItem } from './detalhe/historico-item';
import {
  ComparacaoHistorico,
  CompraPessoal,
  compararNota,
  indexarCompras,
  montarGrupos,
} from './detalhe/historico-pessoal';
import { MaisBaratoPerto, equivalentesPorTexto } from './detalhe/mais-barato-perto';
import NotaDetalhePage from './detalhe/nota-detalhe.page';
import { ListasStore } from '../listas/data-access/listas.store';
import type { Lista } from '../listas/lista';
import { listaCompras } from '../../../testing/fixtures/lista/lista';
import NotasListaPage from './lista/notas-lista.page';
import { intervaloDe } from './lista/periodo';

const CHAVE = '41260903644587000836652100000168701620438547';

function nota(i: number, extra: Partial<Nota> = {}): Nota {
  return {
    chave: `chave${String(i).padStart(3, '0')}`,
    cnpj: i % 2 ? '03644587000836' : '11222333000181',
    estabelecimentoNome: i % 2 ? 'Mercado A' : 'Mercado B',
    estabelecimentoCidade: 'CURITIBA',
    emissao: new Date(Date.UTC(2026, 8, 27) - i * 86_400_000).toISOString(),
    total: 10 + i,
    desconto: 0,
    qtdItens: 1,
    itens: [],
    importadaEm: '2026-09-27T00:00:00.000Z',
    ...extra,
  };
}

function apiFalsa(docs: Nota[] = []) {
  const doc = (n: Nota) => ({ id: n.chave, data: () => n });
  return {
    collection: vi.fn((_: unknown, c: string) => ({ c })),
    doc: vi.fn((_: unknown, c: string) => ({ c })),
    where: vi.fn((campo: string, op: string, valor: unknown) => ({ where: [campo, op, valor] })),
    orderBy: vi.fn((campo: string, dir?: string) => ({ orderBy: [campo, dir] })),
    limit: vi.fn((n: number) => ({ limit: n })),
    startAfter: vi.fn((c: { id: string }) => ({ startAfter: c.id })),
    query: vi.fn((col: unknown, ...r: { startAfter?: string; limit?: number }[]) => ({ col, r })),
    getDocs: vi.fn(
      async (q: { r: { startAfter?: string; limit?: number; where?: unknown[] }[] }) => {
        const depois = q.r.find((x) => x.startAfter)?.startAfter;
        const lim = q.r.find((x) => x.limit)?.limit ?? 999;
        const inicio = depois ? docs.findIndex((d) => d.chave === depois) + 1 : 0;
        return { docs: docs.slice(inicio, inicio + lim).map(doc) };
      },
    ),
    onSnapshot: vi.fn(),
    deleteDoc: vi.fn(async () => undefined),
  };
}

function configurar(api: ReturnType<typeof apiFalsa>, extras: unknown[] = []) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: FIRESTORE, useValue: {} },
      { provide: FIRESTORE_API, useValue: api as unknown as FirestoreApi },
      { provide: AuthStore, useValue: { uid: signal('u1') } },
      { provide: PendentesService, useValue: { pendentes: signal([]) } },
      { provide: HistoricoPessoalStore, useValue: { resumir: vi.fn(async () => new Map()) } },
      ...(extras as never[]),
    ],
  });
}

describe('NotasService', () => {
  it('monta where/orderBy/limit/startAfter para cada filtro e o cursor avança sem repetir', async () => {
    const todas = Array.from({ length: 45 }, (_, i) => nota(i));
    const api = apiFalsa(todas);
    configurar(api);
    const s = TestBed.inject(NotasService);

    const p1 = await s.listar({
      cnpj: '03644587000836',
      de: '2026-09-01T03:00:00.000Z',
      ate: '2026-10-01T03:00:00.000Z',
    });
    expect(api.collection).toHaveBeenCalledWith({}, 'usuarios/u1/notas');
    expect(api.where.mock.calls).toEqual([
      ['cnpj', '==', '03644587000836'],
      ['emissao', '>=', '2026-09-01T03:00:00.000Z'],
      ['emissao', '<', '2026-10-01T03:00:00.000Z'],
    ]);
    expect(api.orderBy).toHaveBeenCalledWith('emissao', 'desc');
    expect(api.limit).toHaveBeenCalledWith(TAMANHO_PAGINA_NOTAS);
    expect(p1.notas).toHaveLength(20);
    expect(p1.temMais).toBe(true);

    api.where.mockClear();
    const p2 = await s.listar({ cursor: p1.cursor });
    expect(api.where).not.toHaveBeenCalled();
    expect(api.startAfter).toHaveBeenCalledWith(p1.cursor);
    const p3 = await s.listar({ cursor: p2.cursor });
    const chaves = [...p1.notas, ...p2.notas, ...p3.notas].map((n) => n.chave);
    expect(new Set(chaves).size).toBe(45);
    expect(p3.temMais).toBe(false);
  });

  it('excluir apaga só a nota do usuário; estabelecimentos são únicos e ordenados', async () => {
    const api = apiFalsa([nota(1), nota(2), nota(3)]);
    configurar(api);
    const s = TestBed.inject(NotasService);
    await s.excluir(CHAVE);
    expect(api.deleteDoc).toHaveBeenCalledWith({ c: `usuarios/u1/notas/${CHAVE}` });
    expect(await s.estabelecimentos()).toEqual([
      { cnpj: '03644587000836', nome: 'Mercado A' },
      { cnpj: '11222333000181', nome: 'Mercado B' },
    ]);
  });
});

describe('intervaloDe', () => {
  const agora = new Date(2026, 8, 27, 15);
  it('mês, mês passado, 3 meses e personalizado', () => {
    expect(intervaloDe('mes', null, null, agora)).toEqual({
      de: new Date(2026, 8, 1).toISOString(),
      ate: new Date(2026, 9, 1).toISOString(),
    });
    expect(intervaloDe('mes-passado', null, null, agora).de).toBe(
      new Date(2026, 7, 1).toISOString(),
    );
    expect(intervaloDe('3-meses', null, null, agora).de).toBe(new Date(2026, 6, 1).toISOString());
    expect(intervaloDe('personalizado', '2026-09-10', '2026-09-12', agora)).toEqual({
      de: new Date(2026, 8, 10).toISOString(),
      ate: new Date(2026, 8, 13).toISOString(),
    });
    expect(intervaloDe(undefined, null, null, agora)).toEqual({ de: null, ate: null });
  });
});

describe('NotasListaPage', () => {
  it('pagina de 20 em 20 com "Carregar mais"', async () => {
    const api = apiFalsa(Array.from({ length: 45 }, (_, i) => nota(i)));
    configurar(api);
    const fixture = TestBed.createComponent(NotasListaPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('ul[aria-label="Notas"] li')).toHaveLength(20);
    botao(el, 'Carregar mais').click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.querySelectorAll('ul[aria-label="Notas"] li')).toHaveLength(40);
    botao(el, 'Carregar mais').click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.querySelectorAll('ul[aria-label="Notas"] li')).toHaveLength(45);
    expect(() => botao(el, 'Carregar mais')).toThrow();
  });

  it('filtros vão para os query params e são restaurados deles', async () => {
    const api = apiFalsa([nota(1, { veioDaFila: true })]);
    configurar(api);
    const navegar = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(NotasListaPage);
    fixture.componentRef.setInput('cnpj', '03644587000836');
    fixture.componentRef.setInput('periodo', 'mes-passado');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(api.where).toHaveBeenCalledWith('cnpj', '==', '03644587000836');
    const el = fixture.nativeElement as HTMLElement;
    expect(botao(el, 'Mês passado').getAttribute('aria-pressed')).toBe('true');
    expect(texto(el)).toContain('Nova');

    botao(el, 'Este mês').click();
    expect(navegar).toHaveBeenLastCalledWith(
      [],
      expect.objectContaining({ queryParams: { periodo: 'mes', de: null, ate: null } }),
    );
    const select = el.querySelector('select')!;
    select.value = '';
    select.dispatchEvent(new Event('change'));
    expect(navegar).toHaveBeenLastCalledWith(
      [],
      expect.objectContaining({ queryParams: { cnpj: null } }),
    );
  });

  it('mostra o saldo de cada nota contra o melhor preço (a mais, economia ou zerado)', async () => {
    const api = apiFalsa([nota(1), nota(2), nota(3), nota(4)]);
    const resumo = (saldo: number, comparados = 2) => ({
      aMais: Math.max(saldo, 0),
      itensAcima: 1,
      economia: Math.max(-saldo, 0),
      saldo,
      itensNoMelhor: 1,
      itensNovoMelhor: 1,
      comparados,
      total: 2,
    });
    const resumir = vi.fn(
      async () =>
        new Map([
          ['chave001', resumo(3.2)],
          ['chave002', resumo(-30.2)],
          ['chave003', resumo(0)],
          ['chave004', resumo(0, 0)],
        ]),
    );
    configurar(api, [{ provide: HistoricoPessoalStore, useValue: { resumir } }]);
    const fixture = TestBed.createComponent(NotasListaPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const linhas = [...fixture.nativeElement.querySelectorAll('ul[aria-label="Notas"] li')].map(
      (li) => texto(li as Element),
    );
    expect(resumir).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ chave: 'chave001' })]),
    );
    expect(linhas[0]).toContain('R$ 3,20 a mais');
    expect(linhas[1]).toContain('R$ 30,20 de economia');
    expect(linhas[2]).toContain('Saldo zerado');
    expect(linhas[3]).not.toMatch(/a mais|economia|zerado/);
  });

  it('sem notas: "Importar primeira nota"', async () => {
    configurar(apiFalsa([]));
    const fixture = TestBed.createComponent(NotasListaPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(botao(fixture.nativeElement, 'Importar primeira nota').getAttribute('href')).toBe(
      '/importar',
    );
  });
});

const ITENS: ItemNota[] = [
  {
    n: 1,
    descricao: 'COCA COLA PET 2L',
    codigo: '1',
    ean: '7894900011517',
    qtd: 2,
    unidade: 'UN',
    vlUnit: 12.99,
    vlTotal: 25.98,
    produtoId: 'ean:7894900011517',
    precoPorUnidadeBase: null,
  },
  {
    n: 2,
    descricao: 'LEITE INTEGRAL 1L',
    codigo: '2',
    ean: null,
    qtd: 3,
    unidade: 'UN',
    vlUnit: 5.99,
    vlTotal: 17.97,
    produtoId: 'loc:03644587000836:2',
    precoPorUnidadeBase: null,
  },
];

describe('MaisBaratoPerto', () => {
  function montar() {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        MaisBaratoPerto,
        {
          provide: LocalizacaoStore,
          useValue: { geohash: signal('6gkzqfb'), raioKm: signal(2), pronta: signal(true) },
        },
      ],
    });
    return { m: TestBed.inject(MaisBaratoPerto), http: TestBed.inject(HttpTestingController) };
  }

  it('requisições sequenciais (1 em voo), economia confere e repetir usa o cache', () => {
    const { m, http } = montar();
    const itens = Array.from({ length: 10 }, (_, i) => ({ ...ITENS[0], n: i + 1 }));
    m.comparar(itens);
    let pedidos = 0;
    for (let i = 0; i < 10; i++) {
      const pendentes = http.match(() => true);
      expect(pendentes.length).toBeLessThanOrEqual(1);
      pendentes.forEach((r) => {
        pedidos++;
        r.flush(coca);
      });
    }
    expect(pedidos).toBe(1);
    expect(m.estado()).toBe('concluido');
    const r = m.resultados().get(1)!;
    expect(r.tipo).toBe('mais-barato');
    // Cálculo manual sobre a fixture: a menor Coca-Cola PET 2 L é R$ 6,70 (a lata de 350 ml de R$ 6,50 é outro produto e sai como divergente).
    const menorCoca = 6.7;
    const esperado = Math.round((12.99 - menorCoca) * 100) / 100;
    expect(r.tipo === 'mais-barato' && r.diferenca).toBe(esperado);
    expect(m.economia()).toBe(Math.round(esperado * 2 * 10 * 100) / 100);

    m.comparar(itens);
    http.expectNone(() => true);
    http.verify();
  });

  it('item sem EAN busca por texto e marca como aproximado', () => {
    const { m, http } = montar();
    m.comparar([ITENS[1]]);
    const req = http.expectOne(() => true);
    expect(req.request.params.get('termo')).toBe('LEITE INTEGRAL 1L');
    req.flush(p1);
    const r = m.resultados().get(2)!;
    expect(r.tipo === 'mais-barato' || r.tipo === 'menor-preco').toBe(true);
    expect('aproximado' in r && r.aproximado).toBe(true);
  });

  it('Menor Preço fora: para e marca indisponível', () => {
    const { m, http } = montar();
    m.comparar(ITENS);
    http.expectOne(() => true).flush('x', { status: 503, statusText: 'x' });
    http.expectNone(() => true);
    expect(m.estado()).toBe('indisponivel');
  });

  it('equivalentesPorTexto exige descrição parecida e mesmo conteúdo', () => {
    const o = (descricao: string) => ({ descricao }) as never;
    expect(
      equivalentesPorTexto('LEITE INTEGRAL 1L', [
        o('LEITE UHT INTEGRAL 1L'),
        o('LEITE INTEGRAL 200ML'),
        o('CAFE'),
      ]),
    ).toEqual([o('LEITE UHT INTEGRAL 1L')]);
  });
});

describe('NotaDetalhePage', () => {
  function montar(n: Nota | null, confirmar = true, listas: Lista[] = [], escolha: unknown = null) {
    const escolher = vi.fn(async () => escolha);
    const api = apiFalsa();
    const excluir = vi.fn(async () => undefined);
    const historico = { comparar: vi.fn(async () => new Map()), invalidar: vi.fn() };
    const dialog = { open: vi.fn(() => ({ afterClosed: () => of(confirmar) })) };
    const snack = { open: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: FIRESTORE, useValue: {} },
        { provide: FIRESTORE_API, useValue: api as unknown as FirestoreApi },
        { provide: AuthStore, useValue: { uid: signal('u1') } },
        { provide: NotasService, useValue: { obter: () => of(n), excluir } },
        { provide: MatDialog, useValue: dialog },
        { provide: MatSnackBar, useValue: snack },
        { provide: HistoricoPessoalStore, useValue: historico },
        { provide: ListasStore, useValue: { listas: signal(listas), escolher } },
        {
          provide: LocalizacaoStore,
          useValue: {
            geohash: signal(null),
            raioKm: signal(2),
            pronta: signal(false),
            descricao: signal('Sem localização'),
            status: signal('ocioso'),
            municipios: vi.fn(async () => []),
          },
        },
      ],
    });
    const navegar = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(NotaDetalhePage);
    fixture.componentRef.setInput('chave', CHAVE);
    fixture.detectChanges();
    return {
      fixture,
      el: fixture.nativeElement as HTMLElement,
      excluir,
      dialog,
      navegar,
      historico,
      escolher,
    };
  }

  const NOTA = nota(1, { chave: CHAVE, itens: ITENS, qtdItens: 2, total: 43.95, desconto: 1.5 });

  it('mostra cabeçalho, itens com link para o produto e a chave formatada', async () => {
    const { fixture, el } = montar(NOTA);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(texto(el.querySelector('h1'))).toBe('Mercado A');
    expect(el.querySelector('h1 a')!.getAttribute('href')).toBe('/estabelecimentos/03644587000836');
    expect(texto(el)).toContain('R$ 43,95');
    expect(texto(el)).toContain('R$ 1,50');
    expect(texto(el)).toContain('2 UN × R$ 12,99');
    expect(el.querySelector('a.item-nome')!.getAttribute('href')).toBe(
      '/produtos/ean:7894900011517',
    );
    expect(texto(el)).toContain('4126 0903 6445 8700');
  });

  it('lançamentos repetidos do mesmo produto e preço aparecem numa linha só', async () => {
    const repetida = { ...NOTA, itens: [...ITENS, { ...ITENS[0], n: 3 }] };
    const { fixture, el } = montar(repetida);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.querySelectorAll('li.detalhe-item')).toHaveLength(2);
    expect(texto(el.querySelector('#item-1'))).toContain('4 UN × R$ 12,99');
    expect(texto(el.querySelector('#item-1'))).toContain('R$ 51,96');
  });

  it('exclusão pede confirmação e, confirmada, remove só a nota e volta para a lista', async () => {
    const { fixture, el, excluir, dialog, navegar, historico } = montar(NOTA);
    await fixture.whenStable();
    fixture.detectChanges();
    botao(el, 'Excluir nota').click();
    await fixture.whenStable();
    expect(dialog.open).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ data: expect.objectContaining({ perigo: true }) }),
    );
    expect((dialog.open.mock.calls[0] as unknown[])[1]).toMatchObject({
      data: { mensagem: expect.stringContaining('continuam') },
    });
    expect(excluir).toHaveBeenCalledWith(CHAVE);
    expect(historico.invalidar).toHaveBeenCalledOnce();
    expect(navegar).toHaveBeenCalledWith(['/notas']);
  });

  it('cancelar a confirmação não exclui', async () => {
    const { fixture, el, excluir, historico } = montar(NOTA, false);
    await fixture.whenStable();
    fixture.detectChanges();
    botao(el, 'Excluir nota').click();
    await fixture.whenStable();
    expect(excluir).not.toHaveBeenCalled();
    expect(historico.invalidar).not.toHaveBeenCalled();
  });

  it('"Conferir com uma lista" (RF-14): some sem listas; com uma vai direto; com várias pergunta', async () => {
    const sem = montar(NOTA);
    await sem.fixture.whenStable();
    sem.fixture.detectChanges();
    expect(() => botao(sem.el, 'Conferir com uma lista')).toThrow();

    TestBed.resetTestingModule();
    const uma = montar(NOTA, true, [listaCompras({}, 'l1')]);
    await uma.fixture.whenStable();
    uma.fixture.detectChanges();
    botao(uma.el, 'Conferir com uma lista').click();
    await uma.fixture.whenStable();
    expect(uma.escolher).not.toHaveBeenCalled();
    expect(uma.navegar).toHaveBeenCalledWith(['/listas', 'l1', 'conferir'], {
      queryParams: { chave: CHAVE },
    });

    TestBed.resetTestingModule();
    const duas = [listaCompras({}, 'l1'), listaCompras({}, 'l2')];
    const varias = montar(NOTA, true, duas, { id: 'l2' });
    await varias.fixture.whenStable();
    varias.fixture.detectChanges();
    botao(varias.el, 'Conferir com uma lista').click();
    await varias.fixture.whenStable();
    expect(varias.escolher).toHaveBeenCalledWith(
      expect.objectContaining({ podeCriar: false, confirmar: 'Conferir' }),
    );
    expect(varias.navegar).toHaveBeenCalledWith(['/listas', 'l2', 'conferir'], {
      queryParams: { chave: CHAVE },
    });

    TestBed.resetTestingModule();
    const cancelou = montar(NOTA, true, duas, null);
    await cancelou.fixture.whenStable();
    cancelou.fixture.detectChanges();
    botao(cancelou.el, 'Conferir com uma lista').click();
    await cancelou.fixture.whenStable();
    expect(cancelou.navegar).not.toHaveBeenCalled();
  });

  it('comparar sem localização abre o seletor; nota inexistente mostra aviso', async () => {
    const { fixture, el } = montar(NOTA);
    await fixture.whenStable();
    fixture.detectChanges();
    botao(el, /Comparar com mercados perto/).click();
    fixture.detectChanges();
    expect(texto(el)).toContain('Onde você está?');
    TestBed.resetTestingModule();
    const vazio = montar(null);
    await vazio.fixture.whenStable();
    vazio.fixture.detectChanges();
    expect(texto(vazio.el)).toContain('Nota não encontrada');
  });
});

/** A nota de 10/06 vai para 05/08, dentro dos 60 dias da de 20/09: a tela passa por todos os estados. */
const NOTAS_H = (notasHistorico as Nota[]).map((n, i) =>
  i === 0 ? { ...n, emissao: '2026-08-05T14:00:00.000Z' } : n,
);
const PRODUTOS_H = produtosHistorico as Produto[];
const [, , ATUAL_H, POSTERIOR_H] = NOTAS_H;

function produtosPorIdsFalso(ids: readonly string[]): Map<string, Produto> {
  return new Map(PRODUTOS_H.filter((p) => ids.includes(p.id)).map((p) => [p.id, p]));
}

function membrosFalso(canonicos: readonly string[]): Produto[] {
  return PRODUTOS_H.filter((p) => p.vinculadoA && canonicos.includes(p.vinculadoA));
}

async function compararComFixture(n: Nota): Promise<Map<number, ComparacaoHistorico>> {
  const daNota = produtosPorIdsFalso(n.itens.map((i) => i.produtoId));
  const grupos = montarGrupos(
    daNota,
    membrosFalso([...daNota.values()].map((p) => p.vinculadoA ?? p.id)),
  );
  return compararNota(n, indexarCompras(NOTAS_H, grupos), grupos);
}

function todosPrimeiraCompra(n: Nota): Promise<Map<number, ComparacaoHistorico>> {
  return Promise.resolve(new Map(n.itens.map((i) => [i.n, { tipo: 'primeira-compra' } as const])));
}

async function pronto(fixture: { whenStable(): Promise<unknown>; detectChanges(): void }) {
  await fixture.whenStable();
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}

function linha(el: HTMLElement, n: number): string {
  return texto(el.querySelector(`#item-${n}`));
}

describe('NotaDetalhePage: comparado com seu melhor preço', () => {
  function montar(
    comparar: (n: Nota) => Promise<Map<number, ComparacaoHistorico>> = compararComFixture,
    itens?: string,
  ) {
    const historico = { comparar: vi.fn(comparar), invalidar: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: FIRESTORE, useValue: {} },
        { provide: FIRESTORE_API, useValue: apiFalsa() as unknown as FirestoreApi },
        { provide: AuthStore, useValue: { uid: signal('u1') } },
        { provide: NotasService, useValue: { obter: () => of(ATUAL_H), excluir: vi.fn() } },
        { provide: HistoricoPessoalStore, useValue: historico },
        {
          provide: LocalizacaoStore,
          useValue: {
            geohash: signal(null),
            raioKm: signal(2),
            pronta: signal(false),
            descricao: signal('Sem localização'),
          },
        },
      ],
    });
    const navegar = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(NotaDetalhePage);
    fixture.componentRef.setInput('chave', ATUAL_H.chave);
    if (itens) fixture.componentRef.setInput('itens', itens);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement, historico, navegar };
  }

  it('resumo: quanto poderia ter economizado, itens no melhor e comparados', async () => {
    const { fixture, el, historico } = montar();
    await pronto(fixture);
    expect(historico.comparar).toHaveBeenCalledWith(ATUAL_H);
    const resumo = texto(el.querySelector('.historico-resumo'));
    // A mais: Café 2,50 × 2 + Leite 0,40 × 3 + Coca 0,49/L × 4 L = 8,16
    // Economia: Detergente 0,30 × 10 + Tomate 1,00/kg × 1,25 kg = 4,25 → saldo 3,91
    expect(resumo).toContain('Comparado com seu melhor preço');
    expect(resumo).toContain('Saldo: R$ 3,91 a mais');
    expect(resumo).toContain('R$ 8,16 a mais em 3 itens · R$ 4,25 de economia em 2 itens');
    expect(resumo).toContain('3 no seu melhor preço · 6 de 8 itens comparados · últimos 60 dias');
    expect(el.querySelector('.historico-resumo')!.getAttribute('role')).toBe('status');
  });

  it('linha do item: acima do melhor, novo melhor, seu melhor, com data e mercado', async () => {
    const { fixture, el } = montar();
    await pronto(fixture);
    expect(linha(el, 1)).toContain('R$ 5,00 acima do seu melhor');
    expect(linha(el, 1)).toContain('Seu melhor em 60 dias R$ 18,90 (05/08 · Mercado A)');
    expect(linha(el, 1)).toContain('+R$ 2,50/un (+13,2 %)');
    expect(linha(el, 1)).toContain('Suas notas');
    expect(linha(el, 1)).not.toContain('Última vez');
    expect(linha(el, 2)).toContain('R$ 3,00 de economia');
    expect(linha(el, 2)).toContain('Novo melhor preço · antes R$ 2,79 (05/08 · Mercado A)');
    expect(linha(el, 3)).toContain('Mercado B');
    expect(linha(el, 4)).toContain('antes R$ 8,99/kg');
    expect(linha(el, 5)).toContain('+R$ 0,49/L');
    expect(linha(el, 6)).toContain('Unidade diferente das compras recentes');
    expect(linha(el, 7)).toContain('Primeira compra');
    expect(el.querySelector('#item-7 .cp-badge')).toBeNull();
    expect(linha(el, 8)).toContain('Seu melhor preço');
    expect(linha(el, 8)).toContain('Igual a 05/08 · Mercado A');
  });

  it('a lista aparece antes do histórico resolver, com skeleton só no resumo', async () => {
    const { fixture, el } = montar(() => new Promise(() => undefined));
    await new Promise((r) => setTimeout(r));
    fixture.detectChanges();
    expect(el.querySelectorAll('li.detalhe-item')).toHaveLength(8);
    expect(el.querySelector('.historico-resumo .cp-skeleton')).not.toBeNull();
    expect(el.querySelector('[aria-label="Filtrar itens"]')).toBeNull();
  });

  it('erro mostra aviso com "Tentar de novo" e a nota continua utilizável', async () => {
    let falhar = true;
    const { fixture, el, historico } = montar(async (n) => {
      if (falhar) throw new Error('offline');
      return compararComFixture(n);
    });
    await pronto(fixture);
    expect(texto(el)).toContain('Não deu para comparar com suas compras agora.');
    expect(el.querySelectorAll('li.detalhe-item')).toHaveLength(8);
    falhar = false;
    botao(el, 'Tentar de novo').click();
    await pronto(fixture);
    expect(historico.comparar).toHaveBeenCalledTimes(2);
    expect(texto(el.querySelector('.historico-resumo'))).toContain('Saldo: R$ 3,91 a mais');
  });

  it('sem nenhum comparável: "Sem compras recentes desses produtos"', async () => {
    const { fixture, el } = montar(todosPrimeiraCompra);
    await pronto(fixture);
    expect(texto(el.querySelector('.historico-resumo'))).toContain(
      'Sem compras recentes desses produtos',
    );
  });

  it('?itens=acima mostra só os acima do melhor; trocar o filtro atualiza a URL', async () => {
    const { fixture, el, navegar } = montar(compararComFixture, 'acima');
    await pronto(fixture);
    expect([...el.querySelectorAll('li.detalhe-item')].map((li) => li.id)).toEqual([
      'item-1',
      'item-3',
      'item-5',
    ]);
    expect(botao(el, /^Acima do melhor/).getAttribute('aria-pressed')).toBe('true');
    expect(texto(botao(el, /^Acima do melhor/))).toBe('Acima do melhor 3');
    expect(texto(botao(el, /^Melhor preço/))).toBe('Melhor preço 3');
    botao(el, /^Melhor preço/).click();
    expect(navegar).toHaveBeenLastCalledWith(
      [],
      expect.objectContaining({ queryParams: { itens: 'melhor' } }),
    );
    botao(el, /^Todos/).click();
    expect(navegar).toHaveBeenLastCalledWith(
      [],
      expect.objectContaining({ queryParams: { itens: null } }),
    );
  });

  it('filtro sem itens mostra aviso; valor desconhecido vira "todos"', async () => {
    const vazio = montar(todosPrimeiraCompra, 'acima');
    await pronto(vazio.fixture);
    expect(texto(vazio.el)).toContain('Nenhum item neste filtro.');
    TestBed.resetTestingModule();
    const outro = montar(compararComFixture, 'xyz');
    await pronto(outro.fixture);
    expect(outro.el.querySelectorAll('li.detalhe-item')).toHaveLength(8);
  });
});

describe('HistoricoItem', () => {
  function criar(comparacao: ComparacaoHistorico) {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(HistoricoItem);
    fixture.componentRef.setInput('comparacao', comparacao);
    fixture.componentRef.setInput('produtoId', 'loc:1:1');
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('comparável: expande as compras, menor, média e link para o produto', async () => {
    const r = (await compararComFixture(ATUAL_H)).get(1)!;
    const { fixture, el } = criar(r);
    const b = botao(el, /^Ver compras/);
    const painel = el.querySelector(`#${b.getAttribute('aria-controls')}`) as HTMLElement;
    expect(b.getAttribute('aria-expanded')).toBe('false');
    expect(painel.hidden).toBe(true);
    b.click();
    fixture.detectChanges();
    expect(b.getAttribute('aria-expanded')).toBe('true');
    expect(painel.hidden).toBe(false);
    expect(painel.querySelectorAll('li')).toHaveLength(1);
    expect(texto(painel)).toContain('05/08/26 · Mercado A');
    expect(texto(painel)).toContain('Menor preço nos últimos 12 meses: R$ 18,90/un');
    expect(texto(painel)).not.toContain('nesta compra');
    expect(texto(painel)).toContain('Média da compra anterior: R$ 18,90/un');
    expect(botao(painel, 'Ver histórico completo').getAttribute('href')).toBe('/produtos/loc:1:1');
  });

  it('sem comparação mostra as compras sem valores de diferença', async () => {
    const r = (await compararComFixture(ATUAL_H)).get(6)!;
    const { el } = criar(r);
    expect(texto(el)).toContain('Unidade diferente das compras recentes');
    expect(texto(el)).not.toContain('Menor preço');
    expect(el.querySelector('.cp-badge')).toBeNull();
  });

  it('novo melhor preço: o menor dos 12 meses é o desta compra', async () => {
    const r = (await compararComFixture(ATUAL_H)).get(2)!;
    const { el } = criar(r);
    expect(texto(el)).toContain('Menor preço nos últimos 12 meses: R$ 2,49/un (nesta compra)');
    expect(texto(el)).toContain('Média da compra anterior: R$ 2,79/un');
  });

  it('última compra diferente da referência aparece como tendência', async () => {
    const r = (await compararComFixture(POSTERIOR_H)).get(2)!;
    const { el } = criar(r);
    expect(texto(el)).toContain('R$ 0,10 acima do seu melhor');
    expect(texto(el)).toContain('Seu melhor em 60 dias R$ 18,90 (05/08 · Mercado A)');
    expect(texto(el.querySelector('.historico-tendencia'))).toBe(
      'trending_down Última vez R$ 21,40 (20/09 · Mercado A) · baixou R$ 2,40/un',
    );
  });

  it('sem compra nos 60 dias mostra a última, neutra e sem badge', () => {
    const ultima: CompraPessoal = {
      chave: 'c',
      n: 1,
      cnpj: '1',
      mercado: 'Mercado A',
      emissao: '2026-06-10T14:00:00.000Z',
      produtoId: 'loc:1:1',
      descricao: 'CAFE',
      qtd: 1,
      unidade: 'UN',
      vlUnit: 18.9,
      porUnidade: null,
    };
    const { el } = criar({ tipo: 'sem-recente', ultima, compras: [ultima] });
    expect(texto(el)).toContain(
      'Última compra há mais de 60 dias: R$ 18,90 (10/06/26 · Mercado A)',
    );
    expect(el.querySelector('.cp-badge')).toBeNull();
    expect(botao(el, /^Ver compras/)).toBeTruthy();
  });

  it('primeira compra é neutra, sem badge nem expansão', () => {
    const { el } = criar({ tipo: 'primeira-compra' });
    expect(texto(el)).toBe('history Primeira compra');
    expect(el.querySelector('button')).toBeNull();
  });
});

describe('HistoricoPessoalStore', () => {
  function montarStore(notas: Nota[] = NOTAS_H) {
    const todas = vi.fn(async () => notas);
    const produtosPorIds = vi.fn(async (ids: readonly string[]) => produtosPorIdsFalso(ids));
    const membrosDosGrupos = vi.fn(async (c: readonly string[]) => membrosFalso(c));
    const uid = signal<string | null>('u1');
    TestBed.configureTestingModule({
      providers: [
        { provide: NotasService, useValue: { todas } },
        { provide: ProdutosService, useValue: { produtosPorIds, membrosDosGrupos } },
        { provide: AuthStore, useValue: { uid } },
      ],
    });
    const store = TestBed.inject(HistoricoPessoalStore);
    return { store, todas, produtosPorIds, membrosDosGrupos, uid };
  }

  it('compara pela fixture; a segunda nota da sessão não relê as notas', async () => {
    const { store, todas, produtosPorIds, membrosDosGrupos } = montarStore();
    const [r] = await Promise.all([store.comparar(ATUAL_H), store.comparar(ATUAL_H)]);
    expect([...r.values()].map((c) => c.tipo)).toEqual(
      [...(await compararComFixture(ATUAL_H)).values()].map((c) => c.tipo),
    );
    expect(todas).toHaveBeenCalledOnce();
    expect(todas).toHaveBeenCalledWith({ de: expect.any(String) }, 20);

    const posterior = await store.comparar(POSTERIOR_H);
    expect(posterior.get(1)).toMatchObject({ tipo: 'melhor', novoMelhor: true, impacto: 0 });
    expect(todas).toHaveBeenCalledOnce();

    produtosPorIds.mockClear();
    membrosDosGrupos.mockClear();
    await store.comparar(ATUAL_H);
    expect(produtosPorIds).not.toHaveBeenCalled();
    expect(membrosDosGrupos).not.toHaveBeenCalled();
  });

  it('invalidar() e troca de usuário forçam nova leitura', async () => {
    const { store, todas, uid } = montarStore();
    await store.comparar(ATUAL_H);
    store.invalidar();
    await store.comparar(ATUAL_H);
    expect(todas).toHaveBeenCalledTimes(2);
    uid.set('u2');
    await store.comparar(ATUAL_H);
    expect(todas).toHaveBeenCalledTimes(3);
  });

  it('nota nova fora do cache recarrega uma vez só', async () => {
    const nova = { ...ATUAL_H, chave: 'nova', emissao: new Date().toISOString() };
    const { store, todas } = montarStore();
    await store.comparar(nova);
    expect(todas).toHaveBeenCalledTimes(2);
    await store.comparar(nova);
    expect(todas).toHaveBeenCalledTimes(2);
  });

  it('resumir várias notas numa leitura só, com o valor a mais de cada uma', async () => {
    const { store, todas, produtosPorIds } = montarStore();
    const r = await store.resumir([ATUAL_H, POSTERIOR_H]);
    expect(r.get(ATUAL_H.chave)).toMatchObject({ aMais: 8.16, economia: 4.25, saldo: 3.91 });
    expect(r.get(POSTERIOR_H.chave)).toMatchObject({ aMais: 0.1, economia: 1, saldo: -0.9 });
    expect(todas).toHaveBeenCalledOnce();
    expect(produtosPorIds).toHaveBeenCalledOnce();
    expect(await store.resumir([])).toEqual(new Map());
  });

  it('indiceCompleto: uma leitura por sessão, grupos entre mercados e invalidar()', async () => {
    const soUmaVez = {
      ...ATUAL_H,
      chave: 'avulsa',
      itens: [{ ...ATUAL_H.itens[0], produtoId: 'ean:7890000000001' as const }],
    };
    const { store, todas, produtosPorIds } = montarStore([...NOTAS_H, soUmaVez]);
    const [a, b] = await Promise.all([store.indiceCompleto(), store.indiceCompleto()]);
    expect(a).toBe(b);
    expect(await store.indiceCompleto()).toBe(a);
    expect(todas).toHaveBeenCalledOnce();
    expect(produtosPorIds).toHaveBeenCalledOnce();
    expect(produtosPorIds.mock.calls[0][0]).not.toContain('ean:7890000000001');
    expect(a.grupos.get('loc:03644587000836:103')).toBe('ean:7896000000017');
    expect(a.grupos.get('loc:11222333000181:201')).toBe('ean:7896000000017');
    expect(a.indice.get('ean:7896000000017')!.map((c) => c.cnpj)).toEqual(
      expect.arrayContaining(['03644587000836', '11222333000181']),
    );
    expect(a.indice.get('ean:7890000000001')).toHaveLength(1);

    const versao = store.versao();
    store.invalidar();
    expect(store.versao()).toBe(versao + 1);
    expect(await store.indiceCompleto()).not.toBe(a);
    expect(todas).toHaveBeenCalledTimes(2);
  });

  it('indiceCompleto: falha não fica em cache', async () => {
    const { store, todas } = montarStore();
    todas.mockRejectedValueOnce(new Error('offline'));
    await expect(store.indiceCompleto()).rejects.toThrow('offline');
    await expect(store.indiceCompleto()).resolves.toMatchObject({ notas: NOTAS_H });
  });

  it('falha na leitura não fica em cache; sem usuário rejeita', async () => {
    const { store, todas, uid } = montarStore();
    todas.mockRejectedValueOnce(new Error('offline'));
    await expect(store.comparar(ATUAL_H)).rejects.toThrow('offline');
    await expect(store.comparar(ATUAL_H)).resolves.toBeInstanceOf(Map);
    uid.set(null);
    await expect(store.comparar(ATUAL_H)).rejects.toThrow('Sem usuário');
  });
});
