import { ApplicationRef, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { itemLista, listaCompras } from '../../../../testing/fixtures/lista/lista';
import { BASE_LISTAS, cenarioListas, gravarLista } from '../../../../testing/listas';
import { AuthStore } from '../../../core/auth/auth.store';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import type { ItemNovo } from '../lista';
import { EscolherListaDialog } from '../ui/escolher-lista-dialog';
import { RenomearListaDialog } from '../ui/renomear-lista-dialog';
import { ListaCheiaError, ListasStore } from './listas.store';

const LEITE: ItemNovo = {
  texto: 'Leite',
  grupo: 'ean:1',
  quantidade: 6,
  unidade: 'un',
  base: null,
  origem: 'produto',
};

async function montar(dialogos: unknown[] = []) {
  const c = cenarioListas({ dialogos });
  TestBed.configureTestingModule({ providers: [provideRouter([]), ...c.providers] });
  const store = TestBed.inject(ListasStore);
  const navegar = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  store.listas();
  await TestBed.inject(ApplicationRef).whenStable();
  return { ...c, store, navegar };
}

async function estavel() {
  await TestBed.inject(ApplicationRef).whenStable();
}

describe('ListasStore', () => {
  it('listas em tempo real, cheia com 5 e a lista em andamento para o painel', async () => {
    const { fs, store } = await montar();
    expect(store.carregando()).toBe(false);
    expect(store.listas()).toEqual([]);
    expect(store.emAndamento()).toBeNull();
    gravarLista(fs, listaCompras({ atualizadaEm: '2026-09-29T00:00:00.000Z' }, 'a'));
    gravarLista(
      fs,
      listaCompras({ atualizadaEm: '2026-09-28T00:00:00.000Z', qtdMarcados: 1 }, 'b'),
    );
    await estavel();
    expect(store.listas().map((l) => l.id)).toEqual(['a', 'b']);
    expect(store.emAndamento()?.id).toBe('b');
    fs.docs.get(`${BASE_LISTAS}/b`)!['qtdMarcados'] = 0;
    gravarLista(fs, listaCompras({}, 'c'));
    await estavel();
    expect(store.emAndamento()?.id).toBe('a');
    expect(store.cheia()).toBe(false);
    for (const id of ['d', 'e']) gravarLista(fs, listaCompras({}, id));
    await estavel();
    expect(store.cheia()).toBe(true);
    expect(() => store.criar()).toThrow(ListaCheiaError);
  });

  it('sem usuário: nenhuma lista, sem ler o Firestore', async () => {
    const c = cenarioListas();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        ...c.providers,
        { provide: AuthStore, useValue: { uid: signal(null) } },
      ],
    });
    const store = TestBed.inject(ListasStore);
    store.listas();
    await estavel();
    expect(store.carregando()).toBe(false);
    expect(store.listas()).toEqual([]);
    expect(c.fs.ouvintes()).toBe(0);
  });

  it('erro de leitura aparece em erro()', async () => {
    const { fs, store } = await montar();
    fs.falhar(BASE_LISTAS);
    await estavel();
    expect(store.erro()).toBe(true);
    expect(store.listas()).toEqual([]);
  });

  it('criar devolve o id e avisa se a gravação falhar ou se passar de 150 itens', async () => {
    const { fs, store, snack } = await montar();
    const id = store.criar([LEITE]);
    expect(fs.docs.get(`${BASE_LISTAS}/${id}`)).toMatchObject({
      nome: 'Compras de 30/09',
      qtdItens: 1,
    });
    store.criar(
      Array.from({ length: 151 }, (_, i) => ({ ...LEITE, grupo: null, texto: `item ${i}` })),
      'Grande',
    );
    expect(snack.ultima()).toBe('A lista chegou a 150 itens: 1 item ficou de fora.');
    fs.modo('erro');
    store.criar();
    await estavel();
    expect(snack.ultima()).toBe('Não foi possível criar a lista.');
  });

  it('renomear e excluir; falha avisa', async () => {
    const { fs, store, snack } = await montar();
    gravarLista(fs, listaCompras({}, 'l1'), [itemLista('a')]);
    store.renomear('l1', 'Mês');
    await estavel();
    expect(fs.docs.get(`${BASE_LISTAS}/l1`)?.['nome']).toBe('Mês');
    store.excluir('l1');
    await estavel();
    expect(fs.docs.size).toBe(0);
    fs.modo('erro');
    store.renomear('x', 'y');
    await estavel();
    expect(snack.ultima()).toBe('Não foi possível renomear a lista.');
  });

  it('pedir nome e confirmar exclusão pelos diálogos', async () => {
    const { store, dialog } = await montar(['Novo nome', undefined, true, undefined]);
    expect(await store.pedirNome('Antigo')).toBe('Novo nome');
    expect(dialog.open).toHaveBeenCalledWith(
      RenomearListaDialog,
      expect.objectContaining({ data: 'Antigo' }),
    );
    expect(await store.pedirNome('Antigo')).toBeNull();
    expect(await store.confirmarExclusao('Mês')).toBe(true);
    expect(dialog.open).toHaveBeenLastCalledWith(
      ConfirmDialog,
      expect.objectContaining({ data: expect.objectContaining({ titulo: 'Excluir esta lista?' }) }),
    );
    expect(await store.confirmarExclusao('Mês')).toBe(false);
  });

  it('adicionar em lista: sem lista cria uma, com "Abrir" no aviso', async () => {
    const { fs, store, snack, navegar } = await montar();
    const id = await store.adicionarEmLista([LEITE]);
    expect(fs.docs.get(`${BASE_LISTAS}/${id}`)).toMatchObject({ qtdItens: 1 });
    expect(snack.ultima()).toBe('Lista criada com 1 item');
    snack.agir();
    expect(navegar).toHaveBeenCalledWith(['/listas', id]);
  });

  it('adicionar em lista: com uma, adiciona direto e soma o repetido', async () => {
    const { fs, store, snack } = await montar();
    gravarLista(fs, listaCompras({ nome: 'Mês', qtdItens: 1 }, 'l1'), [
      itemLista('a', { texto: 'Leite', grupo: 'ean:1', quantidade: 2, unidade: 'un' }),
    ]);
    await estavel();
    expect(await store.adicionarEmLista([LEITE, { ...LEITE, grupo: 'ean:2', texto: 'Café' }])).toBe(
      'l1',
    );
    expect(fs.docs.get(`${BASE_LISTAS}/l1/itens/a`)?.['quantidade']).toBe(8);
    expect(snack.ultima()).toBe('2 itens adicionados a Mês');
  });

  it('adicionar em lista: com várias, pergunta; "Nova lista" cria; cancelar desiste', async () => {
    const { fs, store, dialog, snack } = await montar([{ id: 'l2' }, { nova: true }, undefined]);
    gravarLista(fs, listaCompras({ nome: 'Um' }, 'l1'));
    gravarLista(fs, listaCompras({ nome: 'Dois' }, 'l2'));
    await estavel();
    expect(await store.adicionarEmLista([LEITE])).toBe('l2');
    expect(dialog.open).toHaveBeenCalledWith(
      EscolherListaDialog,
      expect.objectContaining({ data: expect.objectContaining({ podeCriar: true }) }),
    );
    expect(snack.ultima()).toBe('1 item adicionado a Dois');
    const nova = await store.adicionarEmLista([LEITE]);
    expect(nova).not.toMatch(/^l\d$/);
    expect(await store.adicionarEmLista([LEITE])).toBeNull();
  });

  it('adicionar em lista cheia de itens avisa o que ficou de fora', async () => {
    const { fs, store, snack } = await montar();
    const itens = Array.from({ length: 150 }, (_, i) => itemLista(`i${i}`, { texto: `x${i}` }));
    gravarLista(fs, listaCompras({ qtdItens: 150 }, 'l1'), itens);
    await estavel();
    await store.adicionarEmLista([LEITE]);
    expect(snack.ultima()).toBe('A lista chegou a 150 itens: 1 item ficou de fora.');
  });
});
