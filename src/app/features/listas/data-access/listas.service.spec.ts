import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom, take, toArray } from 'rxjs';
import { vi } from 'vitest';
import { firestoreFalso } from '../../../../testing/firestore-falso';
import { itemLista, listaCompras } from '../../../../testing/fixtures/lista/lista';
import { gravarLista } from '../../../../testing/listas';
import { CHAVE_LISTA, notaDaLista } from '../../../../testing/fixtures/lista/nota';
import { AuthStore } from '../../../core/auth/auth.store';
import { FIRESTORE_API } from '../../../core/firebase/firestore-api';
import { FIRESTORE } from '../../../core/firebase/firestore.token';
import { RELOGIO } from '../../../core/relogio';
import { consolidarItens } from '../../notas/detalhe/historico-pessoal';
import { ItemNovo, MAX_ITENS, planoDeFinalizacao, vinculoDe } from '../lista';
import { ListasService } from './listas.service';

const AGORA = new Date('2026-09-30T12:00:00.000Z');
const BASE = 'usuarios/u1/listas';

function novo(texto: string, extra: Partial<ItemNovo> = {}): ItemNovo {
  return {
    texto,
    grupo: null,
    quantidade: null,
    unidade: null,
    base: null,
    origem: 'manual',
    ...extra,
  };
}

function montar(uid: string | null = 'u1') {
  const fs = firestoreFalso();
  TestBed.configureTestingModule({
    providers: [
      { provide: FIRESTORE, useValue: {} },
      { provide: FIRESTORE_API, useValue: fs.api },
      { provide: AuthStore, useValue: { uid: signal(uid) } },
      { provide: RELOGIO, useValue: () => AGORA },
    ],
  });
  return { fs, service: TestBed.inject(ListasService) };
}

function semente(
  fs: ReturnType<typeof firestoreFalso>,
  id = 'l1',
  itens = [itemLista('a', { texto: 'Leite', ordem: 1 })],
) {
  gravarLista(fs, listaCompras({ qtdItens: itens.length }, id), itens);
  return itens;
}

describe('ListasService', () => {
  it('sem usuário recusa', () => {
    const { service } = montar(null);
    expect(() => service.listas$()).toThrow('Sem usuário');
  });

  it('criar devolve o id na hora e grava lista + itens num batch, sem esperar o commit', async () => {
    const { fs, service } = montar();
    fs.modo('pendente');
    const c = service.criar('Compras de 30/09', [
      novo('Leite', { quantidade: 6, unidade: 'un' }),
      novo('leite'),
      novo('Pão'),
    ]);
    expect(c.id).toBe('auto1');
    expect(c.foraDoLimite).toBe(0);
    expect(fs.batches).toHaveLength(1);
    const [lista, ...itens] = fs.batches[0];
    expect(lista).toEqual({
      op: 'set',
      path: `${BASE}/auto1`,
      dados: {
        nome: 'Compras de 30/09',
        status: 'aberta',
        criadaEm: AGORA.toISOString(),
        atualizadaEm: AGORA.toISOString(),
        qtdItens: 2,
        qtdMarcados: 0,
        ultimaCompraEm: null,
        notas: [],
        pendentes: [],
      },
    });
    expect(
      itens.map((o) => [
        o.path,
        o.op === 'set' && o.dados['texto'],
        o.op === 'set' && o.dados['quantidade'],
      ]),
    ).toEqual([
      [`${BASE}/auto1/itens/auto2`, 'Leite', 6],
      [`${BASE}/auto1/itens/auto3`, 'Pão', null],
    ]);
    const lido = await firstValueFrom(service.lista$(c.id));
    expect(lido?.nome).toBe('Compras de 30/09');
  });

  it('criar corta em 150 itens e informa quantos ficaram de fora', () => {
    const { service } = montar();
    const c = service.criar(
      'x',
      Array.from({ length: MAX_ITENS + 2 }, (_, i) => novo(`item ${i}`)),
    );
    expect(c.foraDoLimite).toBe(2);
  });

  it('lê listas por atualização, a lista e os itens por ordem com o estado de sincronização', async () => {
    const { fs, service } = montar();
    semente(fs, 'l1', [itemLista('a', { ordem: 1 }), itemLista('b', { ordem: 0 })]);
    gravarLista(fs, listaCompras({ atualizadaEm: '2026-09-27T00:00:00.000Z' }, 'l2'));
    const listas = await firstValueFrom(service.listas$());
    expect(listas.map((l) => l.id)).toEqual(['l1', 'l2']);
    expect(await firstValueFrom(service.lista$('nada'))).toBeNull();
    const itens$ = service.itens$('l1').pipe(take(2), toArray());
    const emissoes = firstValueFrom(itens$);
    fs.modo('pendente');
    service.marcar('l1', itemLista('a'), true, []);
    const [antes, depois] = await emissoes;
    expect(antes.itens.map((i) => i.id)).toEqual(['b', 'a']);
    expect(antes.pendenteNoServidor).toBe(false);
    expect(depois.pendenteNoServidor).toBe(true);
    expect(await service.itens('l1')).toHaveLength(2);
  });

  it('erro do onSnapshot chega a quem observa', async () => {
    const { fs, service } = montar();
    semente(fs);
    const erros: string[] = [];
    service.listas$().subscribe({ error: () => erros.push('listas') });
    service.lista$('l1').subscribe({ error: () => erros.push('lista') });
    service.itens$('l1').subscribe({ error: () => erros.push('itens') });
    fs.falhar(BASE);
    expect(erros.sort()).toEqual(['itens', 'lista', 'listas']);
  });

  it('marcar grava item e contadores no mesmo batch', () => {
    const { fs, service } = montar();
    const itens = semente(fs, 'l1', [
      itemLista('a', { ordem: 1 }),
      itemLista('b', { ordem: 2, marcado: true }),
    ]);
    service.marcar('l1', itens[0], true, itens);
    expect(fs.batches.at(-1)).toEqual([
      {
        op: 'update',
        path: `${BASE}/l1/itens/a`,
        dados: { marcado: true, marcadoEm: AGORA.toISOString() },
      },
      {
        op: 'update',
        path: `${BASE}/l1`,
        dados: { qtdItens: 2, qtdMarcados: 2, atualizadaEm: AGORA.toISOString() },
      },
    ]);
    service.marcar('l1', itens[1], false, itens);
    expect(fs.batches.at(-1)![0]).toMatchObject({ dados: { marcado: false, marcadoEm: null } });
    expect(fs.batches.at(-1)![1]).toMatchObject({ dados: { qtdMarcados: 0 } });
  });

  it('adicionar soma, cria e atualiza o cabeçalho', () => {
    const { fs, service } = montar();
    const itens = semente(fs, 'l1', [
      itemLista('a', { texto: 'Leite', quantidade: 2, unidade: 'un', ordem: 4 }),
    ]);
    const r = service.adicionar(
      'l1',
      [novo('leite', { quantidade: 1, unidade: 'un' }), novo('Pão')],
      itens,
    );
    expect(r.adicao.novos.map((i) => i.ordem)).toEqual([5]);
    expect(fs.batches.at(-1)).toEqual([
      {
        op: 'update',
        path: `${BASE}/l1/itens/a`,
        dados: { quantidade: 3, unidade: 'un', base: null },
      },
      expect.objectContaining({ op: 'set', path: `${BASE}/l1/itens/auto1` }),
      {
        op: 'update',
        path: `${BASE}/l1`,
        dados: { qtdItens: 2, qtdMarcados: 0, atualizadaEm: AGORA.toISOString() },
      },
    ]);
    expect(fs.docs.get(`${BASE}/l1/itens/a`)?.['quantidade']).toBe(3);
  });

  it('editar, remover, restaurar e desmarcar tudo', () => {
    const { fs, service } = montar();
    const itens = semente(fs, 'l1', [
      itemLista('a', { marcado: true }),
      itemLista('b', { marcado: true }),
      itemLista('c'),
    ]);
    service.editar('l1', 'c', { texto: 'Café' });
    expect(fs.docs.get(`${BASE}/l1/itens/c`)?.['texto']).toBe('Café');
    service.remover('l1', itens[0], itens);
    expect(fs.docs.has(`${BASE}/l1/itens/a`)).toBe(false);
    expect(fs.docs.get(`${BASE}/l1`)).toMatchObject({ qtdItens: 2, qtdMarcados: 1 });
    service.restaurar('l1', itens[0], itens.slice(1));
    expect(fs.docs.get(`${BASE}/l1/itens/a`)).toMatchObject({ marcado: true, texto: 'a' });
    expect(fs.docs.get(`${BASE}/l1`)).toMatchObject({ qtdItens: 3, qtdMarcados: 2 });
    service.desmarcarTudo('l1', itens);
    expect(fs.batches.at(-1)!.map((o) => o.path)).toEqual([
      `${BASE}/l1/itens/a`,
      `${BASE}/l1/itens/b`,
      `${BASE}/l1`,
    ]);
    expect(fs.docs.get(`${BASE}/l1`)).toMatchObject({ qtdMarcados: 0 });
  });

  it('renomear e excluir (itens antes da lista, num batch)', async () => {
    const { fs, service } = montar();
    semente(fs, 'l1', [itemLista('a'), itemLista('b')]);
    await service.renomear('l1', 'Mês');
    expect(fs.docs.get(`${BASE}/l1`)?.['nome']).toBe('Mês');
    await service.excluir('l1');
    expect(fs.batches.at(-1)!.map((o) => [o.op, o.path])).toEqual([
      ['delete', `${BASE}/l1/itens/a`],
      ['delete', `${BASE}/l1/itens/b`],
      ['delete', `${BASE}/l1`],
    ]);
    expect(fs.docs.size).toBe(0);
  });

  it('regra recusou: a promessa rejeita', async () => {
    const { fs, service } = montar();
    semente(fs);
    fs.modo('erro');
    await expect(service.renomear('l1', 'x')).rejects.toThrow('permission-denied');
  });

  it('salvar conferência: vínculo, marcação, grupo aprendido, item de fora e a nota na lista', () => {
    const { fs, service } = montar();
    const nota = notaDaLista();
    const [cafe, det, rexona] = consolidarItens(nota.itens)
      .filter((i) =>
        ['Cafe Itamaraty 500g', 'Det Ype 500ml Coco', 'Des Rexona 50ml Form'].includes(i.descricao),
      )
      .sort((a, b) => a.n - b.n);
    const itens = semente(fs, 'l1', [
      itemLista('cafe', {
        grupo: 'ean:1',
        ordem: 1,
        marcado: true,
        marcadoEm: '2026-09-28T10:00:00.000Z',
      }),
      itemLista('det', { texto: 'detergente', ordem: 2 }),
      itemLista('banana', { ordem: 3 }),
    ]);
    const lista = listaCompras({
      qtdItens: 3,
      qtdMarcados: 1,
      status: 'aguardando-nota',
      pendentes: [CHAVE_LISTA, 'outra'],
    });
    gravarLista(fs, lista);
    service.salvarConferencia('l1', {
      lista,
      itens,
      nota,
      pares: [
        { item: itens[0], nota: cafe, como: 'grupo', score: 1 },
        { item: itens[1], nota: det, como: 'texto', score: 0.33 },
      ],
      aprendidos: new Map([['det', 'loc:det']]),
      deFora: [{ nota: rexona, grupo: 'loc:rexona' }],
    });
    expect(fs.docs.get(`${BASE}/l1/itens/cafe`)).toMatchObject({
      marcado: true,
      marcadoEm: '2026-09-28T10:00:00.000Z',
      grupo: 'ean:1',
      vinculo: vinculoDe({ nota: cafe, como: 'grupo' }, nota),
    });
    expect(fs.docs.get(`${BASE}/l1/itens/det`)).toMatchObject({
      marcado: true,
      marcadoEm: AGORA.toISOString(),
      grupo: 'loc:det',
      vinculo: expect.objectContaining({ como: 'texto' }),
    });
    expect(fs.docs.get(`${BASE}/l1/itens/auto1`)).toMatchObject({
      texto: 'Des Rexona 50ml Form',
      grupo: 'loc:rexona',
      origem: 'nota',
      ordem: 4,
      quantidade: 5,
      marcado: true,
      vinculo: expect.objectContaining({ como: 'manual', n: rexona.n }),
    });
    expect(fs.docs.get(`${BASE}/l1`)).toMatchObject({
      qtdItens: 4,
      qtdMarcados: 3,
      notas: [CHAVE_LISTA],
      pendentes: ['outra'],
      status: 'aguardando-nota',
    });
  });

  it('salvar conferência não passa de 150 itens e volta a "aberta" sem pendentes', () => {
    const { fs, service } = montar();
    const itens = Array.from({ length: MAX_ITENS }, (_, i) => itemLista(`i${i}`, { ordem: i }));
    semente(fs, 'l1', itens);
    const nota = notaDaLista();
    const lista = listaCompras({ qtdItens: MAX_ITENS, notas: [CHAVE_LISTA] });
    service.salvarConferencia('l1', {
      lista,
      itens,
      nota,
      pares: [],
      aprendidos: new Map(),
      deFora: [{ nota: nota.itens[0], grupo: 'g' }],
    });
    const cab = fs.docs.get(`${BASE}/l1`)!;
    expect(cab).toMatchObject({ qtdItens: MAX_ITENS, status: 'aberta', notas: [CHAVE_LISTA] });
  });

  it('aguardar nota, esquecer pendente e finalizar', async () => {
    const { fs, service } = montar();
    const itens = semente(fs, 'l1', [itemLista('a', { marcado: true }), itemLista('b')]);
    await service.aguardarNota('l1', CHAVE_LISTA);
    await service.aguardarNota('l1', CHAVE_LISTA);
    expect(fs.docs.get(`${BASE}/l1`)).toMatchObject({
      status: 'aguardando-nota',
      pendentes: [CHAVE_LISTA],
    });
    const lista = listaCompras({ pendentes: [CHAVE_LISTA, 'x'] });
    await service.esquecerPendente(lista, CHAVE_LISTA);
    expect(fs.docs.get(`${BASE}/l1`)).toMatchObject({
      status: 'aguardando-nota',
      pendentes: ['x'],
    });
    await service.esquecerPendente({ ...lista, pendentes: ['x'] }, 'x');
    expect(fs.docs.get(`${BASE}/l1`)).toMatchObject({ status: 'aberta', pendentes: [] });

    await service.finalizar(
      'l1',
      planoDeFinalizacao('so-faltou', lista, itens, AGORA.toISOString()),
    );
    expect(fs.docs.has(`${BASE}/l1/itens/a`)).toBe(false);
    expect(fs.docs.get(`${BASE}/l1`)).toMatchObject({ qtdItens: 1 });
    await service.finalizar(
      'l1',
      planoDeFinalizacao('excluir', lista, itens.slice(1), AGORA.toISOString()),
    );
    expect(fs.docs.size).toBe(0);
  });

  it('grupos nas listas: só itens com grupo e ainda sem vínculo', async () => {
    const { fs, service } = montar();
    const v = vinculoDe({ nota: notaDaLista().itens[0], como: 'texto' }, notaDaLista());
    semente(fs, 'l1', [
      itemLista('a', { grupo: 'ean:1' }),
      itemLista('b', { grupo: 'ean:2', vinculo: v }),
      itemLista('c'),
    ]);
    semente(fs, 'l2', [itemLista('d', { grupo: 'ean:3' })]);
    const getDocs = vi.spyOn(fs.api, 'getDocs');
    expect([...(await service.gruposNasListas())].sort()).toEqual(['ean:1', 'ean:3']);
    expect(getDocs).toHaveBeenCalledTimes(3);
  });
});
