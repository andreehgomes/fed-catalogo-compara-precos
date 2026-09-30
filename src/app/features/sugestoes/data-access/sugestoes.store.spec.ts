import { ApplicationRef, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { Nota, Produto } from '@shared/model';
import { vi } from 'vitest';
import { HOJE_SUGESTAO, notasSugestao } from '../../../../testing/fixtures/sugestao/notas';
import {
  ACHOCOLATADO,
  ARROZ,
  AZEITE,
  BANANA,
  CAFE,
  DETERGENTE_1L,
  LEITE,
  PRODUTOS_SUGESTAO,
} from '../../../../testing/fixtures/sugestao/produtos';
import { AuthStore } from '../../../core/auth/auth.store';
import { RELOGIO } from '../../../core/relogio';
import { ListasService } from '../../listas/data-access/listas.service';
import { HistoricoPessoalStore } from '../../notas/data-access/historico-pessoal.store';
import { indexarCompras, montarGrupos } from '../../notas/detalhe/historico-pessoal';
import { SugestoesStore } from './sugestoes.store';

function indiceDe(notas: Nota[]) {
  const grupos = montarGrupos(
    new Map(PRODUTOS_SUGESTAO.map((p) => [p.id as string, p])) as Map<string, Produto>,
    [],
  );
  return { notas, grupos, indice: indexarCompras(notas, grupos) };
}

async function montar(notas = notasSugestao(), naLista: string[][] = []) {
  localStorage.clear();
  const leituras = [...naLista];
  const gruposNasListas = vi.fn(async () => new Set(leituras.shift() ?? []));
  const indiceCompleto = vi.fn(async () => indiceDe(notas));
  const versao = signal(0);
  const uid = signal<string | null>('u1');
  TestBed.configureTestingModule({
    providers: [
      { provide: HistoricoPessoalStore, useValue: { indiceCompleto, versao } },
      { provide: AuthStore, useValue: { uid } },
      { provide: RELOGIO, useValue: () => HOJE_SUGESTAO },
      { provide: ListasService, useValue: { gruposNasListas } },
    ],
  });
  const store = TestBed.inject(SugestoesStore);
  store.repor();
  await TestBed.inject(ApplicationRef).whenStable();
  return { store, indiceCompleto, versao, uid, gruposNasListas };
}

const grupos = (l: { grupo: string }[]) => l.map((s) => s.grupo);

describe('SugestoesStore', () => {
  it('monta as seções a partir do índice pessoal', async () => {
    const { store, indiceCompleto } = await montar();
    expect(indiceCompleto).toHaveBeenCalledOnce();
    expect(store.carregando()).toBe(false);
    expect(store.insuficiente()).toBe(false);
    expect(grupos(store.repor())).toEqual([LEITE, ARROZ, BANANA]);
    expect(grupos(store.emBreve())).toEqual([CAFE, AZEITE]);
    expect(grupos(store.parou())).toEqual([ACHOCOLATADO]);
    expect(grupos(store.horaDeRepor())).toEqual([LEITE, ARROZ, BANANA]);
    expect([...store.selecao()]).toEqual([LEITE, ARROZ, BANANA, CAFE, AZEITE]);
    expect(store.totais()).toMatchObject({ comoDaUltimaVez: 93.52, noMenorPreco: 87.89 });
    expect(store.porMercado().map((g) => g.mercado)).toEqual([
      'Mercado Alfa',
      'Mercado Beta',
      'Mercado Gama',
    ]);
    expect(store.cestas()[0].mercado).toBe('Mercado Alfa');
    expect(store.noProximoMes()).toBe(6);
    store.definirHorizonte('mes');
    expect(store.noProximoMes()).toBe(0);
  });

  it('trocar o horizonte muda o "em breve" e reinicia a seleção', async () => {
    const { store } = await montar();
    store.alternar(LEITE);
    expect(store.selecao().has(LEITE)).toBe(false);
    store.definirHorizonte('quinzena');
    expect(store.horizonte()).toBe('quinzena');
    expect(grupos(store.emBreve())).toEqual([CAFE, DETERGENTE_1L, AZEITE]);
    expect(store.selecao().has(LEITE)).toBe(true);
    expect(store.selecao().has(DETERGENTE_1L)).toBe(true);
  });

  it('desmarcar e mudar a quantidade recalculam os totais', async () => {
    const { store } = await montar();
    store.alternar(ARROZ);
    expect(store.totais()).toMatchObject({ comoDaUltimaVez: 68.62, itens: 4 });
    store.alternar(ARROZ);
    store.definirQuantidade(LEITE, 4);
    store.definirQuantidade(LEITE, 0);
    expect(store.quantidades().get(LEITE)).toBe(4);
    expect(store.totais().comoDaUltimaVez).toBe(103.5);
    store.alternar(AZEITE);
    expect(store.selecionados().map((i) => i.sugestao.grupo)).not.toContain(AZEITE);
  });

  it('"Já tenho" tira o item e guarda as escolhas dos outros', async () => {
    const { store } = await montar();
    store.alternar(CAFE);
    store.marcarJaTenho(LEITE);
    expect(grupos(store.repor())).toEqual([ARROZ, BANANA]);
    expect(store.selecao().has(CAFE)).toBe(false);
  });

  it('"Não sugerir mais" vai para os ocultos e volta', async () => {
    const { store } = await montar();
    store.naoSugerir(BANANA);
    expect(grupos(store.repor())).toEqual([LEITE, ARROZ]);
    expect(store.ocultos()).toEqual([{ grupo: BANANA, descricao: 'BANANA PRATA KG' }]);
    store.naoSugerir('ean:sumiu');
    expect(store.ocultos()).toHaveLength(1);
    store.voltarASugerir(BANANA);
    expect(grupos(store.repor())).toContain(BANANA);
  });

  it('insuficiente com menos de 3 notas', async () => {
    const { store } = await montar(notasSugestao().slice(0, 2));
    expect(store.insuficiente()).toBe(true);
  });

  it('erro no loader aparece em erro() e recarregar() tenta de novo', async () => {
    const { store, indiceCompleto } = await montar();
    indiceCompleto.mockRejectedValueOnce(new Error('offline'));
    store.recarregar();
    await TestBed.inject(ApplicationRef).whenStable();
    expect(store.erro()).toBe(true);
    expect(store.repor()).toEqual([]);
    expect(store.ocultos()).toEqual([]);
    store.recarregar();
    await TestBed.inject(ApplicationRef).whenStable();
    expect(store.erro()).toBe(false);
  });

  it('invalidar o histórico (versão) e trocar de usuário recarregam', async () => {
    const { store, indiceCompleto, versao, uid } = await montar();
    versao.set(1);
    store.repor();
    await TestBed.inject(ApplicationRef).whenStable();
    expect(indiceCompleto).toHaveBeenCalledTimes(2);
    uid.set(null);
    store.repor();
    await TestBed.inject(ApplicationRef).whenStable();
    expect(store.repor()).toEqual([]);
    expect(store.insuficiente()).toBe(false);
  });

  it('"Na lista": só lê as listas quando a tela pede; o que está numa lista sai da seleção', async () => {
    const { store, gruposNasListas } = await montar(notasSugestao(), [[LEITE], [LEITE, ARROZ]]);
    expect(gruposNasListas).not.toHaveBeenCalled();
    expect(store.selecao().has(LEITE)).toBe(true);
    store.alternar(BANANA);

    store.recarregarNaLista();
    store.repor();
    await TestBed.inject(ApplicationRef).whenStable();
    expect([...store.naLista()]).toEqual([LEITE]);
    expect(store.selecao().has(LEITE)).toBe(false);
    expect(store.selecao().has(ARROZ)).toBe(true);
    expect(store.selecao().has(BANANA)).toBe(false);

    store.alternar(LEITE);
    store.recarregarNaLista();
    expect([...store.naLista()]).toEqual([LEITE]);
    await TestBed.inject(ApplicationRef).whenStable();
    expect([...store.naLista()]).toEqual([LEITE, ARROZ]);
    expect(store.selecao().has(LEITE)).toBe(true);
    expect(store.selecao().has(ARROZ)).toBe(false);

    store.definirHorizonte('quinzena');
    expect(store.selecao().has(LEITE)).toBe(false);
    expect(store.selecao().has(DETERGENTE_1L)).toBe(true);
  });
});
