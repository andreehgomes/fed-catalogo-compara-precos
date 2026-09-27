import { describe, expect, it } from 'vitest';
import { classificarResposta } from '../src/importar/classificar-resposta';
import { ErroNegocio, LayoutInesperadoError } from '../src/importar/erros';
import { adaptadorPara, parserPara } from '../src/parsers';
import { dataBrasiliaParaIso, numeroBr, pareceNotaPr, parsePr } from '../src/parsers/pr';
import { CHAVE, CHAVE_AGO, fixture } from './apoio';

const AGORA = new Date('2026-09-27T15:00:00Z');

function classificar(html: string, opcoes: { status?: number; chave?: string; agora?: Date } = {}) {
  return classificarResposta({
    status: opcoes.status ?? 200,
    html,
    chave: opcoes.chave ?? CHAVE,
    agora: opcoes.agora ?? AGORA,
    pareceNota: pareceNotaPr,
  });
}

describe('classificarResposta (páginas reais do spike, HTTP 200)', () => {
  it('"Url do QRCode mal formatado" com chave de DV válido → sefaz-indisponivel', () => {
    expect(classificar(fixture('erro-qrcode-mal-formatado.html'))).toEqual({
      erro: 'sefaz-indisponivel',
    });
  });

  it('"mal formatado" com chave inválida → url-invalida', () => {
    expect(
      classificar(fixture('erro-qrcode-mal-formatado.html'), { chave: CHAVE.slice(0, 43) + '0' }),
    ).toEqual({
      erro: 'url-invalida',
    });
  });

  it('"206 – Problemas na Chave de Consulta" (Latin-1 lido como UTF-8) → sefaz-indisponivel', () => {
    expect(classificar(fixture('erro-206-dfeportal.html'))).toEqual({ erro: 'sefaz-indisponivel' });
  });

  it('"não consta" nas primeiras 48 h do mês da chave → sefaz-indisponivel; depois → nao-encontrada', () => {
    const html = fixture('erro-chave-nao-consta-v1.html');
    expect(classificar(html, { agora: new Date('2026-09-30T12:00:00Z') })).toEqual({
      erro: 'sefaz-indisponivel',
    });
    expect(classificar(html, { agora: new Date('2026-10-02T12:00:00Z') })).toEqual({
      erro: 'sefaz-indisponivel',
    });
    expect(classificar(html, { agora: new Date('2026-10-03T04:00:00Z') })).toEqual({
      erro: 'nao-encontrada',
    });
    expect(classificar(html, { chave: CHAVE_AGO })).toEqual({ erro: 'nao-encontrada' });
    expect(classificar(html, { chave: '123' })).toEqual({ erro: 'nao-encontrada' });
  });

  it('HTTP 5xx e GenericJDBCException → sefaz-indisponivel', () => {
    expect(classificar('<html>erro</html>', { status: 502 })).toEqual({
      erro: 'sefaz-indisponivel',
    });
    expect(
      classificar(
        'org.hibernate.exception.GenericJDBCException: Error calling CallableStatement.getMoreResults',
      ),
    ).toEqual({ erro: 'sefaz-indisponivel' });
  });

  it('nota cancelada', () => {
    expect(classificar('<p>NFC-e CANCELADA</p>')).toEqual({ erro: 'cancelada' });
    expect(
      classificar(
        fixture('nota-sintetica-svrs.html').replace('Via Consumidor', 'Nota fiscal cancelada'),
      ),
    ).toEqual({
      erro: 'cancelada',
    });
  });

  it('4xx → nao-encontrada; página sem estrutura de nota → layout-inesperado', () => {
    expect(classificar('<html></html>', { status: 404 })).toEqual({ erro: 'nao-encontrada' });
    expect(classificar('<html><body>Outra coisa</body></html>')).toEqual({
      erro: 'layout-inesperado',
    });
  });

  it('página com estrutura de nota → ok', () => {
    expect(classificar(fixture('nota-sintetica-svrs.html'))).toBe('ok');
  });
});

describe('parser PR (PROVISÓRIO: fixture sintética, Tarefa 6.3 ⛔)', () => {
  it('interpreta emitente, itens, totais, emissão e chave', () => {
    const n = parsePr(fixture('nota-sintetica-svrs.html'));
    expect(n.chave).toBe(CHAVE);
    expect(n.emitente).toEqual({
      cnpj: '03644587000836',
      nome: 'SUPERMERCADO EXEMPLO LTDA',
      endereco: 'RUA DAS FLORES, 123, , CENTRO, CURITIBA, PR',
      cidade: 'CURITIBA',
      uf: 'PR',
    });
    expect(n.emissao).toBe('2026-09-27T13:05:12.000Z');
    expect(n.itens).toHaveLength(3);
    expect(n.itens[1]).toEqual({
      n: 2,
      descricao: 'BANANA NANICA KG',
      codigo: '2002',
      ean: null,
      qtd: 1.235,
      unidade: 'KG',
      vlUnit: 5.99,
      vlTotal: 7.4,
    });
    expect(n.itens[2].descricao).toBe('CAFÉ PILÃO 500G');
    expect(n.total).toBe(37);
    expect(n.desconto).toBe(1.28);
    const soma = n.itens.reduce((s, i) => s + i.vlTotal, 0);
    expect(Math.round((soma - n.desconto) * 100) / 100).toBe(n.total);
  });

  it('texto do HTML nunca vira marcação (RNF-26)', () => {
    const html = fixture('nota-sintetica-svrs.html').replace(
      'LEITE UHT INT 1L',
      'LEITE <b>UHT</b> &lt;script&gt;',
    );
    expect(parsePr(html).itens[0].descricao).toBe('LEITE UHT <script>');
  });

  it.each([
    ['sem itens', (h: string) => h.replace(/<tr[\s\S]*<\/tr>/, '')],
    ['item sem valor', (h: string) => h.replace('<span class="valor">8,98</span>', '')],
    [
      'sem total',
      (h: string) => h.replace(/<div id="totalNota"[\s\S]*?<\/div>\s*<\/div>/, '</div>'),
    ],
    ['sem CNPJ', (h: string) => h.replace('CNPJ: 03.644.587/0008-36', '')],
    ['sem chave', (h: string) => h.replace(/<span class="chave">.*?<\/span>/, '')],
  ])('estrutura mínima ausente (%s) → LayoutInesperadoError', (_, quebrar) => {
    expect(() => parsePr(quebrar(fixture('nota-sintetica-svrs.html')))).toThrow(
      LayoutInesperadoError,
    );
  });

  it('sem "a pagar", usa o valor total', () => {
    const html = fixture('nota-sintetica-svrs.html').replace('Valor a pagar R$:', 'Outro:');
    expect(parsePr(html).total).toBe(38.28);
  });

  it('números e datas no formato brasileiro', () => {
    expect(numeroBr('1.234,56')).toBe(1234.56);
    expect(numeroBr('0,452 KG')).toBe(0.452);
    expect(numeroBr('')).toBeNaN();
    expect(dataBrasiliaParaIso('01/01/2026 23:30')).toBe('2026-01-02T02:30:00.000Z');
    expect(dataBrasiliaParaIso('x')).toBeNull();
  });

  it('parserPara resolve o PR e recusa outras UFs', () => {
    expect(parserPara('PR')).toBe(parsePr);
    expect(adaptadorPara('PR').pareceNota('<table id="tabResult"><span class="totalNumb">')).toBe(
      true,
    );
    expect(() => parserPara('SP')).toThrow(ErroNegocio);
    try {
      parserPara('SP');
    } catch (e) {
      expect((e as ErroNegocio).codigo).toBe('uf-nao-suportada');
    }
  });
});
