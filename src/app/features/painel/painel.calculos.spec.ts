import type { Nota } from '@shared/model';
import {
  AGOSTO,
  GRUPOS_PAINEL,
  HOJE_PAINEL,
  NOTAS_PAINEL,
  OUTUBRO,
  SETEMBRO,
  notaPainel,
} from '../../../testing/fixtures/painel/notas';
import { HOJE_SUGESTAO, notasSugestao } from '../../../testing/fixtures/sugestao/notas';
import { ALFA, BETA, GAMA, LEITE, PILHA } from '../../../testing/fixtures/sugestao/produtos';
import type { NotaComparada } from '../notas/data-access/historico-pessoal.store';
import {
  Grupos,
  compararNota,
  consolidarItens,
  indexarCompras,
  resumirHistorico,
} from '../notas/detalhe/historico-pessoal';
import {
  barrasPorCompra,
  destaquesDoPeriodo,
  filtroDoMes,
  gastoPorMercado,
  inicioDoMes,
  mediaDosFechados,
  mesDe,
  mesDeReferencia,
  mesesComNota,
  notasDoMes,
  ondeMaisGasta,
  precosQueSubiram,
  resumoDoPeriodo,
  seriesPorMes,
  somarMeses,
  totalDe,
  variacao,
  variacaoComparavel,
} from './painel.calculos';

function comparar(notas: readonly Nota[], grupos: Grupos = GRUPOS_PAINEL): NotaComparada[] {
  const indice = indexarCompras(notas, grupos);
  return notas.map((nota) => {
    const comparacao = compararNota(nota, indice, grupos);
    return { nota, comparacao, resumo: resumirHistorico(consolidarItens(nota.itens), comparacao) };
  });
}

const local = (a: number, m: number, d: number) => new Date(a, m - 1, d, 12);

describe('painel: totais e variação', () => {
  it('total arredondado e variação com uma casa; sem base é null', () => {
    expect(totalDe(NOTAS_PAINEL)).toBe(159.53);
    expect(variacao(150.5, 120)).toBe(25.4);
    expect(variacao(10, 0)).toBeNull();
  });

  it('meses no horário local', () => {
    expect(mesDe(OUTUBRO.emissao)).toBe('2026-10');
    expect(somarMeses('2026-01', -1)).toBe('2025-12');
    expect(somarMeses('2026-12', 1)).toBe('2027-01');
    expect(inicioDoMes('2026-10')).toEqual(new Date(2026, 9, 1));
    expect(filtroDoMes('2026-02')).toEqual({
      periodo: 'personalizado',
      de: '2026-02-01',
      ate: '2026-02-28',
    });
    expect(filtroDoMes('2026-10').ate).toBe('2026-10-31');
  });
});

describe('painel: mês de referência (D-03)', () => {
  it('mês atual quando tem nota', () => {
    expect(mesDeReferencia(NOTAS_PAINEL, HOJE_PAINEL, 'atual')).toBe('2026-10');
  });

  it('mês atual vazio cai no último mês com nota', () => {
    expect(mesDeReferencia(NOTAS_PAINEL, local(2026, 11, 2), 'atual')).toBe('2026-10');
    expect(mesDeReferencia([AGOSTO, SETEMBRO], HOJE_PAINEL, 'atual')).toBe('2026-09');
  });

  it('mês posterior a hoje não conta; sem nota é null', () => {
    expect(mesDeReferencia([OUTUBRO, AGOSTO], local(2026, 9, 10), 'atual')).toBe('2026-08');
    expect(mesDeReferencia(NOTAS_PAINEL, local(2026, 7, 10), 'atual')).toBeNull();
    expect(mesDeReferencia([], HOJE_PAINEL, 'atual')).toBeNull();
  });

  it('"anterior" é o mês calendário anterior', () => {
    expect(mesDeReferencia(NOTAS_PAINEL, HOJE_PAINEL, 'anterior')).toBe('2026-09');
    expect(notasDoMes(NOTAS_PAINEL, '2026-09')).toEqual([SETEMBRO]);
  });
});

describe('painel: variação comparável', () => {
  const mes = (dia: number, total: number, m = 9) =>
    notaPainel(`${m}-${dia}`, ALFA, local(2026, m, dia).toISOString(), [
      { produtoId: LEITE, descricao: 'LEITE INTEGRAL 1L', qtd: 1, vlUnit: total },
    ]);

  it('mês em curso compara com o anterior até o mesmo dia', () => {
    const notas = [mes(3, 50, 10), mes(2, 40), mes(20, 100)];
    expect(variacaoComparavel(notas, '2026-10', local(2026, 10, 5))).toEqual({
      percentual: 25,
      base: 40,
      parcial: true,
      dia: 5,
    });
  });

  it('dia 31 contra mês de 30 dias pega o mês anterior inteiro', () => {
    const notas = [mes(31, 90, 10), mes(30, 60)];
    expect(variacaoComparavel(notas, '2026-10', local(2026, 10, 31))?.base).toBe(60);
  });

  it('mês fechado compara com o anterior inteiro; base zero é null', () => {
    const notas = [mes(3, 50, 10), mes(2, 40), mes(20, 60)];
    expect(variacaoComparavel(notas, '2026-10', local(2026, 11, 2))).toMatchObject({
      percentual: -50,
      base: 100,
      parcial: false,
    });
    expect(variacaoComparavel([mes(3, 50, 10)], '2026-10', local(2026, 10, 5))).toBeNull();
  });
});

describe('painel: resumo e saldo do período', () => {
  const comparadas = comparar(NOTAS_PAINEL);
  const daNota = (n: Nota) => comparadas.filter((c) => c.nota === n);

  it('saldo de setembro: leite a mais, café e arroz vinculado de economia', () => {
    expect(resumoDoPeriodo(daNota(SETEMBRO))).toEqual({
      total: 50.38,
      qtdNotas: 1,
      ticketMedio: 50.38,
      aMais: 1,
      itensAcima: 1,
      economia: 4.4,
      itensNovoMelhor: 2,
      saldo: -3.4,
      comparados: 3,
    });
  });

  it('saldo do período é a soma dos saldos das notas', () => {
    const r = resumoDoPeriodo(comparadas);
    expect(r).toMatchObject({ total: 159.53, qtdNotas: 3, ticketMedio: 53.18, aMais: 4 });
    expect(r.saldo).toBe(
      Math.round(comparadas.reduce((s, c) => s + c.resumo.saldo, 0) * 100) / 100,
    );
    expect(resumoDoPeriodo(daNota(OUTUBRO))).toMatchObject({ aMais: 3, saldo: 3, comparados: 2 });
  });

  it('sem item comparável e sem nota', () => {
    expect(resumoDoPeriodo(daNota(AGOSTO))).toMatchObject({ comparados: 0, saldo: 0 });
    expect(resumoDoPeriodo([])).toMatchObject({ total: 0, ticketMedio: 0, qtdNotas: 0 });
  });
});

describe('painel: séries mensais (D-04)', () => {
  it('histórico curto: meses vazios com zero, mês atual parcial e média dos fechados', () => {
    const barras = seriesPorMes(comparar(NOTAS_PAINEL), HOJE_PAINEL, 6);
    expect(barras.map((b) => b.mes)).toEqual([
      '2026-05',
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
      '2026-10',
    ]);
    expect(barras.map((b) => b.total)).toEqual([0, 0, 0, 73.68, 50.38, 35.47]);
    expect(barras.map((b) => b.saldo)).toEqual([0, 0, 0, 0, -3.4, 3]);
    expect(barras.at(-1)!.parcial).toBe(true);
    expect(barras.filter((b) => b.parcial)).toHaveLength(1);
    expect(mediaDosFechados(barras)).toBe(62.03);
    expect(mesesComNota(NOTAS_PAINEL)).toBe(3);
  });

  it('12 meses da fixture longa', () => {
    const notas = notasSugestao();
    const barras = seriesPorMes(comparar(notas, new Map()), HOJE_SUGESTAO, 12);
    expect(barras).toHaveLength(12);
    expect(barras.every((b) => b.qtdNotas > 0)).toBe(true);
    expect(barras.reduce((s, b) => s + b.qtdNotas, 0)).toBe(
      notas.filter((n) => mesDe(n.emissao) > somarMeses('2026-09', -12)).length,
    );
  });

  it('sem mês fechado com nota não há média', () => {
    expect(mediaDosFechados(seriesPorMes([], HOJE_PAINEL, 3))).toBeNull();
    expect(mediaDosFechados(seriesPorMes(comparar([OUTUBRO]), HOJE_PAINEL, 3))).toBeNull();
  });

  it('mês fechado sem nota não puxa a média para baixo', () => {
    const barras = seriesPorMes(comparar([OUTUBRO, AGOSTO]), HOJE_PAINEL, 6);
    expect(barras.find((b) => b.mes === '2026-09')!.qtdNotas).toBe(0);
    expect(mediaDosFechados(barras)).toBe(73.68);
  });

  it('uma barra por compra em ordem cronológica', () => {
    expect(barrasPorCompra(comparar(NOTAS_PAINEL))).toEqual([
      { chave: 'agosto', emissao: AGOSTO.emissao, mercado: 'Mercado Alfa', total: 73.68, saldo: 0 },
      {
        chave: 'setembro',
        emissao: SETEMBRO.emissao,
        mercado: 'Mercado Beta',
        total: 50.38,
        saldo: -3.4,
      },
      {
        chave: 'outubro',
        emissao: OUTUBRO.emissao,
        mercado: 'Mercado Alfa',
        total: 35.47,
        saldo: 3,
      },
    ]);
  });
});

describe('painel: gasto por mercado', () => {
  const nota = (m: { cnpj: string; nome: string }, total: number, dia = 1) =>
    notaPainel(`${m.cnpj}-${dia}`, m, local(2026, 10, dia).toISOString(), [
      { produtoId: PILHA, descricao: 'PILHA', qtd: 1, vlUnit: total },
    ]);

  it('ordena por total, com % e nº de notas; nome da nota mais recente', () => {
    const renomeado = { ...nota(ALFA, 20, 9), estabelecimentoNome: 'Alfa do bairro' };
    expect(gastoPorMercado([renomeado, nota(ALFA, 30, 2), nota(BETA, 50)])).toEqual([
      { cnpj: ALFA.cnpj, nome: 'Alfa do bairro', total: 50, percentual: 50, qtdNotas: 2 },
      { cnpj: BETA.cnpj, nome: 'Mercado Beta', total: 50, percentual: 50, qtdNotas: 1 },
    ]);
  });

  it('"Outros" só com mais mercados que o limite', () => {
    const r = gastoPorMercado([nota(ALFA, 60), nota(BETA, 30), nota(GAMA, 10)], 2);
    expect(r.map((m) => [m.cnpj, m.nome, m.percentual])).toEqual([
      [ALFA.cnpj, 'Mercado Alfa', 60],
      [BETA.cnpj, 'Mercado Beta', 30],
      [null, 'Outros', 10],
    ]);
    expect(gastoPorMercado([])).toEqual([]);
    expect(gastoPorMercado([nota(ALFA, 0)])[0].percentual).toBe(0);
  });
});

describe('painel: destaques do período', () => {
  it('pagou mais por impacto e economizou por economia, com a referência', () => {
    const { pagouMais, economizou } = destaquesDoPeriodo(comparar(NOTAS_PAINEL));
    expect(pagouMais.map((d) => [d.chave, d.nome, d.valor])).toEqual([
      ['outubro', 'CAFE TORRADO 500G', 2.4],
      ['setembro', 'Leite Integral 1 L', 1],
      ['outubro', 'Leite Integral 1 L', 0.6],
    ]);
    expect(pagouMais[0]).toMatchObject({
      atual: 18.9,
      melhor: 16.5,
      sufixo: '/un',
      percentual: 14.5,
      referencia: { mercado: 'Mercado Beta', emissao: SETEMBRO.emissao },
    });
    expect(economizou.map((d) => [d.nome, d.valor, d.percentual])).toEqual([
      ['CAFE TORRADO 500G', 2.4, 12.7],
      ['ARROZ TIPO1 PCT 5KG', 2, 8],
    ]);
  });

  it('limite e período sem comparação', () => {
    expect(destaquesDoPeriodo(comparar(NOTAS_PAINEL), 1).pagouMais).toHaveLength(1);
    expect(destaquesDoPeriodo(comparar([AGOSTO]))).toEqual({ pagouMais: [], economizou: [] });
    const semItem = comparar(NOTAS_PAINEL).map((c) => ({ ...c, nota: { ...c.nota, itens: [] } }));
    expect(destaquesDoPeriodo(semItem)).toEqual({ pagouMais: [], economizou: [] });
  });
});

describe('painel: preços que mais subiram (D-05)', () => {
  it('funciona com 2 compras: primeira × última, só altas relevantes', () => {
    const altas = precosQueSubiram(indexarCompras(NOTAS_PAINEL, GRUPOS_PAINEL));
    expect(altas).toEqual([
      {
        grupo: LEITE,
        produtoId: LEITE,
        nome: 'Leite Integral 1 L',
        de: 4.99,
        para: 5.29,
        percentual: 6,
        sufixo: '/un',
        desde: AGOSTO.emissao,
        em: OUTUBRO.emissao,
        vezes: 3,
      },
    ]);
  });

  it('alta pequena, queda, compra única e base incompatível ficam de fora', () => {
    const item = (descricao: string, vlUnit: number) => ({
      produtoId: LEITE,
      descricao,
      qtd: 1,
      vlUnit,
    });
    const em = (dia: number, descricao: string, vlUnit: number) =>
      notaPainel(`d${dia}`, ALFA, local(2026, 10, dia).toISOString(), [item(descricao, vlUnit)]);
    const pequena = [em(2, 'LEITE 1L', 5), em(9, 'LEITE 1L', 5.2)];
    const centavos = [em(2, 'LEITE 1L', 1), em(9, 'LEITE 1L', 1.08)];
    const incompativel = [em(2, 'LEITE 500ML', 3), em(9, 'LEITE 1L', 5)];
    const indice = (notas: Nota[]) => indexarCompras(notas, new Map());
    expect(precosQueSubiram(indice(pequena))).toEqual([]);
    expect(precosQueSubiram(indice(centavos))).toEqual([]);
    expect(precosQueSubiram(indice([em(2, 'LEITE 1L', 5)]))).toEqual([]);
    expect(precosQueSubiram(indice(incompativel))).toEqual([]);
    expect(precosQueSubiram(new Map([['vazio', []]]))).toEqual([]);
  });

  it('ordena por percentual e respeita o limite', () => {
    const altas = precosQueSubiram(indexarCompras(notasSugestao(), new Map()), 2);
    expect(altas.length).toBeLessThanOrEqual(2);
    expect(altas[0].percentual).toBeGreaterThanOrEqual(altas.at(-1)!.percentual);
  });
});

describe('painel: onde mais gasta', () => {
  it('soma o grupo vinculado entre mercados numa linha', () => {
    const r = ondeMaisGasta(NOTAS_PAINEL, GRUPOS_PAINEL);
    expect(r.map((g) => [g.nome, g.total, g.compras, g.quantidade])).toEqual([
      ['CAFE TORRADO 500G', 54.3, 3, 3],
      ['ARROZ TIPO1 PCT 5KG', 47.8, 2, 2],
      ['Leite Integral 1 L', 31.54, 3, 6],
      ['PILHA AA C/4', 19.9, 1, 1],
      ['DETERGENTE LIQUIDO 1L', 5.99, 1, 1],
    ]);
  });

  it('unidades diferentes não somam quantidade; limite', () => {
    const kg = notaPainel('kg', ALFA, OUTUBRO.emissao, [
      { produtoId: LEITE, descricao: 'LEITE 1L', qtd: 1, vlUnit: 5 },
    ]);
    kg.itens[0] = { ...kg.itens[0], unidade: 'CX' };
    const r = ondeMaisGasta([kg, SETEMBRO], new Map(), 1);
    expect(r).toHaveLength(1);
    expect(
      ondeMaisGasta([kg, AGOSTO], new Map()).find((g) => g.produtoId === LEITE)?.quantidade,
    ).toBeNull();
  });
});
