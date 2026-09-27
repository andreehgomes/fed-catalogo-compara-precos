import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { vi } from 'vitest';
import type { NfceParsed } from '@shared/model';
import type { Contexto } from '../src/importar/contexto';
import type { RespostaSefaz } from '../src/importar/fetch-sefaz';
import type { RegistroImportacao } from '../src/importar/log';
import { adaptadorPara } from '../src/parsers';
import { RepositorioMemoria } from './fakes/repositorio-memoria';

export const CHAVE = '41260903644587000836652100000168701620438547';
export const CHAVE_AGO = '41260803644587000836652030000088681310226239';
export const URL_QR = `https://www.fazenda.pr.gov.br/nfce/qrcode?p=${CHAVE}|2|1|1|E87B918B945714C101FE1D79B6BD32073BA8D651`;
export const URL_QR_AGO = `https://www.fazenda.pr.gov.br/nfce/qrcode?p=${CHAVE_AGO}|2|1|1|20C20FABFA70252AD3A8910B6A2AC7513073F0A5`;

export function fixture(nome: string): string {
  return readFileSync(resolve(__dirname, 'fixtures/sefaz-pr', nome), 'utf8');
}

/** `NfceParsed` escrito à mão (o parser real depende do portal, Tarefa 6.3 ⛔). */
export function notaExemplo(chave = CHAVE, itens = 3): NfceParsed {
  const base = [
    {
      descricao: 'LEITE UHT INT 1L',
      codigo: '1001',
      ean: '7891000100103',
      qtd: 2,
      unidade: 'UN',
      vlUnit: 4.49,
      vlTotal: 8.98,
    },
    {
      descricao: 'BANANA NANICA KG',
      codigo: '2002',
      ean: null,
      qtd: 1.235,
      unidade: 'KG',
      vlUnit: 5.99,
      vlTotal: 7.4,
    },
    {
      descricao: 'CAFE PILAO 500G',
      codigo: '3003',
      ean: '7896089011203',
      qtd: 1,
      unidade: 'PCT',
      vlUnit: 21.9,
      vlTotal: 21.9,
    },
  ];
  const lista = Array.from({ length: itens }, (_, i) => ({
    ...base[i % base.length],
    n: i + 1,
    codigo: i < base.length ? base[i].codigo : `X${i}`,
    ean: i < base.length ? base[i].ean : null,
  }));
  const total = Math.round(lista.reduce((s, i) => s + i.vlTotal, 0) * 100) / 100;
  return {
    chave,
    emitente: {
      cnpj: '03644587000836',
      nome: 'SUPERMERCADO EXEMPLO LTDA',
      endereco: 'RUA DAS FLORES, 123, CENTRO, CURITIBA, PR',
      cidade: 'CURITIBA',
      uf: 'PR',
    },
    emissao: '2026-09-27T13:05:12.000Z',
    itens: lista,
    total,
    desconto: 0,
  };
}

export interface ContextoTeste extends Contexto {
  repo: RepositorioMemoria;
  logs: RegistroImportacao[];
  relogio: { agora: Date };
  htmlRegistrado: string[];
  buscar: ReturnType<typeof vi.fn<(url: string) => Promise<RespostaSefaz>>>;
}

export function criarContexto(
  opcoes: {
    resposta?: RespostaSefaz | (() => RespostaSefaz);
    nota?: NfceParsed;
    agora?: Date;
  } = {},
): ContextoTeste {
  const relogio = { agora: opcoes.agora ?? new Date('2026-09-27T15:00:00.000Z') };
  const logs: RegistroImportacao[] = [];
  const htmlRegistrado: string[] = [];
  const nota = opcoes.nota ?? notaExemplo();
  const padrao: RespostaSefaz = {
    status: 200,
    html: '<table id="tabResult"></table><span class="totalNumb">',
    urlFinal: URL_QR,
  };
  const buscar = vi.fn(async () => {
    const r = opcoes.resposta ?? padrao;
    return typeof r === 'function' ? r() : r;
  });
  const real = adaptadorPara('PR');
  return {
    repo: new RepositorioMemoria(),
    agora: () => new Date(relogio.agora),
    relogio,
    buscar,
    adaptador: (uf) => {
      adaptadorPara(uf);
      return { pareceNota: real.pareceNota, parse: () => structuredClone(nota) };
    },
    log: (r) => logs.push(r),
    logs,
    esperar: async () => undefined,
    registrarHtml: (html) => htmlRegistrado.push(html),
    htmlRegistrado,
  };
}

export const PAGINA_NOTA_OK: RespostaSefaz = {
  status: 200,
  html: fixture('nota-sintetica-svrs.html'),
  urlFinal: URL_QR,
};

export const PAGINA_FORA: RespostaSefaz = {
  status: 200,
  html: fixture('erro-qrcode-mal-formatado.html'),
  urlFinal: URL_QR,
};
