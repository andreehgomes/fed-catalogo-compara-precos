import type { Estabelecimento } from './model';
import {
  MAX_FANTASIA,
  avaliarEstabelecimento,
  limparFantasia,
  precisaConsultar,
} from './nome-fantasia';

const AGORA = new Date('2026-09-30T12:00:00.000Z');
const RAZAO = 'SANCHES E VECCHIATE LTDA';

function diasAtras(dias: number): string {
  return new Date(AGORA.getTime() - dias * 24 * 60 * 60 * 1000).toISOString();
}

function estab(extra: Partial<Estabelecimento> = {}): Estabelecimento {
  return {
    cnpj: '03644587000836',
    nome: RAZAO,
    endereco: 'AV. BRASIL, 100',
    cidade: 'SANTO ANTONIO DA PLATINA',
    uf: 'PR',
    atualizadoEm: diasAtras(1),
    ...extra,
  };
}

describe('limparFantasia', () => {
  it('mantém o nome fantasia como a Receita devolve', () => {
    expect(limparFantasia('BOX ATACADISTA', RAZAO)).toBe('BOX ATACADISTA');
    expect(limparFantasia('Drogaria Nissei S/A', RAZAO)).toBe('Drogaria Nissei S/A');
  });

  it('apara e colapsa espaços', () => {
    expect(limparFantasia('  BOX   ATACADISTA \n', RAZAO)).toBe('BOX ATACADISTA');
  });

  it.each([[''], ['  '], ['****'], ['.'], [null], [undefined]])('descarta %j', (bruto) => {
    expect(limparFantasia(bruto, RAZAO)).toBeUndefined();
  });

  it('descarta o nome igual à razão social', () => {
    expect(limparFantasia('Sanches e Vecchiate Ltda.', RAZAO)).toBeUndefined();
  });

  it('corta em MAX_FANTASIA', () => {
    const r = limparFantasia('A'.repeat(300), RAZAO);
    expect(r).toHaveLength(MAX_FANTASIA);
  });
});

describe('precisaConsultar', () => {
  it('consulta sem estabelecimento ou sem data', () => {
    expect(precisaConsultar(null, AGORA)).toBe(true);
    expect(precisaConsultar({}, AGORA)).toBe(true);
  });

  it('revalida depois de 180 dias', () => {
    expect(precisaConsultar({ fantasiaConsultadaEm: diasAtras(179) }, AGORA)).toBe(false);
    expect(precisaConsultar({ fantasiaConsultadaEm: diasAtras(181) }, AGORA)).toBe(true);
  });

  it('consulta quando a data é inválida', () => {
    expect(precisaConsultar({ fantasiaConsultadaEm: 'ontem' }, AGORA)).toBe(true);
  });
});

describe('avaliarEstabelecimento', () => {
  it('pede a SEFAZ quando falta o documento ou dado dela', () => {
    expect(avaliarEstabelecimento(null, AGORA)).toBe('sefaz');
    expect(avaliarEstabelecimento(estab({ cidade: '' }), AGORA)).toBe('sefaz');
    expect(avaliarEstabelecimento(estab({ endereco: '  ' }), AGORA)).toBe('sefaz');
    expect(avaliarEstabelecimento(estab({ nome: '' }), AGORA)).toBe('sefaz');
  });

  it('pede só o nome fantasia quando nunca consultou', () => {
    expect(avaliarEstabelecimento(estab(), AGORA)).toBe('fantasia');
  });

  it('está completo quando consultou dentro do prazo', () => {
    expect(avaliarEstabelecimento(estab({ fantasiaConsultadaEm: diasAtras(10) }), AGORA)).toBe(
      'completo',
    );
  });
});
