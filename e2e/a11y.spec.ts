import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { MOTIVO_SEM_USUARIO, TEM_USUARIO_E2E } from './support/env';
import { entrar } from './support/login';
import { bloquearServicosReais, mockMenorPreco } from './support/mocks';

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

  for (const rota of ['/', '/importar', '/notas', '/regiao', '/produtos', '/estabelecimentos']) {
    test(`axe sem violações graves em ${rota}`, async ({ page }) => {
      await page.goto(rota);
      await expect(page.getByRole('main')).toBeVisible();
      await expect(page.locator('main h1, main h2').first()).toBeVisible();
      expect(await violacoesGraves(page)).toEqual([]);
    });
  }
});
