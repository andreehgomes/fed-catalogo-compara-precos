import { MenorPrecoIndisponivelError } from './oferta';

export const MENOR_PRECO_API = 'https://menorpreco.notaparana.pr.gov.br/api/v1/produtos';
export const TIMEOUT_MS = 10_000;
/** Período: -1 = últimos 2 meses. */
const PERIODO = -1;

export interface ConsultaMenorPreco {
  termo: string;
  local: string;
  raioKm: number;
}

/** Uma página (offset 0) da busca por termo, sem retry. Devolve o JSON cru. */
export async function buscarMenorPreco(
  q: ConsultaMenorPreco,
  fetchFn: typeof fetch = fetch,
): Promise<unknown> {
  const params = new URLSearchParams({
    local: q.local,
    termo: q.termo,
    raio: String(q.raioKm),
    data: String(PERIODO),
    offset: '0',
  });
  let resposta: Response;
  try {
    resposta = await fetchFn(`${MENOR_PRECO_API}?${params}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { accept: 'application/json' },
    });
  } catch (e) {
    throw new MenorPrecoIndisponivelError(`Falha de rede: ${(e as Error).name}`);
  }
  if (!resposta.ok) throw new MenorPrecoIndisponivelError(`HTTP ${resposta.status}`);
  try {
    return await resposta.json();
  } catch {
    throw new MenorPrecoIndisponivelError('JSON inválido');
  }
}
