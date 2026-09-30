import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { itemLista, listaCompras } from '../../../../testing/fixtures/lista/lista';
import { CHAVE_LISTA, notaDaLista } from '../../../../testing/fixtures/lista/nota';
import { BASE_LISTAS, cenarioListas, gravarLista } from '../../../../testing/listas';
import type { CompraPessoal } from '../../notas/detalhe/historico-pessoal';
import { ListaStore } from './lista.store';

function compra(descricao: string, vlUnit: number): CompraPessoal {
  return {
    chave: 'k',
    n: 1,
    cnpj: 'A',
    mercado: 'Mercado A',
    emissao: '2026-09-20T15:00:00.000Z',
    produtoId: 'ean:1',
    descricao,
    qtd: 1,
    unidade: 'UN',
    vlUnit,
    porUnidade: null,
  };
}

const INDICE = new Map([
  ['ean:1', [compra('LEITE INTEGRAL 1L', 4.99)]],
  ['ean:2', [compra('LEITE DESNATADO 1L', 5.49)]],
]);

async function estavel() {
  await TestBed.inject(ApplicationRef).whenStable();
}

async function montar(itens = [itemLista('a', { texto: 'Pão', ordem: 1 })], extra = {}) {
  const c = cenarioListas({ indice: INDICE });
  TestBed.configureTestingModule({ providers: [provideRouter([]), ...c.providers, ListaStore] });
  gravarLista(c.fs, listaCompras({ qtdItens: itens.length, ...extra }, 'l1'), itens);
  const store = TestBed.inject(ListaStore);
  store.abrir('l1');
  await estavel();
  return { ...c, store };
}

describe('ListaStore', () => {
  it('abre a lista e os itens; lista inexistente', async () => {
    const { store } = await montar();
    expect(store.carregando()).toBe(false);
    expect(store.lista()?.nome).toBe('Compras de 28/09');
    expect(store.itens().map((i) => i.texto)).toEqual(['Pão']);
    expect(store.naoEncontrada()).toBe(false);
    store.abrir('nada');
    await estavel();
    expect(store.naoEncontrada()).toBe(true);
    expect(store.lista()).toBeNull();
  });

  it('erro de leitura: lista não encontrada, sem itens', async () => {
    const { store, fs } = await montar();
    fs.falhar(BASE_LISTAS);
    await estavel();
    expect(store.naoEncontrada()).toBe(true);
    expect(store.itens()).toEqual([]);
  });

  it('histórico só é pedido sob demanda (foco no campo ou item com grupo)', async () => {
    const { store, historico } = await montar();
    store.estimativa();
    await estavel();
    expect(historico.indiceCompleto).not.toHaveBeenCalled();
    expect(store.sugestoesDe('leite')).toEqual([]);
    store.carregarHistorico();
    store.estimativa();
    await estavel();
    expect(historico.indiceCompleto).toHaveBeenCalledOnce();
    expect(store.sugestoesDe('leite').map((s) => s.grupo)).toEqual(['ean:2', 'ean:1']);
  });

  it('item com grupo carrega o histórico: referência e estimativa', async () => {
    const { store } = await montar([
      itemLista('a', { texto: 'Leite', grupo: 'ean:1', quantidade: 6, unidade: 'UN', ordem: 1 }),
      itemLista('b', { texto: 'Pão', ordem: 2 }),
    ]);
    store.estimativa();
    await estavel();
    expect(store.estimativa()).toEqual({ total: 29.94, comPreco: 1, semPreco: 1 });
    expect(store.referencias().get('a')?.valor).toBe(4.99);
    expect(store.referencias().has('b')).toBe(false);
  });

  it('adicionar texto e do histórico; histórico desconhecido não faz nada', async () => {
    const { store, fs } = await montar();
    store.adicionarTexto('Banana');
    store.carregarHistorico();
    store.estimativa();
    await estavel();
    store.adicionarDoHistorico('ean:1');
    store.adicionarDoHistorico('ean:9');
    await estavel();
    expect(store.itens().map((i) => [i.texto, i.origem])).toEqual([
      ['Pão', 'manual'],
      ['Banana', 'manual'],
      ['LEITE INTEGRAL 1L', 'historico'],
    ]);
    expect(fs.docs.get(`${BASE_LISTAS}/l1`)).toMatchObject({ qtdItens: 3 });
  });

  it('marcar move para o carrinho e "Desfazer" volta', async () => {
    const { store, snack } = await montar();
    const [pao] = store.itens();
    store.marcar(pao, true);
    await estavel();
    expect(store.separados().noCarrinho.map((i) => i.id)).toEqual(['a']);
    expect(store.progresso()).toEqual({ marcados: 1, total: 1 });
    expect(snack.ultima()).toBe('Pão no carrinho');
    snack.agir();
    await estavel();
    expect(store.separados().pendentes.map((i) => i.id)).toEqual(['a']);
    store.marcar(store.itens()[0], true);
    await estavel();
    store.marcar(store.itens()[0], false);
    expect(snack.ultima()).toBe('Pão voltou para a lista');
  });

  it('remover com "Desfazer", editar, desmarcar tudo e texto para compartilhar', async () => {
    const { store, snack, fs } = await montar(
      [
        itemLista('a', {
          texto: 'Pão',
          ordem: 1,
          marcado: true,
          marcadoEm: '2026-09-30T10:00:00.000Z',
        }),
        itemLista('b', { texto: 'Leite', ordem: 2, quantidade: 6, unidade: 'un' }),
      ],
      { qtdMarcados: 1 },
    );
    store.remover(store.itens()[0]);
    await estavel();
    expect(store.itens().map((i) => i.id)).toEqual(['b']);
    expect(snack.ultima()).toBe('Pão removido');
    snack.agir();
    await estavel();
    expect(store.itens().map((i) => i.id)).toEqual(['a', 'b']);
    store.editar(store.itens()[1], { texto: 'Leite integral' });
    store.desmarcarTudo();
    await estavel();
    expect(store.progresso().marcados).toBe(0);
    expect(store.textoParaCompartilhar()).toBe(
      'Compras de 28/09 · Cupom Esperto\n\n- Pão\n- Leite integral (6 un)',
    );
    fs.modo('erro');
    store.editar(store.itens()[0], { texto: 'x' });
    await estavel();
    expect(snack.ultima()).toBe('Não foi possível salvar o item.');
  });

  it('renomear, finalizar e excluir pela lista aberta', async () => {
    const { store, fs } = await montar(
      [itemLista('a', { marcado: true }), itemLista('b', { ordem: 2 })],
      {
        qtdMarcados: 1,
        notas: [CHAVE_LISTA],
      },
    );
    expect(store.conferida()).toBe(true);
    store.renomear('Mês');
    await estavel();
    expect(store.lista()?.nome).toBe('Mês');
    store.finalizar('guardar');
    await estavel();
    expect(store.lista()).toMatchObject({
      notas: [],
      qtdMarcados: 0,
      ultimaCompraEm: '2026-09-30T12:00:00.000Z',
    });
    expect(store.conferida()).toBe(false);
    store.excluir();
    await estavel();
    expect(fs.docs.size).toBe(0);
  });

  it('150 itens: avisa que não cabe mais', async () => {
    const itens = Array.from({ length: 150 }, (_, i) =>
      itemLista(`i${i}`, { texto: `x${i}`, ordem: i }),
    );
    const { store, snack } = await montar(itens);
    store.adicionarTexto('mais um');
    expect(snack.ultima()).toBe('A lista chegou a 150 itens.');
  });

  it('offline e escrita pendente no servidor', async () => {
    const { store, online, fs } = await montar();
    expect(store.offline()).toBe(false);
    online.set(false);
    expect(store.offline()).toBe(true);
    fs.modo('pendente');
    store.marcar(store.itens()[0], true);
    await estavel();
    expect(store.pendenteNoServidor()).toBe(true);
    expect(store.separados().noCarrinho).toHaveLength(1);
  });

  it('aguardando nota: avisa quando a nota chega e quando a fila desiste (RF-12)', async () => {
    const { store, notas, pendentes } = await montar(undefined, {
      status: 'aguardando-nota',
      pendentes: [CHAVE_LISTA, 'outra'],
    });
    expect(store.notasChegadas()).toEqual([]);
    notas.get(CHAVE_LISTA)!.next(notaDaLista());
    await estavel();
    expect(store.notasChegadas()).toEqual([CHAVE_LISTA]);
    notas.get('outra')!.error(new Error('offline'));
    await estavel();
    expect(store.notasChegadas()).toEqual([CHAVE_LISTA]);
    pendentes.set([
      {
        chave: 'outra',
        url: '',
        status: 'falhou',
        tentativas: 9,
        proximaTentativa: '',
        ultimoErro: null,
        criadaEm: '',
      },
      {
        chave: 'x',
        url: '',
        status: 'falhou',
        tentativas: 9,
        proximaTentativa: '',
        ultimoErro: null,
        criadaEm: '',
      },
    ]);
    expect(store.pendentesFalhos()).toEqual(['outra']);
    store.esquecerPendente('outra');
    await estavel();
    expect(store.lista()?.pendentes).toEqual([CHAVE_LISTA]);
  });

  it('sem lista aberta as ações não fazem nada', () => {
    const c = cenarioListas();
    TestBed.configureTestingModule({ providers: [provideRouter([]), ...c.providers, ListaStore] });
    const store = TestBed.inject(ListaStore);
    const item = itemLista('a');
    store.adicionarTexto('x');
    store.editar(item, {});
    store.remover(item);
    store.desmarcarTudo();
    store.renomear('x');
    store.excluir();
    store.finalizar('excluir');
    store.esquecerPendente('x');
    store.marcar(item, true);
    expect(store.textoParaCompartilhar()).toBe('');
    expect(store.pendentesFalhos()).toEqual([]);
    expect(c.fs.batches).toEqual([]);
    expect(store.carregando()).toBe(true);
  });
});
