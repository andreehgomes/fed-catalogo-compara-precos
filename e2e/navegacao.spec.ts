import { expect, test } from '@playwright/test';
import { MOTIVO_SEM_USUARIO, TEM_USUARIO_E2E } from './support/env';
import { entrar } from './support/login';
import { bloquearServicosReais, mockMenorPreco } from './support/mocks';

test.describe('navegação do shell (usuário de teste no dv)', () => {
  test.skip(!TEM_USUARIO_E2E, MOTIVO_SEM_USUARIO);

  test.beforeEach(async ({ page }) => {
    await bloquearServicosReais(page);
    await mockMenorPreco(page);
    await entrar(page);
  });

  test('celular: drawer abre, navega e fecha; FAB leva a Importar', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Só no projeto mobile');
    const menu = page.getByRole('button', { name: 'Abrir menu' });
    await menu.click();
    const nav = page.getByRole('complementary', { name: 'Navegação principal' });
    await nav.getByRole('link', { name: 'Minhas notas' }).click();
    await expect(page).toHaveURL(/\/notas$/);
    await expect(page.getByRole('button', { name: 'Abrir menu' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );

    await page.getByRole('button', { name: 'Abrir menu' }).click();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Abrir menu' })).toBeFocused();

    await page.getByRole('link', { name: 'Importar nota' }).last().click();
    await expect(page).toHaveURL(/\/importar$/);
    await expect(page.getByRole('button', { name: 'Ler QR Code do cupom' })).toBeInViewport();
  });

  test('desktop: rail recolhe e expande; header continua visível ao rolar', async ({
    page,
    isMobile,
  }) => {
    test.skip(!!isMobile, 'Só no projeto desktop');
    await page.getByRole('button', { name: 'Fechar menu' }).click();
    await expect(page.getByRole('button', { name: 'Abrir menu' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    await page.getByRole('link', { name: 'Produtos' }).click();
    await expect(page).toHaveURL(/\/produtos$/);
    await page.getByRole('button', { name: 'Abrir menu' }).click();
    await page.goto('/regiao?termo=leite%20integral');
    await page.getByLabel('Ou escolha a cidade').fill('Curitiba');
    await page.getByRole('option', { name: 'Curitiba' }).click();
    await page.mouse.wheel(0, 3000);
    await expect(page.getByRole('banner')).toBeInViewport();
  });

  test('teclado: Tab chega ao menu e à ação principal de Importar', async ({ page }) => {
    await page.goto('/importar');
    let focado = '';
    for (let i = 0; i < 25 && !focado.includes('Ler QR Code do cupom'); i++) {
      await page.keyboard.press('Tab');
      focado = (await page.evaluate(() => document.activeElement?.textContent ?? '')).trim();
    }
    expect(focado).toContain('Ler QR Code do cupom');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('region', { name: 'Leitor de código' })).toBeVisible();
    await page.keyboard.press('Escape');
  });
});
