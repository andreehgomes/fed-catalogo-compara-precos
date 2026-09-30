import {
  digitoChave,
  extrairChave,
  formatarChave,
  formatarCnpj,
  lerUrlQr,
  limparChave,
  montarUrlQr,
  montarUrlQrV3,
  validarChave,
  validarCnpj,
} from './chave-acesso';

const CHAVE_SET = '41260903644587000836652100000168701620438547';
const CHAVE_AGO = '41260803644587000836652030000088681310226239';
const URL_SET =
  'https://www.fazenda.pr.gov.br/nfce/qrcode?p=41260903644587000836652100000168701620438547|2|1|1|E87B918B945714C101FE1D79B6BD32073BA8D651';
const URL_AGO =
  'http://www.fazenda.pr.gov.br/nfce/qrcode?p=41260803644587000836652030000088681310226239|2|1|1|20C20FABFA70252AD3A8910B6A2AC7513073F0A5';

describe('validarChave', () => {
  it('aceita as chaves reais do spike', () => {
    expect(validarChave(CHAVE_SET)).toBe(true);
    expect(validarChave(CHAVE_AGO)).toBe(true);
    expect(digitoChave(CHAVE_SET.slice(0, 43))).toBe(7);
    expect(digitoChave(CHAVE_AGO.slice(0, 43))).toBe(9);
  });

  it('rejeita DV trocado, 43 e 45 dígitos e não dígitos', () => {
    expect(validarChave(CHAVE_SET.slice(0, 43) + '8')).toBe(false);
    expect(validarChave(CHAVE_SET.slice(0, 43))).toBe(false);
    expect(validarChave(CHAVE_SET + '1')).toBe(false);
    expect(validarChave(CHAVE_SET.slice(0, 43) + 'X')).toBe(false);
  });

  it('resto menor que 2 gera DV 0', () => {
    const base = '4126090364458700083665210000016870162043854';
    for (let i = 0; i < 200; i++) {
      const b = (BigInt(base) + BigInt(i)).toString().padStart(43, '0');
      const dv = digitoChave(b);
      expect(dv).toBeGreaterThanOrEqual(0);
      expect(dv).toBeLessThanOrEqual(9);
      expect(validarChave(b + dv)).toBe(true);
    }
  });
});

describe('validarCnpj', () => {
  it('aceita CNPJs reais, com ou sem máscara', () => {
    expect(validarCnpj('03644587000836')).toBe(true);
    expect(validarCnpj('76189406000126')).toBe(true);
    expect(validarCnpj('03.644.587/0008-36')).toBe(true);
  });

  it.each([
    ['1º DV errado', '03644587000846'],
    ['2º DV errado', '03644587000837'],
    ['todos iguais', '00000000000000'],
    ['todos iguais (1)', '11111111111111'],
    ['13 dígitos', '0364458700083'],
    ['15 dígitos', '036445870008360'],
    ['vazio', ''],
  ])('recusa %s', (_, cnpj) => {
    expect(validarCnpj(cnpj)).toBe(false);
  });
});

describe('extrairChave', () => {
  it('identifica UF, AAMM, CNPJ, modelo, série e número', () => {
    expect(extrairChave(CHAVE_SET)).toEqual({
      chave: CHAVE_SET,
      cUf: '41',
      uf: 'PR',
      anoMes: '2609',
      cnpj: '03644587000836',
      modelo: '65',
      serie: '210',
      numero: '000016870',
      tpEmis: '1',
    });
  });

  it('mantém o código quando a UF é desconhecida', () => {
    const base = '99' + CHAVE_SET.slice(2, 43);
    expect(extrairChave(base + digitoChave(base)).uf).toBe('99');
  });

  it('lança para chave inválida', () => {
    expect(() => extrairChave('123')).toThrow();
  });
});

describe('lerUrlQr', () => {
  it('lê a URL real v2 com | cru', () => {
    expect(lerUrlQr(URL_SET)).toEqual({
      chave: CHAVE_SET,
      versao: 2,
      tpAmb: '1',
      uf: 'PR',
      cIdToken: '1',
      hash: 'E87B918B945714C101FE1D79B6BD32073BA8D651',
    });
  });

  it('lê a URL real v2 com %7C, em http e hash minúsculo', () => {
    const url = URL_AGO.replace(/\|/g, '%7C').toLowerCase();
    expect(lerUrlQr(url)).toMatchObject({ chave: CHAVE_AGO, versao: 2, hash: '20C20FABFA70252AD3A8910B6A2AC7513073F0A5' });
  });

  it('lê o formato v3', () => {
    expect(lerUrlQr(montarUrlQrV3(CHAVE_SET))).toEqual({ chave: CHAVE_SET, versao: 3, tpAmb: '1', uf: 'PR' });
  });

  it.each([
    ['outro host', URL_SET.replace('www.fazenda.pr.gov.br', 'evil.example.com')],
    ['host parecido', URL_SET.replace('www.fazenda.pr.gov.br', 'www.fazenda.pr.gov.br.evil.com')],
    ['IP interno', 'http://169.254.169.254/nfce/qrcode?p=' + CHAVE_SET + '|3|1'],
    ['caminho errado', URL_SET.replace('/nfce/qrcode', '/nfce/outra')],
    ['sem p', 'https://www.fazenda.pr.gov.br/nfce/qrcode'],
    ['DV errado', URL_SET.replace(CHAVE_SET, CHAVE_SET.slice(0, 43) + '0')],
    ['versão desconhecida', URL_SET.replace('|2|1|1|', '|4|1|1|')],
    ['ambiente inválido', URL_SET.replace('|2|1|1|', '|2|3|1|')],
    ['hash curto', URL_SET.replace('E87B918B945714C101FE1D79B6BD32073BA8D651', 'ABC')],
    ['token não numérico', URL_SET.replace('|2|1|1|', '|2|1|X|')],
    ['v3 com partes demais', montarUrlQrV3(CHAVE_SET) + '|9'],
    ['chave de outra UF', URL_SET.replace(CHAVE_SET, (() => { const b = '35' + CHAVE_SET.slice(2, 43); return b + digitoChave(b); })())],
    ['protocolo ftp', URL_SET.replace('https:', 'ftp:')],
    ['credenciais', URL_SET.replace('https://', 'https://user:pw@')],
    ['porta estranha', URL_SET.replace('gov.br/', 'gov.br:8080/')],
    ['texto qualquer', 'não é url'],
  ])('devolve null para %s', (_, url) => {
    expect(lerUrlQr(url)).toBeNull();
  });
});

describe('montagem e formatação', () => {
  it('monta a URL v3 só com a chave', () => {
    expect(montarUrlQrV3(CHAVE_SET)).toBe(`https://www.fazenda.pr.gov.br/nfce/qrcode?p=${CHAVE_SET}|3|1`);
    expect(montarUrlQrV3(CHAVE_SET, 2)).toBe(`https://www.fazenda.pr.gov.br/nfce/qrcode?p=${CHAVE_SET}|3|2`);
  });

  it('reconstrói a URL a partir das partes validadas', () => {
    expect(montarUrlQr(lerUrlQr(URL_AGO)!)).toBe(URL_AGO.replace('http:', 'https:'));
    expect(montarUrlQr(lerUrlQr(montarUrlQrV3(CHAVE_SET))!)).toBe(montarUrlQrV3(CHAVE_SET));
    expect(() => montarUrlQr({ chave: CHAVE_SET, versao: 3, tpAmb: '1', uf: 'SP' })).toThrow();
  });

  it('formata e limpa', () => {
    expect(formatarChave(CHAVE_SET)).toBe('4126 0903 6445 8700 0836 6521 0000 0168 7016 2043 8547');
    expect(limparChave('4126 0903-6445')).toBe('412609036445');
    expect(formatarCnpj('03644587000836')).toBe('03.644.587/0008-36');
    expect(formatarCnpj('123')).toBe('123');
  });
});
