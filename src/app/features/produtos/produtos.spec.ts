import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import type { Estabelecimento, Nota, Preco, Produto, ProdutoId } from '@shared/model';
import { vi } from 'vitest';
import { texto } from '../../../testing/dom';
import { AuthStore } from '../../core/auth/auth.store';
import { CHAMAR_FUNCTION } from '../../core/firebase/callable';
import { FIRESTORE_API, FirestoreApi } from '../../core/firebase/firestore-api';
import { FIRESTORE } from '../../core/firebase/firestore.token';
import { GraficoHistorico } from '../../shared/ui/grafico-historico/grafico-historico';
import { EstabelecimentosService } from '../estabelecimentos/data-access/estabelecimentos.service';
import { economiaPotencial, totalDe, variacao } from '../painel/painel.calculos';
import ProdutosBuscaPage from './busca/produtos-busca.page';
import {
  PrecoComId,
  ProdutosService,
  emGrupos,
  tokenMaisRaro,
} from './data-access/produtos.service';
import { limitarSeries, resumirPrecos } from './detalhe/resumo';
import { mesmoConteudo, sugerir } from './vincular/vincular-dialog';

function produto(id: string, extra: Partial<Produto> = {}): Produto {
  return {
    id: id as ProdutoId,
    ean: id.startsWith('ean:') ? id.slice(4) : null,
    descricao: 'LEITE UHT INTEGRAL 1L',
    descricaoNorm: 'LEITE UHT INTEGRAL 1L',
    tokens: ['LEITE', 'UHT', 'INTEGRAL', '1L'],
    conteudo: { quantidade: 1, unidadeBase: 'L' },
    vinculadoA: null,
    menorPreco: null,
    ultimaObservacao: null,
    ...extra,
  };
}

/** Firestore falso em memória: coleções por caminho e filtros `==`, `in`, `>=`, `array-contains`. */
function firestoreFalso(colecoes: Record<string, Record<string, unknown>>) {
  interface Filtro {
    campo: string;
    op: string;
    valor: unknown;
  }
  const api = {
    collection: vi.fn((_: unknown, c: string) => ({ c })),
    doc: vi.fn((_: unknown, c: string) => ({ c })),
    documentId: vi.fn(() => '__id__'),
    where: vi.fn((campo: string, op: string, valor: unknown) => ({ campo, op, valor })),
    orderBy: vi.fn(() => ({})),
    limit: vi.fn((n: number) => ({ limite: n })),
    startAfter: vi.fn(() => ({})),
    query: vi.fn((col: { c: string }, ...r: (Filtro | { limite?: number })[]) => ({ col, r })),
    getDoc: vi.fn(async (ref: { c: string }) => {
      const [col, id] = ref.c.split('/');
      const d = colecoes[col]?.[id];
      return { exists: () => !!d, data: () => d, id };
    }),
    getDocs: vi.fn(async (q: { col: { c: string }; r: (Filtro & { limite?: number })[] }) => {
      let docs = Object.entries(colecoes[q.col.c] ?? {});
      for (const f of q.r.filter((x) => x.op)) {
        docs = docs.filter(([id, d]) => {
          const v = f.campo === '__id__' ? id : (d as Record<string, unknown>)[f.campo];
          if (f.op === '==') return v === f.valor;
          if (f.op === 'in') return (f.valor as unknown[]).includes(v);
          if (f.op === '>=') return String(v) >= String(f.valor);
          if (f.op === 'array-contains') return (v as unknown[]).includes(f.valor);
          return true;
        });
      }
      const lim = q.r.find((x) => x.limite)?.limite;
      return { docs: docs.slice(0, lim).map(([id, d]) => ({ id, data: () => d })) };
    }),
  };
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: FIRESTORE, useValue: {} },
      { provide: FIRESTORE_API, useValue: api as unknown as FirestoreApi },
      {
        provide: CHAMAR_FUNCTION,
        useValue: vi.fn(async () => ({ ok: true, canonico: 'ean:7891000100103' })),
      },
      { provide: AuthStore, useValue: { uid: signal('u1') } },
    ],
  });
  return api;
}

const hoje = new Date().toISOString();

describe('ProdutosService', () => {
  it('busca por EAN usa getDoc em ean:<gtin>', async () => {
    const api = firestoreFalso({ produtos: { 'ean:7894900011517': produto('ean:7894900011517') } });
    const s = TestBed.inject(ProdutosService);
    expect((await s.buscar('7894900011517')).map((p) => p.id)).toEqual(['ean:7894900011517']);
    expect(api.getDoc).toHaveBeenCalledWith({ c: 'produtos/ean:7894900011517' });
    expect(api.getDocs).not.toHaveBeenCalled();
    expect(await s.buscar('7894900011518')).toEqual([]);
  });

  it('busca por texto consulta o token mais raro e filtra os demais no cliente', async () => {
    const api = firestoreFalso({
      produtos: {
        a: produto('loc:1:a'),
        b: produto('loc:1:b', {
          descricao: 'LEITE DESNATADO 1L',
          tokens: ['LEITE', 'DESNATADO', '1L'],
        }),
      },
    });
    const s = TestBed.inject(ProdutosService);
    const r = await s.buscar('leite integral 1l');
    expect(api.where).toHaveBeenCalledWith('tokens', 'array-contains', 'INTEGRAL');
    expect(r.map((p) => p.id)).toEqual(['loc:1:a']);
    expect(tokenMaisRaro(['LEITE', 'INTEGRAL', '1L'])).toBe('INTEGRAL');
    expect(tokenMaisRaro(['1L'])).toBe('1L');
    expect(tokenMaisRaro([])).toBeNull();
  });

  it('equivalentes são resolvidos pelo canônico', async () => {
    firestoreFalso({
      produtos: {
        'ean:7891000100103': produto('ean:7891000100103'),
        'loc:03644587000836:1001': produto('loc:03644587000836:1001', {
          vinculadoA: 'ean:7891000100103',
        }),
        'loc:11222333000181:77': produto('loc:11222333000181:77', {
          vinculadoA: 'ean:7891000100103',
        }),
      },
    });
    const s = TestBed.inject(ProdutosService);
    const ids = (await s.equivalentes('loc:03644587000836:1001')).map((p) => p.id).sort();
    expect(ids).toEqual(['ean:7891000100103', 'loc:03644587000836:1001', 'loc:11222333000181:77']);
    expect(await s.equivalentes('inexistente')).toEqual([]);
  });

  it('preços do vinculado entram na página do EAN (em grupos de 30, com chave da nota)', async () => {
    const preco = (produtoId: string, cnpj: string): Preco => ({
      produtoId: produtoId as ProdutoId,
      cnpj,
      vlUnit: 4.49,
      unidade: 'UN',
      precoPorUnidadeBase: null,
      emissao: hoje,
    });
    firestoreFalso({
      precos: {
        CHAVEA_1: preco('loc:03644587000836:1001', '03644587000836'),
        CHAVEB_1: preco('ean:7891000100103', '11222333000181'),
        CHAVEC_1: preco('outro', '1'),
      },
    });
    const r = await TestBed.inject(ProdutosService).precos([
      'ean:7891000100103',
      'loc:03644587000836:1001',
    ]);
    expect(r.map((p) => p.chave).sort()).toEqual(['CHAVEA', 'CHAVEB']);
    expect(emGrupos(Array.from({ length: 65 }, (_, i) => i)).map((g) => g.length)).toEqual([
      30, 30, 5,
    ]);
  });

  it('vincular chama a callable', async () => {
    firestoreFalso({});
    const r = await TestBed.inject(ProdutosService).vincular('loc:1:a', 'ean:7891000100103');
    expect(r.ok).toBe(true);
    expect(TestBed.inject(CHAMAR_FUNCTION)).toHaveBeenCalledWith('vincularProduto', {
      origem: 'loc:1:a',
      destino: 'ean:7891000100103',
    });
  });
});

describe('resumirPrecos (seed 3 estabelecimentos × 6 datas)', () => {
  const estab = new Map<string, Estabelecimento>([
    ['A', { cnpj: 'A', nome: 'Mercado A', endereco: '', cidade: '', uf: 'PR', atualizadoEm: hoje }],
    [
      'B',
      {
        cnpj: 'B',
        nome: 'Mercado B',
        fantasia: 'Bom Preço',
        endereco: '',
        cidade: '',
        uf: 'PR',
        atualizadoEm: hoje,
      },
    ],
  ]);
  const precos: PrecoComId[] = [];
  const valores: Record<string, number[]> = {
    A: [5, 5.2, 5.1, 5.3, 5.4, 5.5],
    B: [4, 4.1, 4.2, 4.3, 4.4, 4.49],
    C: [6, 6, 6, 6, 6, 6.99],
  };
  for (const [cnpj, lista] of Object.entries(valores)) {
    lista.forEach((v, i) => {
      const emissao = new Date(Date.UTC(2026, 8, 1 + i * 5)).toISOString();
      precos.push({
        id: `${cnpj}${i}_1`,
        chave: `${cnpj}${i}`,
        produtoId: 'ean:7891000100103',
        cnpj,
        vlUnit: v,
        unidade: 'UN',
        precoPorUnidadeBase: { valor: v, unidade: 'L' },
        emissao,
      });
    });
  }

  it('menor, médio e maior sobre o último preço de cada estabelecimento', () => {
    const r = resumirPrecos(precos, estab, new Set(['B5']))!;
    expect(r.unidade).toBe('L');
    expect(r.menor).toBe(4.49);
    expect(r.maior).toBe(6.99);
    expect(r.medio).toBe(Math.round(((5.5 + 4.49 + 6.99) / 3) * 100) / 100);
    expect(r.porEstabelecimento.map((e) => [e.nome, e.valor, e.diferenca, e.fonte])).toEqual([
      ['Bom Preço', 4.49, 0, 'minhas-notas'],
      ['Mercado A', 5.5, 1.01, 'comunidade'],
      ['C', 6.99, 2.5, 'comunidade'],
    ]);
    expect(r.series).toHaveLength(3);
    expect(r.series[0].pontos).toHaveLength(6);
    expect(resumirPrecos([], estab)).toBeNull();
  });

  it('sem unidade base comum, compara pelo preço do item', () => {
    const mistos = precos.map((p, i) => (i % 2 ? { ...p, precoPorUnidadeBase: null } : p));
    expect(resumirPrecos(mistos, estab)!.unidade).toBeNull();
  });

  it('o gráfico desenha 3 séries com tabela equivalente', () => {
    const r = resumirPrecos(precos, estab)!;
    const fixture = TestBed.createComponent(GraficoHistorico);
    fixture.componentRef.setInput('series', r.series);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('polyline')).toHaveLength(3);
    expect(el.querySelectorAll('circle')).toHaveLength(18);
    expect(el.querySelectorAll('table tbody tr')).toHaveLength(18);
    expect(el.querySelector('circle title')?.textContent).toContain('R$');
    expect(el.querySelectorAll('polyline')[1].getAttribute('stroke-dasharray')).toBe('6 4');
  });

  it('mais de 5 séries: o resto vira "Outros"', () => {
    const series = Array.from({ length: 7 }, (_, i) => ({
      nome: `S${i}`,
      pontos: [{ data: `2026-09-0${i + 1}`, valor: i }],
    }));
    const r = limitarSeries(series);
    expect(r).toHaveLength(5);
    expect(r[4].nome).toBe('Outros');
    expect(limitarSeries(series.slice(0, 3))).toHaveLength(3);
  });
});

describe('vínculo: sugestões', () => {
  it('sugere por Jaccard com o mesmo conteúdo, sem o próprio produto e os já ligados', () => {
    const base = produto('loc:1:a', { descricao: 'LEITE UHT INT 1L' });
    const candidatos = [
      produto('ean:7891000100103', { descricao: 'LEITE UHT INTEGRAL PIRACANJUBA 1L' }),
      produto('loc:2:b', {
        descricao: 'LEITE UHT INTEGRAL 200ML',
        conteudo: { quantidade: 0.2, unidadeBase: 'L' },
      }),
      produto('loc:3:c', {
        descricao: 'CAFE 500G',
        conteudo: { quantidade: 0.5, unidadeBase: 'kg' },
      }),
      produto('loc:4:d', { descricao: 'LEITE UHT INT 1L' }),
      base,
    ];
    expect(sugerir(base, candidatos, new Set(['loc:4:d'])).map((p) => p.id)).toEqual([
      'ean:7891000100103',
    ]);
    expect(mesmoConteudo(base, produto('x', { conteudo: null }))).toBe(true);
  });
});

describe('ProdutosBuscaPage', () => {
  it('EAN existente abre o resultado; inexistente oferece o atalho para o Menor Preço', async () => {
    firestoreFalso({
      produtos: {
        'ean:7894900011517': produto('ean:7894900011517', {
          descricao: 'COCA COLA 2L',
          cnpjs: ['A', 'B'],
          menorPreco: { cnpj: 'A', vlUnit: 9.99, emissao: hoje },
        }),
      },
    });
    const fixture = TestBed.createComponent(ProdutosBuscaPage);
    fixture.componentRef.setInput('q', '7894900011517');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('a.cp-list-row')!.getAttribute('href')).toBe(
      '/produtos/ean:7894900011517',
    );
    expect(texto(el)).toContain('2 estabelecimentos');
    expect(texto(el)).toContain('R$ 9,99');

    fixture.componentRef.setInput('q', '7891000100103');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const atalho = [...el.querySelectorAll('a')].find(
      (a) => texto(a) === 'Ver preços perto de mim',
    )!;
    expect(atalho.getAttribute('href')).toBe('/regiao?gtin=7891000100103');
  });

  it('texto digitado vai para a query string', async () => {
    vi.useFakeTimers();
    firestoreFalso({});
    const navegar = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(ProdutosBuscaPage);
    fixture.detectChanges();
    const campo = (fixture.nativeElement as HTMLElement).querySelector('input')!;
    campo.value = 'café';
    campo.dispatchEvent(new Event('input'));
    campo.dispatchEvent(new Event('blur'));
    fixture.detectChanges();
    vi.advanceTimersByTime(450);
    TestBed.tick();
    fixture.detectChanges();
    expect(navegar).toHaveBeenCalledWith(
      [],
      expect.objectContaining({ queryParams: { q: 'café' } }),
    );
    vi.useRealTimers();
  });
});

describe('EstabelecimentosService', () => {
  it('produtos recentes: um por produto, com a descrição', async () => {
    const p = (produtoId: string, emissao: string, vlUnit: number): Preco => ({
      produtoId: produtoId as ProdutoId,
      cnpj: 'A',
      vlUnit,
      unidade: 'UN',
      precoPorUnidadeBase: null,
      emissao,
    });
    firestoreFalso({
      precos: {
        x_1: p('loc:A:1', '2026-09-20', 5),
        x_2: p('loc:A:1', '2026-09-10', 4),
        y_1: p('loc:A:2', '2026-09-15', 3),
      },
      produtos: { 'loc:A:1': produto('loc:A:1', { descricao: 'ARROZ 5KG' }) },
    });
    const r = await TestBed.inject(EstabelecimentosService).produtosRecentes('A');
    expect(r.map((x) => [x.produtoId, x.preco.vlUnit, x.produto?.descricao ?? null])).toEqual([
      ['loc:A:1', 5, 'ARROZ 5KG'],
      ['loc:A:2', 3, null],
    ]);
  });
});

describe('painel: cálculos (seed de notas em 2 meses)', () => {
  const nota = (total: number, itens: Nota['itens'] = []): Nota => ({
    chave: String(total),
    cnpj: 'A',
    estabelecimentoNome: 'A',
    estabelecimentoCidade: '',
    emissao: hoje,
    total,
    desconto: 0,
    qtdItens: itens.length,
    itens,
    importadaEm: hoje,
  });
  const item = (produtoId: string, vlUnit: number, qtd: number) => ({
    n: 1,
    descricao: '',
    codigo: '',
    ean: null,
    qtd,
    unidade: 'UN',
    vlUnit,
    vlTotal: vlUnit * qtd,
    produtoId: produtoId as ProdutoId,
    precoPorUnidadeBase: null,
  });

  it('total, variação e economia conferem com o cálculo manual', () => {
    const setembro = [
      nota(100, [item('p1', 5, 2), item('p2', 3, 1)]),
      nota(50.5, [item('p3', 10, 1)]),
    ];
    const agosto = [nota(120)];
    const produtos = new Map<string, Produto>([
      ['p1', produto('p1', { menorPreco: { cnpj: 'B', vlUnit: 4.2, emissao: hoje } })],
      ['p2', produto('p2', { menorPreco: { cnpj: 'A', vlUnit: 3, emissao: hoje } })],
      ['p3', produto('p3', { menorPreco: { cnpj: 'C', vlUnit: 9.5, emissao: hoje } })],
    ]);
    expect(totalDe(setembro)).toBe(150.5);
    expect(variacao(150.5, totalDe(agosto))).toBe(25.4);
    expect(variacao(10, 0)).toBeNull();
    expect(economiaPotencial(setembro, produtos)).toBe(
      Math.round(((5 - 4.2) * 2 + (10 - 9.5) * 1) * 100) / 100,
    );
  });
});
