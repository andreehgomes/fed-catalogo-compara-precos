import { MAX_APELIDO, limparApelido, nomeExibido, sugerirApelido } from './apelido';

const OFICIAL = 'CONDOR SUPER CENTER LTDA';

describe('limparApelido', () => {
  it.each([[''], ['   '], [null], [undefined]])('vazio (%j) é válido e sem apelido', (bruto) => {
    expect(limparApelido(bruto, OFICIAL)).toEqual({ valido: true, apelido: null });
  });

  it('apara, colapsa espaços e mantém a caixa', () => {
    expect(limparApelido('  Condor   Pinheirinho ', OFICIAL)).toEqual({
      valido: true,
      apelido: 'Condor Pinheirinho',
    });
  });

  it.each([['a'], ['x'.repeat(MAX_APELIDO + 1)], ['***'], ['12'], ['x\u0007y']])(
    'recusa %j',
    (bruto) => {
      expect(limparApelido(bruto, OFICIAL)).toEqual({ valido: false });
    },
  );

  it('aceita exatamente o máximo', () => {
    expect(limparApelido('x'.repeat(MAX_APELIDO), OFICIAL)).toEqual({
      valido: true,
      apelido: 'x'.repeat(MAX_APELIDO),
    });
  });

  it('igual ao nome oficial (normalizado) vira sem apelido', () => {
    expect(limparApelido('Condor super center ltda', OFICIAL)).toEqual({
      valido: true,
      apelido: null,
    });
  });
});

describe('nomeExibido', () => {
  const estab = { nome: 'SANCHES E VECCHIATE LTDA', fantasia: 'BOX ATACADISTA' };

  it('apelido vence o nome fantasia', () => {
    expect(nomeExibido(estab, 'Box da Av. Brasil')).toBe('Box da Av. Brasil');
  });

  it('sem apelido, nome fantasia', () => {
    expect(nomeExibido(estab, null)).toBe('BOX ATACADISTA');
    expect(nomeExibido(estab)).toBe('BOX ATACADISTA');
  });

  it('só razão social', () => {
    expect(nomeExibido({ nome: 'SANCHES E VECCHIATE LTDA' }, undefined)).toBe(
      'SANCHES E VECCHIATE LTDA',
    );
  });
});

describe('sugerirApelido', () => {
  it.each([
    ['CONDOR SUPER CENTER LTDA', 'Condor Super Center'],
    ['SANCHES E VECCHIATE LTDA', 'Sanches e Vecchiate'],
    ['SUPERMERCADO BOM DIA LTDA - ME', 'Supermercado Bom Dia'],
    ['MERCADO X EIRELI EPP', 'Mercado X'],
    ['PAO & CIA', 'Pao'],
    ['12.345.678 JOSE DA SILVA', 'Jose da Silva'],
    ['MERCADO 2000 LTDA', 'Mercado 2000'],
    ['DROGARIA NISSEI S.A.', 'Drogaria Nissei'],
    ['DROGARIA NISSEI S/A', 'Drogaria Nissei'],
    ['ATACADAO SA', 'Atacadao'],
    ['PADARIA DO ZE MEI', 'Padaria do Ze'],
    ['IRMAOS SOUZA E CIA LTDA.', 'Irmaos Souza'],
    ['CASA SOUZA CIA', 'Casa Souza'],
    ['PÃO DE AÇÚCAR LTDA', 'Pão de Açúcar'],
  ])('%s → %s', (razao, sugestao) => {
    expect(sugerirApelido(razao)).toBe(sugestao);
  });

  it.each([['LTDA'], ['12.345.678'], ['SUPERMERCADO EXEMPLO'], ['X LTDA']])(
    '%s → null',
    (razao) => {
      expect(sugerirApelido(razao)).toBeNull();
    },
  );
});
