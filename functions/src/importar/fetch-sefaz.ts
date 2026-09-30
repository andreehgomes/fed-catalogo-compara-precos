import { redirectPermitido } from './allowlist';
import { SefazIndisponivelError, UrlBloqueadaError } from './erros';

export const TIMEOUT_MS = 15_000;
export const MAX_REDIRECTS = 3;
export const LIMITE_BYTES = 2 * 1024 * 1024;
export const ESPERA_RETRY_MS = 1_000;

export interface RespostaSefaz {
  status: number;
  html: string;
  urlFinal: string;
}

export interface DepsFetch {
  fetch: typeof fetch;
  esperar: (ms: number) => Promise<void>;
}

const depsPadrao: DepsFetch = {
  fetch: (...a) => fetch(...a),
  esperar: (ms) => new Promise((r) => setTimeout(r, ms)),
};

function charsetDeclarado(contentType: string | null, inicio: string): string | null {
  const doHeader = /charset=([\w-]+)/i.exec(contentType ?? '')?.[1];
  if (doHeader) return doHeader.toLowerCase();
  const doMeta = /<meta[^>]+charset=["']?([\w-]+)/i.exec(inicio)?.[1];
  return doMeta ? doMeta.toLowerCase() : null;
}

/**
 * O portal mistura UTF-8 e Latin-1: usa o charset declarado (header ou <meta>) e, sem
 * declaração, tenta UTF-8 e cai para Latin-1 se aparecerem caracteres inválidos.
 */
export function decodificar(bytes: Uint8Array, contentType: string | null): string {
  const inicio = new TextDecoder('latin1').decode(bytes.subarray(0, 2048));
  const declarado = charsetDeclarado(contentType, inicio);
  if (declarado) {
    try {
      return new TextDecoder(declarado === 'iso-8859-1' ? 'latin1' : declarado).decode(bytes);
    } catch {
      /* charset desconhecido: tenta os padrões */
    }
  }
  const utf8 = new TextDecoder('utf-8').decode(bytes);
  return utf8.includes('�') ? new TextDecoder('latin1').decode(bytes) : utf8;
}

export async function lerCorpo(
  resposta: Response,
  limite: number = LIMITE_BYTES,
): Promise<Uint8Array> {
  const tamanho = Number(resposta.headers.get('content-length') ?? 0);
  if (tamanho > limite) throw new SefazIndisponivelError('Resposta grande demais');
  if (!resposta.body) return new Uint8Array();
  const leitor = resposta.body.getReader();
  const partes: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    total += value.byteLength;
    if (total > limite) {
      await leitor.cancel();
      throw new SefazIndisponivelError('Resposta grande demais');
    }
    partes.push(value);
  }
  const corpo = new Uint8Array(total);
  let pos = 0;
  for (const p of partes) {
    corpo.set(p, pos);
    pos += p.byteLength;
  }
  return corpo;
}

async function tentativa(url: string, deps: DepsFetch): Promise<RespostaSefaz> {
  let atual = url;
  for (let saltos = 0; ; saltos++) {
    let resposta: Response;
    try {
      resposta = await deps.fetch(atual, {
        redirect: 'manual',
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { accept: 'text/html', 'user-agent': 'CupomEsperto/1.0 (+importacao de NFC-e)' },
      });
    } catch (e) {
      throw new SefazIndisponivelError('Falha de rede ou timeout', e);
    }
    if (resposta.status >= 300 && resposta.status < 400) {
      const location = resposta.headers.get('location');
      const proximo = location ? redirectPermitido(location, atual) : null;
      if (!proximo) throw new UrlBloqueadaError(`Redirect bloqueado: ${location ?? '(vazio)'}`);
      if (saltos >= MAX_REDIRECTS) throw new SefazIndisponivelError('Redirects demais');
      atual = proximo;
      continue;
    }
    const html = decodificar(await lerCorpo(resposta), resposta.headers.get('content-type'));
    return { status: resposta.status, html, urlFinal: atual };
  }
}

/** Busca a página do QR. 1 retry com backoff em falha de rede, timeout ou 5xx. */
export async function buscarSefaz(
  url: string,
  deps: DepsFetch = depsPadrao,
): Promise<RespostaSefaz> {
  try {
    const r = await tentativa(url, deps);
    if (r.status < 500) return r;
  } catch (e) {
    if (!(e instanceof SefazIndisponivelError)) throw e;
  }
  await deps.esperar(ESPERA_RETRY_MS);
  return tentativa(url, deps);
}
