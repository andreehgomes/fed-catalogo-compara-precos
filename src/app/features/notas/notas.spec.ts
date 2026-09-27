import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router, provideRouter } from '@angular/router';
import type { ItemNota, Nota } from '@shared/model';
import { of } from 'rxjs';
import { vi } from 'vitest';
import coca from '../../../testing/fixtures/menor-preco/gtin-coca-cola.json';
import p1 from '../../../testing/fixtures/menor-preco/termo-leite-integral-p1.json';
import { botao, texto } from '../../../testing/dom';
import { AuthStore } from '../../core/auth/auth.store';
import { FIRESTORE_API, FirestoreApi } from '../../core/firebase/firestore-api';
import { FIRESTORE } from '../../core/firebase/firestore.token';
import { LocalizacaoStore } from '../regiao/localizacao/localizacao.store';
import { NotasService, TAMANHO_PAGINA_NOTAS } from './data-access/notas.service';
import { PendentesService } from './data-access/pendentes.service';
import { MaisBaratoPerto, equivalentesPorTexto } from './detalhe/mais-barato-perto';
import NotaDetalhePage from './detalhe/nota-detalhe.page';
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
  function montar(n: Nota | null, confirmar = true) {
    const api = apiFalsa();
    const excluir = vi.fn(async () => undefined);
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
    return { fixture, el: fixture.nativeElement as HTMLElement, excluir, dialog, navegar };
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

  it('exclusão pede confirmação e, confirmada, remove só a nota e volta para a lista', async () => {
    const { fixture, el, excluir, dialog, navegar } = montar(NOTA);
    await fixture.whenStable();
    fixture.detectChanges();
    botao(el, /Excluir nota/).click();
    await fixture.whenStable();
    expect(dialog.open).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ data: expect.objectContaining({ perigo: true }) }),
    );
    expect((dialog.open.mock.calls[0] as unknown[])[1]).toMatchObject({
      data: { mensagem: expect.stringContaining('continuam') },
    });
    expect(excluir).toHaveBeenCalledWith(CHAVE);
    expect(navegar).toHaveBeenCalledWith(['/notas']);
  });

  it('cancelar a confirmação não exclui', async () => {
    const { fixture, el, excluir } = montar(NOTA, false);
    await fixture.whenStable();
    fixture.detectChanges();
    botao(el, /Excluir nota/).click();
    await fixture.whenStable();
    expect(excluir).not.toHaveBeenCalled();
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
