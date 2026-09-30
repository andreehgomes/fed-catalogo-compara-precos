import type { Produto, ProdutoId } from '@shared/model';

export const ALFA = { cnpj: '11111111000191', nome: 'Mercado Alfa' };
export const BETA = { cnpj: '22222222000191', nome: 'Mercado Beta' };
export const GAMA = { cnpj: '33333333000191', nome: 'Mercado Gama' };

export const LEITE: ProdutoId = 'ean:7890000000011';
export const CAFE: ProdutoId = 'ean:7890000000028';
export const BANANA: ProdutoId = `loc:${GAMA.cnpj}:BAN`;
export const DETERGENTE_1L: ProdutoId = 'ean:7890000000035';
export const DETERGENTE_500: ProdutoId = `loc:${BETA.cnpj}:DET500`;
export const PILHA: ProdutoId = 'ean:7890000000042';
export const ACHOCOLATADO: ProdutoId = 'ean:7890000000059';
export const AZEITE: ProdutoId = 'ean:7890000000066';
export const ARROZ: ProdutoId = 'ean:7890000000073';
export const ARROZ_ALFA: ProdutoId = `loc:${ALFA.cnpj}:ARZ`;
export const ARROZ_BETA: ProdutoId = `loc:${BETA.cnpj}:ARZ5`;

function produto(id: ProdutoId, descricao: string, vinculadoA: ProdutoId | null = null): Produto {
  return {
    id,
    ean: id.startsWith('ean:') ? id.slice(4) : null,
    descricao,
    descricaoNorm: descricao,
    tokens: [],
    conteudo: null,
    vinculadoA,
    menorPreco: null,
    ultimaObservacao: null,
  };
}

/** Grupos de equivalência da fixture: o arroz `loc:` dos dois mercados aponta para o mesmo EAN. */
export const PRODUTOS_SUGESTAO: Produto[] = [
  produto(LEITE, 'LEITE INTEGRAL 1L'),
  produto(CAFE, 'CAFE TORRADO 500G'),
  produto(BANANA, 'BANANA PRATA KG'),
  produto(DETERGENTE_1L, 'DETERGENTE LIQUIDO 1L'),
  produto(DETERGENTE_500, 'DETERGENTE LIQUIDO 500ML', DETERGENTE_1L),
  produto(PILHA, 'PILHA AA C/4'),
  produto(ACHOCOLATADO, 'ACHOCOLATADO PO 400G'),
  produto(AZEITE, 'AZEITE EXTRA VIRGEM 500ML'),
  produto(ARROZ, 'ARROZ TIPO 1 5KG'),
  produto(ARROZ_ALFA, 'ARROZ T1 5KG', ARROZ),
  produto(ARROZ_BETA, 'ARROZ TIPO1 PCT 5KG', ARROZ),
];
