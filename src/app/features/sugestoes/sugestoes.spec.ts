import { ApplicationRef, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import type { Nota, Produto } from '@shared/model';
import { vi } from 'vitest';
import { botao, texto } from '../../../testing/dom';
import { HOJE_SUGESTAO, notasSugestao } from '../../../testing/fixtures/sugestao/notas';
import {
  ARROZ,
  BANANA,
  CAFE,
  LEITE,
  PRODUTOS_SUGESTAO,
} from '../../../testing/fixtures/sugestao/produtos';
import { AuthStore } from '../../core/auth/auth.store';
import { CHAMAR_FUNCTION } from '../../core/firebase/callable';
import { FIRESTORE_API, FirestoreApi } from '../../core/firebase/firestore-api';
import { FIRESTORE } from '../../core/firebase/firestore.token';
import { RELOGIO } from '../../core/relogio';
import { HistoricoPessoalStore } from '../notas/data-access/historico-pessoal.store';
import { CompraPessoal, indexarCompras, montarGrupos } from '../notas/detalhe/historico-pessoal';
import { HoraDeRepor } from '../painel/hora-de-repor';
import { SugestoesStore } from './data-access/sugestoes.store';
import { FaixaDePreco, Sugestao, agruparPorMaisBarato, montarCestas, sugerir } from './sugestao';
import SugestoesPage from './sugestoes.page';
import { FaixaPreco } from './ui/faixa-preco';
import { PorMercado } from './ui/por-mercado';
import { SugestaoItem } from './ui/sugestao-item';

const NADA = { jaTenho: new Map<string, string>(), nunca: new Set<string>() };

function sugestoesFixture(): Sugestao[] {
  const grupos = montarGrupos(
    new Map(PRODUTOS_SUGESTAO.map((p) => [p.id as string, p])) as Map<string, Produto>,
    [],
  );
  return sugerir(indexarCompras(notasSugestao(), grupos), HOJE_SUGESTAO, 'semana', NADA);
}

function compra(extra: Partial<CompraPessoal>): CompraPessoal {
  return {
    chave: 'c',
    n: 1,
    cnpj: 'A',
    mercado: 'Mercado A',
    emissao: '2026-09-20T15:00:00.000Z',
    produtoId: 'ean:1',
    descricao: 'LEITE 1L',
    qtd: 1,
    unidade: 'UN',
    vlUnit: 5,
    porUnidade: null,
    ...extra,
  };
}

interface Restricao {
  where?: [string, string, string[]];
  limit?: number;
  startAfter?: string;
}

/** Firestore falso: notas paginadas e `produtos` por id/`vinculadoA`; registra as coleções lidas. */
function apiFalsa(notas: Nota[]) {
  const colecoes: string[] = [];
  const porId = new Map(PRODUTOS_SUGESTAO.map((p) => [p.id as string, p]));
  const doc = (id: string, dados: unknown) => ({ id, data: () => dados });
  const api = {
    collection: vi.fn((_: unknown, path: string) => ({ path })),
    doc: vi.fn(),
    documentId: vi.fn(() => '__id__'),
    where: vi.fn((campo: string, op: string, valor: unknown) => ({ where: [campo, op, valor] })),
    orderBy: vi.fn(() => ({})),
    limit: vi.fn((n: number) => ({ limit: n })),
    startAfter: vi.fn((c: { id: string }) => ({ startAfter: c.id })),
    query: vi.fn((col: { path: string }, ...r: Restricao[]) => ({ path: col.path, r })),
    getDocs: vi.fn(async (q: { path: string; r: Restricao[] }) => {
      colecoes.push(q.path);
      if (q.path.endsWith('/notas')) {
        const depois = q.r.find((x) => x.startAfter)?.startAfter;
        const lim = q.r.find((x) => x.limit)?.limit ?? 999;
        const inicio = depois ? notas.findIndex((n) => n.chave === depois) + 1 : 0;
        return { docs: notas.slice(inicio, inicio + lim).map((n) => doc(n.chave, n)) };
      }
      if (q.path === 'produtos') {
        const [campo, , valores] = q.r.find((x) => x.where)!.where!;
        const achados: Produto[] =
          campo === '__id__'
            ? valores.flatMap((id) => (porId.has(id) ? [porId.get(id)!] : []))
            : PRODUTOS_SUGESTAO.filter((p) => p.vinculadoA && valores.includes(p.vinculadoA));
        return { docs: achados.map((p) => doc(p.id, p)) };
      }
      throw new Error(`coleção inesperada: ${q.path}`);
    }),
    onSnapshot: vi.fn(),
    deleteDoc: vi.fn(),
    getDoc: vi.fn(),
  };
  return { api, colecoes };
}

function configurar(notas: Nota[] = notasSugestao()) {
  localStorage.clear();
  const { api, colecoes } = apiFalsa(notas);
  const snack = { open: vi.fn() };
  const chamar = vi.fn();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([{ path: 'sugestoes', component: SugestoesPage }], withComponentInputBinding()),
      { provide: FIRESTORE, useValue: {} },
      { provide: FIRESTORE_API, useValue: api as unknown as FirestoreApi },
      { provide: CHAMAR_FUNCTION, useValue: chamar },
      { provide: AuthStore, useValue: { uid: signal('u1') } },
      { provide: RELOGIO, useValue: () => HOJE_SUGESTAO },
      { provide: MatSnackBar, useValue: snack },
    ],
  });
  return { api, colecoes, snack, chamar };
}

async function abrir(url = '/sugestoes') {
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url, SugestoesPage);
  await TestBed.inject(ApplicationRef).whenStable();
  harness.detectChanges();
  return { harness, el: harness.routeNativeElement as HTMLElement };
}

async function estabilizar(harness: RouterTestingHarness) {
  await TestBed.inject(ApplicationRef).whenStable();
  harness.detectChanges();
  await TestBed.inject(ApplicationRef).whenStable();
  harness.detectChanges();
}

function titulos(el: HTMLElement): string[] {
  return [...el.querySelectorAll('h2')].map((h) => texto(h));
}

function nomes(el: HTMLElement, secao: string): string[] {
  const s = el.querySelector(`[aria-labelledby="${secao}"]`)!;
  return [...s.querySelectorAll('.item-nome')].map((x) => texto(x));
}

describe('FaixaPreco', () => {
  function criar(f: FaixaDePreco) {
    const fixture = TestBed.createComponent(FaixaPreco);
    fixture.componentRef.setInput('faixa', f);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }
  const p = (valor: number, extra: Partial<CompraPessoal> = {}) => ({
    compra: compra(extra),
    valor,
  });

  it('último, mais barato e mais caro, com data, mercado e badge acima do menor', () => {
    const el = criar({
      base: 'unidade',
      sufixo: '/un',
      ultimoPago: p(5.29),
      maisBarato: p(4.49, { mercado: 'Mercado B', emissao: '2026-07-10T15:00:00.000Z' }),
      maisCaro: p(5.29),
    });
    expect([...el.querySelectorAll('dt')].map((x) => texto(x))).toEqual([
      'Última vez',
      'Mais barato',
      'Mais caro',
    ]);
    expect(texto(el.querySelectorAll('dd')[1])).toBe('R$ 4,49/un 10/07 · Mercado B');
    expect(texto(el.querySelector('cp-badge-preco'))).toBe(
      'trending_up R$ 0,80 acima do seu menor preço',
    );
  });

  it('último é o menor: badge "É o seu menor preço"', () => {
    const el = criar({
      base: 'L',
      sufixo: '/L',
      ultimoPago: p(4),
      maisBarato: p(4),
      maisCaro: p(6),
    });
    expect(texto(el.querySelector('cp-badge-preco'))).toBe('check É o seu menor preço');
  });

  it('todos iguais: "Sempre R$ X", sem badge', () => {
    const el = criar({
      base: 'unidade',
      sufixo: '/un',
      ultimoPago: p(4.99),
      maisBarato: p(4.99),
      maisCaro: p(4.99),
    });
    expect(texto(el.querySelector('dl'))).toBe('SempreR$ 4,99/un última vez 20/09 · Mercado A');
    expect(el.querySelector('cp-badge-preco')).toBeNull();
  });
});

describe('SugestaoItem', () => {
  function criar() {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const s = sugestoesFixture().find((x) => x.grupo === LEITE)!;
    const fixture = TestBed.createComponent(SugestaoItem);
    fixture.componentRef.setInput('sugestao', s);
    fixture.componentRef.setInput('selecionado', true);
    fixture.componentRef.setInput('quantidade', 2);
    fixture.detectChanges();
    const eventos: string[] = [];
    const c = fixture.componentInstance;
    c.alternar.subscribe(() => eventos.push('alternar'));
    c.jaTenho.subscribe(() => eventos.push('jaTenho'));
    c.naoSugerir.subscribe(() => eventos.push('naoSugerir'));
    c.quantidade.subscribe((n) => eventos.push(`qtd:${n}`));
    return { fixture, el: fixture.nativeElement as HTMLElement, eventos };
  }

  it('mostra nome, estado, ciclo e a quantidade; emite alternar e quantidade', () => {
    const { el, eventos } = criar();
    expect(el.querySelector('a')!.getAttribute('href')).toBe(`/produtos/${LEITE}`);
    expect(texto(el.querySelector('.cp-status--aguardando'))).toBe('schedule Hora de repor');
    expect(texto(el.querySelector('p'))).toBe(
      'Costuma comprar a cada 7 dias · última vez há 9 dias',
    );
    const check = el.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    expect(check.checked).toBe(true);
    expect(texto(el.querySelector(`label[for="${check.id}"]`))).toBe('LEITE INTEGRAL 1L');
    check.dispatchEvent(new Event('change'));
    const qtd = el.querySelector<HTMLInputElement>('input[type="number"]')!;
    expect(qtd.getAttribute('aria-label')).toBe('Quantidade de LEITE INTEGRAL 1L (L)');
    qtd.value = '3.5';
    qtd.dispatchEvent(new Event('change'));
    qtd.value = '0';
    qtd.dispatchEvent(new Event('change'));
    expect(eventos).toEqual(['alternar', 'qtd:3.5']);
  });

  it('"Por que esta sugestão?" alterna aria-expanded e lista as últimas compras', () => {
    const { fixture, el } = criar();
    const b = botao(el, /Por que esta sugestão/);
    const painel = el.querySelector<HTMLElement>(`#${b.getAttribute('aria-controls')}`)!;
    expect(b.getAttribute('aria-expanded')).toBe('false');
    expect(painel.hidden).toBe(true);
    b.click();
    fixture.detectChanges();
    expect(b.getAttribute('aria-expanded')).toBe('true');
    expect(painel.hidden).toBe(false);
    expect(painel.querySelectorAll('li')).toHaveLength(6);
    expect(texto(painel.querySelector('li'))).toBe('20/09/26 · Mercado Alfa 2 UN × R$ 4,99');
  });

  it('ações com o nome do produto no texto acessível', async () => {
    const { fixture, el, eventos } = criar();
    botao(el, 'Ações de LEITE INTEGRAL 1L').click();
    fixture.detectChanges();
    await fixture.whenStable();
    const itens = [...document.querySelectorAll<HTMLButtonElement>('[mat-menu-item]')];
    expect(itens.map((i) => texto(i))).toEqual([
      'checkJá tenho: LEITE INTEGRAL 1L',
      'visibility_offNão sugerir mais: LEITE INTEGRAL 1L',
    ]);
    itens[0].click();
    expect(eventos).toEqual(['jaTenho']);
  });
});

describe('PorMercado', () => {
  it('todo item aparece em algum card e as cestas seguem a cobertura', () => {
    const s = sugestoesFixture().filter((x) =>
      ([LEITE, ARROZ, BANANA, CAFE] as string[]).includes(x.grupo),
    );
    const itens = s.map((sugestao) => ({ sugestao, quantidade: sugestao.quantidade.valor }));
    const fixture = TestBed.createComponent(PorMercado);
    fixture.componentRef.setInput('grupos', agruparPorMaisBarato(itens));
    fixture.componentRef.setInput('cestas', montarCestas(itens));
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const grupos = el.querySelector('.pm-grupos')!;
    expect(grupos.querySelectorAll('.item-nome')).toHaveLength(4);
    expect([...grupos.querySelectorAll('h3')].map((h) => texto(h))).toEqual([
      'Mercado Beta',
      'Mercado Alfa',
      'Mercado Gama',
    ]);
    expect(texto(el.querySelector('.pm-total'))).toBe(
      'Comprando cada item onde saiu mais barato: R$ 56,22 em 3 mercados',
    );
    const cestas = [...el.querySelectorAll('.pm-cestas article')].map((a) => texto(a));
    expect(cestas[0]).toBe('Mercado BetaR$ 49,983 de 4 itensFaltam: BANANA PRATA KG');
    expect(cestas[2]).toContain('1 de 4 itens');
  });
});

describe('HoraDeRepor (painel)', () => {
  function criar(itens: Sugestao[], erro = false) {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: SugestoesStore,
          useValue: { horaDeRepor: signal(itens), erro: signal(erro) },
        },
      ],
    });
    const fixture = TestBed.createComponent(HoraDeRepor);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('lista até 5 itens com link para a sugestão completa', () => {
    const base = sugestoesFixture()[0];
    const itens = Array.from({ length: 5 }, (_, i) => ({ ...base, grupo: `g${i}` }));
    const el = criar(itens);
    expect(el.querySelectorAll('li')).toHaveLength(5);
    expect(texto(el.querySelector('li'))).toBe('scheduleLEITE INTEGRAL 1L comprou há 9 dias');
    expect(botao(el, 'Ver sugestão completa').getAttribute('href')).toBe('/sugestoes');
  });

  it('some sem sugestão ou com erro', () => {
    expect(criar([]).querySelector('section')).toBeNull();
    TestBed.resetTestingModule();
    expect(criar(sugestoesFixture(), true).querySelector('section')).toBeNull();
  });
});

describe('SugestoesPage', () => {
  afterEach(() => vi.restoreAllMocks());

  it('seções da lista completa e nenhuma leitura fora de notas/produtos', async () => {
    const { colecoes, chamar } = configurar();
    const { el } = await abrir();
    expect(titulos(el)).toEqual(['Hora de repor', 'Em breve', 'Parou de comprar?']);
    expect(nomes(el, 'sug-repor')).toEqual([
      'LEITE INTEGRAL 1L',
      'ARROZ T1 5KG',
      'BANANA PRATA KG',
    ]);
    expect(texto(el.querySelector('.sug-resumo'))).toBe(
      '5 itens para repor · total estimado R$ 93,52 · janela de 12 meses',
    );
    expect(texto(el.querySelector('cp-lista-completa > .cp-summary'))).toBe(
      'Como da última vezR$ 93,52No seu menor preçoR$ 87,89Seu melhor cenárioR$ 5,62 a menos',
    );
    const azeite = el.querySelectorAll('[aria-labelledby="sug-em-breve"] > ul > li')[1];
    expect(texto(azeite.querySelector('p'))).toBe(
      'Costuma comprar a cada 30 dias · última vez há 28 dias · estimativa com 2 compras',
    );
    expect(new Set(colecoes)).toEqual(new Set(['usuarios/u1/notas', 'produtos']));
    expect(chamar).not.toHaveBeenCalled();
  });

  it('desmarcar recalcula os totais; seções colapsadas abrem por botão', async () => {
    configurar();
    const { harness, el } = await abrir();
    const arroz = el.querySelector<HTMLInputElement>(
      '[aria-labelledby="sug-repor"] li:nth-child(2) input[type="checkbox"]',
    )!;
    arroz.click();
    harness.detectChanges();
    expect(texto(el.querySelector('.sug-resumo'))).toContain('4 itens para repor');
    expect(texto(el.querySelector('.sug-resumo'))).toContain('R$ 68,62');

    botao(el, 'Ver 1').click();
    harness.detectChanges();
    expect(el.querySelector<HTMLElement>('#sug-parou-lista')!.hidden).toBe(false);
    botao(el, 'Não sugerir mais ACHOCOLATADO PO 400G').click();
    harness.detectChanges();
    expect(titulos(el)).toContain('Itens ocultos');
    botao(el, 'Ver 1').click();
    harness.detectChanges();
    botao(el, 'Voltar a sugerir ACHOCOLATADO PO 400G').click();
    harness.detectChanges();
    expect(titulos(el)).not.toContain('Itens ocultos');
  });

  it('horizonte e visão pela URL, com o padrão fora dela', async () => {
    configurar();
    const { harness, el } = await abrir('/sugestoes?horizonte=quinzena&visao=mercado');
    expect(el.querySelector('cp-por-mercado')).not.toBeNull();
    expect(botao(el, 'Próximos 15 dias').getAttribute('aria-pressed')).toBe('true');

    botao(el, 'Lista completa').click();
    await estabilizar(harness);
    const url = () => TestBed.inject(Router).url;
    expect(url()).toBe('/sugestoes?horizonte=quinzena');
    expect(nomes(el, 'sug-em-breve')).toEqual([
      'CAFE TORRADO 500G',
      'DETERGENTE LIQUIDO 1L',
      'AZEITE EXTRA VIRGEM 500ML',
    ]);

    botao(el, 'Esta semana').click();
    await estabilizar(harness);
    expect(url()).toBe('/sugestoes');
    expect(nomes(el, 'sug-em-breve')).toEqual(['CAFE TORRADO 500G', 'AZEITE EXTRA VIRGEM 500ML']);

    botao(el, 'Próximo mês').click();
    await estabilizar(harness);
    expect(url()).toBe('/sugestoes?horizonte=mes');
    expect(nomes(el, 'sug-em-breve')).toEqual([
      'CAFE TORRADO 500G',
      'DETERGENTE LIQUIDO 1L',
      'AZEITE EXTRA VIRGEM 500ML',
    ]);

    botao(el, 'Esta semana').click();
    await estabilizar(harness);
    botao(el, 'Por mercado').click();
    await estabilizar(harness);
    expect(url()).toBe('/sugestoes?visao=mercado');
  });

  it('"Já tenho" some e continua oculto ao remontar', async () => {
    configurar();
    const { harness, el } = await abrir();
    botao(el, 'Ações de BANANA PRATA KG').click();
    harness.detectChanges();
    await harness.fixture.whenStable();
    const jaTenho = [...document.querySelectorAll<HTMLButtonElement>('[mat-menu-item]')].find((b) =>
      texto(b).includes('Já tenho'),
    )!;
    jaTenho.click();
    harness.detectChanges();
    expect(nomes(el, 'sug-repor')).toEqual(['LEITE INTEGRAL 1L', 'ARROZ T1 5KG']);

    TestBed.resetTestingModule();
    const storage = localStorage.getItem('cp-sugestao-dispensados:u1');
    configurar();
    localStorage.setItem('cp-sugestao-dispensados:u1', storage!);
    const deNovo = await abrir();
    expect(nomes(deNovo.el, 'sug-repor')).toEqual(['LEITE INTEGRAL 1L', 'ARROZ T1 5KG']);
  });

  it('"Copiar lista" copia o texto da visão atual; "Compartilhar" só com navigator.share', async () => {
    const { snack } = configurar();
    const writeText = vi.fn<(texto: string) => Promise<void>>(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const { el, harness } = await abrir('/sugestoes?visao=mercado');
    expect(() => botao(el, /Compartilhar/)).toThrow();
    botao(el, /Copiar lista/).click();
    await estabilizar(harness);
    expect(writeText.mock.calls[0][0]).toContain('Mercado Beta: 2 itens, R$ 39,40');
    expect(snack.open).toHaveBeenCalledWith('Lista copiada', 'OK', { duration: 2500 });

    writeText.mockRejectedValueOnce(new Error('negado'));
    botao(el, /Copiar lista/).click();
    await estabilizar(harness);
    expect(snack.open).toHaveBeenLastCalledWith('Não foi possível copiar.', 'OK', {
      duration: 3000,
    });
  });

  it('"Compartilhar" usa o navigator.share quando existe', async () => {
    configurar();
    const share = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    try {
      const { el, harness } = await abrir();
      botao(el, /Compartilhar/).click();
      await estabilizar(harness);
      expect(share).toHaveBeenCalledWith({
        title: 'Lista de compras',
        text: expect.stringContaining('LEITE INTEGRAL 1L'),
      });
      share.mockRejectedValueOnce(new Error('cancelado'));
      botao(el, /Compartilhar/).click();
      await estabilizar(harness);
    } finally {
      delete (navigator as { share?: unknown }).share;
    }
  });

  it('nada no período: aponta o próximo mês, sem totais nem ações', async () => {
    const soDetergente = notasSugestao()
      .map((n) => ({ ...n, itens: n.itens.filter((i) => i.descricao.startsWith('DETERGENTE')) }))
      .filter((n) => n.itens.length);
    configurar(soDetergente);
    const { harness, el } = await abrir();
    expect(texto(el.querySelector('.sug-vazio p'))).toBe('Nada para repor esta semana.');
    expect(el.querySelector('cp-lista-completa')).toBeNull();
    expect(() => botao(el, /Copiar lista/)).toThrow();
    botao(el, 'Ver o próximo mês (1 item)').click();
    await estabilizar(harness);
    expect(TestBed.inject(Router).url).toBe('/sugestoes?horizonte=mes');
    expect(nomes(el, 'sug-em-breve')).toEqual(['DETERGENTE LIQUIDO 1L']);
    expect(texto(el.querySelector('[aria-labelledby="sug-em-breve"] p'))).not.toContain(
      'estimativa',
    );
  });

  it('histórico insuficiente mostra o estado vazio com "Importar nota"', async () => {
    configurar(notasSugestao().slice(0, 2));
    const { el } = await abrir();
    expect(texto(el.querySelector('.cp-empty-title'))).toBe('Ainda não dá para sugerir');
    expect(botao(el, /Importar nota/).getAttribute('href')).toBe('/importar');
  });

  it('erro mostra "Tentar de novo", que recarrega', async () => {
    const { api } = configurar();
    api.getDocs.mockRejectedValueOnce(new Error('offline'));
    const { harness, el } = await abrir();
    expect(texto(el.querySelector('[role="alert"]'))).toContain('Não foi possível carregar');
    botao(el, 'Tentar de novo').click();
    await estabilizar(harness);
    expect(el.querySelector('[role="alert"]')).toBeNull();
    expect(titulos(el)).toContain('Hora de repor');
  });

  it('funciona com o storage bloqueado', async () => {
    configurar();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    const { el } = await abrir();
    expect(titulos(el)).toContain('Hora de repor');
  });

  it('depois do detalhe de uma nota, abrir a sugestão não relê as notas', async () => {
    const { colecoes } = configurar();
    const [nota] = notasSugestao();
    await TestBed.inject(HistoricoPessoalStore).comparar(nota);
    const leituras = colecoes.filter((c) => c.endsWith('/notas')).length;
    await abrir();
    expect(colecoes.filter((c) => c.endsWith('/notas')).length).toBe(leituras);
  });
});
