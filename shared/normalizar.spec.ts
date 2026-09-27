import { normalizarDescricao, semAcento, tokens, tokensSemMedida } from './normalizar';
import { extrairConteudo, precoPorUnidadeBase } from './unidade';

describe('normalizarDescricao', () => {
  it.each([
    ['Leite UHT Int. 1L', 'LEITE UHT INTEGRAL 1L'],
    ['LEITE DESN. 1L', 'LEITE DESNATADO 1L'],
    ['Açúcar Refinado União 1kg', 'ACUCAR REFINADO UNIAO 1KG'],
    ['REF COCA-COLA 2L', 'REFRIGERANTE COCA COLA 2L'],
    ['BISC. RECH. CHOC 140G', 'BISCOITO RECH CHOCOLATE 140G'],
    ['OLEO SOJA 900ML', 'OLEO SOJA 900ML'],
    ['AGUA MIN. C/ GAS 1,5L', 'AGUA MIN C GAS 1.5L'],
    ['PAP HIG 30M C/12', 'PAPEL HIGIENICO 30M C 12'],
    ['  café   pilão   500g  ', 'CAFE PILAO 500G'],
    ['QJO MUSS. FAT KG', 'QUEIJO MUSS FAT KG'],
  ])('%s → %s', (entrada, esperado) => {
    expect(normalizarDescricao(entrada)).toBe(esperado);
  });

  it('semAcento remove marcas', () => {
    expect(semAcento('pão de ló')).toBe('pao de lo');
  });
});

describe('tokens', () => {
  it('únicos e sem stopwords', () => {
    expect(tokens('Pão de Queijo de Minas C/ 10')).toEqual(['PAO', 'QUEIJO', 'MINAS', '10']);
  });

  it('tokensSemMedida descarta medidas', () => {
    expect(tokensSemMedida('COCA COLA PET 2L')).toEqual(['COCA', 'COLA', 'PET']);
  });
});

describe('extrairConteudo', () => {
  it.each([
    ['CAFE PILAO 500G', 0.5, 'kg'],
    ['ARROZ TIO JOAO 5KG', 5, 'kg'],
    ['FEIJAO CARIOCA 1KG', 1, 'kg'],
    ['LEITE UHT INT 1L', 1, 'L'],
    ['REFRIG COCA COLA 2L', 2, 'L'],
    ['CERVEJA SKOL LATA 350ML', 0.35, 'L'],
    ['AGUA MIN C GAS 1,5L', 1.5, 'L'],
    ['OVOS BRANCOS 12UN', 12, 'un'],
    ['OVOS VERMELHOS C/30', 30, 'un'],
    ['LEITE UHT 6X1L', 6, 'L'],
    ['CERVEJA BRAHMA LATA 350ML C/12', 4.2, 'L'],
    ['IOGURTE NESTLE 6 X 170G', 1.02, 'kg'],
    ['OLEO SOJA LIZA 900ML', 0.9, 'L'],
    ['BISC RECH OREO 90GR', 0.09, 'kg'],
    ['SABAO PO OMO 1.6KG', 1.6, 'kg'],
    ['DETERGENTE YPE 500 ML', 0.5, 'L'],
    ['MARGARINA QUALY 500G', 0.5, 'kg'],
    ['CHOCOLATE LACTA 80 G', 0.08, 'kg'],
    ['ACHOC NESCAU 2,0KG', 2, 'kg'],
    ['REFRIG GUARANA ANTARCTICA 2LT', 2, 'L'],
    ['SUCO DEL VALLE 1 LTS', 1, 'L'],
    ['PAO FRANCES KG', null, null],
    ['BANANA NANICA', null, null],
    ['PAPEL HIGIENICO NEVE 30M', null, null],
    ['FARINHA TRIGO 1KG', 1, 'kg'],
    ['AMACIANTE COMFORT 2L', 2, 'L'],
    ['ESPONJA SCOTCH BRITE C/3', 3, 'un'],
  ])('%s', (descricao, quantidade, unidade) => {
    const c = extrairConteudo(descricao);
    if (quantidade === null) {
      expect(c).toBeNull();
    } else {
      expect(c).toEqual({ quantidade, unidadeBase: unidade });
    }
  });

  it('quantidade zero não gera conteúdo', () => {
    expect(extrairConteudo('ITEM 0G')).toBeNull();
  });
});

describe('precoPorUnidadeBase', () => {
  it('item a granel vendido por KG já é R$/kg', () => {
    expect(precoPorUnidadeBase(39.9, 'KG', null)).toEqual({ valor: 39.9, unidade: 'kg' });
  });

  it('item em gramas converte para kg', () => {
    expect(precoPorUnidadeBase(0.05, 'G', null)).toEqual({ valor: 50, unidade: 'kg' });
  });

  it('embalado usa o conteúdo da descrição', () => {
    expect(precoPorUnidadeBase(21.9, 'UN', { quantidade: 0.5, unidadeBase: 'kg' })).toEqual({
      valor: 43.8,
      unidade: 'kg',
    });
    expect(precoPorUnidadeBase(9.99, 'un', { quantidade: 2, unidadeBase: 'L' })).toEqual({
      valor: 4.995,
      unidade: 'L',
    });
  });

  it('sem conteúdo e vendido por unidade não tem preço por unidade', () => {
    expect(precoPorUnidadeBase(3.5, 'UN', null)).toBeNull();
    expect(precoPorUnidadeBase(3.5, 'PCT', { quantidade: 0, unidadeBase: 'un' })).toBeNull();
  });
});
