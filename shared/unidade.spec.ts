import { extrairConteudo, precoPorUnidadeBase, quantidadeNaUnidadeBase } from './unidade';

describe('quantidadeNaUnidadeBase', () => {
  it('granel em KG e G vira kg', () => {
    expect(quantidadeNaUnidadeBase(1.245, 'KG', 'TOMATE ITALIANO KG')).toBe(1.245);
    expect(quantidadeNaUnidadeBase(350, 'G', 'QUEIJO MUSSARELA')).toBe(0.35);
    expect(quantidadeNaUnidadeBase(2, 'ML', 'XAROPE')).toBe(0.002);
  });

  it('vendido por unidade usa o conteúdo da descrição', () => {
    expect(quantidadeNaUnidadeBase(3, 'UN', 'Refr Coca Cola 2l Ze')).toBe(6);
    expect(quantidadeNaUnidadeBase(2, 'UN', 'CERV SKOL 6X350ML')).toBe(4.2);
    expect(quantidadeNaUnidadeBase(1, 'UN', 'Ovos Cortez 30un Bco')).toBe(30);
  });

  it('sem conteúdo na descrição → null', () => {
    expect(quantidadeNaUnidadeBase(1, 'UN', 'Repolho Verde Un')).toBeNull();
    expect(quantidadeNaUnidadeBase(1, 'PCT', 'PAO FRANCES')).toBeNull();
  });

  it('bate com precoPorUnidadeBase: valor × quantidade = vlUnit × qtd', () => {
    const descricao = 'Leite Lider 1l Desn';
    const pu = precoPorUnidadeBase(4.99, 'UN', extrairConteudo(descricao))!;
    expect(pu.valor * quantidadeNaUnidadeBase(3, 'UN', descricao)!).toBeCloseTo(4.99 * 3, 4);
  });
});
