import { Page, Route } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const FIXTURES = resolve(__dirname, '../../src/testing/fixtures/menor-preco');

function fixture(nome: string): string {
  return readFileSync(resolve(FIXTURES, `${nome}.json`), 'utf8');
}

export interface ContadorMenorPreco {
  chamadas: string[];
}

/** Intercepta o Menor Preço com as fixtures reais de 27/09/2026. Nunca bate na API real. */
export async function mockMenorPreco(
  page: Page,
  opcoes: { fora?: boolean } = {},
): Promise<ContadorMenorPreco> {
  const contador: ContadorMenorPreco = { chamadas: [] };
  await page.route('**/menorpreco.notaparana.pr.gov.br/**', (route: Route) => {
    const url = new URL(route.request().url());
    contador.chamadas.push(url.pathname + url.search);
    if (opcoes.fora) return route.fulfill({ status: 503, body: 'fora do ar' });
    const headers = { 'content-type': 'application/json', 'access-control-allow-origin': '*' };
    if (url.pathname.endsWith('/categorias')) {
      return route.fulfill({ headers, body: fixture('categorias-leite-integral') });
    }
    if (url.searchParams.get('gtin'))
      return route.fulfill({ headers, body: fixture('gtin-coca-cola') });
    const pagina = url.searchParams.get('offset') === '0' ? 'p1' : 'p2';
    return route.fulfill({ headers, body: fixture(`termo-leite-integral-${pagina}`) });
  });
  return contador;
}

export type RespostasCallables = Record<string, unknown | ((dados: unknown) => unknown)>;

/**
 * Intercepta as callables (`https://southamerica-east1-<projeto>.cloudfunctions.net/<nome>`)
 * com respostas fixas no protocolo das callables (`{ data }` → `{ result }`) e registra as
 * chamadas. O App Check (debug token no localhost) também é interceptado.
 */
export async function mockCallables(
  page: Page,
  respostas: RespostasCallables,
): Promise<{ nome: string; dados: unknown }[]> {
  const chamadas: { nome: string; dados: unknown }[] = [];
  await page.route('**/firebaseappcheck.googleapis.com/**', (r) =>
    r.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ token: 'e2e', ttl: '3600s' }),
    }),
  );
  await page.route('**/*.cloudfunctions.net/**', async (route) => {
    const nome = new URL(route.request().url()).pathname.split('/').pop() ?? '';
    const dados = (route.request().postDataJSON() as { data?: unknown } | null)?.data;
    chamadas.push({ nome, dados });
    const r = respostas[nome];
    const result = typeof r === 'function' ? (r as (d: unknown) => unknown)(dados) : r;
    await route.fulfill({
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ result: result ?? { ok: false, erro: { codigo: 'desconhecido' } } }),
    });
  });
  return chamadas;
}

/** Garante que nenhum teste fala com SEFAZ ou Functions reais. */
export async function bloquearServicosReais(page: Page): Promise<void> {
  await page.route('**/*.cloudfunctions.net/**', (r) => r.abort());
  await page.route('**/www.fazenda.pr.gov.br/**', (r) => r.abort());
}
