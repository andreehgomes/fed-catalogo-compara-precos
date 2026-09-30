import type { ItemLista, ListaCompras } from '@shared/model';
import type { Item, Lista } from '../../../app/features/listas/lista';
import { CAFE_EAN } from './grupos';
import { CHAVE_LISTA, DELTA, locDelta } from './nota';

export function itemLista(id: string, extra: Partial<ItemLista> = {}): Item {
  return {
    id,
    texto: id,
    grupo: null,
    quantidade: null,
    unidade: null,
    base: null,
    origem: 'manual',
    ordem: 1,
    marcado: false,
    marcadoEm: null,
    vinculo: null,
    ...extra,
  };
}

export function listaCompras(extra: Partial<ListaCompras> = {}, id = 'l1'): Lista {
  return {
    id,
    nome: 'Compras de 28/09',
    status: 'aberta',
    criadaEm: '2026-09-27T12:00:00.000Z',
    atualizadaEm: '2026-09-28T12:00:00.000Z',
    qtdItens: 0,
    qtdMarcados: 0,
    ultimaCompraEm: null,
    notas: [],
    pendentes: [],
    ...extra,
  };
}

/**
 * Lista como o usuário digita, para conferir com `notaDaLista()`. O café veio do histórico (tem
 * grupo); o molho já foi ligado numa nota anterior (compra em dois mercados).
 */
export function itensDaListaFixture(): Item[] {
  return [
    itemLista('cafe', {
      texto: 'CAFE ITAMARATY 500G',
      grupo: CAFE_EAN,
      quantidade: 2,
      unidade: 'UN',
      origem: 'historico',
      ordem: 1,
    }),
    itemLista('leite', { texto: 'leite', quantidade: 6, unidade: 'un', ordem: 2 }),
    itemLista('pao', { texto: 'pão francês', ordem: 3 }),
    itemLista('detergente', { texto: 'detergente', ordem: 4, marcado: true, marcadoEm: '2026-09-28T18:10:00.000Z' }),
    itemLista('coca', { texto: 'coca 2l', ordem: 5 }),
    itemLista('banana', { texto: 'banana', ordem: 6 }),
    itemLista('papel', { texto: 'papel higiênico', ordem: 7 }),
    itemLista('molho', {
      texto: 'molho de tomate',
      ordem: 8,
      marcado: true,
      marcadoEm: '2026-09-27T10:00:00.000Z',
      vinculo: {
        chave: CHAVE_LISTA.replace('123456', '654321'),
        n: 3,
        produtoId: locDelta('999'),
        descricao: 'MOLHO TOMATE 340G',
        qtd: 1,
        unidade: 'UN',
        vlTotal: 4.5,
        cnpj: DELTA.cnpj,
        mercado: 'Outro mercado',
        como: 'texto',
      },
    }),
  ];
}
