import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { MOTIVO_SEM_USUARIO, TEM_USUARIO_E2E } from './support/env';
import { entrar } from './support/login';
import { bloquearServicosReais, mockCallables, mockMenorPreco } from './support/mocks';

async function violacoesGraves(page: Page) {
  const r = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  return r.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

test.describe('acessibilidade sem login', () => {
  for (const rota of ['/login', '/cadastro', '/redefinir-senha', '/nao-existe']) {
    test(`axe sem violações graves em ${rota}`, async ({ page }) => {
      await page.goto(rota);
      await expect(page.getByRole('main')).toBeVisible();
      await expect(page.locator('main h1, main h2').first()).toBeVisible();
      expect(await violacoesGraves(page)).toEqual([]);
    });
  }

  test('login só com teclado: Tab pelos campos e Enter envia', async ({ page, isMobile }) => {
    test.skip(!!isMobile, 'Teclado físico: só no projeto desktop');
    await page.goto('/login');
    await expect(page.getByLabel('E-mail')).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(page.getByLabel('E-mail')).toBeFocused();
    await page.keyboard.type('nao-e-email');
    await page.keyboard.press('Tab');
    await expect(page.getByLabel('Senha')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByText('E-mail inválido.')).toBeVisible();
  });
});

test.describe('acessibilidade com login (usuário de teste no dv)', () => {
  test.skip(!TEM_USUARIO_E2E, MOTIVO_SEM_USUARIO);

  test.beforeEach(async ({ page }) => {
    await bloquearServicosReais(page);
    await mockMenorPreco(page);
    await entrar(page);
  });

  for (const rota of [
    '/',
    '/importar',
    '/notas',
    '/sugestoes',
    '/regiao',
    '/produtos',
    '/estabelecimentos',
  ]) {
    test(`axe sem violações graves em ${rota}`, async ({ page }) => {
      await page.goto(rota);
      await expect(page.getByRole('main')).toBeVisible();
      await expect(page.locator('main h1, main h2').first()).toBeVisible();
      expect(await violacoesGraves(page)).toEqual([]);
    });
  }

  test('axe sem violações graves na prévia com o campo do apelido', async ({ page }) => {
    const chave = '41260903644587000836652100000168701620438547';
    await mockCallables(page, {
      previewNfce: {
        ok: true,
        nota: {
          chave,
          emitente: {
            cnpj: '03644587000836',
            nome: 'SUPERMERCADO EXEMPLO LTDA',
            endereco: 'RUA DAS FLORES, 123, CURITIBA, PR',
            cidade: 'CURITIBA',
            uf: 'PR',
          },
          emissao: '2026-09-27T13:05:12.000Z',
          itens: [
            {
              n: 1,
              descricao: 'LEITE UHT INT 1L',
              codigo: '1001',
              ean: null,
              qtd: 2,
              unidade: 'UN',
              vlUnit: 4.49,
              vlTotal: 8.98,
            },
          ],
          total: 8.98,
          desconto: 0,
        },
      },
    });
    await page.goto('/importar');
    await page.getByLabel('Digitar a chave de 44 dígitos').fill(chave);
    await page.getByRole('button', { name: 'Importar chave' }).click();
    await expect(page.getByLabel('Como você chama esta loja?')).toBeVisible();
    expect(await violacoesGraves(page)).toEqual([]);
  });

  test('axe sem violações graves no detalhe da nota', async ({ page }) => {
    await page.goto('/notas');
    const notas = page.getByRole('list', { name: 'Notas' }).getByRole('link');
    await expect(notas.first().or(page.getByText('Importar primeira nota'))).toBeVisible();
    test.skip((await notas.count()) === 0, 'O usuário de teste não tem notas');
    await notas.first().click();
    await expect(page.getByRole('heading', { name: 'Itens' })).toBeVisible();
    await expect(
      page.getByRole('status').filter({ hasText: 'Comparado com a última vez' }),
    ).not.toContainText('Comparando');
    expect(await violacoesGraves(page)).toEqual([]);
  });
});
