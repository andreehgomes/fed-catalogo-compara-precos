import { describe, expect, it, vi } from 'vitest';
import { redirectPermitido, urlPermitida } from '../src/importar/allowlist';
import { SefazIndisponivelError, UrlBloqueadaError } from '../src/importar/erros';
import {
  LIMITE_BYTES,
  MAX_REDIRECTS,
  buscarSefaz,
  decodificar,
  type DepsFetch,
} from '../src/importar/fetch-sefaz';
import { CHAVE, URL_QR } from './apoio';

function resposta(
  status: number,
  corpo: BodyInit | null = '',
  headers: Record<string, string> = {},
) {
  return new Response(corpo, { status, headers });
}

function deps(respostas: (Response | Error)[]): DepsFetch & { fetch: ReturnType<typeof vi.fn> } {
  const fila = [...respostas];
  return {
    fetch: vi.fn(async () => {
      const r = fila.shift();
      if (!r) throw new Error('sem resposta');
      if (r instanceof Error) throw r;
      return r;
    }),
    esperar: vi.fn(async () => undefined),
  };
}

describe('allowlist (anti-SSRF)', () => {
  it('aceita o QR real e reconstrói a URL em HTTPS', () => {
    const v = urlPermitida(URL_QR.replace('https:', 'http:').replace(/\|/g, '%7C'));
    expect(v?.url).toBe(URL_QR);
    expect(v?.qr.chave).toBe(CHAVE);
  });

  it.each([
    ['host fora da allowlist', URL_QR.replace('www.fazenda.pr.gov.br', 'evil.com')],
    ['IP de metadados', `http://169.254.169.254/nfce/qrcode?p=${CHAVE}|3|1`],
    ['localhost', `http://localhost/nfce/qrcode?p=${CHAVE}|3|1`],
    ['não string', 42],
    ['URL gigante', URL_QR + 'x'.repeat(3000)],
  ])('rejeita %s', (_, url) => {
    expect(urlPermitida(url)).toBeNull();
  });

  it('redirect só para hosts HTTPS da SEFA-PR', () => {
    expect(redirectPermitido('/nfce/consulta', URL_QR)).toBe(
      'https://www.fazenda.pr.gov.br/nfce/consulta',
    );
    expect(redirectPermitido('https://www.dfeportal.fazenda.pr.gov.br/x', URL_QR)).toBe(
      'https://www.dfeportal.fazenda.pr.gov.br/x',
    );
    expect(redirectPermitido('http://www.fazenda.pr.gov.br/x', URL_QR)).toBeNull();
    expect(redirectPermitido('https://169.254.169.254/latest/meta-data', URL_QR)).toBeNull();
    expect(redirectPermitido('https://evil.com/', URL_QR)).toBeNull();
    expect(redirectPermitido('https://u:p@www.fazenda.pr.gov.br/', URL_QR)).toBeNull();
    expect(redirectPermitido('https://www.fazenda.pr.gov.br:8443/', URL_QR)).toBeNull();
    expect(redirectPermitido('http://[::1', URL_QR)).toBeNull();
  });
});

describe('buscarSefaz', () => {
  it('segue redirect interno', async () => {
    const d = deps([
      resposta(302, null, { location: '/nfce/consulta?x=1' }),
      resposta(200, '<html>ok</html>', { 'content-type': 'text/html; charset=utf-8' }),
    ]);
    const r = await buscarSefaz(URL_QR, d);
    expect(r).toEqual({
      status: 200,
      html: '<html>ok</html>',
      urlFinal: 'https://www.fazenda.pr.gov.br/nfce/consulta?x=1',
    });
    expect(d.fetch).toHaveBeenLastCalledWith(
      'https://www.fazenda.pr.gov.br/nfce/consulta?x=1',
      expect.objectContaining({ redirect: 'manual' }),
    );
  });

  it('bloqueia redirect para host externo, sem retry', async () => {
    const d = deps([resposta(301, null, { location: 'http://169.254.169.254/latest/meta-data' })]);
    await expect(buscarSefaz(URL_QR, d)).rejects.toBeInstanceOf(UrlBloqueadaError);
    expect(d.fetch).toHaveBeenCalledTimes(1);
  });

  it('para depois de 3 redirects', async () => {
    const loop = () => resposta(302, null, { location: '/nfce/qrcode' });
    const d = deps(Array.from({ length: (MAX_REDIRECTS + 1) * 2 }, loop));
    await expect(buscarSefaz(URL_QR, d)).rejects.toBeInstanceOf(SefazIndisponivelError);
  });

  it('timeout: 1 retry com backoff e depois SefazIndisponivel', async () => {
    const timeout = new DOMException('timeout', 'TimeoutError');
    const d = deps([timeout, timeout]);
    await expect(buscarSefaz(URL_QR, d)).rejects.toBeInstanceOf(SefazIndisponivelError);
    expect(d.fetch).toHaveBeenCalledTimes(2);
    expect(d.esperar).toHaveBeenCalledWith(1000);
    expect(d.fetch.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });

  it('5xx tenta de novo e devolve a segunda resposta', async () => {
    const d = deps([resposta(503, 'fora'), resposta(200, 'ok')]);
    expect((await buscarSefaz(URL_QR, d)).html).toBe('ok');
  });

  it('corpo acima de 2 MB é recusado', async () => {
    const grande = new Uint8Array(LIMITE_BYTES + 10);
    const d = deps([
      resposta(200, grande),
      resposta(200, grande, { 'content-length': String(grande.length) }),
    ]);
    await expect(buscarSefaz(URL_QR, d)).rejects.toBeInstanceOf(SefazIndisponivelError);
  });

  it('decodifica Latin-1 declarado, UTF-8 declarado e Latin-1 sem declaração', () => {
    const latin1 = Uint8Array.from([0x41, 0x74, 0x65, 0x6e, 0xe7, 0xe3, 0x6f]);
    expect(decodificar(latin1, 'text/html; charset=ISO-8859-1')).toBe('Atenção');
    expect(decodificar(latin1, null)).toBe('Atenção');
    expect(decodificar(new TextEncoder().encode('Atenção'), 'text/html;charset=UTF-8')).toBe(
      'Atenção',
    );
    const meta = new TextEncoder().encode('<meta charset="windows-1252">');
    expect(decodificar(meta, null)).toContain('windows-1252');
    expect(decodificar(new TextEncoder().encode('ok'), 'text/html; charset=inexistente')).toBe(
      'ok',
    );
  });
});
