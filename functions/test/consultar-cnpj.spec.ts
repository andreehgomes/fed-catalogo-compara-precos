import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  LIMITE_BYTES_CNPJ,
  TIMEOUT_FONTE_MS,
  criarConsultaCnpj,
  type DepsCnpj,
} from '../src/cnpj/consultar-cnpj';

const BOX = '03644587000836';
const CONDOR = '76189406000126';
const URL_BRASILAPI = `https://brasilapi.com.br/api/cnpj/v1/${BOX}`;
const URL_MINHARECEITA = `https://minhareceita.org/${BOX}`;

function fixtureCnpj(nome: string): string {
  return readFileSync(resolve(__dirname, 'fixtures/cnpj', nome), 'utf8');
}

type Passo = Response | Error | 'nunca';

function deps(passos: Passo[], relogio: number[] = []) {
  const fila = [...passos];
  const tempos = [...relogio];
  const sinais: number[] = [];
  const d = {
    fetch: vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const p = fila.shift();
      if (!p) throw new Error('sem resposta');
      if (p === 'nunca') {
        return new Promise<Response>((_, rej) =>
          init?.signal?.addEventListener('abort', () => rej(init.signal?.reason)),
        );
      }
      if (p instanceof Error) throw p;
      return p;
    }),
    agora: () => tempos.shift() ?? 0,
    sinal: (ms: number) => {
      sinais.push(ms);
      return AbortSignal.timeout(5);
    },
  } satisfies DepsCnpj;
  return { deps: d, sinais };
}

function json(status: number, corpo: string) {
  return new Response(corpo, { status, headers: { 'content-type': 'application/json' } });
}

describe('criarConsultaCnpj', () => {
  it('200 com nome fantasia, pela URL exata da BrasilAPI', async () => {
    const { deps: d, sinais } = deps([json(200, fixtureCnpj('brasilapi-box-atacadista.json'))]);
    const r = await criarConsultaCnpj(d)(BOX);
    expect(r).toEqual({ status: 'ok', fonte: 'brasilapi', nomeFantasia: 'BOX ATACADISTA' });
    expect(d.fetch).toHaveBeenCalledTimes(1);
    expect(d.fetch.mock.calls[0][0]).toBe(URL_BRASILAPI);
    expect(d.fetch.mock.calls[0][1]).toMatchObject({
      redirect: 'error',
      headers: { accept: 'application/json' },
    });
    expect(sinais).toEqual([TIMEOUT_FONTE_MS]);
  });

  it('aceita a máscara, mas monta a URL só com os dígitos', async () => {
    const { deps: d } = deps([json(200, fixtureCnpj('brasilapi-box-atacadista.json'))]);
    await criarConsultaCnpj(d)('03.644.587/0008-36');
    expect(d.fetch.mock.calls[0][0]).toBe(URL_BRASILAPI);
  });

  it('200 com nome fantasia vazio', async () => {
    const { deps: d } = deps([json(200, fixtureCnpj('brasilapi-sem-fantasia.json'))]);
    expect(await criarConsultaCnpj(d)(CONDOR)).toEqual({
      status: 'ok',
      fonte: 'brasilapi',
      nomeFantasia: '',
    });
  });

  it('nome_fantasia null vira texto vazio', async () => {
    const { deps: d } = deps([json(200, JSON.stringify({ cnpj: BOX, nome_fantasia: null }))]);
    expect(await criarConsultaCnpj(d)(BOX)).toMatchObject({ status: 'ok', nomeFantasia: '' });
  });

  it('404 é definitivo: não chama a minhareceita', async () => {
    const { deps: d } = deps([json(404, '{"message":"CNPJ não encontrado"}')]);
    expect(await criarConsultaCnpj(d)(BOX)).toEqual({ status: 'nao-encontrado', fonte: 'brasilapi' });
    expect(d.fetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['503', json(503, 'fora')],
    ['429', json(429, 'devagar')],
    ['erro de rede', new TypeError('fetch failed')],
    ['JSON inválido', json(200, '<html>')],
    ['formato inesperado', json(200, '{"nome_fantasia":"X"}')],
    ['CNPJ divergente', json(200, JSON.stringify({ cnpj: CONDOR, nome_fantasia: 'CONDOR' }))],
    ['corpo acima de 256 kB', json(200, 'x'.repeat(LIMITE_BYTES_CNPJ + 1))],
  ])('BrasilAPI com %s → minhareceita', async (_, falha) => {
    const { deps: d } = deps([falha, json(200, fixtureCnpj('minhareceita-box-atacadista.json'))]);
    expect(await criarConsultaCnpj(d)(BOX)).toEqual({
      status: 'ok',
      fonte: 'minhareceita',
      nomeFantasia: 'BOX ATACADISTA',
    });
    expect(d.fetch.mock.calls.map((c) => c[0])).toEqual([URL_BRASILAPI, URL_MINHARECEITA]);
  });

  it('BrasilAPI em timeout → minhareceita', async () => {
    const { deps: d } = deps(['nunca', json(200, fixtureCnpj('minhareceita-box-atacadista.json'))]);
    expect(await criarConsultaCnpj(d)(BOX)).toMatchObject({ fonte: 'minhareceita' });
  });

  it('a reserva só recebe o tempo que sobrou do teto', async () => {
    const { deps: d, sinais } = deps(
      ['nunca', json(200, fixtureCnpj('minhareceita-box-atacadista.json'))],
      [0, 0, 4_000],
    );
    await criarConsultaCnpj(d)(BOX);
    expect(sinais).toEqual([TIMEOUT_FONTE_MS, 1_000]);
  });

  it('sem tempo restante, lança sem chamar a reserva', async () => {
    const { deps: d } = deps(['nunca'], [0, 0, 5_000]);
    await expect(criarConsultaCnpj(d)(BOX)).rejects.toThrow('cnpj-indisponivel');
    expect(d.fetch).toHaveBeenCalledTimes(1);
  });

  it('as duas fora → lança', async () => {
    const { deps: d } = deps([json(503, ''), json(500, '')]);
    await expect(criarConsultaCnpj(d)(BOX)).rejects.toThrow('cnpj-indisponivel');
    expect(d.fetch).toHaveBeenCalledTimes(2);
  });

  it.each([['03644587000837'], ['00000000000000'], ['123'], ['../../x']])(
    'CNPJ inválido %s lança sem chamar fetch',
    async (cnpj) => {
      const { deps: d } = deps([]);
      await expect(criarConsultaCnpj(d)(cnpj)).rejects.toThrow('cnpj-invalido');
      expect(d.fetch).not.toHaveBeenCalled();
    },
  );
});
