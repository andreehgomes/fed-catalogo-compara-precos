import { ApplicationRef, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { Nota } from '@shared/model';
import { vi } from 'vitest';
import {
  GRUPOS_PAINEL,
  HOJE_PAINEL,
  NOTAS_PAINEL,
  OUTUBRO,
} from '../../../testing/fixtures/painel/notas';
import { BreakpointService } from '../../core/layout/breakpoint.service';
import { RELOGIO } from '../../core/relogio';
import {
  HistoricoPessoalStore,
  JanelaComparada,
} from '../notas/data-access/historico-pessoal.store';
import { NotasService } from '../notas/data-access/notas.service';
import {
  compararNota,
  consolidarItens,
  indexarCompras,
  resumirHistorico,
} from '../notas/detalhe/historico-pessoal';
import { PainelStore } from './painel.store';

function janelaDe(notas: Nota[]): JanelaComparada {
  const indice = indexarCompras(notas, GRUPOS_PAINEL);
  return {
    indice: { notas, grupos: GRUPOS_PAINEL, indice },
    notas: notas.map((nota) => {
      const comparacao = compararNota(nota, indice, GRUPOS_PAINEL);
      return {
        nota,
        comparacao,
        resumo: resumirHistorico(consolidarItens(nota.itens), comparacao),
      };
    }),
  };
}

function montar(opcoes: { hoje?: Date; notas?: Nota[]; estreito?: boolean } = {}) {
  const notas = opcoes.notas ?? NOTAS_PAINEL;
  const versao = signal(0);
  const comparacoesDaJanela = vi.fn(async () => janelaDe(notas));
  const resumir = vi.fn(async (alvo: readonly Nota[]) => {
    const j = janelaDe(notas);
    return new Map(
      j.notas.filter((c) => alvo.includes(c.nota)).map((c) => [c.nota.chave, c.resumo]),
    );
  });
  const listar = vi.fn(async () => ({ notas, cursor: null, temMais: false }));
  TestBed.configureTestingModule({
    providers: [
      PainelStore,
      { provide: RELOGIO, useValue: () => opcoes.hoje ?? HOJE_PAINEL },
      { provide: BreakpointService, useValue: { estreito: signal(opcoes.estreito ?? true) } },
      { provide: NotasService, useValue: { listar } },
      {
        provide: HistoricoPessoalStore,
        useValue: { versao, comparacoesDaJanela, resumir },
      },
    ],
  });
  return { store: TestBed.inject(PainelStore), versao, comparacoesDaJanela, resumir, listar };
}

async function estavel() {
  await TestBed.inject(ApplicationRef).whenStable();
}

describe('PainelStore', () => {
  it('mês atual com nota: resumo, seletor, variação e blocos', async () => {
    const { store } = montar();
    await estavel();
    expect(store.mes()).toBe('2026-10');
    expect(store.mesAtual()).toBe(true);
    expect(store.podeEscolher()).toBe(true);
    expect(store.resumo()).toMatchObject({ total: 35.47, aMais: 3, saldo: 3 });
    expect(store.variacao()).toBeNull();
    expect(store.barras()).toHaveLength(6);
    expect(store.porCompra()).toBe(false);
    expect(store.mercados().map((m) => m.nome)).toEqual(['Mercado Alfa']);
    expect(store.destaques().pagouMais).toHaveLength(2);
    expect(store.altas().map((a) => a.percentual)).toEqual([6]);
    expect(store.maioresGastos()[0].nome).toBe('CAFE TORRADO 500G');
    expect(store.saldos().get('setembro')).toBe(-3.4);
    expect(store.saldos().has('agosto')).toBe(false);
  });

  it('variação até o mesmo dia do mês anterior', async () => {
    const { store } = montar({ hoje: new Date(2026, 9, 29, 12) });
    await estavel();
    expect(store.variacao()).toMatchObject({ parcial: true, base: 50.38, dia: 29 });
  });

  it('trocar para "Mês passado" recalcula sem reler', async () => {
    const { store, comparacoesDaJanela } = montar();
    await estavel();
    store.escolher('anterior');
    expect(store.mes()).toBe('2026-09');
    expect(store.resumo()).toMatchObject({ total: 50.38, saldo: -3.4 });
    expect(comparacoesDaJanela).toHaveBeenCalledOnce();
  });

  it('mês atual vazio cai no último mês com nota, sem seletor', async () => {
    const { store } = montar({ hoje: new Date(2026, 10, 2, 12) });
    await estavel();
    expect(store.mes()).toBe('2026-10');
    expect(store.mesAtual()).toBe(false);
    expect(store.podeEscolher()).toBe(false);
    store.escolher('anterior');
    expect(store.mes()).toBe('2026-10');
  });

  it('um mês só: barras por compra; desktop mostra 12 meses', async () => {
    const { store } = montar({ notas: [OUTUBRO], estreito: false });
    await estavel();
    expect(store.porCompra()).toBe(true);
    expect(store.barrasCompra()).toHaveLength(1);
    expect(store.barras()).toHaveLength(12);
  });

  it('versao nova relê a janela', async () => {
    const { store, versao, comparacoesDaJanela } = montar();
    await estavel();
    store.escolher('anterior');
    versao.set(1);
    await estavel();
    expect(comparacoesDaJanela).toHaveBeenCalledTimes(2);
    expect(store.escolha()).toBe('atual');
  });

  it('erro na janela não afeta as últimas notas', async () => {
    const { store, comparacoesDaJanela } = montar();
    comparacoesDaJanela.mockRejectedValueOnce(new Error('offline'));
    await estavel();
    expect(store.janela.error()).toBeTruthy();
    expect(store.ultimas.value()).toHaveLength(3);
    expect(store.altas()).toEqual([]);
    expect(store.maioresGastos()).toEqual([]);
    expect(store.mes()).toBeNull();
    expect(store.resumo().qtdNotas).toBe(0);
    expect(store.variacao()).toBeNull();
  });

  it('sem nota', async () => {
    const { store } = montar({ notas: [] });
    await estavel();
    expect(store.semNotas()).toBe(true);
  });
});
