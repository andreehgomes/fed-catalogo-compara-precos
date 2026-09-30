import { validarCnpj } from '@shared/chave-acesso';
import { z } from 'zod';
import { lerCorpo } from '../importar/fetch-sefaz';

export const TIMEOUT_FONTE_MS = 3_000;
export const TETO_MS = 5_000;
export const LIMITE_BYTES_CNPJ = 256 * 1024;

export type FonteCnpj = 'brasilapi' | 'minhareceita';

export type ResultadoCnpj =
  | { status: 'ok'; fonte: FonteCnpj; nomeFantasia: string }
  | { status: 'nao-encontrado'; fonte: FonteCnpj };

/** Lança `Error('cnpj-indisponivel')` se nenhuma fonte responder a tempo. */
export type ConsultarCnpj = (cnpj: string) => Promise<ResultadoCnpj>;

export interface DepsCnpj {
  fetch: typeof fetch;
  agora: () => number;
  sinal?: (ms: number) => AbortSignal;
}

/** Hosts fixos: a URL leva só os 14 dígitos já validados (anti-SSRF). */
export const FONTES: readonly { nome: FonteCnpj; url: (cnpj: string) => string }[] = [
  { nome: 'brasilapi', url: (c) => `https://brasilapi.com.br/api/cnpj/v1/${c}` },
  { nome: 'minhareceita', url: (c) => `https://minhareceita.org/${c}` },
];

const RespostaCnpj = z.object({ cnpj: z.string(), nome_fantasia: z.string().nullish() });

async function consultarFonte(
  fonte: (typeof FONTES)[number],
  cnpj: string,
  ms: number,
  deps: DepsCnpj,
): Promise<ResultadoCnpj | null> {
  try {
    const resposta = await deps.fetch(fonte.url(cnpj), {
      redirect: 'error',
      headers: { accept: 'application/json' },
      signal: (deps.sinal ?? AbortSignal.timeout)(ms),
    });
    if (resposta.status !== 200) {
      await resposta.body?.cancel();
      return resposta.status === 404 ? { status: 'nao-encontrado', fonte: fonte.nome } : null;
    }
    const texto = new TextDecoder().decode(await lerCorpo(resposta, LIMITE_BYTES_CNPJ));
    const dados = RespostaCnpj.safeParse(JSON.parse(texto));
    if (!dados.success || dados.data.cnpj !== cnpj) return null;
    return { status: 'ok', fonte: fonte.nome, nomeFantasia: dados.data.nome_fantasia ?? '' };
  } catch {
    return null;
  }
}

/** BrasilAPI e, se ela falhar (rede, timeout, 429, 5xx, resposta inválida), minhareceita. 404 é definitivo. */
export function criarConsultaCnpj(deps: DepsCnpj): ConsultarCnpj {
  return async (entrada) => {
    const cnpj = entrada.replace(/\D/g, '');
    if (!validarCnpj(cnpj)) throw new Error('cnpj-invalido');
    const inicio = deps.agora();
    for (const fonte of FONTES) {
      const restante = TETO_MS - (deps.agora() - inicio);
      if (restante <= 0) break;
      const r = await consultarFonte(fonte, cnpj, Math.min(TIMEOUT_FONTE_MS, restante), deps);
      if (r) return r;
    }
    throw new Error('cnpj-indisponivel');
  };
}
