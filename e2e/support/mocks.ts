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

/** Garante que nenhum teste fala com SEFAZ ou Functions reais. */
export async function bloquearServicosReais(page: Page): Promise<void> {
  await page.route('**/*.cloudfunctions.net/**', (r) => r.abort());
  await page.route('**/www.fazenda.pr.gov.br/**', (r) => r.abort());
}
